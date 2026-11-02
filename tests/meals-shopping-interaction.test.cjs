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

test("mobile fully-checked group collapses, can be expanded; desktop stays open", () => {
  for (const mobile of [false, true]) {
    const h = harness({}, mobile);
    const props = { name: "Category", items: [item("done", true)], children: "rows" };
    h.render(h.ShoppingGroup, props);
    let tree = h.render(h.ShoppingGroup, props);
    assert.equal(all(tree).find((node) => node.type === "div").props.hidden, mobile);
    if (mobile) {
      all(tree).find((node) => node.type === "button").props.onClick();
      tree = h.render(h.ShoppingGroup, props);
      assert.equal(all(tree).find((node) => node.type === "div").props.hidden, false);
    }
  }
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
