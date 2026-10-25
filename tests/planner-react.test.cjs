const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const requireTrips = createRequire(path.join(root, "trips", "package.json"));
const espree = requireTrips("espree");
const source = fs.readFileSync(path.join(root, "src", "services", "plannerService.js"), "utf8");
const serviceAst = espree.parse(source, { ecmaVersion: "latest", sourceType: "module" });
const exportsList = serviceAst.body.filter((node) => node.type === "ExportNamedDeclaration").flatMap((node) =>
  node.declaration.type === "VariableDeclaration" ? node.declaration.declarations.map((entry) => entry.id.name) : [node.declaration.id.name]);
const persistenceAdapter = new Proxy({}, {
  get: (_, key) => (...args) => {
    if (key === "getProjects") return window.loadAllProjects();
    if (key === "loadPlannerState") return window.PlannerStorage.getWeeklyPlanner().then((planner) =>
      ({ weekStartDate: planner.weekStartDate, weeklyTasks: planner.tasks }));
    if (key === "getRepeatableOverrides") return Promise.resolve(JSON.parse(localStorage.getItem("hm_repeatable_tasks") || "[]"));
    if (key === "saveRepeatableOverrides") {
      localStorage.setItem("hm_repeatable_tasks", JSON.stringify(args[0]));
      return Promise.resolve();
    }
    if (key === "updateProject") return window.SheetsService.updateProjectInSheet(...args);
    if (key === "getCuratedTasks") return Promise.resolve(JSON.parse(localStorage.getItem("hm_planner_curated_tasks") || "[]"));
    if (key === "saveCuratedTasks") {
      localStorage.setItem("hm_planner_curated_tasks", JSON.stringify(args[0]));
      return Promise.resolve();
    }
    if (key === "getStagedTasks") return Promise.resolve(
      JSON.parse(localStorage.getItem("hm_weekly_planner_queue") || "[]").map((item, index) => ({ id: String(index), item }))
    );
    if (key === "deleteStagedTasks") {
      localStorage.removeItem("hm_weekly_planner_queue");
      return Promise.resolve();
    }
    return window.PlannerStorage[key](...args);
  },
});
const servicePromise = Promise.resolve(vm.runInThisContext(`((plannerStorage, appConfig, calendarReminders) => {
  ${source.replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")}
  return { ${exportsList.join(",")} };
})`, { filename: "plannerService.test-module.js" })(persistenceAdapter,
  new Proxy({}, { get: (_, key) => window.APP_CONFIG[key] }),
  new Proxy({}, { get: (_, key) => (...args) => window.modernReminders[key](...args) })));
const clone = (value) => JSON.parse(JSON.stringify(value));

function adapters(initial, projects = []) {
  let stored = clone(initial);
  let cached = clone(projects);
  const local = new Map();
  const writes = [];
  const changes = new Set();
  global.localStorage = {
    getItem: (key) => local.get(key) || null,
    setItem: (key, value) => local.set(key, value),
    removeItem: (key) => local.delete(key),
  };
  global.window = {
    APP_CONFIG: { GOOGLE_SHEETS_WRITE_URL: "https://invalid.test/reminders", USER_PHONE_NUMBER: "fixture", USER_SMS_GATEWAY: "fixture" },
    location: { hash: "#planner" }, setTimeout, clearTimeout,
    modernReminders: { schedule: async () => { throw new Error("Invalid response"); } },
    SheetsService: { updateProjectInSheet: async () => ({ ok: true }) },
    ProjectsService: { UnifiedProjectList: projects },
    loadAllProjects: async () => clone(projects),
    PlannerStorage: {
      getUseSheets: () => false,
      getWeeklyPlanner: async () => clone(stored),
      saveWeeklyPlannerState: async (planner) => { stored = clone(planner); writes.push(stored); },
      getCachedProjects: () => cached,
      setCachedProjects: (value) => { cached = clone(value); },
      getTaskManager: async () => [],
      prefetchAll: async () => {},
      onChange: (callback) => { changes.add(callback); return () => changes.delete(callback); },
    },
  };
  global.fetch = async () => ({ ok: true, json: async () => ({ forecast: { forecastday: [] }, ok: true }) });
  return { local, writes, changes };
}

async function setup(initial, projects = [], seed = {}) {
  const service = await servicePromise;
  const environment = adapters(initial, projects);
  for (const [key, value] of Object.entries(seed)) environment.local.set(key, JSON.stringify(value));
  const controller = service.createPlannerController();
  await controller.actions.initialize();
  return { service, controller, environment };
}

test("weekly moves preserve completion, edited checklists and titles", async () => {
  const initial = { weekStartDate: "2026-10-19", tasks: [
    { id: "curated-p1-2026-10-19", taskId: "curated-p1-2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Fixture", type: "curated", source: "home", checklist: [
      { id: "c1", text: "One", completed: false }, { id: "c2", text: "Two", completed: false },
    ] },
  ] };
  const { controller } = await setup(initial);
  try {
    const id = initial.tasks[0].id;
    const steps = [
      ["toggleChecklistOpen", [id, "mon", "morning"]],
      ["toggleChecklistItem", [id, "mon", "morning", "c1", true]],
      ["reorderChecklistItem", [id, "mon", "morning", "c1", "c2"]],
      ["updateChecklistItem", [id, "c2", "Renamed"]],
      ["removeChecklistItem", [id, "mon", "morning", "c1"]],
      ["setTaskCompleted", [id, "mon", "morning", true]],
      ["updateTaskTitle", [id, "New title"]],
      ["moveTask", [id, "2026-10-21", "evening"]],
    ];
    for (const [name, args] of steps) {
      controller.actions[name](...args);
    }
    const [task] = controller.getSnapshot().planner.tasks;
    assert.equal(task.date, "2026-10-21");
    assert.equal(task.timeSlot, "evening");
    assert.equal(task.title, "New title");
    assert.equal(task.completed, true);
    assert.equal(task.checklistOpen, true);
    assert.deepEqual(clone(task.checklist), [{ id: "c2", text: "Renamed", completed: false }]);
    await controller.flush();
  } finally { controller.destroy(); }
});

test("all recurrence series scopes preserve moved exceptions and deletion tombstones exactly", async () => {
  for (const scope of ["future", "this-future", "entire"]) {
    const initial = { weekStartDate: "2026-10-19", tasks: [
      { id: "repeatable-r1-2026-10-19", parentRepeatableId: "r1", occurrenceDate: "2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Series", type: "repeatable", source: "repeating", recurrence: "weekly" },
      { id: "exception", parentRepeatableId: "r1", occurrenceDate: "2026-10-12", date: "2026-10-20", timeSlot: "evening", title: "Moved", type: "repeatable", overridden: true, source: "repeating" },
      { id: "deleted", parentRepeatableId: "r1", occurrenceDate: "2026-10-26", date: "2026-10-26", timeSlot: "morning", title: "Deleted", type: "repeatable", deletedInstance: true, source: "repeating" },
    ] };
    const { controller } = await setup(initial, [{ id: "r1", title: "Series", source: "repeating", metadata: { recurrence: "weekly" } }]);
    try {
      const values = { recurrence: "monthly", baseDay: "Tuesday", monthWeek: "last", baseBucket: "Evening", applyScope: scope };
      controller.actions.saveSeries(initial.tasks[0].id, values);
      assert.equal(controller.getSnapshot().repeatableTasks[0].recurrence, "monthly");
      assert(controller.getSnapshot().planner.tasks.some((item) => item.id === "exception" && item.overridden));
      controller.actions.deleteSeries(controller.getSnapshot().planner.tasks.find((item) => item.parentRepeatableId === "r1").id);
      assert(controller.getSnapshot().planner.tasks.filter((item) => item.parentRepeatableId === "r1")
        .every((item) => item.deletedInstance || item.overridden), scope);
      await controller.flush();
    } finally { controller.destroy(); }
  }
});

test("moving/deleting an instance retains identity and suppresses regeneration", async () => {
  const initial = { weekStartDate: "2026-10-19", tasks: [
    { id: "repeatable-r1-2026-10-19", parentRepeatableId: "r1", occurrenceDate: "2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Series", type: "repeatable", source: "repeating" },
  ] };
  const { controller } = await setup(initial, [{ id: "r1", title: "Series", source: "repeating", metadata: {} }]);
  try {
    for (const [name, args] of [["moveTask", [initial.tasks[0].id, "2026-10-22", "evening"]], ["removeTask", [initial.tasks[0].id]], ["generateVisibleRecurringInstances", []]]) {
      controller.actions[name](...args);
    }
    const [task] = controller.getSnapshot().planner.tasks;
    assert.equal(task.id, initial.tasks[0].id);
    assert.equal(task.occurrenceDate, "2026-10-19");
    assert.equal(task.deletedInstance, true);
    await controller.flush();
  } finally { controller.destroy(); }
});

test("reminder failure is explicit and cannot create a success-shaped reminder", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const initial = { weekStartDate: "2026-10-19", tasks: [{ id: "adhoc-fixture", date: "2026-10-19", timeSlot: "morning", title: "Fixture", type: "adhoc" }] };
  const { controller } = await setup(initial);
  try {
    await assert.rejects(controller.actions.reminder("adhoc-fixture", "send", "10", "09:00"), /Invalid response/);
    assert(!controller.getSnapshot().planner.tasks[0].reminder?.active);
    assert.match(controller.getSnapshot().status, /Invalid response/);
    assert(logged.mock.calls.length > 0);
  } finally { controller.destroy(); }
});

test("calendar and reminder contracts retain week boundaries and bucket times", async () => {
  const service = await servicePromise;
  assert.equal(service.getWeekStartISO("2026-10-25"), "2026-10-19");
  const calendar = service.getCalendarMonth("2026-11-01", "2026-11-01", "2026-10-26");
  assert.equal(calendar.length, 42);
  assert.equal(calendar[0].date, "2026-10-26");
  assert.equal(calendar.filter((day) => day.visible).length, 7);
  assert.equal(service.getMoveCalendar("2026-11-01", "2026-11-01").blanks.length, 0);
  for (const [slot, expected] of [["morning", 7], ["afternoon", 12], ["evening", 17]]) {
    const date = service.getReminderSendAt({ date: "2026-10-19", timeSlot: slot }, "60", "");
    assert.equal(date.getHours(), expected);
    assert.equal(date.getMinutes(), 0);
  }
  const values = service.getSeriesEditorValues({ recurrence: "monthly", baseDay: "", baseBucket: "", monthWeek: "" },
    { occurrenceDate: "2026-10-20", date: "2026-10-20", timeSlot: "afternoon" });
  assert.equal(values.baseDay, "Tuesday");
  assert.equal(values.baseBucket, "Afternoon");
  assert.equal(values.monthWeek, "3");
});

test("Supabase staging deduplicates, respects curated limit and schedules repeatable entries", async () => {
  const curated = Array.from({ length: 7 }, (_, index) => ({ taskId: `p${index}`, projectId: `p${index}`, title: `Project ${index}`, source: "home" }));
  const queue = [
    { taskId: "p0", projectId: "p0", title: "Updated staged project", source: "home" },
    { taskId: "p7", projectId: "p7", title: "Eighth project", source: "home" },
    { taskId: "p8", projectId: "p8", title: "Over limit", source: "home" },
    { taskId: "r1", projectId: "r1", title: "Staged repeatable", source: "repeating", recurrence: "biweekly" },
  ];
  const { controller, environment } = await setup({ weekStartDate: "2026-10-19", tasks: [] }, [], { hm_planner_curated_tasks: curated });
  try {
    environment.local.set("hm_weekly_planner_queue", JSON.stringify(queue));
    await controller.actions.consumeStagedQueue();
    assert.equal(controller.getSnapshot().curatedTasks.length, 8);
    assert.equal(controller.getSnapshot().planner.tasks[0].date, "2026-10-19");
    assert.equal(environment.local.has("hm_weekly_planner_queue"), false);
    await controller.flush();
  } finally { controller.destroy(); }
});

test("missing master project requires explicit linking before title persistence", async () => {
  const { controller } = await setup({ weekStartDate: "2026-10-19", tasks: [
    { id: "orphan", projectId: "missing", date: "2026-10-19", timeSlot: "morning", title: "Orphan project", source: "home", type: "project" },
  ] }, [{ id: "p1", title: "Existing project", source: "home", metadata: {} }]);
  try {
    const pending = controller.actions.saveTaskTitleEdit("orphan", "Linked master title");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.getSnapshot().linkProject.projects[0].id, "p1");
    assert.equal(controller.getSnapshot().planner.tasks[0].title, "Orphan project");
    controller.actions.selectMaster("p1");
    assert.equal(await pending, true);
    assert.equal(controller.getSnapshot().planner.tasks[0].projectId, "p1");
    assert.equal(controller.getSnapshot().planner.tasks[0].title, "Linked master title");
    await controller.flush();
  } finally { controller.destroy(); }
});

test("adapter sync failures surface status and subscriptions are cleaned up", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const { controller, environment } = await setup({ weekStartDate: "2026-10-19", tasks: [] });
  try {
    assert.equal(environment.changes.size, 1);
    environment.changes.forEach((callback) => callback({ type: "weekly-task-sync-error", error: "Fixture sync failure" }));
    assert.match(controller.getSnapshot().status, /Fixture sync failure/);
    assert(logged.mock.calls.length > 0);
  } finally { controller.destroy(); }
  assert.equal(environment.changes.size, 0);
});

test("late initialization cannot overwrite the current mount or leak subscriptions", async () => {
  const service = await servicePromise;
  const environment = adapters({ weekStartDate: "2026-10-19", tasks: [] });
  const responses = [];
  window.loadAllProjects = () => new Promise((resolve) => responses.push(resolve));
  const controller = service.createPlannerController();
  try {
    const first = controller.actions.initialize();
    await new Promise((resolve) => setImmediate(resolve));
    controller.destroy();
    const second = controller.actions.initialize();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(responses.length, 2);
    responses[1]([{ id: "new", title: "Current mount", source: "repeating", metadata: {} }]);
    await second;
    responses[0]([{ id: "old", title: "Stale mount", source: "repeating", metadata: {} }]);
    await first;
    assert.equal(controller.getSnapshot().repeatableTasks[0].projectId, "new");
    assert.equal(environment.changes.size, 1);
  } finally { controller.destroy(); }
  assert.equal(environment.changes.size, 0);
});

test("pending remote writes never delay React snapshots or mutate an earlier snapshot", async () => {
  const { controller } = await setup({ weekStartDate: "2026-10-19", tasks: [] });
  const writes = [];
  const completions = [];
  window.PlannerStorage.saveWeeklyPlannerState = (planner) => {
    writes.push(clone(planner));
    return new Promise((resolve) => completions.push(resolve));
  };
  try {
    controller.actions.addAdHocTask("First", "mon", "morning");
    controller.actions.addAdHocTask("Second", "tue", "evening");
    assert.equal(writes.length, 2);
    assert.equal(writes[0].tasks.length, 1);
    assert.equal(writes[1].tasks.length, 2);
    assert.equal(writes[0].tasks[0].title, "First");
    completions.forEach((resolve) => resolve());
    await controller.flush();
  } finally { completions.forEach((resolve) => resolve()); controller.destroy(); }
});
