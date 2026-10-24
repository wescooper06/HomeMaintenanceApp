const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const modules = new Map();
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file) {
  if (modules.has(file)) return modules.get(file);
  if (file.endsWith("supabaseClient.js")) return { getSupabaseClient() { throw Error("Unexpected live client"); } };
  let source = fs.readFileSync(file, "utf8");
  const context = { console, crypto: require("node:crypto").webcrypto };
  source = source.replace(/^import \{([^}]+)\} from "([^"]+)";$/gm, (_, names, relative) => {
    const imported = load(path.resolve(path.dirname(file), relative));
    for (const name of names.split(",").map((value) => value.trim())) context[name] = imported[name];
    return "";
  });
  const names = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1]);
  const exports = vm.runInNewContext(`(() => { ${source.replace(/^export /gm, "")}
    return { ${names.join(",")} }; })()`, context);
  modules.set(file, exports);
  return exports;
}
const services = (file) => load(path.join(root, "src", "services", file));
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const columns = {
  trips: "id created_at destination start_date end_date trip_type status timeline_month timeline_year notes duration seasonality cost_range considerations tags links priority purpose location updated_at",
  trips_workflow_metadata: "id trip_id created_at stage stage_notes updated_at",
  trips_timeline: "created_at year month color notes blocks",
};

function fixture(initial = {}) {
  const tables = { trips: [], trips_workflow_metadata: [], trips_timeline: [], ...structuredClone(initial) };
  const calls = [];
  let failure;
  const client = {
    failNext(table, operation) { failure = { table, operation }; },
    from(table) {
      assert(Object.hasOwn(columns, table), `Unexpected table ${table}`);
      let operation = "read", values, options, single, range, filters = [], order = [];
      const query = {
        select() { return query; },
        order(column) { order.push(column); return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        range(start, end) { range = [start, end]; return query; },
        single() { single = "required"; return query; },
        maybeSingle() { single = "optional"; return query; },
        upsert(row, config) { operation = "insert"; values = row; options = config; return query; },
        insert(row) { operation = "insert"; values = row; return query; },
        update(row) { operation = "update"; values = row; return query; },
        delete() { operation = "delete"; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push({ table, operation, values: structuredClone(values), filters });
            if (failure?.table === table && failure.operation === operation) {
              failure = null;
              return { error: { message: "Fixture permission denied" }, data: null };
            }
            for (const column of Object.keys(values || {})) {
              assert(columns[table].split(" ").includes(column), `Unknown column ${table}.${column}`);
            }
            let result = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
            if (operation === "read") {
              result = [...result].sort((a, b) => {
                for (const key of order) {
                  if (a[key] < b[key]) return -1;
                  if (a[key] > b[key]) return 1;
                }
                return 0;
              });
              if (range) result = result.slice(range[0], Math.min(range[1] + 1, range[0] + 2));
            } else if (operation === "insert") {
              const keys = options?.onConflict.split(",");
              const existing = keys && tables[table].find((row) => keys.every((key) => row[key] === values[key]));
              if (!existing) tables[table].push(structuredClone(values));
              result = existing ? [] : [values];
            } else if (operation === "update") {
              result.forEach((row) => Object.assign(row, structuredClone(values)));
            } else {
              tables[table] = tables[table].filter((row) => !result.includes(row));
            }
            if (single && (result.length > 1 || (!result.length && single === "required"))) {
              return { data: null, error: { message: "Expected one row" } };
            }
            return { data: structuredClone(single ? result[0] ?? null : result), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const getClient = () => client;
  return { tables, calls, client,
    trips: services("tripsService.js").createTripsService(getClient),
    workflow: services("tripsWorkflowService.js").createTripsWorkflowService(getClient),
    timeline: services("tripsTimelineService.js").createTripsTimelineService(getClient),
  };
}

test("scheduled creation inserts workflow trip_id with the trip's chosen status", async () => {
  const { trips, tables } = fixture();
  const saved = await trips.createTrip({ tripId: id, destination: "Alaska", startDate: "2026-11-01",
    endDate: "", timelineMonth: "Nov", timelineYear: "2026", duration: "5",
    priority: 1, status: "Shortlisted", links: '[{"url":"https://example.com"}]' });
  assert.equal(saved.tripId, id);
  assert.equal(tables.trips[0].timeline_month, 11);
  assert.equal(tables.trips[0].end_date, null);
  assert.equal(tables.trips[0].duration, 5);
  assert.equal(tables.trips[0].priority, "1");
  assert.deepEqual(tables.trips[0].links, [{ url: "https://example.com" }]);
  assert.equal(tables.trips_workflow_metadata[0].trip_id, id);
  assert.equal(Object.hasOwn(tables.trips_workflow_metadata[0], "id"), false);
  assert.equal(tables.trips_workflow_metadata[0].stage, "Shortlisted");
  assert.deepEqual(tables.trips_timeline[0], { year: 2026, month: "Nov", color: "", notes: "", blocks: "" });
});

test("unscheduled trips create a workflow but no invented Timeline month", async () => {
  const { trips, tables } = fixture();
  await trips.createTrip({ tripId: id, destination: "Someday", timelineMonth: "", timelineYear: "" });
  assert.equal(tables.trips.length, 1);
  assert.equal(tables.trips_workflow_metadata.length, 1);
  assert.equal(tables.trips_timeline.length, 0);
});

test("creation accepts nullable fields and rejects conflicting reuse of an existing trip ID", async () => {
  const { trips, tables } = fixture();
  await trips.createTrip({ tripId: id, destination: null, notes: null, links: { b: 2, a: 1 } });
  await trips.createTrip({ tripId: id, destination: null, notes: null, links: { a: 1, b: 2 } });
  await assert.rejects(trips.createTrip({ tripId: id, destination: "Different trip" }), /different values/);
  assert.equal(tables.trips[0].destination, null);
  assert.equal(tables.trips.length, 1);
});

test("creation retries recover related-row failures without duplicates or overwritten workflow/month settings", async () => {
  const { trips, workflow, tables, client } = fixture({
    trips_timeline: [{ year: 2026, month: "NOVEMBER", notes: "Shared", color: "CAUTION", blocks: "Busy" }],
  });
  const data = { tripId: id, destination: "Trip", timelineMonth: 11, timelineYear: 2026 };
  client.failNext("trips_workflow_metadata", "insert");
  await assert.rejects(trips.createTrip(data), /was saved.*Retry creation/);
  await trips.createTrip(data);
  await workflow.updateWorkflowMetadata(id, { stage: "Book", stageNotes: "Booked" });
  await trips.createTrip(data);
  assert.equal(tables.trips.length, 1);
  assert.equal(tables.trips_workflow_metadata.length, 1);
  assert.equal(tables.trips_workflow_metadata[0].stage, "Book");
  assert.equal(tables.trips_timeline.length, 1);
  assert.equal(tables.trips_timeline[0].notes, "Shared");
});

test("trip edits persist mapped columns, dates, text priority and timeline assignments", async () => {
  const { trips, tables } = fixture();
  await trips.createTrip({ tripId: id, destination: "Before" });
  await trips.updateTrip(id, { destination: "After", tripType: "flight", priority: 2,
    purpose: "Vacation", location: "North", startDate: "2026-12-01" });
  await trips.assignTripToMonth(id, 2027, "January");
  assert.equal(tables.trips[0].trip_type, "flight");
  assert.equal(tables.trips[0].priority, "2");
  assert.equal(tables.trips[0].timeline_month, 1);
  assert.equal(tables.trips[0].timeline_year, 2027);
  assert.equal(tables.trips_timeline.length, 1);
  await trips.removeTripFromMonth(id, 2027, 1);
  assert.equal(tables.trips[0].timeline_month, null);
  assert.equal(tables.trips[0].timeline_year, null);
});

test("ranking updates do not reinterpret unrelated imported fields or require an existing partial schedule", async () => {
  const { trips, tables } = fixture({ trips: [
    { id, destination: "Imported", timeline_month: 11, timeline_year: null, links: "[literal text]" },
  ] });
  await trips.updateTrip(id, { priority: 3 });
  assert.equal(tables.trips[0].priority, "3");
  assert.equal(tables.trips[0].links, "[literal text]");
  assert.equal(tables.trips[0].timeline_month, 11);
});

test("workflow edits use trip_id and cannot write a nonexistent priority column", async () => {
  const { trips, workflow, tables } = fixture();
  await trips.createTrip({ tripId: id });
  await workflow.updateWorkflowMetadata(id, { stage: "Research", stageNotes: "Compare fares" });
  assert.equal((await workflow.getWorkflowMetadata(id)).stageNotes, "Compare fares");
  assert.equal(tables.trips_workflow_metadata[0].stage_notes, "Compare fares");
  await assert.rejects(workflow.updateWorkflowMetadata(id, { priority: 1 }), /Unsupported field/);
  await assert.rejects(workflow.getWorkflowMetadata(otherId), /Expected one row/);
});

test("workflow creation preserves each supplied status and never updates existing workflow rows", async () => {
  for (const status of ["Shortlisted", "Active", "Idea", "Paused", "Deferred", "", null]) {
    const { workflow, tables, calls } = fixture();
    const result = await workflow.createWorkflowMetadata(id, status);
    assert.equal(result.tripId, id);
    assert.equal(tables.trips_workflow_metadata[0].stage, status);
    assert.equal(tables.trips_workflow_metadata[0].trip_id, id);
    assert(!Object.hasOwn(calls.find((call) => call.operation === "insert").values, "id"));
  }
  const original = { id: otherId, trip_id: id, stage: "Research", stage_notes: "Keep notes" };
  const { workflow, tables, calls } = fixture({ trips_workflow_metadata: [original] });
  const result = await workflow.createWorkflowMetadata(id, "Shortlisted");
  assert.equal(result.id, otherId);
  assert.equal(result.tripId, id);
  assert.deepEqual(tables.trips_workflow_metadata, [original]);
  assert(calls.every((call) => call.operation === "read"));
  await workflow.updateWorkflowMetadata(id, { stageNotes: "Edited notes" });
  assert.equal(tables.trips_workflow_metadata[0].stage_notes, "Edited notes");
  assert.equal(tables.trips_workflow_metadata[0].stage, "Research");
  assert.deepEqual(calls.at(-1).filters, [["trip_id", id]]);
});

test("Timeline edits preserve actual month text and assignments derive from trips without read-side writes", async () => {
  const { timeline, tables, calls } = fixture({
    trips: [{ id, timeline_year: 2026, timeline_month: 11 }, { id: otherId, timeline_year: 2026, timeline_month: 11 }],
    trips_timeline: [{ year: 2026, month: "November", color: "IDEAL", notes: "Old" }],
  });
  assert.deepEqual(plain((await timeline.getTimelineMonth(2026, 11)).tripIds), [id, otherId]);
  assert(calls.every((call) => call.operation === "read"));
  await timeline.updateTimelineEntry(2026, "Nov", { color: "conflict", notes: "New", blocks: "Unavailable" });
  assert.equal(tables.trips_timeline[0].month, "November");
  assert.equal(tables.trips_timeline[0].blocks, "Unavailable");
  assert.equal(tables.trips_timeline[0].color, "CONFLICT");
  await assert.rejects(timeline.updateTimelineEntry(2026, 11, { tripIds: [id] }), /Unsupported field/);
});

test("pagination reads every trip and month; no rows are silently capped", async () => {
  const { trips, timeline, calls } = fixture({
    trips: Array.from({ length: 7 }, (_, i) => ({ id: `fixture-${i}`, destination: `Trip ${i}` })),
    trips_timeline: Array.from({ length: 7 }, (_, i) => ({ year: 2026, month: String(i + 1) })),
  });

  assert.equal((await trips.getTrips()).length, 7);
  assert.equal((await timeline.getTimelineEntries()).length, 7);
  assert(calls.every((call) => call.operation === "read"));
});

test("Trips load in creation order so newest/oldest UI sorting does not depend on random UUIDs", async () => {
  const { trips } = fixture({ trips: [
    { id, created_at: "2026-11-01T00:00:00Z", destination: "Newer" },
    { id: otherId, created_at: "2026-10-01T00:00:00Z", destination: "Older" },
  ] });
  assert.deepEqual(plain((await trips.getTrips()).map((trip) => trip.destination)), ["Older", "Newer"]);
});

test("invalid dates, smallints, UUIDs and fields fail before writes", async () => {
  const { trips, timeline, calls } = fixture();
  for (const data of [{ tripId: "bad" }, { tripId: id, duration: "five" },
    { tripId: id, startDate: "2026-02-30" }, { tripId: id, timelineMonth: 11 },
    { tripId: id, duration: 32768 }, { tripId: id, links: "{bad}" }, { tripId: id, category: "nonexistent" }]) {
    await assert.rejects(trips.createTrip(data));
  }
  await assert.rejects(timeline.createTimelineEntry(2026, 13), /Timeline requires/);
  await assert.rejects(timeline.createTimelineEntry(2026, 11, { color: "PURPLE" }), /Invalid Timeline color/);
  assert.equal(calls.filter((call) => call.operation !== "read").length, 0);
});

test("database errors are explicit and never trigger another persistence backend", async () => {
  const { trips, client, tables } = fixture();
  client.failNext("trips", "insert");
  await assert.rejects(trips.createTrip({ tripId: id }), /permission denied/);
  assert.equal(tables.trips_workflow_metadata.length, 0);
  await trips.createTrip({ tripId: id });
  client.failNext("trips", "update");
  await assert.rejects(trips.updateTrip(id, { destination: "Denied" }), /permission denied/);
  client.failNext("trips", "read");
  await assert.rejects(trips.getTrips(), /permission denied/);
});

test("deletion removes trip and workflow, preserves shared month, and can retry workflow cleanup", async () => {
  const { trips, client, tables } = fixture();
  await trips.createTrip({ tripId: id, timelineMonth: 11, timelineYear: 2026 });
  client.failNext("trips_workflow_metadata", "delete");
  await assert.rejects(trips.deleteTrip(id), /workflow cleanup failed/);
  await trips.deleteTrip(id);
  assert.equal(tables.trips.length, 0);
  assert.equal(tables.trips_workflow_metadata.length, 0);
  assert.equal(tables.trips_timeline.length, 1);
});

test("UI deletion uses the normalized tripId even when a different workflow id is present", async () => {
  const workflowId = "33333333-3333-4333-8333-333333333333";
  const { trips, tables, calls } = fixture({
    trips: [{ id, destination: "Delete me" }, { id: otherId, destination: "Keep me" }],
    trips_workflow_metadata: [
      { id: workflowId, trip_id: id, stage: "Shortlisted" },
      { id: "44444444-4444-4444-8444-444444444444", trip_id: otherId, stage: "Active" },
    ],
    trips_timeline: [{ year: 2026, month: "Nov", notes: "Keep shared settings" }],
  });
  const source = fs.readFileSync(path.join(root, "src", "pages", "Trips", "TripsHome.jsx"), "utf8");
  assert.match(source, /import \{ deleteTrip, getTrips \} from "\.\.\/\.\.\/services\/tripsService\.js"/);
  assert.match(source, /onClick=\{\(\) => removeTrip\(trip\)\}/);
  const start = source.indexOf("  async function removeTrip(trip) {");
  const end = source.indexOf("\n  useEffect(", start);
  assert(start >= 0 && end > start, "Use the actual Trips Home delete handler");
  let displayed = await trips.getTrips();
  let actionError = "";
  const removeTrip = vm.runInNewContext(`(() => {
    ${source.slice(start, end)}
    return removeTrip;
  })()`, {
    deletingTripId: null, window: { confirm: () => true },
    setDeletingTripId() {},
    setActionError(value) { actionError = value; },
    setTrips(value) { displayed = typeof value === "function" ? value(displayed) : value; },
    deleteTrip: trips.deleteTrip, getTrips: trips.getTrips,
  });
  await removeTrip({ ...displayed.find((trip) => trip.tripId === id), id: workflowId });
  assert.equal(actionError, "");
  assert.deepEqual(tables.trips.map((trip) => trip.id), [otherId]);
  assert.deepEqual(tables.trips_workflow_metadata.map((row) => row.trip_id), [otherId]);
  assert.equal(displayed.length, 1);
  assert.equal(tables.trips_timeline[0].notes, "Keep shared settings");
  assert.deepEqual(calls.filter((call) => call.operation === "delete").map((call) => ({
    table: call.table, filters: call.filters,
  })), [
    { table: "trips", filters: [["id", id]] },
    { table: "trips_workflow_metadata", filters: [["trip_id", id]] },
  ]);
  const deleteCount = calls.filter((call) => call.operation === "delete").length;
  await removeTrip({ id: workflowId });
  assert.match(actionError, /Trip ID must be a UUID/);
  assert.equal(calls.filter((call) => call.operation === "delete").length, deleteCount);
});

test("year propagation copies shared colors/notes without replacing blocks or assigning trips", async () => {
  const { timeline, tables } = fixture({
    trips_timeline: [{ year: 2026, month: "Jan", color: "IDEAL", notes: "Season", blocks: "Source" },
      { year: 2027, month: "January", color: "", notes: "", blocks: "Keep target" }],
  });
  await timeline.propagateTimelineYear(2026, 2027);
  const entry = tables.trips_timeline.find((row) => row.year === 2027 && row.month === "January");
  assert.equal(entry.notes, "Season");
  assert.equal(entry.blocks, "Keep target");
  assert.equal(tables.trips_timeline.filter((row) => row.year === 2027).length, 12);
});

test("duplicate logical month labels fail explicitly rather than editing an arbitrary row", async () => {
  const { timeline } = fixture({ trips_timeline: [
    { year: 2026, month: "Jan" }, { year: 2026, month: "January" },
  ] });
  await assert.rejects(timeline.getTimelineEntries(), /Duplicate Timeline month/);
});

test("active Trips data services have no Sheets, local-storage fallback, or legacy table dependency", () => {
  for (const name of ["tripsService.js", "tripsTimelineService.js", "tripsWorkflowService.js", "tripsSupabase.js"]) {
    const source = fs.readFileSync(path.join(root, "src", "services", name), "utf8");
    assert.doesNotMatch(source, /googleSheets|sheetsApi|localStorage|script\.google|trip_registry|trip_manager|trip_data|trip_info/);
  }
  const application = fs.readFileSync(path.join(root, "src", "pages", "Trips", "TripsApplication.jsx"), "utf8");
  assert.doesNotMatch(application, /hasSheetsAccess|connectGoogleSheets/);
});
