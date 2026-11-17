const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const ownerA = randomUUID();
const ownerB = randomUUID();
let db;
const migrationNames = [
  "202611110001_vehicles_domain.sql", "202611110002_vehicles_save_changes_rpc.sql",
  "202611130001_vehicles_asset_creation_rpc.sql", "202611130002_vehicles_maintenance_item_catalog_rpc.sql",
  "202611170001_vehicles_asset_deletion_rpc.sql",
];
async function rows(sql, params = []) { return (await db.query(sql, params)).rows; }
async function value(sql, params = []) { return Object.values((await rows(sql, params))[0])[0]; }
async function asset(owner = ownerA) {
  return value("insert into public.vehicles_assets(owner_id,name,usage_unit) values($1,'Synthetic delete asset','miles') returning id", [owner]);
}
async function item(mode, target = null, archived = false) {
  return value(`insert into public.maintenance_items(owner_id,display_name,item_group,availability_mode,current_asset_id,archived_at)
    values($1,$2,'routine',$3,$4,$5) returning id`,
  [ownerA, randomUUID(), mode, target, archived ? "2026-01-01" : null]);
}
async function association(itemId, assetId) {
  await db.query("insert into public.vehicle_maintenance_item_assets(owner_id,maintenance_item_id,asset_id) values($1,$2,$3)",
    [ownerA, itemId, assetId]);
}
const request = (id, overrides = {}) => ({
  request_id: randomUUID(), asset_id: id, expected_version: 1,
  confirmation_name: "Synthetic delete asset", ...overrides,
});
async function remove(payload, owner = ownerA, role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner || ""]);
  await db.exec(`set role ${role}`);
  try {
    return await value("select public.delete_vehicle_asset($1::jsonb)", [JSON.stringify(payload)]);
  } finally {
    await db.exec("reset role");
  }
}
async function expectCode(payload, code, owner = ownerA) {
  await assert.rejects(remove(payload, owner), (error) => {
    assert.equal(JSON.parse(error.detail).code, code);
    return true;
  });
}
async function catalogSnapshot() {
  return rows("select * from public.maintenance_items order by id");
}

test.before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values('${ownerA}'),('${ownerB}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const name of migrationNames) {
    await db.exec(fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", name), "utf8"));
  }
});
test.after(async () => { await db?.close(); });
test.beforeEach(async () => {
  await db.exec(`truncate public.vehicles_save_requests, public.maintenance_items, public.vehicles_assets cascade`);
});

test("Delete Asset RPC is controlled, owner-authenticated, and does not grant direct DML", async () => {
  assert.equal(await value(`select prosecdef from pg_proc where oid='public.delete_vehicle_asset(jsonb)'::regprocedure`), true);
  assert.equal(await value(`select array_to_string(proconfig,',') from pg_proc
    where oid='public.delete_vehicle_asset(jsonb)'::regprocedure`), 'search_path=""');
  for (const role of ["anon", "service_role"]) {
    assert.equal(await value(`select has_function_privilege($1,'public.delete_vehicle_asset(jsonb)','EXECUTE')`, [role]), false);
  }
  assert.equal(await value(`select has_function_privilege('authenticated','public.delete_vehicle_asset(jsonb)','EXECUTE')`), true);
  assert.equal(await value(`select has_table_privilege('authenticated','public.vehicles_assets','DELETE')`), false);
  const id = await asset();
  await expectCode(request(id), "authorization_error", null);
  await expectCode(request(id), "not_found", ownerB);
  await assert.rejects(remove(request(id), ownerA, "anon"), /permission denied/);
  assert.equal(await value("select count(*) from public.vehicles_assets"), 1);
});

test("Current Asset Only, including archived catalog items, blocks deletion without mutation", async () => {
  const id = await asset();
  await item("current_asset_only", id);
  await item("current_asset_only", id, true);
  const before = await catalogSnapshot();
  const payload = request(id);
  await assert.rejects(remove(payload), (error) => {
    const detail = JSON.parse(error.detail);
    assert.equal(detail.code, "asset_in_use");
    assert.equal(detail.context.items.length, 2);
    assert(detail.context.items.every((entry) => entry.reason === "current_asset_only"));
    return true;
  });
  assert.deepEqual(await catalogSnapshot(), before);
  assert.equal(await value("select count(*) from public.vehicles_assets"), 1);
  assert.equal(await value("select count(*) from public.vehicles_save_requests"), 0);
});

test("mixed dependencies return the complete blocking set only, preserving every catalog row and association", async () => {
  const id = await asset(), other = await asset();
  const current = await item("current_asset_only", id);
  const archivedCurrent = await item("current_asset_only", id, true);
  const last = await item("selected_assets"), secondLast = await item("selected_assets");
  const shared = await item("selected_assets"), archivedSelected = await item("selected_assets", null, true);
  await item("all_assets");
  for (const itemId of [last, secondLast, shared, archivedSelected]) await association(itemId, id);
  await association(shared, other);
  const before = await catalogSnapshot();
  const associationsBefore = await rows("select * from public.vehicle_maintenance_item_assets order by maintenance_item_id,asset_id");
  await assert.rejects(remove(request(id)), (error) => {
    const detail = JSON.parse(error.detail);
    assert.equal(detail.code, "asset_in_use");
    const actual = detail.context.items.map((entry) => [entry.id, entry.reason, entry.archived])
      .sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(actual, [
      [current, "current_asset_only", false], [archivedCurrent, "current_asset_only", true],
      [last, "last_selected_asset", false], [secondLast, "last_selected_asset", false],
    ].sort((a, b) => a[0].localeCompare(b[0])));
    assert(detail.context.items.every((entry) => before.some((row) => row.id === entry.id && row.display_name === entry.display_name)));
    return true;
  });
  assert.deepEqual(await catalogSnapshot(), before);
  assert.deepEqual(await rows("select * from public.vehicle_maintenance_item_assets order by maintenance_item_id,asset_id"), associationsBefore);
  assert.equal(await value("select count(*) from public.vehicles_assets"), 2);
  assert.equal(await value("select count(*) from public.vehicles_save_requests"), 0);
});

test("last active Selected Asset blocks deletion; explicit additional applicability allows it", async () => {
  const id = await asset(), other = await asset();
  const selected = await item("selected_assets");
  await association(selected, id);
  const before = await catalogSnapshot();
  await expectCode(request(id), "asset_in_use");
  assert.deepEqual(await catalogSnapshot(), before);
  assert.equal(await value("select count(*) from public.vehicle_maintenance_item_assets"), 1);
  await association(selected, other);
  await remove(request(id));
  assert.deepEqual(await catalogSnapshot(), before);
  assert.deepEqual(await rows("select asset_id from public.vehicle_maintenance_item_assets"), [{ asset_id: other }]);
});

test("archived Selected Assets may lose their final association without catalog rewrites", async () => {
  const id = await asset();
  const selected = await item("selected_assets", null, true);
  await association(selected, id);
  const before = await catalogSnapshot();
  await remove(request(id));
  assert.deepEqual(await catalogSnapshot(), before);
  assert.equal(await value("select count(*) from public.vehicle_maintenance_item_assets"), 0);
});

test("successful deletion cascades only owned Vehicles data and preserves shared catalog/other owners/receipts", async () => {
  const id = await asset(), other = await asset(), foreign = await asset(ownerB);
  const shared = await item("all_assets");
  const catalogBefore = await catalogSnapshot();
  for (const [target, owner] of [[id, ownerA], [other, ownerA], [foreign, ownerB]]) {
    const ongoing = await value(`insert into public.vehicle_ongoing_records(owner_id,asset_id,service_date,usage_reading_unit)
      values($1,$2,'2026-01-01','none') returning id`, [owner, target]);
    if (owner === ownerA) {
      await db.query(`insert into public.vehicle_ongoing_items(owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
        values($1,$2,$3,true,'Saved snapshot','routine')`, [owner, ongoing, shared]);
      await db.query(`insert into public.vehicle_maintenance_intervals(owner_id,asset_id,maintenance_item_id,interval_value,interval_unit)
        values($1,$2,$3,12,'months')`, [owner, target, shared]);
    }
    await db.query(`insert into public.vehicle_recommended_records(owner_id,asset_id,service_date,usage_reading_unit,description)
      values($1,$2,'2026-01-01','none','Synthetic recommended')`, [owner, target]);
    await db.query(`insert into public.vehicle_completed_records(owner_id,asset_id,service_date,usage_reading_unit,service_description)
      values($1,$2,'2026-01-01','none','Synthetic completed')`, [owner, target]);
    await db.query("insert into public.vehicle_key_information(owner_id,asset_id) values($1,$2)", [owner, target]);
    await db.query("insert into public.vehicle_links(owner_id,asset_id,url) values($1,$2,'https://example.test/manual')", [owner, target]);
  }
  const payload = request(id);
  const result = await remove(payload);
  assert.deepEqual(result, { ok: true, request_id: payload.request_id, asset_id: id, deleted: true, replayed: false });
  for (const table of ["vehicle_ongoing_records", "vehicle_recommended_records", "vehicle_completed_records",
    "vehicle_key_information", "vehicle_links", "vehicle_maintenance_intervals"]) {
    assert.equal(await value(`select count(*) from public.${table} where asset_id=$1`, [id]), 0, table);
    assert.equal(await value(`select count(*) from public.${table} where asset_id=$1`, [other]), 1, table);
  }
  assert.equal(await value("select count(*) from public.vehicle_ongoing_items"), 1);
  assert.equal(await value("select count(*) from public.vehicles_assets where id=$1", [foreign]), 1);
  assert.deepEqual(await catalogSnapshot(), catalogBefore);
  assert.equal((await remove(payload)).replayed, true);
  await expectCode({ ...payload, confirmation_name: "different" }, "request_id_payload_mismatch");
  await expectCode(request(id), "not_found");
  assert.equal(await value("select count(*) from public.vehicles_save_requests"), 1);
});

test("wrong exact name, stale version, malformed input, and database failure roll back deletion", async () => {
  const id = await asset();
  for (const confirmation_name of ["Synthetic delete", "synthetic delete asset", "Synthetic delete asset "]) {
    await expectCode(request(id, { confirmation_name }), "version_conflict");
  }
  await expectCode(request(id, { expected_version: 2 }), "version_conflict");
  await expectCode(request(id, { expected_version: 0 }), "validation_error");
  await expectCode(request(id, { confirmation_name: null }), "validation_error");
  await expectCode(request(id, { injected: true }), "validation_error");
  await db.exec(`create function public.reject_test_delete() returns trigger language plpgsql as $$
    begin raise exception 'Synthetic database failure'; end $$;
    create trigger test_delete_failure before delete on public.vehicles_assets
    for each row execute function public.reject_test_delete();`);
  try {
    await assert.rejects(remove(request(id)), /Synthetic database failure/);
  } finally {
    await db.exec("drop trigger test_delete_failure on public.vehicles_assets; drop function public.reject_test_delete()");
  }
  assert.equal(await value("select count(*) from public.vehicles_assets"), 1);
  assert.equal(await value("select count(*) from public.vehicles_save_requests"), 0);
});
