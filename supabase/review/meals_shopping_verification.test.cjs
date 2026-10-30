const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { PGlite } = require("@electric-sql/pglite");
const { canonical, verifyPostflight, verifyCleanup, verifyAuthorization, verifySnapshot,
  verifyPreservation, preservationDifferences } = require("./meals_shopping_verify.cjs");

const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const candidate = fs.readFileSync(path.join(__dirname, "202610300001_meals_shopping.sql"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const enabled = (sql, gate) => {
  const marker = `${gate} boolean := false`;
  assert.equal(sql.split(marker).length - 1, 1);
  return sql.replace(marker, `${gate} boolean := true`);
};
let db, before;
async function result(sql, key, database = db) {
  const results = await database.exec(sql);
  const matches = results.flatMap((entry) => entry.rows).filter((row) => row[key] !== undefined);
  assert.equal(matches.length, 1, `Expected one ${key} result`);
  return matches[0][key];
}
const snapshot = () => result(read("meals_shopping_preservation.sql"), "preservation");
const postflight = () => result(read("meals_shopping_postflight.sql"), "verification");
const cleanup = () => result(read("meals_shopping_fixture_cleanup.sql"), "cleanup");

test.before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid,is_anonymous boolean,email_confirmed_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users VALUES('e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60',false,now(),null);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  await db.exec(read("202610280001_meals_recipe_foundation.sql"));
  await db.exec("INSERT INTO public.meals_recipes(title,source) VALUES('private_recipe_marker','private_source_marker')");
  await db.exec(fs.readFileSync(path.join(__dirname, "..", "migrations", "202610230001_planner_remaining_state.sql"), "utf8"));
  await db.exec(`CREATE TABLE public.planner_tasks(id text PRIMARY KEY, title text, updated_at timestamptz DEFAULT now());
    INSERT INTO public.planner_tasks VALUES('local_planner_fixture','private_planner_marker',now());
    CREATE TABLE public.projects_home(id uuid PRIMARY KEY,title text);
    CREATE VIEW public.projects_all AS SELECT * FROM public.projects_home;
    CREATE TABLE public.activity_rules(id uuid PRIMARY KEY,notes text);
    INSERT INTO public.activity_rules VALUES(gen_random_uuid(),'private_activity_marker');`);
  for (const name of ["project_registry", "projects", "repeatable_masters", "repeatable_overrides", "task_manager", "weekly_tasks"]) {
    await db.exec(`CREATE TABLE public.${name}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payload jsonb);
      INSERT INTO public.${name}(payload) VALUES('{"private":"not exported"}');`);
  }
  await db.exec(`CREATE TYPE public.local_status AS ENUM ('ready','done');
    CREATE DOMAIN public.local_positive AS integer CHECK(VALUE>0);
    CREATE TABLE public."Odd ""table" (
      identity_id bigint GENERATED ALWAYS AS IDENTITY,
      part_a integer,part_b uuid,ts timestamptz,raw json,doc jsonb,values integer[],
      nullable text,computed integer GENERATED ALWAYS AS (part_a+1) STORED,
      status public.local_status,amount public.local_positive,PRIMARY KEY(part_a,part_b));
    INSERT INTO public."Odd ""table"(part_a,part_b,ts,raw,doc,values,status,amount)
      VALUES(1,gen_random_uuid(),'2026-10-30T12:00:00-07','{ "a": 1 }','{"b":[null,true]}',ARRAY[1,NULL,3],'ready',2);
    CREATE TABLE public.no_primary_key(value text);
    INSERT INTO public.no_primary_key VALUES('duplicate'),('duplicate'),(NULL);
    CREATE TABLE public.empty_table(id uuid);
    CREATE TABLE public.partition_root(id integer) PARTITION BY RANGE(id);
    CREATE TABLE public.partition_child PARTITION OF public.partition_root FOR VALUES FROM(0) TO(10);
    INSERT INTO public.partition_root VALUES(1);
    CREATE MATERIALIZED VIEW public.local_materialized AS SELECT * FROM public.no_primary_key;
    CREATE FUNCTION public.local_identity(value integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT value';
    CREATE FUNCTION public.local_trigger() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
    CREATE TRIGGER local_before BEFORE UPDATE ON public.project_registry FOR EACH ROW EXECUTE FUNCTION public.local_trigger();
    CREATE INDEX local_payload_idx ON public.projects USING gin(payload);`);
  before = await snapshot();
  await db.exec(enabled(candidate.toString("utf8"), "approved_for_execution"));
});
test.after(async () => { await db?.close(); });

test("immutable candidate hashes and exact fresh-install catalog", async () => {
  assert.equal(sha256(candidate), "f7d436dd8b4102c9a57a3dbf9b81abfdf3c5d3b85ea616aa9321df08cb75e768");
  assert.equal(sha256(enabled(candidate.toString("utf8"), "approved_for_execution")),
    "d42fe15d0f187fffd4376af50371577d8bcfabf82e3d08d154f7c1d674ea3ea9");
  verifyPostflight(await postflight());
  verifyCleanup(await cleanup());
});

test("read-only preservation captures Recipe/Planner/Activity/legacy objects without row content", async () => {
  verifySnapshot(before);
  assert(before.objects.some((entry) => entry.name === "planner_tasks"));
  assert(before.objects.some((entry) => entry.name === "activity_rules"));
  assert(before.objects.some((entry) => entry.name === "curated_queue"));
  assert(before.objects.some((entry) => entry.name === "projects_all"));
  assert(before.functions.some((entry) => entry.name === "replace_planner_curated_queue"));
  assert.doesNotMatch(JSON.stringify(before), /private_recipe_marker|private_source_marker|private_planner_marker|private_activity_marker/);
  verifyPreservation(before, await snapshot());
  await assert.rejects(db.exec("BEGIN READ ONLY; INSERT INTO planner_tasks(id) VALUES('forbidden')"), /read-only/);
  await db.exec("ROLLBACK");
});

test("guarded role/RLS fixtures pass only inside rollback and leave no rows/settings", async () => {
  const original = read("meals_shopping_authorization_DISABLED.sql");
  const settings = (await db.query("SELECT current_user, current_setting('request.jwt.claim.sub',true) AS sub")).rows;
  await assert.rejects(db.exec(original), /disabled/);
  await db.exec("ROLLBACK");
  verifyCleanup(await cleanup());
  const authorization = await result(enabled(original, "approved_for_fixture_verification"), "authorization");
  verifyAuthorization(authorization);
  verifyCleanup(await cleanup());
  verifyPostflight(await postflight());
  const restored = (await db.query("SELECT current_user, nullif(current_setting('request.jwt.claim.sub',true),'') AS sub")).rows;
  assert.deepEqual(restored, settings.map((row) => ({ ...row, sub: row.sub || null })));
});

test("authorization fails closed on a permissive policy and rollback restores catalog", async () => {
  await db.exec("CREATE POLICY unexpected_browser_read ON meals_shopping_items FOR SELECT TO authenticated USING (true)");
  try {
    await assert.rejects(db.exec(enabled(read("meals_shopping_authorization_DISABLED.sql"),
      "approved_for_fixture_verification")), /Unauthorized rows visible/);
    await db.exec("ROLLBACK");
    verifyCleanup(await cleanup());
  } finally {
    await db.exec("DROP POLICY unexpected_browser_read ON meals_shopping_items");
  }
  verifyPostflight(await postflight());
});

test("fixture fresh-install gate refuses pre-existing owner content without deleting it", async () => {
  await db.exec("INSERT INTO meals_shopping_items(text) VALUES('local pre-existing owner content')");
  try {
    await assert.rejects(db.exec(enabled(read("meals_shopping_authorization_DISABLED.sql"),
      "approved_for_fixture_verification")), /Fresh-install/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM meals_shopping_items")).rows[0].n, 1);
  } finally { await db.exec("DELETE FROM meals_shopping_items WHERE text='local pre-existing owner content'"); }
  verifyCleanup(await cleanup());
});

test("count, policy, column ACL, function, trigger and namespace drift are all rejected", async () => {
  const changes = [
    "INSERT INTO meals_shopping_items(text) VALUES('unexpected item')",
    "INSERT INTO meals_shopping_categories(name) VALUES('unexpected custom')",
    "ALTER POLICY meals_shopping_items_owner_select ON meals_shopping_items USING (true)",
    "GRANT SELECT ON meals_shopping_items TO PUBLIC",
    "GRANT UPDATE(checked) ON meals_shopping_items TO anon",
    "GRANT UPDATE(checked) ON meals_shopping_items TO authenticated WITH GRANT OPTION",
    "GRANT TRUNCATE ON meals_shopping_items TO service_role",
    "ALTER FUNCTION meals_shopping_before_write() SECURITY DEFINER",
    "ALTER FUNCTION meals_shopping_before_write() SET search_path=public",
    "GRANT EXECUTE ON FUNCTION meals_shopping_before_write() TO authenticated",
    "ALTER TABLE meals_shopping_items DISABLE TRIGGER meals_shopping_before_write",
    "ALTER TABLE meals_shopping_items DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE meals_shopping_items ALTER COLUMN checked SET DEFAULT true",
    "ALTER TABLE meals_shopping_items DROP CONSTRAINT meals_shopping_items_text_check",
    `ALTER TABLE meals_shopping_items DROP CONSTRAINT meals_shopping_items_category_id_fkey;
      ALTER TABLE meals_shopping_items ADD CONSTRAINT meals_shopping_items_category_id_fkey
      FOREIGN KEY(category_id) REFERENCES meals_shopping_categories(id) ON DELETE CASCADE`,
    `ALTER TABLE meals_shopping_categories DISABLE TRIGGER meals_shopping_before_write;
      UPDATE meals_shopping_categories SET name='unexpected seed name' WHERE predefined_order=1`,
    "CREATE FUNCTION meals_shopping_unexpected_rpc() RETURNS int LANGUAGE sql AS 'SELECT 1'",
    "CREATE TABLE meals_shopping_unexpected(id int)",
    "DROP INDEX meals_shopping_items_category_id_idx",
  ];
  for (const change of changes) {
    await db.exec(`BEGIN; ${change}`);
    try {
      const actual = await postflight();
      assert.throws(() => verifyPostflight(actual), /mismatch/, change);
    } finally { await db.exec("ROLLBACK"); }
  }
  verifyPostflight(await postflight());
});

test("preservation catches same-count content, policy, ACL, view and Planner changes", async () => {
  for (const change of [
    "UPDATE meals_recipes SET source='changed' WHERE title='private_recipe_marker'",
    "UPDATE planner_tasks SET title='changed' WHERE id='local_planner_fixture'",
    "ALTER TABLE planner_tasks ADD COLUMN unexpected text",
    "GRANT SELECT ON meals_recipes TO anon",
    "ALTER POLICY meals_recipes_owner_select ON meals_recipes USING (true)",
    "CREATE OR REPLACE VIEW projects_all AS SELECT * FROM projects_home WHERE false",
    "INSERT INTO public.projects(payload) VALUES('{}')",
    "DELETE FROM public.repeatable_masters",
    "UPDATE public.repeatable_overrides SET payload='{\"changed\":true}'",
    "UPDATE public.task_manager SET payload='{\"changed\":true}'",
    "UPDATE public.weekly_tasks SET payload='{\"changed\":true}'",
    "DROP INDEX public.local_payload_idx",
    "ALTER TABLE public.project_registry DISABLE TRIGGER local_before",
    "CREATE OR REPLACE FUNCTION public.local_identity(value integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT value+1'",
    "DROP TABLE public.empty_table",
    "CREATE TABLE public.unexpected_nonshopping(id integer)",
    "ALTER TYPE public.local_status ADD VALUE 'unexpected'",
    "UPDATE public.\"Odd \"\"table\" SET raw='{  \"a\": 1  }'",
  ]) {
    await db.exec(`BEGIN; ${change}`);
    try {
      const query = read("meals_shopping_preservation.sql")
        .replace("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;", "")
        .replace(/ROLLBACK;\s*$/, "");
      const after = await result(query, "preservation");
      assert(preservationDifferences(before, after).length>0, change);
      // Only this negative-test input is synthetic; production snapshots must prove READ ONLY.
      assert.throws(() => verifyPreservation(before, { ...after, read_only: "on" }), /preservation mismatch/);
    } finally { await db.exec("ROLLBACK"); }
  }
  verifyPreservation(before, await snapshot());
});

test("offline CLI accepts complete exports and refuses incomplete or drifting results", async () => {
  const file = path.join(os.tmpdir(), `shopping-verification-${crypto.randomUUID()}.json`);
  const script = path.join(__dirname, "meals_shopping_verify.cjs");
  try {
    for (const [mode, key, value] of [
      ["postflight", "verification", await postflight()],
      ["cleanup", "cleanup", await cleanup()],
      ["snapshot", "preservation", before],
    ]) {
      fs.writeFileSync(file, JSON.stringify([{ [key]: value }]));
      const child = spawnSync(process.execPath, [script, mode, file], { encoding: "utf8" });
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /PASS:/);
    }
    fs.writeFileSync(file, JSON.stringify({ verification: { counts: {} } }));
    const invalid = spawnSync(process.execPath, [script, "postflight", file], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /STOP:/);
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
});

test("generic discovery covers all public objects, not arbitrary managed schemas", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';
      CREATE TABLE meals_recipes(id uuid); CREATE TABLE meals_recipe_categories(id uuid);
      CREATE TABLE meals_recipe_cuisines(id uuid);`);
    const empty = await result(read("meals_shopping_preservation.sql"), "preservation", isolated);
    verifySnapshot(empty);
    assert.equal(empty.objects.length, 3);
    assert.deepEqual(empty.functions, []);
    await isolated.exec("CREATE SCHEMA isolated; CREATE TABLE isolated.meals_planner_future(id uuid)");
    const present = await result(read("meals_shopping_preservation.sql"), "preservation", isolated);
    assert(!present.objects.some((entry) => entry.schema === "isolated"));
    assert.deepEqual(canonical(empty), canonical(present));
  } finally { await isolated.close(); }
});

test("inventory completeness rejects omitted relations/functions/types and unjustified exclusions", async () => {
  for (const [field, name] of [["objects", "project_registry"], ["functions", "local_identity"], ["types", "local_status"]]) {
    const incomplete = structuredClone(before);
    incomplete[field] = incomplete[field].filter((object) => object.name !== name);
    assert.throws(() => verifySnapshot(incomplete), /Missing\/unexpected.*fingerprints/);
  }
  const excluded = structuredClone(before);
  excluded.objects = excluded.objects.filter((object) => object.name !== "projects");
  excluded.exclusions.push({ class: "relation", schema: "public", name: "projects", identity: "r", reason: "unclear ownership" });
  assert.throws(() => verifySnapshot(excluded), /Unjustified exclusion/);
  const unsupported = structuredClone(before);
  unsupported.uncovered.push({ schema: "public", name: "unsafe_foreign", kind: "f" });
  assert.throws(() => verifySnapshot(unsupported), /Uncovered/);
});

test("generic data representation covers duplicates, empty rows, quoted identifiers and complex types", async () => {
  const find = (name) => before.objects.find((object) => object.name === name);
  assert.equal(find("no_primary_key").data.rows, "3");
  assert.equal(find("empty_table").data.rows, "0");
  assert.equal(find("partition_root").data.rows, "1");
  assert.equal(find("partition_child").data.rows, "1");
  assert.equal(find("local_materialized").data.rows, "3");
  assert.equal(find('Odd "table').data.rows, "1");
  assert(before.types.some((object) => object.name === "local_status"));
  assert(before.types.some((object) => object.name === "local_positive"));
  const first = await snapshot();
  await db.exec("SET timezone='Pacific/Honolulu'; SET datestyle='SQL, DMY'; SET intervalstyle='sql_standard'");
  const last = await snapshot();
  assert.deepEqual(canonical(first), canonical(last));
  assert.doesNotMatch(read("meals_shopping_preservation.sql"), /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/i);
});
