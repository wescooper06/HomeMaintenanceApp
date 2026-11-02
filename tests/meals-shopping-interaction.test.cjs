const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "services", "shoppingService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const model = vm.runInThisContext(`(()=>{${source};return {automaticShoppingCategory,orderShoppingCategories,orderShoppingItems,shoppingError};})()`);
let compiled;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const filename = path.join(root, "src", "pages", "Meals", "ShoppingPage.jsx");
  const sourceText = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "").replace(/^export default /gm, "").replace(/^export /gm, "");
  compiled = (await transformWithOxc(sourceText, filename, { jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" } })).code;
});
function harness(service, mobile = false, pathname = "/meals/shopping") {
  const slots = [], effects = [];
  let index = 0;
  const context = {
    ...model, createShoppingService: () => service, styles: {}, crypto: { randomUUID },
    element: (type, props, ...children) => ({
      type, props: props || {},
      children: (type === "page-header" ? [props?.title, ...children] : children)
        .flat(Infinity).filter((value) => value !== null && value !== undefined && value !== false),
    }),
    fragment: "fragment", PageHeader: "page-header", NavLink: "link",
    useLocation: () => ({ pathname }), document: { activeElement: { focus() {} } },
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial === null
      ? { showModal() {}, close() {}, focus() {} } : initial }; return slots[i]; },
    useEffect(effect, dependencies) {
      const i = index++;
      if (!slots[i] || dependencies.some((value, j) => value !== slots[i].dependencies[j])) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { dependencies, cleanup: effect() }; });
      }
    },
    window: { matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }) },
  };
  const components = vm.runInNewContext(`(()=>{${compiled};return {ShoppingPage,ShoppingGroup,ClearConfirmation,ItemActionDialog};})()`, context);
  return { ...components, render(Component = components.ShoppingPage, props) {
    index = 0; const result = Component(props);
    effects.splice(0).forEach((effect) => effect());
    return result;
  } };
}
const all = (tree) => !tree || typeof tree !== "object" ? [] : [tree, ...tree.children.flatMap(all)];
const text = (tree) => typeof tree === "object" ? tree.children.map(text).join("") : String(tree);
const button = (tree, label) => all(tree).find((node) => node.type === "button" && (node.props["aria-label"] === label || text(node) === label));
function input(tree, label) {
  const named = all(tree).find((node) => node.props["aria-label"] === label);
  if (named) return named;
  const field = all(tree).find((node) => node.type === "label"
    && node.children.filter((value) => typeof value !== "object").join("") === label);
  return field?.children.find((value) => typeof value === "object");
}
const change = (node, value) => node.props.onChange({ target: { value } });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const submit = { preventDefault() {} };
const category = { id: randomUUID(), name: "Cheese & Dairy", predefined_order: 7, created_at: "1" };
const item = (name, checked = false) => ({ id: randomUUID(), text: name, checked, category_id: category.id, created_at: "1" });

test("loading never flashes empty; load failure has an actionable retry", async () => {
  let fail = true;
  const h = harness({ load: async () => { if (fail) throw { code: "NETWORK" }; return { items: [], categories: [] }; } });
  let tree = h.render();
  assert.match(text(tree), /Loading Shopping/);
  await flush(); tree = h.render();
  assert(all(tree).some((node) => node.props.role === "alert"));
  fail = false; button(tree, "Retry loading Shopping").props.onClick();
  assert.match(text(h.render()), /Loading Shopping/);
  await flush();
  assert.match(text(h.render()), /Your Shopping List is empty/);
  assert.match(text(h.render()), /Shopping reloaded/);
});

test("manual auto category is visible, double submission blocked, failed add retains draft and stable retry identity", async () => {
  const calls = [];
  let release, fail = true;
  const h = harness({ load: async () => ({ items: [], categories: [category] }),
    add: async (draft) => {
      calls.push(draft);
      await new Promise((resolve) => { release = resolve; });
      if (fail) throw { code: "NETWORK" };
      return { ...draft, checked: false, created_at: "2" };
    } });
  h.render(); await flush();
  let tree = h.render();
  change(input(tree, "Add item"), "  2 eggs ");
  tree = h.render();
  assert.match(text(tree), /Automatic category: Cheese & Dairy/);
  const form = all(tree).find((node) => node.type === "form");
  form.props.onSubmit(submit); form.props.onSubmit(submit);
  assert.equal(calls.length, 1);
  assert.equal(button(h.render(), "Add item").props.disabled, true);
  release(); await flush();
  tree = h.render();
  assert.equal(input(tree, "Add item").props.value, "  2 eggs ");
  assert.match(text(tree), /network failure/);
  fail = false; button(tree, "Retry last action").props.onClick(); release(); await flush();
  tree = h.render();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[1].text, "  2 eggs ");
  assert.equal(calls[1].category_id, category.id);
  assert.equal(input(tree, "Add item").props.value, "");
  assert.match(text(tree), /Shopping item added/);
});

test("Category headings are distinct from item rows and Item Actions is visibly labeled", async () => {
  const a = item("eggs");
  const h = harness({ load: async () => ({ items: [a], categories: [category] }) });
  h.render(); await flush();
  const tree = h.render();
  const group = all(tree).find((node) => node.type === h.ShoppingGroup);
  const groupHarness = harness({});
  const categoryTree = groupHarness.render(groupHarness.ShoppingGroup, group.props);
  const toggle = all(categoryTree).find((node) => node.type === "button");
  assert.match(text(toggle), /Cheese & Dairy1 remaining · 1 itemsHide items/);
  assert.equal(toggle.props["aria-expanded"], true);
  const actions = button(tree, "Actions for eggs");
  assert.equal(text(actions), "Item Actions");
  assert.equal(actions.props["aria-haspopup"], "dialog");

  const css = fs.readFileSync(path.join(root, "src", "pages", "Meals", "ShoppingPage.module.css"), "utf8");
  assert.match(css, /\.categoryToggle\s*\{[^}]*border-left:\s*4px solid var\(--lm-color-meals\)[^}]*background:\s*var\(--lm-color-meals-subtle\)/);
  assert.match(css, /\.groupComplete\s+\.categoryToggle\s*\{[^}]*border-left-color:\s*var\(--lm-color-success\)/);
  assert.match(css, /\.itemActionButton\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/);
});

test("item actions stay out of rows and Edit, Move and Remove use the item action sheet", async () => {
  const a = item("eggs");
  const calls = [];
  let fail = true;
  const h = harness({ load: async () => ({ items: [a], categories: [category] }),
    edit: async (id, value) => { calls.push(["edit", id, value]); if (fail) throw { code: "NETWORK" }; return { ...a, text: value }; },
    categorize: async (id, value) => { calls.push(["category", id, value]); return { ...a, text: "changed", category_id: value }; },
    remove: async (id) => { calls.push(["remove", id]); } });
  h.render(); await flush();
  let tree = h.render();
  assert(button(tree, "Actions for eggs"));
  assert.equal(input(tree, "Category for eggs"), undefined, "Normal item rows have no permanent Category selector");
  button(tree, "Actions for eggs").props.onClick();
  tree = h.render();
  let action = all(tree).find((node) => node.type === h.ItemActionDialog);
  const actionHarness = harness({});
  let dialog = actionHarness.render(actionHarness.ItemActionDialog, action.props);
  assert.match(text(dialog), /EditMoveRemove/);
  action.props.onMode("edit");
  tree = h.render();
  action = all(tree).find((node) => node.type === h.ItemActionDialog);
  dialog = actionHarness.render(actionHarness.ItemActionDialog, action.props);
  change(input(dialog, "Shopping item"), "changed");
  dialog = actionHarness.render(actionHarness.ItemActionDialog, action.props);
  all(dialog).find((node) => node.type === "form").props.onSubmit(submit);
  await flush(); tree = h.render();
  action = all(tree).find((node) => node.type === h.ItemActionDialog);
  assert(action);
  assert.match(action.props.error, /network failure/);
  dialog = actionHarness.render(actionHarness.ItemActionDialog, action.props);
  assert(button(dialog, "Retry last action"));
  fail = false; button(dialog, "Retry last action").props.onClick(); await flush();
  tree = h.render();
  assert(!all(tree).some((node) => node.type === h.ItemActionDialog));
  assert.deepEqual(calls.at(-1), ["edit", a.id, "changed"]);
  button(tree, "Actions for changed").props.onClick(); tree = h.render();
  action = all(tree).find((node) => node.type === h.ItemActionDialog);
  action.props.onMode("move"); tree = h.render();
  action = all(tree).find((node) => node.type === h.ItemActionDialog);
  const moveHarness = harness({});
  dialog = moveHarness.render(moveHarness.ItemActionDialog, action.props);
  change(input(dialog, "Shopping Category"), "");
  dialog = moveHarness.render(moveHarness.ItemActionDialog, action.props);
  assert.equal(input(dialog, "Shopping Category").props.value, "");
  all(dialog).find((node) => node.type === "form").props.onSubmit(submit);
  await flush(); tree = h.render();
  assert.deepEqual(calls.at(-1), ["category", a.id, null]);
  assert(!all(tree).some((node) => node.type === h.ItemActionDialog));
  button(tree, "Actions for changed").props.onClick(); tree = h.render();
  action = all(tree).find((node) => node.type === h.ItemActionDialog);
  action.props.onRemove(); await flush();
  tree = h.render();
  assert.deepEqual(calls.at(-1), ["remove", a.id]);
  assert.match(text(h.render()), /Your Shopping List is empty/);
});

test("Clear Checked removes only checked rows without confirmation; Clear List cancel adds no mutation and success keeps categories", async () => {
  const checked = item("checked", true), unchecked = item("unchecked");
  const calls = [];
  const h = harness({ load: async () => ({ items: [checked, unchecked], categories: [category] }),
    clearChecked: async () => calls.push("checked"), clearList: async () => calls.push("list") });
  h.render(); await flush();
  button(h.render(), "Clear Checked").props.onClick(); await flush();
  let tree = h.render();
  assert.deepEqual(calls, ["checked"]);
  assert(!button(tree, "Actions for checked"));
  assert(button(tree, "Actions for unchecked"));
  button(tree, "Clear List").props.onClick(); tree = h.render();
  let dialog = all(tree).find((node) => node.type === h.ClearConfirmation);
  dialog.props.onCancel(); tree = h.render();
  assert.deepEqual(calls, ["checked"]);
  button(tree, "Clear List").props.onClick(); tree = h.render();
  dialog = all(tree).find((node) => node.type === h.ClearConfirmation);
  dialog.props.onClear(); await flush();
  tree = h.render();
  assert.deepEqual(calls, ["checked", "list"]);
  assert.match(text(tree), /Categories kept/);
  assert.match(text(tree), /Your Shopping List is empty/);
});

test("completed Categories collapse on transition, stay open after manual reopen, and expand when unchecked", () => {
  for (const mobile of [false, true]) {
    const alreadyComplete = harness({}, mobile);
    const completeProps = { name: "Category", items: [item("done", true)], children: "rows" };
    const initialCompleteTree = alreadyComplete.render(alreadyComplete.ShoppingGroup, completeProps);
    assert.equal(all(initialCompleteTree).find((node) => node.type === "div").props.hidden, false,
      "a pre-completed Category does not collapse without a completion transition");

    const h = harness({}, mobile);
    const items = [item("first"), item("second")];
    const props = { name: "Category", items, children: "rows" };
    const render = () => h.render(h.ShoppingGroup, props);
    let tree = render();
    assert.equal(all(tree).find((node) => node.type === "div").props.hidden, false);
    items[0] = { ...items[0], checked: true };
    render();
    tree = render();
    assert.equal(all(tree).find((node) => node.type === "div").props.hidden, false);
    items[1] = { ...items[1], checked: true };
    render();
    tree = render();
    const content = () => all(tree).find((node) => node.type === "div").props.hidden;
    assert.equal(content(), true);
    const toggle = () => all(tree).find((node) => node.type === "button");
    toggle().props.onClick();
    tree = render();
    assert.equal(content(), false);
    tree = render();
    assert.equal(content(), false, "an expanded completed Category stays expanded");
    toggle().props.onClick();
    tree = render();
    assert.equal(content(), true);
    items[0] = { ...items[0], checked: false };
    render();
    tree = render();
    assert.equal(content(), false, "unchecking an item expands the Category");
  }
});

test("failed completion persistence leaves the Shopping row unchecked and the Category expanded", async () => {
  const a = item("eggs");
  const h = harness({ load: async () => ({ items: [a], categories: [category] }),
    check: async () => { throw { code: "NETWORK" }; } });
  h.render(); await flush();
  let tree = h.render();
  input(tree, "Purchased eggs").props.onChange({ target: { checked: true } });
  await flush();
  tree = h.render();
  assert.equal(input(tree, "Purchased eggs").props.checked, false);
  const group = all(tree).find((node) => node.type === h.ShoppingGroup);
  const groupHarness = harness({});
  const categoryTree = groupHarness.render(groupHarness.ShoppingGroup, group.props);
  assert.equal(all(categoryTree).find((node) => node.type === "div").props.hidden, false);
  assert(all(tree).some((node) => node.props.role === "alert"));
});

test("Customize tab preserves category management and failed category creation is retryable", async () => {
  const a = item("keep");
  let created, failCreate = true;
  const h = harness({ load: async () => ({ items: [a], categories: [category] }),
    createCategory: async (draft) => {
      created = draft;
      if (failCreate) throw { code: "NETWORK" };
      return { ...draft, predefined_order: null, created_at: "2" };
    },
  }, false, "/meals/shopping/customize");
  h.render(); await flush();
  let tree = h.render();
  assert.match(text(tree), /Shopping Categories/);
  assert.match(text(tree), /Customize/);
  change(input(tree, "New custom category"), "Custom");
  tree = h.render();
  all(tree).find((node) => node.type === "form" && button(node, "Create category")).props.onSubmit(submit);
  await flush(); tree = h.render();
  assert.equal(input(tree, "New custom category").props.value, "Custom");
  const id = created.id;
  failCreate = false; button(tree, "Retry last action").props.onClick(); await flush();
  assert.equal(created.id, id);
  tree = h.render();
  assert(button(tree, "Rename Custom"));
  assert(!button(tree, "Rename Cheese & Dairy"));
  assert(!button(tree, "Clear List"));
  assert(!button(tree, "Actions for keep"));
});

test("manual Add item permits an explicit category when automatic assignment has no match", async () => {
  const h = harness({ load: async () => ({ items: [], categories: [category] }),
    add: async (draft) => ({ ...draft, checked: false, created_at: "2" }) });
  h.render(); await flush();
  let tree = h.render();
  change(input(tree, "Add item"), "special grocery");
  tree = h.render();
  change(input(tree, "Category"), category.id);
  tree = h.render();
  all(tree).find((node) => node.type === "form").props.onSubmit(submit);
  await flush();
  assert.match(text(h.render()), /Shopping item added/);
});

test("Shopping tabs expose Shopping List as default and Customize as a distinct route", async () => {
  for (const [pathname, expected] of [["/meals/shopping", "Shopping List"], ["/meals/shopping/customize", "Customize"]]) {
    const h = harness({ load: async () => ({ items: [], categories: [] }) }, false, pathname);
    h.render(); await flush();
    const tree = h.render();
    const links = all(tree).filter((node) => node.type === "link");
    assert(links.some((node) => node.props.to === "/meals/shopping"));
    assert(links.some((node) => node.props.to === "/meals/shopping/customize"));
    assert.match(text(tree), new RegExp(expected));
  }
});

test("confirmation Escape cancellation works explicitly and is blocked while pending", () => {
  for (const pending of [true, false]) {
    let cancelled = 0, prevented = 0, stopped = 0;
    // Effects need a real dialog only in browser tests; inspect this component's event contract here.
    const context = {
      useRef: () => ({ current: null }), useEffect() {}, styles: {},
      element: (type, props, ...children) => ({ type, props, children }),
    };
    const Clear = vm.runInNewContext(`(()=>{${compiled};return ClearConfirmation;})()`,
      { ...context, createShoppingService: () => ({}), fragment: "fragment" });
    const tree = Clear({ pending, onCancel: () => cancelled++, onClear() {}, error: "" });
    tree.props.onKeyDown({ key: "Escape", preventDefault: () => prevented++, stopPropagation: () => stopped++ });
    assert.equal(cancelled, pending ? 0 : 1);
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
  }
});
