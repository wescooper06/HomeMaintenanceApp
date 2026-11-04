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

test("Planner meal dates retain four-digit early years and the existing week helpers never remap years 1-99 to 1900", async () => {
  const service = await servicePromise;
  for (const date of ["0001-01-01", "0099-02-28", "0100-03-01", "2000-02-29", "9999-12-31"]) {
    assert.equal(service.toDateKey(service.parseDateKey(date)), date);
  }
  assert.equal(service.getWeekStartISO("0001-01-01"), "0001-01-01");
  assert.equal(service.getWeekDateKey("0001-01-01", 6), "0001-01-07");
});

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
  const taskList = (node) => [node, ...node.children.flatMap((child) => child && typeof child === "object" ? [child, ...child.children.flat(Infinity)] : [])]
    .find((child) => child?.props?.className === "slot-task-list");
  let tree = DaySlot(props);
  assert.equal(tree.children.find((child) => child?.type === "section" && child.props.className === "slot-task-region").props["aria-label"], "Morning tasks");
  assert.equal(tree.children.some((child) => child?.props?.["data-meal-period"]), false, "DaySlot contains no Meal regions");
  let card = taskList(tree).children[0];
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
  assert.match(taskList(tree).children[0].props.className, /insert-after/);
  tree.props.onDrop(event(250));
  assert.equal(calls.at(-1).length, 4, "Container background/end uses default append");
  assert.equal(ended, 3);
  drag.drag = { kind: "checklist-reorder", taskId: "A", checklistId: "check" };
  tree = DaySlot(props);
  card = taskList(tree).children[0];
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

test("shared Repeatable checklist UI retains checklist actions and exposes supported reorder controls", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Planner", "components", "Checklist.jsx");
  const input = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function").replace(/^export /gm, "");
  const { code } = await transformWithOxc(input, file, { jsx: { runtime: "classic", pragma: "element" } });
  const calls = [];
  const styles = new Proxy({}, { get: (_, key) => key });
  const component = vm.runInNewContext(`(() => { ${code}; return { ChecklistAction, ChecklistBody, ChecklistItem }; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState: () => ["Occurrence-only item", () => {}],
    useRef: () => ({ current: null }),
    useChecklistReorder: () => ({ drag: null, busy: false, status: "", move() {} }),
    normalizeChecklist: (items) => Array.isArray(items) ? items : [],
    usePlanner: () => ({ actions: new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) }) }),
    usePlannerDrag: () => ({ drag: null, dropTarget: "", start() {}, target() {}, end() {}, leave() {} }),
    InlinePlannerText: (props) => ({ type: "inline-text", props, children: [] }),
    styles,
  });
  const nodes = (node) => !node || typeof node !== "object" ? []
    : [node, ...(node.children || []).flatMap(nodes)];
  const task = { id: "repeatable-occurrence", taskType: "repeatable", type: "repeatable",
    checklist: [], checklistOpen: true };
  const toggle = component.ChecklistAction({ task, day: "mon", slot: "morning" });
  assert.equal(toggle.props["data-action"], "checklist-open");
  toggle.props.onClick();
  assert.deepEqual(calls.pop(), ["openChecklist", task.id, "mon", "morning"]);

  const emptyBody = component.ChecklistBody({ task, day: "mon", slot: "morning" });
  assert(nodes(emptyBody).some((node) => node.children?.includes("No sub-tasks yet.")));
  const inputNode = nodes(emptyBody).find((node) => node.props["data-action"] === "checklist-add-input");
  const addButton = nodes(emptyBody).find((node) => node.props["data-action"] === "checklist-item-add");
  assert(inputNode);
  assert(addButton);
  inputNode.props.onChange({ target: { value: "Occurrence-only item" } });
  addButton.props.onClick();

  const item = { id: "check-1", text: "Occurrence-only item", completed: false };
  const repeatableItem = component.ChecklistItem({ item, index: 0, count: 2, reorder: { busy: false },
    task: { ...task, checklist: [item] },
    day: "mon", slot: "morning" });
  const repeatableNodes = nodes(repeatableItem);
  assert(repeatableNodes.some((node) => node.props["data-action"] === "checklist-drag-handle"));
  const checkbox = repeatableNodes.find((node) => node.props["data-action"] === "checklist-item-toggle");
  checkbox.props.onChange({ target: { checked: true } });
  const editableText = repeatableNodes.find((node) => node.props.label === "Sub-task name");
  editableText.props.onSave("Edited occurrence item");
  const remove = repeatableNodes.find((node) => node.props["data-action"] === "checklist-item-remove");
  remove.props.onClick();
  assert.deepEqual(calls, [
    ["addChecklistItem", task.id, "mon", "morning", "Occurrence-only item"],
    ["toggleChecklistItem", task.id, "mon", "morning", item.id, true],
    ["updateChecklistItem", task.id, item.id, "Edited occurrence item"],
    ["removeChecklistItem", task.id, "mon", "morning", item.id],
  ]);

  const projectItem = component.ChecklistItem({ item, count: 2, index: 0, reorder: { busy: false }, task: { ...task, id: "project-item",
    taskType: "curated", type: "curated" }, day: "mon", slot: "morning" });
  assert(nodes(projectItem).some((node) => node.props["data-action"] === "checklist-drag-handle"));
});

async function popupComponents(file, names, context = {}) {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const filename = path.join(root, "src", "pages", "Planner", "components", file);
  const componentSource = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function").replace(/^export /gm, "");
  const { code } = await transformWithOxc(componentSource, filename, {
    jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" },
  });
  return vm.runInNewContext(`(() => { ${code}; return { ${names} }; })()`, {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    fragment: "fragment", styles: new Proxy({}, { get: (_, key) => key }),
    useState: (initial) => [initial, () => {}], useRef: () => ({ current: null }),
    useEffect: () => {}, ...context,
  });
}
const popupNodes = (node) => !node || typeof node !== "object" ? []
  : [node, ...(node.children || []).flatMap(popupNodes)];

test("each checklist type exposes only a direct-row pointer/touch/keyboard handle and no move arrows", async () => {
  const calls = [];
  const reorder = Object.fromEntries(["start", "pointerMove", "finish", "cancel", "handleKey"]
    .map((name) => [name, (...args) => calls.push([name, ...args])]));
  const { ChecklistItem, ChecklistBody } = await popupComponents("Checklist.jsx", "ChecklistItem, ChecklistBody", {
    usePlanner: () => ({ actions: {} }), normalizeChecklist: (items) => items || [],
    useChecklistReorder: () => ({ ...reorder, busy: false, status: "" }), InlinePlannerText: "inline-text",
  });
  for (const type of ["curated", "project", "repeatable", "adhoc"]) {
    const item = { id: "B", text: "Pay utility bill", completed: true };
    const task = { id: type, type, taskType: type, checklist: [item] };
    const render = (count) => ChecklistItem({ item, task, index: 1, count,
      reorder: { ...reorder, busy: false }, day: "mon", slot: "morning", adhoc: type === "adhoc" });
    const row = render(3), controls = popupNodes(row);
    const handles = controls.filter((node) => node.props["data-action"] === "checklist-drag-handle");
    assert.equal(handles.length, 1);
    const handle = handles[0];
    assert(row.children.includes(handle), "no reserved wrapper/grid surrounds the handle");
    assert.equal(handle.type, "button");
    assert.equal(handle.props.disabled, undefined);
    assert.equal(handle.props["aria-label"], "Reorder Pay utility bill");
    assert.match(handle.props.title, /arrow keys/);
    assert(!controls.some((node) => /checklist-move-(up|down)/.test(node.props["data-action"] || "")));
    assert.equal(controls.filter((node) => node.type === "button").length, 2, "only handle and remove buttons");
    for (const pointerType of ["mouse", "touch"]) {
      const event = { pointerType };
      handle.props.onPointerDown(event);
      assert.deepEqual(calls.pop(), ["start", event, item.id]);
      handle.props.onPointerMove(event);
      assert.deepEqual(calls.pop(), ["pointerMove", event]);
      handle.props.onPointerUp(event);
      assert.deepEqual(calls.pop(), ["finish", event]);
    }
    for (const key of ["ArrowDown", "ArrowUp"]) {
      const event = { key };
      handle.props.onKeyDown(event);
      assert.deepEqual(calls.pop(), ["handleKey", event, 1]);
    }
    assert.equal(handle.props.onPointerCancel, reorder.cancel);
    assert.equal(handle.props.onLostPointerCapture, reorder.cancel);
    assert(!popupNodes(render(1)).some((node) => node.props["data-action"] === "checklist-drag-handle"));
    const empty = ChecklistBody({ task: { ...task, checklist: [] }, day: "mon", slot: "morning" });
    assert(!popupNodes(empty).some((node) => node.props["data-action"] === "checklist-drag-handle"));
    assert(popupNodes(empty).some((node) => node.children.includes("No sub-tasks yet.")));
  }
});

test("all scheduled types share a neutral/active checklist action, named dialog and capability-aware editor", async () => {
  const service = await servicePromise;
  const calls = [];
  const snapshot = { confirmations: {}, error: "" };
  const actions = new Proxy({}, { get: (_, name) => (...args) => {
    calls.push([name, ...args]); return name === "getTaskProject" ? null : true;
  } });
  const dialogCalls = [];
  const context = {
    usePlanner: () => ({ snapshot, actions }), normalizeChecklist: service.normalizeChecklist,
    usePlannerDrag: () => ({ drag: null, dropTarget: "", end() {}, leave() {} }),
    usePlannerDialog: (...args) => dialogCalls.push(args), InlinePlannerText: "inline-text",
    useChecklistReorder: () => ({ drag: null, busy: false, status: "", move() {} }),
  };
  const { ChecklistAction, ChecklistModal, ChecklistBody, ChecklistItem } = await popupComponents(
    "Checklist.jsx", "ChecklistAction, ChecklistModal, ChecklistBody, ChecklistItem", context);
  const { WeeklyTaskCard } = await popupComponents("ProjectCard.jsx", "WeeklyTaskCard", {
    ...context, ChecklistAction, cleanText: service.cleanText, getWeeklyTaskType: service.getWeeklyTaskType,
    parseResourceLinkEntries: service.parseResourceLinkEntries, parseWeeklySourceId: service.parseWeeklySourceId,
  });
  for (const type of ["curated", "project", "repeatable", "adhoc"]) {
    const task = { id: type, title: `Task ${type}`, type, taskType: type, checklist: [], checklistOpen: true };
    const card = WeeklyTaskCard({ task, day: "mon", slot: "morning" });
    assert.equal(popupNodes(card).filter((node) => node.type === ChecklistAction).length, 1);
    assert(!popupNodes(card).some((node) => node.type === ChecklistBody));
    let action = ChecklistAction({ task, day: "mon", slot: "morning" });
    const checklistIcon = popupNodes(action).find((node) => node.type === "svg");
    assert(checklistIcon);
    assert.equal(checklistIcon.props.viewBox, "0 0 24 24");
    assert.equal(checklistIcon.props["aria-hidden"], "true");
    assert.equal(checklistIcon.props.focusable, "false");
    assert(!popupNodes(action).some((node) => node.children.includes("checklist")));
    const move = popupNodes(card).find((node) => node.props["data-action"] === "task-move");
    assert.equal(move.props["aria-label"], "Move Task");
    assert.equal(move.type, "button");
    const moveIcon = popupNodes(move).find((node) => node.type === "svg");
    assert(moveIcon);
    assert.equal(moveIcon.props["aria-hidden"], "true");
    assert.equal(moveIcon.props.focusable, "false");
    assert(!popupNodes(move).some((node) => node.children.includes("calendar_month")));
    move.props.onClick();
    assert.deepEqual(calls.pop(), ["openMove", type]);
    assert(!action.props.className.includes("has-checklist-items"));
    assert.match(action.props["aria-label"], /0 of 0 sub-tasks complete/);
    assert.equal(action.props["aria-haspopup"], "dialog");
    action.props.onClick();
    assert.deepEqual(calls.pop(), ["openChecklist", type, "mon", "morning"]);
    const item = { id: "one", text: "Named item", completed: true };
    task.checklist = [item];
    action = ChecklistAction({ task, day: "mon", slot: "morning" });
    assert(action.props.className.includes("has-checklist-items"));
    assert.match(action.props["aria-label"], /1 of 1 sub-tasks complete/);
    const dialog = ChecklistModal({ task, day: "mon", slot: "morning" });
    assert.equal(dialog.props.role, "dialog");
    assert.equal(dialog.props["aria-labelledby"], "checklist-modal-title checklist-modal-task-title");
    assert(popupNodes(dialog).some((node) => node.children.includes(task.title)));
    const body = popupNodes(dialog).find((node) => node.type === ChecklistBody);
    assert.equal(body.props.adhoc, type === "adhoc");
    const renderedItem = ChecklistItem({ item, index: 0, count: 2, reorder: { busy: false },
      task, day: "mon", slot: "morning", adhoc: body.props.adhoc });
    const nodes = popupNodes(renderedItem);
    assert.equal(nodes.some((node) => node.props["data-action"] === "checklist-drag-handle"), true);
    assert.equal(nodes.find((node) => node.type === "input").props["aria-label"], item.text);
    assert.equal(nodes.find((node) => node.props["aria-label"] === `Remove ${item.text}`).props["aria-label"], `Remove ${item.text}`);
    assert.equal(nodes.find((node) => node.type === "inline-text").props.editable, true);
    task.checklist = [];
    assert(!ChecklistAction({ task, day: "mon", slot: "morning" }).props.className.includes("has-checklist-items"));
  }
  assert(dialogCalls.every((call) => call[3].isolate));
  snapshot.error = "Changed in another session";
  const errorDialog = ChecklistModal({ task: { id: "failed", checklist: [] }, day: "mon", slot: "morning" });
  assert(popupNodes(errorDialog).some((node) => node.props.role === "alert"));
  assert.equal(popupNodes(errorDialog).find((node) => node.type === "fieldset").props.disabled, true);
});

test("popup owner selection resolves current identity/location and excludes deleted or invisible owners", async () => {
  const { selectChecklistOwner } = await servicePromise;
  const task = { id: "owner", type: "repeatable", date: "2026-11-02", timeSlot: "morning" };
  const snapshot = { activeChecklistTaskId: task.id, planner: { weekStartDate: "2026-11-02", tasks: [task] } };
  assert.equal(selectChecklistOwner(snapshot).task, task);
  task.date = "2026-11-03";
  task.timeSlot = "evening";
  assert.equal(selectChecklistOwner(snapshot).day, "tue");
  assert.equal(selectChecklistOwner(snapshot).slot, "evening");
  for (const property of ["deleted", "deletedInstance"]) {
    task[property] = true;
    assert.equal(selectChecklistOwner(snapshot), null);
    task[property] = false;
  }
  task.date = "2026-11-09";
  assert.equal(selectChecklistOwner(snapshot), null);
  snapshot.planner.tasks = [];
  assert.equal(selectChecklistOwner(snapshot), null);
});

test("popup ownership is singular, transient and blocks conflicting background actions without visibility writes", async () => {
  const tasks = ["curated", "repeatable", "adhoc"].map((type) => ({
    id: type, type, taskType: type, title: type, date: "2026-11-02", timeSlot: "morning", checklist: [],
  }));
  const { controller, environment } = await setup({ weekStartDate: "2026-11-02", tasks });
  try {
    const baseline = environment.writes.length;
    for (const task of tasks) {
      controller.actions.openChecklist(task.id, "mon", "morning");
      assert.equal(controller.getSnapshot().activeChecklistTaskId, task.id);
    }
    assert.equal(environment.writes.length, baseline);
    controller.actions.addChecklistItem("adhoc", "mon", "morning", "Persisted Ad-Hoc");
    await controller.flush();
    controller.actions.closeChecklist();
    assert.equal(controller.getSnapshot().activeChecklistTaskId, "");
    controller.actions.openChecklist("repeatable", "mon", "morning");
    assert.throws(() => controller.actions.addChecklistItem("adhoc", "mon", "morning", "Wrong owner"), /owner/);
    assert.throws(() => controller.actions.addChecklistItem("repeatable", "tue", "morning", "Stale location"), /moved/);
    controller.actions.setDrag({ kind: "checklist-reorder", taskId: "repeatable" });
    assert.throws(() => controller.actions.moveTask("repeatable", "2026-11-03", "evening"), /Close the checklist/);
    assert.throws(() => controller.actions.removeTask("repeatable"), /Close the checklist/);
    assert.throws(() => controller.actions.shiftPlannerWeek(7), /Close the checklist/);
    assert.throws(() => controller.actions.setDrag({ kind: "weekly-move", taskId: "repeatable" }), /Only the active checklist/);
    controller.actions.closeChecklist();
    assert.throws(() => controller.actions.updateChecklistItem("missing", "one", "Stale callback"), /missing or deleted/);
    const saved = clone(controller.getSnapshot().planner);
    controller.destroy();
    const reloaded = await setup(saved);
    try {
      assert.equal(reloaded.controller.getSnapshot().activeChecklistTaskId, "");
      assert.equal(reloaded.controller.getSnapshot().planner.tasks.find((task) => task.id === "adhoc").checklist[0].text, "Persisted Ad-Hoc");
    } finally { reloaded.controller.destroy(); }
  } finally { controller.destroy(); }
});

test("central footer renders one keyed popup using the latest resolved owner", async () => {
  const service = await servicePromise;
  const snapshot = { planner: { weekStartDate: "2026-11-02", tasks: [
    { id: "a", type: "adhoc", date: "2026-11-02", timeSlot: "morning" },
    { id: "b", type: "repeatable", date: "2026-11-03", timeSlot: "evening" },
  ] }, activeChecklistTaskId: "a" };
  const { PlannerFooter } = await popupComponents("PlannerFooter.jsx", "PlannerFooter", {
    usePlanner: () => ({ snapshot, actions: {} }), selectChecklistOwner: service.selectChecklistOwner,
    createPortal: (child) => child, document: { body: {} }, ChecklistModal: "checklist-modal",
  });

  test("checklist dialog hook isolates background, traps focus, handles Escape and restores origin/fallback", async () => {
    const listeners = new Map();
    let cleanup, closed = 0, focused, stableGutter = false;
    const control = () => ({
      isConnected: true, getClientRects: () => [1], closest: () => null,
      focus() { documentMock.activeElement = this; focused = this; },
    });
    const first = control(), last = control(), origin = control(), fallback = control();
    const rootElement = { inert: false };
    const dialog = { querySelector: () => first, querySelectorAll: () => [first, last] };
    const documentMock = {
      activeElement: origin, body: { style: { overflow: "", paddingRight: "" } },
      documentElement: { clientWidth: 1000 },
      getElementById: (id) => id === "root" ? rootElement : origin.isConnected ? origin : null,
      querySelector: () => fallback,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    };
    const { usePlannerDialog } = await popupComponents("usePlannerDialog.js", "usePlannerDialog", {
      useEffect: (effect) => { cleanup = effect(); }, document: documentMock,
      window: { innerWidth: 1015, addEventListener() {}, removeEventListener() {} },
      getComputedStyle: () => ({ paddingRight: "0px", scrollbarGutter: stableGutter ? "stable" : "auto" }),
    });
    const open = () => usePlannerDialog({ current: dialog }, () => { closed += 1; }, "button", {
      isolate: true, returnFocusId: "origin",
    });
    open();
    assert.equal(rootElement.inert, true);
    assert.equal(documentMock.body.style.overflow, "hidden");
    assert.equal(documentMock.body.style.paddingRight, "15px");
    assert.equal(focused, first);
    const event = (key, shiftKey = false) => ({ key, shiftKey, target: { matches: () => false },
      preventDefault() {}, stopImmediatePropagation() {} });
    documentMock.activeElement = last;
    listeners.get("keydown")(event("Tab"));
    assert.equal(focused, first);
    listeners.get("keydown")(event("Tab", true));
    assert.equal(focused, last);
    listeners.get("keydown")(event("Escape"));
    assert.equal(closed, 1);
    listeners.get("keydown")({ ...event("Escape"), target: { matches: () => true } });
    assert.equal(closed, 1, "inline editor receives Escape to cancel before dialog closes");
    cleanup();
    assert.equal(rootElement.inert, false);
    assert.equal(documentMock.body.style.overflow, "");
    assert.equal(focused, origin);
    open();
    origin.isConnected = false;
    cleanup();
    assert.equal(focused, fallback);
    stableGutter = true;
    open();
    assert.equal(documentMock.body.style.paddingRight, "", "existing stable gutter must not be compensated twice");
    cleanup();
  });

  test("checklist text provides a semantic touch/keyboard edit action with save and cancel", async () => {
    const state = [];
    const refs = [];
    let cursor = 0, refCursor = 0;
    const saved = [];
    const { InlinePlannerText } = await popupComponents("InlinePlannerText.jsx", "InlinePlannerText", {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
      useRef: (initial) => { const index = refCursor++; return refs[index] ||= { current: initial }; },
      useCallback: (callback) => callback,
    });

    test("shared checklist Pointer Events support targeting, cancel, keyboard and failed-save cleanup", async () => {
      const hookState = [], hookRefs = [];
      let hookCursor = 0, hookRefCursor = 0, callback;
      const calls = [], effects = [];
      const handle = { captured: false, focus() {}, setPointerCapture() { this.captured = true; },
        hasPointerCapture() { return this.captured; }, releasePointerCapture() { this.captured = false; } };
      const rows = ["A", "B", "C"].map((id, index) => ({
        dataset: { checklistId: id }, getBoundingClientRect: () => ({ top: index * 50, bottom: index * 50 + 48, height: 48 }),
        querySelector: () => handle,
      }));
      const viewport = { scrollTop: 0, getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 150 }) };
      let editing = false, fail = false;
      const listRef = { current: {
        closest: () => viewport, querySelectorAll: () => rows, querySelector: () => editing ? {} : null,
      } };
      const task = { id: "owner", checklist: rows.map((row) => ({ id: row.dataset.checklistId })) };
      const { useChecklistReorder } = await popupComponents("useChecklistReorder.js", "useChecklistReorder", {
        useState: (initial) => {
          const index = hookCursor++;
          if (!(index in hookState)) hookState[index] = initial;
          return [hookState[index], (value) => { hookState[index] = value; }];
        },
        useRef: (initial) => { const index = hookRefCursor++; return hookRefs[index] ||= { current: initial }; },
        useCallback: (fn) => fn,
        useEffect: (fn) => effects.push(fn),
        usePlanner: () => ({ snapshot: {}, actions: { reorderChecklistItem: async (...args) => {
          calls.push(args); if (fail) throw new Error("Newer revision"); return true;
        } } }),
        document: { activeElement: { isConnected: false } },
        requestAnimationFrame: (fn) => { callback = fn; return 1; }, cancelAnimationFrame: () => {},
        console: { warn() {} },
      });
      const render = () => { hookCursor = 0; hookRefCursor = 0; return useChecklistReorder({ task, day: "mon", slot: "morning", listRef }); };
      let reorder = render();
      effects.forEach((effect) => effect());
      const event = (x, y) => ({ button: 0, pointerId: 7, clientX: x, clientY: y,
        currentTarget: handle, preventDefault() {}, stopPropagation() {} });
      reorder.start(event(20, 125), "C");
      reorder.pointerMove(event(100, 20));
      reorder = render();
      assert.deepEqual(clone(reorder.drag), { fromId: "C", toId: "A", placement: "before" });
      reorder.finish(event(100, 20));
      await new Promise(setImmediate);
      assert.deepEqual(calls.pop(), ["owner", "mon", "morning", "C", "A", "before"]);
      reorder = render();
      assert.equal(reorder.drag, null);
      assert.equal(handle.captured, false);
      assert.match(reorder.status, /saved/);
      reorder.handleKey({ key: "ArrowDown", preventDefault() {}, stopPropagation() {} }, 0);
      await new Promise(setImmediate);
      assert.deepEqual(calls.pop(), ["owner", "mon", "morning", "A", "B", "after"]);
      reorder = render();
      reorder.start(event(20, 20), "A");
      reorder.pointerMove(event(100, 140));
      reorder.finish(event(100, 140));
      await new Promise(setImmediate);
      assert.deepEqual(calls.pop(), ["owner", "mon", "morning", "A", "C", "after"], "pointer can move an item to the end");
      reorder = render();
      reorder.start(event(20, 125), "C");
      reorder.pointerMove(event(100, 145));
      callback();
      assert(viewport.scrollTop > 0);
      reorder.cancel();
      assert.equal(render().drag, null);
      reorder = render();
      reorder.start(event(20, 125), "C");
      reorder.pointerMove(event(400, 20));
      reorder.finish(event(400, 20));
      assert.equal(calls.length, 0, "outside drop cannot mutate");
      editing = true;
      await render().move("A", "C");
      assert.equal(calls.length, 0, "reorder cannot save an unrelated editing draft");
      editing = false; fail = true;
      await render().move("C", "A");
      assert.match(render().status, /not saved.*Newer revision/);
      assert.equal(render().busy, false);
      fail = false;
      reorder = render();
      reorder.start(event(20, 125), "C");
      reorder.pointerMove(event(100, 20));
      task.checklist = task.checklist.filter((item) => item.id !== "C");
      render();
      effects.at(-1)();
      assert.equal(render().drag, null, "source removal cancels captured gesture");
      assert.equal(handle.captured, false);
    });
    const render = () => {
      cursor = 0; refCursor = 0;
      return InlinePlannerText({ text: "Original", label: "Sub-task name", editable: true,
        onSave: (value) => saved.push(value) });
    };
    let tree = render();
    const button = popupNodes(tree).find((node) => node.type === "button");
    assert.equal(button.props["aria-label"], "Edit Original");
    button.props.onClick({ preventDefault() {} });
    tree = render();
    let input = popupNodes(tree).find((node) => node.type === "input");
    assert(input);
    input.props.onChange({ target: { value: "Edited" } });
    input = popupNodes(render()).find((node) => node.type === "input");
    input.props.onKeyDown({ key: "Enter", nativeEvent: {}, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(saved, ["Edited"]);
    popupNodes(render()).find((node) => node.type === "button").props.onClick({ preventDefault() {} });
    input = popupNodes(render()).find((node) => node.type === "input");
    input.props.onKeyDown({ key: "Escape", nativeEvent: {}, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(saved, ["Edited"]);
  });
  let modals = popupNodes(PlannerFooter()).filter((node) => node.type === "checklist-modal");
  assert.equal(modals.length, 1);
  assert.equal(modals[0].props.key, "a");
  snapshot.activeChecklistTaskId = "b";
  modals = popupNodes(PlannerFooter()).filter((node) => node.type === "checklist-modal");
  assert.equal(modals.length, 1);
  assert.equal(modals[0].props.key, "b");
  assert.equal(modals[0].props.day, "tue");
  snapshot.planner.tasks[1].deletedInstance = true;
  assert.equal(popupNodes(PlannerFooter()).filter((node) => node.type === "checklist-modal").length, 0);
});
