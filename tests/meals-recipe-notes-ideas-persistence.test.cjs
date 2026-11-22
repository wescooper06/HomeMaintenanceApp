const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PGlite } = require("@electric-sql/pglite");

const review = path.join(__dirname, "..", "supabase", "review");
const read = (file) => fs.readFileSync(path.join(review, file), "utf8");
const migration = read("202611180001_meals_recipe_notes_ideas.sql");
const preflight = read("meals_recipe_notes_ideas_preflight.sql");
const postflight = read("meals_recipe_notes_ideas_postflight.sql");
const plannerMigration = read("202610300002_meals_planner.sql");
const preserveFunctionDefinition = plannerMigration
  .match(/CREATE FUNCTION public\.meals_planner_preserve_recipe\(\)[\s\S]*?\$function\$;/)[0]
  .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
const owner = "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60";
const other = "22222222-2222-4222-8222-222222222222";
const enable = (sql) => sql.replace("approved_for_execution boolean := false", "approved_for_execution boolean := true");
const expectedPreserveTrigger = `CREATE TRIGGER meals_planner_preserve_recipe BEFORE DELETE ON public.meals_recipes
  FOR EACH ROW EXECUTE FUNCTION public.meals_planner_preserve_recipe()`;
const expectedRecipeWriteTrigger = `CREATE TRIGGER meals_recipe_before_write BEFORE INSERT OR UPDATE ON public.meals_recipes
  FOR EACH ROW EXECUTE FUNCTION public.meals_recipe_before_write()`;

let db;
let defaults;
let originalRecipes;

async function as(role = "postgres", user = "") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`SET ROLE ${role}`);
}

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function createIdea(id, text) {
  return (await rows("SELECT public.meals_ideas_create($1,$2) AS idea", [id, text]))[0].idea;
}

async function moveIdea(id, direction) {
  return (await rows("SELECT public.meals_ideas_move($1,$2) AS receipt", [id, direction]))[0].receipt;
}

async function assertUniquePositions() {
  const [result] = await rows("SELECT count(*)::int AS total,count(DISTINCT position)::int AS distinct_count FROM public.meals_ideas");
  assert.equal(result.total, result.distinct_count);
}

async function recipeTriggerSnapshot() {
  return (await rows(`
    SELECT t.tgname,t.tgtype,t.tgenabled,t.tgisinternal,t.tgconstraint,
      t.tgdeferrable,t.tginitdeferred,t.tgfoid::regprocedure::text AS function,
      pg_catalog.md5(pg_catalog.replace(p.prosrc,pg_catalog.chr(13),'')) AS function_body
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid='public.meals_recipes'::regclass AND NOT t.tgisinternal
    ORDER BY t.tgname
  `)).map(({ tgname, ...trigger }) => ({ name: tgname, ...trigger }));
}

async function assertRecipeTriggerGateFails() {
  const result = (await rows(preflight))[0].preflight;
  assert.equal(result.recipe_trigger_inventory_matches_reviewed_pattern, false);
  await assert.rejects(db.exec(enable(migration)), /Recipe trigger inventory differs/);
  await db.exec("ROLLBACK");
}

test.before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
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
  await db.exec(read("202610280001_meals_recipe_foundation.sql"));
  await db.exec(enable(plannerMigration));
  await db.query("INSERT INTO public.meals_recipes(title,source) VALUES('Existing Recipe','source text')");
  originalRecipes = await rows(`SELECT id,title,category_id,cuisine_id,source,favorite,ingredient_sections,
    instructions,created_at,updated_at FROM public.meals_recipes ORDER BY id`);
  defaults = await rows("SELECT * FROM pg_default_acl ORDER BY oid");
});

test.after(async () => { await db?.close(); });

test("read-only preflight confirms the baseline and the disabled candidate fails closed", async () => {
  const result = (await rows(preflight))[0].preflight;
  assert.equal(result.project_identity_requires_dashboard_confirmation, true);
  assert.equal(JSON.stringify(result).includes(owner), false);
  assert.equal(result.recipe_table_found, true);
  assert.equal(result.recipe_rls_enabled, true);
  assert.deepEqual(result.candidate_notes_fields, []);
  assert.equal(result.recipe_owner_policy_matrix_matches_reviewed_pattern, true);
  assert.deepEqual(result.ideas_namespace_collisions, []);
  assert.equal(result.recipe_columns.length, 10);
  assert.equal(result.recipe_trigger_inventory_matches_reviewed_pattern, true);
  assert.deepEqual(result.recipe_triggers.map(({ name, timing, events, function: functionName }) =>
    [name, timing, events, functionName]), [
    ["meals_planner_preserve_recipe", "BEFORE", "DELETE", "meals_planner_preserve_recipe"],
    ["meals_recipe_before_write", "BEFORE", "INSERT, UPDATE", "meals_recipe_before_write"],
  ]);

  assert.equal(migration.split("approved_for_execution boolean := false").length - 1, 1);
  await assert.rejects(db.exec(migration), /candidate disabled/);
  await db.exec("ROLLBACK");
  assert.equal((await rows("SELECT to_regclass('public.meals_ideas') AS value"))[0].value, null);
  assert.equal((await rows("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='public.meals_recipes'::regclass AND attname='notes' AND NOT attisdropped"))[0].n, 0);
});

test("Recipe trigger preflight rejects a missing preserve trigger", async () => {
  await db.exec("DROP TRIGGER meals_planner_preserve_recipe ON public.meals_recipes");
  await assertRecipeTriggerGateFails();
  await db.exec(expectedPreserveTrigger);
});

test("Recipe trigger preflight rejects altered timing, events, function, or function body", async () => {
  const variants = [
    `CREATE TRIGGER meals_planner_preserve_recipe AFTER DELETE ON public.meals_recipes
      FOR EACH ROW EXECUTE FUNCTION public.meals_planner_preserve_recipe()`,
    `CREATE TRIGGER meals_planner_preserve_recipe BEFORE UPDATE ON public.meals_recipes
      FOR EACH ROW EXECUTE FUNCTION public.meals_planner_preserve_recipe()`,
    `CREATE TRIGGER meals_planner_preserve_recipe BEFORE DELETE ON public.meals_recipes
      FOR EACH ROW EXECUTE FUNCTION public.meals_recipe_before_write()`,
  ];
  for (const definition of variants) {
    await db.exec("DROP TRIGGER meals_planner_preserve_recipe ON public.meals_recipes");
    await db.exec(definition);
    await assertRecipeTriggerGateFails();
    await db.exec("DROP TRIGGER meals_planner_preserve_recipe ON public.meals_recipes");
    await db.exec(expectedPreserveTrigger);
  }

  await db.exec(`CREATE OR REPLACE FUNCTION public.meals_planner_preserve_recipe()
    RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
    AS $test$ BEGIN RETURN OLD; END $test$`);
  await assertRecipeTriggerGateFails();
  await db.exec(preserveFunctionDefinition);
});

test("Recipe trigger preflight rejects an unexpected third trigger and a changed timestamp trigger", async () => {
  await db.exec(`CREATE TRIGGER meals_unexpected_recipe BEFORE DELETE ON public.meals_recipes
    FOR EACH ROW EXECUTE FUNCTION public.meals_planner_preserve_recipe()`);
  await assertRecipeTriggerGateFails();
  await db.exec("DROP TRIGGER meals_unexpected_recipe ON public.meals_recipes");

  await db.exec("DROP TRIGGER meals_recipe_before_write ON public.meals_recipes");
  await db.exec(`CREATE TRIGGER meals_recipe_before_write BEFORE INSERT ON public.meals_recipes
    FOR EACH ROW EXECUTE FUNCTION public.meals_recipe_before_write()`);
  await assertRecipeTriggerGateFails();
  await db.exec("DROP TRIGGER meals_recipe_before_write ON public.meals_recipes");
  await db.exec(expectedRecipeWriteTrigger);
});

test("identity and namespace mismatches abort without modifying the existing Recipe catalog", async () => {
  await db.exec("CREATE TABLE public.meals_ideas_collision(id integer)");
  await assert.rejects(db.exec(enable(migration)), /namespace collision/);
  await db.exec("ROLLBACK; DROP TABLE public.meals_ideas_collision");

  await db.exec("UPDATE auth.users SET is_anonymous=true");
  await assert.rejects(db.exec(enable(migration)), /identity or role preconditions/);
  await db.exec("ROLLBACK; UPDATE auth.users SET is_anonymous=false");

  await db.exec("ALTER TABLE public.meals_recipes ADD COLUMN description text");
  await assert.rejects(db.exec(enable(migration)), /Recipe table inventory/);
  await db.exec("ROLLBACK; ALTER TABLE public.meals_recipes DROP COLUMN description");
  assert.deepEqual(await rows(`SELECT id,title,category_id,cuisine_id,source,favorite,ingredient_sections,
    instructions,created_at,updated_at FROM public.meals_recipes ORDER BY id`), originalRecipes);
});

test("expected two-trigger candidate preserves both triggers and reports exact postflight catalog", async () => {
  const triggersBefore = await recipeTriggerSnapshot();
  await db.exec(enable(migration));
  assert.deepEqual(await recipeTriggerSnapshot(), triggersBefore);
  assert.deepEqual(await rows(`SELECT id,title,category_id,cuisine_id,source,favorite,ingredient_sections,
    instructions,created_at,updated_at FROM public.meals_recipes ORDER BY id`), originalRecipes);
  assert.deepEqual(await rows("SELECT * FROM pg_default_acl ORDER BY oid"), defaults);
  assert.equal((await rows("SELECT notes FROM public.meals_recipes"))[0].notes, null);

  const verification = (await rows(postflight))[0].verification;
  assert.deepEqual(verification.checks.filter((check) => !check.pass), [], JSON.stringify(verification, null, 2));
  assert.equal(verification.catalog_pass, true);

  await db.exec("DROP TRIGGER meals_planner_preserve_recipe ON public.meals_recipes");
  const missingTriggerVerification = (await rows(postflight))[0].verification;
  assert.deepEqual(missingTriggerVerification.checks.filter((check) => !check.pass)
    .map(({ name }) => name), ["recipe_trigger_inventory_unchanged"]);
  await db.exec(expectedPreserveTrigger);
  assert.deepEqual(await recipeTriggerSnapshot(), triggersBefore);

  await as("authenticated", owner);
  const [linkedRecipe] = await rows("INSERT INTO public.meals_recipes(title) VALUES('Planner preservation fixture') RETURNING id");
  const [entry] = await rows(`INSERT INTO public.meals_planner_entries(meal_date,meal_type,recipe_id)
    VALUES('2026-11-18','dinner',$1) RETURNING id`, [linkedRecipe.id]);
  await rows("DELETE FROM public.meals_recipes WHERE id=$1", [linkedRecipe.id]);
  const [preservedEntry] = await rows("SELECT recipe_id,display_text FROM public.meals_planner_entries WHERE id=$1", [entry.id]);
  assert.equal(preservedEntry.recipe_id, null);
  assert.equal(preservedEntry.display_text, "Planner preservation fixture");
  await as();
});

test("Recipe Notes round-trip, NULL compatibility and column grants preserve existing fields", async () => {
  await as("authenticated", owner);
  const [existing] = await rows("SELECT * FROM public.meals_recipes");
  assert.equal(existing.notes, null);

  const notes = "\r\n  Keep exact lines.\n\n";
  const updated = (await rows("UPDATE public.meals_recipes SET notes=$1 WHERE id=$2 RETURNING *", [notes, existing.id]))[0];
  assert.equal(updated.notes, notes);
  assert.equal(updated.title, existing.title);
  assert.equal(updated.source, existing.source);
  assert.equal(updated.instructions, existing.instructions);
  assert.deepEqual(updated.ingredient_sections, existing.ingredient_sections);
  assert.equal(updated.created_at.getTime(), existing.created_at.getTime());
  assert(updated.updated_at >= existing.updated_at);

  const inserted = (await rows("INSERT INTO public.meals_recipes(title,notes) VALUES('New Recipe',$1) RETURNING notes", ["new note"]))[0];
  assert.equal(inserted.notes, "new note");
  const defaulted = (await rows("INSERT INTO public.meals_recipes(title) VALUES('No Notes Yet') RETURNING notes"))[0];
  assert.equal(defaulted.notes, null);
  await rows("UPDATE public.meals_recipes SET notes=NULL WHERE id=$1", [existing.id]);
  assert.equal((await rows("SELECT notes FROM public.meals_recipes WHERE id=$1", [existing.id]))[0].notes, null);
  await rows("UPDATE public.meals_recipes SET notes='preserve me' WHERE id=$1", [existing.id]);
  await rows("UPDATE public.meals_recipes SET favorite=true WHERE id=$1", [existing.id]);
  assert.equal((await rows("SELECT notes FROM public.meals_recipes WHERE id=$1", [existing.id]))[0].notes, "preserve me");
  await assert.rejects(db.exec("UPDATE public.meals_recipes SET updated_at=updated_at"), /permission denied/);
});

test("Ideas append, edits and check state keep stable manual positions and timestamps", async () => {
  await as("authenticated", owner);
  const a = await createIdea("30000000-0000-4000-8000-000000000001", "  \u00a0Idea A\r\n\n");
  const b = await createIdea("30000000-0000-4000-8000-000000000002", "Idea B");
  const c = await createIdea("30000000-0000-4000-8000-000000000003", "Idea C");
  assert.equal(a.text, "  \u00a0Idea A\r\n\n");
  assert.equal(a.position, 1);
  assert.equal(b.position, 2);
  assert.equal(c.position, 3);
  assert.equal((await createIdea(a.id, a.text)).position, 1);
  await assert.rejects(createIdea(a.id, "different text"), (error) => error.code === "23505");
  await assert.rejects(createIdea("30000000-0000-4000-8000-000000000004", "\u00a0"), (error) => error.code === "22023");

  const before = (await rows("SELECT * FROM public.meals_ideas WHERE id=$1", [b.id]))[0];
  const checked = (await rows("UPDATE public.meals_ideas SET checked=true WHERE id=$1 RETURNING *", [b.id]))[0];
  assert.equal(checked.position, before.position);
  assert.equal(checked.checked, true);
  assert.equal(checked.created_at.getTime(), before.created_at.getTime());
  assert(checked.updated_at >= before.updated_at);
  const edited = (await rows("UPDATE public.meals_ideas SET text=$1 WHERE id=$2 RETURNING *", ["Edited B", b.id]))[0];
  assert.equal(edited.position, before.position);
  assert.equal(edited.checked, true);
  assert.deepEqual((await rows("SELECT id,position,checked FROM public.meals_ideas ORDER BY position,id")).map((row) => row.id), [
    a.id, b.id, c.id,
  ]);
  await assertUniquePositions();
});

test("adjacent moves are atomic, include checked Ideas, update timestamps and return reconciliation data", async () => {
  await as("authenticated", owner);
  const [a, b, c] = await rows("SELECT id,position,checked,updated_at FROM public.meals_ideas ORDER BY position,id");
  const before = await rows("SELECT id,position,updated_at FROM public.meals_ideas ORDER BY position,id");
  const up = await moveIdea(b.id, -1);
  assert.equal(up.moved, true);
  assert.deepEqual(up.items.map(({ id }) => id), [b.id, a.id, c.id]);
  assert.deepEqual(up.items.map(({ position }) => position), [1, 2, 3]);
  assert(up.items[0].updated_at >= before[0].updated_at.toISOString());
  assert(up.items[1].updated_at >= before[1].updated_at.toISOString());
  assert.equal((await rows("SELECT checked FROM public.meals_ideas WHERE id=$1", [b.id]))[0].checked, true);
  await assertUniquePositions();

  const down = await moveIdea(b.id, 1);
  assert.equal(down.moved, true);
  assert.deepEqual(down.items.map(({ id }) => id), [a.id, b.id, c.id]);
  const boundary = await moveIdea(a.id, -1);
  assert.equal(boundary.moved, false);
  assert.deepEqual(boundary.items.map(({ id }) => id), [a.id, b.id, c.id]);
  await assertUniquePositions();

  await assert.rejects(moveIdea(b.id, 0), (error) => error.code === "22023");
  await assert.rejects(moveIdea("30000000-0000-4000-8000-000000000099", 1), (error) => error.code === "P0002");
});

test("deletion removes only the target and gaps do not break adjacent ordering or append", async () => {
  await as("authenticated", owner);
  const [a, b, c] = await rows("SELECT id,position FROM public.meals_ideas ORDER BY position,id");
  const deleted = await rows("DELETE FROM public.meals_ideas WHERE id=$1 RETURNING id", [b.id]);
  assert.deepEqual(deleted, [{ id: b.id }]);
  let ordered = await rows("SELECT id,position FROM public.meals_ideas ORDER BY position,id");
  assert.deepEqual(ordered.map(({ id }) => id), [a.id, c.id]);
  assert.deepEqual(ordered.map(({ position }) => position), [1, 3]);

  const moved = await moveIdea(c.id, -1);
  assert.equal(moved.moved, true);
  assert.deepEqual(moved.items.map(({ id }) => id), [c.id, a.id]);
  assert.deepEqual(moved.items.map(({ position }) => position), [1, 3]);
  await assertUniquePositions();

  const d = await createIdea("30000000-0000-4000-8000-000000000004", "Idea D");
  assert.equal(d.position, 4);
  ordered = await rows("SELECT id,position FROM public.meals_ideas ORDER BY position,id");
  assert.deepEqual(ordered.map(({ id }) => id), [c.id, a.id, d.id]);
  await assertUniquePositions();
  await assert.rejects(db.exec("UPDATE public.meals_ideas SET position=position"), /permission denied/);
  await assert.rejects(db.exec("INSERT INTO public.meals_ideas(text,position) VALUES('forged',5)"), /permission denied/);
});

test("anon, non-owner and service_role cannot use Ideas tables or owner RPCs", async () => {
  await as("anon");
  for (const statement of [
    "SELECT * FROM public.meals_ideas",
    "INSERT INTO public.meals_ideas(text,position) VALUES('denied',99)",
    "UPDATE public.meals_ideas SET text='denied'",
    "DELETE FROM public.meals_ideas",
  ]) await assert.rejects(db.exec(statement), /permission denied/);
  await assert.rejects(createIdea("30000000-0000-4000-8000-000000000087", "denied"), /permission denied/);
  await assert.rejects(moveIdea("30000000-0000-4000-8000-000000000001", 1), /permission denied/);

  for (const user of [other, ""]) {
    await as("authenticated", user);
    assert.deepEqual(await rows("SELECT * FROM public.meals_ideas"), []);
    assert.deepEqual(await rows("UPDATE public.meals_ideas SET text='denied' RETURNING id"), []);
    assert.deepEqual(await rows("DELETE FROM public.meals_ideas RETURNING id"), []);
    await assert.rejects(createIdea("30000000-0000-4000-8000-000000000088", "denied"), (error) => error.code === "42501");
    await assert.rejects(moveIdea("30000000-0000-4000-8000-000000000001", 1), (error) => error.code === "42501");
  }

  await as("service_role", owner);
  await assert.rejects(db.exec("SELECT * FROM public.meals_ideas"), /permission denied/);
  await assert.rejects(moveIdea("30000000-0000-4000-8000-000000000001", 1), /permission denied/);

  await as("authenticated", owner);
  await assert.rejects(db.exec("SELECT public.meals_ideas_before_write()"), /permission denied/);
});
