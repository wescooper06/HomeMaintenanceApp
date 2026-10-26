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
      const previous = JSON.parse(localStorage.getItem("hm_repeatable_tasks") || "[]");
      const byProject = new Map(previous.map((item) => [item.projectId, item]));
      args[0].forEach((item) => byProject.set(item.projectId, item));
      localStorage.setItem("hm_repeatable_tasks", JSON.stringify([...byProject.values()]));
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
const repeatableId = "11111111-1111-4111-8111-111111111111";

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

test("weekly sort uses valid positions then deterministic IDs without mutating older records", async () => {
  const { sortWeeklyTasks } = await servicePromise;
  const tasks = [
    { id: "z", metadata: {} }, { id: "a", metadata: { weeklyPosition: "0" } },
    { id: "n", metadata: { weeklyPosition: -1 } }, { id: "f", metadata: { weeklyPosition: 1.5 } },
    { id: "p2", metadata: { weeklyPosition: 1 } }, { id: "p1", metadata: { weeklyPosition: 0 } },
    { id: "p0", metadata: { weeklyPosition: 0 } }, { id: "i", metadata: { weeklyPosition: Infinity } },
  ];
  const before = tasks.map((task) => task.id);
  assert.deepEqual(sortWeeklyTasks(tasks).map((task) => task.id), ["p0", "p1", "p2", "a", "f", "i", "n", "z"]);
  assert.deepEqual(tasks.map((task) => task.id), before);
});

test("same-title Repeatable cards render and drag by distinct project identities", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Planner", "components", "ProjectCard.jsx");
  const componentSource = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function").replace(/^export /gm, "");
  const { code } = await transformWithOxc(componentSource, file, { jsx: { runtime: "classic", pragma: "element" } });
  const drags = [], removals = [];
  const RepeatableCard = vm.runInNewContext(`(() => { ${code}; return RepeatableCard; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    usePlanner: () => ({ actions: { removeRepeatableMaster: (id) => removals.push(id) } }),
    usePlannerDrag: () => ({ start: (_, payload) => drags.push(clone(payload)), end() {} }),
    styles: new Proxy({}, { get: (_, key) => key }),
  });
  const ids = [repeatableId, "33333333-3333-4333-8333-333333333333"];
  const trees = ids.map((projectId) => RepeatableCard({ task: {
    id: projectId, projectId, taskId: `master-${projectId}`, title: "Same title",
  } }));
  trees.forEach((tree, index) => {
    assert.equal(tree.props["data-repeatable-project-id"], ids[index]);
    assert.equal(tree.children[1].children[0], "Same title");
    tree.children[0].props.onDragStart({});
  });
  assert.deepEqual(drags, ids.map((projectId) => ({ kind: "repeatable-copy", projectId })));
  trees[0].children[2].props.onClick();
  assert.deepEqual(removals, [ids[0]]);
});

test("Project cards distinguish ordinary continuation from explicitly starting fresh", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const service = await servicePromise;
  const file = path.join(root, "src", "pages", "Planner", "components", "ProjectCard.jsx");
  const componentSource = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function").replace(/^export /gm, "");
  const { code } = await transformWithOxc(componentSource, file, { jsx: { runtime: "classic", pragma: "element" } });
  const calls = [];
  const ProjectCard = vm.runInNewContext(`(() => { ${code}; return ProjectCard; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState: (initial) => [initial, () => {}],
    usePlanner: () => ({ actions: { assignTask: (...args) => calls.push(clone(args)) } }),
    usePlannerDrag: () => ({ drag: null, dropTarget: "" }),
    cleanText: service.cleanText, DAY_ORDER: service.DAY_ORDER, SLOT_ORDER: service.SLOT_ORDER,
    styles: new Proxy({}, { get: (_, key) => key }),
  });
  const buttons = (node) => !node || typeof node !== "object" ? []
    : [...(node.type === "button" ? [node] : []), ...node.children.flatMap(buttons)];
  const task = { taskId: "master", title: "Project", projectId: "project", source: "misc" };
  let rendered = buttons(ProjectCard({ task, index: 0, globalIndex: 0 }));
  const continuation = rendered.find((button) => button.children.includes("Continue / assign"));
  continuation.props.onClick();
  assert.deepEqual(calls.pop(), ["master", "mon", "morning"]);
  assert.equal(rendered.find((button) => button.children.includes("Start fresh task")).props.disabled, true);
  rendered = buttons(ProjectCard({ task: { ...task, checklistTemplate: [] }, index: 0, globalIndex: 0 }));
  const fresh = rendered.find((button) => button.children.includes("Start fresh task"));
  assert.equal(fresh.props.disabled, false);
  fresh.props.onClick();
  assert.deepEqual(calls.pop(), ["master", "mon", "morning", { fresh: true }]);
});

test("restoration dialog distinguishes saved locations, explicit consent, pending and dismissible errors", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Planner", "components", "RestoreOccurrenceDialog.jsx");
  const input = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function");
  const { code } = await transformWithOxc(input, file, {
    jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" },
  });
  const snapshot = {
    restoreProposal: { title: "Synthetic series", occurrenceDate: "2026-11-11",
      date: "2026-11-11", timeSlot: "morning", requestedDate: "2026-11-11", requestedTimeSlot: "morning" },
    restoreBusy: false, restoreError: "",
  };
  let cancels = 0, restores = 0;
  const cancel = () => { cancels += 1; };
  const dialogCalls = [];
  const Dialog = vm.runInNewContext(`(() => { ${code}; return RestoreOccurrenceDialog; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    fragment: "fragment", useRef: () => ({ current: null }),
    usePlannerDialog: (...args) => dialogCalls.push(args),
    usePlanner: () => ({ snapshot, actions: { cancelRestore: cancel,
      restoreRepeatableOccurrence: async () => { restores += 1; } } }),
    styles: new Proxy({}, { get: (_, key) => key }), console,
  });
  const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...node.children.flatMap(nodes)];
  const text = (node) => !node ? "" : typeof node !== "object" ? String(node) : node.children.map(text).join(" ");
  let tree = Dialog();
  assert.equal(dialogCalls[0][1], cancel);
  assert.equal(dialogCalls[0][2], "[data-action='restore-cancel']");
  const find = (action) => nodes(tree).find((node) => node.props["data-action"] === action);
  assert.match(text(tree), /saved progress and checklist will be preserved/);
  find("restore-cancel").props.onClick();
  assert.equal(cancels, 1);
  assert.equal(restores, 0);
  find("restore-confirm").props.onClick();
  await Promise.resolve();
  assert.equal(restores, 1);
  snapshot.restoreProposal.date = "2026-11-12";
  snapshot.restoreProposal.timeSlot = "afternoon";
  tree = Dialog();
  assert.match(text(tree), /Restore at existing location/);
  assert.match(text(tree), /2026-11-12\s*,\s*afternoon/);
  assert.match(text(tree), /will not move the occurrence or change the repeatable schedule/);
  snapshot.restoreBusy = true;
  tree = Dialog();
  assert.equal(find("restore-confirm").props.disabled, true);
  assert.equal(find("restore-cancel").props.disabled, true);
  assert(nodes(tree).some((node) => node.props.role === "status"));
  snapshot.restoreBusy = false;
  snapshot.restoreError = "Reload Planner before making further changes.";
  tree = Dialog();
  assert.equal(find("restore-confirm").props.disabled, true);
  assert.equal(find("restore-cancel").props.disabled, false);
  assert(nodes(tree).some((node) => node.props.role === "alert"));
  assert.equal(nodes(tree).find((node) => node.props.role === "dialog").props["aria-modal"], "true");
});

test("weekly drop targets detect before/after/end and isolate checklist drags", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Planner", "components", "WeeklyGrid.jsx");
  const gridSource = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function").replace(/^export /gm, "");
  const { code } = await transformWithOxc(gridSource, file, { jsx: { runtime: "classic", pragma: "element" } });
  const calls = [], targets = [];
  const warnings = [];
  let dropOnSlot = (...args) => calls.push(clone(args));
  let ended = 0;
  const drag = {
    drag: { kind: "weekly-move", taskId: "C" }, dropTarget: "",
    target(event, key) { event.preventDefault(); event.stopPropagation(); targets.push(key); },
    end: () => { ended += 1; }, leave() {},
  };
  const DaySlot = vm.runInNewContext(`(() => { ${code}; return DaySlot; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    usePlanner: () => ({ actions: { dropOnSlot: (...args) => dropOnSlot(...args) } }),
    usePlannerDrag: () => drag, WeeklyTaskCard: () => {}, styles: new Proxy({}, { get: (_, key) => key }),
    console: { warn: (...args) => warnings.push(args) },
  });
  const props = { day: "mon", date: "2026-10-19", slot: "morning", label: "Morning", tasks: [{ id: "A" }] };
  const event = (clientY) => ({
    clientY, currentTarget: { getBoundingClientRect: () => ({ top: 100, height: 100 }) },
    preventDefault() {}, stopPropagation() {},
  });
  let tree = DaySlot(props);
  let card = tree.children[1].children[0];
  card.props.onDragOver(event(110));
  assert.equal(targets.at(-1), "slot:2026-10-19:morning:before:A");
  card.props.onDrop(event(110));
  assert.deepEqual(calls.at(-1).at(-1), { targetId: "A", side: "before" });
  card.props.onDragOver(event(190));
  assert.equal(targets.at(-1), "slot:2026-10-19:morning:after:A");
  card.props.onDrop(event(190));
  assert.deepEqual(calls.at(-1).at(-1), { targetId: "A", side: "after" });
  drag.dropTarget = targets.at(-1);
  tree = DaySlot(props);
  assert.match(tree.children[1].children[0].props.className, /insert-after/);
  tree.props.onDrop(event(250));
  assert.equal(calls.at(-1).length, 4, "Container background/end uses default append");
  assert.equal(ended, 3);
  drag.drag = { kind: "checklist-reorder", taskId: "A", checklistId: "check" };
  tree = DaySlot(props);
  card = tree.children[1].children[0];
  const before = calls.length, beforeTargets = targets.length;
  card.props.onDragOver(event(110));
  card.props.onDrop(event(110));
  tree.props.onDragOver(event(110));
  tree.props.onDrop(event(110));
  assert.equal(calls.length, before);
  assert.equal(targets.length, beforeTargets);
  assert.equal(ended, 3);
  drag.drag = { kind: "repeatable-copy", projectId: "repeatable-project" };
  for (const status of ["created", "already-scheduled", "existing-bucket", "moved", "previously-deleted"]) {
    dropOnSlot = (...args) => {
      calls.push(clone(args));
      return Promise.resolve({ status });
    };
    DaySlot(props).props.onDrop(event(250));
    assert.deepEqual(calls.at(-1), [drag.drag, "mon", "2026-10-19", "morning"]);
  }
  const failure = new Error("Placement persistence failed; controller displays the error");
  dropOnSlot = () => Promise.reject(failure);
  DaySlot(props).props.onDrop(event(250));
  await Promise.resolve();
  assert.equal(ended, 9, "Drag state clears for all async outcomes, including failure");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "Planner drop failed");
  assert.equal(warnings[0][1], failure);
});

test("existing Move Task dialog retains date-only behavior and offers the same slot destination as drag", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const modalFile = path.join(root, "src", "pages", "Planner", "components", "PlannerMoveTaskModal.jsx");
  const modalSource = fs.readFileSync(modalFile, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function");
  const { code } = await transformWithOxc(modalSource, modalFile, { jsx: { runtime: "classic", pragma: "element" } });
  let selectedSlot, moved = [], closed = 0;
  const calendar = () => {};
  const modal = vm.runInNewContext(`(() => { ${code}; return PlannerMoveTaskModal; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useRef: () => ({ current: null }),
    useState(initial) {
      if (selectedSlot === undefined) selectedSlot = initial;
      return [selectedSlot, (value) => { selectedSlot = value; }];
    },
    usePlanner: () => ({ actions: {
      moveTaskToDate: (...args) => { moved.push(args); return true; },
      closeMove: () => { closed += 1; },
    } }),
    usePlannerDialog: () => {}, parseDateKey: (date) => date,
    SLOT_ORDER: ["morning", "afternoon", "evening"], CalendarWidget: calendar, styles: {},
  });
  const task = { id: "stable-id", title: "Move me", date: "2026-10-19", timeSlot: "morning" };
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of node.children || []) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  let tree = modal({ task });
  assert(find(tree, (node) => node.props.role === "dialog"));
  assert.equal(find(tree, (node) => node.type === "h2").children[0], "Move Task");
  assert.equal(find(tree, (node) => node.type === "select").props.value, "morning");
  find(tree, (node) => node.type === calendar).props.onSelectDate("2026-10-20");
  assert.deepEqual(moved[0], ["stable-id", "2026-10-20", "morning"]);
  find(tree, (node) => node.type === "select").props.onChange({ target: { value: "afternoon" } });
  tree = modal({ task });
  find(tree, (node) => node.type === calendar).props.onSelectDate("2026-10-20");
  assert.deepEqual(moved[1], ["stable-id", "2026-10-20", "afternoon"]);
  assert.equal(closed, 2);
  const card = fs.readFileSync(path.join(root, "src", "pages", "Planner", "components", "ProjectCard.jsx"), "utf8");
  assert.match(card, /aria-label="Move Task" title="Move Task" onClick=\{\(\) => actions\.openMove\(task\.id\)\}/);
  assert.match(card, /kind: "weekly-move", taskId: task\.id/);
});

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
      { id: `repeatable-${repeatableId}-2026-10-19`, parentRepeatableId: repeatableId, occurrenceDate: "2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Series", type: "repeatable", source: "repeating", recurrence: "weekly" },
      { id: "exception", parentRepeatableId: repeatableId, occurrenceDate: "2026-10-12", date: "2026-10-20", timeSlot: "evening", title: "Moved", type: "repeatable", overridden: true, source: "repeating" },
      { id: "deleted", parentRepeatableId: repeatableId, occurrenceDate: "2026-10-26", date: "2026-10-26", timeSlot: "morning", title: "Deleted", type: "repeatable", deletedInstance: true, source: "repeating" },
    ] };
    const { controller } = await setup(initial, [{ id: repeatableId, title: "Series", source: "repeating", metadata: { recurrence: "weekly" } }]);
    try {
      const values = { recurrence: "monthly", baseDay: "Tuesday", monthWeek: "last", baseBucket: "Evening", applyScope: scope };
      controller.actions.saveSeries(initial.tasks[0].id, values);
      assert.equal(controller.getSnapshot().repeatableTasks[0].recurrence, "monthly");
      assert(controller.getSnapshot().planner.tasks.some((item) => item.id === "exception" && item.overridden));
      controller.actions.deleteSeries(controller.getSnapshot().planner.tasks.find((item) => item.parentRepeatableId === repeatableId).id);
      assert(controller.getSnapshot().planner.tasks.filter((item) => item.parentRepeatableId === repeatableId)
        .every((item) => item.deletedInstance || item.overridden), scope);
      await controller.flush();
    } finally { controller.destroy(); }
  }
});

test("moving/deleting an instance retains identity and suppresses regeneration", async () => {
  const initial = { weekStartDate: "2026-10-19", tasks: [
    { id: `repeatable-${repeatableId}-2026-10-19`, parentRepeatableId: repeatableId, occurrenceDate: "2026-10-19", date: "2026-10-19", timeSlot: "morning", title: "Series", type: "repeatable", source: "repeating" },
  ] };
  const { controller } = await setup(initial, [{ id: repeatableId, title: "Series", source: "repeating", metadata: {} }]);
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
    { taskId: repeatableId, projectId: repeatableId, title: "Staged repeatable", source: "repeating", recurrence: "biweekly" },
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
    responses[1]([{ id: repeatableId, title: "Current mount", source: "repeating", metadata: {} }]);
    await second;
    responses[0]([{ id: "old", title: "Stale mount", source: "repeating", metadata: {} }]);
    await first;
    assert.equal(controller.getSnapshot().repeatableTasks[0].projectId, repeatableId);
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
