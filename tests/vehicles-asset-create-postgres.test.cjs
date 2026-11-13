const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const bin = process.env.WORKBENCH_TEST_PG_BIN;
const root = path.resolve(__dirname, "..");
const assetCreateMigrationPath = "supabase/migrations/202611130001_vehicles_asset_creation_rpc.sql";
const committedAssetCreateMigration = execFileSync(
  "git",
  ["show", `HEAD:${assetCreateMigrationPath}`],
  { cwd: root, encoding: "utf8" },
);
const worktreeAssetCreateMigration = fs.readFileSync(path.join(root, assetCreateMigrationPath), "utf8")
  .replace(/\r\n/g, "\n");
assert.equal(worktreeAssetCreateMigration, committedAssetCreateMigration);
const migrations = [
  fs.readFileSync(path.join(root, "supabase", "migrations", "202611110001_vehicles_domain.sql"), "utf8"),
  fs.readFileSync(path.join(root, "supabase", "migrations", "202611110002_vehicles_save_changes_rpc.sql"), "utf8"),
  committedAssetCreateMigration,
];
const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
let directory;
let data;
let port;
let started = false;

function command(executable, args, input = "") {
  const file = path.join(bin, executable + (process.platform === "win32" ? ".exe" : ""));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...environment, PGAPPNAME: "vehicles_asset_create_validation", PSQL_PAGER: "", PAGER: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(error); });
    child.on(executable === "pg_ctl" ? "exit" : "close", (code) => {
      if (executable === "pg_ctl") {
        child.stdout.destroy();
        child.stderr.destroy();
      }
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${executable} exited ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

function sql(statement) {
  return command("psql", [
    "-X", "-w", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-qAt", "--set=VERBOSITY=verbose",
  ], statement);
}

async function authenticated(owner, statement) {
  return sql(`set role authenticated;
select set_config('request.jwt.claim.sub',${quote(owner ?? "")},false);
${statement}
reset role;`);
}

function lastJson(output) {
  return JSON.parse(output.trim().split(/\r?\n/).at(-1));
}

const call = (payload) => `select public.create_vehicle_asset(${quote(JSON.stringify(payload))}::jsonb);`;

test("applies the exact committed asset-create migration and checks RPC security/reconciliation on PostgreSQL 18",
  { skip: !bin && "Set WORKBENCH_TEST_PG_BIN to a local PostgreSQL bin directory", timeout: 180000 }, async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicles-asset-create-pg-"));
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
      await command("pg_ctl", [
        "-D", data, "-l", path.join(directory, "server.log"),
        "-o", `-h 127.0.0.1 -p ${port}`, "-w", "-t", "30", "start",
      ]);
      started = true;
      assert.equal(await sql("select host(inet_server_addr())"), "127.0.0.1");
      await sql(`create role anon;
        create role authenticated;
        create role service_role;
        create schema auth;
        create table auth.users(id uuid primary key);
        insert into auth.users(id) values (${quote(ownerA)}::uuid),(${quote(ownerB)}::uuid);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
        $$;
        grant usage on schema public,auth to anon,authenticated,service_role;
        grant execute on function auth.uid() to anon,authenticated,service_role;`);
      for (const migration of migrations) await sql(migration);

      assert.equal(await sql(`select prosecdef::text from pg_catalog.pg_proc
        where oid='public.create_vehicle_asset(jsonb)'::regprocedure`), "true");
      assert.equal(await sql(`select pg_catalog.array_to_string(proconfig,',')
        from pg_catalog.pg_proc where oid='public.create_vehicle_asset(jsonb)'::regprocedure`), 'search_path=""');
      assert.equal(await sql(`select has_function_privilege('authenticated',
        'public.create_vehicle_asset(jsonb)','EXECUTE')::text`), "true");
      assert.equal(await sql(`select has_function_privilege('anon',
        'public.create_vehicle_asset(jsonb)','EXECUTE')::text`), "false");
      assert.equal(await sql(`select exists (
        select 1
        from pg_catalog.pg_proc p,
          lateral pg_catalog.aclexplode(p.proacl) acl
        where p.oid='public.create_vehicle_asset(jsonb)'::regprocedure
          and acl.grantee=0
          and acl.privilege_type='EXECUTE'
      )::text`), "false");
      assert.equal(await sql(`select has_table_privilege('authenticated',
        'public.vehicles_assets','INSERT')::text`), "false");
      await assert.rejects(sql(`set role authenticated;
        insert into public.vehicles_assets(owner_id,name,usage_unit)
        values (${quote(ownerA)}::uuid,'Direct write','miles');`), /permission denied/);
      await assert.rejects(authenticated(null, call({
        request_id: "30000000-0000-4000-8000-000000000001",
        asset_id: "30000000-0000-4000-8000-000000000002",
        name: "Unauthenticated",
        usage_unit: "miles",
      })), /authorization_error/);

      const request = {
        request_id: "30000000-0000-4000-8000-000000000003",
        asset_id: "30000000-0000-4000-8000-000000000004",
        name: "  Synthetic engine  ",
        usage_unit: "hours",
      };
      const created = lastJson(await authenticated(ownerA, call(request)));
      assert.equal(created.asset_id, request.asset_id);
      assert.equal(created.asset.name, "Synthetic engine");
      assert.equal(created.asset.usage_unit, "hours");
      assert.equal(created.asset.version, 1);
      assert.equal(created.asset.created_at !== null, true);
      assert.equal(created.asset.updated_at !== null, true);
      assert.equal(await sql(`select owner_id::text from public.vehicles_assets
        where id=${quote(request.asset_id)}::uuid`), ownerA);

      const replayed = lastJson(await authenticated(ownerA, call(request)));
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.asset_id, request.asset_id);
      const reconciled = lastJson(await authenticated(ownerA, call({
        ...request,
        request_id: "30000000-0000-4000-8000-000000000005",
      })));
      assert.equal(reconciled.reconciled, true);
      assert.equal(reconciled.asset_id, request.asset_id);
      await assert.rejects(authenticated(ownerB, call({ ...request, request_id: "30000000-0000-4000-8000-000000000006" })),
        /asset_id_conflict/);
      await assert.rejects(authenticated(ownerA, call({ ...request, request_id: "30000000-0000-4000-8000-000000000007",
        name: "Different asset" })), /asset_id_conflict/);
      await assert.rejects(authenticated(ownerA, call({ ...request, name: "Changed after receipt" })),
        /request_id_payload_mismatch/);
      await assert.rejects(authenticated(ownerA, call({
        ...request, request_id: "30000000-0000-4000-8000-000000000008", owner_id: ownerB,
      })), /validation_error/);
      assert.equal(await sql("select count(*) from public.vehicles_assets"), "1");
      assert.equal(await sql("select count(*) from public.maintenance_items"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_maintenance_item_assets"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_ongoing_records"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_ongoing_items"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_recommended_records"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_completed_records"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_maintenance_intervals"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_key_information"), "0");
      assert.equal(await sql("select count(*) from public.vehicle_links"), "0");
      assert.equal(await sql("select count(*) from public.vehicles_save_requests"), "2");
    } finally {
      if (started) {
        await command("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "30", "stop"]);
        started = false;
      }
      if (directory && path.basename(directory).startsWith("vehicles-asset-create-pg-")) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });
