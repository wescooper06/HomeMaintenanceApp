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
