const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PGlite } = require("@electric-sql/pglite");

const { schema } = require("./fixtures/workbench-live-schema.cjs");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const migration = read("supabase\\review\\202610250002_project_deletion.sql");
const creation = read("supabase\\review\\202610250001_project_creation.sql");
const plannerTables = ["planner_tasks", "planner_weekly_tasks", "planner_parking_lot"];
const columnLines = read("supabase\\review\\project-deletion-inspection\\results\\02_columns.sql").trim().split(/\r?\n/);
const header = columnLines.shift().split(",");
const columns = columnLines.map((line) => {
  const fields = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (line[i] === '"') quoted = !quoted;
    else if (line[i] === "," && !quoted) { fields.push(value); value = ""; }
    else value += line[i];
  }
  fields.push(value);
  assert.equal(fields.length, header.length, "Saved columns require a CSV parser if export changes");
  return Object.fromEntries(header.map((key, i) => [key, fields[i]]));
});

async function fixture() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(schema);
  for (const table of plannerTables) {
    const definitions = columns.filter((row) => row.schema_name === "public" && row.relation_name === table)
      .map((row) => `"${row.column_name}" ${row.data_type}`
        + (row.not_null === "true" ? " not null" : "")
        + (row.column_default !== "null" ? ` default ${row.column_default}` : "")
        + (row.column_name === "id" ? " primary key" : ""));
    await db.exec(`create table public.${table} (${definitions.join(",")});
      grant select, insert, update, delete on public.${table} to anon, authenticated;`);
  }
  await db.exec(creation);
  await db.exec(migration);
  return db;
}
async function create(db, kind) {
  return (await db.query("select create_workbench_project($1,$2::jsonb) as p",
    [kind, JSON.stringify({ title: "Disposable local fixture", ...(kind === "repeating" ? { recurrence: "weekly" } : {}) })])).rows[0].p;
}
async function remove(db, project, kind) {
  return (await db.query("select delete_workbench_project($1::uuid,$2) as summary",
    [project.id, kind])).rows[0].summary;
}
async function sequenceState(db) {
  return (await db.query(`select 'home' as kind,last_value,is_called from projects_home_external_id_seq
    union all select 'vehicle',last_value,is_called from projects_vehicle_external_id_seq
    union all select 'repeating',last_value,is_called from projects_repeating_external_id_seq
    union all select 'misc',last_value,is_called from projects_misc_external_id_seq order by kind`)).rows;
}

test("all four modern cascades route by UUID/type, preserve unrelated rows and counters, and never reuse deleted IDs", async () => {
  const db = await fixture();
  try {
    await db.exec(`create table public.delete_order (ordinal bigint generated always as identity, relation text);
      grant insert on public.delete_order to anon, authenticated;
      grant usage on sequence public.delete_order_ordinal_seq to anon, authenticated;
      create function public.record_delete() returns trigger language plpgsql as
      $$ begin insert into public.delete_order(relation) values(TG_TABLE_NAME); return OLD; end $$;`);
    for (const table of [...plannerTables, ...["home", "vehicle", "repeating", "misc"].map((kind) => `projects_${kind}`)]) {
      await db.exec(`create trigger record_delete after delete on public.${table}
        for each row execute function public.record_delete()`);
    }
    const excluded = ["projects", "task_manager", "weekly_tasks", "repeatable_masters",
      "repeatable_overrides", "project_registry", "parking_lot", "curated_queue",
      "staged_queue", "planner_profiles"];
    for (const table of excluded) {
      await db.exec(`create table public.${table} (id text, metadata jsonb);`);
    }
    for (const kind of ["home", "vehicle", "repeating", "misc"]) {
      const project = await create(db, kind);
      const other = await create(db, kind);
      for (const table of excluded) {
        await db.query(`insert into public.${table} values($1,$2)`,
          [project.id, { project_id: project.id, profileId: "non-default", preserve: true }]);
      }
      const task = (await db.query("insert into planner_tasks(project_id,source,deleted,metadata_json) values($1,$2,true,$3) returning id",
        [project.id, kind, { series: { active: false }, queue: "staged" }])).rows[0];
      await db.query("insert into planner_tasks(project_id,source) values($1,$2)", [other.id, kind]);
      await db.query(`insert into planner_weekly_tasks(id,project_id,parent_rep,deleted,overridden,metadata_json)
        values('owned-week',$1,$2,true,true,$3),('other-week',$4,null,false,false,'{}'),
        ('week-settings',null,null,false,false,'{}')`,
      [project.id, kind === "repeating" ? project.id : null, { sourceTaskId: task.id }, other.id]);
      await db.exec("update planner_weekly_tasks set completed=true where id='owned-week'");
      await db.query("insert into planner_weekly_tasks(id,metadata_json) values('task-only',$1)",
        [{ sourceTaskId: task.id }]);
      if (kind === "repeating") {
        await db.query("insert into planner_weekly_tasks(id,parent_rep) values('parent-only',$1)", [project.id]);
      }
      for (const [id, type, target] of [
        ["p-project", "project", project.id], ["p-task", "task-manager", task.id],
        ["p-week", "weekly", "owned-week"], ["p-other", "project", other.id],
        ["p-untyped", "", project.id],
        ["p-mismatched", "weekly", project.id],
      ]) {
        await db.query("insert into planner_parking_lot(id,converted_to_type,converted_to_id,metadata_json,deleted) values($1,true,$2,$3,true)",
          [id, target, { conversionType: type }]);
      }
      const before = await sequenceState(db);
      await db.exec("truncate public.delete_order");
      await db.exec("set role anon");
      const result = await remove(db, project, kind);
      assert.equal(result.deleted, true);
      assert.equal(result.table, `projects_${kind}`);
      assert.equal(result.counts.planner_tasks, 1);
      assert.equal(result.counts.planner_weekly_tasks, kind === "repeating" ? 3 : 2);
      assert.equal(result.counts.planner_parking_lot, 3);
      assert.equal(result.counts[`projects_${kind}`], 1);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select relation from public.delete_order order by ordinal")).rows.map((r) => r.relation),
        [...Array(3).fill("planner_parking_lot"),
          ...Array(kind === "repeating" ? 3 : 2).fill("planner_weekly_tasks"),
          "planner_tasks", `projects_${kind}`]);
      for (const table of excluded) {
        assert.equal((await db.query(`select * from public.${table} where id=$1`, [project.id])).rows.length, 1);
      }
      assert.deepEqual(await sequenceState(db), before);
      assert.equal((await db.query("select * from projects_all where id=$1", [project.id])).rows.length, 0);
      assert.equal((await db.query("select * from projects_all where id=$1", [other.id])).rows.length, 1);
      assert.deepEqual((await db.query("select id from planner_weekly_tasks order by id")).rows.map((r) => r.id), ["other-week", "week-settings"]);
      assert.deepEqual((await db.query("select id from planner_parking_lot order by id")).rows.map((r) => r.id),
        ["p-mismatched", "p-other", "p-untyped"]);
      const next = await create(db, kind);
      assert(Number(next.external_id.slice(2)) > Number(project.external_id.slice(2)));
      await db.exec("truncate planner_tasks, planner_weekly_tasks, planner_parking_lot");
    }
  } finally { await db.close(); }
});

test("complete migration has invoker-only browser grants and handles dependency-free projects of every type", async () => {
  const db = await fixture();
  try {
    const check = (await db.exec(read("supabase\\review\\project_deletion_deployment_validation.sql")))[1].rows;
    const rpc = check.find((r) => r.section === "rpc").detail;
    assert.deepEqual(rpc, { function_count: 1, returns_jsonb: true, security_invoker: true,
      empty_search_path: true, public_execute: false, anon_execute: true, authenticated_execute: true });
    assert.equal(check.filter((r) => r.section === "modern_table").length, 7);
    for (const row of check.filter((r) => r.section === "modern_table")) {
      assert.equal(row.detail.rls_disabled, true);
      assert.equal(row.detail.anon_select_delete, true);
      assert.equal(row.detail.authenticated_select_delete, true);
    }
    assert.equal(check.find((r) => r.section === "view").detail.read_only_projection, true);
    assert.equal(check.filter((r) => r.section === "allocator_snapshot").length, 4);
    for (const kind of ["home", "vehicle", "repeating", "misc"]) {
      const p = await create(db, kind);
      // Display names and external prefixes must not determine the physical target.
      await db.query(`update projects_${kind} set title='Same title',external_id=$1 where id=$2`,
        [`OPAQUE-${kind}`, p.id]);
      const before = await sequenceState(db);
      await db.exec("set role authenticated");
      const result = await remove(db, p, kind);
      await db.exec("reset role");
      assert.deepEqual(result.counts, { [`projects_${kind}`]: 1,
        planner_tasks: 0, planner_weekly_tasks: 0, planner_parking_lot: 0 });
      assert.deepEqual(await sequenceState(db), before);
      assert.equal((await db.query("select * from projects_all where id=$1", [p.id])).rows.length, 0);
    }
  } finally { await db.close(); }
});

test("identity errors, active notifications, conflicts, changed RLS and child failure leave the entire cascade intact", async () => {
  const db = await fixture();
  try {
    const p = await create(db, "home");
    await assert.rejects(remove(db, p, "vehicle"), /mismatch|not found/);
    await assert.rejects(remove(db, p, "recurring"), /canonical/);
    await assert.rejects(remove(db, p, null), /canonical/);
    await assert.rejects(remove(db, p, "projects_all"), /canonical/);
    await assert.rejects(remove(db, { id: "00000000-0000-0000-0000-000000000000" }, "home"), /UUID/);
    await assert.rejects(remove(db, { id: null }, "home"), /UUID/);
    await assert.rejects(remove(db, { id: "not-a-uuid" }, "home"), /uuid/);
    await assert.rejects(remove(db, { id: "55555555-5555-4555-8555-555555555555" }, "home"), /not found/);
    const task = (await db.query("insert into planner_tasks(project_id,metadata_json) values($1,'{}') returning id", [p.id])).rows[0];
    await db.query("insert into planner_weekly_tasks(id,project_id,reminder_json) values('blocked',$1,$2)",
      [p.id, { active: true, provider: "google-calendar", eventId: "remote-owned-event" }]);
    await assert.rejects(remove(db, p, "home"), (error) => {
      assert.match(error.message, /Active remote/);
      assert.match(error.detail, /blocked.*remote-owned-event/);
      return true;
    });
    await db.exec("update planner_weekly_tasks set reminder_json='{\"active\":false}'");
    await db.query("update planner_tasks set metadata_json=$1 where id=$2",
      [{ reminder: { active: true, eventId: "task-notification" } }, task.id]);
    await assert.rejects(remove(db, p, "home"), /Active remote/);
    await db.exec("update planner_tasks set metadata_json='{}'");
    for (const table of [...plannerTables, ...["home", "vehicle", "repeating", "misc"].map((kind) => `projects_${kind}`)]) {
      await db.exec(`alter table ${table} enable row level security`);
      await assert.rejects(remove(db, p, "home"), /RLS changes/);
      await db.exec(`alter table ${table} disable row level security`);
    }
    await db.query("insert into planner_parking_lot(id,converted_to_type,converted_to_id,metadata_json) values('owned',true,$1,'{\"conversionType\":\"project\"}')", [p.id]);
    await db.exec(`create function public.fail_delete() returns trigger language plpgsql as
      $$ begin raise exception 'Fixture failure after Parking deletion'; end $$;
      create trigger fail_delete before delete on planner_tasks for each row execute function public.fail_delete();`);
    const snapshots = {};
    for (const table of ["projects_home", "projects_all", ...plannerTables]) {
      snapshots[table] = (await db.query(`select * from ${table} order by id`)).rows;
    }
    await assert.rejects(remove(db, p, "home"), /Fixture failure/);
    for (const [table, rows] of Object.entries(snapshots)) {
      assert.deepEqual((await db.query(`select * from ${table} order by id`)).rows, rows, table);
    }
    assert.equal((await db.query("select * from planner_parking_lot where id='owned'")).rows.length, 1);
    assert.equal((await db.query("select * from planner_weekly_tasks where id='blocked'")).rows.length, 1);
    assert.equal((await db.query("select * from projects_all where id=$1", [p.id])).rows.length, 1);
    await db.exec("drop trigger fail_delete on planner_tasks; drop function fail_delete()");
    await db.query("update planner_weekly_tasks set metadata_json=$1", [{ sourceTaskId: "someone-else" }]);
    await assert.rejects(remove(db, p, "home"), /ownership identities conflict/);
  } finally { await db.close(); }
});

test("disable removes RPC, preserves master data and allocator sequences; SQL excludes retired tables", async () => {
  const db = await fixture();
  try {
    const p = await create(db, "home");
    await db.exec(read("supabase\\review\\project_deletion_disable.sql"));
    await assert.rejects(remove(db, p, "home"), /does not exist/);
    assert.equal((await db.query("select * from projects_all where id=$1", [p.id])).rows.length, 1);
    assert.equal((await db.query("select last_value from projects_home_external_id_seq")).rows.length, 1);
    assert.doesNotMatch(migration, /\b(nextval|setval|security\s+definer)\b/i);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.(projects_all|projects\b|task_manager|weekly_tasks|project_registry|parking_lot|curated_queue|staged_queue|repeatable_)/i);
  } finally { await db.close(); }
});

test("data access makes one exact RPC request and rejects failed/unverified responses", async () => {
  const code = read("src\\services\\plannerDataAccess.js").replace(/^export /gm, "");
  const calls = [];
  let response;
  const factory = vm.runInNewContext(`(() => {${code}; return createPlannerDataAccess;})()`, { structuredClone });
  const data = factory({ rpc: async (name, args) => { calls.push({ name, ...args }); return response; } });
  const id = "11111111-1111-4111-8111-111111111111";
  for (const type of ["home", "vehicle", "repeating", "misc"]) {
    response = { data: { deleted: true, id, project_type: type, external_id: "opaque",
      table: `projects_${type}`, counts: { [`projects_${type}`]: 1, planner_tasks: 0, planner_weekly_tasks: 0, planner_parking_lot: 0 } } };
    await data.deleteProject({ id, source: type });
    assert.equal(calls.at(-1).p_type, type);
    assert.equal(calls.at(-1).p_id, id);
    assert.equal(calls.at(-1).name, "delete_workbench_project");
  }
  assert.equal(calls.length, 4);
  for (response of [{ error: { message: "denied", details: "record blocked" } }, { data: null }, { data: { deleted: true } }]) {
    await assert.rejects(data.deleteProject({ id, source: "home" }), /denied|verified/);
  }
  const count = calls.length;
  for (const p of [{ id }, { id, source: "unknown" }, { id: "title", source: "home" }]) {
    await assert.rejects(data.deleteProject(p), /UUID/);
  }
  assert.equal(calls.length, count);
});

test("owner preview and saved-ID post-validation run read-only and reflect the actual cascade", async () => {
  const db = await fixture();
  try {
    const p = await create(db, "home");
    const control = await create(db, "vehicle");
    const task = (await db.query("insert into planner_tasks(project_id) values($1) returning id", [p.id])).rows[0];
    await db.query("insert into planner_weekly_tasks(id,metadata_json) values('preview-week',$1)", [{ sourceTaskId: task.id }]);
    const preview = read("supabase\\review\\project_deletion_preview.sql")
      .replace(/SELECT '[0-9a-f-]+'::uuid AS project_id/i, `SELECT '${p.id}'::uuid AS project_id`);
    const before = (await db.exec(preview))[1].rows;
    assert.equal(before.filter((row) => row.section === "master").length, 1);
    assert.equal(before.filter((row) => row.section === "planner_tasks").length, 1);
    assert.equal(before.filter((row) => row.section === "planner_weekly_tasks").length, 1);
    const controls = before.filter((row) => row.section === "control_snapshot").map((r) => r.detail);
    assert(controls.some((r) => r.id === control.id));
    await remove(db, p, "home");
    const post = read("supabase\\review\\project_deletion_post_validation.sql")
      .replace("00000000-0000-0000-0000-000000000000", p.id)
      .replace("''::text AS external_id", `'${p.external_id}'::text AS external_id`)
      .replace("ARRAY[]::uuid[] AS deleted_task_ids", `ARRAY['${task.id}']::uuid[] AS deleted_task_ids`)
      .replace("ARRAY[]::text[] AS deleted_weekly_ids", "ARRAY['preview-week']::text[] AS deleted_weekly_ids")
      .replace("false AS preview_identities_copied", "true AS preview_identities_copied")
      .replace("'[]'::jsonb AS expected_controls",
        `'${JSON.stringify(controls).replace(/'/g, "''")}'::jsonb AS expected_controls`);
    const postRows = (await db.exec(post))[1].rows;
    const after = postRows.find((row) => row.section === "validation").detail;
    assert.equal(after.inputs_ready, true);
    for (const [key, value] of Object.entries(after)) if (key !== "inputs_ready") assert.equal(value, 0, key);
    assert.deepEqual(postRows.find((row) => row.section === "control_validation").detail,
      { controls_supplied: controls.length, all_unchanged: true });
  } finally { await db.close(); }
});
