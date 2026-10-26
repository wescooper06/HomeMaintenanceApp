const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "layout", "navigationRoutes.js"), "utf8");
const { navigationLinks, standaloneNavigationHref } = vm.runInNewContext(
  `(() => { ${source.replace(/^export /gm, "")}; return { navigationLinks, standaloneNavigationHref }; })()`
);
const routesSource = fs.readFileSync(path.join(__dirname, "..", "src", "router", "lifeManagerRoutes.js"), "utf8");
const { resolveLifeManagerRoute } = vm.runInNewContext(
  `(() => { ${routesSource.replace(/^export /gm, "")}; return { resolveLifeManagerRoute }; })()`
);

test("standalone navigation uses the modern development shell and retains protected static entry paths", () => {
  for (const port of ["5173", "5174"]) {
    assert.equal(standaloneNavigationHref("planner", {
      protocol: "http:", hostname: "localhost", port, pathname: "/activity-planner",
    }), "http://localhost:5173/#planner");
  }
  assert.equal(standaloneNavigationHref("calendar", { pathname: "/www/activity-planner/", port: "" }),
    "/www/index.html#calendar");
  assert.equal(standaloneNavigationHref("workbench", { pathname: "/activity-planner/", port: "" }),
    "/index.html#workbench");
  assert.equal(standaloneNavigationHref("daily", { pathname: "/activity-planner/", port: "" }), "#daily");
  assert.deepEqual(Array.from(navigationLinks, ([route]) => route),
    ["dashboard", "workbench", "planner", "calendar", "daily", "trips"]);
});

test("modern projects/new route resolves to the create-mode ProjectEditor", () => {
  assert.equal(resolveLifeManagerRoute({ pathname: "/projects/new", hash: "" }), "project-create");
  assert.equal(resolveLifeManagerRoute({ pathname: "/projects/new", hash: "#workbench" }), "project-create");
  const router = fs.readFileSync(path.join(__dirname, "..", "src", "router", "LifeManagerRouter.jsx"), "utf8");
  const editor = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Workbench", "ProjectEditor.jsx"), "utf8");
  const workbench = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Workbench", "WorkbenchPage.jsx"), "utf8");
  assert.match(router, /route === "project-create"[\s\S]*<ProjectEditor mode="create" \/>/);
  assert.match(workbench, /navigate\("\/projects\/new"\)/);
  assert.match(editor, /const EMPTY_PROJECT = \{[\s\S]*source: "home", title: ""/);
});

test("modern root defaults to the canonical Planner while direct module and Trips subroutes remain intact", () => {
  for (const pathname of ["/", "/index.html"]) {
    assert.equal(resolveLifeManagerRoute({ pathname, hash: "" }), "planner");
  }
  for (const route of ["planner", "workbench", "dashboard", "calendar", "daily", "trips"]) {
    assert.equal(resolveLifeManagerRoute({ pathname: `/${route}`, hash: "" }), route);
    assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: `#${route}` }), route);
  }
  for (const pathname of ["/prioritize", "/timeline", "/new", "/fixture-trip-id"]) {
    assert.equal(resolveLifeManagerRoute({ pathname, hash: "" }), "trips");
  }
});

test("rendered modern navigation omits Life Manager but retains every configured module and Planner", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const filename = path.join(__dirname, "..", "src", "components", "layout", "MainNavigation.jsx");
  const navigationSource = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function");
  const { code } = await transformWithOxc(navigationSource, filename, { jsx: { runtime: "classic", pragma: "element" } });
  const Link = () => {};
  const MainNavigation = vm.runInNewContext(`(() => { ${code}; return MainNavigation; })()`, {
    Link, navigationLinks, styles: { active: "active" },
    element: (type, props, ...children) => ({ type, props, children: children.flat(Infinity) }),
  });
  const tree = MainNavigation({ active: "planner" });
  const links = tree.children;
  assert.equal(links.length, navigationLinks.length);
  assert(!links.some((link) => link.children.includes("Life Manager")));
  for (const [route, label] of navigationLinks) {
    const link = links.find((item) => item.children.includes(label));
    assert(link);
    assert.equal(link.props.to.pathname, "/");
    assert.equal(link.props.to.hash, `#${route}`);
  }
  assert.equal(links.find((link) => link.children.includes("Planner")).props["aria-current"], "page");
});

  test("Trips, Prioritize and Timeline render the same canonical navigation in a navigation-only frame", async () => {
    const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
    const filename = path.join(__dirname, "..", "src", "router", "LifeManagerRouter.jsx");
    const routerSource = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "")
      .replace(/^export default /gm, "").replace(/^export /gm, "");
    const { code } = await transformWithOxc(routerSource, filename,
      { jsx: { runtime: "classic", pragma: "element", pragmaFrag: "Fragment" } });
    let location;
    const MainNavigation = () => {}, TripsApplication = () => {}, MainApplication = () => {};
    const render = vm.runInNewContext(`(() => { ${code}; return LifeManagerRoutes; })()`, {
      element: (type, props, ...children) => ({ type, props, children: children.flat(Infinity) }),
      Fragment: "fragment", lazy: () => () => {}, useLocation: () => location,
      useLayoutEffect: () => {}, resolveLifeManagerRoute,
      MainNavigation, TripsApplication, MainApplication, navigationStyles: { frame: "canonical-frame" },
    });
    for (const pathname of ["/trips", "/prioritize", "/timeline", "/fixture-trip-id"]) {
      location = { pathname, hash: "" };
      const tree = render();
      const [frame, content] = tree.children;
      assert.equal(frame.type, "div");
      assert.equal(frame.props.className, "canonical-frame");
      assert.equal(frame.children.length, 1);
      assert.equal(frame.children[0].type, MainNavigation);
      assert.equal(frame.children[0].props.active, "trips");
      assert.equal(content.type, TripsApplication);
    }
    for (const pathname of ["/", "/planner", "/workbench", "/calendar", "/daily"]) {
      location = { pathname, hash: "" };
      assert.equal(render().type, MainApplication);
    }
    const application = fs.readFileSync(path.join(__dirname, "..", "src", "components", "layout", "MainApplication.jsx"), "utf8");
    assert.match(application, /import MainNavigation from "\.\/MainNavigation\.jsx"/);
    assert.match(application, /const navigation = <MainNavigation active=\{route\}/);
    assert.match(application, /route === "planner" \? <Page navigation=\{navigation\}/);
    for (const name of ["TripsApplication", "TripsHome", "PrioritizeTrips", "TimelineView"]) {
      const pageSource = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Trips", `${name}.jsx`), "utf8");
      assert.doesNotMatch(pageSource, /<nav\b|MainNavigation|StandaloneNavigation|NavBar/);
    }
  });

  test("canonical navigation owns page-independent typography, dimensions and wrapping", () => {
    const layout = path.join(__dirname, "..", "src", "components", "layout");
    const css = fs.readFileSync(path.join(layout, "MainNavigation.module.css"), "utf8");
    assert.match(css, /font:\s*400 14\.4px "Segoe UI", Tahoma, sans-serif/);
    assert.match(css, /padding:\s*5\.6px 12px/);
    assert.match(css, /gap:\s*8px/);
    assert.match(css, /margin-top:\s*12px/);
    assert.match(css, /line-height:\s*normal/);
    assert.match(css, /letter-spacing:\s*normal/);
    assert.match(css, /flex-wrap:\s*wrap/);
    assert.match(css, /justify-content:\s*flex-start/);
    assert.match(css, /border:\s*1px solid #0f766e/);
    assert.match(css, /border-radius:\s*999px/);
    assert.match(css, /\.frame\s*\{[^}]*width:\s*100%;[^}]*padding:\s*16px 16px 0/);
    assert.doesNotMatch(css, /\d(?:rem|em)\b|@media|data-vite-page|var\(--primary/);
    for (const name of ["MainNavigation", "StandaloneNavigation"]) {
      const component = fs.readFileSync(path.join(layout, `${name}.jsx`), "utf8");
      assert.match(component, /import styles from "\.\/MainNavigation\.module\.css"/);
      assert.match(component, /className=\{styles\["hm-nav"\]\}/);
      assert.doesNotMatch(component, /style=\{|>Life Manager</);
    }
    // Standalone Activity needs ordinary anchors to reach the separate main shell.
    const standalone = fs.readFileSync(path.join(layout, "StandaloneNavigation.jsx"), "utf8");
    assert.match(standalone, /<div className=\{styles\.frame\}/);
    assert.match(standalone, /href=\{standaloneNavigationHref/);
    for (const file of [
      path.join(__dirname, "..", "trips", "src", "index.css"),
      path.join(__dirname, "..", "src", "pages", "Trips", "TimelineView.css"),
    ]) {
      const pageCss = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(pageCss, /(?:hm-nav|nav-(?:planner|trips|workbench)|nav\s+(?:a|button))\b/);
    }
  });

test("every Trips-home action uses the explicit Trips destination, independent of the root default and basename", () => {
  const { TRIPS_HOME_ROUTE, lifeManagerBasename } = vm.runInNewContext(
    `(() => { ${routesSource.replace(/^export /gm, "")}; return { TRIPS_HOME_ROUTE, lifeManagerBasename }; })()`
  );
  assert.equal(TRIPS_HOME_ROUTE, "/#trips");
  for (const name of ["TimelineView", "PrioritizeTrips", "TripDetails", "NewTrip"]) {
    const pageSource = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Trips", `${name}.jsx`), "utf8");
    assert.match(pageSource, /import \{ TRIPS_HOME_ROUTE \} from "\.\.\/\.\.\/router\/lifeManagerRoutes\.js"/);
    assert.doesNotMatch(pageSource, /navigate\(["']\/["']\)|(?:to|href)=["']\/["']/);
    const handler = pageSource.match(/onClick=\{(\(\) => navigate\(TRIPS_HOME_ROUTE\))\}/);
    assert(handler, `${name} must expose an explicit Trips-home action`);
    const destinations = [];
    vm.runInNewContext(`(${handler[1]})()`, { TRIPS_HOME_ROUTE, navigate: (to) => destinations.push(to) });
    assert.deepEqual(destinations, [TRIPS_HOME_ROUTE]);
  }
  for (const basename of ["/", "/trips", "/www/trips"]) {
    // React Router prefixes absolute app paths with its basename, including Capacitor's root.
    const target = new URL(`${basename === "/" ? "" : basename}${TRIPS_HOME_ROUTE}`, "https://fixture.invalid");
    const routerBase = lifeManagerBasename(target.pathname);
    const pathname = routerBase === "/" ? target.pathname : target.pathname.slice(routerBase.length) || "/";
    assert.equal(resolveLifeManagerRoute({ pathname, hash: target.hash }), "trips");
    assert.equal(target.hash, "#trips");
  }
  assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: "" }), "planner");
  assert.equal(resolveLifeManagerRoute({ pathname: "/trips", hash: "" }), "trips");
  const tripRoutes = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Trips", "TripsApplication.jsx"), "utf8");
  for (const route of ["/timeline", "/prioritize", "/new", "/:tripId"]) {
    assert(tripRoutes.includes(`path="${route}"`));
  }
  const details = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Trips", "TripDetails.jsx"), "utf8");
  assert.match(details, /<h2>Workflow<\/h2>/);
  const router = fs.readFileSync(path.join(__dirname, "..", "src", "router", "LifeManagerRouter.jsx"), "utf8");
  assert.match(router, /<TripsApplication home=\{location\.hash\.replace[\s\S]*=== "trips"/);
});
