(function () {
  const NAV_HTML_PATH = "components/nav/nav.html";
  const NAV_VERSION = "20260727-4";
  let navTemplate = "";

  async function loadTemplate() {
    if (navTemplate) {
      return navTemplate;
    }

    const response = await fetch(`${NAV_HTML_PATH}?v=${NAV_VERSION}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load navigation template: ${NAV_HTML_PATH}`);
    }

    navTemplate = await response.text();
    return navTemplate;
  }

  function setActive(routeName) {
    document.querySelectorAll(".hm-nav a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      link.classList.toggle("active", href === `#${routeName}`);
    });
  }

  async function mount(routeName) {
    const template = await loadTemplate();
    const mounts = document.querySelectorAll("[data-main-nav]");

    mounts.forEach((mountPoint) => {
      mountPoint.innerHTML = template;
    });

    setActive(routeName);
  }

  window.NavComponent = {
    mount,
    setActive,
  };
})();
