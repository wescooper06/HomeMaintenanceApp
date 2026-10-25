const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { kinds, schema } = require("./fixtures/workbench-live-schema.cjs");

const bin = process.env.WORKBENCH_TEST_PG_BIN;
const review = path.join(__dirname, "..", "supabase", "review");
const migration = fs.readFileSync(path.join(review, "202610250001_project_creation.sql"), "utf8");
const rollback = fs.readFileSync(path.join(review, "project_creation_rollback.sql"), "utf8");
const quote = (value) => "'" + String(value).replace(/'/g, "''") + "'";
let directory, data, port, started = false;

function command(exe, args, input = "") {
  const executable = path.join(bin, exe + (process.platform === "win32" ? ".exe" : ""));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...environment, PGAPPNAME: "workbench_disposable_validation", PSQL_PAGER: "", PAGER: "" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(error); });
    child.on(exe === "pg_ctl" ? "exit" : "close", (code) => {
      if (exe === "pg_ctl") {
        // Windows postgres children can retain pg_ctl's inherited pipe handles.
        child.stdout.destroy();
        child.stderr.destroy();
      }
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${exe} exit ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

function sql(statement, database = "validation") {
  return command("psql", ["-X", "-w", "-h", "127.0.0.1", "-p", String(port),
    "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-qAt",
    "--set=VERBOSITY=verbose"], statement);
}

async function json(statement, database) {
  return JSON.parse(await sql(statement, database));
}

function createSql(kind, payload = {}, role = "anon") {
  assert(kinds.includes(kind));
  assert(["anon", "authenticated"].includes(role));
  const project = { title: "Local fixture", ...(kind === "repeating" ? { recurrence: "weekly" } : {}), ...payload };
  return `set role ${role}; select public.create_workbench_project(${quote(kind)}, ${quote(JSON.stringify(project))}::jsonb);`;
}

async function snapshot(database = "validation") {
  return json(`select jsonb_build_object(
    'rows', (select jsonb_agg(to_jsonb(p) order by project_type,id) from projects_all p),
    'sequences', (select jsonb_agg(jsonb_build_object('name',sequencename,'value',last_value) order by sequencename)
      from pg_sequences where schemaname='public'),
    'constraints', (select jsonb_agg(conname order by conname) from pg_constraint
      where connamespace='public'::regnamespace and contype='u')
  );`, database);
}

async function until(check, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

test("real PostgreSQL deployment, multi-session allocation, cancellation, rollback and reapplication",
  { skip: !bin && "Set WORKBENCH_TEST_PG_BIN to a local PostgreSQL bin directory", timeout: 180000 }, async (t) => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-pg-validation-"));
    data = path.join(directory, "data");
    try {
      await command("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
      port = await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const selected = server.address().port;
          server.close((error) => error ? reject(error) : resolve(selected));
        });
      });
      await command("pg_ctl", ["-D", data, "-l", path.join(directory, "server.log"),
        "-o", `-h 127.0.0.1 -p ${port}`, "-w", "-t", "30", "start"]);
      started = true;
      assert.equal(await sql("select host(inet_server_addr())", "postgres"), "127.0.0.1");
      await sql(`create role anon; create role authenticated; create role service_role;
        create database validation; create database repeat_deployment; create database lock_timeout;`, "postgres");
      await sql(schema);
      await sql(`insert into projects_home(external_id,title) values ('PA0001','Existing identity');
        insert into projects_repeating(external_id) values ('PC0008');
        insert into projects_vehicle(external_id) values ('PB0090');`);
      const original = await sql("select id::text from projects_home where external_id='PA0001'");
      await sql(migration);

      await t.test("all four types preserve UUIDs, defaults, routing, view visibility and browser access", async () => {
        for (const [kind, expected] of [
          ["home", "PA0210"], ["vehicle", "PB0091"], ["repeating", "PC0009"], ["misc", "PD0005"],
        ]) {
          const row = await json(createSql(kind));
          assert.equal(row.external_id, expected);
          assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
          assert(row.created_at);
          assert(row.updated_at);
          assert.equal(await sql(`select count(*) from projects_${kind} where id=${quote(row.id)}::uuid`), "1");
          assert.equal(await sql(`select count(*) from projects_all where id=${quote(row.id)}::uuid and project_type=${quote(kind)}`), "1");
          await assert.rejects(sql(`insert into projects_${kind}(external_id) values (${quote(expected)})`), /23505/);
        }
        assert.equal(await sql("select id::text from projects_home where external_id='PA0001'"), original);
        assert.match((await json(createSql("home", {}, "authenticated"))).external_id, /^PA\d{4}$/);
      });

      await t.test("caller identities, unsupported fields and int32 overflow are rejected transactionally", async () => {
        for (const payload of [{ id: original }, { external_id: "PC0003" }, { unknown: true }]) {
          await assert.rejects(sql(createSql("repeating", payload)), /22023/);
        }
        for (const order of ["2147483648", "-2147483649"]) {
          await assert.rejects(sql(createSql("repeating", { order })), /22003/);
        }
        for (const order of ["-2147483648", "2147483647"]) {
          const row = await json(createSql("home", { order }));
          assert.equal(row.order, Number(order));
          assert.equal(await sql(`select "order" from projects_all where id=${quote(row.id)}::uuid`), order);
        }
        const before = await snapshot();
        await assert.rejects(sql(`begin; ${createSql("repeating")}
          ${createSql("repeating", { order: "1.5" })} commit;`), /22P02/);
        const after = await snapshot();
        assert.deepEqual(after.rows, before.rows);
        const counter = (state) => state.sequences.find((item) => item.name === "projects_repeating_external_id_seq").value;
        assert.equal(counter(after), counter(before) + 2);
        assert.equal(Number((await json(createSql("repeating"))).external_id.slice(2)), counter(after) + 1);
      });

      for (const kind of ["home", "repeating"]) {
        await t.test(`${kind}: 16 genuine concurrent sessions allocate distinct increasing external IDs`, async () => {
          const sequence = `projects_${kind}_external_id_seq`;
          const first = Number(await sql(`select last_value from ${sequence}`)) + 1;
          const pending = Array.from({ length: 16 }, (_, index) => sql(
            `set application_name='concurrent_${kind}_fixture';
             begin; set role anon; select pg_backend_pid();
             select create_workbench_project(${quote(kind)}, ${quote(JSON.stringify({
              title: `Concurrent ${kind} ${index}`, ...(kind === "repeating" ? { recurrence: "weekly" } : {}),
            }))}::jsonb);
             select pg_sleep(2); commit;`));
          await until(async () => Number(await sql(`select count(*) from pg_stat_activity
            where datname='validation' and pid <> pg_backend_pid()
              and application_name='concurrent_${kind}_fixture' and state='active'`)) >= 4, "overlapping PostgreSQL sessions");
          const outputs = await Promise.all(pending);
          const pids = outputs.map((output) => output.split(/\r?\n/)[0]);
          const rows = outputs.map((output) => JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith("{"))));
          assert.equal(new Set(pids).size, 16);
          assert.equal(new Set(rows.map((row) => row.id)).size, 16);
          for (const row of rows) assert.match(row.external_id, kind === "home" ? /^PA\d{4}$/ : /^PC\d{4}$/);
          const numbers = rows.map((row) => Number(row.external_id.slice(2))).sort((a, b) => a - b);
          assert.deepEqual(numbers, Array.from({ length: 16 }, (_, index) => first + index));
          assert.equal(new Set(rows.map((row) => row.external_id)).size, 16);
          assert.equal(Number(await sql(`select last_value from ${sequence}`)), first + 15);
          t.diagnostic(`${kind}: 16 distinct backend PIDs; allocated ${first} through ${first + 15}; no duplicates`);
        });
      }

      await t.test("cancelled transactions do not reuse allocated home or repeating IDs", async () => {
        for (const kind of ["home", "repeating"]) {
          const sequence = `projects_${kind}_external_id_seq`;
          const before = Number(await sql(`select last_value from ${sequence}`));
          const marker = `cancelled_${kind}_fixture`;
          const pending = sql(`set application_name=${quote(marker)}; begin; set role anon;
            select create_workbench_project(${quote(kind)}, ${quote(JSON.stringify({
              title: marker, ...(kind === "repeating" ? { recurrence: "weekly" } : {}),
            }))}::jsonb); select pg_sleep(30); commit;`);
          const rejection = assert.rejects(pending, /57014/);
          let victim;
          await until(async () => {
            victim = await sql(`select pid from pg_stat_activity where datname='validation'
              and pid <> pg_backend_pid() and application_name=${quote(marker)}
              and wait_event='PgSleep' limit 1`);
            return Boolean(victim);
          }, "allocated transaction to reach cancellable sleep");
          assert.equal(Number(await sql(`select last_value from ${sequence}`)), before + 1);
          assert.equal(await sql(`select pg_cancel_backend(${Number(victim)})`), "t");
          await rejection;
          assert.equal(await sql(`select count(*) from projects_${kind} where title=${quote(marker)}`), "0");
          assert.equal(Number((await json(createSql(kind))).external_id.slice(2)), before + 2);
        }
      });

      await t.test("SECURITY INVOKER respects table privileges and RLS under browser roles", async () => {
        await sql("revoke insert on projects_misc from anon");
        await assert.rejects(sql(createSql("misc")), /42501/);
        await sql("grant insert on projects_misc to anon; alter table projects_misc enable row level security");
        await assert.rejects(sql(createSql("misc")), /row-level security/);
        await sql("alter table projects_misc disable row level security");
        await assert.rejects(sql("set role anon; select setval('projects_home_external_id_seq', 1)"), /42501/);
        assert.equal(await sql(`select prosecdef from pg_proc
          where oid='public.create_workbench_project(text,jsonb)'::regprocedure`), "f");
      });

      await t.test("five-second migration lock timeout rolls back without installing objects", async () => {
        await sql(schema, "lock_timeout");
        const holder = sql("begin; lock table projects_home in access exclusive mode; select pg_sleep(12); rollback;", "lock_timeout");
        await until(async () => Number(await sql(`select count(*) from pg_locks l join pg_class c on c.oid=l.relation
          where c.relname='projects_home' and l.mode='AccessExclusiveLock' and l.granted`, "lock_timeout")) > 0, "table lock");
        const start = Date.now();
        try {
          await assert.rejects(sql(migration, "lock_timeout"), /55P03.*lock timeout/s);
          const elapsed = Date.now() - start;
          assert(elapsed >= 4500 && elapsed < 9000, `Lock timeout took ${elapsed} ms`);
          t.diagnostic(`Exclusive-table-lock deployment attempt failed after ${elapsed} ms`);
          assert.equal(await sql("select count(*) from pg_sequences where schemaname='public'", "lock_timeout"), "0");
        } finally {
          await holder;
        }
      });

      await t.test("rollback retains rows, unique constraints and sequence high-water marks", async () => {
        const before = await snapshot();
        await sql(rollback);
        assert.equal(await sql("select to_regprocedure('public.create_workbench_project(text,jsonb)') is null"), "t");
        for (const kind of kinds) {
          assert.equal(await sql(`select has_sequence_privilege('anon','projects_${kind}_external_id_seq','USAGE')`), "f");
          assert.equal(await sql(`select has_sequence_privilege('authenticated','projects_${kind}_external_id_seq','USAGE')`), "f");
          await assert.rejects(sql(createSql(kind)), /42883/);
        }
        assert.deepEqual(await snapshot(), before);
        await sql(migration);
        assert.deepEqual(await snapshot(), before);
        for (const kind of kinds) {
          const previous = before.sequences.find((item) => item.name === `projects_${kind}_external_id_seq`).value;
          const row = await json(createSql(kind));
          assert.equal(Number(row.external_id.slice(2)), previous + 1);
          assert(row.created_at);
          assert(row.updated_at);
          assert.equal(await sql(`select count(*) from projects_all where id=${quote(row.id)}::uuid`), "1");
        }
      });

      await t.test("fresh deployment is reproducible and read-only verification SQL runs without mutation", async () => {
        await sql(schema, "repeat_deployment");
        await sql(migration, "repeat_deployment");
        for (const [kind, expected] of [
          ["home", "PA0210"], ["vehicle", "PB0083"], ["repeating", "PC0009"], ["misc", "PD0005"],
        ]) {
          assert.equal((await json(createSql(kind), "repeat_deployment")).external_id, expected);
        }
        const before = await snapshot("repeat_deployment");
        for (const file of ["project_creation_preflight.sql", "project_creation_data_preflight.sql", "project_creation_validation.sql"]) {
          await sql(fs.readFileSync(path.join(review, file), "utf8"), "repeat_deployment");
        }
        assert.deepEqual(await snapshot("repeat_deployment"), before);
      });
    } finally {
      if (started) {
        await command("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "30", "stop"]);
        started = false;
      }
      // The unique directory was created by this test, never a caller's cluster.
      if (directory && path.basename(directory).startsWith("workbench-pg-validation-")) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });
