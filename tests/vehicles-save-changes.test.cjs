const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const root = path.resolve(__dirname, "..");
const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const phase4a = fs.readFileSync(path.join(root, "supabase", "migrations", "202611110001_vehicles_domain.sql"), "utf8");
const phase4b = fs.readFileSync(path.join(root, "supabase", "migrations", "202611110002_vehicles_save_changes_rpc.sql"), "utf8");
const phase5bp = fs.readFileSync(path.join(root, "supabase", "migrations", "202611130001_vehicles_asset_creation_rpc.sql"), "utf8");
const phase5cp = fs.readFileSync(path.join(root, "supabase", "migrations", "202611130002_vehicles_maintenance_item_catalog_rpc.sql"), "utf8");
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
let db;
let nextUuid = 1;

function uuid() {
  const suffix = String(nextUuid++).padStart(12, "0");
  return `30000000-0000-4000-8000-${suffix}`;
}

function request(assetId, extra = {}) {
  return {
    request_id: uuid(),
    asset_id: assetId,
    expected_asset_version: 1,
    ...extra,
  };
}

async function asRole(role, owner, statement) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub',${quote(owner ?? "")},false)`);
  try {
    return await db.query(statement);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  }
}

async function save(payload, owner = ownerA) {
  return saveWithParams(payload, owner);
}

async function saveWithParams(payload, owner = ownerA) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub',${quote(owner ?? "")},false)`);
  try {
    return (await db.query("select public.save_vehicles_changes($1::jsonb) as result",
      [JSON.stringify(payload)])).rows[0].result;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  }
}

async function createAssetWithParams(payload, owner = ownerA) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub',${quote(owner ?? "")},false)`);
  try {
    return (await db.query("select public.create_vehicle_asset($1::jsonb) as result",
      [JSON.stringify(payload)])).rows[0].result;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  }
}

async function saveMaintenanceItemWithParams(payload, owner = ownerA) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub',${quote(owner ?? "")},false)`);
  try {
    return (await db.query("select public.save_maintenance_item($1::jsonb) as result",
      [JSON.stringify(payload)])).rows[0].result;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  }
}

async function expectCode(payload, expected, owner = ownerA) {
  await assert.rejects(saveWithParams(payload, owner), (error) => {
    assert.equal(error.code, "P0001");
    assert.equal(JSON.parse(error.detail).code, expected);
    return true;
  });
}

async function expectAssetCode(payload, expected, owner = ownerA) {
  await assert.rejects(createAssetWithParams(payload, owner), (error) => {
    assert.equal(error.code, "P0001");
    assert.equal(JSON.parse(error.detail).code, expected);
    return true;
  });
}

async function expectCatalogCode(payload, expected, owner = ownerA) {
  await assert.rejects(saveMaintenanceItemWithParams(payload, owner), (error) => {
    assert.equal(error.code, "P0001");
    assert.equal(JSON.parse(error.detail).code, expected);
    return true;
  });
}

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function scalar(sql, params = []) {
  const result = await rows(sql, params);
  assert.equal(result.length, 1);
  return Object.values(result[0])[0];
}

async function asset(owner = ownerA, name = `Synthetic asset ${nextUuid}`, unit = "miles") {
  return (await db.query(
    "insert into public.vehicles_assets(owner_id,name,usage_unit) values($1,$2,$3) returning id",
    [owner, name, unit]
  )).rows[0].id;
}

async function catalogItem(owner = ownerA, name = `Synthetic item ${nextUuid}`, mode = "all_assets", currentAsset = null) {
  return (await db.query(`insert into public.maintenance_items
    (owner_id,display_name,item_group,availability_mode,current_asset_id)
    values($1,$2,'routine',$3,$4) returning id`, [owner, name, mode, currentAsset])).rows[0].id;
}

function ongoingItem(itemId, performed = true, name = "Synthetic item", group = "routine") {
  return {
    maintenance_item_id: itemId,
    is_performed: performed,
    display_name_snapshot: name,
    group_snapshot: group,
  };
}

test.before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users(id) values ('${ownerA}'),('${ownerB}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  await db.exec(phase4a);
  await db.exec(phase4b);
  await db.exec(phase5bp);
  await db.exec(phase5cp);
});

test.after(async () => {
  await db?.close();
});

test.beforeEach(async () => {
  await db.exec(`truncate public.vehicles_save_requests,
    public.vehicle_links, public.vehicle_key_information, public.vehicle_maintenance_intervals,
    public.vehicle_completed_records, public.vehicle_recommended_records, public.vehicle_ongoing_records,
    public.maintenance_items, public.vehicles_assets cascade`);
});

test("function is restricted SECURITY DEFINER and direct client DML remains denied", async () => {
  assert.equal(await scalar(`select prosecdef from pg_catalog.pg_proc
    where oid='public.save_vehicles_changes(jsonb)'::regprocedure`), true);
  assert.equal(await scalar(`select has_function_privilege('authenticated','public.save_vehicles_changes(jsonb)','EXECUTE')`), true);
  assert.equal(await scalar(`select has_function_privilege('anon','public.save_vehicles_changes(jsonb)','EXECUTE')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.vehicles_assets','INSERT')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.vehicle_links','UPDATE')`), false);
  await assert.rejects(asRole("authenticated", ownerA,
    "insert into public.vehicles_assets(owner_id,name,usage_unit) values('10000000-0000-4000-8000-000000000001','Direct','miles')"),
  /permission denied/i);
  assert.equal(await scalar(`select prosecdef from pg_catalog.pg_proc
    where oid='public.create_vehicle_asset(jsonb)'::regprocedure`), true);
  assert.equal(await scalar(`select has_function_privilege('authenticated','public.create_vehicle_asset(jsonb)','EXECUTE')`), true);
  assert.equal(await scalar(`select has_function_privilege('anon','public.create_vehicle_asset(jsonb)','EXECUTE')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.vehicles_assets','INSERT')`), false);
  await assert.rejects(asRole("authenticated", ownerA,
    "insert into public.vehicles_assets(owner_id,name,usage_unit) values('10000000-0000-4000-8000-000000000001','Direct asset','miles')"),
  /permission denied/i);
});

test("asset creation validates identity, names and units and creates only an owner-scoped v1 asset", async () => {
  const unauthenticated = {
    request_id: uuid(), asset_id: uuid(), name: "Synthetic unauthenticated", usage_unit: "miles",
  };
  await expectAssetCode(unauthenticated, "authorization_error", null);

  const valid = { request_id: uuid(), asset_id: uuid(), name: " \t Synthetic engine \t ", usage_unit: "hours" };
  const created = await createAssetWithParams(valid);
  assert.equal(created.asset_id, valid.asset_id);
  assert.equal(created.asset.name, "Synthetic engine");
  assert.equal(created.asset.usage_unit, "hours");
  assert.equal(created.asset.version, 1);
  assert.equal(created.asset.created_at !== null, true);
  assert.equal(created.asset.updated_at !== null, true);
  assert.equal(await scalar("select owner_id::text from public.vehicles_assets where id=$1", [valid.asset_id]), ownerA);
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_records"), 0);
  assert.equal(await scalar("select count(*) from public.maintenance_items"), 0);
  assert.equal(await scalar("select count(*) from public.vehicle_links"), 0);
  await expectAssetCode({ ...valid, request_id: uuid(), asset_id: uuid(), owner_id: ownerB }, "validation_error");
  await expectAssetCode({ ...valid, request_id: uuid(), asset_id: uuid(), name: " \t " }, "validation_error");
  await expectAssetCode({ ...valid, request_id: uuid(), asset_id: uuid(), name: "x".repeat(121) }, "validation_error");
  await expectAssetCode({ ...valid, request_id: uuid(), asset_id: uuid(), usage_unit: "kilometers" }, "validation_error");

  for (const usageUnit of ["miles", "hours", "none"]) {
    const result = await createAssetWithParams({
      request_id: uuid(), asset_id: uuid(), name: "Duplicate display name is allowed", usage_unit: usageUnit,
    });
    assert.equal(result.asset.usage_unit, usageUnit);
  }
});

test("asset creation retries reconcile the stable ID and reject foreign or incompatible ID reuse", async () => {
  const payload = {
    request_id: uuid(), asset_id: uuid(), name: "Synthetic retry asset", usage_unit: "none",
  };
  const first = await createAssetWithParams(payload);
  const replay = await createAssetWithParams(payload);
  assert.equal(first.reconciled, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.asset_id, payload.asset_id);
  assert.equal(await scalar("select count(*) from public.vehicles_assets where id=$1", [payload.asset_id]), 1);

  const secondRequest = await createAssetWithParams({ ...payload, request_id: uuid() });
  assert.equal(secondRequest.reconciled, true);
  assert.equal(await scalar("select count(*) from public.vehicles_assets where id=$1", [payload.asset_id]), 1);

  await expectAssetCode({ ...payload, request_id: uuid(), name: "Incompatible retry" }, "asset_id_conflict");
  await expectAssetCode(payload, "asset_id_conflict", ownerB);
  await expectAssetCode({ ...payload, name: "Different payload with same request" }, "request_id_payload_mismatch");
});

test("asset creation and existing asset-scoped save RPC remain separate", async () => {
  const payload = { request_id: uuid(), asset_id: uuid(), name: "Created then updated", usage_unit: "miles" };
  const created = await createAssetWithParams(payload);
  const updated = await save(request(created.asset_id, {
    asset_patch: { name: "Updated through the existing save RPC" },
  }));
  assert.equal(updated.asset_version, 2);
  assert.equal(await scalar("select name from public.vehicles_assets where id=$1", [created.asset_id]),
    "Updated through the existing save RPC");
});

test("authentication, owner isolation, strict request fields, and owner_id spoofing", async () => {
  const ownerAsset = await asset();
  await expectCode(request(ownerAsset), "authorization_error", null);
  await expectCode(request(ownerAsset), "not_found", ownerB);
  await expectCode(request(ownerAsset, { owner_id: ownerB }), "validation_error");
  await expectCode(request(ownerAsset, { recommended_operations: {} }), "validation_error");

  const foreignItem = await catalogItem(ownerB);
  await expectCode(request(ownerAsset, {
    interval_operations: [{
      action: "create", id: uuid(), maintenance_item_id: foreignItem,
      interval_value: 10, interval_unit: "miles",
    }],
  }), "not_found");
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals"), 0);
});

test("owner-scoped history, links, and selected-asset references reject foreign entities", async () => {
  const ownerAsset = await asset();
  const foreignAsset = await asset(ownerB);
  const foreignRecord = uuid();
  const foreignLink = uuid();
  await db.query(`insert into public.vehicle_ongoing_records
    (id,owner_id,asset_id,service_date,usage_reading_unit)
    values($1,$2,$3,'2026-01-03','none')`, [foreignRecord, ownerB, foreignAsset]);
  await db.query(`insert into public.vehicle_links(id,owner_id,asset_id,url)
    values($1,$2,$3,'https://example.test/foreign')`, [foreignLink, ownerB, foreignAsset]);

  await expectCode(request(ownerAsset, {
    ongoing_operations: [{ action: "update", id: foreignRecord, expected_version: 1, mechanic: "Synthetic mechanic" }],
  }), "not_found");
  await expectCode(request(ownerAsset, {
    link_operations: [{ action: "update", id: foreignLink, expected_version: 1, display_title: "Synthetic title" }],
  }), "not_found");
  await expectCode(request(ownerAsset, {
    maintenance_item_operations: [{
      action: "create", id: uuid(), display_name: "Synthetic foreign selection",
      item_group: "routine", availability_mode: "selected_assets", selected_asset_ids: [foreignAsset],
    }],
  }), "validation_error");
  assert.equal(await scalar("select version from public.vehicle_ongoing_records where id=$1", [foreignRecord]), 1);
  assert.equal(await scalar("select version from public.vehicle_links where id=$1", [foreignLink]), 1);
});

test("empty no-op is stable, JSONB key order replays, and mismatched replay is rejected", async () => {
  const assetId = await asset();
  const first = request(assetId, { asset_patch: { name: "Synthetic key order" } });
  const result = await save(first);
  assert.equal(result.ok, true);
  assert.equal(result.replayed, false);
  assert.equal(result.asset_version, 2);

  const reordered = {
    asset_patch: { name: "Synthetic key order" },
    expected_asset_version: 1,
    asset_id: assetId,
    request_id: first.request_id,
  };
  const replay = await save(reordered);
  assert.equal(replay.replayed, true);
  assert.equal(replay.asset_version, 2);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
  assert.equal(await scalar("select count(*) from public.vehicles_save_requests where request_id=$1", [first.request_id]), 1);

  await expectCode({ ...reordered, asset_patch: { name: "Different payload" } }, "request_id_payload_mismatch");
  const noop = await save(request(assetId, { expected_asset_version: 2 }));
  assert.equal(noop.asset_version, 2);
  assert.deepEqual(noop.created_ids, {});

  const currentName = await scalar("select name from public.vehicles_assets where id=$1", [assetId]);
  const explicitSameValue = await save(request(assetId, {
    expected_asset_version: 2,
    asset_patch: { name: currentName },
  }));
  assert.equal(explicitSameValue.asset_version, 3);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 3);
});

test("asset and child-only writes increment the aggregate revision once; stale saves roll back", async () => {
  const assetId = await asset();
  const saved = await save(request(assetId, {
    recommended_operations: [{
      action: "create", id: uuid(), service_date: "2026-01-02",
      usage_reading_unit: "miles", usage_reading_value: 10, description: "Synthetic recommendation",
    }],
    completed_operations: [{
      action: "create", id: uuid(), service_date: "2026-01-02",
      usage_reading_unit: "hours", usage_reading_value: null, mechanic: null,
      service_description: "Synthetic completed work",
    }],
    link_operations: [{ action: "create", id: uuid(), url: "https://example.test/guide" }],
  }));
  assert.equal(saved.asset_version, 2);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
  assert.equal(await scalar("select count(*) from public.vehicle_recommended_records where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_completed_records where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_links where asset_id=$1", [assetId]), 1);

  await expectCode(request(assetId, {
    expected_asset_version: 1,
    link_operations: [{ action: "create", id: uuid(), url: "https://example.test/stale" }],
  }), "version_conflict");
  assert.equal(await scalar("select count(*) from public.vehicle_links where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
});

test("Completed Service RPC preserves multiline plain text on create and edit", async () => {
  const assetId = await asset();
  const id = uuid();
  const initial = "Rear Shock Air Compressor\n- Replaced compressor\n- Tested automatic leveling";
  await save(request(assetId, { completed_operations: [{
    action: "create", id, service_date: "2006-10-10", usage_reading_unit: "miles",
    usage_reading_value: 30247, service_description: initial,
  }] }));
  assert.equal(await scalar("select service_description from public.vehicle_completed_records where id=$1", [id]), initial);
  const edited = "Mechanic\u2019s service\r\n\u2022 Replaced\u00a0compressor\r\n\r\n<script>literal</script>";
  await save(request(assetId, { expected_asset_version: 2, completed_operations: [{
    action: "update", id, expected_version: 1, service_description: edited,
  }] }));
  assert.equal(await scalar("select service_description from public.vehicle_completed_records where id=$1", [id]), edited);
});

test("mixed history, Key Information, and interval changes use one atomic request and exact replay", async () => {
  const assetId = await asset();
  const itemId = await catalogItem(ownerA, "Synthetic combined interval item");
  const ongoingId = uuid();
  const recommendedId = uuid();
  const completedId = uuid();
  const intervalId = uuid();
  const keyId = uuid();
  const payload = request(assetId, {
    ongoing_operations: [{
      action: "create", id: ongoingId, service_date: "2026-03-01",
      usage_reading_unit: "miles", usage_reading_value: 100,
      items: [ongoingItem(itemId, true, "Synthetic combined interval item")],
    }],
    recommended_operations: [{
      action: "create", id: recommendedId, service_date: "2026-03-02",
      usage_reading_unit: "none", description: "Synthetic recommendation",
    }],
    completed_operations: [{
      action: "create", id: completedId, service_date: "2026-03-03",
      usage_reading_unit: "none", service_description: "Synthetic completed work",
    }],
    key_information_operation: {
      action: "create", id: keyId, document: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic key note" }] }] },
    },
    interval_operations: [{
      action: "create", id: intervalId, maintenance_item_id: itemId,
      interval_value: 5000, interval_unit: "miles", comments: "Synthetic interval",
    }],
  });
  const saved = await save(payload);
  assert.equal(saved.replayed, false);
  assert.deepEqual(saved.created_ids.intervals, [intervalId]);
  assert.equal(saved.entity_versions.intervals[intervalId], 1);
  assert.equal(saved.entity_versions.ongoing[ongoingId], 1);
  assert.equal(saved.entity_versions.recommended[recommendedId], 1);
  assert.equal(saved.entity_versions.completed[completedId], 1);
  assert.equal(saved.entity_versions.key_information[keyId], 1);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);

  const replay = await save(payload);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.created_ids.intervals, [intervalId]);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_records where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_recommended_records where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_completed_records where asset_id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_key_information where asset_id=$1", [assetId]), 1);
});

test("mixed interval and Ongoing request rolls back every collection on a later duplicate service date", async () => {
  const assetId = await asset();
  const itemId = await catalogItem(ownerA, "Synthetic rollback interval item");
  const intervalId = uuid();
  const serviceDate = "2026-04-04";
  await expectCode(request(assetId, {
    ongoing_operations: [
      { action: "create", id: uuid(), service_date: serviceDate, usage_reading_unit: "none",
        items: [ongoingItem(itemId, false, "Synthetic rollback interval item")] },
      { action: "create", id: uuid(), service_date: serviceDate, usage_reading_unit: "none",
        items: [ongoingItem(itemId, false, "Synthetic rollback interval item")] },
    ],
    interval_operations: [{
      action: "create", id: intervalId, maintenance_item_id: itemId,
      interval_value: 500, interval_unit: "miles",
    }],
  }), "duplicate_service_date");
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where id=$1", [intervalId]), 0);
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_records where asset_id=$1", [assetId]), 0);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 1);
});

test("stale entity versions reject across every versioned child collection", async () => {
  const assetId = await asset();
  const itemId = uuid();
  const ongoingId = uuid();
  const recommendedId = uuid();
  const completedId = uuid();
  const intervalId = uuid();
  const keyId = uuid();
  const linkId = uuid();
  const created = await save(request(assetId, {
    maintenance_item_operations: [{
      action: "create", id: itemId, display_name: "Synthetic Version Item",
      item_group: "routine", availability_mode: "all_assets",
    }],
    ongoing_operations: [{
      action: "create", id: ongoingId, service_date: "2026-01-11",
      usage_reading_unit: "none", items: [ongoingItem(itemId, false, "Synthetic Version Item")],
    }],
    recommended_operations: [{
      action: "create", id: recommendedId, service_date: "2026-01-11",
      usage_reading_unit: "none", description: "Synthetic recommendation",
    }],
    completed_operations: [{
      action: "create", id: completedId, service_date: "2026-01-11",
      usage_reading_unit: "none", service_description: "Synthetic completed work",
    }],
    interval_operations: [{
      action: "create", id: intervalId, maintenance_item_id: itemId,
      interval_value: 100, interval_unit: "miles",
    }],
    key_information_operation: {
      action: "create", id: keyId,
      document: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic version data" }] }] },
    },
    link_operations: [{ action: "create", id: linkId, url: "https://example.test/version" }],
  }));
  assert.equal(created.asset_version, 2);

  for (const payload of [
    { maintenance_item_operations: [{ action: "update", id: itemId, expected_version: 2, display_name: "Stale" }] },
    { ongoing_operations: [{ action: "update", id: ongoingId, expected_version: 2, mechanic: "Stale" }] },
    { recommended_operations: [{ action: "update", id: recommendedId, expected_version: 2, description: "Stale" }] },
    { completed_operations: [{ action: "delete", id: completedId, expected_version: 2 }] },
    { interval_operations: [{ action: "delete", id: intervalId, expected_version: 2 }] },
    { key_information_operation: { action: "delete", id: keyId, expected_version: 2 } },
    { link_operations: [{ action: "delete", id: linkId, expected_version: 2 }] },
  ]) {
    await expectCode(request(assetId, { expected_asset_version: 2, ...payload }), "version_conflict");
  }
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
  assert.equal(await scalar("select version from public.maintenance_items where id=$1", [itemId]), 1);
  assert.equal(await scalar("select version from public.vehicle_ongoing_records where id=$1", [ongoingId]), 1);
  assert.equal(await scalar("select version from public.vehicle_recommended_records where id=$1", [recommendedId]), 1);
  assert.equal(await scalar("select version from public.vehicle_completed_records where id=$1", [completedId]), 1);
  assert.equal(await scalar("select version from public.vehicle_maintenance_intervals where id=$1", [intervalId]), 1);
  assert.equal(await scalar("select version from public.vehicle_key_information where id=$1", [keyId]), 1);
  assert.equal(await scalar("select version from public.vehicle_links where id=$1", [linkId]), 1);
});

test("idempotent replay after multiple writes is zero-write and failed retries retain the client IDs", async () => {
  const assetId = await asset();
  const itemId = uuid();
  const recordId = uuid();
  const requestId = uuid();
  const payload = {
    request_id: requestId,
    asset_id: assetId,
    expected_asset_version: 1,
    maintenance_item_operations: [{
      action: "create", id: itemId, display_name: "Synthetic Oil",
      item_group: "routine", availability_mode: "all_assets",
    }],
    ongoing_operations: [{
      action: "create", id: recordId, service_date: "2026-02-01",
      usage_reading_unit: "miles", usage_reading_value: 12,
      items: [ongoingItem(itemId, true, "Synthetic Oil")],
    }],
    link_operations: [{ action: "create", id: uuid(), url: "https://example.test/rollback" }],
  };
  const result = await save(payload);
  assert.equal(result.asset_version, 2);
  const replay = await save(payload);
  assert.equal(replay.replayed, true);
  assert.equal(await scalar("select count(*) from public.maintenance_items where id=$1", [itemId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_records where id=$1", [recordId]), 1);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
  assert.equal(await scalar("select count(*) from public.vehicle_links where asset_id=$1", [assetId]), 1);
});

test("late invalid link rolls back catalog, history, intervals, key information, versions, and receipt", async () => {
  const assetId = await asset();
  const itemId = uuid();
  const recordId = uuid();
  const recommendedId = uuid();
  const intervalId = uuid();
  const keyId = uuid();
  const linkId = uuid();
  const requestId = uuid();
  const payload = {
    request_id: requestId,
    asset_id: assetId,
    expected_asset_version: 1,
    maintenance_item_operations: [{
      action: "create", id: itemId, display_name: "Synthetic Late Item",
      item_group: "routine", availability_mode: "all_assets",
    }],
    interval_operations: [{
      action: "create", id: intervalId, maintenance_item_id: itemId,
      interval_value: 500, interval_unit: "miles",
    }],
    ongoing_operations: [{
      action: "create", id: recordId, service_date: "2026-03-01",
      usage_reading_unit: "miles", usage_reading_value: 100,
      items: [ongoingItem(itemId, true, "Synthetic Late Item")],
    }],
    recommended_operations: [{
      action: "create", id: recommendedId, service_date: "2026-03-01",
      usage_reading_unit: "none", description: "Synthetic late recommendation",
    }],
    key_information_operation: {
      action: "create", id: keyId,
      document: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic rollback text", bold: true }] }] },
    },
    link_operations: [{ action: "create", id: linkId, url: "javascript:alert(1)" }],
  };
  await expectCode(payload, "validation_error");
  for (const [table, id] of [
    ["maintenance_items", itemId],
    ["vehicle_ongoing_records", recordId],
    ["vehicle_recommended_records", recommendedId],
    ["vehicle_maintenance_intervals", intervalId],
    ["vehicle_key_information", keyId],
    ["vehicle_links", linkId],
  ]) {
    assert.equal(await scalar(`select count(*) from public.${table} where id=$1`, [id]), 0, table);
  }
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicles_save_requests where request_id=$1", [requestId]), 0);

  payload.link_operations[0].url = "https://example.test/valid";
  const retry = await save(payload);
  assert.equal(retry.ok, true);
  assert.equal(retry.asset_version, 2);
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_items where record_id=$1", [recordId]), 1);
});

test("Ongoing creation captures the exact applicable set; edits retain historical membership and labels", async () => {
  const assetId = await asset();
  const created = await save(request(assetId, {
    maintenance_item_operations: [
      { action: "create", id: uuid(), display_name: "Synthetic Oil", item_group: "routine", availability_mode: "all_assets" },
      { action: "create", id: uuid(), display_name: "Synthetic Filter", item_group: "fluids_drivetrain", availability_mode: "all_assets" },
    ],
  }));
  const [oilId, filterId] = created.created_ids.maintenance_items;
  const recordId = uuid();
  const snapshot = request(assetId, {
    expected_asset_version: 2,
    ongoing_operations: [{
      action: "create", id: recordId, service_date: "2026-04-01",
      usage_reading_unit: "miles", usage_reading_value: 220, mechanic: null,
      items: [
        ongoingItem(filterId, false, "Synthetic Filter", "fluids_drivetrain"),
        ongoingItem(oilId, true, "Synthetic Oil"),
      ],
    }],
  });
  const saved = await save(snapshot);
  assert.equal(saved.asset_version, 3);
  assert.deepEqual(await rows(`select maintenance_item_id::text,is_performed,display_name_snapshot,group_snapshot
    from public.vehicle_ongoing_items where record_id=$1 order by maintenance_item_id`, [recordId]), [
    { maintenance_item_id: oilId, is_performed: true, display_name_snapshot: "Synthetic Oil", group_snapshot: "routine" },
    { maintenance_item_id: filterId, is_performed: false, display_name_snapshot: "Synthetic Filter", group_snapshot: "fluids_drivetrain" },
  ]);
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    ongoing_operations: [{
      action: "create", id: uuid(), service_date: "2026-04-02", usage_reading_unit: "none",
      items: [ongoingItem(oilId, true, "Synthetic Oil")],
    }],
  }), "validation_error");
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    maintenance_item_operations: [{ action: "delete", id: oilId, expected_version: 1 }],
  }), "item_archived_or_unavailable");
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_items where record_id=$1 and maintenance_item_id=$2", [recordId, oilId]), 1);

  const thirdItem = uuid();
  const catalogEdit = await save(request(assetId, {
    expected_asset_version: 3,
    maintenance_item_operations: [{
      action: "update", id: oilId, expected_version: 1,
      display_name: "Renamed Synthetic Oil", item_group: "components_other",
    }],
  }));
  assert.equal(catalogEdit.asset_version, 4);
  await expectCode(request(assetId, {
    expected_asset_version: 4,
    maintenance_item_operations: [{
      action: "update", id: oilId, expected_version: 1, display_name: "Stale Catalog Edit",
    }],
  }), "version_conflict");
  await save(request(assetId, {
    expected_asset_version: 4,
    maintenance_item_operations: [{
      action: "create", id: thirdItem, display_name: "Synthetic Later Item",
      item_group: "routine", availability_mode: "all_assets",
    }],
  }));
  await save(request(assetId, {
    expected_asset_version: 5,
    ongoing_operations: [{
      action: "update", id: recordId, expected_version: 1, items: [
        { maintenance_item_id: oilId, is_performed: false },
        { maintenance_item_id: filterId, is_performed: false },
      ],
    }],
  }));
  await expectCode(request(assetId, {
    expected_asset_version: 6,
    ongoing_operations: [{ action: "update", id: recordId, expected_version: 1, mechanic: "Stale" }],
  }), "version_conflict");
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_items where record_id=$1", [recordId]), 2);
  assert.equal(await scalar("select display_name_snapshot from public.vehicle_ongoing_items where record_id=$1 and maintenance_item_id=$2", [recordId, oilId]), "Synthetic Oil");
  assert.equal(await scalar("select group_snapshot from public.vehicle_ongoing_items where record_id=$1 and maintenance_item_id=$2", [recordId, oilId]), "routine");
  assert.equal(await scalar("select is_performed from public.vehicle_ongoing_items where record_id=$1 and maintenance_item_id=$2", [recordId, oilId]), false);

  await save(request(assetId, {
    expected_asset_version: 6,
    maintenance_item_operations: [{
      action: "update", id: oilId, expected_version: 2, archived: true,
    }],
  }));
  await save(request(assetId, {
    expected_asset_version: 7,
    ongoing_operations: [{
      action: "update", id: recordId, expected_version: 2,
      items: [
        { maintenance_item_id: oilId, is_performed: true },
        { maintenance_item_id: filterId, is_performed: false },
      ],
    }],
  }));
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_items where record_id=$1", [recordId]), 2);
  assert.equal(await scalar("select is_performed from public.vehicle_ongoing_items where record_id=$1 and maintenance_item_id=$2", [recordId, oilId]), true);
});

test("ongoing update rejects a changed captured set and snapshot label rewrites", async () => {
  const assetId = await asset();
  const itemId = await catalogItem(ownerA, "Synthetic fixed label");
  const recordId = uuid();
  await db.query(`insert into public.vehicle_ongoing_records(id,owner_id,asset_id,service_date,usage_reading_unit)
    values($1,$2,$3,'2026-05-01','none')`, [recordId, ownerA, assetId]);
  await db.query(`insert into public.vehicle_ongoing_items(owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values($1,$2,$3,true,'Historical label','routine')`, [ownerA, recordId, itemId]);
  await expectCode(request(assetId, {
    ongoing_operations: [{
      action: "update", id: recordId, expected_version: 1,
      items: [{ maintenance_item_id: itemId, is_performed: false, display_name_snapshot: "Rewrite" }],
    }],
  }), "validation_error");
  assert.equal(await scalar("select display_name_snapshot from public.vehicle_ongoing_items where record_id=$1", [recordId]), "Historical label");
});

test("availability transitions validate final state and unresolved intervals atomically", async () => {
  const assetId = await asset();
  const secondAsset = await asset();
  const itemId = uuid();
  const created = await save(request(assetId, {
    maintenance_item_operations: [{
      action: "create", id: itemId, display_name: "Synthetic Selected",
      item_group: "routine", availability_mode: "selected_assets",
      selected_asset_ids: [secondAsset],
    }],
    availability_operations: [{
      maintenance_item_id: itemId,
      expected_version: 1,
      add_asset_ids: [assetId],
    }],
  }));
  assert.equal(created.entity_versions.maintenance_items[itemId], 1);
  await expectCode(request(assetId, {
    expected_asset_version: 2,
    availability_operations: [{
      maintenance_item_id: itemId,
      expected_version: 1,
      add_asset_ids: [assetId.toUpperCase()],
      remove_asset_ids: [assetId],
    }],
  }), "validation_error");
  await expectCode(request(assetId, {
    expected_asset_version: 2,
    availability_operations: [{
      maintenance_item_id: itemId, expected_version: 1, add_asset_ids: [],
    }],
  }), "validation_error");
  const intervalId = uuid();
  await save(request(assetId, {
    expected_asset_version: 2,
    interval_operations: [{
      action: "create", id: intervalId, maintenance_item_id: itemId,
      interval_value: 100.5, interval_unit: "miles",
    }],
  }));

  await expectCode(request(assetId, {
    expected_asset_version: 3,
    availability_operations: [{
      maintenance_item_id: itemId, expected_version: 1, remove_asset_ids: [assetId],
    }],
  }), "item_archived_or_unavailable");
  assert.equal(await scalar("select version from public.maintenance_items where id=$1", [itemId]), 1);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1 and asset_id=$2", [itemId, assetId]), 1);

  const removed = await save(request(assetId, {
    expected_asset_version: 3,
    availability_operations: [{
      maintenance_item_id: itemId, expected_version: 1, remove_asset_ids: [assetId],
    }],
    interval_operations: [{ action: "delete", id: intervalId, expected_version: 1 }],
  }));
  assert.equal(removed.asset_version, 4);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where id=$1", [intervalId]), 0);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1", [itemId]), 1);

  const changedToAll = await save(request(assetId, {
    expected_asset_version: 4,
    maintenance_item_operations: [{
      action: "update", id: itemId, expected_version: 2, availability_mode: "all_assets",
    }],
  }));
  assert.equal(changedToAll.asset_version, 5);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1", [itemId]), 0);

  const changedBack = await save(request(assetId, {
    expected_asset_version: 5,
    maintenance_item_operations: [{
      action: "update", id: itemId, expected_version: 3, availability_mode: "selected_assets",
    }],
    availability_operations: [{
      maintenance_item_id: itemId, expected_version: 3, add_asset_ids: [assetId],
    }],
  }));
  assert.equal(changedBack.asset_version, 6);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1 and asset_id=$2", [itemId, assetId]), 1);
  assert.equal(await scalar("select version from public.maintenance_items where id=$1", [itemId]), 4);

  const changedToCurrent = await save(request(assetId, {
    expected_asset_version: 6,
    maintenance_item_operations: [{
      action: "update", id: itemId, expected_version: 4,
      availability_mode: "current_asset_only", current_asset_id: assetId,
    }],
  }));
  assert.equal(changedToCurrent.asset_version, 7);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1", [itemId]), 0);
});

test("archive is catalog-wide, requires interval resolution, and preserves history snapshots", async () => {
  const assetId = await asset();
  const otherAsset = await asset();
  const itemId = await catalogItem(ownerA, "Synthetic Archive Item");
  const recordId = uuid();
  await db.query(`insert into public.vehicle_ongoing_records(id,owner_id,asset_id,service_date,usage_reading_unit)
    values($1,$2,$3,'2026-06-01','none')`, [recordId, ownerA, otherAsset]);
  await db.query(`insert into public.vehicle_ongoing_items(owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values($1,$2,$3,true,'Archive snapshot','routine')`, [ownerA, recordId, itemId]);
  const intervalId = uuid();
  await db.query(`insert into public.vehicle_maintenance_intervals(id,owner_id,asset_id,maintenance_item_id,interval_value,interval_unit)
    values($1,$2,$3,$4,100,'miles')`, [intervalId, ownerA, otherAsset, itemId]);

  await expectCode(request(assetId, {
    maintenance_item_operations: [{ action: "update", id: itemId, expected_version: 1, archived: true }],
  }), "item_archived_or_unavailable");
  assert.equal(await scalar("select archived_at is null from public.maintenance_items where id=$1", [itemId]), true);

  await expectCode(request(assetId, {
    interval_operations: [{
      action: "delete", asset_id: otherAsset, expected_asset_version: 1,
      id: intervalId, expected_version: 1,
    }],
  }), "validation_error");
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where id=$1", [intervalId]), 1);

  await expectCode(request(assetId, {
    maintenance_item_operations: [{ action: "update", id: itemId, expected_version: 1, archived: true }],
    interval_operations: [{
      action: "delete", asset_id: otherAsset, expected_asset_version: 2,
      id: intervalId, expected_version: 1,
    }],
  }), "version_conflict");
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where id=$1", [intervalId]), 1);
  assert.equal(await scalar("select archived_at is null from public.maintenance_items where id=$1", [itemId]), true);

  const archived = await save(request(assetId, {
    maintenance_item_operations: [{ action: "update", id: itemId, expected_version: 1, archived: true }],
    interval_operations: [{
      action: "delete", asset_id: otherAsset, expected_asset_version: 1,
      id: intervalId, expected_version: 1,
    }],
  }));
  assert.equal(archived.asset_version, 2);
  assert.equal(archived.affected_asset_versions[otherAsset], 2);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where id=$1", [intervalId]), 0);
  assert.equal(await scalar("select display_name_snapshot from public.vehicle_ongoing_items where record_id=$1", [recordId]), "Archive snapshot");
  assert.equal(await scalar("select archived_at is not null from public.maintenance_items where id=$1", [itemId]), true);

  const unusedItem = await catalogItem(ownerA, "Synthetic Item Without Intervals");
  const archivedUnused = await save(request(assetId, {
    expected_asset_version: 2,
    maintenance_item_operations: [{ action: "update", id: unusedItem, expected_version: 1, archived: true }],
  }));
  assert.equal(archivedUnused.asset_version, 3);
  assert.equal(await scalar("select count(*) from public.maintenance_items where id=$1", [unusedItem]), 1);
  assert.equal(await scalar("select archived_at is not null from public.maintenance_items where id=$1", [unusedItem]), true);
});

test("independent history collections support date snapshots, mechanics, versioned updates and deletes", async () => {
  const assetId = await asset(ownerA, "Synthetic Hours Asset", "hours");
  const ongoingId = uuid();
  const recommendedId = uuid();
  const completedId = uuid();
  await expectCode(request(assetId, {
    ongoing_operations: [{
      action: "create", id: uuid(), service_date: "2026-02-31",
      usage_reading_unit: "none", items: [],
    }],
  }), "validation_error");
  const first = await save(request(assetId, {
    ongoing_operations: [{
      action: "create", id: ongoingId, service_date: "2026-07-01",
      usage_reading_unit: "hours", usage_reading_value: 220, mechanic: null, items: [],
    }],
    recommended_operations: [{
      action: "create", id: recommendedId, service_date: "2026-07-01",
      usage_reading_unit: "none", mechanic: null, description: "Synthetic recommended",
    }],
    completed_operations: [{
      action: "create", id: completedId, service_date: "2026-07-01",
      usage_reading_unit: "miles", usage_reading_value: 0, service_description: "Synthetic completed",
    }],
  }));
  assert.equal(first.asset_version, 2);
  assert.equal(await scalar("select usage_reading_value from public.vehicle_ongoing_records where id=$1", [ongoingId]), "220.00");
  assert.equal(await scalar("select usage_reading_unit from public.vehicle_completed_records where id=$1", [completedId]), "miles");

  await expectCode(request(assetId, {
    expected_asset_version: 2,
    ongoing_operations: [{
      action: "create", id: uuid(), service_date: "2026-07-01",
      usage_reading_unit: "none", items: [],
    }],
  }), "duplicate_service_date");
  const updated = await save(request(assetId, {
    expected_asset_version: 2,
    asset_patch: { usage_unit: "miles" },
    recommended_operations: [{
      action: "update", id: recommendedId, expected_version: 1,
      description: "Updated synthetic recommendation",
    }],
  }));
  assert.equal(updated.asset_version, 3);
  assert.equal(updated.entity_versions.recommended[recommendedId], 2);
  assert.equal(await scalar("select usage_reading_unit from public.vehicle_ongoing_records where id=$1", [ongoingId]), "hours");
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    completed_operations: [{ action: "delete", id: completedId, expected_version: 9 }],
  }), "version_conflict");
  await save(request(assetId, {
    expected_asset_version: 3,
    ongoing_operations: [{ action: "delete", id: ongoingId, expected_version: 1 }],
    recommended_operations: [{ action: "delete", id: recommendedId, expected_version: 2 }],
    completed_operations: [{ action: "delete", id: completedId, expected_version: 1 }],
  }));
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_records where id=$1", [ongoingId]), 0);
  assert.equal(await scalar("select count(*) from public.vehicle_recommended_records where id=$1", [recommendedId]), 0);
  assert.equal(await scalar("select count(*) from public.vehicle_completed_records where id=$1", [completedId]), 0);
});

test("interval validation and versioning cover decimal usage, whole months, uniqueness and availability", async () => {
  const assetId = await asset();
  const itemId = await catalogItem();
  const created = await save(request(assetId, {
    interval_operations: [{
      action: "create", id: uuid(), maintenance_item_id: itemId,
      interval_value: 12.5, interval_unit: "hours", comments: "Synthetic interval",
    }],
  }));
  const intervalId = created.created_ids.intervals[0];
  assert.equal(created.entity_versions.intervals[intervalId], 1);
  await expectCode(request(assetId, {
    expected_asset_version: 2,
    interval_operations: [{
      action: "create", id: uuid(), maintenance_item_id: itemId,
      interval_value: 10, interval_unit: "miles", comments: "x".repeat(2001),
    }],
  }), "validation_error");
  await expectCode(request(assetId, {
    expected_asset_version: 2,
    interval_operations: [{
      action: "create", id: uuid(), maintenance_item_id: itemId,
      interval_value: 2.5, interval_unit: "months",
    }],
  }), "validation_error");
  const updated = await save(request(assetId, {
    expected_asset_version: 2,
    interval_operations: [{
      action: "update", id: intervalId, expected_version: 1,
      interval_value: 12, interval_unit: "months", comments: null,
    }],
  }));
  assert.equal(updated.entity_versions.intervals[intervalId], 2);
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    interval_operations: [{
      action: "update", id: intervalId, expected_version: 1,
      interval_value: 10, interval_unit: "miles",
    }],
  }), "version_conflict");
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    interval_operations: [{
      action: "create", id: uuid(), maintenance_item_id: itemId,
      interval_value: 10, interval_unit: "miles",
    }],
  }), "duplicate_interval");
  await save(request(assetId, {
    expected_asset_version: 3,
    maintenance_item_operations: [{
      action: "update", id: itemId, expected_version: 1, archived: true,
    }],
    interval_operations: [{ action: "delete", id: intervalId, expected_version: 2 }],
  }));
  await expectCode(request(assetId, {
    expected_asset_version: 4,
    interval_operations: [{
      action: "create", id: uuid(), maintenance_item_id: itemId,
      interval_value: 10, interval_unit: "miles",
    }],
  }), "item_archived_or_unavailable");
});

test("same-asset interval batches create atomically and replay without duplicates", async () => {
  const assetId = await asset();
  const itemIds = [
    await catalogItem(ownerA, "Synthetic batch miles"),
    await catalogItem(ownerA, "Synthetic batch months"),
    await catalogItem(ownerA, "Synthetic batch hours"),
  ];
  const intervalIds = [uuid(), uuid(), uuid()];
  assert.equal(new Set(intervalIds).size, 3);
  const requestId = uuid();
  const operations = [
    {
      action: "create", id: intervalIds[0], maintenance_item_id: itemIds[0],
      interval_value: 10000, interval_unit: "miles", comments: null,
    },
    {
      action: "create", id: intervalIds[1], maintenance_item_id: itemIds[1],
      interval_value: 12, interval_unit: "months", comments: "annual cadence",
    },
    {
      action: "create", id: intervalIds[2], maintenance_item_id: itemIds[2],
      interval_value: 25.5, interval_unit: "hours", comments: "engine-hour interval",
    },
  ];
  const payload = request(assetId, { request_id: requestId, interval_operations: operations });
  const created = await save(payload);

  assert.equal(created.replayed, false);
  assert.equal(created.asset_version, 2);
  assert.deepEqual(created.affected_asset_versions, { [assetId]: 2 });
  assert.deepEqual(created.created_ids.intervals, intervalIds);
  assert.deepEqual(created.entity_versions.intervals, Object.fromEntries(intervalIds.map((id) => [id, 1])));
  const persisted = await rows(`select id,asset_id,maintenance_item_id,interval_value::text as interval_value,
    interval_unit,comments from public.vehicle_maintenance_intervals where asset_id=$1
    order by public.vehicle_maintenance_intervals.interval_value`, [assetId]);
  assert.deepEqual(persisted, [
    {
      id: intervalIds[1], asset_id: assetId, maintenance_item_id: itemIds[1],
      interval_value: "12.00", interval_unit: "months", comments: "annual cadence",
    },
    {
      id: intervalIds[2], asset_id: assetId, maintenance_item_id: itemIds[2],
      interval_value: "25.50", interval_unit: "hours", comments: "engine-hour interval",
    },
    {
      id: intervalIds[0], asset_id: assetId, maintenance_item_id: itemIds[0],
      interval_value: "10000.00", interval_unit: "miles", comments: null,
    },
  ]);

  const replay = await save(payload);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.created_ids.intervals, intervalIds);
  assert.deepEqual(replay.entity_versions.intervals, Object.fromEntries(intervalIds.map((id) => [id, 1])));
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where asset_id=$1", [assetId]), 3);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
  assert.equal(await scalar("select count(*) from public.vehicles_save_requests where request_id=$1", [requestId]), 1);

  const rollbackItemId = await catalogItem(ownerA, "Synthetic batch rollback");
  const rollbackIntervalId = uuid();
  const failedRequestId = uuid();
  await expectCode(request(assetId, {
    request_id: failedRequestId,
    expected_asset_version: 2,
    interval_operations: [
      {
        action: "create", id: rollbackIntervalId, maintenance_item_id: rollbackItemId,
        interval_value: 50, interval_unit: "hours", comments: "must roll back",
      },
      {
        action: "create", id: uuid(), maintenance_item_id: itemIds[0],
        interval_value: 1, interval_unit: "months", comments: "duplicate pair",
      },
    ],
  }), "duplicate_interval");
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where asset_id=$1", [assetId]), 3);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_intervals where id=$1", [rollbackIntervalId]), 0);
  assert.equal(await scalar("select version from public.vehicles_assets where id=$1", [assetId]), 2);
  assert.equal(await scalar("select count(*) from public.vehicles_save_requests where request_id=$1", [failedRequestId]), 0);
});

test("Key Information validates supported structured text, size, clear and versions", async () => {
  const assetId = await asset();
  const keyId = uuid();
  const document = {
    schemaVersion: 1,
    blocks: [
      { type: "paragraph", runs: [{ text: "Synthetic ", bold: false }, { text: "manual", bold: true }] },
      { type: "bullet_list", items: [[{ text: "Synthetic bullet" }]] },
    ],
  };
  const created = await save(request(assetId, {
    key_information_operation: { action: "create", id: keyId, document },
  }));
  assert.equal(created.entity_versions.key_information[keyId], 1);
  for (const invalid of [
    { schemaVersion: 2, blocks: [] },
    { schemaVersion: 1, blocks: [{ type: "heading", runs: [] }] },
    { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ html: "<b>bad</b>" }] }] },
    { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "<script>alert(1)</script>" }] }] },
    { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "x".repeat(50001) }] }] },
  ]) {
    await expectCode(request(assetId, {
      expected_asset_version: 2,
      key_information_operation: { action: "update", id: keyId, expected_version: 1, document: invalid },
    }), "validation_error");
  }
  const updated = await save(request(assetId, {
    expected_asset_version: 2,
    key_information_operation: {
      action: "update", id: keyId, expected_version: 1,
      document: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Updated" }] }] },
    },
  }));
  assert.equal(updated.entity_versions.key_information[keyId], 2);
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    key_information_operation: { action: "delete", id: keyId, expected_version: 1 },
  }), "version_conflict");
  await save(request(assetId, {
    expected_asset_version: 3,
    key_information_operation: {
      action: "update", id: keyId, expected_version: 2,
      document: { schemaVersion: 1, blocks: [] },
    },
  }));
  assert.equal(await scalar("select count(*) from public.vehicle_key_information where asset_id=$1", [assetId]), 0);
});

test("links require safe HTTPS and support versioned update/delete", async () => {
  const assetId = await asset();
  const linkId = uuid();
  const created = await save(request(assetId, {
    link_operations: [{
      action: "create", id: linkId, url: "https://example.test/path", display_title: null, sort_order: 0,
    }],
  }));
  assert.equal(created.entity_versions.links[linkId], 1);
  for (const url of [
    "http://example.test", "/relative/path", "javascript:alert(1)", "data:text/html,hi",
    "file:///tmp/x", "https://user:pass@example.test", "https://example.test/\u0001",
    `https://example.test/${"x".repeat(2048)}`,
  ]) {
    await expectCode(request(assetId, {
      expected_asset_version: 2,
      link_operations: [{ action: "update", id: linkId, expected_version: 1, url }],
    }), "validation_error");
  }
  await expectCode(request(assetId, {
    expected_asset_version: 2,
    link_operations: [{
      action: "update", id: linkId, expected_version: 1,
      url: "https://user@example.test",
    }],
  }), "validation_error");
  for (const patch of [
    { display_title: "x".repeat(301) },
    { sort_order: -1 },
    { sort_order: 1.5 },
  ]) {
    await expectCode(request(assetId, {
      expected_asset_version: 2,
      link_operations: [{ action: "update", id: linkId, expected_version: 1, ...patch }],
    }), "validation_error");
  }
  const updated = await save(request(assetId, {
    expected_asset_version: 2,
    link_operations: [{ action: "update", id: linkId, expected_version: 1, display_title: "Synthetic manual", sort_order: 1 }],
  }));
  assert.equal(updated.entity_versions.links[linkId], 2);
  await expectCode(request(assetId, {
    expected_asset_version: 3,
    link_operations: [{ action: "delete", id: linkId, expected_version: 1 }],
  }), "version_conflict");
  await save(request(assetId, {
    expected_asset_version: 3,
    link_operations: [{ action: "delete", id: linkId, expected_version: 2 }],
  }));
  assert.equal(await scalar("select count(*) from public.vehicle_links where id=$1", [linkId]), 0);
});

test("asset deletion is intentionally absent from this asset-scoped RPC", async () => {
  assert.doesNotMatch(phase4b, /asset_operations|delete\s+from\s+public\.vehicles_assets/i);
  const assetId = await asset();
  const result = await save(request(assetId));
  assert.equal(result.ok, true);
  assert.equal(await scalar("select count(*) from public.vehicles_assets where id=$1", [assetId]), 1);
});

test("catalog RPC is owner-authenticated, receipt-backed, and does not grant direct table writes", async () => {
  assert.equal(await scalar(`select prosecdef from pg_catalog.pg_proc
    where oid='public.save_maintenance_item(jsonb)'::regprocedure`), true);
  assert.equal(await scalar(`select pg_catalog.pg_get_function_identity_arguments(
    'public.save_maintenance_item(jsonb)'::regprocedure)`), "p_request jsonb");
  assert.equal(await scalar(`select has_function_privilege('authenticated','public.save_maintenance_item(jsonb)','EXECUTE')`), true);
  assert.equal(await scalar(`select has_function_privilege('anon','public.save_maintenance_item(jsonb)','EXECUTE')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.maintenance_items','INSERT')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.maintenance_items','UPDATE')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.vehicle_maintenance_item_assets','DELETE')`), false);

  const unauthenticated = {
    request_id: uuid(), operation: "create", item_id: uuid(), display_name: "Synthetic unauthenticated",
    item_group: "routine", availability_mode: "all_assets", current_asset_id: null, selected_asset_ids: [],
  };
  await expectCatalogCode(unauthenticated, "authorization_error", null);

  const payload = {
    request_id: uuid(), operation: "create", item_id: uuid(), display_name: "Synthetic owner item",
    item_group: "routine", availability_mode: "all_assets", current_asset_id: null, selected_asset_ids: [],
  };
  const created = await saveMaintenanceItemWithParams(payload);
  assert.equal(created.ok, true);
  assert.equal(created.item_id, payload.item_id);
  assert.equal(created.item.version, 1);
  assert.equal(created.item.availability_mode, "all_assets");
  assert.equal(created.item.selected_asset_ids.length, 0);
  assert.equal(created.replayed, false);
  const replay = await saveMaintenanceItemWithParams(payload);
  assert.equal(replay.replayed, true);
  await expectCatalogCode({ ...payload, display_name: "Different payload" }, "request_id_payload_mismatch");
  await expectCatalogCode({ ...payload, request_id: uuid(), item_id: uuid(), owner_id: ownerB }, "validation_error");
  await expectCatalogCode({ ...payload, request_id: uuid() }, "item_id_conflict");
  await expectCatalogCode({
    request_id: uuid(), operation: "update", item_id: payload.item_id, expected_version: 1,
    display_name: payload.display_name, item_group: payload.item_group,
    availability_mode: payload.availability_mode, current_asset_id: null, selected_asset_ids: [],
  }, "not_found", ownerB);
  assert.equal(await scalar("select count(*) from public.maintenance_items where id=$1", [payload.item_id]), 1);
  assert.equal(await scalar("select count(*) from public.vehicles_save_requests where request_id=$1", [payload.request_id]), 1);
});

test("catalog create and complete selected-set replacement are atomic and owner-scoped", async () => {
  const firstAsset = await asset(ownerA, "Synthetic catalog first");
  const secondAsset = await asset(ownerA, "Synthetic catalog second");
  const thirdAsset = await asset(ownerA, "Synthetic catalog third");
  const foreignAsset = await asset(ownerB, "Synthetic foreign catalog asset");
  const payload = {
    request_id: uuid(), operation: "create", item_id: uuid(), display_name: "Synthetic selected catalog item",
    item_group: "components_other", availability_mode: "selected_assets", current_asset_id: null,
    selected_asset_ids: [secondAsset, firstAsset],
  };
  const created = await saveMaintenanceItemWithParams(payload);
  assert.equal(created.item.availability_mode, "selected_assets");
  assert.deepEqual(created.item.selected_asset_ids, [firstAsset, secondAsset].sort());
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1", [payload.item_id]), 2);

  await expectCatalogCode({
    ...payload, request_id: uuid(), item_id: uuid(), display_name: "Synthetic duplicated IDs",
    selected_asset_ids: [firstAsset, firstAsset],
  }, "validation_error");
  await expectCatalogCode({
    ...payload, request_id: uuid(), item_id: uuid(), display_name: "Synthetic foreign association",
    selected_asset_ids: [firstAsset, foreignAsset],
  }, "not_found");
  const missingAsset = uuid();
  await expectCatalogCode({
    ...payload, request_id: uuid(), item_id: uuid(), display_name: "Synthetic missing association",
    selected_asset_ids: [firstAsset, missingAsset],
  }, "not_found");
  assert.equal(await scalar("select count(*) from public.maintenance_items where display_name like 'Synthetic foreign association%' or display_name like 'Synthetic missing association%'"), 0);
  assert.equal(await scalar("select count(*) from public.vehicle_maintenance_item_assets where maintenance_item_id=$1", [payload.item_id]), 2);

  const updated = await saveMaintenanceItemWithParams({
    request_id: uuid(), operation: "update", item_id: payload.item_id, expected_version: 1,
    display_name: "Synthetic selected catalog renamed", item_group: "routine",
    availability_mode: "selected_assets", current_asset_id: null, selected_asset_ids: [thirdAsset, firstAsset],
  });
  assert.equal(updated.item.version, 2);
  assert.deepEqual(updated.item.selected_asset_ids, [firstAsset, thirdAsset].sort());
  await expectCatalogCode({
    request_id: uuid(), operation: "update", item_id: payload.item_id, expected_version: 1,
    display_name: "Synthetic stale edit", item_group: "routine",
    availability_mode: "selected_assets", current_asset_id: null, selected_asset_ids: [secondAsset],
  }, "version_conflict");
  assert.equal(await scalar("select version from public.maintenance_items where id=$1", [payload.item_id]), 2);
  assert.deepEqual(await rows("select asset_id from public.vehicle_maintenance_item_assets where maintenance_item_id=$1 order by asset_id", [payload.item_id]),
    [{ asset_id: firstAsset }, { asset_id: thirdAsset }].sort((a, b) => a.asset_id.localeCompare(b.asset_id)));
});

test("catalog updates preserve historical snapshots and interval references block unavailable or archived items", async () => {
  const firstAsset = await asset(ownerA, "Synthetic interval first");
  const secondAsset = await asset(ownerA, "Synthetic interval second");
  const itemId = uuid();
  await saveMaintenanceItemWithParams({
    request_id: uuid(), operation: "create", item_id: itemId, display_name: "Synthetic interval item",
    item_group: "routine", availability_mode: "selected_assets", current_asset_id: null,
    selected_asset_ids: [firstAsset, secondAsset],
  });
  const recordId = await scalar(`insert into public.vehicle_ongoing_records
    (owner_id,asset_id,service_date,usage_reading_unit)
    values($1,$2,'2026-11-01','none') returning id`, [ownerA, firstAsset]);
  await db.query(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values($1,$2,$3,true,'Captured original name','components_other')`, [ownerA, recordId, itemId]);
  await db.query(`insert into public.vehicle_maintenance_intervals
    (owner_id,asset_id,maintenance_item_id,interval_unit,interval_value)
    values($1,$2,$3,'miles',100)`, [ownerA, firstAsset, itemId]);

  const replacement = {
    request_id: uuid(), operation: "update", item_id: itemId, expected_version: 1,
    display_name: "Synthetic edited interval item", item_group: "fluids_drivetrain",
    availability_mode: "selected_assets", current_asset_id: null, selected_asset_ids: [secondAsset],
  };
  await expectCatalogCode(replacement, "item_archived_or_unavailable");
  await expectCatalogCode({
    request_id: uuid(), operation: "archive", item_id: itemId, expected_version: 1,
  }, "item_archived_or_unavailable");
  assert.equal(await scalar("select display_name from public.maintenance_items where id=$1", [itemId]), "Synthetic interval item");
  assert.equal(await scalar("select version from public.maintenance_items where id=$1", [itemId]), 1);
  assert.deepEqual(await rows("select asset_id from public.vehicle_maintenance_item_assets where maintenance_item_id=$1 order by asset_id", [itemId]),
    [{ asset_id: firstAsset }, { asset_id: secondAsset }].sort((a, b) => a.asset_id.localeCompare(b.asset_id)));

  const validUpdate = await saveMaintenanceItemWithParams({
    ...replacement,
    request_id: uuid(),
    display_name: "Synthetic interval renamed",
    selected_asset_ids: [firstAsset, secondAsset],
  });
  assert.equal(validUpdate.item.version, 2);
  assert.deepEqual(await rows(`select display_name_snapshot,group_snapshot from public.vehicle_ongoing_items
    where maintenance_item_id=$1`, [itemId]), [{
    display_name_snapshot: "Captured original name", group_snapshot: "components_other",
  }]);

  await db.query("delete from public.vehicle_maintenance_intervals where maintenance_item_id=$1", [itemId]);
  const archived = await saveMaintenanceItemWithParams({
    request_id: uuid(), operation: "archive", item_id: itemId, expected_version: 2,
  });
  assert.equal(archived.item.version, 3);
  assert(archived.item.archived_at);
  assert.deepEqual(archived.item.selected_asset_ids, [firstAsset, secondAsset].sort());
  assert.equal(await scalar("select count(*) from public.vehicle_ongoing_items where maintenance_item_id=$1", [itemId]), 1);
});

test("migration changes only the new RPC boundary and contains no credentials or production identity", async () => {
  assert.doesNotMatch(phase4b, /projects_vehicle|projects_all|workbench/i);
  assert.doesNotMatch(phase4b, /e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60|service[_ -]?role[_ -]?key|bearer\s+[a-z0-9._-]{16,}|postgres(?:ql)?:\/\/\S+|password\s*=/i);
  assert.doesNotMatch(phase4b, /insert\s+into\s+public\.(vehicles_assets|maintenance_items|vehicle_ongoing_records|vehicle_recommended_records|vehicle_completed_records)\s*values/i);
  assert.match(phase4b, /SECURITY DEFINER/i);
  assert.match(phase4b, /auth\.uid\(\)/i);
  assert.match(phase4b, /pg_advisory_xact_lock/i);
  assert.match(phase5bp, /CREATE FUNCTION public\.create_vehicle_asset\(p_request jsonb\)/i);
  assert.match(phase5bp, /SECURITY DEFINER[\s\S]*SET search_path = ''[\s\S]*auth\.uid\(\)/i);
  assert.match(phase5bp, /GRANT EXECUTE ON FUNCTION public\.create_vehicle_asset\(jsonb\) TO authenticated/i);
  assert.doesNotMatch(phase5bp, /GRANT\s+(?:SELECT\s*,\s*)?INSERT[\s\S]*vehicles_assets/i);
  assert.doesNotMatch(phase5bp, /projects_vehicle|projects_all|workbench/i);
  assert.doesNotMatch(phase5bp, /e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60|service[_ -]?role[_ -]?key|bearer\s+[a-z0-9._-]{16,}|postgres(?:ql)?:\/\/\S+|password\s*=/i);
  assert.match(phase5cp, /CREATE FUNCTION public\.save_maintenance_item\(p_request jsonb\)/i);
  assert.match(phase5cp, /SECURITY DEFINER[\s\S]*SET search_path = ''[\s\S]*auth\.uid\(\)/i);
  assert.match(phase5cp, /GRANT EXECUTE ON FUNCTION public\.save_maintenance_item\(jsonb\) TO authenticated/i);
  assert.match(phase5cp, /ORDER BY a\.id[\s\S]*FOR UPDATE/i);
  assert.doesNotMatch(phase5cp, /GRANT\s+(?:SELECT\s*,\s*)?INSERT[\s\S]*maintenance_items/i);
  assert.doesNotMatch(phase5cp, /projects_vehicle|projects_all|workbench/i);
  assert.doesNotMatch(phase5cp, /e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60|service[_ -]?role[_ -]?key|bearer\s+[a-z0-9._-]{16,}|postgres(?:ql)?:\/\/\S+|password\s*=/i);
  assert.equal(await scalar("select count(*) from public.vehicles_save_requests"), 0);
});
