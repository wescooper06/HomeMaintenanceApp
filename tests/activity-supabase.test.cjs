const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PGlite } = require("@electric-sql/pglite");

const root = path.resolve(__dirname, "..");
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const plain = (value) => JSON.parse(JSON.stringify(value));
function moduleExports(file, context = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const names = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1]);
  return vm.runInNewContext(`(() => {
    ${source.replace(/^import \{[\s\S]*?\} from "[^"]+";\r?$/gm, "").replace(/^export /gm, "")}
    return {${names.join(",")}};
  })()`, { crypto: require("node:crypto").webcrypto, console, ...context });
}
const utils = moduleExports("src\\utils\\plannerUtils.js");
const { createActivityDataAccess, expandActivityRules } = moduleExports("src\\services\\activityDataAccess.js", {
  ...utils, getSupabaseClient() { throw Error("No live database permitted"); },
});

let db;
test.before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE activity_types (
      id text NOT NULL PRIMARY KEY, name text NOT NULL, color text, category text, notes text
    );
    CREATE TABLE activity_rules (
      days text NOT NULL, start_time time, end_time time, activity_type_id text,
      recurrence text, allow_override boolean, priority smallint, notes text,
      id uuid NOT NULL DEFAULT gen_random_uuid()
    );
    CREATE TABLE activity_weekly_grid (
      day text NOT NULL, "time" time NOT NULL, activity_type_id text,
      rule_id uuid DEFAULT gen_random_uuid()
    );
  `);
});
test.after(async () => { await db?.close(); });

async function fixture() {
  await db.exec(`TRUNCATE activity_types, activity_rules, activity_weekly_grid;
    INSERT INTO activity_types(id,name) VALUES ('work','Work'),('rest','Rest');`);
  const calls = [];
  let failure;
  const tables = new Set(["activity_types", "activity_rules", "activity_weekly_grid"]);
  const quote = (name) => {
    assert(/^[a-z_]+$/.test(name));
    return `"${name}"`;
  };
  const client = {
    failNext(table, operation) { failure = { table, operation }; },
    from(table) {
      assert(tables.has(table), `Unexpected table: ${table}`);
      let operation = "read", payload, filters = [], order = [], range, single = false;
      const query = {
        select() { return query; },
        order(column) { order.push(column); return query; },
        range(start, end) { range = [start, end]; return query; },
        eq(column, value) { filters.push({ column, value }); return query; },
        not(column, operator, value) {
          assert.equal(operator, "is"); assert.equal(value, null);
          filters.push({ column, notNull: true }); return query;
        },
        insert(values) { operation = "insert"; payload = values; return query; },
        update(values) { operation = "update"; payload = values; return query; },
        delete() { operation = "delete"; return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          return (async () => {
            calls.push({ table, operation, payload: structuredClone(payload) });
            if (failure?.table === table && failure.operation === operation) {
              failure = null;
              return { data: null, error: { message: "Fixture write denied" } };
            }
            const parameters = [];
            const param = (value) => { parameters.push(value); return `$${parameters.length}`; };
            let sql;
            if (operation === "insert") {
              const rows = Array.isArray(payload) ? payload : [payload];
              const columns = Object.keys(rows[0]);
              sql = `INSERT INTO ${quote(table)} (${columns.map(quote)}) VALUES ` +
                rows.map((row) => `(${columns.map((column) => param(row[column])).join(",")})`).join(",");
            } else if (operation === "update") {
              sql = `UPDATE ${quote(table)} SET ` + Object.entries(payload).map(([key, value]) =>
                `${quote(key)}=${param(value)}`).join(",");
            } else sql = operation === "delete" ? `DELETE FROM ${quote(table)}` : `SELECT * FROM ${quote(table)}`;
            if (filters.length) sql += " WHERE " + filters.map((filter) => filter.notNull
              ? `${quote(filter.column)} IS NOT NULL` : `${quote(filter.column)}=${param(filter.value)}`).join(" AND ");
            if (operation === "read") {
              if (order.length) sql += " ORDER BY " + order.map(quote).join(",");
              if (range) sql += ` LIMIT ${Math.min(100, range[1] - range[0] + 1)} OFFSET ${range[0]}`;
            } else sql += " RETURNING *";
            try {
              const result = await db.query(sql, parameters);
              if (single && result.rows.length !== 1) return { data: null, error: { message: "Expected exactly one row" } };
              return { data: single ? result.rows[0] : result.rows, error: null };
            } catch (error) {
              return { data: null, error };
            }
          })().then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { api: createActivityDataAccess(() => client), client, calls };
}

const rule = (values = {}) => ({
  id, days: ["Mon", "Thu"], start_time: "09:00", end_time: "10:00",
  activity_type_id: "work", allow_override: false, priority: 1, notes: "", recurrence: "weekly",
  ...values,
});

test("types and rules use exact supplied PostgreSQL types and preserve recurrence on partial edits", async () => {
  const { api } = await fixture();
  assert.equal((await api.getActivityTypes()).length, 2);
  const saved = await api.createActivityRule(rule());
  assert.deepEqual(plain(saved.days), ["Mon", "Thu"]);
  assert.equal(saved.start_time, "09:00");
  assert.equal(saved.allow_override, false);
  await api.updateActivityRule(id, { notes: "Changed", priority: 4 });
  const raw = (await db.query("SELECT * FROM activity_rules")).rows[0];
  assert.equal(raw.recurrence, "weekly");
  assert.equal(raw.notes, "Changed");
  assert.equal(raw.allow_override, false);
  await api.deleteActivityRule(id);
  assert.equal((await api.getActivityRules()).length, 0);
});

test("empty regeneration persists exactly 7 x 48 slots with explicit null rule IDs", async () => {
  const { api } = await fixture();
  const result = await api.regenerateWeeklyGrid();
  assert.equal(result.slotsWritten, 336);
  const grid = await api.getWeeklyGrid();
  assert.equal(grid.length, 336);
  assert.equal(new Set(grid.map((row) => `${row.day}-${row.time}`)).size, 336);
  for (const day of utils.DAYS) {
    assert.equal(grid.filter((row) => row.day === day).length, 48);
    assert(grid.some((row) => row.day === day && row.time === "00:00"));
    assert(grid.some((row) => row.day === day && row.time === "23:30"));
  }
  assert(grid.every((row) => row.rule_id === null && row.activity_type_id === null));
  assert.equal(utils.SLOT_COUNT, 48);
  assert.equal(utils.TIME_OPTIONS.length, 49);
  assert.equal(utils.buildActivityBlocks(grid).length, 0);
});

test("generation covers early/late times, snaps off-grid starts, and treats end time as exclusive", async () => {
  const { api } = await fixture();
  await api.createActivityRule(rule({ days: ["Mon"], start_time: "00:15", end_time: "01:00" }));
  await api.createActivityRule(rule({ id: otherId, days: ["Sun"], start_time: "23:30", end_time: "24:00" }));
  await api.regenerateWeeklyGrid();
  const assigned = (await api.getWeeklyGrid()).filter((row) => row.rule_id);
  assert.deepEqual(plain(assigned.map((row) => [row.day, row.time])), [
    ["Mon", "00:00"], ["Mon", "00:30"], ["Sun", "23:30"],
  ]);
  assert.equal(utils.buildActivityBlocks(assigned).length, 2);
});

test("overlapping rules retain separate rows like the legacy generator, with deterministic priority order", async () => {
  const { api } = await fixture();
  await api.createActivityRule(rule({ days: ["Mon"] }));
  await api.createActivityRule(rule({ id: otherId, days: ["Mon"], priority: 5,
    activity_type_id: "rest", allow_override: true }));
  const raw = (await db.query("SELECT * FROM activity_rules ORDER BY id")).rows;
  const expanded = expandActivityRules(raw);
  const slot = expanded.filter((row) => row.day === "Mon" && row.time === "09:00");
  assert.deepEqual(plain(slot.map((row) => row.rule_id)), [otherId, id]);
  await api.regenerateWeeklyGrid();
  assert.equal((await api.getWeeklyGrid()).length, 338);
  assert.equal((await api.getWeeklyGrid()).filter((row) => row.rule_id === id).length, 2);
});

test("repeated regeneration replaces rather than appending, and deletion removes stale rule slots", async () => {
  const { api } = await fixture();
  await api.createActivityRule(rule());
  await api.regenerateWeeklyGrid();
  await api.regenerateWeeklyGrid();
  assert.equal((await api.getWeeklyGrid()).length, 336);
  await api.deleteActivityRule(id);
  await api.regenerateWeeklyGrid();
  assert((await api.getWeeklyGrid()).every((row) => row.rule_id === null));
});

test("splitting changes only the selected day and retains recurrence and untouched days", async () => {
  const { api } = await fixture();
  await api.createActivityRule(rule());
  const [original] = await api.getActivityRules();
  await api.splitRule({ ...original, start_time: "11:00", end_time: "12:00" }, "Mon");
  const rules = await api.getActivityRules();
  assert.equal(rules.length, 2);
  const old = rules.find((row) => row.id === id), split = rules.find((row) => row.id !== id);
  assert.deepEqual(plain(old.days), ["Thu"]);
  assert.equal(old.start_time, "09:00");
  assert.deepEqual(plain(split.days), ["Mon"]);
  assert.equal(split.start_time, "11:00");
  assert.equal(split.recurrence, "weekly");
  await api.splitRule({ ...split, notes: "One day" }, "Mon");
  assert.equal((await api.getActivityRules()).length, 2);
});

test("invalid rules and missing types fail before clearing the current grid", async () => {
  const { api, calls } = await fixture();
  await api.regenerateWeeklyGrid();
  await db.exec(`INSERT INTO activity_rules(id,days,start_time,end_time,activity_type_id)
    VALUES ('${id}','Mon','10:00','09:00','work')`);
  const deletes = calls.filter((call) => call.table === "activity_weekly_grid" && call.operation === "delete").length;
  await assert.rejects(api.regenerateWeeklyGrid(), /Invalid time range/);
  assert.equal(calls.filter((call) => call.table === "activity_weekly_grid" && call.operation === "delete").length, deletes);
  assert.equal((await api.getWeeklyGrid()).length, 336);
  await assert.rejects(api.createActivityRule(rule({ id: otherId, activity_type_id: "unknown" })), /Unknown activity type/);
  await assert.rejects(api.createActivityRule(rule({ id: otherId, priority: 32768 })), /smallint/);
  await assert.rejects(api.updateActivityRule(otherId, { notes: "Missing" }), /not found/);
});

test("replacement failures surface explicit retry instructions and the serialized queue recovers", async () => {
  const { api, client } = await fixture();
  await api.createActivityRule(rule());
  client.failNext("activity_weekly_grid", "insert");
  await assert.rejects(api.regenerateWeeklyGrid(), /cleared but replacement failed.*retry regeneration/);
  assert.equal((await api.getActivityRules()).length, 1);
  await api.regenerateWeeklyGrid();
  assert.equal((await api.getWeeklyGrid()).length, 336);
  const results = await Promise.all([api.regenerateWeeklyGrid(), api.regenerateWeeklyGrid()]);
  assert(results.every((result) => result.slotsWritten === 336));
  assert.equal((await api.getWeeklyGrid()).length, 336);
});

test("duplicate IDs in the keyless rules table fail explicitly without ambiguous updates", async () => {
  const { api } = await fixture();
  await api.createActivityRule(rule());
  await db.exec("INSERT INTO activity_rules SELECT * FROM activity_rules");
  await assert.rejects(api.updateActivityRule(id, { notes: "Ambiguous" }), /Duplicate activity rule ID/);
  await assert.rejects(api.regenerateWeeklyGrid(), /Duplicate activity rule ID/);
});

test("Activity entry points and adapters do not depend on Sheets or Apps Script", () => {
  for (const file of ["src\\services\\activityDataAccess.js", "src\\services\\activityPlannerService.js",
    "src\\activity-planner\\App.jsx", "src\\pages\\ActivityPlanner\\DailyActivityPlanner.jsx"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), "utf8"),
      /googleSheetsClient|sheetsApiRequest|useSheetsData|VITE_APPS_SCRIPT_URL|spreadsheetId/);
  }
});

test("standalone Activity entry bundles Supabase without the Google connection gate", async () => {
  const { createRequire } = require("node:module");
  const { pathToFileURL } = require("node:url");
  const requireTrips = createRequire(path.join(root, "trips", "package.json"));
  const vite = await import(pathToFileURL(requireTrips.resolve("vite")).href);
  const result = await vite.build({
    configFile: path.join(root, "trips", "activity-planner.vite.config.js"),
    logLevel: "error", build: { write: false },
  });
  const code = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output)
    .filter((entry) => entry.type === "chunk").map((entry) => entry.code).join("\n");
  for (const table of ["activity_types", "activity_rules", "activity_weekly_grid"]) assert(code.includes(table));
  assert(!code.includes("Connect Google Sheets"));
});
