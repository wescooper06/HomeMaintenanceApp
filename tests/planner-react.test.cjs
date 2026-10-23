const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
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
const servicePromise = Promise.resolve(vm.runInThisContext(`((plannerStorage) => {
  ${source.replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")}
  return { ${exportsList.join(",")} };
})`, { filename: "plannerService.test-module.js" })(persistenceAdapter));
const legacySource = fs.readFileSync(path.join(root, "www", "screens", "planner", "planner.js"), "utf8");
const legacyAst = espree.parse(legacySource, { ecmaVersion: "latest", range: true });
const declarations = legacyAst.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === "initPlannerScreen")
  .body.body.filter((node) => node.type === "FunctionDeclaration").map((node) => legacySource.slice(...node.range)).join("\n");
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
  const sandbox = {
    state: controller.getSnapshot(), window, localStorage, console, Date, Math, Map, Set, URL, setTimeout, clearTimeout,
    DAY_ORDER: service.DAY_ORDER, SLOT_ORDER: service.SLOT_ORDER,
    FULL_DAY_NAMES: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    MONTH_WEEK_OPTIONS: ["1", "2", "3", "4", "last"], CURATED_TASK_LIMIT: 8,
    STORAGE_KEYS: { curatedTasks: "hm_planner_curated_tasks", staged: "hm_weekly_planner_queue", repeatable: "hm_repeatable_tasks" },
    elements: { status: { textContent: "" }, adhocTitle: {}, adhocDay: {}, adhocSlot: {}, weekScrollContainer: {} },
  };
  sandbox.state.activeAdhocChecklist = null;
  const names = ["assignTask", "addAdHocTask", "moveTask", "moveTaskToDate", "removeTask", "removeTaskFromCurated",
    "removeRepeatableMaster", "createWeeklyRepeatableCopy", "generateVisibleRecurringInstances",
    "toggleChecklistOpen", "toggleChecklistItem", "addChecklistItem", "removeChecklistItem", "reorderChecklistItem",
    "setTaskCompleted", "updateTaskTitle", "updateChecklistItem", "saveSeriesChanges", "deleteRepeatableSeries", "consumeStagedQueue"];
  const legacy = vm.runInNewContext(`(() => {
    ${declarations}
    savePlanner = () => {};
    renderTaskPool = renderWeekGrid = renderRepeatablePanel = renderAdhocChecklistModal = renderMiniCalendar = () => {};
    hideCuratedWarning = showCuratedWarning = () => {};
    return { ${names.join(",")} };
  })()`, sandbox);
  return { service, controller, environment, sandbox, legacy };
}

function comparable(state) {
  const legacySeries = (item) => {
    const { interval, weekdays, ...rest } = item;
    void interval;
    void weekdays;
    return rest;
  };
  return clone({ planner: state.planner, curatedTasks: state.curatedTasks,
    overrides: [...state.repeatableOverrideMap.entries()].map(([id, item]) => [id, legacySeries(item)]),
    repeatableTasks: state.repeatableTasks.map(legacySeries) });
}

test("weekly moves, completion, checklists and ad-hoc removal match legacy transitions", async () => {
  const initial = { weekStartDate: "2026-10-19", tasks: [
    { id: "curated-p1-2026-10-19", taskId: "curated-p1-2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Fixture", type: "curated", source: "home", checklist: [
      { id: "c1", text: "One", completed: false }, { id: "c2", text: "Two", completed: false },
    ] },
  ] };
  const { controller, sandbox, legacy } = await setup(initial);
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
      const random = Math.random;
      const now = Date.now;
      Math.random = () => 0.125;
      Date.now = () => 1792645128000;
      try { legacy[name](...args); controller.actions[name](...args); }
      finally { Math.random = random; Date.now = now; }
      assert.deepEqual(comparable(controller.getSnapshot()), comparable(sandbox.state), name);
    }
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
    const { controller, sandbox, legacy } = await setup(initial, [{ id: "r1", title: "Series", source: "repeating", metadata: { recurrence: "weekly" } }]);
    try {
      const values = { recurrence: "monthly", baseDay: "Tuesday", monthWeek: "last", baseBucket: "Evening", applyScope: scope };
      legacy.saveSeriesChanges(sandbox.state.repeatableTasks[0], sandbox.state.planner.tasks[0], values);
      controller.actions.saveSeries(initial.tasks[0].id, values);
      assert.deepEqual(comparable(controller.getSnapshot()), comparable(sandbox.state), scope);
      assert(controller.getSnapshot().planner.tasks.some((item) => item.id === "exception" && item.overridden));
      legacy.deleteRepeatableSeries(sandbox.state.repeatableTasks[0]);
      controller.actions.deleteSeries(controller.getSnapshot().planner.tasks.find((item) => item.parentRepeatableId === "r1").id);
      assert.deepEqual(comparable(controller.getSnapshot()), comparable(sandbox.state), `${scope} deletion`);
      await controller.flush();
    } finally { controller.destroy(); }
  }
});

test("moving/deleting an instance retains identity and suppresses regeneration", async () => {
  const initial = { weekStartDate: "2026-10-19", tasks: [
    { id: "repeatable-r1-2026-10-19", parentRepeatableId: "r1", occurrenceDate: "2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Series", type: "repeatable", source: "repeating" },
  ] };
  const { controller, sandbox, legacy } = await setup(initial, [{ id: "r1", title: "Series", source: "repeating", metadata: {} }]);
  try {
    for (const [name, args] of [["moveTask", [initial.tasks[0].id, "2026-10-22", "evening"]], ["removeTask", [initial.tasks[0].id]], ["generateVisibleRecurringInstances", []]]) {
      legacy[name](...args);
      controller.actions[name](...args);
      assert.deepEqual(comparable(controller.getSnapshot()), comparable(sandbox.state), name);
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
    global.fetch = async () => ({ ok: true, json: async () => { throw new Error("Invalid response"); } });
    await assert.rejects(controller.actions.reminder("adhoc-fixture", "send", "10", "09:00"), /Invalid response/);
    assert(!controller.getSnapshot().planner.tasks[0].reminder?.active);
    assert.match(controller.getSnapshot().status, /Invalid response/);
    assert(logged.mock.calls.length > 0);
  } finally { controller.destroy(); }
});

test("calendar and reminder contracts retain legacy week boundaries and bucket times", async () => {
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

test("staging deduplication, curated limit and repeatable scheduling match legacy", async () => {
  const curated = Array.from({ length: 7 }, (_, index) => ({ taskId: `p${index}`, projectId: `p${index}`, title: `Project ${index}`, source: "home" }));
  const queue = [
    { taskId: "p0", projectId: "p0", title: "Updated staged project", source: "home" },
    { taskId: "p7", projectId: "p7", title: "Eighth project", source: "home" },
    { taskId: "p8", projectId: "p8", title: "Over limit", source: "home" },
    { taskId: "r1", projectId: "r1", title: "Staged repeatable", source: "repeating", recurrence: "biweekly" },
  ];
  const { controller, sandbox, legacy, environment } = await setup({ weekStartDate: "2026-10-19", tasks: [] }, [], { hm_planner_curated_tasks: curated });
  try {
    environment.local.set("hm_weekly_planner_queue", JSON.stringify(queue));
    legacy.consumeStagedQueue();
    environment.local.set("hm_weekly_planner_queue", JSON.stringify(queue));
    await controller.actions.consumeStagedQueue();
    assert.deepEqual(comparable(controller.getSnapshot()), comparable(sandbox.state));
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
