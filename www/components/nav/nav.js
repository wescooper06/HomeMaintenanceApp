(function () {
  const NAV_ORDER = ["dashboard", "workbench", "planner", "calendar", "activities", "trips"];
  const NAV_VERSION = "20260727-10";
  let navTemplate = "";

  function getNavHtmlPath() {
    if (window.HM_NAV_BASE) {
      return `${window.HM_NAV_BASE}nav.html`;
    }
    return window.location.pathname.startsWith("/www/")
      ? "/www/components/nav/nav.html"
      : "/components/nav/nav.html";
  }

  async function loadTemplate() {
    if (navTemplate) {
      return navTemplate;
    }

    const navPath = getNavHtmlPath();
    const response = await fetch(`${navPath}?v=${NAV_VERSION}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load navigation template: ${navPath}`);
    }

    navTemplate = await response.text();
    return navTemplate;
  }

  function highlightNav(routeName) {
    const activeId = `nav-${NAV_ORDER.includes(routeName) ? routeName : ""}`;
    document.querySelectorAll(".hm-nav a[id^='nav-']").forEach((link) => {
      link.classList.toggle("active", link.id === activeId);
    });
  }

  function mainAppRoute(routeName) {
    if (["5173", "5174"].includes(window.location.port)) {
      return `http://localhost:5500/www/index.html#${routeName}`;
    }
    const entry = window.location.pathname.startsWith("/www/") ? "/www/index.html" : "/";
    return `${entry}#${routeName}`;
  }

  function routeStandaloneNav() {
    if (!document.getElementById("root")) {
      return;
    }

    document.querySelectorAll(".hm-nav a[id^='nav-']").forEach((link) => {
      if (link.id === "nav-trips") {
        return;
      }
      link.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.assign(mainAppRoute(link.id.slice(4)));
      });
    });
  }

  async function mount(routeName) {
    const template = await loadTemplate();
    const mounts = document.querySelectorAll("[data-main-nav]");

    mounts.forEach((mountPoint) => {
      mountPoint.innerHTML = template;
    });

    highlightNav(routeName);
    routeStandaloneNav();
  }

  window.NavComponent = {
    mount,
    highlightNav,
    setActive: highlightNav,
  };
})();
