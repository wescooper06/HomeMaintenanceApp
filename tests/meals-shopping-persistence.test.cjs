const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PGlite } = require("@electric-sql/pglite");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "supabase", "review", file), "utf8");
const migration = read("202610300001_meals_shopping.sql");
const enable = (sql, gate) => sql.replace(`${gate} boolean := false`, `${gate} boolean := true`);
const owner = "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60";
const other = "22222222-2222-4222-8222-222222222222";
const tables = ["meals_shopping_categories", "meals_shopping_items"];
const source = fs.readFileSync(path.join(root, "src", "services", "shoppingService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const { shoppingCategoryNames } = vm.runInNewContext(`(()=>{${source};return {shoppingCategoryNames};})()`, {});
let db, before, defaults;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function as(role = "postgres", user = "") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`SET ROLE ${role}`);
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
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  await db.exec(read("202610280001_meals_recipe_foundation.sql"));
  await db.exec("INSERT INTO meals_recipes(title,source) VALUES('Untouched Recipe','raw source')");
  before = await rows("SELECT * FROM meals_recipes");
  defaults = await rows("SELECT * FROM pg_default_acl ORDER BY oid");
});
test.after(async () => { await db?.close(); });

test("disabled migration and collision gates fail closed; additive migration preserves Recipe/default ACL", async () => {
  assert.doesNotMatch(migration, /SECURITY\s+DEFINER|CREATE\s+EXTENSION|ALTER\s+DEFAULT\s+PRIVILEGES|planner_curated_api|planner_broker_access_token_hook/i);
  const preflight = (await rows(read("meals_shopping_preflight.sql")))[0].preflight;
  assert.equal(preflight.owner_confirmed, true);
  assert.deepEqual(preflight.collisions, []);
  await assert.rejects(db.exec(migration), /disabled/);
  await db.exec("ROLLBACK");
  assert.equal((await rows("SELECT to_regclass('public.meals_shopping_items') value"))[0].value, null);
  await db.exec("CREATE TABLE meals_shopping_collision(id int)");
  await assert.rejects(db.exec(enable(migration, "approved_for_execution")), /collision/);
  await db.exec("ROLLBACK; DROP TABLE meals_shopping_collision");
  await db.exec("UPDATE auth.users SET is_anonymous=true");
  await assert.rejects(db.exec(enable(migration, "approved_for_execution")), /prerequisites/);
  await db.exec("ROLLBACK; UPDATE auth.users SET is_anonymous=false");
  await db.exec(enable(migration, "approved_for_execution"));
  assert.deepEqual(await rows("SELECT * FROM meals_recipes"), before);
  assert.deepEqual(await rows("SELECT * FROM pg_default_acl ORDER BY oid"), defaults);
  await assert.rejects(db.exec(enable(migration, "approved_for_execution")), /collision/);
  await db.exec("ROLLBACK");
});

test("exact catalog: ownership, RLS, policies, column ACLs, invoker trigger, seeds, constraints and indexes", async () => {
  const catalog = (await rows(read("meals_shopping_postflight.sql")))[0].verification;
  const relations = catalog.relations.filter((relation) => relation.type === "r");
  assert.equal(relations.length, 2);
  for (const relation of relations) {
    assert.equal(relation.owner, "postgres");
    assert.equal(relation.rls, true);
    assert(!relation.acl.some((entry) => entry.startsWith("anon=") || entry.startsWith("=")));
    assert(relation.acl.some((entry) => entry.startsWith("authenticated=rd/")));
    assert(relation.acl.some((entry) => entry.startsWith("service_role=arwd/")));
  }
  assert.equal(catalog.policies.length, 8);
  for (const table of tables) {
    const policies = catalog.policies.filter((policy) => policy.table === table);
    assert.deepEqual(policies.map((p) => p.command).sort(), ["DELETE", "INSERT", "SELECT", "UPDATE"]);
    for (const policy of policies) {
      assert.deepEqual(policy.roles, ["authenticated"]);
      assert.equal(policy.permissive, "PERMISSIVE");
      for (const expression of [policy.using, policy.check].filter(Boolean)) {
        assert.match(expression, /auth\.uid\(\)/);
        assert.match(expression, new RegExp(owner));
      }
    }
    const grants = catalog.column_grants.filter((grant) => grant.table === table && grant.role === "authenticated");
    const writable = table.endsWith("items") ? ["category_id", "checked", "id", "text"] : ["id", "name"];
    assert.deepEqual(grants.filter((g) => g.privilege === "INSERT").map((g) => g.column).sort(), writable);
    assert.deepEqual(grants.filter((g) => g.privilege === "UPDATE").map((g) => g.column).sort(), writable.filter((c) => c !== "id"));
  }
  assert.equal(catalog.functions.length, 1);
  assert.equal(catalog.functions[0].owner, "postgres");
  assert.equal(catalog.functions[0].definer, false);
  assert(catalog.functions[0].config.includes('search_path=""'));
  assert.deepEqual(catalog.functions[0].acl, ["postgres=X/postgres"]);
  assert.equal(catalog.triggers.length, 3);
  assert.equal(catalog.indexes.length, 5);
  assert.deepEqual(catalog.constraints.map((constraint) => constraint.name).sort(), [
    "meals_shopping_categories_name_check", "meals_shopping_categories_pkey",
    "meals_shopping_categories_predefined_order_check", "meals_shopping_categories_predefined_order_key",
    "meals_shopping_items_category_id_fkey", "meals_shopping_items_pkey", "meals_shopping_items_text_check",
  ]);
  assert(catalog.constraints.some((c) => /FOREIGN KEY \(category_id\).*ON UPDATE RESTRICT ON DELETE RESTRICT/.test(c.definition)));
  assert.deepEqual(catalog.seeds.map((seed) => seed.name), [...shoppingCategoryNames]);
  assert.deepEqual(catalog.seeds.map((seed) => seed.position), Array.from({ length: 28 }, (_, i) => i + 1));
});

test("anon denied all operations; authenticated nonowner and missing JWT denied reads/mutations", async () => {
  await as("anon");
  for (const table of tables) {
    for (const query of [
      `SELECT * FROM ${table}`,
      `INSERT INTO ${table}(${table.endsWith("items") ? "text" : "name"}) VALUES('denied')`,
      `UPDATE ${table} SET ${table.endsWith("items") ? "text" : "name"}='denied'`,
      `DELETE FROM ${table}`,
    ]) await assert.rejects(db.exec(query), /permission denied/);
  }
  for (const user of [other, ""]) {
    await as("authenticated", user);
    for (const table of tables) {
      assert.deepEqual(await rows(`SELECT * FROM ${table}`), []);
      await assert.rejects(db.exec(`INSERT INTO ${table}(${table.endsWith("items") ? "text" : "name"}) VALUES('denied')`), /row-level security/);
      assert.deepEqual(await rows(`UPDATE ${table} SET ${table.endsWith("items") ? "text" : "name"}='denied' RETURNING id`), []);
      assert.deepEqual(await rows(`DELETE FROM ${table} RETURNING id`), []);
    }
  }
  await assert.rejects(db.exec("SELECT meals_shopping_before_write()"), /permission denied/);
});

test("owner manual/Recipe-text-equivalent lifecycle, duplicate preservation, category protection and timestamps", async () => {
  await as("authenticated", owner);
  const category = (await rows("INSERT INTO meals_shopping_categories(name) VALUES('  Custom  ') RETURNING *"))[0];
  assert.equal(category.name, "Custom");
  await assert.rejects(db.exec("INSERT INTO meals_shopping_categories(name) VALUES('custom')"), /unique/);
  const item = (await rows("INSERT INTO meals_shopping_items(text,category_id) VALUES($1,$2) RETURNING *",
    ["  2 eggs \r\n", category.id]))[0];
  assert.equal(item.text, "  2 eggs \r\n");
  assert.equal(item.checked, false);
  await db.query("INSERT INTO meals_shopping_items(text,category_id) VALUES($1,$2)", [item.text, category.id]);
  assert.equal((await rows("SELECT count(*)::int count FROM meals_shopping_items"))[0].count, 2);
  const updated = (await rows("UPDATE meals_shopping_items SET text='edited',checked=true,category_id=null WHERE id=$1 RETURNING *", [item.id]))[0];
  assert.equal(updated.created_at.getTime(), item.created_at.getTime());
  assert(updated.updated_at >= item.updated_at);
  await db.query("UPDATE meals_shopping_items SET checked=false WHERE id=$1", [item.id]);
  await db.query("UPDATE meals_shopping_categories SET name='Renamed' WHERE id=$1", [category.id]);
  await assert.rejects(db.query("DELETE FROM meals_shopping_categories WHERE id=$1", [category.id]), /foreign key/);
  await assert.rejects(db.exec("UPDATE meals_shopping_categories SET name='Bad' WHERE predefined_order=1"), /cannot be changed/);
  await assert.rejects(db.exec("DELETE FROM meals_shopping_categories WHERE predefined_order=1"), /cannot be deleted/);
  for (const table of tables) {
    for (const field of ["created_at", "updated_at", "id"]) {
      await assert.rejects(db.exec(`UPDATE ${table} SET ${field}=${field}`), /permission denied/);
    }
  }
  await assert.rejects(db.exec("INSERT INTO meals_shopping_categories(name,predefined_order) VALUES('Forged',29)"), /permission denied/);
  for (const text of ["", " \t\r\n", "\u00a0"]) {
    await assert.rejects(db.query("UPDATE meals_shopping_items SET text=$1 WHERE id=$2", [text, item.id]), /check constraint/);
  }
  await db.exec("UPDATE meals_shopping_items SET checked=true");
  await db.exec("DELETE FROM meals_shopping_items WHERE checked");
  assert.equal((await rows("SELECT count(*)::int count FROM meals_shopping_items"))[0].count, 0);
  assert.equal((await rows("SELECT count(*)::int count FROM meals_shopping_categories"))[0].count, 29);
  await db.exec("INSERT INTO meals_shopping_items(text) VALUES('again'); DELETE FROM meals_shopping_items");
  await db.query("DELETE FROM meals_shopping_categories WHERE id=$1", [category.id]);
  await as();
  assert.deepEqual(await rows("SELECT * FROM meals_recipes"), before);
});

test("separately guarded reversal refuses retained data and drops only Shopping objects when empty", async () => {
  const reversal = read("meals_shopping_reversal_DISABLED.sql");
  await assert.rejects(db.exec(reversal), /disabled/);
  await db.exec("ROLLBACK");
  await db.exec("INSERT INTO meals_shopping_items(text) VALUES('retain me')");
  await assert.rejects(db.exec(enable(reversal, "approved_for_reversal")), /data exists/);
  await db.exec("ROLLBACK; DELETE FROM meals_shopping_items");
  await db.exec("INSERT INTO meals_shopping_categories(name) VALUES('Retain custom')");
  await assert.rejects(db.exec(enable(reversal, "approved_for_reversal")), /data exists/);
  await db.exec("ROLLBACK; DELETE FROM meals_shopping_categories WHERE predefined_order IS NULL");
  await db.exec(enable(reversal, "approved_for_reversal"));
  assert.equal((await rows("SELECT to_regclass('public.meals_shopping_items') value"))[0].value, null);
  assert.deepEqual(await rows("SELECT * FROM meals_recipes"), before);
});
