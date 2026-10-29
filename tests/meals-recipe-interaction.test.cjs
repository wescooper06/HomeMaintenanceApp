const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const serviceSource = fs.readFileSync(path.join(root, "src", "services", "recipeService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const helpers = vm.runInThisContext(`(() => { ${serviceSource}; return {recipeMatches,sortRecipes}; })()`);
const initial = () => ({ id: randomUUID(), title: "", source: "", category_id: null, cuisine_id: null,
  instructions: "", favorite: false, ingredient_sections: [{ name: "Ingredients", text: "" }] });
let compiled;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Meals", "RecipeCore.jsx");
  const input = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  compiled = (await transformWithOxc(input, file, { jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" } })).code;
});

function harness(service = {}) {
  const slots = [], navigations = [], listeners = new Map(), effects = [];
  let index = 0, blocking;
  const blocker = { state: "unblocked", reset() { blocker.state = "unblocked"; }, proceed() { navigations.push("discard"); } };
  const context = {
    element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((v) => v !== null && v !== undefined && v !== false) }),
    fragment: "fragment", Link: "link", styles: {}, createRecipeService: () => service, ...helpers,
    useState(value) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(value) { const i = index++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect(effect, dependencies) {
      const i = index++;
      if (!slots[i] || dependencies.some((v, j) => v !== slots[i].dependencies[j])) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { dependencies, cleanup: effect() }; });
      }
    },
    useNavigate: () => (to) => navigations.push(to),
    useBlocker: (check) => { blocking = check; return blocker; },
    window: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) },
  };
  const components = vm.runInNewContext(`(() => { ${compiled}; return {
    EditorForm, Favorite, DeleteConfirmation, RecipeLibrary, Classification
  }; })()`, context);
  return { ...components, navigations, listeners, blocker, shouldBlock: () => blocking(),
    render(Component, props) {
      index = 0;
      const tree = Component(props);
      effects.splice(0).forEach((fn) => fn());
      return tree;
    } };
}
function nodes(tree) {
  return !tree || typeof tree !== "object" ? [] : [tree, ...tree.children.flatMap(nodes)];
}
function text(tree) { return typeof tree === "object" ? tree.children.map(text).join("") : String(tree); }
function button(tree, label) { return nodes(tree).find((n) => n.type === "button" && text(n) === label); }
function labeledInput(tree, label) {
  return nodes(tree).find((n) => n.type === "label" && n.children[0] === label).children.find((n) => typeof n === "object");
}
const change = (node, value) => node.props.onChange({ target: { value } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("editor title-only validation, multiline text, failed-save retention/retry and synchronous duplicate-submit guard", async () => {
  let attempts = 0, submitted, finish;
  const h = harness({ create: async (draft) => {
    submitted = structuredClone(draft); attempts++;
    if (attempts === 1) throw new Error("offline");
    return new Promise((resolve) => { finish = () => resolve(draft); });
  } });
  const props = { initial: initial(), categories: [], cuisines: [], edit: false };
  const render = () => h.render(h.EditorForm, props);
  let tree = render();
  await nodes(tree).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(attempts, 0);
  assert(nodes(render()).some((n) => n.props.error === "Recipe Title is required."));
  change(labeledInput(tree, "Title"), "  Test Recipe  ");
  tree = render();
  change(labeledInput(tree, "Ingredient text"), "\nFlour\n\nFlour\n");
  tree = render();
  change(labeledInput(tree, "Instructions"), " \nMix\n\nBake. ");
  tree = render();
  await nodes(tree).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  tree = render();
  assert.equal(labeledInput(tree, "Title").props.value, "  Test Recipe  ");
  assert.equal(labeledInput(tree, "Ingredient text").props.value, "\nFlour\n\nFlour\n");
  assert(nodes(tree).some((n) => n.props.error?.includes("Recipe was not saved")));
  const form = nodes(tree).find((n) => n.type === "form");
  const pending = form.props.onSubmit({ preventDefault() {} });
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(attempts, 2);
  tree = render();
  assert(nodes(tree).some((n) => n.type === "fieldset" && n.props.disabled));
  assert.equal(h.navigations.length, 0);
  finish(); await pending;
  assert.equal(submitted.instructions, " \nMix\n\nBake. ");
  assert.equal(submitted.id, props.initial.id);
  assert.equal(h.navigations[0], `/meals/recipes/${props.initial.id}`);
  assert.equal(h.shouldBlock(), false);
});

test("unsaved warning: clean bypass, dirty block, stay retains content, deliberate discard; beforeunload attached", () => {
  const h = harness();
  const props = { initial: initial(), categories: [], cuisines: [], edit: false };
  let tree = h.render(h.EditorForm, props);
  assert.equal(h.shouldBlock(), false);
  change(labeledInput(tree, "Title"), "Keep this");
  tree = h.render(h.EditorForm, props);
  assert.equal(h.shouldBlock(), true);
  assert(h.listeners.has("beforeunload"));
  let prevented = false;
  h.listeners.get("beforeunload")({ preventDefault() { prevented = true; } });
  assert(prevented);
  h.blocker.state = "blocked";
  tree = h.render(h.EditorForm, props);
  button(tree, "Stay in editor").props.onClick();
  tree = h.render(h.EditorForm, props);
  assert.equal(labeledInput(tree, "Title").props.value, "Keep this");
  h.blocker.state = "blocked";
  tree = h.render(h.EditorForm, props);
  button(tree, "Discard changes").props.onClick();
  assert.equal(h.navigations[0], "discard");
});

test("default Ingredients, add/remove section, empty ingredients and edit model", () => {
  const h = harness();
  const props = { initial: { ...initial(), title: "Existing" }, categories: [], cuisines: [], edit: true };
  let tree = h.render(h.EditorForm, props);
  assert.equal(labeledInput(tree, "Section name").props.value, "Ingredients");
  assert.equal(labeledInput(tree, "Title").props.value, "Existing");
  button(tree, "Add ingredient section").props.onClick();
  tree = h.render(h.EditorForm, props);
  assert.equal(nodes(tree).filter((n) => n.type === "textarea").length, 3);
  button(tree, "Remove section 2").props.onClick();
  tree = h.render(h.EditorForm, props);
  button(tree, "Remove section 1").props.onClick();
  tree = h.render(h.EditorForm, props);
  assert.equal(nodes(tree).filter((n) => n.type === "textarea").length, 1);
});

test("favorite stops propagation and never invokes navigation; single/bulk confirmation callbacks are explicit", () => {
  const h = harness();
  const recipe = { ...initial(), title: "Favorite me" };
  const toggles = [];
  const tree = h.Favorite({ recipe, onChange: (value) => toggles.push(value.id), pending: false });
  let stopped = false;
  tree.props.onClick({ stopPropagation() { stopped = true; } });
  assert(stopped);
  assert.deepEqual(toggles, [recipe.id]);
  assert.deepEqual(h.navigations, []);
  for (const count of [1, 3]) {
    let deleted = 0, cancelled = 0;
    const dialog = h.DeleteConfirmation({ count, pending: false, onCancel() { cancelled++; }, onDelete() { deleted++; } });
    assert.equal(deleted, 0);
    button(dialog, "Cancel deletion").props.onClick();
    assert.equal(cancelled, 1);
    button(dialog, "Confirm delete").props.onClick();
    assert.equal(deleted, 1);
  }
});

test("library loading/error/retry, empty and filtered zero-result states", async () => {
  let fail = true;
  let recipes = [];
  const h = harness({ list: async () => { if (fail) throw new Error("offline"); return recipes; },
    categories: { list: async () => [] }, cuisines: { list: async () => [] } });
  let tree = h.render(h.RecipeLibrary);
  assert.match(text(tree), /Loading Recipes/);
  assert.doesNotMatch(text(tree), /No Recipes yet/);
  await flush();
  tree = h.render(h.RecipeLibrary);
  const error = nodes(tree).find((n) => n.props.error === "offline");
  assert(error);
  fail = false; error.props.retry();
  tree = h.render(h.RecipeLibrary);
  await flush();
  tree = h.render(h.RecipeLibrary);
  assert.match(text(tree), /No Recipes yet/);
  recipes = [{ ...initial(), title: "Soup" }];
  const h2 = harness({ list: async () => recipes,
    categories: { list: async () => [] }, cuisines: { list: async () => [] } });
  h2.render(h2.RecipeLibrary); await flush();
  tree = h2.render(h2.RecipeLibrary);
  change(labeledInput(tree, "Search Recipes"), "no match");
  tree = h2.render(h2.RecipeLibrary);
  assert.match(text(tree), /No Recipes match the current criteria/);
  button(tree, "Clear search and filters").props.onClick();
  tree = h2.render(h2.RecipeLibrary);
  assert.doesNotMatch(text(tree), /No Recipes match/);
});
