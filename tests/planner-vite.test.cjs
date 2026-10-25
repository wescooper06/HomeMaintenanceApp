const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const requireTrips = createRequire(path.join(root, "trips", "package.json"));

function legacyHashes() {
  const hashes = new Map();
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        hashes.set(file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
      }
    }
  }
  walk(path.join(root, "www"));
  return hashes;
}

test("the Life Manager Vite entry bundles every feature without writing to www", async () => {
  const before = legacyHashes();
  const vite = await import(pathToFileURL(requireTrips.resolve("vite")).href);
  const config = await vite.resolveConfig({
    configFile: path.join(root, "trips", "vite.config.js"),
    root: path.join(root, "trips"),
    logLevel: "error",
  }, "build");
  assert.equal(config.base, "./");
  assert.equal(path.resolve(config.root, config.build.outDir), path.join(root, "dist", "trips"));

  const result = await vite.build({
    configFile: path.join(root, "trips", "vite.config.js"),
    root: path.join(root, "trips"),
    logLevel: "error",
    build: { write: false },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const html = output.find((entry) => entry.fileName === "index.html").source;
  assert.match(html, /id="root"/);
  assert.match(html, /<title>Life Manager<\/title>/);
  assert.doesNotMatch(html, /NavComponent|location\.assign/);
  const scripts = output.filter((entry) => entry.type === "chunk").map((entry) => entry.code).join("\n");
  assert.doesNotMatch(scripts, /window\.PlannerStorage|window\.Auth|NavComponent|SheetsService|www\/legacy|APP_CONFIG/);
  assert.doesNotMatch(scripts, /sheets\.googleapis\.com|script\.google\.com|VITE_REMINDER_API_URL/);
  assert.doesNotMatch(scripts, /convertLegacyPlannerBackup|legacyImportDate|legacyProjectIdMap|hm_weekly_planner|hm_repeatable_tasks|hm_sheet_write_retry_queue|AgentCommandBar|PUT fallback/);
  assert(!scripts.includes("Planner backup and restore"), "Weekly Planner does not bundle the backup/restore panel");
  assert(scripts.includes("Google Calendar Notification"), "Build retains Calendar notifications");
  const plannerPage = fs.readFileSync(path.join(root, "src", "pages", "Planner", "PlannerPage.jsx"), "utf8");
  assert.doesNotMatch(plannerPage, /PlannerBackupPanel/);
  for (const component of ["PlannerHeader", "PlannerSidebar", "WeeklyGrid", "PlannerFooter"]) {
    assert(plannerPage.includes(`<${component}`), `Weekly Planner retains ${component}`);
  }
  for (const text of ["Life Manager", "Weekly Planner", "Workbench", "Dashboard", "Calendar", "Daily Activity Planner", "Trips", "planner_weekly_tasks", "projects_all", "trips_workflow_metadata", "trips_timeline", "activity_types", "activity_rules", "activity_weekly_grid"]) {
    assert(scripts.includes(text), `Build includes ${text}`);
  }
  assert.deepEqual(legacyHashes(), before);
});

test("standalone Activity Planner bundles scoped React navigation without legacy middleware or output writes", async () => {
  const before = legacyHashes();
  const vite = await import(pathToFileURL(requireTrips.resolve("vite")).href);
  const result = await vite.build({
    configFile: path.join(root, "trips", "activity-planner.vite.config.js"),
    logLevel: "error",
    build: { write: false },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const html = output.find((entry) => entry.fileName === "index.html").source;
  assert.doesNotMatch(html, /HM_NAV_BASE|NavComponent|components\/nav|legacy\//);
  const scripts = output.filter((entry) => entry.type === "chunk").map((entry) => entry.code).join("\n");
  assert.match(scripts, /Life Manager navigation/);
  assert.doesNotMatch(scripts, /NavComponent|legacy\/|APP_CONFIG/);
  assert(output.some((entry) => entry.fileName.endsWith(".css")));
  assert.deepEqual(legacyHashes(), before);
});

test("Life Manager resolves all required hash routes, aliases and existing Trips URLs", async () => {
  const source = fs.readFileSync(path.join(root, "src", "router", "lifeManagerRoutes.js"), "utf8");
  const { resolveLifeManagerRoute } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  for (const route of ["planner", "workbench", "dashboard", "calendar", "daily", "trips"]) {
    assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: `#${route}` }), route);
    assert.equal(resolveLifeManagerRoute({ pathname: "/prioritize", hash: `#/${route}` }), route);
    assert.equal(resolveLifeManagerRoute({ pathname: `/${route}`, hash: "" }), route);
  }
  for (const alias of ["activities", "daily-activities", "activity-planner"]) {
    assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: `#${alias}` }), "trips");
  }
  for (const pathname of ["/", "/index.html", "/prioritize", "/timeline", "/new", "/fixture-trip-id", "/constructor"]) {
    assert.equal(resolveLifeManagerRoute({ pathname, hash: "" }), "trips");
  }
});
