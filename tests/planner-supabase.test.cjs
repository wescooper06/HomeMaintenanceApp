const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const clone = (value) => structuredClone(value);
const plain = (value) => JSON.parse(JSON.stringify(value));

function exportsFrom(file, names, context = {}) {
  const source = fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
  return vm.runInNewContext(`(() => {
    ${source.replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")}
    return { ${names.join(",")} };
  })()`, { structuredClone, console, crypto: require("node:crypto").webcrypto, ...context });
}
const { createPlannerDataAccess } = exportsFrom("src/services/plannerDataAccess.js", ["createPlannerDataAccess"]);
const { createPlannerSupabaseStorage } = exportsFrom("src/services/plannerSupabaseStorage.js",
  ["createPlannerSupabaseStorage"], { createPlannerDataAccess });

const p1 = "11111111-1111-4111-8111-111111111111";
const t1 = "22222222-2222-4222-8222-222222222222";
function fixture(extra = {}, cap = 2) {
  const tables = {
    projects_all: [{ id: p1, external_id: "import-42", project_type: "home",
      title: "Home fixture", category: "Repair", state: "Not Started", priority: "3", order: 1, metadata: {} }],
    projects_home: [{ id: p1, title: "Home fixture", category: "Repair", state: "Not Started",
      priority: "3", order: 1, metadata: { keep: true }, property: "House", resource_links: [] }],
    projects_vehicle: [], projects_repeating: [], projects_misc: [],
    planner_tasks: [{ id: t1, project_id: p1, title: "Imported task", source: "home",
      priority: 3, order: 1, metadata_json: { keep: true, queue: "curated", queueOrder: 2 } }],
    planner_weekly_tasks: [
      { id: "week-settings", metadata_json: { weekStartDate: "2026-10-19", keepSettings: true } },
      { id: "w1", project_id: p1, date: "2026-10-19", task_type: "curated",
        title: "Imported weekly", time_slot: "morning", metadata_json: {}, completed: false },
    ],
    planner_parking_lot: [{ id: "park1", title: "Imported idea", converted_to_type: true,
      converted_to_id: p1, metadata_json: { conversionType: "project", keep: true } }],
    ...clone(extra),
  };
  const calls = [];
  const writable = {
    planner_tasks: new Set(["id", "project_id", "title", "source", "category", "state",
      "priority", "order", "recurrence", "start_date", "updated_at", "metadata_json", "deleted"]),
    planner_weekly_tasks: new Set(["id", "task_type", "title", "source", "project_id", "parent_rep",
      "occurrence_date", "date", "time_slot", "bucket", "completed", "overridden", "deleted_instance",
      "checklist_json", "reminder_json", "metadata_json", "updated_at", "deleted", "checklist_open"]),
    planner_parking_lot: new Set(["id", "title", "notes", "tags", "priority", "color",
      "checklist_json", "reminder_json", "metadata_json", "converted_to_type",
      "converted_to_id", "updated_at", "deleted"]),
  };
  let failure;
  const client = {
    failNext(table) { failure = table; },
    from(table) {
      if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected table ${table}`);
      let op = "read", payload, filter, range, single;
      const query = {
        select() { return query; }, order() { return query; },
        range(start, end) { range = [start, end]; return query; },
        eq(key, value) { filter = [key, value]; return query; },
        update(row) { op = "update"; payload = row; return query; },
        insert(row) { op = "insert"; payload = row; return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push({ table, op, payload: clone(payload), filter });
            if (op !== "read" && writable[table]) {
              for (const key of Object.keys(payload)) {
                assert(writable[table].has(key), `Unknown column ${table}.${key}`);
              }
            }
            if (op !== "read" && failure === table) {
              failure = null;
              return { data: null, error: { message: "Fixture write denied" } };
            }
            let result;
            if (op === "read") {
              const [start, end] = range || [0, tables[table].length];
              result = tables[table].slice(start, Math.min(end + 1, start + cap));
            } else if (op === "update") {
              result = tables[table].filter((row) => row[filter[0]] === filter[1]);
              result.forEach((row) => Object.assign(row, clone(payload)));
            } else {
              const row = { ...clone(payload) };
              if (tables[table].some((existing) => existing.id === row.id)) {
                return { data: null, error: { message: "Duplicate ID" } };
              }
              tables[table].push(row);
              result = [row];
            }
            if (single && result.length !== 1) return { data: null, error: { message: "Expected one row" } };
            return { data: clone(single ? result[0] : result), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const data = createPlannerDataAccess(client);
  const storage = createPlannerSupabaseStorage(() => data);
  return { tables, calls, client, data, storage };
}

test("loads all imported rows, excludes settings as a task, and never writes on read", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, title: "Idea" }));
  const { data, calls } = fixture({ planner_parking_lot: rows });
  const state = await data.loadPlannerState();
  assert.equal(state.tasks[0].projectId, p1);
  assert.equal(state.weeklyTasks.length, 1);
  assert.equal(state.weekStartDate, "2026-10-19");
  assert.equal(state.parkingItems.length, 7);
  assert(calls.every((call) => call.op === "read"));
});

test("saves existing weekly rows and settings with exact snake_case fields and preserved metadata", async () => {
  const { data, tables } = fixture();
  const state = await data.loadPlannerState();
  const task = state.weeklyTasks[0];
  await data.savePlannerState({ weeklyTasks: [{ ...task, completed: true, overridden: true, date: "2026-10-21" }],
    weekStartDate: "2026-10-26" });
  const saved = tables.planner_weekly_tasks.find((row) => row.id === "w1");
  assert.equal(saved.completed, true);
  assert.equal(saved.metadata_json.override.date, "2026-10-21");
  assert.equal(saved.metadata_json.override.completed, true);
  assert.equal(saved.project_id, p1);
  assert(!Object.hasOwn(saved, "projectId"));
  const settings = tables.planner_weekly_tasks.find((row) => row.id === "week-settings");
  assert.equal(settings.metadata_json.weekStartDate, "2026-10-26");
  assert.equal(settings.metadata_json.keepSettings, true);
});

test("authorized saves create Planner rows only and return database IDs", async () => {
  const { storage, tables, calls } = fixture();
  const added = await storage.upsertTaskManagerTask({ title: "New task", projectId: p1, source: "home" });
  assert.match(added.id, /^[0-9a-f-]{36}$/);
  assert.equal(tables.planner_tasks.at(-1).project_id, p1);
  const parking = await storage.upsertParkingItem({ title: "New idea" });
  assert.equal(parking.title, "New idea");
  await storage.upsertWeeklyTask({ id: `repeatable-${p1}-2026-10-26`, projectId: p1,
    parentRepeatableId: p1, occurrenceDate: "2026-10-26", date: "2026-10-26", timeSlot: "morning" });
  assert.equal(tables.planner_weekly_tasks.at(-1).parent_rep, p1);
  assert(calls.filter((call) => call.op === "insert").every((call) =>
    ["planner_tasks", "planner_weekly_tasks", "planner_parking_lot"].includes(call.table)));
  assert.throws(() => storage.createProject({ title: "Not authorized" }), /not authorized/);
});

test("Parking conversion maps boolean plus metadata type and preserves other metadata", async () => {
  const { data, tables } = fixture();
  const item = (await data.loadPlannerState()).parkingItems[0];
  assert.equal(item.convertedTo.type, "project");
  await data.savePlannerState({ parkingItems: [{ ...item, title: "Edited" }] });
  assert.equal(tables.planner_parking_lot[0].converted_to_type, true);
  assert.equal(tables.planner_parking_lot[0].metadata_json.conversionType, "project");
  assert.equal(tables.planner_parking_lot[0].metadata_json.keep, true);
  await data.savePlannerState({ parkingItems: [{ ...item, convertedTo: null }] });
  assert.equal(tables.planner_parking_lot[0].converted_to_type, false);
  assert.equal(tables.planner_parking_lot[0].converted_to_id, null);
});

test("queue reorder/removal updates task metadata; staged acknowledgement cannot remove curated membership", async () => {
  const { storage, tables } = fixture({ planner_tasks: [
    { id: t1, title: "First", source: "home", project_id: p1,
      metadata_json: { queue: "staged", queueOrder: 0, keep: true } },
    { id: "33333333-3333-4333-8333-333333333333", title: "Second", source: "home",
      metadata_json: { queue: "curated", queueOrder: 2 } },
  ] });
  const tasks = await storage.getTaskManager();
  const staged = await storage.getStagedTasks();
  await storage.saveCuratedTasks([tasks[1], tasks[0]]);
  await storage.deleteStagedTasks(staged.map((entry) => entry.id));
  assert.deepEqual(plain((await storage.getCuratedTasks()).map((task) => task.id)), [tasks[1].id, t1]);
  assert.equal(tables.planner_tasks[0].metadata_json.keep, true);
  await storage.saveCuratedTasks([tasks[0]]);
  assert.equal(tables.planner_tasks[1].metadata_json.queue, null);
});

test("repeatable settings use task metadata and preserve multi-weekday rules", async () => {
  const { storage, tables } = fixture({ planner_tasks: [{
    id: t1, project_id: p1, source: "repeating", title: "Series", start_date: "2026-10-19T00:00:00",
    metadata_json: { keep: true, series: { recurrence: "weekly", interval: 2, weekdays: ["Mon", "Thu"] } },
  }] });
  const [series] = await storage.getRepeatableOverrides();
  assert.equal(series.projectId, p1);
  assert.equal(series.baseDay, "Monday");
  await storage.saveRepeatableOverrides([{ ...series, baseBucket: "Evening" }]);
  assert.deepEqual(plain(tables.planner_tasks[0].metadata_json.series.weekdays), ["Mon", "Thu"]);
  assert.equal(tables.planner_tasks[0].metadata_json.series.interval, 2);
  assert.equal(tables.planner_tasks[0].metadata_json.keep, true);
});

test("projects display the view, hydrate raw fields, and only update the correct raw table", async () => {
  const { storage, tables, calls } = fixture();
  const [project] = await storage.getProjects();
  assert.equal(project.title, "Home fixture");
  assert.equal(project.externalId, "import-42");
  assert.equal(project.metadata.property, "House");
  await storage.updateProject({ ...project, title: "Updated", metadata: { ...project.metadata, property: "Garage" } });
  assert.equal(tables.projects_home[0].title, "Updated");
  assert.equal(tables.projects_home[0].property, "Garage");
  assert(calls.filter((call) => call.op !== "read").every((call) => call.table === "projects_home" && call.op === "update"));
});

test("save failures surface and missing imported IDs/settings never cause recreation", async () => {
  const { storage, data, client, tables, calls } = fixture();
  const task = (await data.loadPlannerState()).tasks[0];
  client.failNext("planner_tasks");
  await assert.rejects(storage.upsertTaskManagerTask({ ...task, title: "Denied" }), /write denied/);
  await assert.rejects(data.savePlannerState({ tasks: [{ id: "missing", title: "Missing" }] }), /missing/);
  tables.planner_weekly_tasks = tables.planner_weekly_tasks.filter((row) => row.id !== "week-settings");
  await assert.rejects(data.savePlannerState({ weekStartDate: "2026-10-26" }), /No settings row was inserted/);
  assert.equal(calls.filter((call) => call.op === "insert").length, 0);
});

test("real Planner controller loads existing rows without inserts, then saves navigation and completion", async () => {
  const { storage, tables, calls } = fixture();
  const { createPlannerController } = exportsFrom("src/services/plannerService.js", ["createPlannerController"], {
    plannerStorage: storage, window: { APP_CONFIG: {}, location: { hash: "#planner" } },
    fetch: async () => ({ ok: true, json: async () => ({ forecast: { forecastday: [] } }) }),
    setTimeout, clearTimeout, URL, Date,
  });

  const controller = createPlannerController();
  try {
    await controller.actions.initialize();
    await controller.flush();
    assert(calls.every((call) => call.op === "read"));
    assert.equal(controller.getSnapshot().curatedTasks[0].taskId, t1);
    controller.actions.setTaskCompleted("w1", "mon", "morning", true);
    await controller.flush();
    assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "w1").completed, true);
    controller.actions.shiftPlannerWeek(7);
    await controller.flush();
    assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "week-settings").metadata_json.weekStartDate, "2026-10-26");
  } finally { controller.destroy(); }
});

test("weekly metadata weekdays and intervals generate the intended dates in React", () => {
  const { getOccurrenceDatesInRange } = exportsFrom("src/services/plannerService.js",
    ["getOccurrenceDatesInRange"], { plannerStorage: {} });
  const master = { startDate: "2026-10-19", recurrence: "weekly", interval: 2, weekdays: ["Mon", "Thu"] };
  assert.deepEqual(plain(getOccurrenceDatesInRange(master, "2026-10-19", "2026-11-06")),
    ["2026-10-19", "2026-10-22", "2026-11-02", "2026-11-05"]);
  assert.throws(() => getOccurrenceDatesInRange({ ...master, interval: 0 }, "2026-10-19", "2026-11-06"), /positive integer/);
});

test("all four project types save only to their matching raw table", async () => {
  for (const type of ["home", "vehicle", "repeating", "misc"]) {
    const table = `projects_${type}`;
    const row = { id: p1, title: "Typed fixture", state: "Not Started", metadata: {}, order: 1 };
    const { data, calls, tables } = fixture({
      projects_all: [{ ...row, project_type: type, priority: "3" }],
      projects_home: [], [table]: [row],
    });
    const [project] = await data.loadProjects();
    await data.saveProject({ ...project, title: "Typed edit" });
    assert.equal(tables[table][0].title, "Typed edit");
    assert(calls.filter((call) => call.op !== "read").every((call) => call.table === table && call.op === "update"));
  }
});

test("Workbench sends an imported task into the curated queue through save functions", async () => {
  const { storage, tables } = fixture();
  const { sendWeekly } = exportsFrom("src/services/workbenchService.js", ["sendWeekly"], { plannerStorage: storage });
  const task = (await storage.getTaskManager())[0];
  await sendWeekly(task, 1);
  assert.equal(tables.planner_tasks.length, 1);
  assert.equal(tables.planner_tasks[0].metadata_json.queue, "curated");
});

test("Parking conversions resolve actual project links instead of reusing task or parking IDs", async () => {
  const { data, storage, tables } = fixture({
    planner_parking_lot: [{ id: "park1", title: "Idea", converted_to_type: true,
      converted_to_id: t1, metadata_json: { conversionType: "task-manager" } },
    { id: "park2", title: "First idea" }, { id: "park3", title: "Second idea" }],
  });
  assert.equal((await data.loadPlannerState()).parkingItems[0].projectId, p1);
  const { convertParkingItem } = exportsFrom("src/services/plannerService.js", ["convertParkingItem"], {
    plannerStorage: storage,
  });
  await convertParkingItem({ id: "park2", title: "First idea" }, "task-manager");
  await convertParkingItem({ id: "park3", title: "Second idea" }, "task-manager");
  assert.equal(tables.planner_tasks.length, 3);
  assert.equal(tables.planner_tasks[1].project_id, null);
  assert.equal(tables.planner_tasks[2].project_id, null);
  assert.notEqual(tables.planner_tasks[1].id, tables.planner_tasks[2].id);
});

test("Workbench title-only edits preserve JSON resource links and unrelated metadata types", async () => {
  const links = [{ url: "https://example.com/manual", title: "Manual" }];
  const { storage, tables } = fixture({
    projects_home: [{ id: p1, title: "Home fixture", resource_links: links,
      metadata: { keep: true, nested: { value: 1 } } }],
  });
  const { parseResourceLinkEntries } = exportsFrom("src/services/plannerService.js", ["parseResourceLinkEntries"]);
  const { getEditFields, updateProject } = exportsFrom("src/services/workbenchService.js",
    ["getEditFields", "updateProject"], { plannerStorage: storage, parseResourceLinkEntries });
  const [project] = await storage.getProjects();
  const values = Object.fromEntries(getEditFields(project).map(([key, , value]) => [key, String(value ?? "")]));
  assert.equal(values.resourceLinks, "https://example.com/manual");
  await updateProject(project, { ...values, title: "Edited title" });
  assert.equal(tables.projects_home[0].title, "Edited title");
  assert.equal(tables.projects_home[0].metadata.keep, true);
  assert.deepEqual(tables.projects_home[0].metadata.nested, { value: 1 });
  assert.deepEqual(tables.projects_home[0].resource_links, links);
});
