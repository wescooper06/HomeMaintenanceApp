const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const clone = (value) => structuredClone(value);
const plain = (value) => JSON.parse(JSON.stringify(value));

function exportsFrom(file, names, context = {}) {
  const source = fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
  return vm.runInNewContext(`(() => {
    ${source.replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")}
    return { ${names.join(",")} };
  })()`, { structuredClone, console, appConfig: {}, calendarReminders: {},
    ...projectPolicyContext,
    crypto: require("node:crypto").webcrypto, ...context });
}
const projectPolicyContext = {};
Object.assign(projectPolicyContext, exportsFrom("src/services/projectPolicy.js",
  ["assertProjectWriteAllowed", "PROJECT_WRITE_POLICY"]));
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
    projects_home: new Set(["id", "external_id", "title", "category", "state", "priority", "order",
      "metadata", "property", "area", "resource_links", "cost", "date_completed"]),
    projects_vehicle: new Set(["id", "external_id", "title", "category", "state", "priority", "order",
      "metadata", "vehicle", "date_completed", "hours", "mileage", "mechanic",
      "service_description", "resource_links", "maintenance_checks"]),
    projects_repeating: new Set(["id", "external_id", "title", "category", "state", "priority", "order",
      "metadata", "property", "recurrence"]),
    projects_misc: new Set(["id", "external_id", "title", "category", "state", "priority", "order",
      "metadata", "resource_links"]),
    planner_tasks: new Set(["id", "project_id", "title", "source", "category", "state",
      "priority", "order", "recurrence", "start_date", "updated_at", "metadata_json", "deleted"]),
    planner_weekly_tasks: new Set(["id", "task_type", "title", "source", "project_id", "parent_rep",
      "occurrence_date", "date", "time_slot", "bucket", "completed", "overridden", "deleted_instance",
      "checklist_json", "reminder_json", "metadata_json", "updated_at", "deleted", "checklist_open"]),
    planner_parking_lot: new Set(["id", "title", "notes", "tags", "priority", "color",
      "checklist_json", "reminder_json", "metadata_json", "converted_to_type",
      "converted_to_id", "created_at", "updated_at", "deleted"]),
  };
  let failure;
  const counters = { home: 209, vehicle: 82, repeating: 8, misc: 4 };
  const prefixes = { home: "PA", vehicle: "PB", repeating: "PC", misc: "PD" };
  const client = {
    failNext(table) { failure = table; },
    async rpc(name, args) {
      assert.equal(name, "create_workbench_project");
      const { p_type: type, p_project: payload } = args;
      const table = `projects_${type}`;
      assert(Object.hasOwn(prefixes, type));
      assert(!Object.hasOwn(payload, "id"));
      assert(!Object.hasOwn(payload, "external_id"));
      calls.push({ table, op: "rpc", name, payload: clone(payload) });
      if (failure === table) {
        failure = null;
        return { data: null, error: { message: "Fixture write denied" } };
      }
      for (const key of Object.keys(payload)) assert(writable[table].has(key));
      const row = { ...clone(payload), id: require("node:crypto").randomUUID(),
        external_id: prefixes[type] + String(++counters[type]).padStart(4, "0") };
      tables[table].push(row);
      return { data: clone(row), error: null };
    },
    from(table) {
      if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected table ${table}`);
      let op = "read", payload, filter, range, single;
      const filters = [];
      const query = {
        select() { return query; }, order() { return query; },
        range(start, end) { range = [start, end]; return query; },
        eq(key, value) { if (!filter) filter = [key, value]; filters.push([key, value]); return query; },
        is(key, value) { filters.push([key, value]); return query; },
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
              if (client.beforeUpdate) {
                const hook = client.beforeUpdate;
                client.beforeUpdate = null;
                hook(table, clone(payload));
              }
              result = tables[table].filter((row) => filters.every(([key, value]) =>
                value === null ? row[key] == null : row[key] === value));
              result.forEach((row) => Object.assign(row, clone(payload)));
            } else {
              const row = { ...clone(payload) };
              if (table === "projects_home" && row.external_id == null) {
                return { data: null, error: { code: "23502",
                  message: 'null value in column "external_id" of relation "projects_home" violates not-null constraint' } };
              }
              if (client.beforeInsert) {
                const hook = client.beforeInsert;
                client.beforeInsert = null;
                hook(table, clone(payload));
              }
              if (tables[table].some((existing) => existing.id === row.id)) {
                return { data: null, error: { message: "Duplicate ID" } };
              }
              tables[table].push(row);
              result = [row];
            }
            if (single && result.length !== 1) return { data: null, error: { code: "PGRST116", message: "Expected one row" } };
            const data = clone(single ? result[0] : result);
            if (op !== "read" && client.afterWrite) {
              const hook = client.afterWrite;
              client.afterWrite = null;
              hook(table, clone(payload));
            }
            return { data, error: null };
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

const calendar = exportsFrom("src/services/calendarService.js",
  ["createCalendarController", "createCalendarApi", "getPlannerEventIdSet", "normalizeCalendarEvents"], {
    cleanText: (value, fallback = "") => String(value ?? "").trim() || fallback,
    toDateKey: (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")].join("-"),
    URLSearchParams,
  });
const { createPlannerBackupService } = exportsFrom("src/services/plannerBackupService.js",
  ["createPlannerBackupService"], { plannerStorage: {} });

function calendarController(storage, event) {
  return calendar.createCalendarController({
    getPlannerStorage: async () => storage,
    api: { list: async () => [event] },
    confirm: () => true,
  });
}

test("Calendar saves multi-day events to Supabase with stable identity, metadata, and no duplicate writes", async () => {
  const { storage, tables, calls } = fixture();
  const event = { id: "google-event", summary: "Conference", description: "Bring notes",
    start: { date: "2026-10-24" }, end: { date: "2026-10-27" } };
  const controller = calendarController(storage, event);
  await controller.actions.initialize();
  assert(await controller.actions.addToPlanner(event.id, "2026-10-24"));
  const rows = tables.planner_weekly_tasks.filter((row) => row.source === "google-calendar");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.id), [
    "google-google-event-2026-10-24", "google-google-event-2026-10-25", "google-google-event-2026-10-26",
  ]);
  for (const row of rows) {
    assert.equal(row.metadata_json.notes, "Bring notes");
    assert.equal(row.metadata_json.allDay, true);
    assert.equal(row.bucket, "All Day");
    assert.equal(row.project_id, event.id);
  }
  assert.equal(calendar.getPlannerEventIdSet(controller.getSnapshot().planner).size, 3);
  const writes = calls.filter((call) => call.op !== "read").length;
  assert(await controller.actions.addToPlanner(event.id, "2026-10-24"));
  assert.equal(calls.filter((call) => call.op !== "read").length, writes);
  assert.match(controller.getSnapshot().status, /already in Planner/);
  const backup = createPlannerBackupService(storage);
  const preview = await backup.preview(await backup.exportBackup());
  assert.equal(preview.counts.insert, 0, "all-day Calendar records must survive backup normalization");
  assert.equal(preview.conflicts.length, 0);
  controller.destroy();
});

test("Calendar reminder actions preserve event data and surface remote failures", async () => {
  const { storage } = fixture();
  const event = { id: "reminder-event", summary: "Keep event", description: "Keep notes",
    start: { date: "2026-10-24" }, end: { date: "2026-10-25" } };
  const calls = [];
  const ownedReminder = { ...event, id: "owned-reminder",
    extendedProperties: { private: { plannerTaskId: "task" } } };
  assert.equal(calendar.normalizeCalendarEvents([ownedReminder]).length, 0);
  assert(calendar.normalizeCalendarEvents([event]).length > 0);
  let failure = false;
  const controller = calendar.createCalendarController({
    getPlannerStorage: async () => storage,
    api: { list: async () => [event] },
    reminders: { setEventReminder: async (id, minutes) => {
      if (failure) throw new Error("Fixture Calendar denied");
      calls.push([id, minutes]);
    } },
  });
  try {
    await controller.actions.initialize();
    controller.actions.openEvent(event.id, "2026-10-24");
    assert(await controller.actions.setReminder(10));
    assert.deepEqual(calls, [[event.id, 10]]);
    assert.equal(event.summary, "Keep event");
    assert.equal(event.description, "Keep notes");
    failure = true;
    assert.equal(await controller.actions.setReminder(null), false);
    assert.match(controller.getSnapshot().status, /Fixture Calendar denied/);
  } finally { controller.destroy(); }
});

test("Calendar revives a removed event/day without inserting a new identity", async () => {
  const event = { id: "revive", summary: "Appointment",
    start: { date: "2026-10-24" }, end: { date: "2026-10-25" } };
  const { storage, tables, calls } = fixture();
  const controller = calendarController(storage, event);
  await controller.actions.initialize();
  await controller.actions.addToPlanner(event.id, "2026-10-24");
  const row = tables.planner_weekly_tasks.find((item) => item.project_id === event.id);
  await storage.deleteWeeklyTask(row.id);
  await controller.actions.refresh();
  assert.equal(calendar.getPlannerEventIdSet(controller.getSnapshot().planner).size, 0);
  const inserts = calls.filter((call) => call.op === "insert").length;
  assert(await controller.actions.addToPlanner(event.id, "2026-10-24"));
  assert.equal(calls.filter((call) => call.op === "insert").length, inserts);
  assert.equal(row.deleted, false);
  assert.equal(row.deleted_instance, false);
  controller.destroy();
});

test("Calendar reports rejected Supabase writes without a local fallback or a success message", async () => {
  const { storage, client, tables } = fixture();
  const event = { id: "denied", summary: "Denied event",
    start: { date: "2026-10-24" }, end: { date: "2026-10-25" } };
  const controller = calendarController(storage, event);
  await controller.actions.initialize();
  client.failNext("planner_weekly_tasks");
  assert.equal(await controller.actions.addToPlanner(event.id, "2026-10-24"), false);
  assert.match(controller.getSnapshot().status, /Unable to add event.*Fixture write denied/);
  assert(!tables.planner_weekly_tasks.some((row) => row.project_id === event.id));
  assert.equal(calendar.getPlannerEventIdSet(controller.getSnapshot().planner).size, 0);
  controller.destroy();
});

test("Calendar continues showing Google events when Planner is unavailable and surfaces the error", async () => {
  const event = { id: "visible", summary: "Visible event",
    start: { date: "2026-10-24" }, end: { date: "2026-10-25" } };
  const controller = calendarController({
    getWeeklyPlanner: async () => { throw new Error("Planner unavailable"); },
  }, event);
  assert(await controller.actions.initialize());
  assert.equal(controller.getSnapshot().events.length, 1);
  assert.match(controller.getSnapshot().plannerError, /Planner unavailable/);
  assert.equal(await controller.actions.addToPlanner(event.id, "2026-10-24"), false);
  assert.match(controller.getSnapshot().status, /Unable to add event.*Planner unavailable/);
  controller.destroy();
});

test("Calendar API retains direct event CRUD and explicit authorization without Sheets", async () => {
  const requests = [];
  let authorized = false;
  let signIns = 0;
  const auth = {
    ensureAuthenticated: async () => {
      if (!authorized) throw new Error("Connect Google Calendar");
      return "fixture-calendar-token";
    },
    signIn: async () => { authorized = true; signIns += 1; },
  };
  const api = calendar.createCalendarApi({
    getAuth: () => auth,
    request: async (url, options) => {
      requests.push({ url, ...options });
      return { ok: true, status: options.method === "DELETE" ? 204 : 200,
        json: async () => options.method === "GET" ? { items: [] } : { id: "saved-event" } };
    },
  });
  await assert.rejects(api.list(new Date(2026, 9, 1)), /Connect Google Calendar/);
  assert.equal(signIns, 0);
  assert.equal(requests.length, 0);
  await api.signIn();
  await api.list(new Date(2026, 9, 1));
  const data = { summary: "Updated", description: "Notes", location: "Room",
    startDateTime: "2026-10-24T10:00:00", endDateTime: "2026-10-24T11:00:00" };
  await api.create(data);
  await api.update("event/id", { raw: { id: "event/id", summary: "Original",
    start: { dateTime: data.startDateTime }, end: { dateTime: data.endDateTime } } }, data);
  await api.remove("event/id");
  assert.deepEqual(requests.map((request) => request.method), ["GET", "POST", "PATCH", "DELETE"]);
  for (const request of requests) {
    assert(request.url.startsWith("https://www.googleapis.com/calendar/v3/calendars/primary/events"));
    assert.equal(request.headers.Authorization, "Bearer fixture-calendar-token");
  }
  assert(requests[2].url.endsWith("/event%2Fid"));
  assert.equal(JSON.parse(requests[1].body).summary, "Updated");
  assert.equal(signIns, 1);
});

test("Calendar API propagates non-authorization failures without prompting for access", async () => {
  let prompts = 0;
  const api = calendar.createCalendarApi({
    getAuth: () => ({ ensureAuthenticated: async () => "fixture",
      signIn: async () => { prompts += 1; } }),
    request: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(api.list(new Date()), /503/);
  assert.equal(prompts, 0);
});

test("Planner backup round-trips live Planner state without mutations or unrelated data", async () => {
  const { storage, calls } = fixture();
  const backup = createPlannerBackupService(storage);
  const raw = await backup.exportBackup();
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.format, "homemaintenance-planner");
  assert.deepEqual(Object.keys(parsed.data).sort(), ["parkingItems", "tasks", "weekStartDate", "weeklyTasks"]);
  assert(!raw.includes("access_token"));
  const preview = await backup.preview(raw);
  assert.equal(preview.counts.insert, 0);
  assert.equal(preview.counts.identical, 3);
  assert.deepEqual(plain(preview.conflicts), []);
  assert.deepEqual(plain(await backup.restore(raw)), { inserted: 0, skipped: 3 });
  assert(calls.every((call) => call.op === "read"));
});

test("backup merge restores stable task/weekly/parking IDs and preserves metadata without changing projects", async () => {
  const { storage, tables, calls } = fixture();
  const backup = createPlannerBackupService(storage);
  const parsed = JSON.parse(await backup.exportBackup());
  parsed.data.tasks = [{ ...parsed.data.tasks[0], id: "restored-task", taskId: "restored-task", title: "Restored task" }];
  parsed.data.weeklyTasks = [{ ...parsed.data.weeklyTasks[0], id: "restored-weekly", taskId: "restored-weekly",
    title: "Restored weekly", checklist: [{ id: "check", text: "Keep", completed: true }],
    metadata: { preserve: { nested: ["value"] } } }];
  parsed.data.parkingItems = [{ ...parsed.data.parkingItems[0], id: "restored-parking",
    title: "Restored idea", convertedTo: null, createdAt: "2020-01-01T09:00:00.000Z" }];
  const raw = JSON.stringify(parsed);
  const plan = await backup.preview(raw);
  assert.equal(plan.counts.insert, 3);
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plain(await backup.restore(raw)), { inserted: 3, skipped: 0 });
  assert(tables.planner_tasks.some((row) => row.id === "restored-task"));
  assert(tables.planner_parking_lot.some((row) => row.id === "restored-parking"));
  assert.equal(tables.planner_parking_lot.find((row) => row.id === "restored-parking").created_at, "2020-01-01T09:00:00.000Z");
  const weekly = tables.planner_weekly_tasks.find((row) => row.id === "restored-weekly");
  assert.equal(weekly.checklist_json[0].completed, true);
  assert.deepEqual(plain(weekly.metadata_json), { preserve: { nested: ["value"] } });
  assert(!calls.some((call) => call.table.startsWith("projects_") && call.op !== "read"));
  assert(!calls.some((call) => call.op === "update"));
  assert.equal((await backup.preview(raw)).counts.insert, 0);
});

test("backup conflicts, different week settings, and missing project IDs block all restore writes", async () => {
  for (const modify of [
    (data) => { data.weeklyTasks[0].title = "Conflicting"; },
    (data) => { data.weeklyTasks[0].metadata.updatedAt = "a meaningful metadata change"; },
    (data) => { data.weekStartDate = "2026-10-26"; },
    (data) => { data.weeklyTasks[0].id = "new-reference"; data.weeklyTasks[0].projectId = "unknown-project"; },
    (data) => { data.parkingItems[0].convertedTo = { type: "task-manager", id: "missing-task" }; },
  ]) {
    const { storage, calls } = fixture();
    const backup = createPlannerBackupService(storage);
    const parsed = JSON.parse(await backup.exportBackup());
    modify(parsed.data);
    const raw = JSON.stringify(parsed);
    assert((await backup.preview(raw)).conflicts.length > 0);
    await assert.rejects(backup.restore(raw), /Restore blocked/);
    assert(calls.every((call) => call.op === "read"));
  }
});



test("backup restore preserves imported notification settings for review without claiming they are scheduled", async () => {
  const { storage, tables } = fixture();
  const backup = createPlannerBackupService(storage);
  const raw = JSON.stringify({ format: "homemaintenance-planner", version: 1,
    data: { tasks: [], parkingItems: [], weeklyTasks: [{
    id: "restore-reminder", title: "Review reminder", date: "2026-10-24",
    reminder: { active: true, provider: "google-calendar", sendAt: "2030-10-24T09:00:00Z", eventId: "old-event" },
  }] } });
  await backup.restore(raw);
  const row = tables.planner_weekly_tasks.find((item) => item.id === "restore-reminder");
  assert.equal(row.reminder_json.active, false);
  assert.equal(row.reminder_json.needsReview, true);
  assert.equal(row.reminder_json.imported.eventId, "old-event");
  assert.equal(row.reminder_json.imported.active, true);
  assert.equal((await backup.preview(raw)).counts.insert, 0);
  assert.equal((await backup.preview(raw)).conflicts.length, 0);
});



test("malformed, duplicate, invalid-date and invalid-boolean backup rows reject before any write", async () => {
  const { storage, calls } = fixture();
  const backup = createPlannerBackupService(storage);
  const seed = JSON.parse(await backup.exportBackup());
  for (const raw of ["", "{", JSON.stringify({ format: "homemaintenance-planner", version: 999 }), "{}"]) {
    await assert.rejects(backup.preview(raw));
  }
  for (const modify of [
    (data) => { data.weeklyTasks.push(data.weeklyTasks[0]); },
    (data) => { data.weeklyTasks[0].date = "2026-02-30"; },
    (data) => { data.weeklyTasks[0].completed = "false"; },
    (data) => { data.weeklyTasks[0].reminder = { active: "false" }; },
    (data) => { data.tasks[0].priority = false; },
    (data) => { data.parkingItems[0].createdAt = "invalid"; },
    (data) => { data.weeklyTasks[0].metadataJson = "invalid"; },
    (data) => { data.weeklyTasks[0].id = ""; data.weeklyTasks[0].taskId = ""; },
  ]) {
    const parsed = clone(seed);
    modify(parsed.data);
    await assert.rejects(backup.restore(JSON.stringify(parsed)));
  }
  assert(calls.every((call) => call.op === "read"));
});

test("restore rechecks conflicts after preview and never overwrites concurrent changes", async () => {
  const { storage, tables, calls } = fixture();
  const backup = createPlannerBackupService(storage);
  const parsed = JSON.parse(await backup.exportBackup());
  parsed.data.weeklyTasks = [{ ...parsed.data.weeklyTasks[0], id: "race", taskId: "race", title: "New" }];
  const raw = JSON.stringify(parsed);
  assert.equal((await backup.preview(raw)).counts.insert, 1);
  tables.planner_weekly_tasks.push({ id: "race", title: "Someone else's save", date: "2026-10-24" });
  await assert.rejects(backup.restore(raw), /Restore blocked/);
  assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "race").title, "Someone else's save");
  assert(calls.every((call) => call.op === "read"));
});

test("insert-only restore rejects a last-moment ID collision without overwriting the other client", async () => {
  const { storage, data, client, tables, calls } = fixture();
  const item = { ...(await storage.loadPlannerState()).weeklyTasks[0], id: "racing-row" };
  client.beforeInsert = (table, payload) => tables[table].push({ ...payload, title: "Other client" });
  await assert.rejects(data.restorePlannerState({ weeklyTasks: [item] }), /0 inserted.*Duplicate ID/);
  assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "racing-row").title, "Other client");
  assert(!calls.some((call) => call.op === "update"));
});

test("backup comparisons ignore JSON ordering but preserve arbitrary nested metadata fields", async () => {
  const { storage, data, tables, calls } = fixture();
  tables.planner_weekly_tasks[1].metadata_json = {
    z: 1, nested: { z: 2, a: 3 }, arbitraryJson: "This is not a JSON document", updatedAt: "keep",
  };
  const backup = createPlannerBackupService(storage);
  const raw = await backup.exportBackup();
  assert.equal((await backup.preview(raw)).conflicts.length, 0);
  const item = JSON.parse(raw).data.weeklyTasks[0];
  item.metadata = { updatedAt: "keep", arbitraryJson: "This is not a JSON document", nested: { a: 3, z: 2 }, z: 1 };
  const saved = await data.restorePlannerState({ weeklyTasks: [item] });
  assert.equal(saved[0].inserted, false);
  assert(calls.every((call) => call.op === "read"));
  tables.planner_weekly_tasks[1].metadata_json.concurrentField = "new server data";
  await assert.rejects(data.restorePlannerState({ weeklyTasks: [item] }), /Backup conflict/);
  assert.equal(tables.planner_weekly_tasks[1].metadata_json.concurrentField, "new server data");
  assert(calls.every((call) => call.op === "read"));
});

test("insert-only data access preflights every group before writing and reports partial failure explicitly", async () => {
  const { data, calls, client, tables } = fixture();
  await assert.rejects(data.restorePlannerState({
    weeklyTasks: [{ id: "new-week", title: "New", date: "2026-10-24" }],
    parkingItems: [{ id: "park1", title: "Conflict" }],
  }), /Backup conflict/);
  assert(calls.every((call) => call.op === "read"));
  client.failNext("planner_weekly_tasks");
  await assert.rejects(data.restorePlannerState({
    tasks: [{ id: "backup-new-task", title: "Inserted first" }],
    weeklyTasks: [{ id: "backup-new-week", title: "Rejected" }],
  }), /stopped after 1 inserted row/);
  assert(tables.planner_tasks.some((row) => row.id === "backup-new-task"));
  assert(!tables.planner_weekly_tasks.some((row) => row.id === "backup-new-week"));
  assert(!calls.some((call) => call.op === "update"));
});

test("project creation is enabled while deletion and type moves remain blocked", async () => {
  const { storage, calls } = fixture();
  assert.equal(typeof storage.deleteProject, "function");
  const { assertProjectWriteAllowed } = exportsFrom("src/services/projectPolicy.js", ["assertProjectWriteAllowed"]);
  assert.throws(() => assertProjectWriteAllowed("move"), /not authorized/);
  assert.equal(calls.length, 0);
});

test("Workbench project creation inserts a UUID project into the selected Supabase source table", async () => {
  const { storage, tables, calls } = fixture();
  const { createProject } = exportsFrom("src/services/workbenchService.js", ["createProject"], {
    plannerStorage: storage,
  });
  const created = await createProject({
    source: "home", title: "New fixture project", category: "Repair",
    state: "Not Started", priority: "High", order: "12",
    property: "House", area: "Garage", resourceLinks: "https://example.test/manual",
  });
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  assert.equal(created.title, "New fixture project");
  assert.equal(created.source, "home");
  const inserted = calls.find((call) => call.table === "projects_home" && call.op === "rpc");
  assert(inserted);
  assert.equal(inserted.name, "create_workbench_project");
  assert(!Object.hasOwn(inserted.payload, "id"));
  assert(!Object.hasOwn(inserted.payload, "external_id"));
  assert.equal(created.externalId, "PA0210");
  assert.equal(inserted.payload.title, "New fixture project");
  assert.equal(inserted.payload.priority, "High");
  assert.equal(inserted.payload.order, 12);
  assert.deepEqual(plain(inserted.payload.resource_links), ["https://example.test/manual"]);
  assert(tables.projects_home.some((project) => project.id === created.id));
  assert(!calls.some((call) => call.op === "insert" && call.table === "projects_all"));
});

test("invalid project creation fails before a Supabase insert", async () => {
  const { storage, calls } = fixture();
  const { createProject } = exportsFrom("src/services/workbenchService.js", ["createProject"], {
    plannerStorage: storage,
  });
  await assert.rejects(createProject({ source: "repeating", title: "No recurrence" }), /Recurrence is required/);
  await assert.rejects(createProject({ source: "unknown", title: "Invalid source" }), /valid project type/);
  assert.equal(calls.length, 0);
});

for (const source of ["home", "repeating", "vehicle", "misc"]) {
  test(`Workbench ${source} creation supplies a fresh external identity without reusing Recycle references`, async () => {
    const { storage, calls, tables } = fixture({
      planner_tasks: [{ id: t1, project_id: p1, title: "Recycle", source: "repeating" }],
    });
    const { createProject } = exportsFrom("src/services/workbenchService.js", ["createProject"], {
      plannerStorage: storage,
    });
    const values = { source, title: "Recycle", category: "Clean", state: "In Progress",
      priority: "3", order: "", recurrence: "weekly", property: "House" };
    const originalTasks = clone(tables.planner_tasks);
    const first = await createProject(values);
    const second = await createProject(values);
    const writes = calls.filter((call) => call.op !== "read");
    assert.equal(writes.length, 2);
    for (const [index, project] of [first, second].entries()) {
      const { table, op, payload } = writes[index];
      assert.equal(table, `projects_${source}`);
      assert.equal(op, "rpc");
      assert.match(project.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.notEqual(project.id, p1);
      const prefix = { home: "PA", vehicle: "PB", repeating: "PC", misc: "PD" }[source];
      assert.match(project.externalId, new RegExp(`^${prefix}\\d{4}$`));
      assert.notEqual(project.externalId, "PC0003");
      assert(!Object.hasOwn(payload, "id"));
      assert(!Object.hasOwn(payload, "external_id"));
      assert.equal(payload.title, "Recycle");
      assert.equal(payload.priority, "3");
      assert.equal(payload.order, null);
      if (source === "repeating") {
        assert.equal(payload.property, "House");
        assert.equal(payload.recurrence, "weekly");
      }
    }
    assert.notEqual(first.externalId, second.externalId);
    assert.deepEqual(tables.planner_tasks, originalTasks);
  });
}

test("project RPC failures surface without a direct insert fallback", async () => {
  const { storage, client, calls } = fixture();
  client.failNext("projects_repeating");
  await assert.rejects(storage.createProject({
    source: "repeating", title: "Recycle", recurrence: "weekly",
  }), /Creating repeating project: Fixture write denied/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "rpc");
});

test("curated scheduling stores explicit task identity and deduplicates without decoding weekly IDs", async () => {
  const { storage, tables } = fixture();
  const { createPlannerController } = exportsFrom("src/services/plannerService.js", ["createPlannerController"], {
    plannerStorage: storage, window: { location: { hash: "#planner" } },
    fetch: async () => { throw new Error("External network is forbidden"); },
    setTimeout, clearTimeout, URL, Date,
  });
  const controller = createPlannerController();
  try {
    await controller.actions.initialize();
    controller.actions.assignTask(t1, "tue", "morning");
    await controller.flush();
    controller.actions.assignTask(t1, "tue", "evening");
    await controller.flush();
    const assigned = tables.planner_weekly_tasks.filter((row) => row.metadata_json?.sourceTaskId === t1);
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].project_id, p1);
    assert.equal(assigned[0].time_slot, "evening");
  } finally { controller.destroy(); }
});

for (const type of ["curated", "adhoc", "repeatable"]) {
  for (const entry of ["dialog", "drag"]) {
    test(`${entry} moves ${type} Monday morning to Tuesday afternoon on the same persisted record`, async () => {
      const row = {
        id: "stable-weekly-identity", task_type: type, title: "Keep edited title",
        project_id: type === "adhoc" ? null : p1, source: type === "repeatable" ? "repeating" : "home",
        parent_rep: type === "repeatable" ? p1 : null, occurrence_date: "2026-10-19",
        date: "2026-10-19", time_slot: "morning", bucket: "morning", completed: true,
        checklist_json: [{ id: "check-1", text: "Keep checklist", completed: true }],
        reminder_json: { active: false, notes: "Keep reminder" },
        metadata_json: { sourceTaskId: t1, notes: "Keep metadata", resourceLinks: ["https://example.test"] },
        checklist_open: true, deleted: false, deleted_instance: false, overridden: false,
      };
      const { storage, tables, calls } = fixture({
        planner_weekly_tasks: [
          { id: "week-settings", metadata_json: { weekStartDate: "2026-10-19" } }, row,
        ],
      });
      const { createPlannerController, parseDateKey, selectWeeklyView } = exportsFrom(
        "src/services/plannerService.js", ["createPlannerController", "parseDateKey", "selectWeeklyView"], {
          plannerStorage: storage, window: { location: { hash: "#planner" } },
          fetch: async () => { throw new Error("External network is forbidden"); },
          setTimeout, clearTimeout, URL, Date,
        });
      const controller = createPlannerController();
      let reloaded;
      try {
        await controller.actions.initialize();
        const before = plain(controller.getSnapshot().planner.tasks.find((task) => task.id === row.id));
        const start = calls.length;
        if (entry === "dialog") {
          controller.actions.openMove(row.id);
          assert.equal(controller.getSnapshot().moveTaskId, row.id);
          assert(controller.actions.moveTaskToDate(row.id, parseDateKey("2026-10-20"), "afternoon"));
          controller.actions.closeMove();
        } else {
          assert(controller.actions.dropOnSlot({ kind: "weekly-move", taskId: row.id }, "tue", "2026-10-20", "afternoon"));
        }
        const after = plain(controller.getSnapshot().planner.tasks.find((task) => task.id === row.id));
        assert.deepEqual(after, {
          ...before, date: "2026-10-20", timeSlot: "afternoon", bucket: "afternoon",
          metadata: { ...before.metadata, weeklyPosition: 0 },
          ...(type === "repeatable" ? { overridden: true } : {}),
        });
        const view = selectWeeklyView(controller.getSnapshot());
        const slotTasks = (date, slot) => view.days.find((day) => day.date === date).slots
          .find((item) => item.slot === slot).tasks;
        assert(!slotTasks("2026-10-19", "morning").some((task) => task.id === row.id));
        assert.equal(slotTasks("2026-10-20", "afternoon").filter((task) => task.id === row.id).length, 1);
        await controller.flush();
        const writes = calls.slice(start).filter((call) => call.op !== "read");
        assert(!writes.some((call) => call.op === "insert"));
        const taskWrites = writes.filter((call) => call.table === "planner_weekly_tasks"
          && call.filter?.[1] !== "week-settings");
        assert.equal(taskWrites.length, 1);
        assert(taskWrites.every((call) =>
          call.op === "update" && call.filter[1] === row.id && !call.payload.deleted));
        assert.equal(tables.planner_weekly_tasks.length, 2);
        reloaded = createPlannerController();
        await reloaded.actions.initialize();
        const saved = reloaded.getSnapshot().planner.tasks.find((task) => task.id === row.id);
        assert.equal(saved.date, "2026-10-20");
        assert.equal(saved.timeSlot, "afternoon");
        assert.equal(saved.completed, true);
        assert.deepEqual(plain(saved.checklist), row.checklist_json);
        assert.deepEqual(plain(saved.reminder), row.reminder_json);
        assert.equal(saved.metadata.notes, "Keep metadata");
        reloaded.actions.updateTaskTitle(row.id, "Editable after move");
        await reloaded.flush();
        assert.equal(tables.planner_weekly_tasks.find((item) => item.id === row.id).title, "Editable after move");
        assert(controller.actions.moveTaskToDate(row.id, parseDateKey("2026-10-21")));
        assert.equal(controller.getSnapshot().planner.tasks.find((task) => task.id === row.id).timeSlot, "afternoon",
          "Existing date-only Move Task callers preserve their slot");
        await controller.flush();
      } finally {
        controller.destroy();
        reloaded?.destroy();
      }
    });
  }
}

test("weekly positions reorder mixed cards, preserve rows and queues, reload, and compose with movement/editing", async () => {
  const weekly = ["A", "B", "C", "D", "E"].map((id, index) => ({
    id, task_type: ["curated", "adhoc", "repeatable", "curated", "adhoc"][index],
    title: `Task ${id}`, project_id: p1, source: "home",
    parent_rep: id === "C" ? p1 : null, occurrence_date: "2026-10-19",
    date: index < 3 ? "2026-10-19" : "2026-10-20",
    time_slot: "morning", bucket: "morning", completed: true, overridden: false,
    checklist_json: [{ id: "check", text: "Retain me", completed: true }],
    reminder_json: { active: true, sendAt: "2026-11-01T10:00:00Z", eventId: `event-${id}` },
    metadata_json: { sourceTaskId: t1, links: ["https://example.test"], keep: { nested: true } },
    checklist_open: true, deleted: false, deleted_instance: false,
  }));
  const { storage, tables, calls } = fixture({
    planner_weekly_tasks: [{ id: "week-settings", metadata_json: { weekStartDate: "2026-10-19" } }, ...weekly],
  });
  const { createPlannerController, selectWeeklyView, parseDateKey } = exportsFrom(
    "src/services/plannerService.js", ["createPlannerController", "selectWeeklyView", "parseDateKey"], {
      plannerStorage: storage, window: { location: { hash: "#planner" } }, setTimeout, clearTimeout, URL, Date,
      fetch: async () => { throw new Error("External network is forbidden"); },
    });
  const controller = createPlannerController();
  let reload;
  const ids = (instance, date = "2026-10-19") => plain(selectWeeklyView(instance.getSnapshot()).days
    .find((day) => day.date === date).slots.find((slot) => slot.slot === "morning").tasks.map((task) => task.id));
  try {
    await controller.actions.initialize();
    const original = plain(controller.getSnapshot().planner.tasks);
    const tasksBefore = clone(tables.planner_tasks);
    const projectsBefore = clone(tables.projects_home);
    const otherBefore = clone(tables.planner_weekly_tasks.filter((row) => ["D", "E"].includes(row.id)));
    const start = calls.length;
    assert.deepEqual(ids(controller), ["A", "B", "C"]);
    const drop = (taskId, placement) => controller.actions.dropOnSlot(
      { kind: "weekly-move", taskId }, "mon", "2026-10-19", "morning", placement);
    assert(drop("C", { targetId: "A", side: "before" }));
    assert.deepEqual(ids(controller), ["C", "A", "B"]);
    await controller.flush();
    assert.deepEqual(ids(controller).map((id) =>
      controller.getSnapshot().planner.tasks.find((task) => task.id === id).metadata.weeklyPosition), [0, 1, 2]);
    assert(drop("C", { targetId: "B", side: "after" }));
    assert.deepEqual(ids(controller), ["A", "B", "C"]);
    assert(drop("B", { targetId: "A", side: "before" }));
    assert.deepEqual(ids(controller), ["B", "A", "C"]);
    assert(drop("B"));
    assert.deepEqual(ids(controller), ["A", "C", "B"]);
    await controller.flush();
    const writesBeforeNoop = calls.filter((call) => call.op !== "read").length;
    assert(drop("B"));
    assert(drop("C", { targetId: "C", side: "before" }));
    assert(drop("A", { targetId: "C", side: "before" }));
    await controller.flush();
    assert.equal(calls.filter((call) => call.op !== "read").length, writesBeforeNoop);
    assert.throws(() => drop("A", { targetId: "D", side: "before" }), /insertion target/);
    for (const task of controller.getSnapshot().planner.tasks) {
      const { weeklyPosition, ...metadata } = task.metadata;
      assert.deepEqual(plain({ ...task, metadata }), original.find((item) => item.id === task.id));
      if (["A", "B", "C"].includes(task.id)) assert(Number.isSafeInteger(weeklyPosition));
    }
    assert.deepEqual(tables.planner_tasks, tasksBefore, "Curated queue must be unchanged");
    assert.deepEqual(tables.projects_home, projectsBefore);
    assert.deepEqual(tables.planner_weekly_tasks.filter((row) => ["D", "E"].includes(row.id)), otherBefore);
    assert(calls.slice(start).filter((call) => call.op !== "read").every((call) =>
      call.table === "planner_weekly_tasks" && call.op === "update" && !call.payload.deleted
      && !call.payload.deleted_instance));
    assert.equal(tables.planner_weekly_tasks.length, 6);
    reload = createPlannerController();
    await reload.actions.initialize();
    assert.deepEqual(ids(reload), ["A", "C", "B"]);
    assert(reload.actions.moveTaskToDate("C", parseDateKey("2026-10-20")));
    assert.deepEqual(ids(reload, "2026-10-20"), ["D", "E", "C"], "Move Task appends");
    assert(reload.actions.dropOnSlot({ kind: "weekly-move", taskId: "A" }, "tue", "2026-10-20", "morning",
      { targetId: "E", side: "before" }));
    assert.deepEqual(ids(reload, "2026-10-20"), ["D", "A", "E", "C"]);
    assert(reload.actions.dropOnSlot({ kind: "weekly-move", taskId: "B" }, "tue", "2026-10-20", "morning"));
    assert.deepEqual(ids(reload, "2026-10-20"), ["D", "A", "E", "C", "B"]);
    reload.actions.updateTaskTitle("A", "Edited after reorder");
    await reload.flush();
    await storage.updateProject({ id: p1, projectId: p1, source: "home", title: "Project still editable" });
    assert.equal(tables.projects_home[0].title, "Project still editable");
    assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "A").title, "Edited after reorder");
    reload.destroy();
    reload = createPlannerController();
    await reload.actions.initialize();
    assert.deepEqual(ids(reload, "2026-10-20"), ["D", "A", "E", "C", "B"]);
    assert.deepEqual(ids(reload), []);
  } finally { controller.destroy(); reload?.destroy(); }
});

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

function incidentFixtureRows() {
  return [
    { id: "week-settings", metadata_json: { weekStartDate: "2026-10-26" } },
    ...[["app", 11, 3], ["drone", 12, 2], ["estate", 3, 0], ["vinyl", 1, 0]].map(([name, count, checked], index) => ({
      id: name, project_id: index ? `project-${name}` : p1, source: "home", task_type: "curated",
      date: index < 2 ? "2026-10-26" : "2026-11-02", occurrence_date: "2026-10-26",
      time_slot: "morning", bucket: "morning", title: name, completed: false,
      deleted: false, deleted_instance: false, overridden: false, checklist_open: true,
      metadata_json: { sourceTaskId: index ? `master-${name}` : t1, preserve: name },
      reminder_json: { active: false, note: "preserve" }, updated_at: "2026-10-26T16:00:00",
      checklist_json: Array.from({ length: count }, (_, i) => ({ id: `${name}-${i}`, text: `${name} item ${i}`, completed: i < checked })),
    })),
  ];
}

test("partial/current-week, empty and stale snapshots never tombstone omitted incident rows", async () => {
  const { storage, tables, calls } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const loaded = await storage.loadPlannerState();
  const before = clone(tables.planner_weekly_tasks);
  await storage.saveWeeklyPlannerState({ weekStartDate: loaded.weekStartDate,
    tasks: loaded.weeklyTasks.filter((row) => row.id === "app") });
  await storage.saveWeeklyPlannerState({ weekStartDate: "2026-11-02", tasks: [] });
  await storage.saveWeeklyPlannerState({ weekStartDate: "2026-10-26", tasks: [] });
  assert.deepEqual(tables.planner_weekly_tasks.filter((row) => row.id !== "week-settings"), before.slice(1));
  assert(calls.filter((call) => call.op !== "read").every((call) => call.filter[1] === "week-settings"));
});

test("explicit deletion requires exact IDs and leaves other checklist rows unchanged", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const loaded = await storage.loadPlannerState();
  const before = clone(tables.planner_weekly_tasks);
  await assert.rejects(storage.saveWeeklyPlannerState({ weekStartDate: loaded.weekStartDate,
    tasks: [{ ...loaded.weeklyTasks[0], deletedInstance: true }] }), /explicit deletion intent/);
  await storage.saveWeeklyPlannerState({ weekStartDate: loaded.weekStartDate, tasks: [] },
    { deletedTaskIds: ["app"] });
  assert.deepEqual(tables.planner_weekly_tasks.find((row) => row.id === "app"),
    { ...before[1], deleted: true, deleted_instance: true,
      updated_at: tables.planner_weekly_tasks.find((row) => row.id === "app").updated_at });
  assert.deepEqual(tables.planner_weekly_tasks.slice(2), before.slice(2));
});

test("stale edits and deletions fail before overwriting a newer checklist", async () => {
  for (const deleting of [false, true]) {
    const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
    const state = await storage.loadPlannerState();
    const app = tables.planner_weekly_tasks.find((row) => row.id === "app");
    app.checklist_json.push({ id: "newer", text: "Another session", completed: true });
    app.updated_at = "2026-10-26T17:00:00";
    const before = clone(app);
    await assert.rejects(storage.saveWeeklyPlannerState({
      weekStartDate: state.weekStartDate, tasks: deleting ? [] : [{ ...state.weeklyTasks[0], title: "stale edit" }],
    }, { deletedTaskIds: deleting ? ["app"] : [] }), /changed.*another session|changed or is missing/);
    assert.deepEqual(app, before);
  }
});

test("conditional row updates reject a race after read and retain the winning write", async () => {
  const { data, client, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const state = await data.loadPlannerState();
  client.beforeUpdate = () => {
    const app = tables.planner_weekly_tasks.find((row) => row.id === "app");
    app.title = "Winning concurrent edit";
    app.updated_at = "2026-10-26T18:00:00";
  };
  await assert.rejects(data.savePlannerState({ weeklyTasks: [{ ...state.weeklyTasks[0], title: "losing edit" }] }), /Expected one row/);
  assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "app").title, "Winning concurrent edit");
});

test("a newer write immediately after save is not adopted as an unseen client baseline", async () => {
  const { storage, tables, client } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const state = await storage.loadPlannerState();
  client.afterWrite = () => Object.assign(tables.planner_weekly_tasks[1], {
    updated_at: "2099-10-26T20:00:00",
    checklist_json: [{ id: "other-client", text: "Newer definition", completed: true }],
  });
  await assert.rejects(storage.saveWeeklyPlannerState({ weekStartDate: state.weekStartDate,
    tasks: [{ ...state.weeklyTasks[0], title: "My title edit" }] }), /changed after saving/);
  await assert.rejects(storage.saveWeeklyPlannerState({ weekStartDate: state.weekStartDate,
    tasks: [{ ...state.weeklyTasks[0], title: "Another stale edit" }] }), /changed in another session/);
  assert.equal(tables.planner_weekly_tasks[1].checklist_json[0].id, "other-client");
});

test("unchanged stale submitted rows cannot overwrite concurrent changes during another edit", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const state = await storage.loadPlannerState();
  await storage.saveWeeklyPlannerState({ weekStartDate: state.weekStartDate, tasks: state.weeklyTasks });
  const drone = tables.planner_weekly_tasks.find((row) => row.id === "drone");
  drone.title = "Newer remote title";
  drone.updated_at = "2026-10-26T18:00:00";
  const before = clone(drone);
  state.weeklyTasks[0].title = "Only App edited";
  await storage.saveWeeklyPlannerState({ weekStartDate: state.weekStartDate, tasks: state.weeklyTasks });
  assert.deepEqual(drone, before);
});

function incidentController(storage, reminderService) {
  const { createPlannerController } = exportsFrom("src/services/plannerService.js", ["createPlannerController"], {
    plannerStorage: storage, window: { location: { hash: "#planner" } },
    fetch: async () => { throw new Error("External network is forbidden"); },
    setTimeout, clearTimeout, URL, Date,
  });
  return createPlannerController({ reminderService });
}

function repeatablePlacementFixture({ projectId = p1, masterId = t1, occurrence, fallback = false } = {}) {
  const date = "2026-11-11";
  const id = `repeatable-${projectId}-${date}`;
  return {
    ...fixture({
      projects_all: fallback ? [] : [{ id: projectId, external_id: "PC0001", project_type: "repeating",
        title: "Placement fixture", recurrence: "weekly", state: "In Progress" }],
      projects_repeating: fallback ? [] : [{ id: projectId, external_id: "PC0001",
        title: "Placement fixture", recurrence: "weekly", state: "In Progress" }],
      planner_tasks: [{ id: masterId, project_id: projectId, source: "repeating",
        title: "Placement fixture", recurrence: "weekly", start_date: "2026-10-26",
        updated_at: "2026-10-20T10:00:00", metadata_json: { keep: true, series: {
          active: true, recurrence: "weekly", baseDay: "Monday", baseBucket: "Morning",
          weekdays: ["Mon"], interval: 1, startDate: "2026-10-26",
          originalStartDate: "2026-10-26",
        } } }],
      planner_weekly_tasks: [
        { id: "week-settings", metadata_json: { weekStartDate: "2026-10-19" } },
        ...(occurrence ? [{
          id, project_id: projectId, parent_rep: projectId, occurrence_date: date,
          date, time_slot: "morning", bucket: "morning", task_type: "repeatable",
          source: "repeating", title: "Placement fixture", deleted: false,
          deleted_instance: false, overridden: false, metadata_json: {},
          updated_at: "2026-10-20T10:00:00",
          checklist_json: [{ id: "keep", text: "Keep history", completed: true }],
          ...occurrence,
        }] : []),
      ],
    }),
    projectId, masterId, date, id,
  };
}

const restorationRequest = (f) => ({
  taskId: f.id, projectId: f.projectId, occurrenceDate: f.date,
  expectedUpdatedAt: f.tables.planner_weekly_tasks.find((row) => row.id === f.id)?.updated_at ?? null,
  date: f.date, timeSlot: "morning",
});

const survivingRow = (row) => {
  const value = clone(row);
  for (const key of ["deleted", "deleted_instance", "updated_at"]) delete value[key];
  return value;
};

for (const fallback of [false, true]) {
  test(`Repeatable identity separates project and master UUIDs (fallback=${fallback})`, async () => {
    const f = repeatablePlacementFixture({ fallback });
    const before = clone(f.tables.planner_tasks);
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      await controller.flush();
      const [task] = controller.getSnapshot().repeatableTasks;
      assert.equal(controller.getSnapshot().repeatableTasks.length, 1);
      assert.equal(task.id, f.projectId);
      assert.equal(task.projectId, f.projectId);
      assert.equal(task.taskId, f.masterId);
      assert.deepEqual(f.tables.planner_tasks, before);
    } finally { controller.destroy(); }
  });

  for (const series of [{ active: false }, { removedFromPlanner: true }]) {
    test(`Repeatable container policy ${JSON.stringify(series)} (fallback=${fallback})`, async () => {
      const f = repeatablePlacementFixture({ fallback });
      Object.assign(f.tables.planner_tasks[0].metadata_json.series, series);
      const before = clone(f.tables);
      const controller = incidentController(f.storage);
      try {
        await controller.actions.initialize();
        await controller.flush();
        const tasks = controller.getSnapshot().repeatableTasks;
        assert.equal(tasks.length, series.removedFromPlanner ? 0 : 1);
        if (tasks.length) assert.equal(tasks[0].active, false);
        controller.actions.generateVisibleRecurringInstances();
        await controller.flush();
        assert.deepEqual(f.tables, before);
      } finally { controller.destroy(); }
    });
  }
}

test("fallback masters with the same title keep independent identities, series updates and removal", async () => {
  const f = repeatablePlacementFixture({ fallback: true });
  const projectB = "33333333-3333-4333-8333-333333333333";
  const masterB = "44444444-4444-4444-8444-444444444444";
  f.tables.planner_tasks[0].title = "Same title";
  f.tables.planner_tasks.push({ ...clone(f.tables.planner_tasks[0]), id: masterB, project_id: projectB });
  const otherBefore = clone(f.tables.planner_tasks[1]);
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    const tasks = controller.getSnapshot().repeatableTasks;
    assert.equal(tasks.length, 2);
    assert.deepEqual(tasks.map((task) => [task.id, task.taskId]),
      [[f.projectId, f.masterId], [projectB, masterB]]);
    await controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
    controller.actions.saveSeries(f.id, {
      recurrence: "weekly", baseDay: "Wednesday", baseBucket: "Evening", applyScope: "this-future",
    });
    await controller.flush();
    assert.equal(f.tables.planner_tasks[0].id, f.masterId);
    assert.equal(f.tables.planner_tasks[0].metadata_json.series.baseBucket, "Evening");
    assert.deepEqual(f.tables.planner_tasks[1], otherBefore);
    assert(f.tables.planner_weekly_tasks.filter((row) => row.id !== "week-settings")
      .every((row) => row.project_id === f.projectId && row.parent_rep === f.projectId));
    controller.actions.removeRepeatableMaster(f.projectId);
    await controller.flush();
    assert.deepEqual(controller.getSnapshot().repeatableTasks.map((task) => task.projectId), [projectB]);
    assert.equal(f.tables.planner_tasks[0].metadata_json.series.removedFromPlanner, true);
    assert.deepEqual(f.tables.planner_tasks[1], otherBefore);
  } finally { controller.destroy(); }
});

test("fallback tombstone proposal and explicit restoration preserve the master and exact saved state", async () => {
  const f = repeatablePlacementFixture({ fallback: true, occurrence: { deleted: true, deleted_instance: true } });
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    await controller.flush();
    const before = clone(f.tables);
    const outcome = await controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
    assert.equal(outcome.status, "previously-deleted");
    assert.equal(controller.getSnapshot().restoreProposal.taskId, f.id);
    controller.actions.cancelRestore();
    assert.deepEqual(f.tables, before);
    await controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
    await controller.actions.restoreRepeatableOccurrence();
    await controller.flush();
    assert.deepEqual(f.tables.planner_tasks, before.planner_tasks);
    assert.deepEqual(survivingRow(f.tables.planner_weekly_tasks[1]), survivingRow(before.planner_weekly_tasks[1]));
    assert.equal(f.tables.planner_weekly_tasks[1].deleted, false);
    assert.equal(f.tables.planner_weekly_tasks[1].deleted_instance, false);
  } finally { controller.destroy(); }
});

for (const invalid of ["missing-project", "malformed-project", "malformed-series", "array-series", "duplicate-master"]) {
  test(`Repeatable loading fails closed without writes for ${invalid}`, async () => {
    const f = repeatablePlacementFixture({ fallback: true });
    const master = f.tables.planner_tasks[0];
    if (invalid === "missing-project") master.project_id = "";
    if (invalid === "malformed-project") master.project_id = "not-a-project-uuid";
    if (invalid === "malformed-series") master.metadata_json.series = true;
    if (invalid === "array-series") master.metadata_json.series = [];
    if (invalid === "duplicate-master") f.tables.planner_tasks.push({
      ...clone(master), id: "44444444-4444-4444-8444-444444444444",
    });
    const before = clone(f.tables);
    const controller = incidentController(f.storage);
    try {
      await assert.rejects(controller.actions.initialize(), /ownership is ambiguous|Invalid Repeatable series/);
      assert.deepEqual(controller.getSnapshot().repeatableTasks, []);
      assert.deepEqual(f.tables, before);
      assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
    } finally { controller.destroy(); }
  });
}

for (const absent of ["deleted", "missing-series"]) {
  test(`fallback excludes ${absent} masters without modifying data`, async () => {
    const f = repeatablePlacementFixture({ fallback: true });
    if (absent === "deleted") f.tables.planner_tasks[0].deleted = true;
    else delete f.tables.planner_tasks[0].metadata_json.series;
    const before = clone(f.tables);
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      assert.equal(controller.getSnapshot().repeatableTasks.length, 0);
      assert.deepEqual(f.tables, before);
    } finally { controller.destroy(); }
  });
}

for (const legacySeries of [undefined, null]) {
  test(`ineligible legacy masters do not block mixed Repeatable initialization (series=${legacySeries})`, async () => {
    const f = repeatablePlacementFixture();
    const fallbackProject = "33333333-3333-4333-8333-333333333333";
    const fallbackMaster = "44444444-4444-4444-8444-444444444444";
    f.tables.planner_tasks.push({
      ...clone(f.tables.planner_tasks[0]), id: fallbackMaster, project_id: fallbackProject,
    });
    const legacy = {
      id: "55555555-5555-4555-8555-555555555555", project_id: "107", source: "repeating",
      deleted: null, metadata_json: legacySeries === undefined ? {} : { series: legacySeries },
    };
    f.tables.planner_tasks.push(legacy, {
      ...clone(legacy), id: "66666666-6666-4666-8666-666666666666",
    }, {
      ...clone(legacy), id: "77777777-7777-4777-8777-777777777777", project_id: fallbackProject,
    });
    const before = clone(f.tables);
    let stageReads = 0;
    const readStaged = f.storage.getStagedTasks;
    f.storage.getStagedTasks = async () => { stageReads += 1; return readStaged(); };
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      await controller.flush();
      const snapshot = controller.getSnapshot();
      assert.equal(snapshot.loading, false);
      assert.equal(snapshot.error, "");
      assert.deepEqual(snapshot.repeatableTasks.map((task) => [task.id, task.projectId, task.taskId])
        .sort((left, right) => left[0].localeCompare(right[0])),
        [[f.projectId, f.projectId, f.masterId], [fallbackProject, fallbackProject, fallbackMaster]]);
      assert.equal(stageReads, 1);
      assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
      assert.deepEqual(f.tables, before);
      const placed = await controller.actions.dropOnSlot(
        { kind: "repeatable-copy", projectId: fallbackProject }, "wed", f.date, "morning");
      assert.equal(placed.status, "created");
      await controller.flush();
      assert.equal(f.tables.planner_tasks.find((row) => row.id === fallbackMaster).project_id, fallbackProject);
      assert.deepEqual(f.tables.planner_tasks.filter((row) => ["107", fallbackProject].includes(row.project_id)
        && row.id !== fallbackMaster), before.planner_tasks.filter((row) => ["107", fallbackProject].includes(row.project_id)
        && row.id !== fallbackMaster));
    } finally { controller.destroy(); }
  });
}

test("removed fallback candidates do not compete with included ownership or reappear", async () => {
  const f = repeatablePlacementFixture({ fallback: true });
  const removed = { ...clone(f.tables.planner_tasks[0]),
    id: "44444444-4444-4444-8444-444444444444" };
  removed.metadata_json.series.removedFromPlanner = true;
  f.tables.planner_tasks.push(removed, {
    ...clone(removed), id: "55555555-5555-4555-8555-555555555555", project_id: "107",
  });
  const before = clone(f.tables);
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    assert.deepEqual(controller.getSnapshot().repeatableTasks.map((task) => [task.projectId, task.taskId]),
      [[f.projectId, f.masterId]]);
    assert.deepEqual(f.tables, before);
    assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
    await assert.rejects(f.storage.saveRepeatableOverrides([{
      projectId: f.projectId, taskId: f.masterId, baseBucket: "Evening",
    }]), /ownership is ambiguous/);
    assert.deepEqual(f.tables, before);
  } finally { controller.destroy(); }
});

test("eligible invalid ownership aborts before staged processing even with ineligible legacy rows", async () => {
  const f = repeatablePlacementFixture({ fallback: true });
  f.tables.planner_tasks[0].project_id = "invalid-series-owner";
  f.tables.planner_tasks.push({
    id: "55555555-5555-4555-8555-555555555555", project_id: "107",
    source: "repeating", deleted: null, metadata_json: {},
  });
  let stages = 0;
  f.storage.getStagedTasks = async () => { stages += 1; throw new Error("Staging must not be reached"); };
  const before = clone(f.tables);
  const controller = incidentController(f.storage);
  try {
    await assert.rejects(controller.actions.initialize(), /ownership is ambiguous/);
    assert.equal(stages, 0);
    assert.deepEqual(f.tables, before);
    assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
  } finally { controller.destroy(); }
});

for (const series of [false, 7, "invalid", []]) {
  test(`non-object present series remains an explicit initialization error: ${JSON.stringify(series)}`, async () => {
    const f = repeatablePlacementFixture({ fallback: true });
    f.tables.planner_tasks[0].metadata_json.series = series;
    const controller = incidentController(f.storage);
    const before = clone(f.tables);
    try {
      await assert.rejects(controller.actions.initialize(), /Invalid Repeatable series metadata/);
      assert.deepEqual(f.tables, before);
      assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
    } finally { controller.destroy(); }
  });
}

test("series persistence rejects duplicate or mismatched master ownership before any write", async () => {
  for (const conflict of ["duplicate", "mismatched-id"]) {
    const f = repeatablePlacementFixture({ fallback: true });
    const [override] = await f.storage.getRepeatableOverrides();
    if (conflict === "duplicate") f.tables.planner_tasks.push({
      ...clone(f.tables.planner_tasks[0]), id: "44444444-4444-4444-8444-444444444444",
    });
    else override.taskId = "44444444-4444-4444-8444-444444444444";
    const before = clone(f.tables);
    f.calls.length = 0;
    await assert.rejects(f.storage.saveRepeatableOverrides([{ ...override, baseBucket: "Evening" }]),
      /ownership is ambiguous/);
    assert.deepEqual(f.tables, before);
    assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
  }
});

test("placement still rejects a mismatched controller identity before master or weekly mutation", async () => {
  const f = repeatablePlacementFixture({ fallback: true, occurrence: {} });
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    await controller.flush();
    controller.actions.getSeries(f.id).master.id = f.masterId;
    const before = clone(f.tables);
    f.calls.length = 0;
    await assert.rejects(controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning"), /ownership is ambiguous/);
    assert.deepEqual(f.tables, before);
    assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
  } finally { controller.destroy(); }
});

test("first-series staging preserves the existing project-derived Planner master UUID", async () => {
  const f = repeatablePlacementFixture();
  delete f.tables.planner_tasks[0].metadata_json.series;
  f.tables.planner_tasks[0].metadata_json.queue = "staged";
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    await controller.flush();
    const [task] = controller.getSnapshot().repeatableTasks;
    assert.equal(task.id, f.projectId);
    assert.equal(task.projectId, f.projectId);
    assert.equal(task.taskId, f.masterId);
    assert.equal(f.tables.planner_tasks.length, 1);
    assert.equal(f.tables.planner_tasks[0].id, f.masterId);
    assert.equal(f.tables.planner_tasks[0].project_id, f.projectId);
    assert.equal(f.tables.planner_tasks[0].metadata_json.queue, null);
    assert.equal(f.tables.planner_tasks[0].metadata_json.series.active, true);
    assert.equal(Object.hasOwn(f.tables.planner_tasks[0].metadata_json.series, "taskId"), false);
  } finally { controller.destroy(); }
});

test("Repeatable restoration Cancel performs zero writes and keeps the master and tombstone", async () => {
  const f = repeatablePlacementFixture({ occurrence: { deleted: true, deleted_instance: true } });
  const reminderCalls = [];
  const controller = incidentController(f.storage, new Proxy({}, {
    get: (_, name) => () => { reminderCalls.push(name); throw new Error("Restoration must not call reminder APIs"); },
  }));
  try {
    await controller.actions.initialize();
    await controller.flush();
    const before = clone(f.tables);
    f.calls.length = 0;
    const outcome = await controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
    assert.equal(outcome.status, "previously-deleted");
    assert.equal(controller.getSnapshot().restoreProposal.expectedUpdatedAt, restorationRequest(f).expectedUpdatedAt);
    controller.actions.cancelRestore();
    assert.equal(controller.getSnapshot().restoreProposal, null);
    assert.deepEqual(f.tables, before);
    assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
    assert.deepEqual(reminderCalls, []);
  } finally { controller.destroy(); }
});

for (const flags of [{ deleted: true }, { deleted_instance: true }, { deleted: true, deleted_instance: true }]) {
  test(`explicit Repeatable restoration preserves raw state with flags ${JSON.stringify(flags)}`, async () => {
    const f = repeatablePlacementFixture({ occurrence: {
      ...flags, completed: true, checklist_open: true, overridden: true,
      date: "2026-11-12", time_slot: "afternoon", bucket: "Afternoon",
      checklist_json: [{ id: "b", text: "Second", completed: true }, { id: "a", text: "First", completed: false }],
      reminder_json: { active: false, note: "Historical reminder", notificationId: "retain" },
      metadata_json: { override: { date: "2026-11-13", completed: true, keep: "exact" },
        weeklyPosition: 7, generated: true, notes: "Keep notes", unrelated: { array: [3, 1] } },
    } });
    const reminderCalls = [];
    const controller = incidentController(f.storage, new Proxy({}, {
      get: (_, name) => () => { reminderCalls.push(name); throw new Error("Restoration must not call reminder APIs"); },
    }));
    try {
      await controller.actions.initialize();
      await controller.flush();
      const before = clone(f.tables.planner_weekly_tasks.find((row) => row.id === f.id));
      const master = clone(f.tables.planner_tasks);
      await controller.actions.dropOnSlot(
        { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
      assert.equal(controller.getSnapshot().restoreProposal.date, "2026-11-13");
      assert.equal(controller.getSnapshot().restoreProposal.timeSlot, "afternoon");
      f.calls.length = 0;
      const result = await controller.actions.restoreRepeatableOccurrence();
      await controller.flush();
      assert.deepEqual(plain(result), { status: "restored", taskId: f.id, projectId: f.projectId,
        occurrenceDate: f.date, date: "2026-11-13", timeSlot: "afternoon" });
      const saved = f.tables.planner_weekly_tasks.find((row) => row.id === f.id);
      assert.equal(saved.deleted, false);
      assert.equal(saved.deleted_instance, false);
      assert.notEqual(saved.updated_at, before.updated_at);
      assert.deepEqual(survivingRow(saved), survivingRow(before));
      assert.deepEqual(f.tables.planner_tasks, master);
      assert.deepEqual(reminderCalls, []);
      const writes = f.calls.filter((call) => call.op !== "read");
      assert.equal(writes.length, 1);
      assert.equal(writes[0].op, "update");
      assert.equal(writes[0].table, "planner_weekly_tasks");
      assert.deepEqual(Object.keys(writes[0].payload).sort(), ["deleted", "deleted_instance", "updated_at"]);
      assert.equal(f.tables.planner_weekly_tasks.filter((row) => row.id === f.id).length, 1);
      assert.match(controller.getSnapshot().status, /^Restored .*2026-11-13, afternoon/);
      assert.equal(controller.getSnapshot().restoreProposal, null);
      controller.actions.moveTask(f.id, "2026-11-14", "evening");
      await controller.flush();
      assert.equal(f.tables.planner_weekly_tasks.find((row) => row.id === f.id).date, "2026-11-14",
        "ordinary edits use authoritative restored revision");
    } finally { controller.destroy(); }
  });
}

test("Repeatable restoration same location delays success and rejects repeated clicks and incompatible actions", async () => {
  const f = repeatablePlacementFixture({ occurrence: { deleted: true, deleted_instance: true } });
  const controller = incidentController(f.storage);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    await controller.actions.initialize();
    await controller.flush();
    await controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
    const before = clone(f.tables.planner_tasks);
    const original = f.storage.restoreRepeatableOccurrence;
    let calls = 0;
    f.storage.restoreRepeatableOccurrence = async (...args) => { calls += 1; await gate; return original(...args); };
    const restoring = controller.actions.restoreRepeatableOccurrence();
    await Promise.resolve();
    assert.equal(controller.getSnapshot().restoreBusy, true);
    assert.doesNotMatch(controller.getSnapshot().status, /^Restored /);
    controller.actions.cancelRestore();
    assert(controller.getSnapshot().restoreProposal);
    assert.throws(() => controller.actions.restoreRepeatableOccurrence(), /restoration to finish/);
    assert.throws(() => controller.actions.jumpPlannerToDate(f.date), /restoration decision/);
    release();
    const result = await restoring;
    assert.equal(result.status, "restored");
    assert.equal(calls, 1);
    assert.deepEqual(f.tables.planner_tasks, before);
    assert.equal(controller.getSnapshot().restoreBusy, false);
  } finally { release(); controller.destroy(); }
});

for (const condition of ["stale", "missing", "duplicate", "wrong-owner", "master-missing",
  "master-deleted", "master-inactive", "other-bucket", "moved", "cas", "rejected", "post-write"]) {
  test(`Repeatable restoration fails closed for ${condition} without insertion or master writes`, async () => {
    const f = repeatablePlacementFixture({ occurrence: { deleted: true, deleted_instance: true } });
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      await controller.flush();
      await controller.actions.dropOnSlot(
        { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
      const row = f.tables.planner_weekly_tasks.find((item) => item.id === f.id);
      if (condition === "stale") { row.updated_at = "2026-11-01T10:00:00"; row.title = "Newer"; }
      if (condition === "missing") f.tables.planner_weekly_tasks.splice(f.tables.planner_weekly_tasks.indexOf(row), 1);
      if (condition === "duplicate") f.tables.planner_weekly_tasks.push({ ...clone(row), id: "conflict", deleted: false, deleted_instance: false });
      if (condition === "wrong-owner") row.project_id = "other-project";
      if (condition === "master-missing") f.tables.planner_tasks.length = 0;
      if (condition === "master-deleted") f.tables.planner_tasks[0].deleted = true;
      if (condition === "master-inactive") f.tables.planner_tasks[0].metadata_json.series.active = false;
      if (condition === "other-bucket") row.time_slot = "evening";
      if (condition === "moved") row.metadata_json.override = { date: "2026-11-14" };
      if (condition === "cas") f.client.beforeUpdate = () => { row.updated_at = "2026-11-01T10:00:00"; row.title = "Newer"; };
      if (condition === "rejected") f.client.failNext("planner_weekly_tasks");
      if (condition === "post-write") f.client.afterWrite = () => { row.updated_at = "2026-11-01T10:00:00"; };
      const before = clone(f.tables);
      f.calls.length = 0;
      await assert.rejects(controller.actions.restoreRepeatableOccurrence(), /Reload Planner/);
      const snapshot = controller.getSnapshot();
      assert.match(snapshot.restoreError, /Reload Planner/);
      assert.doesNotMatch(snapshot.status, /^Restored /);
      assert.equal(snapshot.restoreBusy, false);
      assert.equal(f.calls.filter((call) => call.op === "insert").length, 0);
      assert.equal(f.calls.filter((call) => call.op !== "read" && call.table !== "planner_weekly_tasks").length, 0);
      if (!["cas", "post-write"].includes(condition)) assert.deepEqual(f.tables, before);
      if (condition === "cas") {
        assert.equal(row.title, "Newer");
        assert.equal(row.deleted, true);
        assert.match(snapshot.restoreError, /Nothing was restored by this request/);
      }
      if (["rejected", "post-write"].includes(condition)) assert.match(snapshot.restoreError, /may have been restored/);
      controller.actions.cancelRestore();
      assert.equal(controller.getSnapshot().restoreProposal, null, "errors do not prevent dismissal");
    } finally { controller.destroy(); }
  });
}

test("Repeatable restoration uses monotonic revisions and accepts null revision with exact CAS", async () => {
  for (const revision of [null, "2099-01-01T00:00:00"]) {
    const f = repeatablePlacementFixture({ occurrence: { deleted: true, updated_at: revision } });
    const request = restorationRequest(f);
    await f.storage.loadPlannerState();
    const saved = await f.storage.restoreRepeatableOccurrence(request);
    assert.equal(saved.id, f.id);
    assert(saved.updatedAt);
    if (revision) assert(Date.parse(saved.updatedAt) > Date.parse(`${revision}Z`));
  }
});

test("Repeatable restoration update-only boundary rejects invalid intent and ambiguous masters", async () => {
  for (const condition of ["wrong-id", "no-revision", "invalid-date", "invalid-bucket", "duplicate-master", "removed-master"]) {
    const f = repeatablePlacementFixture({ occurrence: { deleted: true } });
    const request = restorationRequest(f);
    if (condition === "wrong-id") request.taskId = "replacement-id";
    if (condition === "no-revision") delete request.expectedUpdatedAt;
    if (condition === "invalid-date") request.date = "2026-02-31";
    if (condition === "invalid-bucket") request.timeSlot = "all-day";
    if (condition === "duplicate-master") f.tables.planner_tasks.push({ ...clone(f.tables.planner_tasks[0]), id: "another-master" });
    if (condition === "removed-master") f.tables.planner_tasks[0].metadata_json.series.removedFromPlanner = true;
    const before = clone(f.tables);
    await assert.rejects(f.data.restoreRepeatableOccurrence(request), /conflicts with this series and date/);
    assert.deepEqual(f.tables, before);
    assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
  }
});

test("Repeatable restoration cannot claim success if verification detects changed surviving data", async () => {
  const f = repeatablePlacementFixture({ occurrence: { deleted: true } });
  const request = restorationRequest(f);
  const row = f.tables.planner_weekly_tasks[1];
  f.client.afterWrite = () => { row.metadata_json = { concurrent: true }; };
  await assert.rejects(f.data.restoreRepeatableOccurrence(request), /may have been restored/);
  assert.equal(row.deleted, false);
  assert.deepEqual(row.metadata_json, { concurrent: true });
  assert.equal(f.calls.filter((call) => call.op === "insert").length, 0);
});

test("Repeatable restoration is not offered for invalid saved date or non-Repeatable ownership", async () => {
  for (const occurrence of [
    { deleted: true, metadata_json: { override: { date: "2026-02-31" } } },
    { deleted: true, task_type: "curated" },
    { deleted: true, source: "home" },
  ]) {
    const f = repeatablePlacementFixture({ occurrence });
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      await controller.flush();
      const before = clone(f.tables);
      const outcome = await controller.actions.dropOnSlot(
        { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning");
      assert.equal(outcome.status, "previously-deleted");
      assert.equal(controller.getSnapshot().restoreProposal, null);
      assert.deepEqual(f.tables, before);
    } finally { controller.destroy(); }
  }
});

test("Repeatable placement reports existing occurrences without changing masters, rows or deletion history", async () => {
  const cases = [
    { row: { deleted: true }, status: "previously-deleted", message: /previously deleted/ },
    { row: { deleted_instance: true }, status: "previously-deleted", message: /previously deleted/ },
    { row: { deleted: true, deleted_instance: true }, status: "previously-deleted", message: /previously deleted/ },
    { row: {}, status: "already-scheduled", message: /already scheduled/ },
    { row: { time_slot: "evening", bucket: "evening" }, status: "existing-bucket", message: /evening/ },
    { row: { date: "2026-11-12", overridden: true }, status: "moved", message: /2026-11-12/ },
    { row: { overridden: true, metadata_json: { override: { date: "2026-11-13" } } },
      status: "moved", message: /2026-11-13/ },
  ];
  for (const projectId of [p1, "33333333-3333-4333-8333-333333333333"]) {
    for (const entry of cases) {
      const f = repeatablePlacementFixture({ projectId, occurrence: entry.row });
      const controller = incidentController(f.storage);
      try {
        await controller.actions.initialize();
        await controller.flush();
        const before = clone(f.tables);
        const masterBefore = plain(controller.getSnapshot().repeatableTasks);
        f.calls.length = 0;
        const result = await controller.actions.dropOnSlot(
          { kind: "repeatable-copy", projectId }, "wed", f.date, "morning");
        await controller.flush();
        assert.equal(result.status, entry.status);
        assert.equal(result.taskId, f.id);
        assert.equal(result.projectId, projectId);
        assert.equal(result.occurrenceDate, f.date);
        assert.equal(result.date, entry.row.metadata_json?.override?.date || entry.row.date || f.date);
        assert.equal(result.timeSlot, entry.row.time_slot || "morning");
        assert.match(controller.getSnapshot().status, entry.message);
        assert.doesNotMatch(controller.getSnapshot().status, /^Added repeatable task/);
        assert.deepEqual(f.tables, before);
        assert.deepEqual(plain(controller.getSnapshot().repeatableTasks), masterBefore);
        assert.equal(f.calls.filter((call) => call.op !== "read").length, 0);
      } finally { controller.destroy(); }
    }
  }
});

for (const fallback of [false, true]) {
test(`Repeatable placement awaits master and weekly persistence (fallback=${fallback})`, async () => {
  const f = repeatablePlacementFixture({ fallback });
  const controller = incidentController(f.storage);
  let releaseMaster, releaseWeekly, masterStarted, weeklyStarted;
  const masterEntered = new Promise((resolve) => { masterStarted = resolve; });
  const weeklyEntered = new Promise((resolve) => { weeklyStarted = resolve; });
  const masterGate = new Promise((resolve) => { releaseMaster = resolve; });
  const weeklyGate = new Promise((resolve) => { releaseWeekly = resolve; });
  const saveMaster = f.storage.saveRepeatableOverrides;
  const saveWeekly = f.storage.saveWeeklyPlannerState;
  try {
    await controller.actions.initialize();
    await controller.flush();
    f.storage.saveRepeatableOverrides = async (...args) => {
      masterStarted();
      await masterGate;
      return saveMaster(...args);
    };
    f.storage.saveWeeklyPlannerState = async (...args) => {
      weeklyStarted();
      await weeklyGate;
      return saveWeekly(...args);
    };
    let finished = false;
    const placement = controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning")
      .then((result) => { finished = true; return result; });
    await masterEntered;
    assert.equal(finished, false);
    assert.doesNotMatch(controller.getSnapshot().status, /^Added/);
    assert.equal(f.tables.planner_weekly_tasks.some((row) => row.id === f.id), false);
    await assert.rejects(controller.actions.dropOnSlot(
      { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning"), /still saving/);
    releaseMaster();
    await weeklyEntered;
    assert.equal(finished, false);
    assert.doesNotMatch(controller.getSnapshot().status, /^Added/);
    releaseWeekly();
    assert.deepEqual(plain(await placement), {
      status: "created", taskId: f.id, projectId: f.projectId,
      occurrenceDate: f.date, date: f.date, timeSlot: "morning",
    });
    await controller.flush();
    const row = f.tables.planner_weekly_tasks.find((item) => item.id === f.id);
    assert.equal(row.parent_rep, f.projectId);
    assert.equal(row.project_id, f.projectId);
    assert.equal(row.occurrence_date, f.date);
    assert.equal(row.date, f.date);
    assert.equal(row.time_slot, "morning");
    assert.equal(row.bucket, "morning");
    assert.equal(row.deleted, false);
    assert.equal(row.deleted_instance, false);
    const master = f.tables.planner_tasks[0];
    assert.equal(master.id, f.masterId);
    assert.notEqual(master.id, master.project_id);
    assert.equal(master.start_date, f.date);
    assert.equal(master.metadata_json.series.baseDay, "Wednesday");
    assert.equal(master.metadata_json.series.baseBucket, "Morning");
    assert.deepEqual(master.metadata_json.series.weekdays, ["Wed"]);
    assert.equal(master.metadata_json.keep, true);
    assert.match(controller.getSnapshot().status, /^Added repeatable task/);
    const { selectWeeklyView } = exportsFrom("src/services/plannerService.js",
      ["selectWeeklyView"], { plannerStorage: f.storage });
    const snapshot = controller.getSnapshot();
    snapshot.planner.weekStartDate = "2026-11-09";
    assert.equal(selectWeeklyView(snapshot).days[2].slots[0].tasks[0].id, f.id);
  } finally {
    releaseMaster();
    releaseWeekly();
    controller.destroy();
  }
});
}

for (const failure of ["master", "weekly", "stale-master", "concurrent-weekly", "changed-after-weekly"]) {
  test(`Repeatable placement surfaces ${failure} failure without a success-shaped result`, async () => {
    const f = repeatablePlacementFixture();
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      await controller.flush();
      const beforeMaster = clone(f.tables.planner_tasks[0]);
      if (failure === "master") f.client.failNext("planner_tasks");
      if (failure === "weekly") f.client.failNext("planner_weekly_tasks");
      if (failure === "stale-master") {
        f.client.beforeUpdate = (table) => {
          assert.equal(table, "planner_tasks");
          f.tables.planner_tasks[0].updated_at = "2026-10-26T23:00:00";
        };
      }
      if (failure === "concurrent-weekly") {
        f.client.afterWrite = (table) => {
          assert.equal(table, "planner_tasks");
          f.tables.planner_weekly_tasks.push({
            id: f.id, project_id: f.projectId, parent_rep: f.projectId,
            occurrence_date: f.date, date: f.date, time_slot: "evening",
            task_type: "repeatable", metadata_json: {}, updated_at: "2026-10-26T23:00:00",
          });
        };
      }
      if (failure === "changed-after-weekly") {
        f.client.beforeInsert = (table) => {
          assert.equal(table, "planner_weekly_tasks");
          f.client.afterWrite = () => {
            f.tables.planner_weekly_tasks.find((row) => row.id === f.id).updated_at = "2026-10-26T23:00:00";
          };
        };
      }
      await assert.rejects(controller.actions.dropOnSlot(
        { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning"),
      /placement was not confirmed.*may have been saved.*Reload before editing/);
      assert.match(controller.getSnapshot().error, /placement was not confirmed/);
      assert.doesNotMatch(controller.getSnapshot().status, /^Added repeatable task/);
      await assert.rejects(controller.flush());
      assert.throws(() => controller.actions.jumpPlannerToDate(f.date), /unsaved change/);
      const rows = f.tables.planner_weekly_tasks.filter((row) => row.id === f.id);
      if (failure === "master") {
        assert.deepEqual(f.tables.planner_tasks[0], beforeMaster);
        assert.equal(rows.length, 0);
      } else if (failure === "stale-master") {
        assert.equal(f.tables.planner_tasks[0].start_date, beforeMaster.start_date);
        assert.equal(rows.length, 0);
      } else {
        assert.equal(f.tables.planner_tasks[0].start_date, f.date,
          "master save may persist before a later weekly failure");
        assert.equal(rows.length, failure === "weekly" ? 0 : 1);
        if (rows.length) assert.equal(rows[0].time_slot, failure === "concurrent-weekly" ? "evening" : "morning");
      }
    } finally { controller.destroy(); }
  });
}

test("Repeatable placement fails closed on duplicate or conflicting occurrence ownership", async () => {
  for (const conflict of ["duplicate", "owner"]) {
    const f = repeatablePlacementFixture({ occurrence: {} });
    if (conflict === "duplicate") {
      f.tables.planner_weekly_tasks.push({
        ...clone(f.tables.planner_weekly_tasks[1]), id: "another-occurrence",
      });
    } else f.tables.planner_weekly_tasks[1].project_id = "another-project";
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      await controller.flush();
      const before = clone(f.tables);
      await assert.rejects(controller.actions.dropOnSlot(
        { kind: "repeatable-copy", projectId: f.projectId }, "wed", f.date, "morning"), /ownership is ambiguous/);
      assert.deepEqual(f.tables, before);
    } finally { controller.destroy(); }
  }
});

test("Project restaging is same-ID continuation across weeks with checklist progress and metadata intact", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    const before = clone(tables.planner_weekly_tasks.find((row) => row.id === "app"));
    controller.actions.shiftPlannerWeek(7);
    controller.actions.assignTask(t1, "tue", "afternoon");
    await controller.flush();
    const after = tables.planner_weekly_tasks.find((row) => row.id === "app");
    assert.equal(after.date, "2026-11-03");
    assert.deepEqual(after.checklist_json, before.checklist_json);
    assert.deepEqual(after.reminder_json, before.reminder_json);
    assert.equal(after.metadata_json.preserve, "app");
    assert.equal(after.metadata_json.sourceTaskId, t1);
    assert.equal(tables.planner_weekly_tasks.length, 5);
  } finally { controller.destroy(); }
});

test("explicit template approval persists definition only; fresh work resets completion without altering history", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    const old = clone(tables.planner_weekly_tasks.find((row) => row.id === "app"));
    await controller.actions.saveChecklistTemplate("app");
    const template = tables.planner_tasks[0].metadata_json.checklistTemplate;
    assert.deepEqual(template, { version: 1, items: old.checklist_json.map(({ id, text }) => ({ id, text })) });
    controller.actions.assignTask(t1, "tue", "evening", { fresh: true });
    await controller.flush();
    const fresh = tables.planner_weekly_tasks.find((row) => row.id !== "app" && row.metadata_json?.sourceTaskId === t1);
    assert(fresh);
    assert.equal(fresh.checklist_json.length, 11);
    assert(fresh.checklist_json.every((item) => item.completed === false));
    assert.deepEqual(fresh.checklist_json.map(({ id, text }) => ({ id, text })), template.items);
    assert.deepEqual(tables.planner_weekly_tasks.find((row) => row.id === "app"), old);
    assert.throws(() => controller.actions.assignTask(t1, "wed", "morning"), /multiple unfinished/);
  } finally { controller.destroy(); }
});

test("historical/tombstoned checklist without approved template fails closed, never selects by title or recency", async () => {
  const rows = incidentFixtureRows();
  rows[1].deleted = true;
  rows[1].deleted_instance = true;
  const { storage, tables, calls } = fixture({ planner_weekly_tasks: rows });
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    const before = clone(tables.planner_weekly_tasks);
    const start = calls.length;
    assert.throws(() => controller.actions.assignTask(t1, "tue", "morning"), /no approved checklist template/);
    assert.throws(() => controller.actions.assignTask(t1, "tue", "morning", { fresh: true }), /no approved checklist template/);
    assert.deepEqual(tables.planner_weekly_tasks, before);
    assert(calls.slice(start).every((call) => call.op === "read"));
  } finally { controller.destroy(); }
});

test("same-date continuation never replaces an edited nonempty destination checklist", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    const before = clone(tables.planner_weekly_tasks.find((row) => row.id === "app").checklist_json);
    controller.actions.assignTask(t1, "mon", "evening");
    await controller.flush();
    assert.deepEqual(tables.planner_weekly_tasks.find((row) => row.id === "app").checklist_json, before);
    assert.equal(tables.planner_weekly_tasks.length, 5);
  } finally { controller.destroy(); }
});

test("weekly deletion actions persist exact occurrence and entire-series intent without touching other series", async () => {
  for (const entire of [false, true]) {
    const rows = [
      { id: "week-settings", metadata_json: { weekStartDate: "2026-10-26" } },
      ...["one", "two", "other"].map((id) => ({
        id, title: id, project_id: id === "other" ? "other-project" : p1,
        parent_rep: id === "other" ? "other-project" : p1,
        occurrence_date: id === "two" ? "2026-11-02" : "2026-10-26",
        date: id === "two" ? "2026-11-02" : "2026-10-26",
        task_type: "repeatable", source: "repeating", time_slot: "morning",
        deleted: false, deleted_instance: false, metadata_json: {},
        checklist_json: [{ id: "retain", text: "Retain history", completed: true }],
      })),
    ];
    const { storage, tables } = fixture({
      projects_all: [{ id: p1, external_id: "PC0001", project_type: "repeating", title: "Series",
        recurrence: "weekly", state: "In Progress" }],
      projects_repeating: [{ id: p1, external_id: "PC0001", title: "Series",
        recurrence: "weekly", state: "In Progress" }],
      planner_tasks: [{ id: t1, project_id: p1, source: "repeating", title: "Series", recurrence: "weekly",
        start_date: "2026-10-26", metadata_json: { series: { active: true, recurrence: "weekly",
          baseDay: "Monday", startDate: "2026-10-26", originalStartDate: "2026-10-26", baseBucket: "Morning" } } }],
      planner_weekly_tasks: rows,
    });
    const controller = incidentController(storage);
    try {
      await controller.actions.initialize();
      const before = clone(tables.planner_weekly_tasks.find((row) => row.id === "other"));
      if (entire) controller.actions.deleteSeries("one");
      else controller.actions.removeTask("one");
      await controller.flush();
      assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "one").deleted_instance, true);
      assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "one").deleted, true);
      assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "two").deleted_instance, entire);
      assert.deepEqual(tables.planner_weekly_tasks.find((row) => row.id === "other"), before);
      assert(tables.planner_weekly_tasks.find((row) => row.id === "one").checklist_json[0].completed);
    } finally { controller.destroy(); }
  }
});

test("newly concurrent Project occurrences and reloaded stale client revisions fail closed", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const state = await storage.loadPlannerState();
  tables.planner_weekly_tasks.push({ ...clone(tables.planner_weekly_tasks[1]), id: "concurrent-app" });
  await assert.rejects(storage.saveWeeklyPlannerState({ weekStartDate: state.weekStartDate,
    tasks: [{ ...state.weeklyTasks[0], date: "2026-10-27" }] }), /occurrences.*changed/);
  tables.planner_weekly_tasks.pop();
  tables.planner_weekly_tasks[1].updated_at = "2026-10-26T19:00:00";
  await storage.loadPlannerState();
  await assert.rejects(storage.saveWeeklyPlannerState({ weekStartDate: state.weekStartDate,
    tasks: [{ ...state.weeklyTasks[0], date: "2026-10-27" }] }), /older revision/);
});

test("all recurrence edit scopes preserve same-date rows, exceptions and other projects", async () => {
  for (const scope of ["future", "this-future", "entire"]) {
    const row = { id: `repeatable-${p1}-2026-10-26`, project_id: p1, parent_rep: p1,
      title: "Series", source: "repeating", task_type: "repeatable", occurrence_date: "2026-10-26",
      date: "2026-10-26", time_slot: "morning", metadata_json: {}, checklist_json: [],
      deleted: false, deleted_instance: false, updated_at: "2026-10-26T11:00:00" };
    const { storage, tables } = fixture({
      projects_all: [{ id: p1, external_id: "PC0001", project_type: "repeating", title: "Series",
        recurrence: "weekly", state: "In Progress" }],
      projects_repeating: [{ id: p1, external_id: "PC0001", title: "Series", recurrence: "weekly", state: "In Progress" }],
      planner_tasks: [{ id: t1, project_id: p1, source: "repeating", title: "Series", recurrence: "weekly",
        metadata_json: { series: { active: true, recurrence: "weekly", baseDay: "Monday",
          startDate: "2026-10-26", originalStartDate: "2026-10-26", baseBucket: "Morning" } } }],
      planner_weekly_tasks: [
        { id: "week-settings", metadata_json: { weekStartDate: "2026-10-26" } }, row,
        { ...row, id: "exception", overridden: true, occurrence_date: "2026-10-19", date: "2026-10-27" },
        { ...row, id: "unrelated-series", project_id: "unrelated", parent_rep: "unrelated" },
      ],
    });
    const controller = incidentController(storage);
    try {
      await controller.actions.initialize();
      const exception = clone(tables.planner_weekly_tasks.find((item) => item.id === "exception"));
      const unrelated = clone(tables.planner_weekly_tasks.find((item) => item.id === "unrelated-series"));
      controller.actions.saveSeries(row.id, { recurrence: "weekly", baseDay: "Monday",
        baseBucket: "Evening", applyScope: scope });
      await controller.flush();
      assert.deepEqual(tables.planner_weekly_tasks.find((item) => item.id === "exception"), exception);
      assert.deepEqual(tables.planner_weekly_tasks.find((item) => item.id === "unrelated-series"), unrelated);
      assert.equal(tables.planner_weekly_tasks.find((item) => item.id === row.id).time_slot, scope === "future" ? "morning" : "evening");
    } finally { controller.destroy(); }
  }
});

function recurrenceContinuationFixture() {
  const dates = ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-30"];
  const rows = dates.map((date, index) => ({
    id: `repeatable-${p1}-${date}`, project_id: p1, parent_rep: p1,
    title: "Disposable series", source: "repeating", task_type: "repeatable",
    occurrence_date: date, date, time_slot: "morning", bucket: "morning",
    completed: index === 1, deleted: index === 3, deleted_instance: index === 3,
    metadata_json: { marker: `preserve-${index}`, weeklyPosition: index },
    checklist_json: [{ id: "first", text: "First", completed: true },
      { id: "second", text: "Second", completed: false }],
    reminder_json: { active: false, note: "Preserve reminder" },
    updated_at: "2026-10-26T10:00:00",
  }));
  return fixture({
    projects_all: [{ id: p1, external_id: "PC0001", project_type: "repeating",
      title: "Disposable series", recurrence: "weekly", state: "In Progress" }],
    projects_repeating: [{ id: p1, external_id: "PC0001", title: "Disposable series",
      recurrence: "weekly", state: "In Progress" }],
    planner_tasks: [{ id: t1, project_id: p1, source: "repeating", title: "Disposable series",
      recurrence: "weekly", metadata_json: { series: { active: true, recurrence: "weekly",
        baseDay: "Monday", startDate: dates[0], originalStartDate: dates[0], baseBucket: "Morning" } } }],
    planner_weekly_tasks: [
      { id: "week-settings", metadata_json: { weekStartDate: dates[0] } }, ...rows,
      { ...clone(rows[0]), id: "overridden", occurrence_date: "2026-10-19",
        date: "2026-11-03", overridden: true },
      { ...clone(rows[1]), id: "unrelated-series", project_id: "other", parent_rep: "other" },
      { ...clone(rows[1]), id: "unrelated-adhoc", project_id: null, parent_rep: null,
        source: "adhoc", task_type: "adhoc" },
    ],
  });
}

test("rollover materialization preserves every existing row and inherits only approved master definitions", async () => {
  for (const checklist of [null, [], [{ id: "progress", text: "Occurrence progress", completed: true }]]) {
    const f = recurrenceContinuationFixture();
    const currentId = `repeatable-${p1}-2026-10-26`;
    const newId = `repeatable-${p1}-2026-11-02`;
    f.tables.planner_weekly_tasks = f.tables.planner_weekly_tasks.filter((row) => row.id !== newId);
    f.tables.planner_weekly_tasks.find((row) => row.id === currentId).checklist_json = clone(checklist);
    f.tables.planner_tasks[0].metadata_json.checklistTemplate = {
      version: 1, items: [{ id: "definition", text: "Approved definition" }],
    };
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      const before = clone(f.tables);
      f.calls.length = 0;
      controller.actions.shiftPlannerWeek(7);
      await controller.flush();
      const generated = f.tables.planner_weekly_tasks.find((row) => row.id === newId);
      assert(generated);
      assert.deepEqual(generated.checklist_json,
        [{ id: "definition", text: "Approved definition", completed: false }]);
      assert.equal(generated.metadata_json.sourceTaskId, t1);
      assert.equal(generated.project_id, p1);
      assert.equal(generated.parent_rep, p1);
      assert.deepEqual(f.tables.planner_tasks, before.planner_tasks);
      for (const row of before.planner_weekly_tasks.filter((entry) => entry.id !== "week-settings")) {
        assert.deepEqual(f.tables.planner_weekly_tasks.find((item) => item.id === row.id), row);
      }
      assert(f.calls.filter((call) => call.op !== "read").every((call) =>
        call.table === "planner_weekly_tasks"
        && (call.op === "insert" || call.filter?.[1] === "week-settings")));
      const once = clone(f.tables);
      f.calls.length = 0;
      controller.actions.generateVisibleRecurringInstances();
      await controller.flush();
      assert.deepEqual(f.tables, once);
      assert(f.calls.every((call) => call.op === "read"));
    } finally { controller.destroy(); }
  }
});

test("week navigation never reconciles normalized checklists back over stored nonempty data", async () => {
  for (const action of ["shiftPlannerWeek", "goToCurrentWeek", "jumpPlannerToDate"]) {
    const f = fixture();
    const row = f.tables.planner_weekly_tasks.find((item) => item.id === "w1");
    row.checklist_json = [{ id: "unrenderable", text: "", completed: true }];
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      const before = clone(row);
      if (action === "shiftPlannerWeek") controller.actions[action](7);
      else if (action === "jumpPlannerToDate") controller.actions[action]("2026-11-02");
      else controller.actions[action]();
      await controller.flush();
      assert.deepEqual(row, before);
    } finally { controller.destroy(); }
  }
});

test("rollover fails closed without an approved template when same-identity history has checklist data", async () => {
  for (const tombstoned of [false, true]) {
    const f = recurrenceContinuationFixture();
    f.tables.planner_weekly_tasks = f.tables.planner_weekly_tasks.filter((row) =>
      row.id !== `repeatable-${p1}-2026-11-02`);
    const current = f.tables.planner_weekly_tasks.find((row) => row.id === `repeatable-${p1}-2026-10-26`);
    current.deleted = tombstoned;
    current.deleted_instance = tombstoned;
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      const before = clone(f.tables);
      assert.throws(() => controller.actions.shiftPlannerWeek(7), /no approved checklist template/);
      await controller.flush();
      assert.deepEqual(f.tables, before);
      assert.equal(controller.getSnapshot().planner.weekStartDate, "2026-10-26");
    } finally { controller.destroy(); }
  }
});

test("rollover neither revives tombstones nor borrows templates from similarly named projects", async () => {
  const f = recurrenceContinuationFixture();
  const blockedId = `repeatable-${p1}-2026-11-02`;
  const tombstone = f.tables.planner_weekly_tasks.find((row) => row.id === blockedId);
  tombstone.deleted = true;
  tombstone.deleted_instance = true;
  const otherProject = "44444444-4444-4444-8444-444444444444";
  const otherMaster = "55555555-5555-4555-8555-555555555555";
  f.tables.projects_all.push({ id: otherProject, project_type: "repeating", title: "Disposable series", recurrence: "weekly" });
  f.tables.projects_repeating.push({ id: otherProject, title: "Disposable series", recurrence: "weekly" });
  f.tables.planner_tasks.push({ id: otherMaster, project_id: otherProject, source: "repeating",
    title: "Disposable series", metadata_json: { series: clone(f.tables.planner_tasks[0].metadata_json.series) } });
  f.tables.planner_tasks[0].metadata_json.checklistTemplate = {
    version: 1, items: [{ id: "private", text: "Only first project" }],
  };
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    const before = clone(f.tables);
    controller.actions.shiftPlannerWeek(7);
    await controller.flush();
    assert.deepEqual(f.tables.planner_weekly_tasks.find((row) => row.id === blockedId), tombstone);
    const other = f.tables.planner_weekly_tasks.find((row) => row.id === `repeatable-${otherProject}-2026-11-02`);
    assert(other);
    assert.deepEqual(other.checklist_json, []);
    assert.equal(other.metadata_json.sourceTaskId, otherMaster);
    assert.deepEqual(f.tables.planner_tasks, before.planner_tasks);
    for (const row of before.planner_weekly_tasks.filter((entry) => entry.id !== "week-settings")) {
      assert.deepEqual(f.tables.planner_weekly_tasks.find((item) => item.id === row.id), row);
    }
  } finally { controller.destroy(); }
});

test("Repeatable template approval preserves occurrence completion and survives reload for next-week generation", async () => {
  const f = recurrenceContinuationFixture();
  const currentId = `repeatable-${p1}-2026-10-26`;
  f.tables.planner_weekly_tasks = f.tables.planner_weekly_tasks.filter((row) =>
    row.id !== `repeatable-${p1}-2026-11-02`);
  const controller = incidentController(f.storage);
  let reload;
  try {
    await controller.actions.initialize();
    const before = clone(f.tables.planner_weekly_tasks);
    await controller.actions.saveChecklistTemplate(currentId);
    const template = f.tables.planner_tasks[0].metadata_json.checklistTemplate;
    assert.deepEqual(template, { version: 1, items: [
      { id: "first", text: "First" }, { id: "second", text: "Second" },
    ] });
    assert.deepEqual(f.tables.planner_weekly_tasks, before);
    reload = incidentController(f.storage);
    await reload.actions.initialize();
    reload.actions.shiftPlannerWeek(7);
    await reload.flush();
    const fresh = f.tables.planner_weekly_tasks.find((row) => row.id === `repeatable-${p1}-2026-11-02`);
    assert.deepEqual(fresh.checklist_json, template.items.map((item) => ({ ...item, completed: false })));
    assert.deepEqual(f.tables.planner_weekly_tasks.find((row) => row.id === currentId),
      before.find((row) => row.id === currentId));
  } finally { controller.destroy(); reload?.destroy(); }
});

test("rollover accepts absent or explicitly empty templates without copying NULL/empty occurrence state", async () => {
  for (const checklist of [null, []]) {
    for (const template of [null, { version: 1, items: [] }]) {
      const f = recurrenceContinuationFixture();
      f.tables.planner_weekly_tasks = f.tables.planner_weekly_tasks.filter((row) =>
        ["week-settings", `repeatable-${p1}-2026-10-26`].includes(row.id));
      f.tables.planner_weekly_tasks[1].checklist_json = clone(checklist);
      f.tables.planner_tasks[0].metadata_json.checklistTemplate = clone(template);
      const controller = incidentController(f.storage);
      try {
        await controller.actions.initialize();
        const old = clone(f.tables.planner_weekly_tasks[1]);
        controller.actions.shiftPlannerWeek(7);
        await controller.flush();
        assert.deepEqual(f.tables.planner_weekly_tasks[1], old);
        assert.deepEqual(f.tables.planner_weekly_tasks[2].checklist_json, []);
      } finally { controller.destroy(); }
    }
  }
});

test("rollover rejects duplicate or conflicting occurrence identities before writing anything", async () => {
  for (const conflict of ["duplicate", "project", "master"]) {
    const f = recurrenceContinuationFixture();
    const next = f.tables.planner_weekly_tasks.find((row) => row.id === `repeatable-${p1}-2026-11-02`);
    if (conflict === "duplicate") f.tables.planner_weekly_tasks.push({ ...clone(next), id: "legacy-duplicate" });
    if (conflict === "project") next.project_id = "another-project";
    if (conflict === "master") next.metadata_json.sourceTaskId = "44444444-4444-4444-8444-444444444444";
    const controller = incidentController(f.storage);
    try {
      await controller.actions.initialize();
      const before = clone(f.tables);
      assert.throws(() => controller.actions.shiftPlannerWeek(7), /ownership is ambiguous/);
      await controller.flush();
      assert.deepEqual(f.tables, before);
    } finally { controller.destroy(); }
  }
});

test("materialization boundary rejects existing row writes, tombstones and master mutation", async () => {
  const f = fixture();
  f.tables.planner_weekly_tasks[1].checklist_json =
    [{ id: "keep", text: "Existing checklist", completed: true }];
  const state = await f.data.loadPlannerState();
  const before = clone(f.tables);
  for (const changes of [
    { weeklyTasks: [{ ...state.weeklyTasks[0], checklist: null }] },
    { weeklyTasks: [{ ...state.weeklyTasks[0], checklist: [] }] },
    { tasks: [{ ...state.tasks[0], deleted: true }] },
    { deletedWeeklyTaskIds: ["w1"] },
    { weeklyTasks: [{ id: "new-tombstone", deletedInstance: true }] },
  ]) await assert.rejects(f.data.savePlannerState({ ...changes, materializeOnly: true }), /materialization/);
  assert.deepEqual(f.tables, before);
  assert(f.calls.every((call) => call.op === "read"));
});

test("rollover cannot overwrite a concurrent checklist or duplicate a concurrently materialized date", async () => {
  const f = recurrenceContinuationFixture();
  const nextId = `repeatable-${p1}-2026-11-02`;
  f.tables.planner_weekly_tasks = f.tables.planner_weekly_tasks.filter((row) => row.id !== nextId);
  f.tables.planner_tasks[0].metadata_json.checklistTemplate = { version: 1, items: [] };
  const controller = incidentController(f.storage);
  try {
    await controller.actions.initialize();
    const old = f.tables.planner_weekly_tasks[1];
    old.checklist_json = [{ id: "concurrent", text: "Newer checklist", completed: true }];
    old.updated_at = "2099-01-01T00:00:00";
    const concurrent = clone(old);
    f.tables.planner_weekly_tasks.push({ ...clone(old), id: "concurrent-date",
      occurrence_date: "2026-11-02", date: "2026-11-02" });
    controller.actions.shiftPlannerWeek(7);
    await assert.rejects(controller.flush(), /changed in another session/);
    assert.deepEqual(old, concurrent);
    assert(!f.tables.planner_weekly_tasks.some((row) => row.id === nextId));
  } finally { controller.destroy(); }
});

test("recurrence scope edit flush navigation flush reload preserves authoritative identities and occurrence state", async () => {
  for (const scope of ["future", "this-future", "entire"]) {
    const { storage, tables } = recurrenceContinuationFixture();
    tables.planner_weekly_tasks.find((row) => row.id === "unrelated-adhoc").checklist_json =
      [{ id: "preserve-raw", text: "", completed: true, extra: "Never normalize stored evidence on save" }];
    const controller = incidentController(storage);
    let reload;
    try {
      await controller.actions.initialize();
      const before = clone(tables.planner_weekly_tasks);
      controller.actions.saveSeries(`repeatable-${p1}-2026-10-26`, {
        recurrence: "weekly", baseDay: "Monday", baseBucket: "Evening", applyScope: scope,
      });
      await controller.flush();
      for (const days of [7, 7, 7]) {
        controller.actions.shiftPlannerWeek(days);
        await controller.flush();
      }
      reload = incidentController(storage);
      await reload.actions.initialize();
      await reload.flush();
      const loaded = reload.getSnapshot().planner.tasks;
      for (const row of before.filter((item) => item.id !== "week-settings")) {
        const actual = tables.planner_weekly_tasks.find((item) => item.id === row.id);
        const changes = row.parent_rep === p1 && !row.overridden && !row.deleted
          && (scope !== "future" || row.date > "2026-10-26");
        if (!changes) assert.deepEqual(actual, row);
        else {
          assert.equal(actual.time_slot, "evening");
          assert.equal(actual.bucket, "evening");
          const unchanged = (item) => {
            const result = clone(item);
            for (const key of ["time_slot", "bucket", "recurrence", "updated_at"]) delete result[key];
            return result;
          };
          assert.deepEqual(unchanged(actual), unchanged(row));
        }
        assert.equal(loaded.find((item) => item.id === row.id).updatedAt, actual.updated_at);
        assert.equal(tables.planner_weekly_tasks.filter((item) => item.id === row.id).length, 1);
      }
      const future = `repeatable-${p1}-2026-11-02`;
      assert.equal(loaded.filter((item) => item.id === future && !item.deleted && !item.deletedInstance).length, 1);
      reload.actions.shiftPlannerWeek(-14);
      await reload.flush();
      reload.actions.setTaskCompleted(future, "mon", "evening", false);
      await reload.flush();
      const winning = tables.planner_weekly_tasks.find((item) => item.id === future);
      winning.title = "Concurrent newer state";
      winning.updated_at = "2099-01-01T00:00:00";
      const concurrent = clone(winning);
      reload.actions.setTaskCompleted(future, "mon", "evening", true);
      await assert.rejects(reload.flush(), /changed in another session/);
      assert.deepEqual(winning, concurrent);
    } finally { controller.destroy(); reload?.destroy(); }
  }
});

test("recurrence pattern changes retire only obsolete generated dates without moving history or reviving deletions", async () => {
  const { storage, tables } = recurrenceContinuationFixture();
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    const before = clone(tables.planner_weekly_tasks);
    controller.actions.saveSeries(`repeatable-${p1}-2026-10-26`, {
      recurrence: "biweekly", baseDay: "Monday", baseBucket: "Evening", applyScope: "future",
    });
    await controller.flush();
    controller.actions.shiftPlannerWeek(7);
    await controller.flush();
    controller.actions.shiftPlannerWeek(7);
    await controller.flush();
    for (const row of before.filter((item) => item.id !== "week-settings")) {
      const actual = tables.planner_weekly_tasks.find((item) => item.id === row.id);
      assert.deepEqual(actual.checklist_json, row.checklist_json);
      assert.equal(actual.completed, row.completed);
      if (row.date === "2026-11-09" && row.parent_rep === p1) {
        assert.equal(actual.time_slot, "evening");
        assert.equal(actual.deleted, false);
      } else if (row.id === `repeatable-${p1}-2026-11-30`) {
        assert.equal(actual.deleted, true);
        assert.equal(actual.deleted_instance, true);
      } else if (row.id !== `repeatable-${p1}-2026-10-26`) assert.deepEqual(actual, row);
    }
  } finally { controller.destroy(); }
});

test("approved templates hydrate on reload and explicit fresh creation cannot overwrite a same-day occurrence", async () => {
  const { storage, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const controller = incidentController(storage);
  let reload;
  try {
    await controller.actions.initialize();
    await controller.actions.saveChecklistTemplate("app");
    reload = incidentController(storage);
    await reload.actions.initialize();
    assert.equal(reload.getSnapshot().curatedTasks[0].checklistTemplate.length, 11);
    const before = clone(tables.planner_weekly_tasks);
    assert.throws(() => reload.actions.assignTask(t1, "mon", "evening", { fresh: true }), /already has a task on that date/);
    assert.deepEqual(tables.planner_weekly_tasks, before);
    reload.actions.assignTask(t1, "tue", "morning", { fresh: true });
    await reload.flush();
    assert.equal(tables.planner_weekly_tasks.length, before.length + 1);
  } finally { controller.destroy(); reload?.destroy(); }
});

test("master checklist definitions are typed, ordered and cannot contain occurrence completion state", () => {
  const { readProjectChecklistTemplate } = exportsFrom("src/services/plannerService.js", ["readProjectChecklistTemplate"]);
  const read = (template) => readProjectChecklistTemplate({ metadataJson: JSON.stringify({ checklistTemplate: template }) });
  assert.equal(readProjectChecklistTemplate({ metadataJson: "{}" }), null);
  assert.deepEqual(clone(read({ version: 1, items: [{ id: "second", text: "Second" }, { id: "first", text: "First" }] })),
    [{ id: "second", text: "Second", completed: false }, { id: "first", text: "First", completed: false }]);
  for (const template of [
    { version: 2, items: [] }, { version: 1, items: null },
    { version: 1, items: [{ id: "", text: "Invalid" }] },
    { version: 1, items: [{ id: "a", text: "A" }, { id: "a", text: "Duplicate" }] },
    { version: 1, items: [{ id: "a", text: "A", completed: true }] },
  ]) assert.throws(() => read(template), /checklist template/i);
});

test("conflicting explicit Project identities fail closed instead of moving or borrowing a checklist", async () => {
  const rows = incidentFixtureRows();
  rows[1].metadata_json.sourceTaskId = "different-master";
  const { storage, calls } = fixture({ planner_weekly_tasks: rows });
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    assert.throws(() => controller.actions.assignTask(t1, "tue", "morning"), /ownership conflicts/);
    assert.equal(calls.filter((call) => call.op !== "read").length, 0);
  } finally { controller.destroy(); }
});

test("week navigation detects concurrent settings changes, including rows with null revisions", async () => {
  const { storage, client, tables } = fixture({ planner_weekly_tasks: incidentFixtureRows() });
  const state = await storage.loadPlannerState();
  tables.planner_weekly_tasks[0].updated_at = null;
  client.beforeUpdate = (table) => {
    assert.equal(table, "planner_weekly_tasks");
    Object.assign(tables.planner_weekly_tasks[0], {
      metadata_json: { weekStartDate: "2026-10-19" }, updated_at: "2026-10-26T20:00:00",
    });
  };
  await assert.rejects(storage.saveWeeklyPlannerState({ weekStartDate: "2026-11-02", tasks: state.weeklyTasks }), /Expected one row/);
  assert.equal(tables.planner_weekly_tasks[0].metadata_json.weekStartDate, "2026-10-19");
});

test("same titles never supply Project lineage or choose historical checklist state", async () => {
  const rows = incidentFixtureRows();
  rows[1].metadata_json = {};
  rows[1].project_id = "different-project";
  rows[1].deleted = true;
  rows[1].deleted_instance = true;
  const { storage, tables } = fixture({ planner_weekly_tasks: rows });
  tables.planner_tasks[0].title = "app";
  const controller = incidentController(storage);
  try {
    await controller.actions.initialize();
    controller.actions.assignTask(t1, "tue", "morning");
    await controller.flush();
    const created = tables.planner_weekly_tasks.find((row) => row.metadata_json?.sourceTaskId === t1);
    assert(created);
    assert.deepEqual(created.checklist_json, []);
    assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "app").checklist_json.length, 11);
  } finally { controller.destroy(); }
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
  assert.equal(typeof storage.createProject, "function");
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

for (const [source, externalId] of [
  ["home", "PA0001"], ["vehicle", "PB0001"], ["repeating", "PC0001"], ["misc", "PD0001"],
]) {
  test(`${source} project edits and explicit lookup preserve the existing ${externalId} identity`, async () => {
    const row = { id: p1, external_id: externalId, title: "Existing project",
      category: "Maintenance", state: "Not Started", priority: "3", order: 1,
      recurrence: source === "repeating" ? "weekly" : null, metadata: {} };
    const { storage, tables, calls } = fixture({
      projects_all: [{ ...row, project_type: source }],
      projects_home: [], [`projects_${source}`]: [row],
    });
    const { findExplicitProject, toProjectView } = exportsFrom("src/services/plannerService.js",
      ["findExplicitProject", "toProjectView"]);
    const [project] = await storage.getProjects();
    assert.equal(project.externalId, externalId);
    assert.equal(toProjectView(project).externalId, externalId);
    assert.equal(findExplicitProject([project], externalId, source).id, p1);
    assert.equal(findExplicitProject([project], p1, source).id, p1);
    assert.equal(findExplicitProject([project], externalId, source === "home" ? "misc" : "home"), null);
    await storage.updateProject({ ...project, title: "Edited project" });
    assert.equal(tables[`projects_${source}`][0].external_id, externalId);
    const writes = calls.filter((call) => call.op !== "read");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, `projects_${source}`);
    assert.equal(writes[0].op, "update");
    assert(!Object.hasOwn(writes[0].payload, "external_id"));
  });
}

test("external identity lookup rejects duplicate aliases rather than linking an arbitrary project", () => {
  const { findExplicitProject } = exportsFrom("src/services/plannerService.js", ["findExplicitProject"]);
  const projects = [
    { id: p1, source: "home", externalId: "PA0001" },
    { id: t1, source: "home", external_id: "PA0001" },
  ];
  assert.throws(() => findExplicitProject(projects, "PA0001"), /ambiguous.*unique UUID/);
  assert.equal(findExplicitProject(projects, p1).id, p1);
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

test("Planner backup drains edits, locks mutations, refreshes restored rows, and releases after errors", async () => {
  const { storage, tables } = fixture();
  const { createPlannerController } = exportsFrom("src/services/plannerService.js", ["createPlannerController"], {
    plannerStorage: storage, window: { location: { hash: "#planner" } },
    fetch: async () => ({ ok: true, json: async () => ({ forecast: { forecastday: [] } }) }),
    setTimeout, clearTimeout, URL, Date,
  });
  const controller = createPlannerController();
  try {
    await controller.actions.initialize();
    await controller.flush();
    controller.actions.setTaskCompleted("w1", "mon", "morning", true);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const restoring = controller.actions.backupOperation(async () => {
      assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "w1").completed, true);
      await gate;
      await createPlannerBackupService(storage).restore(JSON.stringify({
        format: "homemaintenance-planner", version: 1, data: { tasks: [], parkingItems: [], weeklyTasks: [
        { id: "restored-weekly", title: "Restored", date: "2026-10-20", timeSlot: "morning" },
      ] } }));
    });
    assert.equal(controller.getSnapshot().backupBusy, true);
    assert.doesNotThrow(() => controller.actions.getTaskProject("w1"));
    assert.throws(() => controller.actions.shiftPlannerWeek(7), /backup is in progress/);
    release();
    await restoring;
    assert.equal(controller.getSnapshot().backupBusy, false);
    assert(controller.getSnapshot().planner.tasks.some((task) => task.id === "restored-weekly"));
    controller.actions.setTaskCompleted("w1", "mon", "morning", false);
    await controller.flush();
    assert.notEqual(tables.planner_weekly_tasks.find((row) => row.id === "restored-weekly").deleted, true);
    await assert.rejects(controller.actions.backupOperation(async () => {
      throw new Error("Fixture backup failure");
    }), /Fixture backup failure/);
    assert.equal(controller.getSnapshot().backupBusy, false);
    const load = storage.loadPlannerState;
    storage.loadPlannerState = async () => { throw new Error("Fixture reload failed"); };
    await assert.rejects(controller.actions.backupOperation(async () => {}), /Planner reload failed/);
    assert.equal(controller.getSnapshot().backupReloadRequired, true);
    assert.throws(() => controller.actions.shiftPlannerWeek(7), /must reload/);
    storage.loadPlannerState = load;
    await controller.actions.backupOperation(async () => {});
    assert.equal(controller.getSnapshot().backupReloadRequired, false);
  } finally { controller.destroy(); }
});

test("Planner notification mappings survive reload, block overlapping backups and require cancellation before deletion", async () => {
  const { storage, tables } = fixture();
  const { createPlannerController } = exportsFrom("src/services/plannerService.js", ["createPlannerController"], {
    plannerStorage: storage, window: { location: { hash: "#planner" } },
    fetch: async () => ({ ok: true, json: async () => ({ forecast: { forecastday: [] } }) }),
    setTimeout, clearTimeout, URL, Date,
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const mapping = { active: true, provider: "google-calendar", eventId: "owned-event", sendAt: "2030-01-01T09:00:00Z" };
  const controller = createPlannerController({ reminderService: {
    schedule: async (task) => {
      await gate;
      await storage.upsertWeeklyTask({ ...task, reminder: mapping });
      return mapping;
    },
    cancel: async (task) => {
      const reminder = { ...mapping, active: false };
      await storage.upsertWeeklyTask({ ...task, reminder });
      return reminder;
    },
  } });
  try {
    await controller.actions.initialize();
    const saving = controller.actions.reminder("w1", "send", "custom", "09:00");
    assert.equal(controller.getSnapshot().reminderBusy, true);
    assert.throws(() => controller.actions.backupOperation(async () => {}), /notification operation is in progress/);
    release();
    await saving;
    await controller.actions.refreshParking();
    assert.deepEqual(plain(controller.getSnapshot().planner.tasks.find((task) => task.id === "w1").reminder), mapping);
    assert.throws(() => controller.actions.removeTask("w1"), /Cancel active Google Calendar notifications/);
    await controller.actions.reminder("w1", "delete");
    await controller.actions.refreshParking();
    assert(controller.actions.removeTask("w1"));
    await controller.flush();
    assert.equal(tables.planner_weekly_tasks.find((row) => row.id === "w1").deleted, true);
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

test("Parking project/repeatable conversions enforce edit-only policy without mutations", async () => {
  for (const type of ["project", "repeatable"]) {
    const { storage, calls, tables } = fixture();
    const before = clone(tables);
    const { convertParkingItem } = exportsFrom("src/services/plannerService.js", ["convertParkingItem"], {
      plannerStorage: storage, ...exportsFrom("src/services/projectPolicy.js", ["assertProjectWriteAllowed"]),
    });
    await assert.rejects(convertParkingItem({ id: "park1", title: "Fixture idea" }, type), /not authorized/);
    assert.deepEqual(tables, before);
    assert(calls.every((call) => call.op === "read"));
  }
});

test("weekly-to-Parking archival preserves checklist, override metadata and recurrence identity", async () => {
  const { storage, tables } = fixture();
  const { parkPlannerPayload } = exportsFrom("src/services/plannerService.js", ["parkPlannerPayload"], {
    plannerStorage: storage,
  });
  const source = {
    id: "w1", title: "Fixture weekly", checklist: [{ id: "check", text: "Step", completed: true }],
    reminder: { active: false, provider: "google-calendar", eventId: "fixture-event" },
    metadata: { override: { date: "2026-10-20" }, parentRepeatableId: p1, keep: { nested: true } },
  };
  await parkPlannerPayload({ kind: "weekly-move", weeklyTask: source });
  const parked = tables.planner_parking_lot.find((item) => item.converted_to_id === "w1");
  assert.equal(parked.converted_to_type, true);
  assert.equal(parked.metadata_json.conversionType, "weekly");
  assert.deepEqual(parked.checklist_json, source.checklist);
  assert.deepEqual(parked.reminder_json, source.reminder);
  assert.equal(parked.metadata_json.parentRepeatableId, p1);
  assert.deepEqual(parked.metadata_json.override, source.metadata.override);
  assert.deepEqual(parked.metadata_json.keep, source.metadata.keep);
  assert.equal(tables.planner_weekly_tasks.find((item) => item.id === "w1").deleted, true);
  assert.equal(source.id, "w1");
});

test("Parking archival preserves existing notification mappings without claiming cancellation", async () => {
  const { storage, tables } = fixture();
  const { parkPlannerPayload } = exportsFrom("src/services/plannerService.js", ["parkPlannerPayload"], {
    plannerStorage: storage,
  });
  await parkPlannerPayload({ kind: "weekly-move", weeklyTask: {
    id: "w1", title: "Fixture only", reminder: { active: true, provider: "google-calendar", eventId: "fixture-event" },
  } });
  const parked = tables.planner_parking_lot.find((item) => item.converted_to_id === "w1");
  assert.equal(parked.reminder_json.active, true, "Archival preserves mapping; it is not notification cancellation");
  assert.equal(tables.planner_weekly_tasks.find((item) => item.id === "w1").deleted, true);
});
