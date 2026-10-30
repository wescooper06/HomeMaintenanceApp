const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
let code, rowsCode, contextCode;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  async function compile(file) {
    const name = path.join(root, file);
    return (await transformWithOxc(fs.readFileSync(name, "utf8").replace(/^import .*;\r?$/gm, "")
      .replace(/^export default /gm, "").replace(/^export /gm, ""), name,
    { jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" } })).code;
  }
  code = await compile("src\\pages\\Meals\\MealEntryDialog.jsx");
  rowsCode = await compile("src\\pages\\Meals\\MealRows.jsx");
  contextCode = await compile("src\\pages\\Planner\\components\\PlannerContext.jsx");
});
const nodes = (t) => !t || typeof t !== "object" ? [] : [t, ...t.children.flatMap(nodes)];
const text = (t) => typeof t === "object" ? t.children.map(text).join("") : String(t);
const button = (t, label) => nodes(t).find((n) => n.type === "button" && text(n) === label);
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness(source, extra = {}) {
  const slots = [], effects = [];
  let index = 0;
  const context = {
    crypto: { randomUUID }, styles: {}, fragment: "fragment", Link: "link",
    document: { activeElement: { focus() {} } },
    createContext: () => ({ Provider: "provider" }), useContext: () => extra.mealState,
    MealEntryDialog: "meal-dialog",
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((v) => v !== null && v !== undefined && v !== false) }),
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useRef(value) { const i = index++; if (!(i in slots)) slots[i] = { current: value };
      if (value === null && i === 0) slots[i].current = { showModal() {}, close() {} }; return slots[i]; },
    useEffect(effect, dependencies) { const i = index++;
      if (!slots[i] || dependencies.some((v, j) => v !== slots[i].dependencies[j])) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { dependencies, cleanup: effect() }; });
      } },
    toDateKey: () => "2026-10-30",
    validMealDate: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    mealPeriods: { morning: "breakfast", afternoon: "lunch", evening: "dinner" },
    ...extra,
  };
  const components = vm.runInNewContext(`(()=>{${source};return {${extra.names || "MealEntryDialog"}};})()`, context);
  return { ...components, render(Component, props) {
    index = 0; const t = Component(props); effects.splice(0).forEach((fn) => fn()); return t;
  } };
}
test("RD-FUNC-002, PLAN-FUNC/STATE: today/Dinner defaults, selected date/meal, duplicate-submit guard and stable retry", async () => {
  const recipe = { id: randomUUID(), title: "Recipe" }, calls = [], added = [];
  let fail = true, closes = 0;
  const h = harness(code, { createRecipeService: () => ({ get: async () => recipe }),
    createMealPlannerService: () => ({ create: async (draft) => { calls.push(draft); if (fail) throw new Error("Uncertain"); return draft; } }) });
  const props = { recipeId: recipe.id, onClose: () => closes++, onAdded: (v) => added.push(v) };
  h.render(h.MealEntryDialog, props); await flush(); let t = h.render(h.MealEntryDialog, props);
  assert.equal(t.type, "dialog"); assert.equal(t.props["aria-labelledby"], "plan-meal-title");
  const date = nodes(t).find((n) => n.type === "input" && n.props.type === "date");
  assert.equal(date.props.value, "2026-10-30");
  assert.equal(nodes(t).find((n) => n.type === "select").props.value, "dinner");
  date.props.onChange({ target: { value: "2000-02-29" } });
  nodes(t).find((n) => n.type === "select").props.onChange({ target: { value: "breakfast" } });
  t = h.render(h.MealEntryDialog, props);
  const event = { preventDefault() {} }, form = nodes(t).find((n) => n.type === "form");
  await Promise.all([form.props.onSubmit(event), form.props.onSubmit(event)]);
  assert.equal(calls.length, 1); assert.equal(added.length, 0);
  t = h.render(h.MealEntryDialog, props); assert(text(t).includes("Uncertain"));
  assert(nodes(t).find((n) => n.type === "fieldset").props.disabled);
  fail = false; await nodes(t).find((n) => n.type === "form").props.onSubmit(event);
  assert.strictEqual(calls[0], calls[1]); assert.equal(calls[0].meal_date, "2000-02-29");
  assert.equal(calls[0].meal_type, "breakfast"); assert.equal(added.length, 1); assert.equal(closes, 1);
});
test("WP-FUNC-006/007/008/011/012, WP-UI-004/VAL-001: direct choice, title-only alphabetical picker, Favorite stars, raw free text and Cancel", async () => {
  const data = [{ id: randomUUID(), title: "Zulu", favorite: true, ingredient_sections: [{ text: "hiddenmatch" }] },
    { id: randomUUID(), title: "Alpha", favorite: false }], added = [];
  let closes = 0;
  const h = harness(code, { createRecipeService: () => ({ list: async () => data }),
    createMealPlannerService: () => ({ create: async (draft) => { added.push(draft); return draft; } }) });
  const props = { date: "2026-11-02", meal: "lunch", onClose: () => closes++, onAdded() {} };
  h.render(h.MealEntryDialog, props); await flush(); let t = h.render(h.MealEntryDialog, props);
  const picker = () => nodes(t).filter((n) => n.type === "label" && nodes(n).some((i) => i.type === "input" && i.props.name === "meal-recipe"));
  assert.deepEqual(picker().map(text), ["Alpha", "\u2605 Zulu"]);
  const search = nodes(t).find((n) => n.type === "input" && n.props.type === "search");
  search.props.onChange({ target: { value: "hiddenmatch" } }); t = h.render(h.MealEntryDialog, props);
  assert.equal(picker().length, 0); assert(text(t).includes("No matching Recipe titles"));
  nodes(t).find((n) => n.type === "label" && text(n) === "Free text").children[0].props.onChange();
  t = h.render(h.MealEntryDialog, props);
  assert(button(t, "Add to Planner").props.disabled);
  nodes(t).find((n) => n.type === "textarea").props.onChange({ target: { value: " \t" } });
  t = h.render(h.MealEntryDialog, props); assert(button(t, "Add to Planner").props.disabled);
  nodes(t).find((n) => n.type === "textarea").props.onChange({ target: { value: "  Custom meal  " } });
  t = h.render(h.MealEntryDialog, props);
  button(t, "Cancel").props.onClick(); assert.equal(added.length, 0);
  t.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} }); assert.equal(closes, 2);
  await nodes(t).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(added[0].display_text, "  Custom meal  "); assert.equal(added[0].recipe_id, null);
});
test("WP-UI-001/002/003, WP-FUNC-001/002/003/004/010, PM-FUNC-001 through 007: meal rows/actions separate from tasks", async () => {
  let state = { entries: [{ id: "entry", meal_date: "2026-10-30", meal_type: "dinner", recipe_id: null, display_text: "Meal" }],
    recipes: [], loaded: true, error: "", setState(fn) { state = { ...state, ...fn(state) }; }, setMessage() {}, setAdding() {} };
  const calls = [];
  const h = harness(rowsCode, { names: "MealRow,MealOccurrence,MealPlannerProvider", mealState: state,
    createRecipeService: () => ({}), createMealPlannerService: () => ({
      edit: async (e, value) => { calls.push(["edit", value]); return { ...e, display_text: value }; },
      remove: async () => { calls.push(["remove"]); },
    }) });
  let t = h.render(h.MealRow, { date: "2026-10-30", slot: "morning" });
  assert(text(t).includes("Breakfast")); assert(text(t).includes("No meals planned")); assert(button(t, "Add meal"));
  const props = { entry: state.entries[0], title: "Meal" };
  t = h.render(h.MealOccurrence, props); button(t, "Meal").props.onClick(); t = h.render(h.MealOccurrence, props);
  button(t, "Edit meal").props.onClick(); t = h.render(h.MealOccurrence, props);
  nodes(t).find((n) => n.type === "textarea").props.onChange({ target: { value: "Edited" } });
  t = h.render(h.MealOccurrence, props); await button(t, "Save meal text").props.onClick();
  assert.equal(calls[0][1], "Edited");
  t = h.render(h.MealOccurrence, props); await button(t, "Remove meal").props.onClick();
  assert.equal(calls[1][0], "remove");
});
test("PLAN-FUNC-011: View in Planner date waits for initialization and uses existing week navigation once", () => {
  const jumps = [], controller = { getSnapshot: () => ({ loading: false, planner: {} }),
    actions: { initialize: async () => {}, jumpPlannerToDate: (date) => jumps.push(date) }, subscribe: () => () => {}, destroy() {} };
  const h = harness(contextCode, { names: "PlannerProvider", createPlannerController: () => controller,
    useLocation: () => ({ search: "?mealDate=2000-02-29" }), URLSearchParams, PlannerContext: { Provider: "provider" } });
  h.render(h.PlannerProvider, { children: null }); h.render(h.PlannerProvider, { children: null });
  assert.deepEqual(jumps, ["2000-02-29"]);
});
