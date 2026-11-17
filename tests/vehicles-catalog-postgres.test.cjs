const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const bin = process.env.WORKBENCH_TEST_PG_BIN;
const root = path.join(__dirname, "..");
const migrations = [
  "202611110001_vehicles_domain.sql",
  "202611110002_vehicles_save_changes_rpc.sql",
  "202611130001_vehicles_asset_creation_rpc.sql",
  "202611130002_vehicles_maintenance_item_catalog_rpc.sql",
  "202611170001_vehicles_asset_deletion_rpc.sql",
].map((name) => fs.readFileSync(path.join(root, "supabase", "migrations", name), "utf8"));
const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
let directory, data, port, started = false;
let nextUuid = 1;

function uuid() {
  const suffix = String(nextUuid++).padStart(12, "0");
  return `30000000-0000-4000-8000-${suffix}`;
}

function command(exe, args, input = "") {
  const executable = path.join(bin, exe + (process.platform === "win32" ? ".exe" : ""));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...environment, PGAPPNAME: "vehicles_catalog_validation", PSQL_PAGER: "", PAGER: "" },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(error); });
    child.on(exe === "pg_ctl" ? "exit" : "close", (code) => {
      if (exe === "pg_ctl") {
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
  return command("psql", [
    "-X", "-w", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-qAt", "--set=VERBOSITY=verbose",
  ], statement);
}

async function json(statement, database = "validation") {
  return JSON.parse(await sql(statement, database));
}

async function until(check, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function catalogSql(payload, owner = ownerA) {
  return `SET ROLE authenticated;
    SET request.jwt.claim.sub = ${quote(owner)};
    SELECT public.save_maintenance_item(${quote(JSON.stringify(payload))}::jsonb);`;
}

function createRequest(itemId, displayName, mode, selectedAssetIds = [], extra = {}) {
  return {
    request_id: uuid(),
    operation: "create",
    item_id: itemId,
    display_name: displayName,
    item_group: "routine",
    availability_mode: mode,
    current_asset_id: null,
    selected_asset_ids: selectedAssetIds,
    ...extra,
  };
}

async function expectCode(payload, expected, owner = ownerA) {
  await assert.rejects(sql(catalogSql(payload, owner)), (error) => {
    assert.match(error.message, new RegExp(`"code":\\s*"${expected}"`));
    return true;
  });
}

test("real PostgreSQL 18.6 validates catalog migration, atomic applicability, locking, receipts and grants",
  { skip: !bin && "Set WORKBENCH_TEST_PG_BIN to a local PostgreSQL bin directory", timeout: 240000 }, async (t) => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "vehicles-catalog-pg-validation-"));
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
      assert.equal(await sql("SELECT split_part(current_setting('server_version'),' ',1)", "postgres"), "18.6");
      await sql(`CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role BYPASSRLS;
        CREATE DATABASE validation;`, "postgres");
      await sql(`CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid PRIMARY KEY);
        INSERT INTO auth.users(id) VALUES (${quote(ownerA)}::uuid),(${quote(ownerB)}::uuid);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
        $$;
        GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
        GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
      for (const migration of migrations) await sql(migration);

      await t.test("signature, owner identity, grants, validation, all/current applicability and idempotency", async () => {
        assert.equal(await sql(`SELECT prosecdef FROM pg_catalog.pg_proc
          WHERE oid='public.save_maintenance_item(jsonb)'::regprocedure`), "t");
        assert.equal(await sql(`SELECT array_to_string(proconfig,',') FROM pg_catalog.pg_proc
          WHERE oid='public.save_maintenance_item(jsonb)'::regprocedure`), 'search_path=""');
        assert.equal(await sql(`SELECT pg_catalog.pg_get_function_identity_arguments(
          'public.save_maintenance_item(jsonb)'::regprocedure)`), "p_request jsonb");
        assert.equal(await sql(`SELECT has_function_privilege('authenticated',
          'public.save_maintenance_item(jsonb)','EXECUTE')`), "t");
        assert.equal(await sql(`SELECT has_function_privilege('anon',
          'public.save_maintenance_item(jsonb)','EXECUTE')`), "f");
        for (const table of ["maintenance_items", "vehicle_maintenance_item_assets"]) {
          for (const action of ["INSERT", "UPDATE", "DELETE"]) {
            assert.equal(await sql(`SELECT has_table_privilege('authenticated',${quote(`public.${table}`)},${quote(action)})`), "f");
          }
        }
        await assert.rejects(sql(`SET ROLE authenticated;
          SET request.jwt.claim.sub=${quote(ownerA)};
          INSERT INTO public.maintenance_items(owner_id,display_name,item_group,availability_mode)
          VALUES (${quote(ownerA)}::uuid,'Direct','routine','all_assets')`), /permission denied/i);
        await assert.rejects(sql(`SELECT public.save_maintenance_item('{}'::jsonb)`), /Authentication is required/);

        const firstAsset = uuid(), secondAsset = uuid();
        const foreignAsset = uuid();
        await sql(`INSERT INTO public.vehicles_assets(owner_id,id,name,usage_unit) VALUES
          (${quote(ownerA)}::uuid,${quote(firstAsset)}::uuid,'Synthetic first','miles'),
          (${quote(ownerA)}::uuid,${quote(secondAsset)}::uuid,'Synthetic second','hours'),
          (${quote(ownerB)}::uuid,${quote(foreignAsset)}::uuid,'Synthetic foreign','hours')`);
        const itemId = uuid();
        const allAssets = createRequest(itemId, "Synthetic all-assets item", "all_assets");
        const created = await json(catalogSql(allAssets));
        assert.equal(created.item_id, itemId);
        assert.equal(created.item.version, 1);
        assert.equal(created.item.availability_mode, "all_assets");
        const replay = await json(catalogSql(allAssets));
        assert.equal(replay.replayed, true);
        await expectCode({ ...allAssets, display_name: "Different payload" }, "request_id_payload_mismatch");
        await expectCode({
          ...allAssets, request_id: uuid(), item_id: uuid(), display_name: " ",
        }, "validation_error");
        await expectCode({ ...allAssets, request_id: uuid(), item_id: uuid(), item_group: "other" }, "validation_error");
        await expectCode({
          request_id: uuid(), operation: "update", item_id: itemId, expected_version: 1,
          display_name: "Foreign owner update", item_group: "routine", availability_mode: "all_assets",
          current_asset_id: null, selected_asset_ids: [],
        }, "not_found", ownerB);
        await expectCode(createRequest(uuid(), "Synthetic duplicate selection", "selected_assets", [firstAsset, firstAsset]),
          "validation_error");
        await expectCode(createRequest(uuid(), "Synthetic foreign selection", "selected_assets", [firstAsset, foreignAsset]),
          "not_found");
        await expectCode(createRequest(uuid(), "Synthetic missing selection", "selected_assets", [firstAsset, uuid()]),
          "not_found");

        const currentItem = uuid();
        const current = {
          ...createRequest(currentItem, "Synthetic current item", "current_asset_only"),
          current_asset_id: firstAsset,
        };
        assert.equal((await json(catalogSql(current))).item.current_asset_id, firstAsset);
        await expectCode({
          ...current, request_id: uuid(), item_id: uuid(), display_name: "Synthetic bad current",
          current_asset_id: null,
        }, "validation_error");
        await expectCode({
          ...current, request_id: uuid(), item_id: uuid(), display_name: "Synthetic foreign current",
          current_asset_id: uuid(),
        }, "not_found");
      });

      await t.test("multi-asset replacement, injected rollback, interval conflict and snapshot preservation", async () => {
        const firstAsset = uuid(), secondAsset = uuid(), thirdAsset = uuid();
        await sql(`INSERT INTO public.vehicles_assets(owner_id,id,name,usage_unit) VALUES
          (${quote(ownerA)}::uuid,${quote(firstAsset)}::uuid,'Synthetic selected first','miles'),
          (${quote(ownerA)}::uuid,${quote(secondAsset)}::uuid,'Synthetic selected second','miles'),
          (${quote(ownerA)}::uuid,${quote(thirdAsset)}::uuid,'Synthetic selected third','hours')`);
        const itemId = uuid();
        const create = createRequest(itemId, "Synthetic selected item", "selected_assets", [firstAsset, secondAsset]);
        const created = await json(catalogSql(create));
        assert.deepEqual(created.item.selected_asset_ids, [firstAsset, secondAsset].sort());

        const recordId = uuid();
        await sql(`INSERT INTO public.vehicle_ongoing_records
          (id,owner_id,asset_id,service_date,usage_reading_unit)
          VALUES (${quote(recordId)}::uuid,${quote(ownerA)}::uuid,${quote(firstAsset)}::uuid,'2026-11-01','none');
          INSERT INTO public.vehicle_ongoing_items
          (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
          VALUES (${quote(ownerA)}::uuid,${quote(recordId)}::uuid,${quote(itemId)}::uuid,true,'Captured original','components_other');
          INSERT INTO public.vehicle_maintenance_intervals
          (owner_id,asset_id,maintenance_item_id,interval_unit,interval_value)
          VALUES (${quote(ownerA)}::uuid,${quote(firstAsset)}::uuid,${quote(itemId)}::uuid,'miles',100)`);

        const update = {
          request_id: uuid(), operation: "update", item_id: itemId, expected_version: 1,
          display_name: "Synthetic selected updated", item_group: "fluids_drivetrain",
          availability_mode: "selected_assets", current_asset_id: null, selected_asset_ids: [secondAsset, thirdAsset],
        };
        await expectCode(update, "item_archived_or_unavailable");
        await expectCode({
          request_id: uuid(), operation: "archive", item_id: itemId, expected_version: 1,
        }, "item_archived_or_unavailable");
        assert.equal(await sql(`SELECT version FROM public.maintenance_items WHERE id=${quote(itemId)}::uuid`), "1");
        assert.deepEqual(await json(`SELECT coalesce(jsonb_agg(asset_id::text ORDER BY asset_id),'[]'::jsonb)
          FROM public.vehicle_maintenance_item_assets WHERE maintenance_item_id=${quote(itemId)}::uuid`),
        [firstAsset, secondAsset].sort());

        await sql(`DELETE FROM public.vehicle_maintenance_intervals WHERE maintenance_item_id=${quote(itemId)}::uuid;
          CREATE FUNCTION public.test_fail_catalog_association() RETURNS trigger
          LANGUAGE plpgsql SET search_path='' AS $body$
          BEGIN
            IF NEW.asset_id = ${quote(thirdAsset)}::uuid THEN
              RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='injected catalog failure';
            END IF;
            RETURN NEW;
          END
          $body$;
          CREATE TRIGGER test_fail_catalog_association BEFORE INSERT ON public.vehicle_maintenance_item_assets
          FOR EACH ROW EXECUTE FUNCTION public.test_fail_catalog_association();`);
        const failedCreate = createRequest(uuid(), "Must not leave a partial create", "selected_assets", [secondAsset, thirdAsset]);
        await assert.rejects(sql(catalogSql(failedCreate)), /injected catalog failure/);
        assert.equal(await sql(`SELECT count(*) FROM public.maintenance_items WHERE id=${quote(failedCreate.item_id)}::uuid`), "0");
        assert.equal(await sql(`SELECT count(*) FROM public.vehicles_save_requests WHERE request_id=${quote(failedCreate.request_id)}::uuid`), "0");
        const attemptedUpdate = {
          ...update, request_id: uuid(), display_name: "Must roll back",
          selected_asset_ids: [firstAsset, thirdAsset],
        };
        await assert.rejects(sql(catalogSql(attemptedUpdate)), /injected catalog failure/);
        assert.equal(await sql(`SELECT display_name FROM public.maintenance_items WHERE id=${quote(itemId)}::uuid`), "Synthetic selected item");
        assert.equal(await sql(`SELECT version FROM public.maintenance_items WHERE id=${quote(itemId)}::uuid`), "1");
        assert.deepEqual(await json(`SELECT coalesce(jsonb_agg(asset_id::text ORDER BY asset_id),'[]'::jsonb)
          FROM public.vehicle_maintenance_item_assets WHERE maintenance_item_id=${quote(itemId)}::uuid`),
        [firstAsset, secondAsset].sort());
        assert.equal(await sql(`SELECT count(*) FROM public.vehicles_save_requests WHERE request_id=${quote(attemptedUpdate.request_id)}::uuid`), "0");
        await sql(`DROP TRIGGER test_fail_catalog_association ON public.vehicle_maintenance_item_assets;
          DROP FUNCTION public.test_fail_catalog_association();`);

        update.selected_asset_ids = [firstAsset, secondAsset, thirdAsset];
        const saved = await json(catalogSql(update));
        assert.equal(saved.item.version, 2);
        assert.deepEqual(saved.item.selected_asset_ids, [firstAsset, secondAsset, thirdAsset].sort());
        assert.deepEqual(await json(`SELECT jsonb_build_array(display_name_snapshot,group_snapshot)
          FROM public.vehicle_ongoing_items WHERE maintenance_item_id=${quote(itemId)}::uuid`),
        ["Captured original", "components_other"]);
      });

      await t.test("concurrent complete-set writes serialize without mixed associations", async () => {
        const assets = [uuid(), uuid(), uuid(), uuid()].sort();
        await sql(`INSERT INTO public.vehicles_assets(owner_id,id,name,usage_unit) VALUES
          ${assets.map((id, index) => `(${quote(ownerA)}::uuid,${quote(id)}::uuid,${quote(`Concurrent asset ${index}`)},'miles')`).join(",")}`);
        const itemId = uuid();
        await json(catalogSql(createRequest(itemId, "Synthetic concurrent item", "selected_assets", [assets[0], assets[1]])));
        const firstUpdate = {
          request_id: uuid(), operation: "update", item_id: itemId, expected_version: 1,
          display_name: "Synthetic first concurrent result", item_group: "routine",
          availability_mode: "selected_assets", current_asset_id: null,
          selected_asset_ids: [assets[0], assets[2]],
        };
        const secondUpdate = {
          request_id: uuid(), operation: "update", item_id: itemId, expected_version: 1,
          display_name: "Synthetic second concurrent result", item_group: "routine",
          availability_mode: "selected_assets", current_asset_id: null,
          selected_asset_ids: [assets[0], assets[3]],
        };
        const firstTransaction = sql(`SET application_name='vehicles_catalog_first';
          BEGIN;
          ${catalogSql(firstUpdate)}
          SELECT pg_sleep(0.4);
          COMMIT;`);
        await until(async () => (await sql(`SELECT count(*) FROM pg_stat_activity
          WHERE application_name='vehicles_catalog_first' AND wait_event='PgSleep'`, "postgres")) === "1",
        "first catalog transaction to hold its row locks");
        await assert.rejects(sql(catalogSql(secondUpdate)), /"code":\s*"version_conflict"/);
        await firstTransaction;
        assert.deepEqual(await json(`SELECT coalesce(jsonb_agg(asset_id::text ORDER BY asset_id),'[]'::jsonb)
          FROM public.vehicle_maintenance_item_assets WHERE maintenance_item_id=${quote(itemId)}::uuid`),
        [assets[0], assets[2]].sort());
        assert.equal(await sql(`SELECT version FROM public.maintenance_items WHERE id=${quote(itemId)}::uuid`), "2");
      });
      await t.test("concurrent asset deletions serialize and cannot remove the last active applicability", async () => {
        const ids = [uuid(), uuid()].sort();
        await sql(`INSERT INTO public.vehicles_assets(owner_id,id,name,usage_unit) VALUES
          ${ids.map((id) => `(${quote(ownerA)}::uuid,${quote(id)}::uuid,'Concurrent deletion','miles')`).join(",")}`);
        const itemId = uuid();
        await json(catalogSql(createRequest(itemId, "Concurrent deletion catalog", "selected_assets", ids)));
        const before = await json(`SELECT to_jsonb(mi) FROM public.maintenance_items mi WHERE id=${quote(itemId)}::uuid`);
        const deletion = (id) => {
          const payload = {
            request_id: uuid(), asset_id: id, expected_version: 1, confirmation_name: "Concurrent deletion",
          };
          return `SET ROLE authenticated; SET request.jwt.claim.sub=${quote(ownerA)};
            SELECT public.delete_vehicle_asset(${quote(JSON.stringify(payload))}::jsonb);`;
        };
        const first = sql(`SET application_name='vehicles_delete_first'; BEGIN;
          ${deletion(ids[0])} SELECT pg_sleep(0.5); COMMIT;`);
        await until(async () => (await sql(`SELECT count(*) FROM pg_stat_activity
          WHERE application_name='vehicles_delete_first' AND wait_event='PgSleep'`, "postgres")) === "1",
        "first deletion to hold catalog lock");
        await assert.rejects(sql(deletion(ids[1])), /"code":\s*"asset_in_use"/);
        await first;
        assert.deepEqual(await json(`SELECT jsonb_agg(asset_id::text) FROM public.vehicle_maintenance_item_assets
          WHERE maintenance_item_id=${quote(itemId)}::uuid`), [ids[1]]);
        assert.deepEqual(await json(`SELECT to_jsonb(mi) FROM public.maintenance_items mi WHERE id=${quote(itemId)}::uuid`), before);
      });

      await t.test("asset deletion sees a concurrently committed Current Asset Only blocker", async () => {
        const id = uuid();
        await sql(`INSERT INTO public.vehicles_assets(owner_id,id,name,usage_unit)
          VALUES (${quote(ownerA)}::uuid,${quote(id)}::uuid,'Concurrent blocker asset','none')`);
        const itemId = uuid();
        const first = sql(`SET application_name='vehicles_delete_blocker'; BEGIN;
          ${catalogSql(createRequest(itemId, "Concurrent current-only blocker", "current_asset_only", [], { current_asset_id: id }))}
          SELECT pg_sleep(0.5); COMMIT;`);
        await until(async () => (await sql(`SELECT count(*) FROM pg_stat_activity
          WHERE application_name='vehicles_delete_blocker' AND wait_event='PgSleep'`, "postgres")) === "1",
        "catalog creation to hold asset lock");
        const payload = {
          request_id: uuid(), asset_id: id, expected_version: 1, confirmation_name: "Concurrent blocker asset",
        };
        await assert.rejects(sql(`SET ROLE authenticated; SET request.jwt.claim.sub=${quote(ownerA)};
          SELECT public.delete_vehicle_asset(${quote(JSON.stringify(payload))}::jsonb)`), /"code":\s*"asset_in_use"/);
        await first;
        assert.equal(await sql(`SELECT count(*) FROM public.vehicles_assets WHERE id=${quote(id)}::uuid`), "1");
      });
    } finally {
      if (started) {
        await command("pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "30", "stop"]);
        started = false;
      }
      if (directory && path.basename(directory).startsWith("vehicles-catalog-pg-validation-")) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });
