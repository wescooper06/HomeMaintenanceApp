const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, ...file.split("/")), "utf8");

function moduleExports(file, names, context = {}) {
  const source = read(file).replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  return vm.runInNewContext(`(() => { ${source}; return { ${names.join(",")} }; })()`, {
    structuredClone, console, ...context,
  });
}

test("retired runtime modules, protected templates, backend and public backup are absent", () => {
  for (const file of ["www/legacy", "www/screens", "www/components", "www/js/router.js",
    "www/js/migration", "www/mobile/mobile.js", "www/mobile/mobile.css", "www/mobile/screens",
    "www/mobile/settings.html", "www/localStorage_backup_2026-08-13.json", "google-apps-script",
    "scripts/reconcile-legacy-backup.cjs", "scripts/sync-auth.js", "auth.js",
    "src/services/plannerLegacyBackup.js", "src/pages/Workbench/components/AgentCommandBar.jsx"]) {
    assert.equal(fs.existsSync(path.join(root, ...file.split("/"))), false, file);
  }
  assert(fs.existsSync(path.join(root, "spec", "historical", "localStorage_backup_2026-08-13.json")));
  assert.match(read("src/pages/Workbench/WorkbenchPage.jsx"), /Add Project/);
  assert.match(read("src/pages/Workbench/WorkbenchPage.jsx"), /navigate\("\/projects\/new"\)/);
  assert.match(read("src/pages/Workbench/ProjectEditor.jsx"), /service\.createProject\(values\)/);
});

test("legacy backup rejection cannot be bypassed by factory options or merge options", async () => {
  const forbidden = () => { throw new Error("Storage must not be touched"); };
  const { createPlannerBackupService, parsePlannerBackup } = moduleExports(
    "src/services/plannerBackupService.js", ["createPlannerBackupService", "parsePlannerBackup"], {
      plannerStorage: {},
    });
  const service = createPlannerBackupService({
    loadPlannerState: forbidden, getProjects: forbidden, restorePlannerState: forbidden,
  }, { allowLegacy: true });
  for (const envelope of [
    { hm_weekly_planner: [] }, { hm_weekly_planner: { days: {} } },
    { hm_repeatable_tasks: [] }, { hm_task_manager_tasks: [] }, { hm_weekly_planner_queue: [] },
    { hm_sheet_write_retry_queue: [] }, { hm_parking_lot: [] }, { format: "old-planner", version: 1 },
    { format: "homemaintenance-planner", version: 1, hm_weekly_planner: [] },
  ]) {
    const raw = JSON.stringify(envelope);
    assert.throws(() => parsePlannerBackup(raw), /permanently unsupported/);
    await assert.rejects(service.preview(raw, { preserveExisting: true }), /permanently unsupported/);
    await assert.rejects(service.restore(raw, { preserveExisting: true }), /permanently unsupported/);
  }
});

test("weekly identities are explicit and never decoded from old generated row IDs", () => {
  const { parseWeeklySourceId, normalizeSource } = moduleExports(
    "src/services/plannerService.js", ["parseWeeklySourceId", "normalizeSource"], {
      plannerStorage: {}, appConfig: {}, calendarReminders: {},
    });
  assert.equal(parseWeeklySourceId({ id: "curated-106-2026-08-14-1786655361196" }), "");
  assert.equal(parseWeeklySourceId({ id: "ignored", projectId: "explicit-project" }), "explicit-project");
  assert.equal(parseWeeklySourceId({ projectId: "project", metadata: { sourceTaskId: "task" } }), "task");
  assert.equal(normalizeSource("Project List_A"), "project list_a", "No Sheets source conversion");
});

test("Calendar update failures never switch to a full PUT or open an authorization popup", async () => {
  const { createCalendarApi } = moduleExports("src/services/calendarService.js", ["createCalendarApi"], {
    cleanText: (value, fallback = "") => String(value ?? "").trim() || fallback,
    toDateKey: () => "2030-01-01", googleAuth: {}, plannerStorage: {}, calendarReminders: {},
  });
  for (const status of [401, 403, 500]) {
    const methods = [];
    let prompts = 0;
    const api = createCalendarApi({
      getAuth: async () => ({
        ensureAuthenticated: async () => "fixture-token",
        signOut: async () => {}, signIn: async () => { prompts += 1; },
      }),
      request: async (_url, options) => {
        methods.push(options.method);
        return { ok: false, status, json: async () => ({}) };
      },
    });
    await assert.rejects(api.update("fixture", { summary: "Keep" }, { summary: "Edited" }));
    assert.deepEqual(methods, ["PATCH"]);
    assert.equal(prompts, 0);
  }
});
