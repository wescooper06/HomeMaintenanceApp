const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const review = path.join(__dirname, "..", "supabase", "review");
const read = (file) => fs.readFileSync(path.join(review, file), "utf8");
const migration = read("202610280001_meals_recipe_foundation.sql");
const reversal = read("meals_recipe_reversal_DISABLED.sql");
const preflightFile = read("meals_recipe_preflight.sql");
const supplementMarker = "-- P0B-PREFLIGHT-001-SUPPLEMENT.";
const preflight = preflightFile.split(supplementMarker)[0];
const supplement = supplementMarker + preflightFile.split(supplementMarker)[1];
const postflight = read("meals_recipe_postflight.sql");
const owner = "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60";
const other = "22222222-2222-4222-8222-222222222222";
const tables = ["meals_recipes", "meals_recipe_categories", "meals_recipe_cuisines"];
const enable = (sql, gate) => sql.replace(`${gate} boolean := false`, `${gate} boolean := true`);
let db;
let defaults;

async function as(role = "postgres", id = "") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`SET ROLE ${role}`);
}
async function catalog() {
  await as();
  return (await db.query(postflight)).rows[0].verification;
}
async function assertCatalog() {
  const result = await catalog();
  assert.deepEqual(result.checks.filter((c) => !c.pass), [], JSON.stringify(result, null, 2));
  assert.equal(result.catalog_pass, true);
  return result;
}
async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function recipe(title = "Recipe", sections) {
  return (await rows(`INSERT INTO public.meals_recipes(title,ingredient_sections)
    VALUES ($1,$2::jsonb) RETURNING *`, [title, JSON.stringify(sections ?? [{ name: "Ingredients", text: "" }])]))[0];
}

test.before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,email_confirmed_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users VALUES('${owner}',false,now(),null);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      GRANT ALL ON TABLES TO anon,authenticated,service_role;
  `);
  defaults = await rows("SELECT * FROM pg_default_acl ORDER BY oid");
});
test.after(async () => { await db?.close(); });

test("exact executable candidate, disabled guard, identity gate and conflicting namespace fail closed", async () => {
  const enabledGuard = "approved_for_execution boolean := true;";
  assert.equal(migration.split(enabledGuard).length - 1, 1);
  assert.equal(createHash("sha256").update(migration).digest("hex"),
    "5a741e8ccd0a0a74078fb07890af47ed0d2a74f2aeaafbc608559231f3959c27");
  const disabledMigration = migration.replace(enabledGuard, "approved_for_execution boolean := false;");
  assert.equal(createHash("sha256").update(disabledMigration.replace(/\r?\n/g, "\r\n")).digest("hex"),
    "a59138ebd20edfd211927c62eae8959cb49012fa4217d85abf3da149e52a3418");
  assert.doesNotMatch(migration, /planner_curated_api|planner_broker_access_token_hook|c01098c9|SECURITY\s+DEFINER|CREATE\s+EXTENSION|ALTER\s+DEFAULT\s+PRIVILEGES/i);
  const context = (await rows(preflight))[0].preflight;
  assert.equal(context.collisions.length, 0);
  assert.equal(context.builtins.uuid, true);
  assert.equal(context.owner_identity.confirmed, true);
  assert.equal(context.project_identity_requires_browser_confirmation, true);
  const supplemental = (await rows(supplement))[0].supplement;
  assert.deepEqual(supplemental.collisions, []);
  assert(Object.values(supplemental.search_samples).every(Boolean));
  assert(supplemental.collation_samples.filter((s) => ["ASCII", "NBSP", "EM_SPACE"].includes(s.label))
    .every((s) => s.canonical === "Dinner"));
  await assert.rejects(db.exec(disabledMigration), /migration disabled/);
  await db.exec("ROLLBACK");
  assert.equal((await rows("SELECT to_regclass('public.meals_recipes') AS value"))[0].value, null);
  await db.exec("CREATE TABLE public.meals_collision(id integer)");
  await assert.rejects(db.exec(migration), /namespace collision/);
  await db.exec("ROLLBACK; DROP TABLE public.meals_collision");
  await db.exec("UPDATE auth.users SET is_anonymous=true");
  await assert.rejects(db.exec(migration), /prerequisite failed/);
  await db.exec("ROLLBACK; UPDATE auth.users SET is_anonymous=false");
  await db.exec(migration);
  await assertCatalog();
  assert.deepEqual(await rows("SELECT * FROM pg_default_acl ORDER BY oid"), defaults);
});

test("anon lacks every table operation and trigger execution", async () => {
  await as("anon");
  for (const table of tables) {
    for (const sql of [
      `SELECT * FROM public.${table}`,
      `INSERT INTO public.${table} (${table === "meals_recipes" ? "title" : "name"}) VALUES ('denied')`,
      `UPDATE public.${table} SET ${table === "meals_recipes" ? "title" : "name"}='denied'`,
      `DELETE FROM public.${table}`,
    ]) await assert.rejects(db.exec(sql), /permission denied/);
  }
  await assert.rejects(db.exec("SELECT public.meals_recipe_before_write()"), /permission denied/);
});

test("owner CRUD, text round trips, defaults, section order and atomic invalid saves", async () => {
  await as("authenticated", owner);
  const text = "\r\n  1 cup flour\r\n\r\n2 eggs\n\n";
  const instructions = "\n\n  Mix.\r\n\r\nBake.  \n";
  const source = "  Cookbook page 4\r\n";
  const sections = [{ name: " \tDough \n", text }, { name: "", text: "" }];
  const r = await recipe("  Bread  ", sections);
  assert.deepEqual(r.ingredient_sections, sections);
  assert.equal(r.title, "  Bread  ");
  const updated = (await rows(`UPDATE public.meals_recipes SET instructions=$1,
    ingredient_sections=$2::jsonb,favorite=true,source=$4 WHERE id=$3 RETURNING *`,
  [instructions, JSON.stringify(sections.slice().reverse()), r.id, source]))[0];
  assert.equal(updated.instructions, instructions);
  assert.equal(updated.source, source);
  assert.deepEqual(updated.ingredient_sections, sections.slice().reverse());
  assert.equal(updated.created_at.getTime(), r.created_at.getTime());
  assert(updated.updated_at >= r.updated_at);
  const defaultRow = (await rows("INSERT INTO public.meals_recipes(title) VALUES ('Only required field') RETURNING *"))[0];
  assert.deepEqual(defaultRow.ingredient_sections, [{ name: "Ingredients", text: "" }]);
  assert.equal(defaultRow.category_id, null);
  assert.equal(defaultRow.cuisine_id, null);
  assert.equal(defaultRow.source, "");
  assert.equal(defaultRow.instructions, "");
  assert.equal(defaultRow.favorite, false);
  const empty = await recipe("Empty sections", []);
  assert.deepEqual(empty.ingredient_sections, []);
  for (const invalid of [{}, null, [{ name: "X" }], [{ name: 7, text: "" }],
    [{ name: "X", text: null }], [{ name: "X", text: "", extra: true }]]) {
    await assert.rejects(db.query(`UPDATE public.meals_recipes SET title='must not persist',
      ingredient_sections=$1::jsonb WHERE id=$2`, [JSON.stringify(invalid), r.id]), /sections|section/);
    assert.equal((await rows("SELECT title FROM public.meals_recipes WHERE id=$1", [r.id]))[0].title, r.title);
  }
  for (const title of ["", " \t\r\n"]) await assert.rejects(recipe(title), /check constraint/);
  await assert.rejects(db.exec("INSERT INTO public.meals_recipes DEFAULT VALUES"), /null value/);
  await assert.rejects(db.query("UPDATE public.meals_recipes SET category_id=$1 WHERE id=$2", [other, r.id]), /foreign key/);
  for (const column of ["id", "created_at", "updated_at"]) {
    await assert.rejects(db.query(`UPDATE public.meals_recipes SET ${column}=${column} WHERE id=$1`, [r.id]), /permission denied/);
  }
  await assert.rejects(db.exec(`INSERT INTO public.meals_recipes(title,created_at)
    VALUES ('No client timestamps','2000-01-01')`), /permission denied/);
  await db.query("DELETE FROM public.meals_recipes WHERE id=$1", [empty.id]);
  assert.equal((await rows("SELECT id FROM public.meals_recipes WHERE id=$1", [empty.id])).length, 0);
});

test("lookup create/select/rename/unused delete; normalized uniqueness and referenced delete rejection", async () => {
  await as("authenticated", owner);
  const r = await recipe("Classification");
  for (const [table, column] of [["meals_recipe_categories", "category_id"], ["meals_recipe_cuisines", "cuisine_id"]]) {
    const lookup = (await rows(`INSERT INTO public.${table}(name) VALUES (E' \\tDinner\\r\\n') RETURNING *`))[0];
    assert.equal(lookup.name, "Dinner");
    for (const duplicate of ["dinner", " DINNER ", "\tDinner\r\n"]) {
      await assert.rejects(db.query(`INSERT INTO public.${table}(name) VALUES ($1)`, [duplicate]), /unique constraint/);
    }
    await assert.rejects(db.query(`INSERT INTO public.${table}(name) VALUES ($1)`, [" \t\n"]), /check constraint/);
    await db.query(`UPDATE public.meals_recipes SET ${column}=$1 WHERE id=$2`, [lookup.id, r.id]);
    await db.query(`UPDATE public.${table} SET name=$2 WHERE id=$1`, [lookup.id, "\u00a0Renamed\u2003"]);
    assert.equal((await rows(`SELECT name FROM public.${table} WHERE id=$1`, [lookup.id]))[0].name, "Renamed");
    for (const padding of [" ", "\t\r\n", "\u00a0", "\u2003", "\ufeff", "\u2028", "\u3000"]) {
      await assert.rejects(db.query(`INSERT INTO public.${table}(name) VALUES ($1)`, [padding]), /check constraint/);
      await assert.rejects(db.query(`INSERT INTO public.${table}(name) VALUES ($1)`, [padding + "RENAMED" + padding]), /unique constraint/);
    }
    assert.equal((await rows(`SELECT l.name FROM public.meals_recipes r
      JOIN public.${table} l ON l.id=r.${column} WHERE r.id=$1`, [r.id]))[0].name, "Renamed");
    await assert.rejects(db.query(`DELETE FROM public.${table} WHERE id=$1`, [lookup.id]), /foreign key/);
    await db.query(`UPDATE public.meals_recipes SET ${column}=NULL WHERE id=$1`, [r.id]);
    await db.query(`DELETE FROM public.${table} WHERE id=$1`, [lookup.id]);
    assert.equal((await rows(`SELECT * FROM public.${table} WHERE id=$1`, [lookup.id])).length, 0);
  }
});

test("non-owner and missing JWT cannot read, create, update or delete any owner-domain row", async () => {
  await as("authenticated", owner);
  for (const table of tables.slice(1)) await db.exec(`INSERT INTO public.${table}(name) VALUES ('Private')`);
  const before = {};
  for (const table of tables) before[table] = await rows(`SELECT * FROM public.${table} ORDER BY id`);
  for (const id of [other, ""]) {
    await as("authenticated", id);
    for (const table of tables) {
      const field = table === "meals_recipes" ? "title" : "name";
      assert.equal((await rows(`SELECT * FROM public.${table}`)).length, 0);
      await assert.rejects(db.exec(`INSERT INTO public.${table}(${field}) VALUES ('denied')`), /row-level security/);
      assert.equal((await rows(`UPDATE public.${table} SET ${field}='denied' RETURNING id`)).length, 0);
      assert.equal((await rows(`DELETE FROM public.${table} RETURNING id`)).length, 0);
    }
    await assert.rejects(db.exec("SELECT public.meals_recipe_before_write()"), /permission denied/);
  }
  await as("authenticated", owner);
  for (const table of tables) assert.deepEqual(await rows(`SELECT * FROM public.${table} ORDER BY id`), before[table]);
});

test("search design: literal symbols, section text, AND filters and complete keyset pagination", async () => {
  await as("authenticated", owner);
  for (let index = 0; index < 8; index++) await recipe(`search padding ${index}`);
  const wanted = (await rows(`INSERT INTO public.meals_recipes(id,title,ingredient_sections)
    VALUES ('ffffffff-ffff-4fff-bfff-ffffffffffff',$1,$2::jsonb) RETURNING *`,
  ["Literal 50%_\\ Dinner", JSON.stringify([{ name: "Not searchable section name", text: "AaBb\n\nCORN 50%_\\\n" }])]))[0];
  const category = (await rows("INSERT INTO public.meals_recipe_categories(name) VALUES ('Search category') RETURNING id"))[0].id;
  const cuisine = (await rows("INSERT INTO public.meals_recipe_cuisines(name) VALUES ('Search cuisine') RETURNING id"))[0].id;
  await db.query("UPDATE public.meals_recipes SET favorite=true,category_id=$2,cuisine_id=$3 WHERE id=$1",
    [wanted.id, category, cuisine]);
  const loaded = [];
  let cursor = null;
  for (;;) {
    const page = await rows(`SELECT * FROM public.meals_recipes
      WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 2`, [cursor]);
    if (!page.length) break;
    loaded.push(...page);
    cursor = page.at(-1).id;
  }
  assert.equal(loaded.length, (await rows("SELECT count(*)::integer AS n FROM public.meals_recipes"))[0].n);
  assert(loaded.findIndex((r) => r.id === wanted.id) >= 2, "Match must be beyond the first API-sized page.");
  const match = (r, term) => r.title.toLowerCase().includes(term.toLowerCase())
    || r.ingredient_sections.some((s) => s.text.toLowerCase().includes(term.toLowerCase()));
  assert.deepEqual(loaded.filter((r) => match(r, "CORN 50%_\\") && r.favorite).map((r) => r.id), [wanted.id]);
  assert.equal(match(wanted, "Not searchable section name"), false);
  for (const term of ["50%_\\", "%", "_", "\\", "corn"]) {
    const escaped = term.replace(/[\\%_]/g, (c) => "\\" + c);
    const result = await rows(`SELECT r.id FROM public.meals_recipes r
      WHERE (r.title ILIKE $1 ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(r.ingredient_sections) s WHERE s->>'text' ILIKE $1 ESCAPE '\\'))
        AND r.favorite=true AND ($2::uuid IS NULL OR r.category_id=$2)
        AND ($3::uuid IS NULL OR r.cuisine_id=$3)`, [`%${escaped}%`, category, cuisine]);
    assert.deepEqual(result.map((r) => r.id), [wanted.id]);
  }
  assert.equal(loaded.filter((r) => match(r, "corn") && r.category_id === other).length, 0);
});

test("administrative access is explicit, not an RLS owner-auth test; catalog detects drift", async () => {
  await as("service_role");
  const r = await recipe("Administrative fixture");
  assert(r.id);
  const forced = (await rows(`INSERT INTO public.meals_recipes(title,created_at,updated_at)
    VALUES ('Server timestamps','2000-01-01','2000-01-01') RETURNING *`))[0];
  assert(forced.created_at.getUTCFullYear() > 2000);
  assert(forced.updated_at.getUTCFullYear() > 2000);
  await assert.rejects(db.query("UPDATE public.meals_recipes SET id=$1 WHERE id=$2", [other, forced.id]), /identity cannot change/);
  await db.query("DELETE FROM public.meals_recipes WHERE id=$1", [forced.id]);
  await db.query("DELETE FROM public.meals_recipes WHERE id=$1", [r.id]);
  const original = await assertCatalog();
  assert.equal(original.function.length, 1);
  const expectedBody = migration.split("AS $function$")[1].split("$function$;")[0].replace(/\r/g, "");
  const storedBody = (await rows("SELECT prosrc FROM pg_proc WHERE oid='public.meals_recipe_before_write()'::regprocedure"))[0].prosrc;
  assert.equal(storedBody.replace(/\r/g, ""), expectedBody);
  await db.exec(original.function[0].definition.replace("NEW.updated_at := statement_timestamp();",
    "NEW.updated_at := '2000-01-01';"));
  let drift = await catalog();
  assert(drift.checks.some((c) => c.name === "function_security" && !c.pass));
  await db.exec(original.function[0].definition);
  await db.exec("GRANT SELECT ON public.meals_recipes TO anon");
  drift = await catalog();
  assert.equal(drift.catalog_pass, false);
  assert(drift.checks.some((c) => c.name === "effective_anon_denial" && !c.pass));
  await db.exec("REVOKE SELECT ON public.meals_recipes FROM anon");
  await db.exec("CREATE POLICY extra ON public.meals_recipes FOR SELECT TO authenticated USING (true)");
  drift = await catalog();
  assert(drift.checks.some((c) => c.name === "policy_matrix" && !c.pass));
  await db.exec("DROP POLICY extra ON public.meals_recipes");
  await db.exec(`ALTER TABLE public.meals_recipes DROP CONSTRAINT meals_recipes_title_nonblank;
    ALTER TABLE public.meals_recipes ADD CONSTRAINT meals_recipes_title_nonblank CHECK (true)`);
  drift = await catalog();
  assert(drift.checks.some((c) => c.name === "exact_constraints" && !c.pass));
  await db.exec(`ALTER TABLE public.meals_recipes DROP CONSTRAINT meals_recipes_title_nonblank;
    ALTER TABLE public.meals_recipes ADD CONSTRAINT meals_recipes_title_nonblank CHECK (title ~ '[^[:space:]]')`);
  await assertCatalog();
});

test("disabled reversal, nonempty refusal, RESTRICT dependencies, empty reversal and fresh reapplication", async () => {
  await as();
  await assert.rejects(db.exec(reversal), /reversal disabled/);
  await db.exec("ROLLBACK");
  await assert.rejects(db.exec(enable(reversal, "approved_for_reversal")), /data exists/);
  await db.exec("ROLLBACK");
  for (const table of tables) await db.exec(`DELETE FROM public.${table}`);
  await db.exec("CREATE VIEW public.test_meals_dependency AS SELECT id FROM public.meals_recipes");
  await assert.rejects(db.exec(enable(reversal, "approved_for_reversal")), /depend/);
  await db.exec("ROLLBACK; DROP VIEW public.test_meals_dependency");
  await db.exec(enable(reversal, "approved_for_reversal"));
  assert.equal((await rows("SELECT to_regclass('public.meals_recipes') AS value"))[0].value, null);
  await db.exec(migration);
  await assertCatalog();
  assert.deepEqual(await rows("SELECT * FROM pg_default_acl ORDER BY oid"), defaults);
});
