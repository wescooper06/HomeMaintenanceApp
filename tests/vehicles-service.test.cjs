const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const load = (file, names, context = {}) => vm.runInNewContext(`(()=>{${fs.readFileSync(path.join(root, file), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")};return {${names}};})()`, context);
const { calculateMaintenanceInterval, parseDateOnly } = load("src\\services\\vehiclesMaintenanceIntervalEngine.js",
  "calculateMaintenanceInterval,parseDateOnly");
const { createVehiclesDataAccess, VehiclesDataAccessError } = load("src\\services\\vehiclesDataAccess.js",
  "createVehiclesDataAccess,VehiclesDataAccessError");
const serviceModule = load("src\\services\\vehiclesService.js", [
  "createVehiclesService", "VehiclesServiceError", "newestRecord", "createVehicleChangesDraft",
  "buildRecordDeleteOperation", "buildMaintenanceItemCreateOperation",
  "buildMaintenanceItemUpdateOperation", "buildAvailabilityOperation",
].join(","), {
  createVehiclesDataAccess,
  VehiclesDataAccessError,
  calculateMaintenanceInterval,
  parseDateOnly,
  getSupabaseClient: () => { throw new Error("Production Supabase client is unavailable in service tests."); },
  URL,
  crypto: { randomUUID },
});
const {
  createVehiclesService,
  newestRecord,
  createVehicleChangesDraft,
  buildRecordDeleteOperation,
  buildMaintenanceItemCreateOperation,
  buildMaintenanceItemUpdateOperation,
  buildAvailabilityOperation,
} = serviceModule;

const uuid = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const now = "2026-11-11T12:00:00.000Z";
const asPlain = (value) => JSON.parse(JSON.stringify(value));

function createFakeClient(seed = {}) {
  const tableNames = [
    "vehicles_assets", "maintenance_items", "vehicle_maintenance_item_assets",
    "vehicle_ongoing_records", "vehicle_ongoing_items", "vehicle_recommended_records",
    "vehicle_completed_records", "vehicle_maintenance_intervals", "vehicle_key_information", "vehicle_links",
  ];
  const tables = Object.fromEntries(tableNames.map((name) => [name, (seed[name] || []).map((row) => ({ ...row }))]));
  const control = { calls: [], rpcResult: null, rpcError: null, rpcReject: null };
  const from = (table) => {
    let columns, mode = "select", filters = [], orders = [], start = 0, end = 499, single = false, maybe = false, inFilters = [];
    const query = {
      select(value, options) {
        columns = value;
        if (options?.count === "exact") query.exactCount = true;
        return query;
      },
      eq(column, value) { filters.push({ column, value, test: (row) => row[column] === value }); return query; },
      in(column, values) { inFilters.push({ column, values }); filters.push({ column, value: values, test: (row) => values.includes(row[column]) }); return query; },
      order(column, options) { orders.push({ column, ascending: options?.ascending !== false }); return query; },
      range(first, last) { start = first; end = last; return query; },
      maybeSingle() { maybe = true; return query; },
      single() { single = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          control.calls.push({ table, columns, mode, filters: filters.map(({ column, value }) => ({ column, value })), inFilters, orders, start, end });
          const rows = tables[table];
          if (!Array.isArray(rows)) throw new Error(`Unexpected table: ${table}`);
          let selected = rows.filter((row) => filters.every((filter) => filter.test(row)));
          for (const order of [...orders].reverse()) {
            selected = [...selected].sort((left, right) => {
              const a = left[order.column], b = right[order.column];
              return (a < b ? -1 : a > b ? 1 : 0) * (order.ascending ? 1 : -1);
            });
          }
          const count = query.exactCount ? selected.length : null;
          selected = selected.slice(start, end + 1);
          const data = single || maybe ? selected[0] || null : selected;
          return { data: data === null ? null : structuredClone(data), error: null, count };
        }).then(resolve, reject);
      },
    };
    return query;
  };
  const client = {
    from,
    rpc(name, payload) {
      control.calls.push({ rpc: name, payload: structuredClone(payload) });
      if (control.rpcReject) return Promise.reject(control.rpcReject);
      return Promise.resolve({ data: control.rpcResult, error: control.rpcError });
    },
    control,
    tables,
  };
  return client;
}

function makeAsset(id = uuid(1), unit = "miles", name = "Synthetic vehicle") {
  return { id, name, usage_unit: unit, version: 3, created_at: now, updated_at: now };
}

function makeItem(id, overrides = {}) {
  return {
    id: uuid(id),
    display_name: `Synthetic maintenance ${id}`,
    item_group: "routine",
    availability_mode: "all_assets",
    current_asset_id: null,
    archived_at: null,
    version: 2,
    ...overrides,
  };
}

function makeHistory(id, serviceDate, overrides = {}) {
  return {
    id: uuid(id),
    asset_id: uuid(1),
    service_date: serviceDate,
    usage_reading_value: null,
    usage_reading_unit: "none",
    mechanic: null,
    version: 1,
    ...overrides,
  };
}

function setup(seed = {}) {
  const client = createFakeClient(seed);
  return { client, service: createVehiclesService(() => client) };
}

test("VEHICLES: asset list uses mapped fields and deterministic case-insensitive ordering", async () => {
  const { service, client } = setup({
    vehicles_assets: [
      makeAsset(uuid(2), "hours", "alpha"),
      makeAsset(uuid(3), "none", "Alpha"),
      makeAsset(uuid(1), "miles", "Bravo"),
    ],
  });
  const assets = await service.listAssets();
  assert.deepEqual(asPlain(assets.map(({ name, usageUnit }) => [name, usageUnit])), [
    ["Alpha", "none"], ["alpha", "hours"], ["Bravo", "miles"],
  ]);
  assert.equal(assets[0].version, 3);
  assert.equal(client.control.calls[0].columns.includes("owner_id"), false);
  assert.deepEqual(asPlain(await setup().service.listAssets()), []);
});

test("VEHICLES: list pagination is complete beyond the PostgREST page size", async () => {
  const rows = Array.from({ length: 510 }, (_, index) => makeAsset(uuid(index + 1), "none", `Asset ${index}`));
  const { service, client } = setup({ vehicles_assets: rows });
  assert.equal((await service.listAssets()).length, 510);
  assert.deepEqual(client.control.calls.map((call) => [call.start, call.end]), [[0, 499], [500, 999]]);
});

test("VEHICLES: workspace reads are asset-scoped and calculate miles, hours, months, and missing history", async () => {
  const asset = makeAsset(uuid(1), "miles");
  const itemMiles = makeItem(10, { display_name: "Archived brake inspection", archived_at: now });
  const itemHours = makeItem(11, { display_name: "Engine hours", availability_mode: "current_asset_only", current_asset_id: uuid(1) });
  const itemMonths = makeItem(12, { display_name: "Seasonal" });
  const ongoing = [
    makeHistory(20, "2026-10-01", { usage_reading_value: 100, usage_reading_unit: "miles" }),
    makeHistory(21, "2026-11-01", { usage_reading_value: 300, usage_reading_unit: "hours" }),
  ];
  const { service, client } = setup({
    vehicles_assets: [asset],
    maintenance_items: [itemMiles, itemHours, itemMonths],
    vehicle_maintenance_item_assets: [],
    vehicle_ongoing_records: ongoing,
    vehicle_ongoing_items: [
      { record_id: uuid(20), maintenance_item_id: uuid(10), is_performed: true, display_name_snapshot: "Old brake label", group_snapshot: "routine" },
      { record_id: uuid(20), maintenance_item_id: uuid(12), is_performed: true, display_name_snapshot: "Seasonal snapshot", group_snapshot: "routine" },
      { record_id: uuid(21), maintenance_item_id: uuid(11), is_performed: false, display_name_snapshot: "Engine hours", group_snapshot: "routine" },
    ],
    vehicle_recommended_records: [makeHistory(30, "2026-11-02", { description: "Synthetic recommendation" })],
    vehicle_completed_records: [makeHistory(31, "2026-11-03", { service_description: "Synthetic completion" })],
    vehicle_maintenance_intervals: [
      { id: uuid(40), asset_id: uuid(1), maintenance_item_id: uuid(10), interval_value: "25.00", interval_unit: "miles", comments: null, version: 1 },
      { id: uuid(41), asset_id: uuid(1), maintenance_item_id: uuid(11), interval_value: 20, interval_unit: "hours", comments: "Synthetic note", version: 1 },
      { id: uuid(42), asset_id: uuid(1), maintenance_item_id: uuid(12), interval_value: 6, interval_unit: "months", comments: null, version: 1 },
    ],
    vehicle_key_information: [{
      id: uuid(50), asset_id: uuid(1), document: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic ", bold: true }, { text: "key" }] }] }, version: 4,
    }],
    vehicle_links: [
      { id: uuid(52), asset_id: uuid(1), url: "https://example.test/two", display_title: null, sort_order: 2, version: 1 },
      { id: uuid(51), asset_id: uuid(1), url: "https://example.test/one", display_title: "First", sort_order: 1, version: 1 },
    ],
  });
  const workspace = await service.loadVehicleWorkspace(uuid(1));
  const intervals = workspace.maintenanceIntervals;
  assert.equal(intervals[0].lastService.recordId, uuid(20));
  assert.deepEqual(asPlain(intervals[0].nextService), { kind: "usage", value: 125, unit: "miles" });
  assert.equal(intervals[1].notCalculatedReason, "no_qualifying_service");
  assert.deepEqual(asPlain(intervals[2].nextService), { kind: "date", serviceDate: "2027-04-01" });
  const archivedHistory = workspace.ongoingMaintenanceRecords.find((record) => record.id === uuid(20));
  assert.equal(archivedHistory.capturedItems[0].displayNameSnapshot, "Old brake label");
  assert.equal(archivedHistory.capturedItems.length, 2);
  assert.equal(workspace.maintenanceItems.some((item) => item.id === uuid(10)), false);
  assert.equal(workspace.maintenanceItemCatalog.find((item) => item.id === uuid(10)).archivedAt, now);
  assert.deepEqual(asPlain(workspace.links.map((link) => link.id)), [uuid(51), uuid(52)]);
  assert.equal(workspace.keyInformation.document.blocks[0].runs[0].bold, true);
  for (const collection of ["vehicle_ongoing_records", "vehicle_recommended_records", "vehicle_completed_records", "vehicle_maintenance_intervals", "vehicle_links"]) {
    const call = client.control.calls.find((entry) => entry.table === collection);
    assert(call.filters.some((filter) => filter.column === "asset_id" && filter.value === uuid(1)));
  }
  const childQuery = client.control.calls.find((entry) => entry.table === "vehicle_ongoing_items");
  assert.deepEqual(asPlain(childQuery.inFilters[0].values), [uuid(21), uuid(20)]);
  assert.equal(client.control.calls.length, 10);
});

test("VEHICLES: record details preserve snapshots and scope queries by both asset and record", async () => {
  const row = makeHistory(21, "2026-11-01", { usage_reading_value: "123.50", usage_reading_unit: "miles", mechanic: "Synthetic mechanic" });
  const { service, client } = setup({
    vehicles_assets: [makeAsset()],
    vehicle_ongoing_records: [row],
    vehicle_ongoing_items: [{
      record_id: uuid(21), maintenance_item_id: uuid(99), is_performed: false,
      display_name_snapshot: "Historical label", group_snapshot: "components_other",
    }],
  });
  const record = await service.getOngoingMaintenanceRecord(uuid(1), uuid(21));
  assert.equal(record.usageReadingValue, 123.5);
  assert.equal(record.mechanic, "Synthetic mechanic");
  assert.deepEqual(asPlain(record.capturedItems), [{
    maintenanceItemId: uuid(99),
    isPerformed: false,
    displayNameSnapshot: "Historical label",
    groupSnapshot: "components_other",
  }]);
  const rowCall = client.control.calls.find((call) => call.table === "vehicle_ongoing_records");
  assert.deepEqual(asPlain(rowCall.filters), [
    { column: "asset_id", value: uuid(1) },
    { column: "id", value: uuid(21) },
  ]);
});

test("VEHICLES: history lists sort newest first and newest selection is deterministic", async () => {
  const { service } = setup({
    vehicles_assets: [makeAsset()],
    vehicle_recommended_records: [
      makeHistory(3, "2026-01-01", { description: "Old" }),
      makeHistory(2, "2026-02-01", { description: "Tie second" }),
      makeHistory(1, "2026-02-01", { description: "Tie first" }),
    ],
  });
  const records = await service.listRecommendedServiceRecords(uuid(1));
  assert.deepEqual(asPlain(records.map((record) => record.id)), [uuid(1), uuid(2), uuid(3)]);
  assert.equal(records[0].description, "Tie first");
  assert.equal(newestRecord([]), null);
  assert.equal(newestRecord(records).id, uuid(1));
});

test("VEHICLES: new ongoing template includes all active applicable items and no archived or inapplicable item", async () => {
  const { service } = setup({
    vehicles_assets: [makeAsset(uuid(1), "hours")],
    maintenance_items: [
      makeItem(1),
      makeItem(2, { availability_mode: "current_asset_only", current_asset_id: uuid(1) }),
      makeItem(3, { availability_mode: "current_asset_only", current_asset_id: uuid(2) }),
      makeItem(4, { availability_mode: "selected_assets" }),
      makeItem(5, { archived_at: now }),
      makeItem(6, { availability_mode: "selected_assets", archived_at: now }),
    ],
    vehicle_maintenance_item_assets: [
      { maintenance_item_id: uuid(4), asset_id: uuid(1) },
      { maintenance_item_id: uuid(6), asset_id: uuid(1) },
    ],
  });
  const template = await service.createOngoingMaintenanceDraftTemplate(uuid(1));
  assert.equal(template.usageReadingUnit, "hours");
  assert.deepEqual(asPlain(template.items.map((item) => item.maintenanceItemId)), [uuid(1), uuid(2), uuid(4)]);
  assert(template.items.every((item) => item.isPerformed === false));
  assert.equal(template.items[0].displayNameSnapshot, "Synthetic maintenance 1");
});

test("VEHICLES: absent Key Information is null; malformed persisted documents surface data errors", async () => {
  const { service } = setup({ vehicles_assets: [makeAsset()], vehicle_key_information: [] });
  assert.equal(await service.getKeyInformation(uuid(1)), null);
  const malformed = setup({
    vehicles_assets: [makeAsset()],
    vehicle_key_information: [{ id: uuid(50), asset_id: uuid(1), document: { schemaVersion: 2, blocks: [] }, version: 1 }],
  });
  await assert.rejects(malformed.service.getKeyInformation(uuid(1)), (error) => {
    assert.equal(error.code, "data_error");
    return true;
  });
});

test("VEHICLES: corrupt numeric rows and foreign record identities do not silently coerce or escape scope", async () => {
  const corrupt = setup({
    vehicles_assets: [makeAsset()],
    vehicle_completed_records: [makeHistory(33, "2026-02-01", { usage_reading_value: "12x", usage_reading_unit: "miles", service_description: "Bad number" })],
  });
  await assert.rejects(corrupt.service.listCompletedServiceRecords(uuid(1)), /invalid/i);
  const foreign = setup({ vehicles_assets: [makeAsset()] });
  await assert.rejects(foreign.service.getCompletedServiceRecord(uuid(1), uuid(99)), (error) => {
    assert.equal(error.code, "not_found");
    return true;
  });
});

test("VEHICLES: interval engine uses latest qualifying states and reports unit mismatch or missing readings", async () => {
  const { service } = setup({
    vehicles_assets: [makeAsset(uuid(1), "hours")],
    maintenance_items: [makeItem(10), makeItem(11), makeItem(12)],
    vehicle_maintenance_item_assets: [],
    vehicle_ongoing_records: [
      makeHistory(20, "2026-01-01", { usage_reading_value: 100, usage_reading_unit: "miles" }),
      makeHistory(21, "2026-02-01", { usage_reading_value: null, usage_reading_unit: "miles" }),
    ],
    vehicle_ongoing_items: [
      { record_id: uuid(20), maintenance_item_id: uuid(10), is_performed: true, display_name_snapshot: "Archived", group_snapshot: "routine" },
      { record_id: uuid(21), maintenance_item_id: uuid(10), is_performed: true, display_name_snapshot: "Archived", group_snapshot: "routine" },
      { record_id: uuid(20), maintenance_item_id: uuid(11), is_performed: true, display_name_snapshot: "Removed", group_snapshot: "routine" },
    ],
    vehicle_maintenance_intervals: [
      { id: uuid(40), asset_id: uuid(1), maintenance_item_id: uuid(10), interval_value: 10, interval_unit: "miles", comments: null, version: 1 },
      { id: uuid(41), asset_id: uuid(1), maintenance_item_id: uuid(11), interval_value: 10, interval_unit: "hours", comments: null, version: 1 },
      { id: uuid(42), asset_id: uuid(1), maintenance_item_id: uuid(12), interval_value: 3, interval_unit: "months", comments: null, version: 1 },
    ],
  });
  const intervals = await service.listMaintenanceIntervals(uuid(1));
  assert.equal(intervals[0].lastService.recordId, uuid(21));
  assert.equal(intervals[0].notCalculatedReason, "usage_reading_missing");
  assert.equal(intervals[1].notCalculatedReason, "usage_unit_mismatch");
  assert.equal(intervals[2].notCalculatedReason, "no_qualifying_service");
});

test("VEHICLES: change draft no-op avoids RPC and complex changes map explicitly to the atomic RPC", async () => {
  const { service, client } = setup();
  const draft = createVehicleChangesDraft({ asset: { id: uuid(1), version: 3 } });
  assert.deepEqual(asPlain(await service.saveVehicleChanges(draft)), { status: "no_changes", assetVersion: 3 });
  assert.equal(client.control.calls.length, 0);

  const requestId = uuid(70);
  const keyDocument = { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic" }] }] };
  Object.assign(draft, {
    requestId,
    assetPatch: { usageUnit: "hours" },
    ongoingOperations: [{
      action: "create", id: uuid(71), serviceDate: "2026-11-01", usageReadingUnit: "hours",
      usageReadingValue: 45, mechanic: null,
      items: [{ maintenanceItemId: uuid(72), isPerformed: false, displayNameSnapshot: "Snapshot", groupSnapshot: "routine" }],
    }],
    recommendedOperations: [{ action: "create", id: uuid(73), serviceDate: "2026-11-02", usageReadingUnit: "none", description: "Synthetic recommendation" }],
    completedOperations: [{ action: "create", id: uuid(74), serviceDate: "2026-11-03", usageReadingUnit: "none", serviceDescription: "Synthetic completed" }],
    intervalOperations: [{ action: "update", id: uuid(75), expectedVersion: 2, intervalValue: 50, intervalUnit: "hours" }],
    keyInformationOperation: { action: "update", id: uuid(76), expectedVersion: 4, document: keyDocument },
    linkOperations: [{ action: "create", id: uuid(77), url: "https://example.test/manual", displayTitle: "Manual", sortOrder: 1 }],
    maintenanceItemOperations: [{ action: "create", id: uuid(78), displayName: "Synthetic catalog item", group: "routine", availabilityMode: "all_assets" }],
    availabilityOperations: [buildAvailabilityOperation(
      { id: uuid(78), version: 1, availabilityMode: "selected_assets" },
      { addAssetIds: [uuid(1)], removeAssetIds: [] },
    )],
  });
  client.control.rpcResult = {
    ok: true, request_id: requestId, replayed: false, asset_id: uuid(1), asset_version: 4,
    entity_versions: { ongoing: { [uuid(71)]: 1 } }, created_ids: { ongoing: [uuid(71)] },
    deleted_ids: {}, affected_asset_versions: { [uuid(1)]: 4 },
  };
  const result = await service.saveVehicleChanges(draft);
  assert.equal(result.status, "saved");
  assert.equal(result.assetVersion, 4);
  const rpc = client.control.calls.find((call) => call.rpc);
  assert.equal(rpc.rpc, "save_vehicles_changes");
  assert.equal(Object.hasOwn(rpc.payload, "owner_id"), false);
  assert.equal(rpc.payload.request_id, requestId);
  assert.equal(rpc.payload.expected_asset_version, 3);
  assert.equal(rpc.payload.ongoing_operations[0].items[0].maintenance_item_id, uuid(72));
  assert.equal(rpc.payload.recommended_operations[0].service_date, "2026-11-02");
  assert.equal(rpc.payload.completed_operations[0].service_date, "2026-11-03");
  assert.equal(rpc.payload.interval_operations[0].expected_version, 2);
  assert.equal(rpc.payload.key_information_operation.document.blocks[0].runs[0].text, "Synthetic");
  assert.equal(rpc.payload.link_operations[0].display_title, "Manual");
  assert.deepEqual(asPlain(rpc.payload.availability_operations[0]), {
    maintenance_item_id: uuid(78), expected_version: 1, add_asset_ids: [uuid(1)], remove_asset_ids: [],
  });
  assert.equal(Object.hasOwn(rpc.payload.availability_operations[0], "action"), false);
});

test("VEHICLES: unknown save outcome preserves request and entity IDs for explicit retry", async () => {
  const { service, client } = setup();
  const draft = {
    assetId: uuid(1), expectedAssetVersion: 3,
    ongoingOperations: [{ action: "create", id: uuid(90), serviceDate: "2026-11-01", usageReadingUnit: "none", items: [] }],
  };
  client.control.rpcReject = Object.assign(new Error("network response lost"), { code: "ETIMEDOUT" });
  let unknown;
  await assert.rejects(service.saveVehicleChanges(draft), (error) => {
    unknown = error;
    assert.equal(error.code, "unknown_outcome");
    assert.equal(error.requestId, error.retryDraft.requestId);
    assert.equal(error.retryDraft.ongoingOperations[0].id, uuid(90));
    return true;
  });
  client.control.rpcReject = null;
  client.control.rpcResult = {
    ok: true, request_id: unknown.requestId, replayed: true, asset_id: uuid(1), asset_version: 4,
    entity_versions: {}, created_ids: { ongoing: [uuid(90)] }, deleted_ids: {}, affected_asset_versions: {},
  };
  const result = await service.saveVehicleChanges(unknown.retryDraft);
  assert.equal(result.replayed, true);
  assert.equal(client.control.calls[0].payload.request_id, client.control.calls[1].payload.request_id);
  assert.equal(client.control.calls[0].payload.ongoing_operations[0].id, client.control.calls[1].payload.ongoing_operations[0].id);
});

test("VEHICLES: structured RPC conflicts are safe application errors, not unknown outcomes", async () => {
  const { service, client } = setup();
  client.control.rpcError = {
    code: "P0001",
    details: JSON.stringify({ code: "version_conflict", context: { entity: "asset" } }),
  };
  await assert.rejects(service.saveVehicleChanges({
    assetId: uuid(1), expectedAssetVersion: 1, assetPatch: { name: "Changed" },
  }), (error) => {
    assert.equal(error.code, "version_conflict");
    assert.equal(error.requestId, client.control.calls[0].payload.request_id);
    assert.equal("cause" in error, false);
    return true;
  });
});

test("VEHICLES: delete and catalog helpers preserve versions, selected assets, and explicit archive intent", () => {
  const ongoingDelete = buildRecordDeleteOperation("ongoing", { id: uuid(1), version: 4 }, uuid(9));
  assert.deepEqual(asPlain(ongoingDelete), {
    assetId: uuid(9), collection: "ongoingOperations", operation: { action: "delete", id: uuid(1), expectedVersion: 4 },
  });
  assert.equal(buildRecordDeleteOperation("recommended", { id: uuid(2), version: 2 }, uuid(9)).collection, "recommendedOperations");
  assert.equal(buildRecordDeleteOperation("completed", { id: uuid(3), version: 1 }, uuid(9)).collection, "completedOperations");
  assert.throws(() => buildRecordDeleteOperation("asset", { id: uuid(1), version: 1 }, uuid(9)), /Only Ongoing/);

  const create = buildMaintenanceItemCreateOperation({
    id: uuid(10), displayName: "Selected", group: "routine", availabilityMode: "selected_assets",
    selectedAssetIds: [uuid(2), uuid(1), uuid(2)],
  });
  assert.deepEqual(asPlain(create.selectedAssetIds), [uuid(1), uuid(2)]);
  const archive = buildMaintenanceItemUpdateOperation({ id: uuid(10), version: 2 }, { archived: true });
  assert.deepEqual(asPlain(archive), { action: "update", id: uuid(10), expectedVersion: 2, archived: true });
  const availability = buildAvailabilityOperation(
    { id: uuid(10), version: 3, availabilityMode: "selected_assets" },
    { addAssetIds: [uuid(4)], removeAssetIds: [uuid(2)] },
  );
  assert.equal(Object.hasOwn(availability, "action"), false);
  assert.equal(availability.expectedVersion, 3);
  assert.deepEqual(asPlain(availability.addAssetIds), [uuid(4)]);
  assert.deepEqual(asPlain(availability.removeAssetIds), [uuid(2)]);
});

test("VEHICLES: data access rejects failed reads and pages child rows in bounded batches", async () => {
  const childIds = Array.from({ length: 501 }, (_, index) => uuid(index + 1));
  const childRows = childIds.map((id) => ({
    record_id: id, maintenance_item_id: uuid(1000), is_performed: true,
    display_name_snapshot: "Synthetic", group_snapshot: "routine",
  }));
  const { client } = setup({ vehicle_ongoing_items: childRows });
  const access = createVehiclesDataAccess(client);
  const result = await access.listOngoingItems(childIds);
  assert.equal(result.length, 501);
  assert.equal(client.control.calls.filter((call) => call.table === "vehicle_ongoing_items").length, 2);

  const invalidClient = {
    from() {
      return { select() { return this; }, order() { return this; }, range() { return this; },
        then(resolve) { return Promise.resolve({ data: null, error: { code: "42501" } }).then(resolve); } };
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  };
  await assert.rejects(createVehiclesDataAccess(invalidClient).listAssets(), (error) => {
    assert.equal(error instanceof VehiclesDataAccessError, true);
    return true;
  });
});
