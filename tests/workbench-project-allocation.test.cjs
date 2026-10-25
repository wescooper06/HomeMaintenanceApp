const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PGlite } = require("@electric-sql/pglite");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "review",
  "202610250001_project_creation.sql"), "utf8");
const kinds = ["home", "vehicle", "repeating", "misc"];
const extras = {
  home: "property text, area text, resource_links jsonb, cost numeric, date_completed date",
  vehicle: `vehicle text, date_completed date, hours numeric, mileage numeric, mechanic text,
    service_description text, resource_links jsonb, maintenance_checks jsonb`,
  repeating: "property text, task_description text, recurrence text",
  misc: "resource_links jsonb",
};
const schema = `
  create role anon;
  create role authenticated;
  create role service_role;
  alter default privileges grant all on sequences to anon, authenticated;
  ${kinds.map((kind) => `create table public.projects_${kind} (
    id uuid primary key default gen_random_uuid(),
    external_id text ${kind === "home" ? "not null" : ""},
    title text, category text, state text, priority text, "order" bigint,
    metadata jsonb, ${extras[kind]},
    created_at ${kind === "home" ? "timestamp" : "timestamptz not null"} default now(),
    updated_at timestamp default now()
  );`).join("\n")}
`;
let db;

async function create(kind, extra = {}) {
  const { rows } = await db.query(
    "select public.create_workbench_project($1, $2::jsonb) as project",
    [kind, JSON.stringify({ title: "Recycle", recurrence: "weekly", ...extra })]);
  return rows[0].project;
}

test.before(async () => {
  db = new PGlite();
  await db.exec(`${schema}
    insert into projects_home(external_id, title) values ('PA0001', 'Keep UUID');
    insert into projects_repeating(external_id) values ('PC0001'), ('PC0008');
    insert into projects_vehicle(external_id) values ('PB0090');
  `);
  await db.exec(migration);
});
test.after(async () => { await db?.close(); });

test("approved floors yield PA0210, PB0083, PC0009 and PD0005 on an empty database", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(schema);
    await isolated.exec(migration);
    for (const [kind, expected] of [
      ["home", "PA0210"], ["vehicle", "PB0083"], ["repeating", "PC0009"], ["misc", "PD0005"],
    ]) {
      const { rows } = await isolated.query("select create_workbench_project($1,$2::jsonb) as project",
        [kind, JSON.stringify({ title: "Project", ...(kind === "repeating" ? { recurrence: "weekly" } : {}) })]);
      assert.equal(rows[0].project.external_id, expected);
    }
  } finally {
    await isolated.close();
  }
});

test("allocator starts above approved floors and higher current data; UUIDs and defaults stay server-side", async () => {
  for (const [kind, expected] of [
    ["home", "PA0210"], ["vehicle", "PB0091"], ["repeating", "PC0009"], ["misc", "PD0005"],
  ]) {
    const payload = { title: "New project", ...(kind === "repeating" ? { recurrence: "weekly" } : {}) };
    const { rows } = await db.query("select create_workbench_project($1,$2::jsonb) as project",
      [kind, JSON.stringify(payload)]);
    const row = rows[0].project;
    assert.equal(row.external_id, expected);
    assert.match(row.id, /^[0-9a-f-]{36}$/i);
    assert.notEqual(row.external_id, row.id);
    assert(row.created_at);
    assert(row.updated_at);
    const saved = await db.query(`select * from projects_${kind} where id=$1`, [row.id]);
    assert.equal(saved.rows[0].external_id, expected);
  }
});

test("higher current maxima override approved floors independently for all four project types", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(schema);
    for (const [kind, prefix] of [["home", "PA"], ["vehicle", "PB"], ["repeating", "PC"], ["misc", "PD"]]) {
      await isolated.query(`insert into projects_${kind}(external_id) values ($1)`, [prefix + "1000"]);
    }
    await isolated.exec(migration);
    for (const [kind, prefix] of [["home", "PA"], ["vehicle", "PB"], ["repeating", "PC"], ["misc", "PD"]]) {
      const { rows } = await isolated.query("select create_workbench_project($1,$2::jsonb) as project",
        [kind, JSON.stringify({ title: "Above maximum", ...(kind === "repeating" ? { recurrence: "weekly" } : {}) })]);
      assert.equal(rows[0].project.external_id, prefix + "1001");
    }
  } finally {
    await isolated.close();
  }
});

test("ordinary Recycle gets PC0010, never PC0003; deleting it does not make its number reusable", async () => {
  const first = await create("repeating");
  assert.equal(first.external_id, "PC0010");
  await db.query("delete from projects_repeating where id=$1", [first.id]);
  assert.equal((await create("repeating")).external_id, "PC0011");
  const gap = await db.query("select * from projects_repeating where external_id='PC0003'");
  assert.equal(gap.rows.length, 0);
});

test("caller-specified identities and wrong-type fields are rejected even when unused", async () => {
  for (const extra of [{ external_id: "PC0003" }, { id: "11111111-1111-4111-8111-111111111111" },
    { area: "Garage" }, { task_description: "Arbitrary" }]) {
    await assert.rejects(create("repeating", extra), /Unsupported project field/);
  }
  await assert.rejects(create("unknown"), /valid project type/);
  await assert.rejects(create("repeating", { title: "" }), /title is required/);
  await assert.rejects(create("repeating", { recurrence: "" }), /Recurrence is required/);
});

test("unique constraints reject duplicate external IDs in every raw table", async () => {
  for (const kind of kinds) {
    const { rows } = await db.query(`select external_id from projects_${kind} where external_id is not null limit 1`);
    await assert.rejects(db.query(`insert into projects_${kind}(external_id) values ($1)`,
      [rows[0].external_id]), /unique constraint/);
  }
});

test("overlapping create requests produce distinct increasing numbers with no gap filling", async () => {
  // PGlite serializes sessions; real multi-session PostgreSQL coverage is also
  // required before deployment. nextval provides PostgreSQL's atomic primitive.
  const results = await Promise.all(Array.from({ length: 20 }, () => create("repeating")));
  const numbers = results.map((row) => Number(row.external_id.slice(2))).sort((a, b) => a - b);
  assert.equal(new Set(results.map((row) => row.id)).size, 20);
  assert.equal(new Set(numbers).size, 20);
  assert.deepEqual(numbers, Array.from({ length: 20 }, (_, index) => index + 12));
  assert.match(migration, /nextval\(/);
  assert.match(migration, /security invoker/i);
});

test("failed insertion leaves no project, does not recycle its sequence value, and surfaces the error", async () => {
  const before = await db.query("select count(*)::int as count from projects_repeating");
  await assert.rejects(create("repeating", { order: "1.5" }), /invalid input syntax/);
  const after = await db.query("select count(*)::int as count from projects_repeating");
  assert.equal(after.rows[0].count, before.rows[0].count);
  assert.equal((await create("repeating")).external_id, "PC0033");
});

test("RPC rejects bigint orders that projects_all cannot read as integer without creating rows", async () => {
  const before = await db.query("select count(*)::int as count from projects_repeating");
  for (const order of ["2147483648", "-2147483649"]) {
    await assert.rejects(create("repeating", { order }), /projects_all integer range/);
  }
  const after = await db.query("select count(*)::int as count from projects_repeating");
  assert.equal(after.rows[0].count, before.rows[0].count);
});

test("padding is at least four digits and never truncates numbers beyond 9999", async () => {
  await db.exec("select setval('projects_misc_external_id_seq', 9999, true)");
  const { rows } = await db.query("select create_workbench_project('misc', '{\"title\":\"Large ID\"}') as project");
  assert.equal(rows[0].project.external_id, "PD10000");
});

test("original home NOT NULL rejection is avoided by the RPC without modifying existing identities", async () => {
  await assert.rejects(db.exec("insert into projects_home(title) values ('Old broken payload')"), /not-null constraint/);
  const { rows } = await db.query("select create_workbench_project('home', '{\"title\":\"New payload\"}') as project");
  assert.equal(rows[0].project.external_id, "PA0211");
  const existing = await db.query("select id, external_id, title from projects_home where external_id='PA0001'");
  assert.equal(existing.rows[0].title, "Keep UUID");
});

test("migration refuses duplicate or unexpected existing identities without renumbering rows", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(schema);
    await isolated.exec("insert into projects_home(external_id) values ('PA0001'), ('PA0001')");
    const original = await isolated.query("select id, external_id from projects_home order by id");
    await assert.rejects(isolated.exec(migration), { code: "23505" });
    await isolated.exec("rollback");
    assert.deepEqual((await isolated.query("select id, external_id from projects_home order by id")).rows, original.rows);
    assert.equal((await isolated.query("select to_regclass('public.projects_home_external_id_seq') as name")).rows[0].name, null);
    await isolated.exec("update projects_home set external_id='unexpected-format'");
    await assert.rejects(isolated.exec(migration), /Unexpected external_id format/);
    await isolated.exec("rollback");
  } finally {
    await isolated.close();
  }
});

test("RPC remains subject to table permissions and RLS; sequence callers cannot reset counters", async () => {
  await db.exec("set role anon");
  await assert.rejects(db.query("select create_workbench_project('home', '{\"title\":\"Denied\"}')"), /permission denied/);
  await assert.rejects(db.exec("select setval('projects_home_external_id_seq',1)"), /permission denied/);
  await db.exec("reset role; grant select, insert on projects_home to anon; alter table projects_home enable row level security");
  await db.exec("set role anon");
  await assert.rejects(db.query("select create_workbench_project('home', '{\"title\":\"Denied by RLS\"}')"), /row-level security/);
  await db.exec("reset role");
  await db.exec("create policy fixture_create on projects_home for all to anon using (true) with check (true)");
  await db.exec("set role anon");
  try {
    const { rows } = await db.query("select create_workbench_project('home', '{\"title\":\"Allowed by policy\"}') as project");
    assert.match(rows[0].project.external_id, /^PA\d{4}$/);
  } finally {
    await db.exec("reset role");
  }
});

test("modern data access sends mapped fields to the real local RPC without client identities", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "plannerDataAccess.js"), "utf8");
  const { createPlannerDataAccess } = vm.runInNewContext(`(() => {
    ${source.replace(/^export /gm, "")}
    return { createPlannerDataAccess };
  })()`, { structuredClone });
  const access = createPlannerDataAccess({
    async rpc(name, args) {
      assert.equal(name, "create_workbench_project");
      assert(!Object.hasOwn(args.p_project, "id"));
      assert(!Object.hasOwn(args.p_project, "external_id"));
      const { rows } = await db.query("select create_workbench_project($1,$2::jsonb) as project",
        [args.p_type, JSON.stringify(args.p_project)]);
      return { data: rows[0].project, error: null };
    },
    from() { throw new Error("Direct table writes forbidden during creation"); },
  });

  for (const kind of kinds) {
    const created = await access.createProject({
      source: kind, title: "  Mapped project  ", priority: "High", order: "12", recurrence: "weekly",
      metadata: { property: "House", resourceLinks: "https://example.test/manual",
        actualCost: "12.50", engineHours: "4", mileage: "123" },
    });
    assert.equal(created.source, kind);
    assert.equal(created.title, "Mapped project");
    assert.equal(created.order, 12);
    assert.equal(created.priority, "High");
    if (kind === "home") assert.equal(Number(created.metadata.actualCost), 12.5);
    if (kind === "vehicle") assert.equal(Number(created.metadata.engineHours), 4);
    if (kind === "repeating") assert.equal(created.recurrence, "weekly");
    const { rows } = await db.query(`select id,external_id from projects_${kind} where id=$1`, [created.id]);
    assert.equal(rows[0].external_id, created.externalId);
  }
});

test("functional rollback and full canonical reapplication preserve issued numbers, rows and uniqueness", async () => {
  const isolated = new PGlite();
  const rollback = fs.readFileSync(path.join(__dirname, "..", "supabase", "review",
    "project_creation_rollback.sql"), "utf8");
  try {
    await isolated.exec(schema);
    await isolated.exec(migration);
    await isolated.query("select create_workbench_project('home','{\"title\":\"Keep\"}')");
    await assert.rejects(isolated.query("select create_workbench_project('home','{\"title\":\"Fail\",\"order\":\"1.5\"}')"), /invalid input/);
    const snapshot = async () => (await isolated.query(`select jsonb_build_object(
      'rows', (select jsonb_agg(to_jsonb(p) order by id) from projects_home p),
      'last', (select last_value from projects_home_external_id_seq),
      'constraints', (select count(*) from pg_constraint where contype='u' and connamespace='public'::regnamespace)
    ) as state`)).rows[0].state;
    const before = await snapshot();
    await isolated.exec(rollback);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await isolated.query("select to_regprocedure('public.create_workbench_project(text,jsonb)') as routine")).rows[0].routine, null);
    await isolated.exec(migration);
    assert.deepEqual(await snapshot(), before);
    const { rows } = await isolated.query("select create_workbench_project('home','{\"title\":\"After restore\"}') as project");
    assert.equal(rows[0].project.external_id, "PA0212");
    await isolated.exec(migration);
    assert.equal((await isolated.query("select last_value from projects_home_external_id_seq")).rows[0].last_value, 212);
  } finally {
    await isolated.close();
  }
});

test("canonical reapplication refuses incompatible or rewound retained allocators without resetting them", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(schema);
    await isolated.exec(migration);
    await isolated.exec("alter sequence projects_home_external_id_seq increment by 2");
    await assert.rejects(isolated.exec(migration), /Incompatible retained allocator/);
    await isolated.exec("rollback; alter sequence projects_home_external_id_seq increment by 1");
    await isolated.exec("select setval('projects_home_external_id_seq', 1, true)");
    await assert.rejects(isolated.exec(migration), /behind current data/);
    await isolated.exec("rollback");
    assert.equal((await isolated.query("select last_value from projects_home_external_id_seq")).rows[0].last_value, 1);
  } finally {
    await isolated.close();
  }
});
