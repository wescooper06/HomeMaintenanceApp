const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { schema } = require("./fixtures/workbench-live-schema.cjs");

const root = path.resolve(__dirname, "..");
const review = path.join(root, "supabase", "review");
const migration = fs.readFileSync(path.join(review, "202610250001_project_creation.sql"), "utf8");

test("reviewed RPC insert allowlists use only actual live columns for every type", () => {
  const names = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  const common = names(migration.match(/allowed := array\[([\s\S]*?)\]\s*\|\| case p_type/)[1]);
  for (const kind of ["home", "vehicle", "repeating", "misc"]) {
    const fields = names(migration.match(new RegExp(`when '${kind}' then array\\[([\\s\\S]*?)\\]`))[1]);
    const table = schema.match(new RegExp(`create table public\\.projects_${kind} \\(([\\s\\S]*?)\\);`))[1];
    const actual = new Set([...table.matchAll(/(?:^|\n)"([^"]+)" /g)].map((match) => match[1]));
    for (const field of ["id", "external_id", ...common, ...fields]) {
      assert(actual.has(field), `${kind}.${field} is not in the live schema`);
    }
  }
});

test("canonical creation SQL preserves invoker execution, atomic sequences and unified-view order bounds", () => {
  assert.match(migration, /NOT EXECUTED/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /nextval\(/);
  assert.match(migration, /not between -2147483648 and 2147483647/);
  assert.match(migration, /add constraint %I unique \(external_id\)/);
  assert.match(migration, /if allocator is null then/);
  assert.match(migration, /Retained allocator[\s\S]*do not reset automatically/);
});

test("preflight and post-deployment validation are read-only without allocator calls", () => {
  for (const file of ["project_creation_preflight.sql", "project_creation_validation.sql"]) {
    const source = fs.readFileSync(path.join(review, file), "utf8").replace(/--[^\r\n]*/g, "");
    const statements = source.split(";").map((statement) => statement.trim()).filter(Boolean);
    assert.equal(statements[0], "BEGIN TRANSACTION READ ONLY");
    assert.equal(statements.at(-1), "COMMIT");
    for (const statement of statements.slice(1, -1)) assert.match(statement, /^(select|with)\b/i);
    const executableText = source.replace(/'(?:''|[^'])*'/g, "''");
    assert.doesNotMatch(executableText, /\b(insert|update|delete|alter|drop|create|grant|revoke|truncate|call|do|execute)\b|\b(nextval|setval)\s*\(/i);
    assert.doesNotMatch(source, /\bcreate_workbench_project\s*\(/i);
  }
});

test("rollback disables creation without discarding counters, constraints or project rows", () => {
  const source = fs.readFileSync(path.join(review, "project_creation_rollback.sql"), "utf8")
    .replace(/--[^\r\n]*/g, "");
  assert.match(source, /drop function public\.create_workbench_project\(text, jsonb\)/i);
  assert.doesNotMatch(source, /\b(delete|truncate|update|insert)\b|\bdrop\s+(sequence|table)\b|\bdrop\s+constraint\b|\bsetval\s*\(/i);
});
