const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const serviceSource = fs.readFileSync(path.join(root, "src", "services", "recipeService.js"), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
const helpers = vm.runInThisContext(`(() => { ${serviceSource}; return {newRecipe,newRecipeFilters,recipeMatches,sortRecipes}; })()`);
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
    fragment: "fragment", Link: "link", RecipeShopping: "recipe-shopping", styles: {}, createRecipeService: () => service, ...helpers,
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
    EditorForm, ErrorMessage, Favorite, DeleteConfirmation, RecipeLibrary, RecipeDetail, RecipeEditor, Classification, ClassificationFilter, instructionLines, ingredientPasteText
  }; })()`, context);
  let filters = helpers.newRecipeFilters();
  const setFilters = (next) => { filters = typeof next === "function" ? next(filters) : next; };
  return { ...components, navigations, listeners, blocker, shouldBlock: () => blocking(), getFilters: () => filters,
    render(Component, props) {
      index = 0;
      const tree = Component(Component === components.RecipeLibrary ? { filters, setFilters, ...props } : props);
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

test("Wave 2 Library action requires exactly one selection and preserves multi-delete; Detail stays open with confirmation/link", async () => {
  const recipe = { ...initial(), id: "recipe-1", title: "First" };
  const second = { ...initial(), id: "recipe-2", title: "Second" };
  const before = JSON.stringify(recipe);
  const service = { list: async () => [recipe, second], get: async () => recipe,
    categories: { list: async () => [] }, cuisines: { list: async () => [] } };
  const h = harness(service);
  h.render(h.RecipeLibrary);
  await new Promise((resolve) => setImmediate(resolve));
  let tree = h.render(h.RecipeLibrary);
  const select = (name) => nodes(tree).find((n) => n.type === "input" && n.props["aria-label"] === `Select ${name}`).props.onChange();
  assert.equal(button(tree, "Add to Shopping List").props.disabled, true);
  select("First"); tree = h.render(h.RecipeLibrary);
  assert.equal(button(tree, "Add to Shopping List").props.disabled, false);
  select("Second"); tree = h.render(h.RecipeLibrary);
  assert.equal(button(tree, "Add to Shopping List").props.disabled, true);
  assert.equal(button(tree, "Delete selected").props.disabled, false);
  select("Second"); tree = h.render(h.RecipeLibrary);
  button(tree, "Add to Shopping List").props.onClick();
  tree = h.render(h.RecipeLibrary);
  const modal = nodes(tree).find((n) => n.type === "recipe-shopping");
  assert.equal(modal.props.recipeId, recipe.id);
  modal.props.onClose();
  assert.equal(nodes(h.render(h.RecipeLibrary)).filter((n) => n.type === "recipe-shopping").length, 0);
  const detail = harness(service);
  detail.render(detail.RecipeDetail);
  await new Promise((resolve) => setImmediate(resolve));
  tree = detail.render(detail.RecipeDetail);
  button(tree, "Add to Shopping List").props.onClick();
  tree = detail.render(detail.RecipeDetail);
  const picker = nodes(tree).find((n) => n.type === "recipe-shopping");
  picker.props.onAdded(2); picker.props.onClose();
  tree = detail.render(detail.RecipeDetail);
  assert(text(tree).includes("2 ingredients added to Shopping List."));
  assert(nodes(tree).some((n) => n.type === "link" && n.props.to === "/meals/shopping" && text(n) === "View Shopping List"));
  assert.equal(detail.navigations.length, 0);
  assert.equal(JSON.stringify(recipe), before);
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("Ingredient paste normalization removes only blank LF/CRLF/CR lines and preserves retained text and duplicates", () => {
  const h = harness();
  for (const separator of ["\n", "\r\n", "\r"]) {
    const raw = ["", "  2 eggs  ", " \t ", "\tFlour\t", "", "2 eggs", "2 eggs", "\u00a0", ""].join(separator);
    assert.equal(h.ingredientPasteText(raw), "  2 eggs  \n\tFlour\t\n2 eggs\n2 eggs");
  }
  assert.equal(h.ingredientPasteText(" \t\r\n\u00a0\r \n"), "");
  assert.equal(h.ingredientPasteText("<b>Salt</b>\n\nPepper"), "<b>Salt</b>\nPepper");
});

function pasteEvent(value, start, end, raw, native = false) {
  let prevented = false, commands = 0;
  const textarea = { value, selectionStart: start, selectionEnd: end,
    setRangeText(insert, from, to, mode) {
      assert.equal(mode, "end");
      this.value = this.value.slice(0, from) + insert + this.value.slice(to);
      this.selectionStart = this.selectionEnd = from + insert.length;
    },
    setSelectionRange(from, to) { this.selectionStart = from; this.selectionEnd = to; },
    ownerDocument: { execCommand(command, showUI, insert) {
      commands++;
      assert.equal(command, "insertText");
      assert.equal(showUI, false);
      if (native) textarea.setRangeText(insert, textarea.selectionStart, textarea.selectionEnd, "end");
      return native;
    } },
  };
  return { currentTarget: textarea, clipboardData: { getData(format) { assert.equal(format, "text/plain"); return raw; } },
    preventDefault() { prevented = true; }, prevented: () => prevented, commands: () => commands };
}

test("Ingredient paste inserts at beginning, middle, selection and end, preserving outside text and other sections", () => {
  for (const native of [true, false]) {
    for (const [start, end] of [[0, 0], [3, 3], [2, 6], [8, 8]]) {
      const h = harness();
      const props = { initial: { ...initial(), ingredient_sections: [
        { name: "First", text: "legacy\n\nunchanged" }, { name: "Second", text: "abcdefgh" },
      ] }, categories: [], cuisines: [], edit: true };
      let tree = h.render(h.EditorForm, props);
      const inputs = nodes(tree).filter((node) => node.type === "textarea");
      const event = pasteEvent("abcdefgh", start, end, "\n  Salt \r\n\r\nPepper\r \t\r", native);
      inputs[1].props.onPaste(event);
      const expected = "abcdefgh".slice(0, start) + "  Salt \nPepper" + "abcdefgh".slice(end);
      tree = h.render(h.EditorForm, props);
      const updated = nodes(tree).filter((node) => node.type === "textarea");
      assert(event.prevented());
      assert.equal(event.commands(), 1);
      assert.equal(updated[0].props.value, "legacy\n\nunchanged");
      assert.equal(updated[1].props.value, expected);
      assert.equal(event.currentTarget.value, expected);
      assert.equal(event.currentTarget.selectionStart, start + "  Salt \nPepper".length);
      assert.equal(event.currentTarget.selectionEnd, event.currentTarget.selectionStart);
      assert.equal(props.initial.ingredient_sections[1].text, "abcdefgh");
    }
  }
});

test("All-blank Ingredient paste preserves selected text, value, selection and undo history", () => {
  const h = harness();
  const props = { initial: { ...initial(), ingredient_sections: [{ name: "", text: "keep\n\nthis" }] },
    categories: [], cuisines: [], edit: true };
  const tree = h.render(h.EditorForm, props);
  const event = pasteEvent("keep\n\nthis", 1, 8, "\r\n \t\r\u00a0\n");
  labeledInput(tree, "Ingredient text").props.onPaste(event);
  assert(event.prevented());
  assert.equal(event.commands(), 0);
  assert.equal(event.currentTarget.value, "keep\n\nthis");
  assert.equal(event.currentTarget.selectionStart, 1);
  assert.equal(event.currentTarget.selectionEnd, 8);
  assert.equal(labeledInput(h.render(h.EditorForm, props), "Ingredient text").props.value, "keep\n\nthis");
});

test("Ingredient typing and untouched legacy data survive Save, while Instructions and other fields have no paste normalizer", async () => {
  const legacy = "\n  old \r\n\r\n\ttext \n";
  for (const typed of [null, "\nTyped\n\n \t\nIngredients\n"]) {
    let submitted;
    const h = harness({ update: async (_id, draft) => { submitted = structuredClone(draft); return draft; } });
    const props = { initial: { ...initial(), title: "Existing", ingredient_sections: [{ name: "Legacy", text: legacy }],
      instructions: "\nMix\n\nBake\n" }, categories: [], cuisines: [], edit: true };
    let tree = h.render(h.EditorForm, props);
    for (const label of ["Title", "Source", "Instructions"]) assert.equal(labeledInput(tree, label).props.onPaste, undefined);
    if (typed !== null) change(labeledInput(tree, "Ingredient text"), typed);
    change(labeledInput(tree, "Title"), "Unrelated change");
    tree = h.render(h.EditorForm, props);
    await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.ingredient_sections[0].text, typed ?? legacy);
    assert.equal(submitted.instructions, "\nMix\n\nBake\n");
    assert.equal(props.initial.ingredient_sections[0].text, legacy);
  }
});

const instructionCases = [
  { raw: "", expected: [] },
  { raw: " \t\r\n\u00a0\r \n", expected: [] },
  { raw: "Mix.", expected: ["Mix."] },
  { raw: "\n  Mix. \r\n\r\n\tBake.\t\r \rCool.\n\n", expected: ["  Mix. ", "\tBake.\t", "Cool."] },
  { raw: "Mix\nMix", expected: ["Mix", "Mix"] },
  { raw: "1. Mix\n2. Bake\n3. Cool", expected: ["1. Mix", "2. Bake", "3. Cool"] },
  { raw: "2 eggs\n350 F for 20 minutes\n1/2 cup\n3) Serve", expected: ["2 eggs", "350 F for 20 minutes", "1/2 cup", "3) Serve"] },
  { raw: "<script>alert(1)</script>\n<img src=x onerror=alert(1)>",
    expected: ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"] },
];

test("Instructions display lines ignore blanks, preserve content and numeric prefixes, and support LF/CRLF/CR", () => {
  const h = harness();
  for (const { raw, expected } of instructionCases) {
    assert.deepEqual(Array.from(h.instructionLines(raw)), expected);
  }
});

test("Recipe Detail renders semantic numbered Instructions or the explicit empty state without changing the Recipe", async () => {
  for (const { raw, expected } of instructionCases) {
    const recipe = { ...initial(), title: "Instructions Recipe", instructions: raw };
    const before = structuredClone(recipe);
    const h = harness({ get: async () => recipe,
      categories: { list: async () => [] }, cuisines: { list: async () => [] } });
    h.render(h.RecipeDetail);
    await flush();
    const tree = h.render(h.RecipeDetail);
    const list = nodes(tree).find((node) => node.type === "ol");
    const heading = nodes(tree).find((node) => node.type === "h3" && text(node) === "Instructions");
    assert(heading);
    assert.equal(nodes(tree).filter((node) => node.type === "ol").length, expected.length ? 1 : 0);
    if (expected.length) {
      assert.deepEqual(list.children.map((node) => node.type), expected.map(() => "li"));
      assert.deepEqual(list.children.map(text), expected);
      assert(list.children.every((node) => typeof node.children[0] === "string"));
      assert(list.children.every((node) => !node.props.dangerouslySetInnerHTML));
      assert(nodes(tree).indexOf(list) > nodes(tree).indexOf(heading));
      assert.doesNotMatch(text(tree), /No instructions provided/);
    } else {
      assert(nodes(tree).some((node) => node.type === "p" && text(node) === "No instructions provided."));
    }
    assert.deepEqual(recipe, before);
  }
});

test("Edit Recipe keeps raw Instructions including blank lines, whitespace and numeric prefixes through Save", async () => {
  const raw = "\r\n  1. Mix. \r\n\r\n2. Bake at 350 F.\r3) Cool.\n\n";
  let submitted;
  const h = harness({ update: async (id, draft) => {
    assert.equal(id, props.initial.id);
    submitted = structuredClone(draft);
    return draft;
  } });
  const props = { initial: { ...initial(), title: "Existing Recipe", instructions: raw },
    categories: [], cuisines: [], edit: true };
  let tree = h.render(h.EditorForm, props);
  const instructions = labeledInput(tree, "Instructions");
  assert.equal(instructions.type, "textarea");
  assert.equal(instructions.props.value, raw);
  change(labeledInput(tree, "Title"), "Changed title");
  tree = h.render(h.EditorForm, props);
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.instructions, raw);
  assert.equal(props.initial.instructions, raw);
});

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

test("Library checkbox disclosures combine OR selections with AND groups and clear all criteria", async () => {
  const categories = [{ id: "c1", name: "Dinner" }, { id: "c2", name: "Lunch" }, { id: "c3", name: "Breakfast" }];
  const cuisines = [{ id: "u1", name: "French" }, { id: "u2", name: "Italian" }, { id: "u3", name: "Greek" }];
  const recipes = [
    { ...initial(), title: "Soup one", category_id: "c1", cuisine_id: "u1", favorite: true },
    { ...initial(), title: "Soup two", category_id: "c2", cuisine_id: "u2", favorite: true },
    { ...initial(), title: "Soup three", category_id: "c3", cuisine_id: "u3", favorite: true },
    { ...initial(), title: "Other", category_id: "c1", cuisine_id: "u1", favorite: true },
    { ...initial(), title: "Soup unfavored", category_id: "c2", cuisine_id: "u1" },
  ];
  const h = harness({ list: async () => recipes, categories: { list: async () => categories },
    cuisines: { list: async () => cuisines } });
  const render = () => h.render(h.RecipeLibrary);
  render(); await flush();
  function select(label, name, checked) {
    const filter = nodes(render()).find((n) => n.type.name === "ClassificationFilter" && n.props.label === label);
    const disclosure = h.ClassificationFilter(filter.props);
    assert.equal(disclosure.type, "details");
    assert(nodes(disclosure).some((n) => n.type === "summary" && text(n).startsWith(label)));
    assert(nodes(disclosure).some((n) => n.props.role === "group" && n.props["aria-label"].includes(label)));
    labeledInput(disclosure, name).props.onChange({ target: { checked } });
  }
  select("Category", "Dinner", true); select("Category", "Lunch", true);
  let tree = render();
  assert.match(text(tree), /Soup one/); assert.match(text(tree), /Soup two/);
  assert.doesNotMatch(text(tree), /Soup three/);
  select("Cuisine", "French", true); select("Cuisine", "Italian", true);
  tree = render();
  change(labeledInput(tree, "Search Recipes"), "soup");
  labeledInput(render(), "Favorites only").props.onChange({ target: { checked: true } });
  tree = render();
  assert.match(text(tree), /Soup one/); assert.match(text(tree), /Soup two/);
  assert.doesNotMatch(text(tree), /Soup three|Soup unfavored|Other/);
  select("Category", "Dinner", false);
  tree = render();
  assert.doesNotMatch(text(tree), /Soup one/); assert.match(text(tree), /Soup two/);
  assert.deepEqual(Array.from(h.getFilters().categoryIds), ["c2"]);
  select("Cuisine", "Italian", false);
  tree = render();
  assert.match(text(tree), /No Recipes match the current criteria/);
  assert.doesNotMatch(text(tree), /No Recipes yet/);
  button(tree, "Clear search and filters").props.onClick();
  tree = render();
  assert.deepEqual(h.getFilters(), helpers.newRecipeFilters());
  for (const recipe of recipes) assert(text(tree).includes(recipe.title));
});

test("Library remount reloads current data, drops dead lookup IDs, and never restores transient selection", async () => {
  let recipes = [{ ...initial(), title: "Soup", category_id: "c1", cuisine_id: "u1" }];
  let categories = [{ id: "c1", name: "Dinner" }];
  let loads = 0;
  const service = { list: async () => { loads++; return recipes; }, categories: { list: async () => categories },
    cuisines: { list: async () => [{ id: "u1", name: "French" }] } };
  let filters = { search: "Soup", categoryIds: ["c1", "deleted"], cuisineIds: ["u1", "deleted"], favorites: false };
  const setFilters = (update) => { filters = update(filters); };
  const first = harness(service);
  const render = (h) => h.render(h.RecipeLibrary, { filters, setFilters });
  render(first); await flush();
  let tree = render(first);
  assert.deepEqual(Array.from(filters.categoryIds), ["c1"]);
  assert.deepEqual(Array.from(filters.cuisineIds), ["u1"]);
  nodes(tree).find((n) => n.type === "input" && n.props["aria-label"] === "Select Soup")
    .props.onChange();
  tree = render(first); assert.match(text(tree), /1 selected/);
  recipes = []; categories = [];
  const second = harness(service);
  render(second); await flush(); tree = render(second);
  assert.equal(loads, 2);
  assert.equal(filters.search, "Soup");
  assert.deepEqual(Array.from(filters.categoryIds), []);
  assert.deepEqual(Array.from(filters.cuisineIds), ["u1"]);
  assert.match(text(tree), /0 selected/);
  assert.match(text(tree), /No Recipes yet/);
  assert.doesNotMatch(text(tree), /No Recipes match/);
  assert(!nodes(tree).some((n) => n.type.name === "DeleteConfirmation"));
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
