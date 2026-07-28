const BUILD_VERSION = "20260727-4";

const routes = {
  dashboard: {
    html: "screens/dashboard/dashboard.html",
    css: "screens/dashboard/dashboard.css",
    js: "screens/dashboard/dashboard.js",
    init: "initDashboardScreen",
  },
  tasks: {
    html: "screens/tasks/tasks.html",
    css: "screens/tasks/tasks.css",
    js: "screens/tasks/tasks.js",
    init: "initTasksScreen",
  },
  planner: {
    html: "screens/planner/planner.html",
    css: "screens/planner/planner.css",
    js: "screens/planner/planner.js",
    init: "initPlannerScreen",
  },
  projects: {
    html: "screens/projects/projects.html",
    css: "screens/projects/projects.css",
    js: "screens/projects/projects.js",
    init: "initProjectsScreen",
  },
  calendar: {
    html: "screens/calendar/calendar.html",
    css: "screens/calendar/calendar.css",
    js: "screens/calendar/calendar.js",
    init: "initCalendarScreen",
  },
  assets: {
    html: "screens/assets/assets.html",
    css: "screens/assets/assets.css",
    js: "screens/assets/assets.js",
    init: "initAssetsScreen",
  },
  settings: {
    html: "screens/settings/settings.html",
    css: "screens/settings/settings.css",
    js: "screens/settings/settings.js",
    init: "initSettingsScreen",
  },
};

const app = document.getElementById("app");
let activeStyleTag = null;
let activeScriptTag = null;
const persistentStyles = new Set();
const persistentScripts = new Set();

function getRouteName() {
  const route = window.location.hash.replace("#", "").trim();
  return route || "dashboard";
}

function setActiveNav(routeName) {
  document.querySelectorAll(".hm-nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href === `#${routeName}`) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

function loadPersistentStyle(path) {
  if (persistentStyles.has(path)) {
    return Promise.resolve();
  }

  const versionedPath = `${path}?v=${BUILD_VERSION}`;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-persistent-style="${path}"]`);
    if (existing) {
      persistentStyles.add(path);
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = versionedPath;
    link.dataset.persistentStyle = path;
    link.onload = () => {
      persistentStyles.add(path);
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load shared CSS: ${path}`));
    document.head.appendChild(link);
  });
}

function loadPersistentScript(path) {
  if (persistentScripts.has(path)) {
    return Promise.resolve();
  }

  const versionedPath = `${path}?v=${BUILD_VERSION}`;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-persistent-script=\"${path}\"]`);
    if (existing) {
      persistentScripts.add(path);
      resolve();
      return;
    }

    const script = document.createElement("script");
  script.src = versionedPath;
    script.dataset.persistentScript = path;
    script.onload = () => {
      persistentScripts.add(path);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load shared JS: ${path}`));
    document.body.appendChild(script);
  });
}

async function mountSharedNav(routeName) {
  await loadPersistentStyle("components/nav/nav.css");
  try {
    await loadPersistentScript("components/nav/nav.js");

    if (window.NavComponent && typeof window.NavComponent.mount === "function") {
      await window.NavComponent.mount(routeName);
      return;
    }
  } catch (error) {
    console.warn("Shared nav component failed to initialize, using fallback nav.", error);
  }

  const mounts = document.querySelectorAll("[data-main-nav]");
  if (mounts.length) {
    const fallbackResponse = await fetch("components/nav/nav.html", { cache: "no-store" });
    if (fallbackResponse.ok) {
      const fallbackNav = await fallbackResponse.text();
      mounts.forEach((mountPoint) => {
        mountPoint.innerHTML = fallbackNav;
      });
    }
  }

  setActiveNav(routeName);
}

function clearActiveAssets() {
  if (activeStyleTag) {
    activeStyleTag.remove();
    activeStyleTag = null;
  }

  if (activeScriptTag) {
    activeScriptTag.remove();
    activeScriptTag = null;
  }
}

function loadStyle(path) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${path}?v=${BUILD_VERSION}`;
    link.dataset.screenStyle = "true";
    link.onload = () => {
      activeStyleTag = link;
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load CSS: ${path}`));
    document.head.appendChild(link);
  });
}

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${path}?v=${BUILD_VERSION}&t=${Date.now()}`;
    script.dataset.screenScript = "true";
    script.onload = () => {
      activeScriptTag = script;
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load JS: ${path}`));
    document.body.appendChild(script);
  });
}

async function renderRoute() {
  const routeName = getRouteName();
  const route = routes[routeName];

  if (!route) {
    clearActiveAssets();
    app.innerHTML = `
      <section class="hm-card">
        <h1>404</h1>
        <p class="hm-muted">Screen not found: #${routeName}</p>
        <p><a href="#dashboard">Go to Dashboard</a></p>
      </section>
    `;
    return;
  }

  try {
    clearActiveAssets();
    const htmlResponse = await fetch(`${route.html}?t=${Date.now()}`, { cache: "no-store" });

    if (!htmlResponse.ok) {
      throw new Error(`Failed to load HTML: ${route.html}`);
    }

    app.innerHTML = await htmlResponse.text();
    await mountSharedNav(routeName);
    await loadStyle(route.css);
    await loadScript(route.js);

    const initFn = window[route.init];
    if (typeof initFn === "function") {
      initFn();
    }

    setActiveNav(routeName);
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="hm-card">
        <h1>Load Error</h1>
        <p class="hm-muted">Could not load #${routeName}.</p>
      </section>
    `;
  }
}

if (!window.location.hash) {
  window.location.hash = "#dashboard";
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("load", renderRoute);
