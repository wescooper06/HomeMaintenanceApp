const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const load = (file, names, context = {}) => vm.runInNewContext(`(()=>{${fs.readFileSync(path.join(root, file), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")};return {${names}};})()`, context);
const { createMealPlannerService, validMealDate, mealPeriods, sortMealEntries } = load("src\\services\\mealPlannerService.js",
  "createMealPlannerService,validMealDate,mealPeriods,sortMealEntries");
const { createMemoryMealPlannerClient } = load("tests\\fixtures\\meal-planner-memory-client.js", "createMemoryMealPlannerClient",
  { structuredClone });
function setup() {
  const data = new Map(), storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const client = createMemoryMealPlannerClient(storage);
  return { client, service: createMealPlannerService(() => client), storage };
}
const draft = (values = {}) => ({ id: randomUUID(), meal_date: "2026-10-30", meal_type: "dinner", recipe_id: null,
  display_text: "  Meal text  ", ...values });
test("PLAN date/type contracts: strict local dates, past/future/leap, mapped periods, arbitrary nonblank text", async () => {
  assert.equal(JSON.stringify(mealPeriods), JSON.stringify({ morning: "breakfast", afternoon: "lunch", evening: "dinner" }));
  for (const date of ["0001-01-01", "2000-02-29", "2026-10-30", "9999-12-31"]) assert(validMealDate(date));
  for (const date of ["0000-01-01", "2026-02-29", "2026-02-30", "2026-1-01", "infinity", "2026-10-30T00:00:00Z"]) assert(!validMealDate(date));
  const { service, client } = setup();
  for (const values of [{ meal_date: "bad" }, { meal_type: "snack" }, { display_text: " \t\u00a0" }, { id: "bad" }, { recipe_id: "bad" }]) {
    await assert.rejects(service.create(draft(values)));
  }
  assert.equal(client.control.calls.length, 0);
  const saved = await service.create(draft());
  assert.equal(saved.display_text, "  Meal text  ");
});
test("PLAN-FUNC-009, WP-FUNC-010, PM-FUNC-012: duplicate additions distinct; complete capped reads and stable retry identity", async () => {
  const { service, client } = setup();
  const first = draft();
  client.control.lose = "insert";
  await assert.rejects(service.create(first), /not confirmed/);
  const saved = await service.create(first);
  assert.equal(saved.id, first.id);
  assert.equal(client.control.calls.filter((c) => c.mode === "insert").length, 1);
  await service.create(draft());
  await service.create(draft());
  assert.equal((await service.list()).length, 3);
  assert.deepEqual(Array.from((await service.list()).map((r) => r.insertion_order)), [1, 2, 3]);
  await assert.rejects(service.create({ ...first, display_text: "different" }), /different content/);
  assert.throws(() => sortMealEntries([{ id: first.id, insertion_order: NaN }]), /insertion order/);
});
test("PM-FUNC-003/006/007/012: free-text edit/remove reconciliation, conflict protection and no optimistic success", async () => {
  const { service, client } = setup();
  const entry = await service.create(draft());
  client.control.failure = "update";
  await assert.rejects(service.edit(entry, "Changed"), /not confirmed/);
  assert.equal((await service.list())[0].display_text, entry.display_text);
  client.control.lose = "update";
  await assert.rejects(service.edit(entry, "Changed"), /not confirmed/);
  const saved = await service.edit(entry, "Changed");
  assert.equal(saved.display_text, "Changed");
  await assert.rejects(service.edit(entry, "Stale edit"), /another session/);
  await assert.rejects(service.remove(entry), /another session/);
  client.control.lose = "delete";
  await assert.rejects(service.remove(saved), /not confirmed/);
  await service.remove(saved);
  assert.equal((await service.list()).length, 0);
});
test("PM-FUNC-011: linked additions reconcile by Recipe identity, not stale title; raw Recipe is never mutated", async () => {
  const { service, client, storage } = setup();
  const recipe = { id: randomUUID(), title: "Current title" };
  storage.setItem("meals-recipe-synthetic-data", JSON.stringify({ meals_recipes: [recipe] }));
  const item = draft({ recipe_id: recipe.id, display_text: "stale" });
  client.control.lose = "insert";
  await assert.rejects(service.create(item));
  const saved = await service.create(item);
  assert.equal(saved.display_text, recipe.title);
  await assert.rejects(service.edit(saved, "No"), /Recipe-linked/);
  assert.equal(storage.getItem("meals-recipe-synthetic-data"), JSON.stringify({ meals_recipes: [recipe] }));
});
