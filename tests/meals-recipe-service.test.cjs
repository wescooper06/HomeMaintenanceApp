const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PGlite } = require("@electric-sql/pglite");

const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "src", "services", "recipeService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const model = vm.runInThisContext(`(() => { ${code}; return {
  createRecipeService, newRecipe, recipeMatches, sortRecipes, recipeSourceUrl
}; })()`);
const owner = "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60";
let db, service;
const calls = [];
let failNext = false;
let failPage = false;
let loseInsertResponse = false;
let cap = 2;
function client() {
  return { from(table) {
    assert(["meals_recipes", "meals_recipe_categories", "meals_recipe_cuisines"].includes(table));
    let operation = "select", values, columns = "*", filter = "", params = [], single = false, maybe = false, order = false, limit, exact;
    const builder = {
      select(value, options) { columns = value; if (options?.count === "exact") exact = true; return builder; },
      insert(value) { operation = "insert"; values = value; return builder; },
      update(value) { operation = "update"; values = value; return builder; },
      delete(options) { operation = "delete"; exact = options?.count === "exact"; return builder; },
      eq(key, value) { assert.equal(key, "id"); params = [value]; filter = " WHERE id=$1"; return builder; },
      in(key, value) { assert.equal(key, "id"); params = value; filter = ` WHERE id IN (${value.map((_, i) => `$${i + 1}`).join(",")})`; return builder; },
      gt(key, value) { assert.equal(key, "id"); params = [value]; filter = " WHERE id>$1"; return builder; },
      order(key, options) { assert.equal(key, "id"); assert.equal(options.ascending, true); order = true; return builder; },
      limit(value) { limit = Math.min(value, cap); return builder; },
      single() { single = true; return builder; },
      maybeSingle() { maybe = true; return builder; },
      then(resolve, reject) {
        return (async () => {
          calls.push({ table, operation, values, filter, exact });
          if (failNext || (failPage && filter.includes(">"))) {
            failNext = false; failPage = false;
            return { data: null, error: { message: "Injected offline failure" } };
          }
          try {
            let sql, args = params, count = null;
            if (operation === "select") {
              if (exact) count = Number((await db.query(`SELECT count(*) AS n FROM ${table}${filter}`, params)).rows[0].n);
              sql = `SELECT ${columns} FROM ${table}${filter}${order ? " ORDER BY id" : ""}${limit ? ` LIMIT ${limit}` : ""}`;
            } else if (operation === "insert") {
              args = Object.values(values).map((value) => typeof value === "object" && value !== null ? JSON.stringify(value) : value);
              const keys = Object.keys(values);
              sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING ${columns}`;
            } else if (operation === "update") {
              args = [...params, ...Object.values(values).map((value) => typeof value === "object" && value !== null ? JSON.stringify(value) : value)];
              sql = `UPDATE ${table} SET ${Object.keys(values).map((key, i) => `${key}=$${params.length + i + 1}`).join(",")}${filter} RETURNING ${columns}`;
            } else sql = `DELETE FROM ${table}${filter} RETURNING ${columns}`;
            const rows = (await db.query(sql, args)).rows;
            if (operation === "delete" && exact) count = rows.length;
            if (operation === "insert" && loseInsertResponse) {
              loseInsertResponse = false;
              return { data: null, error: { message: "Response lost after committed insert" } };
            }
            if ((single && rows.length !== 1) || (maybe && rows.length > 1)) return { data: null, error: { message: "Expected exactly one visible row" } };
            return { data: single || maybe ? rows[0] || null : operation === "delete" ? rows.slice(0, cap) : rows, error: null, count };
          } catch (error) { return { data: null, error }; }
        })().then(resolve, reject);
      },
    };
    return builder;
  } };
}
test.before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,email_confirmed_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users VALUES('${owner}',false,now(),null);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  await db.exec(fs.readFileSync(path.join(root, "supabase", "review", "202610280001_meals_recipe_foundation.sql"), "utf8"));
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("SET ROLE authenticated");
  service = model.createRecipeService(client);
});
test.after(async () => { await db?.close(); });

test("service executes owner CRUD against exact migration: text, blank lines, atomic JSONB and stable create retry", async () => {
  const draft = { ...model.newRecipe(randomUUID()), title: "  soup  ", source: " Book\r\n",
    ingredient_sections: [{ name: "First ", text: "\n1 cup\n\n2 eggs\r\n" }, { name: "", text: "" }],
    instructions: " \nMix.\n\nBake.\r\n" };
  const saved = await service.create(draft);
  for (const key of ["title", "source", "instructions", "ingredient_sections"]) assert.deepEqual(saved[key], draft[key]);
  assert.equal((await service.get(saved.id)).title, draft.title);
  const second = await service.create(draft);
  assert.equal(second.id, saved.id);
  assert.equal((await service.list()).length, 1);
  await assert.rejects(service.create({ ...draft, title: "collision" }), /different content/);
  const updated = await service.update(saved.id, { ...draft, title: "New", ingredient_sections: [...draft.ingredient_sections].reverse() });
  assert.deepEqual(updated.ingredient_sections, [...draft.ingredient_sections].reverse());
  assert.equal((await service.favorite(saved.id, true)).favorite, true);
  assert.equal((await service.get(saved.id)).favorite, true);
  await assert.rejects(service.update(saved.id, { ...draft, title: " \n" }), /Title is required/);
  await assert.rejects(service.update(saved.id, { ...draft, ingredient_sections: [{ name: "", text: "", extra: 1 }] }), /Invalid/);
  assert.equal((await service.get(saved.id)).title, "New");
  assert(calls.filter((c) => c.values).every((c) => !("created_at" in c.values) && !("updated_at" in c.values)));
  await service.remove([saved.id, saved.id]);
  assert.equal(await service.get(saved.id), null);
  const uncertain = { ...draft, id: randomUUID() };
  loseInsertResponse = true;
  await assert.rejects(service.create(uncertain), /Response lost/);
  assert.equal((await service.create(uncertain)).id, uncertain.id);
  assert.equal((await service.list()).length, 1);
  await service.remove([uncertain.id]);
});

test("service Category AND Cuisine create/rename/referenced refusal/unused delete with canonical names", async () => {
  for (const kind of ["categories", "cuisines"]) {
    const lookup = service[kind];
    const field = kind === "categories" ? "category_id" : "cuisine_id";
    const created = await lookup.create("\u00a0  Dinner \u2003");
    assert.equal(created.name, "Dinner");
    const draft = { ...model.newRecipe(randomUUID()), title: "Reference", [field]: created.id };
    await service.create(draft);
    const renamed = await lookup.rename(created.id, "\ufeff SUPPER \n");
    assert.equal(renamed.name, "SUPPER");
    assert.equal((await lookup.list())[0].id, created.id);
    assert.equal((await service.get(draft.id))[field], created.id);
    await assert.rejects(lookup.remove(created.id), (error) => {
      assert.equal(error.code, "23503");
      assert.match(error.message, /still referenced/);
      return true;
    });
    await assert.rejects(lookup.create("supper"), /already exists/);
    await service.update(draft.id, { ...draft, [field]: null });
    await lookup.remove(created.id);
    assert.equal((await lookup.list()).length, 0);
    await assert.rejects(lookup.remove(created.id), /not deleted/);
    await assert.rejects(lookup.create("\n "), /name is required/);
    await service.remove([draft.id]);
  }
});

test("classification deletion preserves structured error codes without inventing reference conflicts", async () => {
  for (const kind of ["categories", "cuisines"]) {
    for (const error of [
      { code: "23503", message: "Referenced value" },
      { code: "42501", message: "Permission denied" },
      { code: "PGRST301", message: "Authentication required" },
      { message: "Unknown failure: used by a Recipe" },
      { code: "NETWORK", message: "Connection unavailable" },
      { code: "OTHER" },
    ]) {
      const lookup = model.createRecipeService(() => ({ from(name) {
        assert.equal(name, `meals_recipe_${kind}`);
        const query = { delete() { return query; }, eq() { return query; }, select() { return query; },
          then(resolve) { return Promise.resolve({ data: null, error }).then(resolve); } };
        return query;
      } }))[kind];
      await assert.rejects(lookup.remove(randomUUID()), (failure) => {
        assert.equal(failure.code, error.code);
        assert.match(failure.message, /Delete classification failed/);
        assert(failure.message.includes(error.message || "Database request rejected."));
        assert.equal(failure.message.includes("This value is still referenced"), error.code === "23503");
        return true;
      });
    }
  }
});

test("complete keyset loading continues after capped short pages, including lookups; later-page failures reject entire load", async () => {
  const ids = [];
  for (let i = 0; i < 7; i++) {
    const draft = { ...model.newRecipe(randomUUID()), title: `Page ${i}` };
    ids.push((await service.create(draft)).id);
    await service.categories.create(`Class ${i}`);
  }
  const before = calls.length;
  assert.equal((await service.list()).length, 7);
  const readCalls = calls.slice(before);
  assert.equal(readCalls.length, 5);
  assert(readCalls.slice(1).every((c) => c.filter.includes(">")));
  assert.equal((await service.categories.list()).length, 7);
  const concurrentStart = calls.length;
  await Promise.all([service.list(), service.favorite(ids[0], true)]);
  const concurrentCalls = calls.slice(concurrentStart);
  assert.equal(concurrentCalls.at(-1).operation, "update");
  assert(concurrentCalls.slice(0, -1).every((call) => call.operation === "select"));
  failPage = true;
  await assert.rejects(service.list(), /offline/);
  assert.deepEqual(await service.remove(ids), ids, "Exact delete count must cover rows beyond the API's capped RETURNING data");
  for (const category of await service.categories.list()) await service.categories.remove(category.id);
});

test("explicit failures and zero-row mutations never become success; non-owner still denied through service", async () => {
  const draft = { ...model.newRecipe(randomUUID()), title: "Owner-only" };
  await service.create(draft);
  failNext = true; await assert.rejects(service.update(draft.id, draft), /offline/);
  failNext = true; await assert.rejects(service.list(), /offline/);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [randomUUID()]);
  assert.equal(await service.get(draft.id), null);
  assert.equal((await service.list()).length, 0);
  await assert.rejects(service.create({ ...draft, id: randomUUID() }), /row-level security/);
  await assert.rejects(service.update(draft.id, draft), /one visible row/);
  await assert.rejects(service.favorite(draft.id, true), /one visible row/);
  await assert.rejects(service.remove([draft.id]), /not confirmed/);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await service.remove([draft.id]);
});

test("literal title/ingredient search, excluded fields, AND filters, sort and safe source URLs", () => {
  const category = randomUUID(), cuisine = randomUUID();
  const a = { ...model.newRecipe(randomUUID()), title: "Soup 100%_\\", category_id: category, cuisine_id: cuisine,
    favorite: true, source: "UNSEARCHABLE", instructions: "UNSEARCHABLE",
    ingredient_sections: [{ name: "UNSEARCHABLE", text: "Potato\n\nCARROT 50%_\\" }] };
  for (const search of ["sOuP", "POTATO", "carrot", "%", "_", "\\", "50%_\\"]) assert(model.recipeMatches(a, { search }));
  for (const search of ["UNSEARCHABLE", "tomato"]) assert.equal(model.recipeMatches(a, { search }), false);
  assert(model.recipeMatches(a, { search: "carrot", category, cuisine, favorites: true }));
  for (const filters of [{ category: randomUUID() }, { cuisine: randomUUID() }]) assert.equal(model.recipeMatches(a, filters), false);
  assert.equal(model.recipeMatches({ ...a, favorite: false }, { favorites: true }), false);
  assert.equal(model.recipeMatches({ ...a, ingredient_sections: [{ name: "", text: "a" }, { name: "", text: "b" }] }, { search: "ab" }), false);
  const b = { ...a, id: randomUUID(), title: "Apple", category_id: null, cuisine_id: null, source: "A" };
  for (const key of ["title", "source", "category", "cuisine"]) {
    const cats = [{ id: category, name: "Dinner" }], cuisines = [{ id: cuisine, name: "French" }];
    const asc = model.sortRecipes([a, b], key, 1, cats, cuisines);
    const desc = model.sortRecipes([a, b], key, -1, cats, cuisines);
    assert.equal(asc[0].id, desc[1].id);
  }
  assert.equal(model.recipeSourceUrl("Cookbook p4"), null);
  assert.equal(model.recipeSourceUrl("javascript:alert(1)"), null);
  assert.equal(model.recipeSourceUrl("data:text/html,test"), null);
  assert.equal(model.recipeSourceUrl("https://example.test/recipe"), "https://example.test/recipe");
});

test("pagination and deletion fail closed on count drift, invalid IDs/order or missing count", async () => {
  function fake(pages) {
    return model.createRecipeService(() => ({ from() {
      const query = { select() { return query; }, order() { return query; }, limit() { return query; }, gt() { return query; },
        delete() { return query; }, in() { return query; },
        then(resolve) { return Promise.resolve(pages.shift()).then(resolve); } };
      return query;
    } }));
  }
  const id = randomUUID();
  await assert.rejects(fake([{ data: [{ id }], count: 2 }, { data: [] }]).list(), /changed during loading/);
  await assert.rejects(fake([{ data: [{ id }, { id }], count: 2 }]).list(), /did not advance/);
  await assert.rejects(fake([{ data: [], count: null }]).list(), /count is unavailable/);
  await assert.rejects(fake([{ data: [{ id }], count: 0 }]).remove([id]), /not confirmed/);
  await assert.rejects(fake([{ data: [{ id: randomUUID() }], count: 1 }]).remove([id]), /not confirmed/);
  cap = 500;
});
