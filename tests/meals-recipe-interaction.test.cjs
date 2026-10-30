const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const serviceSource = fs.readFileSync(path.join(root, "src", "services", "recipeService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const helpers = vm.runInThisContext(`(() => { ${serviceSource}; return {newRecipe,recipeMatches,sortRecipes}; })()`);
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
    confirm: () => { assert.fail("Classification errors must not use the browser confirmation dialog"); },
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
    useParams: () => ({ id: "recipe-1" }),
    useBlocker: (check) => { blocking = check; return blocker; },
    window: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) },
  };
  const components = vm.runInNewContext(`(() => { ${compiled}; return {
    EditorForm, ErrorMessage, Favorite, DeleteConfirmation, RecipeLibrary, RecipeDetail, RecipeEditor, Classification
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
  return nodes(tree).find((n) => n.type === "label"
    && n.children.filter((value) => typeof value !== "object").join("") === label)
    .children.find((n) => typeof n === "object");
}
const change = (node, value) => node.props.onChange({ target: { value } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function classificationEditor(kind, methods) {
  const label = kind === "categories" ? "Category" : "Cuisine";
  const editor = harness();
  const classification = harness({ [kind]: methods });
  const categories = [{ id: randomUUID(), name: "Dinner" }];
  const cuisines = [{ id: randomUUID(), name: "French" }];
  const props = { initial: { ...initial(), title: "Saved Recipe",
    category_id: categories[0].id, cuisine_id: cuisines[0].id }, categories, cuisines, edit: true };
  const renderEditor = () => editor.render(editor.EditorForm, props);
  for (const [field, value] of [["Title", "Unsaved title"], ["Source", "Unsaved source"],
    ["Section name", "Unsaved section"], ["Ingredient text", "\nFlour\n\nEggs"],
    ["Instructions", "Mix\n\nBake"]]) {
    change(labeledInput(renderEditor(), field), value);
  }
  nodes(renderEditor()).find((n) => n.type === "input" && n.props.type === "checkbox")
    .props.onChange({ target: { checked: true } });
  function snapshot() {
    const tree = renderEditor();
    return {
      fields: nodes(tree).filter((n) => ["input", "textarea"].includes(n.type))
        .map((n) => ({ value: n.props.value, checked: n.props.checked })),
      classifications: nodes(tree).filter((n) => n.type.name === "Classification")
        .map((n) => ({ kind: n.props.kind, value: n.props.value, values: n.props.values })),
    };
  }
  return {
    label, snapshot, editor,
    render() {
      const child = nodes(renderEditor()).find((n) => n.type.name === "Classification" && n.props.kind === kind);
      return classification.render(classification.Classification, child.props);
    },
    alert(tree) {
      const error = nodes(tree).find((n) => n.type.name === "ErrorMessage");
      return classification.ErrorMessage(error.props);
    },
  };
}

for (const kind of ["categories", "cuisines"]) {
  test(`${kind}: referenced deletion shows exact accessible refusal with browser confirm, preserves draft, retries and clears stale errors`, async () => {
    let attempts = 0;
    const h = classificationEditor(kind, {
      remove: async () => { attempts++; throw Object.assign(new Error("foreign key violation"), { code: "23503" }); },
      rename: async (id, name) => ({ id, name }),
    });
    const before = h.snapshot();
    const expected = `Cannot delete this ${h.label} because it is used by a Recipe. Reassign Recipes using it, then try again.`;
    const remove = () => button(h.render(), `Delete unused ${h.label}`).props.onClick();
    await remove();
    let tree = h.render();
    assert.equal(nodes(tree).find((n) => n.type.name === "ErrorMessage").props.error, expected);
    assert.equal(text(h.alert(tree)).trim(), expected);
    assert.equal(h.alert(tree).props.role, "alert");
    assert.equal(tree.type, "fieldset", "Alert remains beside the classification controls");
    assert.deepEqual(h.snapshot(), before);
    assert(h.editor.shouldBlock(), "Unsaved Recipe changes still require discard confirmation");
    assert.equal(text(h.alert(h.render())).trim(), expected, "Refusal persists across renders");
    assert.equal(button(tree, `Delete unused ${h.label}`).props.disabled, false);
    assert.equal(tree.props.disabled, false, "Controls unlock after failure");
    await remove();
    assert.equal(attempts, 2);
    assert.deepEqual(h.snapshot(), before);
    change(labeledInput(h.render(), `Select ${h.label}`), "");
    assert.equal(h.alert(h.render()), null, "Changing selection clears stale refusal");
    change(labeledInput(h.render(), `Select ${h.label}`),
      before.classifications.find((value) => value.kind === kind).value);
    await remove();
    change(labeledInput(h.render(), `${h.label} name`), "Renamed");
    assert.equal(h.alert(h.render()), null, "Changing action input clears stale refusal");
    await remove();
    assert.equal(text(h.alert(h.render())).trim(), expected);
    await button(h.render(), `Rename ${h.label}`).props.onClick();
    assert.equal(h.alert(h.render()), null, "Successful classification action clears refusal");
    const after = h.snapshot();
    assert.deepEqual(after.fields, before.fields);
    assert.equal(after.classifications.find((value) => value.kind === kind).value,
      before.classifications.find((value) => value.kind === kind).value);
    assert.equal(after.classifications.find((value) => value.kind === kind).values[0].name, "Renamed");
    assert.equal(h.editor.navigations.length, 0);
  });

  test(`${kind}: network, authorization and unknown failures are not mislabeled as reference conflicts`, async () => {
    for (const failure of [
      new Error("Network request failed"),
      Object.assign(new Error("Permission denied"), { code: "42501" }),
      Object.assign(new Error("Authentication required"), { code: "PGRST301" }),
      new Error("Unknown failure: used by a Recipe"),
    ]) {
      let attempts = 0;
      const h = classificationEditor(kind, { remove: async () => {
        attempts++;
        if (attempts === 1) throw Object.assign(new Error("Reference refused"), { code: "23503" });
        throw failure;
      } });
      const before = h.snapshot();
      await button(h.render(), `Delete unused ${h.label}`).props.onClick();
      await button(h.render(), `Delete unused ${h.label}`).props.onClick();
      const alert = h.alert(h.render());
      assert.equal(alert.props.role, "alert");
      assert.equal(text(alert).trim(), `${failure.message} No classification change was confirmed; retry when ready.`);
      assert.doesNotMatch(text(alert), /Cannot delete this/);
      assert.deepEqual(h.snapshot(), before);
    }
  });

  test(`${kind}: unused deletion still removes only the classification and clears its draft selection`, async () => {
    let attempts = 0;
    const h = classificationEditor(kind, { remove: async () => {
      if (!attempts++) throw new Error("Offline");
    } });
    const before = h.snapshot();
    await button(h.render(), `Delete unused ${h.label}`).props.onClick();
    assert(h.alert(h.render()));
    await button(h.render(), `Delete unused ${h.label}`).props.onClick();
    assert.equal(h.alert(h.render()), null);
    const after = h.snapshot();
    assert.deepEqual(after.fields, before.fields);
    assert.equal(after.classifications.find((value) => value.kind === kind).value, null);
    assert.deepEqual(after.classifications.find((value) => value.kind === kind).values, []);
    assert.deepEqual(after.classifications.find((value) => value.kind !== kind),
      before.classifications.find((value) => value.kind !== kind));
    assert.equal(button(h.render(), `Delete unused ${h.label}`).props.disabled, true);
    assert.equal(attempts, 2);
  });

  test(`${kind}: a non-delete failure never receives the delete-refusal wording`, async () => {
    const h = classificationEditor(kind, { rename: async () => {
      throw Object.assign(new Error("Rename rejected"), { code: "23503" });
    } });
    const before = h.snapshot();
    change(labeledInput(h.render(), `${h.label} name`), "New name");
    await button(h.render(), `Rename ${h.label}`).props.onClick();
    assert.equal(text(h.alert(h.render())).trim(), "Rename rejected No classification change was confirmed; retry when ready.");
    assert.deepEqual(h.snapshot(), before);
  });
}

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
  assert(nodes(tree).some((n) => n.type === "link" && n.props.to === "/meals/recipes/new"
    && text(n) === "Add Recipe"));
  assert.doesNotMatch(text(tree), /No Recipes match the current criteria/);
  recipes = [{ ...initial(), title: "Soup" }];
  const h2 = harness({ list: async () => recipes,
    categories: { list: async () => [] }, cuisines: { list: async () => [] } });
  h2.render(h2.RecipeLibrary); await flush();
  tree = h2.render(h2.RecipeLibrary);
  change(labeledInput(tree, "Search Recipes"), "no match");
  tree = h2.render(h2.RecipeLibrary);
  assert.match(text(tree), /No Recipes match the current criteria/);
  assert.doesNotMatch(text(tree), /No Recipes yet/);
  button(tree, "Clear search and filters").props.onClick();
  tree = h2.render(h2.RecipeLibrary);
  assert.doesNotMatch(text(tree), /No Recipes match/);
  assert.match(text(tree), /Soup/);
});

test("data-backed Meals pages render accessible load errors and recover through Retry", async () => {
  const recipe = { ...initial(), title: "Recovered Recipe" };
  const cases = [
    {
      name: "Recipe Library",
      Component: "RecipeLibrary",
      service: (attempts) => ({
        list: async () => { if (!attempts.list++) throw new Error("offline"); return [recipe]; },
        categories: { list: async () => [] },
        cuisines: { list: async () => [] },
      }),
      expected: /Recovered Recipe/,
    },
    {
      name: "Recipe Detail",
      Component: "RecipeDetail",
      service: (attempts) => ({
        get: async () => { if (!attempts.get++) throw new Error("offline"); return recipe; },
        categories: { list: async () => [] },
        cuisines: { list: async () => [] },
      }),
      expected: /Recovered Recipe/,
    },
    {
      name: "Recipe Editor",
      Component: "RecipeEditor",
      service: (attempts) => ({
        categories: { list: async () => { if (!attempts.categories++) throw new Error("offline"); return []; } },
        cuisines: { list: async () => [] },
      }),
      recovered(tree) {
        const editor = nodes(tree).find((n) => n.type.name === "EditorForm");
        return editor?.props.initial.title === "";
      },
    },
  ];

  for (const scenario of cases) {
    const attempts = { list: 0, get: 0, categories: 0 };
    const h = harness(scenario.service(attempts));
    const Component = h[scenario.Component];
    let tree = h.render(Component, {});
    await flush();
    tree = h.render(Component, {});
    const error = nodes(tree).find((n) => n.type.name === "ErrorMessage");
    assert(error, `${scenario.name} should render an error: ${text(tree)}; attempts=${JSON.stringify(attempts)}`);
    assert.match(error.props.error, /offline/);
    const renderedError = h.ErrorMessage(error.props);
    assert(nodes(renderedError).some((n) => n.props.role === "alert"));
    const retry = button(renderedError, "Retry");
    assert(retry, `${scenario.name} should render a Retry action`);

    tree = h.render(Component, {});
    assert.match(nodes(tree).find((n) => n.type.name === "ErrorMessage").props.error, /offline/);
    retry.props.onClick();
    tree = h.render(Component, {});
    await flush();
    tree = h.render(Component, {});
    assert.doesNotMatch(text(tree), /offline/);
    if (scenario.recovered) {
      assert(scenario.recovered(tree), `${scenario.name} should render recovered content`);
    } else {
      assert.match(text(tree), scenario.expected, `${scenario.name} should render recovered content`);
    }
  }
});

test("persisted Recipe Favorite mutation failure preserves state and can be retried", async () => {
  const recipe = { ...initial(), title: "Persisted Recipe", favorite: false };
  let attempts = 0;
  const h = harness({
    list: async () => [recipe],
    categories: { list: async () => [] },
    cuisines: { list: async () => [] },
    favorite: async (id, value) => {
      assert.equal(id, recipe.id);
      attempts++;
      if (attempts === 1) throw new Error("offline");
      return { ...recipe, favorite: value };
    },
  });
  let tree = h.render(h.RecipeLibrary);
  await flush();
  tree = h.render(h.RecipeLibrary);
  let favoriteElement = nodes(tree).find((n) => n.type.name === "Favorite");
  assert(favoriteElement, `Favorite component missing: ${text(tree)}`);
  let favorite = h.Favorite(favoriteElement.props);
  assert.equal(favorite.props["aria-pressed"], false);

  favorite.props.onClick({ stopPropagation() {} });
  await flush();
  tree = h.render(h.RecipeLibrary);
  assert.equal(h.navigations.length, 0);
  assert.equal(attempts, 1);
  favoriteElement = nodes(tree).find((n) => n.type.name === "Favorite");
  favorite = h.Favorite(favoriteElement.props);
  assert.equal(favorite.props["aria-pressed"], false);
  const error = nodes(tree).find((n) => n.type.name === "ErrorMessage");
  assert(error);
  const renderedError = h.ErrorMessage(error.props);
  assert.match(text(renderedError), /not confirmed/i);
  assert.match(text(renderedError), /retry/i);

  favorite.props.onClick({ stopPropagation() {} });
  await flush();
  tree = h.render(h.RecipeLibrary);
  favoriteElement = nodes(tree).find((n) => n.type.name === "Favorite");
  favorite = h.Favorite(favoriteElement.props);
  assert.equal(attempts, 2);
  assert.equal(favorite.props["aria-pressed"], true);
  assert.match(text(favorite), /Unfavorite/);
  assert.equal(nodes(tree).some((n) => n.props.role === "alert"), false);
  assert.equal(h.navigations.length, 0);
});
