const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
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
  for (const text of ["Life Manager", "Weekly Planner", "Workbench", "Dashboard", "Calendar", "Daily Activity Planner", "Trips", "planner_weekly_tasks", "projects_all", "trips_workflow_metadata", "trips_timeline", "activity_types", "activity_rules", "activity_weekly_grid"]) {
    assert(scripts.includes(text), `Build includes ${text}`);
  }
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
    assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: `#${alias}` }), "daily");
  }
  for (const pathname of ["/", "/index.html", "/prioritize", "/timeline", "/new", "/fixture-trip-id", "/constructor"]) {
    assert.equal(resolveLifeManagerRoute({ pathname, hash: "" }), "trips");
  }
});
