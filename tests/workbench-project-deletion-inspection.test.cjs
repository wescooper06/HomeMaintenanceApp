const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const { schema } = require("./fixtures/workbench-live-schema.cjs");

const folder = path.join(__dirname, "..", "supabase", "review");
const inspection = fs.readFileSync(path.join(folder, "project_deletion_schema_inspection.sql"), "utf8");
const generator = fs.readFileSync(path.join(folder, "project_deletion_dependency_query_generator.sql"), "utf8");

test("project deletion inspection SQL has no mutation or executable definition statements", () => {
  for (const sql of [inspection, generator]) {
    const statements = sql.replace(/--[^\n]*/g, "");
    assert.match(statements, /BEGIN TRANSACTION READ ONLY;/);
    assert.match(statements, /COMMIT;/);
    assert.doesNotMatch(statements, /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE|CALL|DO)\b/im);
    assert.doesNotMatch(statements, /\b(?:nextval|setval|dblink|query_to_xml)\s*\(/i);
  }
});

test("read-only catalog and generated candidate queries run locally without deleting or classifying ownership", async () => {
  const db = new PGlite();
  const id = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(schema);
    await db.exec(`
      create table planner_tasks (id text primary key, project_id text, deleted boolean);
      create table planner_weekly_tasks (id text primary key, metadata_json jsonb, reminder_json jsonb);
      create table planner_parking_lot (id text primary key, converted_to_id text);
      create table project_registry (id uuid primary key, project_id uuid, planner_task_id uuid);
      create table curated_queue ("profileId" text, "taskId" text, item jsonb);
      create table global_snapshots (id text primary key, snapshot jsonb);
      insert into projects_home(id, external_id, title) values ('${id}', 'PA0210', 'Fixture');
      insert into planner_tasks values ('${taskId}', '${id}', true), ('unrelated-task', 'another-project', false);
      insert into planner_weekly_tasks values
        ('owned-weekly', '{"sourceTaskId":"${taskId}"}', '{"active":true}'),
        ('unrelated-weekly', '{}', '{}');
      insert into planner_parking_lot values ('candidate-parking', 'owned-weekly');
      insert into project_registry values
        ('33333333-3333-4333-8333-333333333333', '${id}', '44444444-4444-4444-8444-444444444444');
      insert into planner_tasks values ('44444444-4444-4444-8444-444444444444', null, true);
      insert into curated_queue values ('another-profile', '${taskId}', '{"taskId":"${taskId}"}');
      insert into global_snapshots values ('global', '{"oldProjectId":"${id}"}');
    `);
    const before = await db.query("select * from planner_tasks order by id");
    const catalog = (await db.exec(inspection))[1].rows;
    for (const section of ["relation", "column", "constraint", "index", "table_privilege", "role_effective_privileges"]) {
      assert(catalog.some((row) => row.section === section), section);
    }
    const customized = generator.replace(/SELECT '[0-9a-f-]+'::uuid AS project_id/i,
      `SELECT '${id}'::uuid AS project_id`);
    const generated = (await db.exec(customized))[1].rows[0].inspection_sql;
    const results = (await db.exec(generated))[1].rows;
    assert.equal(results.find((row) => row.section === "identity_check").detail.valid_for_review, true);
    const candidates = results.filter((row) => row.section === "candidate_reference").map((row) => row.detail);
    for (const recordId of [id, taskId, "owned-weekly", "candidate-parking", "global",
      "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"]) {
      assert(candidates.some((row) => row.record_id === recordId), recordId);
    }
    assert(candidates.some((row) => row.relation === "public.curated_queue"
      && row.candidate_row_key.profileId === "another-profile"
      && row.candidate_row_key.taskId === taskId));
    assert(!candidates.some((row) => row.record_id === "unrelated-task" || row.record_id === "unrelated-weekly"));
    assert.deepEqual((await db.query("select * from planner_tasks order by id")).rows, before.rows);
    const mismatch = generated.replace("'home'::text AS project_type", "'vehicle'::text AS project_type");
    const invalid = (await db.exec(mismatch))[1].rows;
    assert.equal(invalid.filter((row) => row.section === "candidate_reference").length, 0);
    assert.equal(invalid.find((row) => row.section === "identity_check").detail.valid_for_review, false);
  } finally {
    await db.close();
  }
});
