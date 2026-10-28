const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const requireTrips = createRequire(path.join(root, "trips", "package.json"));
const React = requireTrips("react");
const { renderToStaticMarkup } = requireTrips("react-dom/server");
const { MemoryRouter, Route, Routes, useLocation } = requireTrips("react-router-dom");
let App, Boundary, entryCode;

test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  async function compile(relative) {
    const filename = path.join(root, relative);
    const source = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "")
      .replace(/^export default /gm, "").replace(/^export /gm, "");
    return (await transformWithOxc(source, filename, {
      jsx: { runtime: "classic", pragma: "React.createElement", pragmaFrag: "React.Fragment" },
    })).code;
  }
  const appCode = await compile("src\\activity-planner\\App.jsx");
  App = vm.runInNewContext(`(() => { ${appCode}; return App; })()`, {
    React, Route, Routes,
    DailyActivityPlanner: () => React.createElement("h1", null, "PRIVATE_ACTIVITY_SCREEN"),
  });
  const boundaryCode = (await compile("src\\components\\OwnerAuthBoundary.jsx"))
    .replace("import.meta.env?.VITE_OWNER_AUTH_USER_ID", '"11111111-1111-4111-8111-111111111111"');
  Boundary = (status) => vm.runInNewContext(`(() => { ${boundaryCode}; return OwnerAuthBoundary; })()`, {
    React,
    useState: (initial) => React.useState(initial?.status === "checking" ? { status, error: "" } : initial),
    useEffect: React.useEffect,
    createOwnerAuthController: () => ({}), getSupabaseClient: () => ({}),
  });
  entryCode = await compile("src\\activity-planner\\main.jsx");
});

function renderEntry(pathname, status = "owner") {
  let tree, routedPath, routerMounts = 0;
  const browserLocation = { pathname };
  function LocationProbe() {
    routedPath = useLocation().pathname;
    return null;
  }
  vm.runInNewContext(entryCode, {
    React, App, window: { location: browserLocation },
    document: { getElementById: () => ({}) },
    ReactDOM: { createRoot: () => ({ render: (element) => { tree = element; } }) },
    OwnerAuthBoundary: Boundary(status),
    StandaloneNavigation: () => React.createElement("nav", null, "PRIVATE_NAVIGATION"),
    BrowserRouter: ({ basename, children }) => {
      routerMounts += 1;
      return React.createElement(MemoryRouter, { basename, initialEntries: [pathname] },
        React.createElement(LocationProbe), children);
    },
  });
  const html = renderToStaticMarkup(tree);
  assert.equal(browserLocation.pathname, pathname, "entry must not rewrite the reload URL");
  return { html, routedPath, routerMounts };
}

for (const pathname of [
  "/HomeMaintenanceApp/www/activity-planner/index.html",
  "/HomeMaintenanceApp/www/activity-planner/",
  "/www/activity-planner/index.html",
  "/activity-planner/index.html",
  "/activity-planner",
  "/activity-planner/",
  "/index.html",
  "/",
]) {
  test(`authenticated standalone renders its private screen at ${pathname}`, () => {
    const result = renderEntry(pathname);
    assert.match(result.html, /PRIVATE_ACTIVITY_SCREEN/);
    assert.match(result.html, /PRIVATE_NAVIGATION/);
    assert.equal(result.routedPath, pathname.endsWith("index.html") ? "/index.html" : "/");
  });
}

test("logged-out deployed entry never mounts the private router or screen", () => {
  const result = renderEntry("/HomeMaintenanceApp/www/activity-planner/index.html", "signed-out");
  assert.match(result.html, /Life Manager owner login/);
  assert.doesNotMatch(result.html, /PRIVATE_ACTIVITY_SCREEN|PRIVATE_NAVIGATION/);
  assert.equal(result.routerMounts, 0);
});

test("fresh mounts after reload retain the deployed file URL and authenticated screen without redirects", () => {
  const pathname = "/HomeMaintenanceApp/www/activity-planner/index.html";
  const first = renderEntry(pathname);
  const reloaded = renderEntry(pathname);
  assert.equal(reloaded.html, first.html);
  assert.match(reloaded.html, /PRIVATE_ACTIVITY_SCREEN/);
  assert.equal(reloaded.routedPath, "/index.html");
});
