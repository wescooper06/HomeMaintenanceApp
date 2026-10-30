const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "shoppingService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const model = vm.runInThisContext(`(()=>{${source};return {createShoppingService,shoppingCategoryNames,
  automaticShoppingCategory,orderShoppingItems,orderShoppingCategories,shoppingError};})()`);
const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "shopping-memory-client.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const createClient = vm.runInThisContext(`(()=>{const shoppingCategoryNames=${JSON.stringify(model.shoppingCategoryNames)};
  ${fixture};return createMemoryShoppingClient;})()`);
const setup = () => { const client = createClient(); return { client, service: model.createShoppingService(() => client) }; };

test("28 controlled categories and deterministic case-insensitive bounded phrase mapping; no source normalization", async () => {
  const { service } = setup();
  const { categories } = await service.load();
  assert.equal(categories.length, 28);
  const assign = (text) => categories.find((category) => category.id === model.automaticShoppingCategory(text, categories))?.name;
  for (const [text, name] of [["2 EGGS", "Cheese & Dairy"], ["garlic", "Produce"], ["olive oil", "Oil & Vinegar"],
    ["2 cups rice flour", "Baking"], ["frozen broccoli", "Frozen Foods"], ["cat food", "Pet Food"]]) {
    assert.equal(assign(text), name);
  }
  assert.equal(assign("licorice"), undefined);
  assert.equal(assign("unrecognized ingredient"), undefined);
  assert.equal(model.automaticShoppingCategory("rice", []), null);
});

test("manual additions preserve exact text and duplicates; retry identity reconciles lost INSERT response without duplicate", async () => {
  const { service, client } = setup();
  const draft = { id: randomUUID(), text: "  eggs\r\n", category_id: null };
  client.control.loseInsert = true;
  await assert.rejects(service.add(draft), (error) => error.code === "NETWORK");
  const saved = await service.add(draft);
  assert.equal(saved.text, draft.text);
  assert.equal(saved.checked, false);
  assert.equal((await service.load()).items.length, 1);
  await service.add({ ...draft, id: randomUUID() });
  assert.equal((await service.load()).items.length, 2);
  await assert.rejects(service.add({ ...draft, text: "changed" }), /different values/);
});

test("full manual lifecycle and exact clear semantics preserve category rows and overrides", async () => {
  const { service } = setup();
  const custom = await service.createCategory({ id: randomUUID(), name: "  Custom  " });
  assert.equal(custom.name, "Custom");
  const renamed = await service.renameCategory(custom.id, "Renamed");
  assert.equal(renamed.name, "Renamed");
  const a = await service.add({ id: randomUUID(), text: "eggs", category_id: custom.id });
  const b = await service.add({ id: randomUUID(), text: "eggs", category_id: null });
  await assert.rejects(service.removeCategory(custom.id), (error) => error.code === "23503");
  await service.edit(a.id, "new text");
  assert.equal((await service.load()).items.find((item) => item.id === a.id).category_id, custom.id);
  await service.categorize(b.id, custom.id);
  await service.check(a.id, true);
  await service.check(a.id, false);
  await service.check(a.id, true);
  await service.clearChecked();
  assert.deepEqual((await service.load()).items.map((item) => item.id), [b.id]);
  await service.clearList();
  assert.equal((await service.load()).categories.length, 29);
  await service.removeCategory(custom.id);
  assert.equal((await service.load()).categories.length, 28);
  const c = await service.add({ id: randomUUID(), text: "remove", category_id: null });
  await service.remove(c.id);
  assert.equal((await service.load()).items.length, 0);
  await assert.rejects(service.remove(c.id), /not confirmed/);
  await assert.rejects(service.removeCategory(custom.id), /not confirmed/);
});

test("pagination follows server cap without truncation and surfaces partial-page errors", async () => {
  const { client, service } = setup();
  client.control.cap = 3;
  assert.equal((await service.load()).categories.length, 28);
  client.control.failure = { code: "NETWORK", message: "offline" };
  await assert.rejects(service.load(), (error) => error.code === "NETWORK");
  assert.equal((await service.load()).categories.length, 28);
});

test("checked items sink within group, stable insertion order; custom categories follow predefined creation order", () => {
  const items = [
    { id: "c", checked: true, created_at: "3" },
    { id: "b", checked: false, created_at: "2" },
    { id: "a", checked: false, created_at: "1" },
  ];
  assert.deepEqual(model.orderShoppingItems(items).map((row) => row.id), ["a", "b", "c"]);
  const categories = [
    { id: "z", predefined_order: null, created_at: "2" },
    { id: "a", predefined_order: 2, created_at: "0" },
    { id: "b", predefined_order: 1, created_at: "0" },
    { id: "y", predefined_order: null, created_at: "1" },
  ];
  assert.deepEqual(model.orderShoppingCategories(categories).map((row) => row.id), ["b", "a", "y", "z"]);
});

test("validation and reliable failure classes are surfaced without exposing database internals", async () => {
  const { service } = setup();
  await assert.rejects(service.add({ id: randomUUID(), text: " \t", category_id: null }), /nonblank/);
  await assert.rejects(service.add({ id: "bad", text: "value", category_id: null }), /identity/);
  assert.throws(() => service.check(randomUUID(), 1), /true or false/);
  for (const [code, expected] of [["42501", /access denied/], ["23503", /category is in use/],
    ["23505", /already exists/], ["23514", /invalid/], ["NETWORK", /network failure/], ["unknown", /could not be confirmed/]]) {
    const message = model.shoppingError({ code, message: "private database internals" });
    assert.match(message, expected);
    assert(!message.includes("private database"));
  }
});
