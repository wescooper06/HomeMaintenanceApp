const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
let compiled;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(__dirname, "..", "src", "pages", "Meals", "RecipeShopping.jsx");
  const input = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace(/^export default /gm, "").replace(/^export /gm, "");
  compiled = (await transformWithOxc(input, file, { jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" } })).code;
});
const recipe = () => ({ id: randomUUID(), title: "Recipe", ingredient_sections: [
  { name: "First", text: "\r\n  eggs \r\n \t\r\nsalt\nsalt\n" },
  { name: "Second", text: "\nwater\r\n" },
] });
function harness(source, shopping) {
  const slots = [], effects = [], added = [];
  let index = 0, closed = 0, focused = false, opened = false;
  const context = {
    crypto: { randomUUID }, styles: {}, Link: "link",
    createRecipeService: () => ({ get: async () => source }), createShoppingService: () => shopping,
    automaticShoppingCategory: (text) => text.includes("eggs") ? "dairy" : null,
    shoppingError: (error) => error.message,
    document: { activeElement: { focus() { focused = true; } } },
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((v) => v !== null && v !== undefined && v !== false) }),
    fragment: "fragment",
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(value) { const i = index++; if (!(i in slots)) slots[i] = { current: value };
      if (value === null && i === 0) slots[i].current = { showModal() { opened = true; }, close() {} };
      return slots[i]; },
    useEffect(effect, dependencies) { const i = index++;
      if (!slots[i] || dependencies.some((v, j) => v !== slots[i].dependencies[j])) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { dependencies, cleanup: effect() }; });
      } },
  };
  const { RecipeShopping, ingredientCandidates } = vm.runInNewContext(`(()=>{${compiled};return {RecipeShopping,ingredientCandidates};})()`, context);
  return { added, ingredientCandidates, closed: () => closed, opened: () => opened, focused: () => focused,
    cleanup() { slots.forEach((s) => s?.cleanup?.()); },
    render() { index = 0; const t = RecipeShopping({ recipeId: source.id, onClose() { closed++; }, onAdded(count) { added.push(count); } });
      effects.splice(0).forEach((fn) => fn()); return t; } };
}
const nodes = (t) => !t || typeof t !== "object" ? [] : [t, ...t.children.flatMap(nodes)];
const text = (t) => typeof t === "object" ? t.children.map(text).join("") : String(t);
const button = (t, label) => nodes(t).find((n) => n.type === "button" && text(n) === label);
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("grouped candidates preserve text/duplicates, omit blanks, select initially and support all individual controls", async () => {
  const source = recipe(), before = JSON.stringify(source), calls = [];
  const h = harness(source, { categories: async () => [], addSelected: async (drafts) => { calls.push(drafts); return drafts.length; } });
  h.render(); await settle(); let t = h.render();
  assert(h.opened());
  assert.equal(t.type, "dialog");
  assert.equal(t.props["aria-labelledby"], "recipe-shopping-title");
  assert.equal(nodes(t).filter((n) => n.type === "fieldset").length, 2);
  let checks = nodes(t).filter((n) => n.type === "input");
  assert.equal(checks.length, 4); assert(checks.every((n) => n.props.checked));
  checks[0].props.onChange({ target: { checked: false } }); t = h.render();
  assert.equal(nodes(t).filter((n) => n.type === "input")[0].props.checked, false);
  nodes(t).filter((n) => n.type === "input")[0].props.onChange({ target: { checked: true } });
  button(h.render(), "Clear all").props.onClick(); t = h.render();
  assert.equal(button(t, "Add to List").props.disabled, true);
  button(t, "Select all").props.onClick(); t = h.render();
  checks = nodes(t).filter((n) => n.type === "input");
  checks[3].props.onChange({ target: { checked: false } }); t = h.render();
  await button(t, "Add to List").props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0].map((r) => r.text)), JSON.stringify(["  eggs ", "salt", "salt"]));
  assert.equal(new Set(calls[0].map((r) => r.id)).size, 3);
  assert.equal(calls[0][0].category_id, "dairy");
  assert.equal(h.added[0], 3); assert.equal(h.closed(), 1);
  assert.equal(JSON.stringify(source), before);
  h.cleanup(); assert(h.focused());
});

test("Cancel and Escape add nothing; empty Recipe cannot add; failed selection is retained and same identities retry", async () => {
  let calls = [], fail = true;
  const shopping = { categories: async () => [], addSelected: async (drafts) => {
    calls.push(drafts); if (fail) throw new Error("Uncertain response"); return drafts.length;
  } };
  const h = harness(recipe(), shopping);
  h.render(); await settle(); let t = h.render();
  button(t, "Cancel").props.onClick(); t.props.onCancel({ preventDefault() {} });
  t.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(h.closed(), 3); assert.equal(calls.length, 0);
  const action = button(t, "Add to List");
  const first = action.props.onClick(); const second = action.props.onClick();
  await Promise.all([first, second]); t = h.render();
  assert.equal(calls.length, 1); assert.equal(h.added.length, 0);
  assert(text(t).includes("Uncertain response"));
  assert.equal(nodes(t).find((n) => n.type === "fieldset").props.disabled, true);
  fail = false; await button(t, "Retry Add to List").props.onClick();
  assert.strictEqual(calls[0], calls[1]); assert.equal(h.added[0], 4);
  const empty = harness({ ...recipe(), ingredient_sections: [{ name: "Empty", text: "\n \t\r" }] }, shopping);
  empty.render(); await settle();
  assert.equal(button(empty.render(), "Add to List").props.disabled, true);
});

test("ingredient loading failure is visible and retryable without mutations", async () => {
  let fails = true;
  const h = harness(recipe(), { categories: async () => { if (fails) throw new Error("offline"); return []; } });
  h.render(); await settle(); let t = h.render();
  assert(text(t).includes("offline"));
  fails = false; button(t, "Retry loading ingredients").props.onClick(); h.render(); await settle();
  assert.equal(nodes(h.render()).filter((n) => n.type === "input").length, 4);
});
