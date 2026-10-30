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
const { MemoryRouter, Routes, Route, Navigate, NavLink, Link, useLocation, useParams, useNavigate } = requireTrips("react-router-dom");
const load = (file, names, context = {}) => vm.runInNewContext(`(() => {
  ${fs.readFileSync(path.join(root, file), "utf8").replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")}
  return { ${names.join(",")} };
})()`, context);
const { resolveLifeManagerRoute, lifeManagerBasename } = load("src\\router\\lifeManagerRoutes.js",
  ["resolveLifeManagerRoute", "lifeManagerBasename"]);
const { restoreMealsDeepLink } = load("src\\router\\mealsDeepLink.js", ["restoreMealsDeepLink"], { URL });
const { newRecipeFilters } = load("src\\services\\recipeService.js",
  ["newRecipeFilters"], { getSupabaseClient() {} });
const { navigationLinks, standaloneNavigationHref } = load("src\\components\\layout\\navigationRoutes.js",
  ["navigationLinks", "standaloneNavigationHref"]);
let MealsPage, Navigation, LifeRoutes, OwnerBoundary, compileComponent;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  async function compile(relative, name, extra = {}) {
    const filename = path.join(root, relative);
    const input = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "")
      .replace(/^export default /gm, "").replace(/^export /gm, "")
      .replace("import.meta.env?.VITE_OWNER_AUTH_USER_ID", '"e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60"');
    const { code } = await transformWithOxc(input, filename, {
      jsx: { runtime: "classic", pragma: "React.createElement", pragmaFrag: "React.Fragment" },
    });
    return vm.runInNewContext(`(() => { ${code}; return ${name}; })()`, {
      React, Routes, Route, Navigate, NavLink, Link, useLocation, useParams, useNavigate,
      useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, newRecipeFilters, styles: { active: "active" },
      lazy: () => () => null, ...extra,
    });
  }
  compileComponent = compile;
  const core = await compile("src\\pages\\Meals\\RecipeCore.jsx", "{ RecipeLibrary, RecipeEditor, RecipeDetail }", {
    createRecipeService: () => ({}),
  });
  MealsPage = await compile("src\\pages\\Meals\\MealsPage.jsx", "MealsPage", core);
  Navigation = await compile("src\\components\\layout\\MainNavigation.jsx", "MainNavigation", { navigationLinks });
  LifeRoutes = await compile("src\\router\\LifeManagerRouter.jsx", "LifeManagerRoutes", {
    resolveLifeManagerRoute, useLayoutEffect() {}, navigationStyles: {},
    MainApplication: ({ route }) => route === "meals" ? React.createElement(MealsPage) : null,
    TripsApplication: () => React.createElement("h1", null, "TRIPS_SENTINEL"),
  });
  OwnerBoundary = async (status) => compile("src\\components\\OwnerAuthBoundary.jsx", "OwnerAuthBoundary", {
    useState: (initial) => React.useState(initial?.status === "checking" ? { status, error: "" } : initial),
    useEffect: React.useEffect, createOwnerAuthController: () => ({}), getSupabaseClient: () => ({}),
  });
});

test("Meals parent owns only criteria across subroutes and a fresh parent starts at defaults", async () => {
  async function parent() {
    let criteria;
    let pathname = "/meals/recipes";
    const Page = await compileComponent("src\\pages\\Meals\\MealsPage.jsx", "MealsPage", {
      RecipeLibrary: () => null, RecipeEditor: () => null, RecipeDetail: () => null,
      useLocation: () => ({ pathname, search: "" }),
      useState(initial) {
        criteria ??= initial();
        return [criteria, (update) => { criteria = typeof update === "function" ? update(criteria) : update; }];
      },
    });
    function descendants(node) {
      return !React.isValidElement(node) ? [] : [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
    }
    return {
      library(pathnameNext = "/meals/recipes") {
        pathname = pathnameNext;
        const route = descendants(Page()).find((node) => node.props.path === "/meals/recipes");
        return route.props.element.props;
      },
    };
  }
  const mounted = await parent();
  const initial = mounted.library();
  assert.deepEqual(initial.filters, newRecipeFilters());
  const criteria = { search: "Soup", categoryIds: ["c1", "c2"], cuisineIds: ["u1", "u2"], favorites: true };
  initial.setFilters(criteria);
  for (const pathname of ["/meals/recipes/recipe-id", "/meals/recipes/recipe-id/edit",
    "/meals/recipes/recipe-id", "/meals/shopping", "/meals/recipes"]) {
    assert.equal(mounted.library(pathname).filters, criteria);
  }
  const fresh = await parent();
  assert.deepEqual(fresh.library("/meals/recipes/direct-id").filters, newRecipeFilters());
  assert.deepEqual(fresh.library().filters, newRecipeFilters());
  const source = fs.readFileSync(path.join(root, "src\\pages\\Meals\\MealsPage.jsx"), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|useSearchParams/);
});

test("data router mounts only inside owner boundary, retains basename and survives StrictMode initializer replay", async () => {
  for (const owner of [false, true]) {
    let constructed = 0;
    const Router = await compileComponent("src\\router\\LifeManagerRouter.jsx", "LifeManagerRouter", {
      window: { location: { pathname: "/HomeMaintenanceApp/www/trips/meals/recipes/new" } },
      lifeManagerBasename,
      useState: (initialize) => {
        const first = initialize();
        assert.equal(initialize(), first, "StrictMode must not register a second browser router");
        return [first];
      },
      OwnerAuthBoundary: ({ children }) => owner ? children : React.createElement("p", null, "Private routes blocked"),
      RouterProvider: () => React.createElement("p", null, "Private router mounted"),
      createBrowserRouter(routes, options) {
        constructed++;
        assert.equal(options.basename, "/HomeMaintenanceApp/www/trips");
        assert.equal(routes.length, 1);
        assert.equal(routes[0].path, "*");
        return {};
      },
    });
    const html = renderToStaticMarkup(React.createElement(Router));
    assert.equal(constructed, owner ? 1 : 0);
    assert.equal(html.includes("Private router mounted"), owner);
  }
});

const paths = ["/meals", "/meals/", "/meals/recipes", "/meals/recipes/new",
  "/meals/recipes/synthetic-id", "/meals/shopping", "/meals/not-found", "/meals/import"];

test("NAV-003: all Meals paths remain in Meals, even with a stale Trips hash; aliases are unchanged", () => {
  for (const pathname of paths) {
    for (const hash of ["", "#trips", "#planner"]) assert.equal(resolveLifeManagerRoute({ pathname, hash }), "meals");
  }
  for (const pathname of ["/cooking", "/meals-other", "/timeline", "/new"]) {
    assert.equal(resolveLifeManagerRoute({ pathname, hash: "" }), "trips");
  }
  assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: "#meals" }), "meals");
  assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: "#parking" }), "planner");
  assert.equal(lifeManagerBasename("/HomeMaintenanceApp/www/trips/meals/recipes/trips"), "/HomeMaintenanceApp/www/trips");
});

function render(Page, pathname, basename = "/") {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { basename, initialEntries: [pathname] },
    React.createElement(Page)));
}

test("NAV-001/002/004 and RESP-001: shared shell renders actual Recipes/Shopping links with active states", () => {
  for (const [pathname, title, active] of [
    ["/meals/recipes", "Recipes", "recipes"], ["/meals/recipes/new", "Add Recipe", "recipes"],
    ["/meals/recipes/synthetic-id", "Recipe Detail", "recipes"], ["/meals/shopping", "Shopping", "shopping"],
    ["/meals/not-found", "Meals page not found", null],
  ]) {
    const html = render(MealsPage, "/HomeMaintenanceApp/www/trips" + pathname, "/HomeMaintenanceApp/www/trips");
    assert.match(html, new RegExp(`<h2[^>]*>${title}</h2>`));
    if (active === "recipes") assert.match(html, /role="status"[^>]*>Loading Recipe/);
    else assert.match(html, /Phase 0A foundation preview - not data-backed/);
    for (const destination of ["recipes", "shopping"]) {
      assert(html.includes(`href="/HomeMaintenanceApp/www/trips/meals/${destination}"`));
    }
    if (active) assert.match(html, new RegExp(`aria-current="page"[^>]*href="[^"]*/${active}"`));
    assert.doesNotMatch(html, /<form|<input|<table|TRIPS_SENTINEL/);
  }
  const html = render(() => React.createElement(Navigation, { active: "meals" }), "/");
  assert.match(html, /id="nav-meals"[^>]*aria-current="page"[^>]*href="\/meals"/);
  assert.match(html, />Meals<\/a>/);
  const css = fs.readFileSync(path.join(root, "src\\pages\\Meals\\MealsPage.module.css"), "utf8");
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 40rem\)/);
});

test("ARCH-001/004/005: real owner boundary never mounts private Meals router while checking or logged out", async () => {
  for (const status of ["checking", "signed-out", "owner"]) {
    const Boundary = await OwnerBoundary(status);
    let mounts = 0;
    function ProtectedRoutes() { mounts++; return React.createElement(LifeRoutes); }
    const html = render(() => React.createElement(Boundary, null, React.createElement(ProtectedRoutes)), "/meals/recipes");
    assert.equal(mounts, status === "owner" ? 1 : 0);
    assert.equal(html.includes("Loading Recipes"), status === "owner");
    if (status === "signed-out") assert.match(html, /Life Manager owner login/);
  }
  const main = fs.readFileSync(path.join(root, "src\\components\\layout\\MainApplication.jsx"), "utf8");
  assert.match(main, /meals: lazy\(\(\) => import\("..\/..\/pages\/Meals\/MealsPage.jsx"\)\)/);
});

test("standalone Meals navigation retains deployment prefix and leaves other destinations unchanged", () => {
  assert.equal(standaloneNavigationHref("meals", { pathname: "/HomeMaintenanceApp/www/activity-planner/index.html", port: "" }),
    "/HomeMaintenanceApp/www/trips/meals");
  assert.equal(standaloneNavigationHref("meals", { protocol: "http:", hostname: "localhost", port: "5174" }),
    "http://localhost:5173/meals");
});

test("static fallback is Meals-only and restores the exact prefixed pathname/search/hash before routing", () => {
  const fallback = fs.readFileSync(path.join(root, "404.html"), "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const pathname of paths) {
    const original = `https://fixture.invalid/HomeMaintenanceApp/www/trips${pathname}?filter=one%26two#fixture`;
    let redirected;
    const location = new URL(original);
    location.replace = (value) => { redirected = value; };
    vm.runInNewContext(fallback, { window: { location }, encodeURIComponent });
    const entry = new URL(redirected, original);
    assert.equal(entry.pathname, "/HomeMaintenanceApp/www/trips/index.html");
    assert.equal(new URL("./assets/entry.js", entry).pathname, "/HomeMaintenanceApp/www/trips/assets/entry.js");
    let restored;
    restoreMealsDeepLink(entry, { replaceState: (_state, _unused, value) => { restored = value; } });
    assert.equal(new URL(restored, entry).href, original);
    assert.equal(lifeManagerBasename(new URL(restored, entry).pathname), "/HomeMaintenanceApp/www/trips");
  }
  for (const pathname of ["/HomeMaintenanceApp/www/trips/timeline", "/elsewhere", "/meals", "/HomeMaintenanceApp/www/trips/meals-other"]) {
    vm.runInNewContext(fallback, { window: { location: { pathname, search: "", hash: "", replace() { assert.fail("Unrelated route redirected"); } } }, encodeURIComponent });
  }
  for (const destination of ["https://evil.invalid", "//evil.invalid", "/meals/../../outside",
    "/meals/../../trips-other/meals", "/meals\\outside", "/meals\noutside"]) {
    assert.throws(() => restoreMealsDeepLink(new URL(`https://fixture.invalid/HomeMaintenanceApp/www/trips/index.html?__meals=${encodeURIComponent(destination)}`),
      { replaceState() { assert.fail("Unsafe redirect"); } }), /Invalid Meals|escaped/);
  }
  assert.throws(() => restoreMealsDeepLink(new URL("https://fixture.invalid/index.html?__meals=/meals"), {}), /Invalid Meals/);
});
