const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "services", "mealsIdeasService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const model = vm.runInThisContext(`(()=>{${source};return {
  createMealsIdeasService,newIdea,orderIdeas,ideasError
};})()`);
const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "meals-ideas-memory-client.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const createClient = vm.runInThisContext(`(()=>{${fixture};return createMemoryMealsIdeasClient;})()`);
const setup = (seed) => {
  const client = createClient(seed);
  return { client, service: model.createMealsIdeasService(() => client) };
};

test("manual order is deterministic and independent of checked state", async () => {
  const seed = [
    { id: "30000000-0000-4000-8000-000000000003", text: "checked", checked: true, position: 3,
      created_at: "2026-01-03T00:00:00.000Z", updated_at: "2026-01-03T00:00:00.000Z" },
    { id: "30000000-0000-4000-8000-000000000001", text: "second", checked: false, position: 2,
      created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" },
    { id: "30000000-0000-4000-8000-000000000002", text: "first", checked: true, position: 1,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  ];
  const { service } = setup(seed);
  assert.deepEqual((await service.load()).map((row) => row.id), [
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000003",
  ]);
  assert.deepEqual(model.orderIdeas(seed).map((row) => row.id), [
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000003",
  ]);
});

test("append preserves exact text, assigns the next manual position and reconciles a lost response by identity", async () => {
  const { client, service } = setup();
  const first = { ...model.newIdea(randomUUID()), text: "  \u00a0Idea\n\n text  " };
  client.control.loseCreate = true;
  await assert.rejects(service.create(first), (error) => error.code === "NETWORK");
  const saved = await service.create(first);
  assert.equal(saved.text, first.text);
  assert.equal(saved.position, 1);
  assert.equal((await service.create(first)).id, saved.id);
  await assert.rejects(service.create({ ...first, text: "different" }), (error) => error.code === "23505");
  const next = await service.create({ ...model.newIdea(randomUUID()), text: "second" });
  assert.equal(next.position, 2);
  assert.deepEqual((await service.load()).map((row) => row.position), [1, 2]);
});

test("edit and check leave position unchanged; adjacent moves include checked Ideas and stop at boundaries", async () => {
  const { service } = setup();
  const a = await service.create({ ...model.newIdea(randomUUID()), text: "first" });
  const b = await service.create({ ...model.newIdea(randomUUID()), text: "second" });
  const c = await service.create({ ...model.newIdea(randomUUID()), text: "third" });
  await service.check(b.id, true);
  await service.edit(b.id, "updated");
  assert.deepEqual((await service.load()).map(({ id, position }) => [id, position]), [
    [a.id, 1], [b.id, 2], [c.id, 3],
  ]);
  const moved = await service.move(b.id, -1);
  assert.equal(moved.moved, true);
  assert.deepEqual(moved.items.map(({ id, position }) => [id, position]), [
    [b.id, 1], [a.id, 2], [c.id, 3],
  ]);
  assert.equal((await service.load())[0].checked, true);
  assert.equal((await service.move(b.id, 1)).moved, true);
  const boundary = await service.move(a.id, -1);
  assert.equal(boundary.moved, false);
  assert.deepEqual(boundary.items.map(({ id }) => id), [a.id, b.id, c.id]);
  await assert.rejects(service.move(a.id, 0), /direction/);
  await assert.rejects(service.move("bad", 1), /identity/);
  assert.throws(() => service.check(a.id, 1), /true or false/);
});

test("delete removes only the selected Idea and retains manual relative order across position gaps", async () => {
  const { service } = setup();
  const rows = [];
  for (const text of ["one", "two", "three", "four"]) {
    rows.push(await service.create({ ...model.newIdea(randomUUID()), text }));
  }
  await service.remove(rows[1].id);
  assert.deepEqual((await service.load()).map(({ id, position }) => [id, position]), [
    [rows[0].id, 1], [rows[2].id, 3], [rows[3].id, 4],
  ]);
  const moved = await service.move(rows[3].id, -1);
  assert.deepEqual(moved.items.map(({ id }) => id), [rows[0].id, rows[3].id, rows[2].id]);
  assert.equal(clientlessOrder(moved.items), true);
  await assert.rejects(service.remove(rows[1].id), /not confirmed/);
});

function clientlessOrder(items) {
  return items.every((item, index) => !index || item.position > items[index - 1].position);
}

test("incomplete or failed responses are explicit and translate into non-leaking messages", async () => {
  const { client, service } = setup();
  await service.create({ ...model.newIdea(randomUUID()), text: "keep me" });
  client.control.failure = { operation: "select", code: "NETWORK", message: "offline" };
  await assert.rejects(service.load(), (error) => error.code === "NETWORK");
  client.control.failure = { operation: "rpc", code: "42501", message: "private database detail" };
  await assert.rejects(service.move((await service.load())[0].id, 1), (error) => error.code === "42501");
  assert.match(model.ideasError({ code: "42501", message: "private database detail" }), /access denied/);
  assert(!model.ideasError({ code: "42501", message: "private database detail" }).includes("private database"));
  assert.match(model.ideasError({ code: "P0002" }), /no longer available/);
  assert.match(model.ideasError({ code: "NETWORK" }), /network failure/);
});
