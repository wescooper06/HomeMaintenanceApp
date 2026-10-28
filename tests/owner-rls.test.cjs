const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const wrong = "22222222-2222-4222-8222-222222222222";
const cutover = read("supabase\\review\\owner-auth-cutover.sql");
const configuredOwner = "owner_uuid uuid := 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'";
const enabledCutover = (id = owner) => cutover
  .replace("approved_for_execution boolean := false", "approved_for_execution boolean := true")
  .replace(configuredOwner, `owner_uuid uuid := '${id}'`);
const legacy = ["project_registry", "projects", "repeatable_masters", "repeatable_overrides", "task_manager", "weekly_tasks",
  "curated_queue", "parking_lot", "planner_profiles", "staged_queue"];
const active = ["planner_tasks", "planner_weekly_tasks", "planner_parking_lot", "projects_home", "projects_vehicle",
  "projects_repeating", "projects_misc", "activity_types", "activity_rules", "activity_weekly_grid",
  "trips", "trips_workflow_metadata", "trips_timeline"];
let db, rollback, originalDefaults, originalColumnAcls, originalManagedCatalog;
async function managedCatalog() {
  return (await db.query(`SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text
    FROM pg_default_acl WHERE defaclrole='supabase_admin'::regrole
      AND defaclobjtype IN ('r','f','S') AND defaclnamespace IN (0,'public'::regnamespace)
    ORDER BY defaclnamespace,defaclobjtype`)).rows;
}
async function defaultBrowserGrants() {
  return (await db.query(`
    SELECT r.rolname,t.kind,s.ns,a.grantee,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee_name,
      a.privilege_type,a.is_grantable
    FROM pg_roles r
    CROSS JOIN (VALUES ('r'),('f'),('S')) t(kind)
    CROSS JOIN (VALUES (0::oid),('public'::regnamespace::oid)) s(ns)
    LEFT JOIN pg_default_acl d ON d.defaclrole=r.oid
      AND d.defaclobjtype=t.kind::"char" AND d.defaclnamespace=s.ns
    CROSS JOIN LATERAL aclexplode(COALESCE(d.defaclacl,
      CASE WHEN s.ns=0 THEN acldefault(t.kind::"char",r.oid) ELSE '{}'::aclitem[] END)) a
    WHERE r.rolname IN ('postgres','supabase_admin')
    ORDER BY r.rolname,t.kind,s.ns,a.grantee,a.privilege_type`)).rows;
}
async function columnAcls() {
  return (await db.query(`SELECT c.relname,a.attname,a.attacl::text FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND a.attacl IS NOT NULL ORDER BY c.relname,a.attname`)).rows;
}
async function as(role, id = "") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`SET ROLE ${role}`);
}
async function denied(sql) { await assert.rejects(db.exec(sql), /permission denied|row-level security|Owner authorization/i); }

test.before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_admin; CREATE ROLE planner_curated_api;
    GRANT CREATE ON SCHEMA public TO supabase_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key,is_anonymous boolean,email_confirmed_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users VALUES('${owner}',false,now(),null);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
  `);
  await db.exec(read("tests\\fixtures\\workbench-schema.sql"));
  await db.exec(read("supabase\\migrations\\202610230001_planner_remaining_state.sql"));
  for (const table of legacy.slice(0, 6)) await db.exec(`CREATE TABLE public.${table}(id text primary key);`);
  await db.exec(`
    CREATE TABLE activity_types(id text primary key, name text);
    CREATE TABLE activity_rules(id uuid primary key DEFAULT gen_random_uuid(), days text, notes text);
    CREATE TABLE activity_weekly_grid(day text, time time, rule_id uuid);
    CREATE TABLE trips(id uuid primary key DEFAULT gen_random_uuid(), destination text);
    CREATE TABLE trips_workflow_metadata(trip_id uuid primary key, stage text);
    CREATE TABLE trips_timeline(year integer, month text, notes text, UNIQUE(year,month));
    INSERT INTO activity_types VALUES('work','Work');
    INSERT INTO planner_weekly_tasks(id,metadata_json) VALUES('week-settings','{"weekStartDate":"2026-10-26"}');
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
  `);
  await db.exec(read("supabase\\review\\202610250001_project_creation.sql"));
  await db.exec(read("supabase\\review\\202610250002_project_deletion.sql"));
  await db.exec(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT SELECT (deleted,id,metadata_json,project_id,project_registry_id,source,updated_at)
      ON planner_tasks TO planner_curated_api;
    GRANT SELECT (bucket,checklist_json,completed,date,deleted,deleted_instance,id,metadata_json,
      occurrence_date,overridden,parent_rep,project_id,source,task_type,time_slot,updated_at)
      ON planner_weekly_tasks TO planner_curated_api;
    GRANT SELECT (external_id,id,updated_at) ON projects_home TO planner_curated_api;`);
  for (const creator of ["postgres", "supabase_admin"]) {
    for (const type of ["TABLES", "FUNCTIONS", "SEQUENCES"]) {
      await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${creator} IN SCHEMA public
        GRANT ALL ON ${type} TO anon,authenticated,service_role;`);
    }
    // Match accepted managed creator ACLs, including its non-owner postgres grant.
    for (const type of ["TABLES", "FUNCTIONS", "SEQUENCES"]) {
      await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        GRANT ALL ON ${type} TO postgres;`);
    }
  }
  originalDefaults = await defaultBrowserGrants();
  originalManagedCatalog = await managedCatalog();
  originalColumnAcls = await columnAcls();
  assert.equal(originalColumnAcls.length, 26);
  const contents = async () => Promise.all([...active, ...legacy].map(async (table) =>
    (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`)).rows[0]));
  const before = await contents();
  const serviceGrants = async () => (await db.query(`
    SELECT c.relname AS identity,a.privilege_type,a.is_grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname='public' AND a.grantee='service_role'::regrole
    UNION ALL SELECT p.oid::regprocedure::text,a.privilege_type,a.is_grantable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE n.nspname='public' AND a.grantee='service_role'::regrole
    ORDER BY identity,privilege_type`)).rows;
  const originalServiceGrants = await serviceGrants();
  const capture = await db.query(read("supabase\\review\\owner-auth-rollback-capture.sql"));
  rollback = capture.rows.map((row) => row.rollback_sql).join("\n");
  assert.match(rollback, /relations=24 \(expect 24\); functions=5 \(expect 5\); sequences=4/);
  assert.match(rollback, /scopes=6 \(expect 6/);
  assert(!rollback.includes("ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin"));
  await assert.rejects(db.exec(cutover), /Owner cutover blocked/);
  await db.exec("ROLLBACK");
  await assert.rejects(db.exec(rollback), /Rollback disabled/);
  await db.exec("ROLLBACK");
  await assert.rejects(db.exec(enabledCutover(wrong)), /human Auth identity required/);
  await db.exec("ROLLBACK");
  // Reject changed ACLs, including a global catalog row replacing implicit defaults.
  for (const type of ["TABLES", "FUNCTIONS", "SEQUENCES"]) {
    for (const scope of ["", " IN SCHEMA public"]) {
      await db.exec(`BEGIN; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin${scope}
        GRANT ALL ON ${type} TO planner_curated_api;`);
      await assert.rejects(db.exec(enabledCutover()), /Managed default evidence drift/);
      await db.exec("ROLLBACK");
    }
  }
  await db.exec(enabledCutover());
  assert.deepEqual(await contents(), before, "Cutover must not change any application rows");
  assert.deepEqual(await serviceGrants(), originalServiceGrants, "All service-role ACL entries must remain unchanged");
  assert.deepEqual(await columnAcls(), originalColumnAcls, "Acknowledged broker column ACLs must remain unchanged");
  const browserDefault = (entry) => ["PUBLIC", "anon", "authenticated"].includes(entry.grantee_name);
  const hardenedDefaults = await defaultBrowserGrants();
  assert.deepEqual(hardenedDefaults.filter((entry) => entry.rolname === "postgres" && browserDefault(entry)), []);
  assert.deepEqual(hardenedDefaults.filter((entry) => entry.rolname === "supabase_admin"),
    originalDefaults.filter((entry) => entry.rolname === "supabase_admin"), "All managed scopes remain unchanged");
  assert.deepEqual(await managedCatalog(), originalManagedCatalog, "Stored managed ACL rows must remain identical");
  assert.deepEqual(hardenedDefaults.filter((entry) => !browserDefault(entry)),
    originalDefaults.filter((entry) => !browserDefault(entry)), "Administrative defaults must remain unchanged");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policy")).rows[0].n, 47);
});
test.after(async () => { await db?.close(); });

test("anon cannot read or mutate any application/legacy relation or execute any of five RPCs", async () => {
  await as("anon");
  for (const table of [...active, ...legacy, "projects_all"]) {
    await denied(`SELECT * FROM public.${table}`);
    if (table !== "projects_all") await denied(`DELETE FROM public.${table}`);
    else assert.equal((await db.query(
      "SELECT has_table_privilege('anon','projects_all','DELETE') AS allowed")).rows[0].allowed, false);
  }
  for (const call of [
    "create_workbench_project('misc','{\"title\":\"Denied\"}')",
    `delete_workbench_project('${owner}','misc')`,
    "replace_planner_curated_queue('default','[]')",
    "enqueue_planner_staged_task('default','x','{}')",
    "import_planner_legacy_state('default','{}')",
  ]) await denied(`SELECT public.${call}`);
  await denied("INSERT INTO planner_weekly_tasks(id) VALUES('anon')");
  await denied("UPDATE planner_weekly_tasks SET title='Denied'");
});
test("wrong authenticated user has no visible owner rows or successful inserts; view respects RLS", async () => {
  await as("authenticated", wrong);
  for (const table of active) {
    assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 0);
    assert.equal((await db.query(`DELETE FROM ${table} RETURNING *`).catch((error) => {
      assert.match(error.message, /permission denied/); return { rows: [] };
    })).rows.length, 0);
    const column = table === "activity_weekly_grid" ? "day"
      : table === "trips_timeline" ? "year" : table === "trips_workflow_metadata" ? "trip_id" : "id";
    assert.equal((await db.query(`UPDATE ${table} SET ${column}=${column} RETURNING *`).catch((error) => {
      assert.match(error.message, /permission denied/); return { rows: [] };
    })).rows.length, 0);
  }
  assert.equal((await db.query("SELECT * FROM projects_all")).rows.length, 0);
  await denied("INSERT INTO planner_weekly_tasks(id) VALUES('wrong')");
  await denied("SELECT create_workbench_project('misc','{\"title\":\"Denied\"}')");
  await denied(`SELECT delete_workbench_project('${owner}','misc')`);
  for (const statement of [
    "INSERT INTO planner_tasks(title) VALUES('Denied')",
    "INSERT INTO planner_parking_lot(id) VALUES('wrong')",
    "INSERT INTO projects_home(title) VALUES('Denied')",
    "INSERT INTO projects_vehicle(title) VALUES('Denied')",
    "INSERT INTO projects_repeating(title) VALUES('Denied')",
    "INSERT INTO projects_misc(title) VALUES('Denied')",
    "INSERT INTO activity_types(id) VALUES('wrong')",
    "INSERT INTO activity_rules(days) VALUES('Mon')",
    "INSERT INTO activity_weekly_grid(day,time) VALUES('Mon','09:00')",
    "INSERT INTO trips(destination) VALUES('Denied')",
    `INSERT INTO trips_workflow_metadata(trip_id) VALUES('${wrong}')`,
    "INSERT INTO trips_timeline(year,month) VALUES(2026,'October')",
  ]) await denied(statement);
});
test("owner Planner contracts preserve checklist and source identity through update, tombstone, and restore", async () => {
  await as("authenticated", owner);
  const task = (await db.query(`INSERT INTO planner_tasks(title,metadata_json) VALUES
    ('Synthetic','{"checklistTemplate":{"version":1,"items":[{"id":"a","text":"Keep"}]}}') RETURNING id`)).rows[0];
  await db.query(`INSERT INTO planner_weekly_tasks(id,date,time_slot,checklist_json,metadata_json)
    VALUES('owner-week','2026-10-26','morning','[{"id":"a","text":"Keep","completed":true}]',$1)`,
  [{ sourceTaskId: task.id }]);
  await db.exec(`UPDATE planner_weekly_tasks SET date='2026-11-02', time_slot='evening' WHERE id='owner-week';
    UPDATE planner_weekly_tasks SET deleted=true,deleted_instance=true WHERE id='owner-week';
    UPDATE planner_weekly_tasks SET deleted=false,deleted_instance=false WHERE id='owner-week';
    INSERT INTO planner_parking_lot(id,title) VALUES('owner-idea','Idea');
    UPDATE planner_parking_lot SET deleted=true WHERE id='owner-idea';
    UPDATE planner_weekly_tasks SET metadata_json='{"weekStartDate":"2026-11-02"}' WHERE id='week-settings';`);
  const row = (await db.query("SELECT * FROM planner_weekly_tasks WHERE id='owner-week'")).rows[0];
  assert.equal(row.checklist_json[0].completed, true);
  assert.equal(row.metadata_json.sourceTaskId, task.id);
});
test("owner creates/deletes all four project types using invoker RPC with RLS enabled", async () => {
  await as("authenticated", owner);
  for (const kind of ["home", "vehicle", "repeating", "misc"]) {
    const created = (await db.query("SELECT create_workbench_project($1,$2) AS p",
      [kind, { title: "Synthetic", ...(kind === "repeating" ? { recurrence: "weekly" } : {}) }])).rows[0].p;
    await db.query("INSERT INTO planner_tasks(project_id,source) VALUES($1,$2)", [created.id, kind]);
    await db.query("INSERT INTO planner_weekly_tasks(id,project_id) VALUES($1,$2)", [`owned-${kind}`, created.id]);
    assert.equal((await db.query("SELECT * FROM projects_all WHERE id=$1", [created.id])).rows.length, 1);
    const result = (await db.query("SELECT delete_workbench_project($1,$2) AS summary", [created.id, kind])).rows[0].summary;
    assert.equal(result.deleted, true);
    assert.equal(result.counts.planner_tasks, 1);
    assert.equal(result.counts.planner_weekly_tasks, 1);
  }
});
test("Activities support rules and SELECT/DELETE/INSERT grid regeneration, but types are read-only", async () => {
  await as("authenticated", owner);
  await db.exec(`INSERT INTO activity_rules(days) VALUES('Mon');
    UPDATE activity_rules SET notes='Owner edit';
    DELETE FROM activity_weekly_grid WHERE day IS NOT NULL;
    INSERT INTO activity_weekly_grid(day,time) VALUES('Mon','09:00');
    DELETE FROM activity_rules;`);
  assert.equal((await db.query("SELECT * FROM activity_types")).rows.length, 1);
  assert.equal((await db.query("SELECT * FROM activity_weekly_grid")).rows.length, 1);
  await denied("UPDATE activity_types SET name='Denied'");
  await denied("UPDATE activity_weekly_grid SET day='Tue'");
});
test("Trips required operations succeed; shared timeline DELETE and elevated privileges remain denied", async () => {
  await as("authenticated", owner);
  await db.exec(`INSERT INTO trips(id,destination) VALUES('${owner}','Local');
    UPDATE trips SET destination='Updated';
    INSERT INTO trips_workflow_metadata(trip_id,stage) VALUES('${owner}','Plan');
    UPDATE trips_workflow_metadata SET stage='Done';
    INSERT INTO trips_timeline(year,month) VALUES(2026,'October') ON CONFLICT DO NOTHING;
    UPDATE trips_timeline SET notes='Owner';
    DELETE FROM trips_workflow_metadata; DELETE FROM trips;`);
  await denied("DELETE FROM trips_timeline");
  for (const table of active) await denied(`TRUNCATE ${table}`);
  for (const table of legacy) {
    await denied(`SELECT * FROM ${table}`);
    await denied(`DELETE FROM ${table}`);
  }
});
test("null uid/logout loses row access, service_role retains privileges, and review SQL stays gated", async () => {
  await as("authenticated");
  assert.equal((await db.query("SELECT * FROM planner_weekly_tasks")).rows.length, 0);
  await denied("INSERT INTO trips(destination) VALUES('Denied')");
  await as("postgres");
  assert.equal((await db.query(`SELECT has_table_privilege('service_role','planner_tasks','SELECT') AS permitted`)).rows[0].permitted, true);
  assert.equal((await db.query(`SELECT has_function_privilege('service_role',
    'delete_workbench_project(uuid,text)','EXECUTE') AS permitted`)).rows[0].permitted, true);
  assert.match(cutover, /approved_for_execution boolean := false/);
  assert(cutover.includes(configuredOwner));
  const results = await db.exec(read("supabase\\review\\owner-auth-verification.sql"));
  const scopes = results.find((result) => result.rows.some((row) => row.status === "POSTGRES_DEFAULTS_HARDENED"));
  assert.equal(scopes.rows.filter((row) => row.status === "POSTGRES_DEFAULTS_HARDENED").length, 6);
  assert.equal(scopes.rows.filter((row) => row.status === "RESIDUAL_MANAGED_DEFAULT_EXPOSURE").length, 6);
  const evidence = results.find((result) => result.rows.some((row) => "matches_accepted_evidence" in row));
  assert.equal(evidence.rows.length, 6);
  assert(evidence.rows.every((row) => row.matches_accepted_evidence));
});
test("future postgres objects are closed; managed-created objects retain explicitly reported residual exposure", async () => {
  await as("postgres");
  for (const creator of ["postgres", "supabase_admin"]) {
    await db.exec(`SET ROLE ${creator};
      CREATE TABLE public.future_${creator}(id integer);
      CREATE SEQUENCE public.future_${creator}_seq;
      CREATE FUNCTION public.future_${creator}() RETURNS integer LANGUAGE sql AS 'SELECT 1';
      RESET ROLE;`);
    for (const role of ["anon", "authenticated"]) {
      const permissions = (await db.query(`SELECT
        has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_access,
        has_sequence_privilege($1,$3,'USAGE,SELECT,UPDATE') AS sequence_access,
        has_function_privilege($1,$4,'EXECUTE') AS function_access`,
      [role, `future_${creator}`, `future_${creator}_seq`, `future_${creator}()`])).rows[0];
      const exposed = creator === "supabase_admin";
      assert.deepEqual(permissions, { table_access: exposed, sequence_access: exposed, function_access: exposed });
    }
    assert.equal((await db.query("SELECT has_function_privilege('service_role',$1,'EXECUTE') AS permitted",
      [`future_${creator}()`])).rows[0].permitted, true);
    await db.exec(`DROP TABLE future_${creator}; DROP SEQUENCE future_${creator}_seq; DROP FUNCTION future_${creator}();`);
  }
});
test("captured rollback restores old policies, RLS flags, invoker definition, browser grants and defaults", async () => {
  await as("postgres");
  await db.exec(rollback.replace("IF NOT false THEN", "IF NOT true THEN"));
  assert.equal((await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='planner_tasks'::regclass`)).rows[0].relrowsecurity, false);
  assert.equal((await db.query(`SELECT has_table_privilege('anon','planner_tasks','SELECT') AS permitted`)).rows[0].permitted, true);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_policy WHERE polname='planner_shared_parking'`)).rows[0].n, 1);
  assert.match((await db.query(`SELECT pg_get_functiondef('delete_workbench_project(uuid,text)'::regprocedure) AS d`)).rows[0].d,
    /Project deletion requires a new review after modern-table RLS changes/);
  assert.deepEqual(await defaultBrowserGrants(), originalDefaults, "Global built-ins and public-schema defaults must reconstruct exactly");
  assert.deepEqual(await columnAcls(), originalColumnAcls);
  assert.deepEqual(await managedCatalog(), originalManagedCatalog, "Rollback cannot change managed default rows");
});
