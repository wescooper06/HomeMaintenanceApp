const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "supabase", "review", file), "utf8");
const migration = read("202610300002_meals_planner.sql");
const enabled = migration.replace("approved_for_execution boolean := false", "approved_for_execution boolean := true");
const owner = "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60";
const other = "22222222-2222-4222-8222-222222222222";
const recipe = "33333333-3333-4333-8333-333333333333";
const entry = "44444444-4444-4444-8444-444444444444";
let db, before, defaults, recipeCatalog;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function as(role = "postgres", user = "") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`SET ROLE ${role}`);
}
async function snapshot() {
  return Promise.all(["meals_recipes", "meals_shopping_categories", "meals_shopping_items",
    "planner_weekly_tasks", "projects_home", "trips"].map((name) => rows(`SELECT * FROM ${name} ORDER BY id`)));
}
async function rejectsTransaction(sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
  await db.exec("ROLLBACK");
}
test.before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid,is_anonymous boolean,email_confirmed_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users VALUES('${owner}',false,now(),null);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  await db.exec(read("202610280001_meals_recipe_foundation.sql"));
  await db.exec(read("202610300001_meals_shopping.sql")
    .replace("approved_for_execution boolean := false", "approved_for_execution boolean := true"));
  await rows("INSERT INTO meals_recipes(id,title) VALUES($1,'Unchanged Recipe')", [recipe]);
  await db.exec(`INSERT INTO meals_shopping_items(text,checked) VALUES('Unchanged Shopping',true);
    CREATE TABLE planner_weekly_tasks(id text PRIMARY KEY, title text);
    CREATE TABLE projects_home(id text PRIMARY KEY, title text);
    CREATE TABLE trips(id text PRIMARY KEY, title text);
    INSERT INTO planner_weekly_tasks VALUES('unchanged','Task');
    INSERT INTO projects_home VALUES('unchanged','Project');
    INSERT INTO trips VALUES('unchanged','Trip');`);
  before = await snapshot();
  defaults = await rows("SELECT * FROM pg_default_acl ORDER BY oid");
  recipeCatalog = (await rows(read("meals_planner_preflight.sql")))[0].preflight;
});
test.after(async () => { await db?.close(); });

test("P3-DB-001: disabled/identity/collision gates fail closed; additive migration preserves existing data/default ACLs", async () => {
  assert.equal((migration.match(/approved_for_execution boolean := false/g) || []).length, 1);
  assert.doesNotMatch(migration, /SECURITY\s+DEFINER|CREATE\s+EXTENSION|ALTER\s+DEFAULT\s+PRIVILEGES|planner_curated_api|planner_broker_access_token_hook/i);
  const preflight = (await rows(read("meals_planner_preflight.sql")))[0].preflight;
  assert.equal(preflight.executor, "postgres");
  assert.equal(preflight.owner_confirmed, true);
  assert.equal(preflight.recipe_table.owner, "postgres");
  assert.equal(preflight.recipe_table.rls, true);
  assert.deepEqual(preflight.collisions, []);
  await rejectsTransaction(migration, /disabled/);
  assert.equal((await rows("SELECT to_regclass('public.meals_planner_entries') value"))[0].value, null);
  await db.exec("UPDATE auth.users SET is_anonymous=true");
  await rejectsTransaction(enabled, /prerequisites/);
  await db.exec("UPDATE auth.users SET is_anonymous=false; CREATE TABLE meals_planner_collision(id int)");
  await rejectsTransaction(enabled, /collision/);
  await db.exec("DROP TABLE meals_planner_collision");
  await db.exec(`CREATE TRIGGER meals_planner_collision BEFORE DELETE ON meals_recipes
    FOR EACH ROW EXECUTE FUNCTION meals_recipe_before_write()`);
  await rejectsTransaction(enabled, /collision/);
  await db.exec("DROP TRIGGER meals_planner_collision ON meals_recipes");
  await db.exec(enabled);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await rows("SELECT * FROM pg_default_acl ORDER BY oid"), defaults);
  assert.equal((await rows("SELECT count(*)::int n FROM meals_planner_entries"))[0].n, 0);
  await rejectsTransaction(enabled, /collision/);
});

test("ARCH-010/011, DB-SEC-001 through 010: exact owner catalog, minimal column grants and internal invoker functions", async () => {
  const c = (await rows(read("meals_planner_postflight.sql")))[0].verification;
  assert.equal(c.entries, 0);
  assert.deepEqual(c.recipe_table, recipeCatalog.recipe_table);
  assert.equal(c.recipe_triggers.length, 2);
  assert.match(c.recipe_triggers[0], /meals_planner_preserve_recipe BEFORE DELETE/);
  assert.deepEqual(c.recipe_triggers.slice(1), recipeCatalog.recipe_triggers);
  assert.deepEqual(c.relations.map((r) => [r.name, r.kind]), [
    ["meals_planner_entries", "r"], ["meals_planner_entries_insertion_order_key", "i"],
    ["meals_planner_entries_insertion_order_seq", "S"], ["meals_planner_entries_pkey", "i"],
    ["meals_planner_entries_recipe_id_idx", "i"], ["meals_planner_entries_week_idx", "i"],
  ]);
  assert(c.relations.every((r) => r.owner === "postgres"));
  const table = c.relations.find((r) => r.kind === "r");
  assert.equal(table.rls, true);
  assert.equal(table.force_rls, false);
  assert.deepEqual(table.acl, ["postgres=arwdDxtm/postgres", "authenticated=rd/postgres", "service_role=arwd/postgres"]);
  assert.deepEqual(c.relations.find((r) => r.kind === "S").acl, ["postgres=rwU/postgres"]);
  assert.deepEqual(c.columns.map((col) => [col.name, col.type, col.nullable]), [
    ["id", "uuid", "NO"], ["meal_date", "date", "NO"], ["meal_type", "text", "NO"],
    ["recipe_id", "uuid", "YES"], ["display_text", "text", "NO"], ["insertion_order", "bigint", "NO"],
    ["created_at", "timestamp with time zone", "NO"], ["updated_at", "timestamp with time zone", "NO"],
  ]);
  assert.equal(c.columns.find((col) => col.name === "insertion_order").generation, "ALWAYS");
  assert.deepEqual(c.column_grants.filter((g) => g.role === "authenticated" && g.privilege === "INSERT")
    .map((g) => g.column).sort(), ["display_text", "id", "meal_date", "meal_type", "recipe_id"]);
  assert.deepEqual(c.column_grants.filter((g) => g.role === "authenticated" && g.privilege === "UPDATE")
    .map((g) => g.column), ["display_text"]);
  assert(!c.column_grants.some((g) => ["anon", "PUBLIC"].includes(g.role)));
  assert.deepEqual(c.policies.map((p) => p.command).sort(), ["DELETE", "INSERT", "SELECT", "UPDATE"]);
  for (const p of c.policies) {
    assert.deepEqual(p.roles, ["authenticated"]);
    assert.equal(p.permissive, "PERMISSIVE");
    for (const expression of [p.using, p.check].filter(Boolean)) {
      assert.match(expression, /auth\.uid\(\)/);
      assert(expression.includes(owner));
    }
  }
  assert.equal(c.functions.length, 2);
  for (const f of c.functions) {
    assert.equal(f.owner, "postgres");
    assert.equal(f.identity, "");
    assert.equal(f.result, "trigger");
    assert.equal(f.definer, false);
    assert.deepEqual(f.config, ['search_path=""']);
    assert.deepEqual(f.acl, ["postgres=X/postgres"]);
  }
  assert.deepEqual(c.triggers.map((t) => [t.table, t.name, t.enabled]), [
    ["meals_planner_entries", "meals_planner_before_write", "O"],
    ["meals_recipes", "meals_planner_preserve_recipe", "O"],
  ]);
  assert.match(c.triggers[0].definition, /BEFORE INSERT OR UPDATE/);
  assert.match(c.triggers[1].definition, /BEFORE DELETE/);
  assert.equal(c.indexes.length, 4);
  assert(c.indexes.every((i) => i.valid && i.ready && i.live));
  assert.equal(c.constraints.length, 6);
  assert(c.constraints.every((constraint) => constraint.validated));
  assert(c.constraints.some((constraint) => /FOREIGN KEY \(recipe_id\).*ON UPDATE RESTRICT ON DELETE SET NULL/.test(constraint.definition)));
  assert.equal(c.sequence.owner, "postgres");
  assert.equal(c.sequence.type, "bigint");
  for (const p of c.effective_privileges) {
    assert.equal(p.select, p.role !== "anon");
    assert.equal(p.delete, p.role !== "anon");
    assert.equal(p.insert, p.role === "service_role");
    assert.equal(p.update, p.role === "service_role");
    for (const key of ["truncate", "references", "trigger", "sequence_usage", "sequence_select", "sequence_update"]) {
      assert.equal(p[key], false, `${p.role} ${key}`);
    }
  }
});

test("PLAN-DATA-001, PLAN-FUNC-009/010, WP-DATA-001, WP-FUNC-001/002/010: local dates, duplicates, mixed entries and stable insertion order", async () => {
  await as("authenticated", owner);
  await rows(`INSERT INTO meals_planner_entries(id,meal_date,meal_type,recipe_id)
    VALUES($1,'2000-02-29','breakfast',$2)`, [entry, recipe]);
  await rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,recipe_id)
    VALUES('2000-02-29','breakfast',$1)`, [recipe]);
  await rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,display_text)
    VALUES('2000-02-29','breakfast','  Free meal  '),('2099-12-31','lunch','Future'),('2026-10-30','dinner','Today')`);
  const result = await rows(`SELECT *,meal_date::text AS date_key FROM meals_planner_entries ORDER BY insertion_order`);
  assert.deepEqual(result.map((r) => r.display_text), ["Unchanged Recipe", "Unchanged Recipe", "  Free meal  ", "Future", "Today"]);
  assert.deepEqual(result.map((r) => r.date_key), ["2000-02-29", "2000-02-29", "2000-02-29", "2099-12-31", "2026-10-30"]);
  assert.equal(new Set(result.map((r) => r.insertion_order)).size, 5);
  assert(result.every((r) => r.created_at && r.updated_at));
  await rows("UPDATE meals_planner_entries SET display_text='Edited free meal' WHERE recipe_id IS NULL");
  assert.deepEqual(await snapshot(), before);
  await rows("DELETE FROM meals_planner_entries");
  await as();
});

test("WP-VAL-001, PM-FUNC-012: constraints and atomic failures preserve persisted content", async () => {
  await as("authenticated", owner);
  for (const whitespace of ["", " ", "\t\r\n", "\u00a0", "\u2003"]) {
    await assert.rejects(rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,display_text)
      VALUES('2026-10-30','dinner',$1)`, [whitespace]), /check constraint/);
  }
  for (const date of ["2026-02-30", "infinity", "-infinity", "10000-01-01"]) {
    await assert.rejects(rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,display_text)
      VALUES($1,'dinner','Invalid')`, [date]));
  }
  await assert.rejects(rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,display_text)
    VALUES('2026-10-30','snack','Invalid')`), /check constraint/);
  await assert.rejects(rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,recipe_id)
    VALUES('2026-10-30','dinner',$1)`, [other]), /no rows|foreign key/);
  await assert.rejects(rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,display_text)
    VALUES('2026-10-30','dinner','Valid'),('2026-10-30','dinner',' ')`), /check constraint/);
  assert.equal((await rows("SELECT count(*)::int n FROM meals_planner_entries"))[0].n, 0);
  await rows(`INSERT INTO meals_planner_entries(id,meal_date,meal_type,display_text)
    VALUES($1,'2026-10-30','dinner','Keep me')`, [entry]);
  await assert.rejects(rows("UPDATE meals_planner_entries SET display_text=' ' WHERE id=$1", [entry]), /check constraint/);
  assert.equal((await rows("SELECT display_text FROM meals_planner_entries WHERE id=$1", [entry]))[0].display_text, "Keep me");
  await rows("DELETE FROM meals_planner_entries");
  await as();
});

test("PM-FUNC-003/008/009/010/011: remove only occurrence; rename current title; delete atomically preserves editable text", async () => {
  await as("authenticated", owner);
  await db.exec("BEGIN");
  await rows("INSERT INTO meals_recipes(id,title) VALUES($1,'Original title')", [other]);
  await rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,recipe_id)
    VALUES('2026-10-30','dinner',$1),('2026-10-30','dinner',$1),('2026-10-31','lunch',$1)`, [other]);
  const originals = await rows("SELECT * FROM meals_planner_entries ORDER BY insertion_order");
  await rows("DELETE FROM meals_planner_entries WHERE id=$1", [originals[0].id]);
  assert.equal((await rows("SELECT count(*)::int n FROM meals_recipes WHERE id=$1", [other]))[0].n, 1);
  await rows("UPDATE meals_recipes SET title='Current renamed title' WHERE id=$1", [other]);
  const linked = await rows(`SELECT r.title FROM meals_planner_entries e JOIN meals_recipes r ON r.id=e.recipe_id
    WHERE e.recipe_id=$1`, [other]);
  assert.deepEqual(linked.map((r) => r.title), ["Current renamed title", "Current renamed title"]);
  await rows("DELETE FROM meals_recipes WHERE id=$1", [other]);
  const preserved = await rows("SELECT * FROM meals_planner_entries ORDER BY insertion_order");
  assert.equal(preserved.length, 2);
  assert(preserved.every((r) => r.recipe_id === null && r.display_text === "Current renamed title"));
  assert.deepEqual(preserved.map((r) => [r.id, r.created_at, r.insertion_order]),
    originals.slice(1).map((r) => [r.id, r.created_at, r.insertion_order]));
  await rows("UPDATE meals_planner_entries SET display_text='Editable preserved meal' WHERE id=$1", [preserved[0].id]);
  assert.equal((await rows("SELECT display_text FROM meals_planner_entries WHERE id=$1", [preserved[0].id]))[0].display_text, "Editable preserved meal");
  await db.exec("ROLLBACK");
  assert.equal((await rows("SELECT count(*)::int n FROM meals_planner_entries"))[0].n, 0);
  assert.deepEqual(await snapshot(), before);
  await as();
});

test("DB-SEC/SEC-TST: anon, nonowner, absent/malformed subject denied; no internal EXECUTE or direct sequence access", async () => {
  await as("authenticated", owner);
  await rows(`INSERT INTO meals_planner_entries(id,meal_date,meal_type,display_text)
    VALUES($1,'2026-10-30','dinner','Private owner meal')`, [entry]);
  for (const [role, subject] of [["anon", ""], ["authenticated", other], ["authenticated", ""], ["authenticated", "malformed"]]) {
    await as(role, subject);
    const select = () => rows("SELECT * FROM meals_planner_entries");
    if (role === "anon" || subject === "malformed") await assert.rejects(select());
    else assert.deepEqual(await select(), []);
    await assert.rejects(rows(`INSERT INTO meals_planner_entries(meal_date,meal_type,display_text)
      VALUES('2026-10-30','dinner','Denied')`));
    for (const sql of ["UPDATE meals_planner_entries SET display_text='Denied' RETURNING id",
      "DELETE FROM meals_planner_entries RETURNING id"]) {
      if (role === "anon" || subject === "malformed") await assert.rejects(rows(sql));
      else assert.deepEqual(await rows(sql), []);
    }
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    await as(role, owner);
    for (const name of ["meals_planner_before_write", "meals_planner_preserve_recipe"]) {
      await assert.rejects(rows(`SELECT public.${name}()`), /permission denied/);
    }
    await assert.rejects(rows("SELECT nextval('public.meals_planner_entries_insertion_order_seq')"), /permission denied/);
  }
  await as("authenticated", owner);
  for (const assignment of ["id=id", "recipe_id=NULL", "meal_date='2026-10-31'", "meal_type='lunch'",
    "insertion_order=DEFAULT", "created_at=now()", "updated_at=now()"]) {
    await assert.rejects(rows(`UPDATE meals_planner_entries SET ${assignment}`), /permission denied/);
  }
  assert.equal((await rows("SELECT display_text FROM meals_planner_entries"))[0].display_text, "Private owner meal");
  await rows("DELETE FROM meals_planner_entries");
  await as();
  assert.deepEqual(await snapshot(), before);
});

test("DB-DATA-001: operational metadata and insertion order cannot be forged or reordered", async () => {
  await as();
  await rows(`INSERT INTO meals_planner_entries(id,meal_date,meal_type,display_text,created_at,updated_at)
    VALUES($1,'2026-10-30','dinner','Metadata','2000-01-01','2000-01-01')`, [entry]);
  const first = (await rows("SELECT * FROM meals_planner_entries WHERE id=$1", [entry]))[0];
  assert.notEqual(new Date(first.created_at).getUTCFullYear(), 2000);
  await rows("UPDATE meals_planner_entries SET created_at='2001-01-01',updated_at='2001-01-01',display_text='New' WHERE id=$1", [entry]);
  const second = (await rows("SELECT * FROM meals_planner_entries WHERE id=$1", [entry]))[0];
  assert.deepEqual(second.created_at, first.created_at);
  assert.notEqual(new Date(second.updated_at).getUTCFullYear(), 2001);
  await assert.rejects(rows("UPDATE meals_planner_entries SET insertion_order=DEFAULT"), /cannot change/);
  await assert.rejects(rows("UPDATE meals_planner_entries SET id=$1", [other]), /cannot change/);
  await rows("DELETE FROM meals_planner_entries");
  assert.equal((await rows("SELECT count(*)::int n FROM meals_planner_entries"))[0].n, 0);
});

test("P3-DB-001: exact guarded authorization fixture rolls back and independent cleanup is empty", async () => {
  await as();
  const fixture = read("meals_planner_authorization_DISABLED.sql");
  await rejectsTransaction(fixture, /disabled/);
  const result = await db.exec(fixture.replace("approved_for_fixture boolean := false", "approved_for_fixture boolean := true"));
  assert(result.some((part) => part.rows.some((row) => row.fixture_result === "PASS - ROLLBACK follows")));
  const cleanup = (await rows(read("meals_planner_postflight.sql")))[0].verification;
  assert.equal(cleanup.entries, 0);
  assert.equal(cleanup.fixture_recipes, 0);
  assert.equal(cleanup.fixture_entries, 0);
  assert.deepEqual(await snapshot(), before);
});
