const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "202611110001_vehicles_domain.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const owners = {
  first: "10000000-0000-4000-8000-000000000001",
  second: "10000000-0000-4000-8000-000000000002",
};
const tables = [
  "vehicles_assets",
  "maintenance_items",
  "vehicle_maintenance_item_assets",
  "vehicle_ongoing_records",
  "vehicle_ongoing_items",
  "vehicle_recommended_records",
  "vehicle_completed_records",
  "vehicle_maintenance_intervals",
  "vehicle_key_information",
  "vehicle_links",
  "vehicles_save_requests",
];
const readableTables = tables.filter((name) => name !== "vehicles_save_requests");
const quote = (input) => `'${String(input).replace(/'/g, "''")}'`;
let db;
let fixtureNumber = 0;

async function rows(sql) {
  return (await db.query(sql)).rows;
}

async function value(sql) {
  const result = await rows(sql);
  assert.equal(result.length, 1);
  return Object.values(result[0])[0];
}

async function insertId(sql) {
  return value(`${sql} returning id::text`);
}

function uniqueName(label) {
  fixtureNumber += 1;
  return `Synthetic ${label} ${fixtureNumber}`;
}

async function asset(owner = owners.first, name = uniqueName("asset"), unit = "miles") {
  return insertId(`insert into public.vehicles_assets(owner_id,name,usage_unit)
    values (${quote(owner)}::uuid,${quote(name)},${quote(unit)})`);
}

async function item({
  owner = owners.first,
  name = uniqueName("item"),
  group = "routine",
  mode = "all_assets",
  currentAsset = null,
  archived = false,
} = {}) {
  return insertId(`insert into public.maintenance_items
    (owner_id,display_name,item_group,availability_mode,current_asset_id,archived_at)
    values (${quote(owner)}::uuid,${quote(name)},${quote(group)},${quote(mode)},
      ${currentAsset ? `${quote(currentAsset)}::uuid` : "null"},
      ${archived ? "now()" : "null"})`);
}

async function ongoing(owner, assetId, date = "2026-01-01", unit = "miles", reading = 10, mechanic = null) {
  return insertId(`insert into public.vehicle_ongoing_records
    (owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,mechanic)
    values (${quote(owner)}::uuid,${quote(assetId)}::uuid,${quote(date)}::date,
      ${quote(unit)},${reading === null ? "null" : reading},${mechanic === null ? "null" : quote(mechanic)})`);
}

async function recommended(owner, assetId, date, description = "Synthetic recommended work", mechanic = null) {
  return insertId(`insert into public.vehicle_recommended_records
    (owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,mechanic,description)
    values (${quote(owner)}::uuid,${quote(assetId)}::uuid,${quote(date)}::date,
      'none',null,${mechanic === null ? "null" : quote(mechanic)},${quote(description)})`);
}

async function completed(owner, assetId, date, description = "Synthetic completed work", mechanic = null) {
  return insertId(`insert into public.vehicle_completed_records
    (owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,mechanic,service_description)
    values (${quote(owner)}::uuid,${quote(assetId)}::uuid,${quote(date)}::date,
      'none',null,${mechanic === null ? "null" : quote(mechanic)},${quote(description)})`);
}

async function interval(owner, assetId, itemId, unit = "miles", amount = 100) {
  return insertId(`insert into public.vehicle_maintenance_intervals
    (owner_id,asset_id,maintenance_item_id,interval_unit,interval_value)
    values (${quote(owner)}::uuid,${quote(assetId)}::uuid,${quote(itemId)}::uuid,
      ${quote(unit)},${amount})`);
}

async function asRole(role, owner, statement) {
  assert(["anon", "authenticated", "service_role"].includes(role));
  await db.exec(`set role ${role};
    select set_config('request.jwt.claim.sub',${quote(owner ?? "")},false)`);
  try {
    return await db.exec(statement);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  }
}

test.before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users(id) values
      (${quote(owners.first)}::uuid),(${quote(owners.second)}::uuid);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.projects_vehicle(id uuid primary key, service_description text);
    insert into public.projects_vehicle values
      ('20000000-0000-4000-8000-000000000001','legacy sentinel');
    create view public.projects_all as select id,service_description from public.projects_vehicle;
    grant select on public.projects_vehicle,public.projects_all to anon,authenticated,service_role;`);
  await db.exec(migration);
});

test.after(async () => {
  await db?.close();
});

test("the actual migration creates exactly the eleven normalized tables without seed rows", async () => {
  const actual = (await rows(`select tablename from pg_catalog.pg_tables
    where schemaname='public' order by tablename`)).map((row) => row.tablename);
  assert.deepEqual(actual.filter((name) => name.startsWith("vehicle") || name === "maintenance_items"),
    [...tables].sort());
  for (const table of tables) {
    assert.equal(await value(`select count(*) from public.${table}`), 0);
  }
});

test("legacy Workbench vehicle table and unified view remain unchanged and unreferenced", async () => {
  assert.deepEqual(await rows("select id::text,service_description from public.projects_vehicle"), [
    { id: "20000000-0000-4000-8000-000000000001", service_description: "legacy sentinel" },
  ]);
  assert.deepEqual(await rows("select id::text,service_description from public.projects_all"), [
    { id: "20000000-0000-4000-8000-000000000001", service_description: "legacy sentinel" },
  ]);
  const references = await value(`select count(*) from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid=c.conrelid
    join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
    join pg_catalog.pg_class parent on parent.oid=c.confrelid
    join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
    where child_ns.nspname='public' and parent_ns.nspname='public'
      and parent.relname in ('projects_vehicle','projects_all')`);
  assert.equal(references, 0);
  assert.equal(await value(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='projects_vehicle'`), 2);
});

test("primary keys, owner-aware unique keys, and composite foreign keys exist", async () => {
  for (const table of tables.filter((name) => name !== "vehicle_maintenance_item_assets")) {
    assert.equal(await value(`select count(*) from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid=c.conrelid
      join pg_catalog.pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname=${quote(table)} and c.contype='p'`), 1, table);
  }
  const associationPk = await value(`select count(*) from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='vehicle_maintenance_item_assets'
      and c.contype='p' and pg_catalog.pg_get_constraintdef(c.oid)
        like 'PRIMARY KEY (owner_id, maintenance_item_id, asset_id)'`);
  assert.equal(associationPk, 1);
  for (const table of [
    "vehicles_assets", "maintenance_items", "vehicle_ongoing_records",
    "vehicle_recommended_records", "vehicle_completed_records",
    "vehicle_maintenance_intervals", "vehicle_key_information", "vehicle_links",
  ]) {
    assert.equal(await value(`select count(*) from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid=c.conrelid
      join pg_catalog.pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname=${quote(table)} and c.contype='u'
        and pg_catalog.pg_get_constraintdef(c.oid)='UNIQUE (owner_id, id)'`), 1, table);
  }
  assert.equal(await value(`select count(*) from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname in
      ('vehicle_ongoing_records','vehicle_recommended_records','vehicle_completed_records')
      and c.contype='u' and pg_catalog.pg_get_constraintdef(c.oid)
        like 'UNIQUE (owner_id, asset_id, service_date)'`), 3);
  for (const table of tables.filter((name) => name !== "vehicle_maintenance_item_assets")) {
    if (["vehicle_ongoing_items", "vehicles_save_requests"].includes(table)) continue;
    const id = (await rows(`select data_type,column_default from information_schema.columns
      where table_schema='public' and table_name=${quote(table)} and column_name='id'`))[0];
    assert.deepEqual(id, { data_type: "uuid", column_default: "gen_random_uuid()" }, table);
  }
  for (const table of [
    "vehicle_ongoing_records", "vehicle_recommended_records", "vehicle_completed_records",
  ]) {
    assert.equal(await value(`select data_type from information_schema.columns
      where table_schema='public' and table_name=${quote(table)} and column_name='service_date'`),
    "date", `${table}.service_date`);
  }
  for (const index of [
    "vehicles_assets_owner_name_idx",
    "maintenance_items_owner_active_name_key",
    "maintenance_items_owner_group_name_idx",
    "vehicle_maintenance_item_assets_owner_asset_item_idx",
    "vehicle_ongoing_items_owner_item_record_idx",
    "vehicle_links_owner_asset_order_idx",
  ]) {
    assert.equal(await value(`select count(*) from pg_catalog.pg_indexes
      where schemaname='public' and indexname=${quote(index)}`), 1, index);
  }
  assert.match(await value(`select obj_description('public.vehicle_ongoing_items_owner_item_record_idx'::regclass,'pg_class')`),
    /interval-source joins/i);
});

test("owner-aware foreign keys reject cross-owner assets and catalog relationships", async () => {
  const foreignAsset = await asset(owners.second);
  await assert.rejects(ongoing(owners.first, foreignAsset), /foreign key|violates/i);

  const ownerAsset = await asset(owners.first);
  const foreignItem = await item({ owner: owners.second });
  await assert.rejects(
    db.exec(`insert into public.vehicle_maintenance_intervals
      (owner_id,asset_id,maintenance_item_id,interval_value,interval_unit)
      values (${quote(owners.first)}::uuid,${quote(ownerAsset)}::uuid,
        ${quote(foreignItem)}::uuid,10,'miles')`),
    /foreign key|violates/i
  );
  await assert.rejects(
    db.exec(`insert into public.vehicle_maintenance_item_assets(owner_id,maintenance_item_id,asset_id)
      values (${quote(owners.first)}::uuid,${quote(foreignItem)}::uuid,${quote(ownerAsset)}::uuid)`),
    /foreign key|violates/i
  );
});

test("asset names and usage units enforce canonical bounded values", async () => {
  for (const unit of ["miles", "hours", "none"]) await asset(owners.first, uniqueName("unit"), unit);
  for (const unit of ["kilometers", "", "Miles"]) {
    await assert.rejects(asset(owners.first, uniqueName("invalid-unit"), unit));
  }
  for (const name of ["", "   ", `x${"a".repeat(120)}`, " padded "]) {
    await assert.rejects(asset(owners.first, name));
  }
  await asset(owners.first, "x".repeat(120));
});

test("historical usage snapshots enforce units, nullable readings, and nonnegative values", async () => {
  const assetId = await asset();
  await ongoing(owners.first, assetId, "2026-01-01", "none", null);
  await ongoing(owners.first, assetId, "2026-01-02", "miles", null);
  await ongoing(owners.first, assetId, "2026-01-03", "hours", 12.5);
  await assert.rejects(ongoing(owners.first, assetId, "2026-01-04", "none", 0));
  await assert.rejects(ongoing(owners.first, assetId, "2026-01-05", "miles", -0.01));
  await assert.rejects(ongoing(owners.first, assetId, "2026-01-06", "kilometers", null));
  await assert.rejects(ongoing(owners.first, assetId, "2026-01-07", "hours", 1_000_000_000_000));
  await db.exec(`insert into public.vehicle_recommended_records
    (owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,description)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-01-08','miles',null,'Synthetic')`);
  await db.exec(`insert into public.vehicle_completed_records
    (owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,service_description)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-01-09','hours',0,'Synthetic')`);
  await assert.rejects(db.exec(`insert into public.vehicle_completed_records
    (owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,service_description)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-01-10','none',1,'Synthetic')`));
});

test("historical collections have independent same-date uniqueness and optional mechanics", async () => {
  const assetId = await asset();
  const date = "2026-02-03";
  await ongoing(owners.first, assetId, date, "none", null);
  await recommended(owners.first, assetId, date);
  await completed(owners.first, assetId, date);
  await assert.rejects(ongoing(owners.first, assetId, date, "none", null));
  await assert.rejects(recommended(owners.first, assetId, date));
  await assert.rejects(completed(owners.first, assetId, date));
  assert.equal(await value(`select count(*) from public.vehicle_ongoing_records
    where owner_id=${quote(owners.first)}::uuid and asset_id=${quote(assetId)}::uuid`), 1);

  await db.exec(`insert into public.vehicle_ongoing_records
    (owner_id,asset_id,service_date,usage_reading_unit,mechanic)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-02-04','none','')`);
  await assert.rejects(db.exec(`insert into public.vehicle_ongoing_records
    (owner_id,asset_id,service_date,usage_reading_unit,mechanic)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-02-05','none',repeat('x',161))`));
  await assert.rejects(db.exec(`insert into public.vehicle_recommended_records
    (owner_id,asset_id,service_date,usage_reading_unit,description,mechanic)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-02-06','none','Synthetic',repeat('x',161))`));
  await assert.rejects(db.exec(`insert into public.vehicle_completed_records
    (owner_id,asset_id,service_date,usage_reading_unit,service_description,mechanic)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-02-07','none','Synthetic',repeat('x',161))`));
});

test("recommended and completed descriptions are required, trimmed, and length-limited", async () => {
  const assetId = await asset();
  await recommended(owners.first, assetId, "2026-03-01", "Synthetic");
  await completed(owners.first, assetId, "2026-03-02", "Synthetic");
  for (const description of [null, "", "   "]) {
    await assert.rejects(db.exec(`insert into public.vehicle_recommended_records
      (owner_id,asset_id,service_date,usage_reading_unit,description)
      values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-03-03','none',${description === null ? "null" : quote(description)})`));
    await assert.rejects(db.exec(`insert into public.vehicle_completed_records
      (owner_id,asset_id,service_date,usage_reading_unit,service_description)
      values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'2026-03-04','none',${description === null ? "null" : quote(description)})`));
  }
  const tooLong = "x".repeat(10001);
  await assert.rejects(recommended(owners.first, assetId, "2026-03-05", tooLong));
  await assert.rejects(completed(owners.first, assetId, "2026-03-06", tooLong));
  await assert.rejects(recommended(owners.first, assetId, "2026-03-07", " padded "));
  await assert.rejects(completed(owners.first, assetId, "2026-03-08", " padded "));
});

test("active catalog names are case-insensitively unique per owner and archived names can be reused", async () => {
  const first = await item({ owner: owners.first, name: "Synthetic Fuel Filter" });
  await assert.rejects(item({ owner: owners.first, name: " synthetic fuel filter " }));
  const otherOwner = await item({ owner: owners.second, name: "SYNTHETIC FUEL FILTER" });
  assert(first);
  assert(otherOwner);
  await db.exec(`update public.maintenance_items set archived_at=now()
    where id=${quote(first)}::uuid`);
  const replacement = await item({ owner: owners.first, name: "SYNTHETIC FUEL FILTER" });
  assert(replacement);
});

test("Maintenance Item groups and availability shape are constrained", async () => {
  const assetId = await asset();
  for (const group of ["routine", "fluids_drivetrain", "components_other"]) {
    await item({ group });
  }
  for (const group of ["other", "", "Routine"]) {
    await assert.rejects(item({ group }));
  }
  for (const name of ["", "   ", `x${"a".repeat(100)}`, " padded "]) {
    await assert.rejects(item({ name }));
  }
  await item({ name: "x".repeat(100) });
  await item({ mode: "current_asset_only", currentAsset: assetId });
  await item({ mode: "selected_assets" });
  await item({ mode: "all_assets" });
  await assert.rejects(item({ mode: "invalid" }));
  await assert.rejects(item({ mode: "current_asset_only" }));
  await assert.rejects(item({ mode: "selected_assets", currentAsset: assetId }));
  await assert.rejects(item({ mode: "all_assets", currentAsset: assetId }));
  await assert.rejects(item({ mode: "current_asset_only", currentAsset: await asset(owners.second) }));
});

test("all_assets availability remains durable for existing and future owner assets", async () => {
  const catalogItem = await item({ mode: "all_assets" });
  const originalAsset = await asset();
  const futureAsset = await asset();
  assert.deepEqual(await rows(`select availability_mode,current_asset_id
    from public.maintenance_items where id=${quote(catalogItem)}::uuid`), [
    { availability_mode: "all_assets", current_asset_id: null },
  ]);
  assert.equal(await value(`select count(*) from public.vehicle_maintenance_item_assets
    where maintenance_item_id=${quote(catalogItem)}::uuid`), 0);
  assert.equal(await value(`select count(*) from public.vehicles_assets
    where id in (${quote(originalAsset)}::uuid,${quote(futureAsset)}::uuid)`), 2);
});

test("selected asset availability is unique, owner-aware, and indexed for reverse lookup", async () => {
  const assetId = await asset();
  const itemId = await item({ mode: "selected_assets" });
  await db.exec(`insert into public.vehicle_maintenance_item_assets(owner_id,maintenance_item_id,asset_id)
    values (${quote(owners.first)}::uuid,${quote(itemId)}::uuid,${quote(assetId)}::uuid)`);
  await assert.rejects(db.exec(`insert into public.vehicle_maintenance_item_assets(owner_id,maintenance_item_id,asset_id)
    values (${quote(owners.first)}::uuid,${quote(itemId)}::uuid,${quote(assetId)}::uuid)`));
  const index = await value(`select count(*) from pg_catalog.pg_indexes
    where schemaname='public' and tablename='vehicle_maintenance_item_assets'
      and indexdef like '%(owner_id, asset_id, maintenance_item_id)%'`);
  assert.equal(index, 1);
});

test("Ongoing item snapshots preserve explicit true and false states and restrict catalog deletion", async () => {
  const assetId = await asset();
  const itemId = await item({ name: uniqueName("captured item") });
  const recordId = await ongoing(owners.first, assetId);
  await db.exec(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values (${quote(owners.first)}::uuid,${quote(recordId)}::uuid,${quote(itemId)}::uuid,true,'Synthetic captured item','routine'),
      (${quote(owners.first)}::uuid,${quote(recordId)}::uuid,${quote(await item())}::uuid,false,'Synthetic false item','components_other')`);
  assert.deepEqual(await rows(`select is_performed,display_name_snapshot,group_snapshot
    from public.vehicle_ongoing_items where record_id=${quote(recordId)}::uuid order by display_name_snapshot`), [
    { is_performed: true, display_name_snapshot: "Synthetic captured item", group_snapshot: "routine" },
    { is_performed: false, display_name_snapshot: "Synthetic false item", group_snapshot: "components_other" },
  ]);
  await assert.rejects(db.exec(`delete from public.maintenance_items where id=${quote(itemId)}::uuid`));
  await assert.rejects(db.exec(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values (${quote(owners.first)}::uuid,${quote(recordId)}::uuid,${quote(await item())}::uuid,true,'   ','routine')`));
  await assert.rejects(db.exec(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values (${quote(owners.first)}::uuid,${quote(recordId)}::uuid,${quote(await item())}::uuid,true,repeat('x',101),'routine')`));
  await assert.rejects(db.exec(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values (${quote(owners.first)}::uuid,${quote(recordId)}::uuid,${quote(await item())}::uuid,true,'Synthetic','invalid')`));
  await assert.rejects(db.exec(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values (${quote(owners.first)}::uuid,${quote(recordId)}::uuid,${quote(itemId)}::uuid,true,'Duplicate','routine')`));
  await db.exec(`delete from public.vehicle_ongoing_records where id=${quote(recordId)}::uuid`);
  assert.equal(await value(`select count(*) from public.vehicle_ongoing_items where record_id=${quote(recordId)}::uuid`), 0);
  assert.equal(await value(`select count(*) from public.maintenance_items where id=${quote(itemId)}::uuid`), 1);
});

test("Maintenance Item hard deletion is restricted by intervals", async () => {
  const assetId = await asset();
  const itemId = await item();
  await interval(owners.first, assetId, itemId);
  await assert.rejects(db.exec(`delete from public.maintenance_items where id=${quote(itemId)}::uuid`));
});

test("intervals allow positive decimals for miles/hours and only whole positive months", async () => {
  const assetId = await asset();
  const ids = await Promise.all([item(), item(), item()]);
  await interval(owners.first, assetId, ids[0], "miles", 5.25);
  await interval(owners.first, assetId, ids[1], "hours", 0.01);
  await interval(owners.first, assetId, ids[2], "months", 12);
  for (const [unit, amount] of [["days", 1], ["miles", 0], ["hours", -1], ["months", 1.5], ["months", 0]]) {
    await assert.rejects(db.exec(`insert into public.vehicle_maintenance_intervals
      (owner_id,asset_id,maintenance_item_id,interval_unit,interval_value)
      values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,
        ${quote(await item())}::uuid,${quote(unit)},${amount})`));
  }
  await assert.rejects(interval(owners.first, assetId, ids[0], "miles", 1));
  await assert.rejects(db.exec(`insert into public.vehicle_maintenance_intervals
    (owner_id,asset_id,maintenance_item_id,interval_value,interval_unit,comments)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,${quote(await item())}::uuid,
      1,'miles',repeat('x',2001))`));
});

test("Key Information enforces one row per asset and the JSON object contract", async () => {
  const assetId = await asset();
  await db.exec(`insert into public.vehicle_key_information(owner_id,asset_id)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid)`);
  assert.deepEqual(await rows(`select document from public.vehicle_key_information
    where asset_id=${quote(assetId)}::uuid`), [{ document: { schemaVersion: 1, blocks: [] } }]);
  await assert.rejects(db.exec(`insert into public.vehicle_key_information(owner_id,asset_id,document)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'{"schemaVersion":1,"blocks":[]}')`));
  for (const document of ["null", "[]", "{}", '{"schemaVersion":2,"blocks":[]}',
    '{"schemaVersion":1,"blocks":{}}', '{"blocks":[]}']) {
    const anotherAsset = await asset();
    await assert.rejects(db.exec(`insert into public.vehicle_key_information(owner_id,asset_id,document)
      values (${quote(owners.first)}::uuid,${quote(anotherAsset)}::uuid,${quote(document)}::jsonb)`));
  }
});

test("links enforce length, HTTPS, no controls, title limit, ordering, and owner lookup index", async () => {
  const assetId = await asset();
  const insertLink = (url, title = null, sort = 0) => db.exec(`insert into public.vehicle_links
    (owner_id,asset_id,url,display_title,sort_order)
    values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,${quote(url)},
      ${title === null ? "null" : quote(title)},${sort})`);
  await insertLink("https://example.test/manual", "Synthetic manual", 1);
  for (const url of ["", "   ", "http://example.test", "https://", " https://example.test"]) {
    await assert.rejects(insertLink(url));
  }
  await assert.rejects(insertLink(`https://example.test/${"x".repeat(2048)}`));
  await assert.rejects(insertLink("https://example.test/\u0001unsafe"));
  await assert.rejects(insertLink("https://example.test", "x".repeat(301)));
  await assert.rejects(insertLink("https://example.test", null, -1));
  assert.equal(await value(`select count(*) from pg_catalog.pg_indexes
    where schemaname='public' and tablename='vehicle_links'
      and indexdef like '%(owner_id, asset_id, sort_order, id)%'`), 1);
});

test("asset deletion cascades owned history while preserving other assets, owners, and catalog", async () => {
  const firstAsset = await asset(owners.first);
  const siblingAsset = await asset(owners.first);
  const otherOwnerAsset = await asset(owners.second);
  const sharedItem = await item({ owner: owners.first, mode: "all_assets" });
  const selectedItem = await item({ owner: owners.first, mode: "selected_assets" });
  const currentItem = await item({
    owner: owners.first, mode: "current_asset_only", currentAsset: firstAsset,
  });
  await db.exec(`insert into public.vehicle_maintenance_item_assets(owner_id,maintenance_item_id,asset_id)
    values (${quote(owners.first)}::uuid,${quote(selectedItem)}::uuid,${quote(firstAsset)}::uuid),
      (${quote(owners.first)}::uuid,${quote(selectedItem)}::uuid,${quote(siblingAsset)}::uuid)`);
  const firstRecord = await ongoing(owners.first, firstAsset);
  const siblingRecord = await ongoing(owners.first, siblingAsset);
  const foreignRecord = await ongoing(owners.second, otherOwnerAsset);
  await db.exec(`insert into public.vehicle_ongoing_items
    (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
    values (${quote(owners.first)}::uuid,${quote(firstRecord)}::uuid,${quote(sharedItem)}::uuid,true,'Synthetic','routine')`);
  await recommended(owners.first, firstAsset, "2026-02-01");
  await completed(owners.first, firstAsset, "2026-02-02");
  await interval(owners.first, firstAsset, sharedItem);
  await db.exec(`insert into public.vehicle_key_information(owner_id,asset_id)
    values (${quote(owners.first)}::uuid,${quote(firstAsset)}::uuid)`);
  await db.exec(`insert into public.vehicle_links(owner_id,asset_id,url)
    values (${quote(owners.first)}::uuid,${quote(firstAsset)}::uuid,'https://example.test/asset')`);

  await assert.rejects(db.exec(`delete from public.vehicles_assets where id=${quote(firstAsset)}::uuid`));
  await db.exec(`update public.maintenance_items set availability_mode='all_assets',
    current_asset_id=null,archived_at=now() where id=${quote(currentItem)}::uuid`);
  await db.exec(`delete from public.vehicles_assets where id=${quote(firstAsset)}::uuid`);

  for (const table of [
    "vehicle_ongoing_records", "vehicle_recommended_records", "vehicle_completed_records",
    "vehicle_maintenance_intervals", "vehicle_key_information", "vehicle_links",
  ]) {
    assert.equal(await value(`select count(*) from public.${table}
      where owner_id=${quote(owners.first)}::uuid and asset_id=${quote(firstAsset)}::uuid`), 0, table);
  }
  assert.equal(await value(`select count(*) from public.vehicle_ongoing_items
    where record_id=${quote(firstRecord)}::uuid`), 0);
  assert.equal(await value(`select count(*) from public.vehicle_ongoing_records
    where id=${quote(siblingRecord)}::uuid`), 1);
  assert.equal(await value(`select count(*) from public.vehicle_ongoing_records
    where id=${quote(foreignRecord)}::uuid`), 1);
  assert.equal(await value(`select count(*) from public.maintenance_items
    where id in (${quote(sharedItem)}::uuid,${quote(selectedItem)}::uuid,${quote(currentItem)}::uuid)`), 3);
  assert.equal(await value(`select count(*) from public.vehicle_maintenance_item_assets
    where maintenance_item_id=${quote(selectedItem)}::uuid and asset_id=${quote(siblingAsset)}::uuid`), 1);
  assert.equal(await value(`select count(*) from public.vehicle_maintenance_item_assets
    where maintenance_item_id=${quote(selectedItem)}::uuid and asset_id=${quote(firstAsset)}::uuid`), 0);
  assert.equal(await value(`select count(*) from public.vehicles_assets where id=${quote(otherOwnerAsset)}::uuid`), 1);
});

test("deleting one historical collection row does not affect the other collections", async () => {
  const assetId = await asset();
  const ongoingId = await ongoing(owners.first, assetId, "2026-04-01");
  const recommendedId = await recommended(owners.first, assetId, "2026-04-01");
  const completedId = await completed(owners.first, assetId, "2026-04-01");
  await db.exec(`delete from public.vehicle_recommended_records where id=${quote(recommendedId)}::uuid`);
  assert.equal(await value(`select count(*) from public.vehicle_ongoing_records where id=${quote(ongoingId)}::uuid`), 1);
  assert.equal(await value(`select count(*) from public.vehicle_completed_records where id=${quote(completedId)}::uuid`), 1);
});

test("save-request receipts are unique, immutable-shaped, private, and independent of asset deletion", async () => {
  const requestId = "30000000-0000-4000-8000-000000000001";
  const insertReceipt = () => db.exec(`insert into public.vehicles_save_requests
    (owner_id,request_id,payload_hash,result)
    values (${quote(owners.first)}::uuid,${quote(requestId)}::uuid,'hash-fixture','{"saved":true}')`);
  await insertReceipt();
  await assert.rejects(insertReceipt());
  await assert.rejects(db.exec(`insert into public.vehicles_save_requests(owner_id,request_id,payload_hash,result)
    values (${quote(owners.first)}::uuid,'30000000-0000-4000-8000-000000000002','   ','{}')`));
  await assert.rejects(db.exec(`insert into public.vehicles_save_requests(owner_id,request_id,payload_hash,result)
    values (${quote(owners.first)}::uuid,'30000000-0000-4000-8000-000000000003','hash','[]')`));
  const columns = (await rows(`select column_name from information_schema.columns
    where table_schema='public' and table_name='vehicles_save_requests'`)).map((row) => row.column_name);
  assert.deepEqual(columns.sort(), ["committed_at", "owner_id", "payload_hash", "request_id", "result"]);
  const assetId = await asset();
  await db.exec(`insert into public.vehicles_save_requests(owner_id,request_id,payload_hash,result)
    values (${quote(owners.first)}::uuid,'30000000-0000-4000-8000-000000000004','asset-independent','{}')`);
  await db.exec(`delete from public.vehicles_assets where id=${quote(assetId)}::uuid`);
  assert.equal(await value(`select count(*) from public.vehicles_save_requests
    where owner_id=${quote(owners.first)}::uuid`), 2);
});

test("all mutable tables have timestamp/version conventions and only approved updated-at triggers", async () => {
  const mutable = [
    "vehicles_assets", "maintenance_items", "vehicle_ongoing_records",
    "vehicle_recommended_records", "vehicle_completed_records",
    "vehicle_maintenance_intervals", "vehicle_key_information", "vehicle_links",
  ];
  for (const table of mutable) {
    const columns = await rows(`select column_name,data_type,column_default,is_nullable
      from information_schema.columns where table_schema='public' and table_name=${quote(table)}
        and column_name in ('created_at','updated_at','version') order by column_name`);
    assert.deepEqual(columns.map((row) => [row.column_name, row.data_type, row.is_nullable]), [
      ["created_at", "timestamp with time zone", "NO"],
      ["updated_at", "timestamp with time zone", "NO"],
      ["version", "integer", "NO"],
    ], table);
    for (const column of columns) {
      if (column.column_name === "version") assert.match(column.column_default, /1/);
      else assert.match(column.column_default, /now\(\)/i);
    }
    assert.equal(await value(`select count(*) from pg_catalog.pg_trigger tr
      join pg_catalog.pg_class c on c.oid=tr.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=${quote(table)} and not tr.tgisinternal
        and tr.tgname like '%_updated_at'
        and pg_catalog.pg_get_triggerdef(tr.oid) like '%vehicles_set_updated_at%'`), 1, table);
    let id;
    const assetId = await asset();
    switch (table) {
      case "vehicles_assets":
        id = assetId;
        break;
      case "maintenance_items":
        id = await item();
        break;
      case "vehicle_ongoing_records":
        id = await ongoing(owners.first, assetId);
        break;
      case "vehicle_recommended_records":
        id = await recommended(owners.first, assetId, "2026-05-01");
        break;
      case "vehicle_completed_records":
        id = await completed(owners.first, assetId, "2026-05-01");
        break;
      case "vehicle_maintenance_intervals":
        id = await interval(owners.first, assetId, await item());
        break;
      case "vehicle_key_information":
        id = await insertId(`insert into public.vehicle_key_information(owner_id,asset_id)
          values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid)`);
        break;
      case "vehicle_links":
        id = await insertId(`insert into public.vehicle_links(owner_id,asset_id,url)
          values (${quote(owners.first)}::uuid,${quote(assetId)}::uuid,'https://example.test/timestamp')`);
        break;
      default:
        assert.fail(`Unexpected mutable Vehicles table: ${table}`);
    }
    const touched = await rows(`update public.${table} set updated_at='2000-01-01'
      where id=${quote(id)}::uuid
      returning updated_at > '2000-01-01'::timestamptz as timestamp_refreshed,version`);
    assert.deepEqual(touched, [{ timestamp_refreshed: true, version: 1 }], table);
    await assert.rejects(db.exec(`update public.${table} set version=0 where id=${quote(id)}::uuid`));
  }
  const immutable = ["vehicle_ongoing_items", "vehicle_maintenance_item_assets", "vehicles_save_requests"];
  for (const table of immutable) {
    assert.equal(await value(`select count(*) from pg_catalog.pg_trigger tr
      join pg_catalog.pg_class c on c.oid=tr.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=${quote(table)} and not tr.tgisinternal`), 0, table);
  }
  for (const table of [
    "vehicles_assets", "maintenance_items", "vehicle_ongoing_records",
    "vehicle_recommended_records", "vehicle_completed_records",
    "vehicle_maintenance_intervals", "vehicle_key_information", "vehicle_links",
  ]) {
    assert.equal(await value(`select count(*) from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid=c.conrelid
      join pg_catalog.pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname=${quote(table)} and c.contype='c'
        and pg_catalog.pg_get_constraintdef(c.oid) like '%version > 0%'`), 1, table);
  }
});

test("every Vehicles table enables RLS with owner CRUD policies and no anonymous policies", async () => {
  for (const table of tables) {
    assert.equal(await value(`select relrowsecurity from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=${quote(table)}`), true, table);
  }
  for (const table of readableTables) {
    const policies = await rows(`select policyname,cmd,roles,qual,with_check
      from pg_catalog.pg_policies where schemaname='public' and tablename=${quote(table)}
      order by cmd`);
    assert.deepEqual(policies.map((row) => row.cmd), ["DELETE", "INSERT", "SELECT", "UPDATE"], table);
    assert(policies.every((row) => row.roles.includes("authenticated")), table);
    assert(policies.every((row) => !row.roles.includes("anon")), table);
    assert(policies.every((row) => row.qual?.includes("auth.uid()") || row.cmd === "INSERT"), table);
    assert(policies.every((row) => row.with_check?.includes("auth.uid()") || row.cmd !== "INSERT"), table);
  }
  assert.equal(await value(`select count(*) from pg_catalog.pg_policies
    where schemaname='public' and tablename='vehicles_save_requests'`), 0);
});

test("authenticated SELECT is owner-scoped; anon and direct client DML are denied", async () => {
  const firstAsset = await asset(owners.first);
  const secondAsset = await asset(owners.second);
  for (const table of readableTables) {
    assert.equal(await value(`select has_table_privilege('authenticated',${quote(`public.${table}`)},'SELECT')`), true, table);
    for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await value(`select has_table_privilege('authenticated',${quote(`public.${table}`)},${quote(privilege)})`), false, `${table} ${privilege}`);
      assert.equal(await value(`select has_table_privilege('anon',${quote(`public.${table}`)},${quote(privilege)})`), false, `${table} anon ${privilege}`);
    }
    assert.equal(await value(`select has_table_privilege('anon',${quote(`public.${table}`)},'SELECT')`), false, `${table} anon SELECT`);
  }
  assert.equal(await value(`select has_table_privilege('authenticated','public.vehicles_save_requests','SELECT')`), false);
  for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
    assert.equal(await value(`select has_table_privilege('authenticated','public.vehicles_save_requests',${quote(privilege)})`), false);
    assert.equal(await value(`select has_table_privilege('anon','public.vehicles_save_requests',${quote(privilege)})`), false);
  }
  assert.equal(await value(`select has_table_privilege('authenticated','public.vehicles_save_requests','TRUNCATE')`), false);
  for (const table of readableTables) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await value(`select has_table_privilege('service_role',${quote(`public.${table}`)},${quote(privilege)})`), true, `${table} service_role ${privilege}`);
    }
  }
  assert.equal(await value(`select has_table_privilege('service_role','public.vehicles_save_requests','SELECT')`), true);
  assert.equal(await value(`select has_table_privilege('service_role','public.vehicles_save_requests','INSERT')`), true);
  assert.equal(await value(`select has_table_privilege('service_role','public.vehicles_save_requests','UPDATE')`), false);
  assert.equal(await value(`select has_table_privilege('service_role','public.vehicles_save_requests','DELETE')`), false);
  assert.equal(await value(`select has_table_privilege('anon','public.vehicles_assets','SELECT')`), false);
  await assert.rejects(asRole("anon", null, "select * from public.vehicles_assets"), /permission denied/i);
  const owned = await asRole("authenticated", owners.first,
    `select id::text from public.vehicles_assets where id=${quote(firstAsset)}::uuid`);
  const visible = owned.flatMap((entry) => entry.rows ?? []);
  assert.deepEqual(visible.map((row) => row.id), [firstAsset]);
  assert.notEqual(firstAsset, secondAsset);
  await assert.rejects(asRole("authenticated", owners.first,
    `insert into public.vehicles_assets(owner_id,name,usage_unit)
      values (${quote(owners.first)}::uuid,'Denied synthetic write','none')`), /permission denied/i);
  await assert.rejects(asRole("authenticated", owners.first, "select * from public.vehicles_save_requests"),
    /permission denied/i);
});

test("owner SELECT/INSERT/UPDATE/DELETE policies enforce identity when isolated DML grants are enabled", async () => {
  const firstAsset = await asset(owners.first, "Synthetic RLS first");
  const secondAsset = await asset(owners.second, "Synthetic RLS second");
  await db.exec("grant insert,update,delete on public.vehicles_assets to authenticated");
  try {
    const firstRows = await asRole("authenticated", owners.first,
      `select id::text,name from public.vehicles_assets where id in
        (${quote(firstAsset)}::uuid,${quote(secondAsset)}::uuid) order by name`);
    const firstVisible = firstRows.flatMap((entry) => entry.rows ?? []);
    assert.deepEqual(firstVisible, [{ id: firstAsset, name: "Synthetic RLS first" }]);

    await asRole("authenticated", owners.first, `insert into public.vehicles_assets(owner_id,name,usage_unit)
      values (${quote(owners.first)}::uuid,'Synthetic RLS insert','hours')`);
    await assert.rejects(asRole("authenticated", owners.first, `insert into public.vehicles_assets(owner_id,name,usage_unit)
      values (${quote(owners.second)}::uuid,'Synthetic cross-owner insert','hours')`), /row-level security/i);

    const hiddenUpdate = await asRole("authenticated", owners.first, `update public.vehicles_assets
      set name='Should remain hidden' where id=${quote(secondAsset)}::uuid returning id`);
    assert.equal(hiddenUpdate.flatMap((entry) => entry.rows ?? []).length, 0);
    await assert.rejects(asRole("authenticated", owners.first, `update public.vehicles_assets
      set owner_id=${quote(owners.second)}::uuid where id=${quote(firstAsset)}::uuid`), /row-level security/i);

    const hiddenDelete = await asRole("authenticated", owners.first,
      `delete from public.vehicles_assets where id=${quote(secondAsset)}::uuid returning id`);
    assert.equal(hiddenDelete.flatMap((entry) => entry.rows ?? []).length, 0);
    const ownDelete = await asRole("authenticated", owners.first,
      `delete from public.vehicles_assets where id=${quote(firstAsset)}::uuid returning id`);
    assert.equal(ownDelete.flatMap((entry) => entry.rows ?? []).length, 1);
  } finally {
    await db.exec("revoke insert,update,delete on public.vehicles_assets from authenticated");
  }
});

test("migration defines no vehicle RPC, owner seed, legacy mutation, or production identity", async () => {
  assert.doesNotMatch(migration, /save_vehicles_changes/i);
  assert.doesNotMatch(migration, /\b(insert\s+into|update\s+public\.projects_vehicle|delete\s+from\s+public\.projects_vehicle|alter\s+table\s+public\.projects_vehicle)\b/i);
  assert.doesNotMatch(migration, /e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60|service[_ -]?role[_ -]key|bearer\s+[a-z0-9._-]{16,}|postgres(?:ql)?:\/\/\S+|password\s*=/i);
  assert.match(await value(`select obj_description('public.vehicle_maintenance_item_assets'::regclass,'pg_class')`),
    /DEFERRED TO PHASE 4B ATOMIC RPC VALIDATION/);
  assert.equal(await value(`select count(*) from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname ilike '%vehicles%'`), 1);
});

test("isolated rollback validation drops objects in reverse dependency order and restores them", async () => {
  const reverseOrder = [
    "vehicles_save_requests",
    "vehicle_links",
    "vehicle_key_information",
    "vehicle_maintenance_intervals",
    "vehicle_completed_records",
    "vehicle_recommended_records",
    "vehicle_ongoing_items",
    "vehicle_ongoing_records",
    "vehicle_maintenance_item_assets",
    "maintenance_items",
    "vehicles_assets",
  ];
  await db.exec(`begin;
    ${reverseOrder.map((table) => `drop table public.${table};`).join("\n")}
    drop function public.vehicles_set_updated_at();
    rollback;`);
  for (const table of tables) {
    assert.equal(await value(`select to_regclass(${quote(`public.${table}`)}) is not null`), true, table);
  }
  assert.equal(await value("select to_regprocedure('public.vehicles_set_updated_at()') is not null"), true);
  assert.equal(await value("select count(*) from public.projects_vehicle"), 1);
});
