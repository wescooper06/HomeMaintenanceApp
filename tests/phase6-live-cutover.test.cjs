const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, ...file.split("/")), "utf8");

test("web and mobile launchers preserve hash/query and resolve the modern shell under root or www", () => {
  for (const prefix of ["", "/www"]) {
    for (const route of ["dashboard", "planner", "parking", "calendar", "workbench", "trips", "daily", "/planner"]) {
      let target;
      vm.runInNewContext(read("www/js/modern-entry.js"), {
        URL, document: { currentScript: { src: `https://fixture.invalid${prefix}/js/modern-entry.js` } },
        window: { location: { hash: `#${route}`, search: "?fixture=1", replace: (url) => { target = url; } } },
      });
      assert.equal(target, `https://fixture.invalid${prefix}/trips/index.html?fixture=1#${route}`);
    }
  }
  for (const file of ["index.html", "www/index.html", "www/mobile/index.html"]) {
    assert.match(read(file), /js\/modern-entry.js/);
    assert.doesNotMatch(read(file), /legacy\/|migration\/|sheets\.service|mobile\.js|js\/router.js/);
  }
});

test("modern routes support parking and shell basenames including www hosting and Capacitor", () => {
  const api = vm.runInNewContext(`(() => {
    ${read("src/router/lifeManagerRoutes.js").replace(/^export /gm, "")}
    return { lifeManagerBasename, resolveLifeManagerRoute };
  })()`);
  for (const [url, expected] of [["/www/trips/index.html", "/www/trips"],
    ["/trips/", "/trips"], ["/index.html", "/"], ["/", "/"], ["/www/trips/timeline", "/www/trips"]]) {
    assert.equal(api.lifeManagerBasename(url), expected);
  }
  assert.equal(api.resolveLifeManagerRoute({ pathname: "/", hash: "#parking" }), "planner");
});

test("static launchers and Capacitor share the React Planner default without an injected dashboard redirect", () => {
  const api = vm.runInNewContext(`(() => {
    ${read("src/router/lifeManagerRoutes.js").replace(/^export /gm, "")}
    return { lifeManagerBasename, resolveLifeManagerRoute };
  })()`);
  for (const prefix of ["", "/www"]) {
    let target;
    vm.runInNewContext(read("www/js/modern-entry.js"), {
      URL, document: { currentScript: { src: `https://fixture.invalid${prefix}/js/modern-entry.js` } },
      window: { location: { hash: "", search: "?fixture=1", replace: (url) => { target = new URL(url); } } },
    });
    assert.equal(target.hash, "");
    assert.equal(target.search, "?fixture=1");
    const basename = api.lifeManagerBasename(target.pathname);
    assert.equal(api.resolveLifeManagerRoute({
      pathname: target.pathname.slice(basename.length), hash: target.hash,
    }), "planner");
  }
  const capacitor = JSON.parse(read("capacitor.config.json"));
  assert.equal(capacitor.webDir, "dist/trips");
  assert.equal(api.resolveLifeManagerRoute({ pathname: "/", hash: "" }), "planner");
  assert.equal(api.resolveLifeManagerRoute({ pathname: "/planner", hash: "" }), "planner");
  assert.match(read("src/router/LifeManagerRouter.jsx"), /route !== "trips".*<MainApplication route=\{route\}/);
});

test("production singleton rejects historical envelopes before conversion, target queries or storage reads/writes", async () => {
  const source = read("src/services/plannerBackupService.js").replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const forbidden = () => { throw new Error("No conversion, reads, retries or writes allowed"); };
  const { plannerBackup } = vm.runInNewContext(`(() => { ${source}; return { plannerBackup }; })()`, {
    structuredClone, plannerStorage: { loadPlannerState: forbidden, getProjects: forbidden, restorePlannerState: forbidden },
    convertLegacyPlannerBackup: forbidden, resolveBackupProjectReferences: forbidden,
    legacyProjectReferenceIssue: forbidden, fetch: forbidden,
  });
  for (const raw of ['{"hm_weekly_planner":[]}', '{"hm_repeatable_tasks":[]}',
    '{"hm_sheet_write_retry_queue":[{"id":"106"}]}',
    '{"format":"homemaintenance-planner","version":1,"hm_weekly_planner":[]}']) {
    await assert.rejects(plannerBackup.preview(raw), /permanently unsupported/);
    await assert.rejects(plannerBackup.restore(raw, { preserveExisting: true }), /permanently unsupported/);
  }
});
