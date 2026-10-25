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
