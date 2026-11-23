const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
let compiled;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Meals", "IdeasPage.jsx");
  const sourceText = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "").replace(/^export default /gm, "");
  compiled = (await transformWithOxc(sourceText, file, {
    jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" },
  })).code;
});

function harness(service) {
  const slots = [];
  const effects = [];
  let hook = 0;
  let focused;
  const context = {
    element: (type, props, ...children) => ({
      type, props: props || {}, children: children.flat(Infinity)
        .filter((child) => child !== null && child !== undefined && child !== false),
    }),
    fragment: "fragment",
    PageHeader: "page-header",
    styles: { page: "page", addForm: "add-form", error: "error", empty: "empty", list: "list",
      row: "row", checkbox: "checkbox", text: "text", checked: "checked", actions: "actions" },
    createMealsIdeasService: () => service,
    ideasError: (failure) => failure.message || "Ideas change failed.",
    newIdea: () => ({ id: randomUUID(), text: "" }),
    orderIdeas: (ideas) => [...ideas].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    requestAnimationFrame: (callback) => callback(),
    useState(initial) {
      const index = hook++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => {
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
      }];
    },
    useRef(initial) {
      const index = hook++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = hook++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index].dependencies[i])) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const Component = vm.runInNewContext(`(() => { ${compiled}; return IdeasPage; })()`, context);
  function bindRefs(tree) {
    if (!tree || typeof tree !== "object") return;
    const ref = tree.props.ref;
    const current = { focus() { focused = tree; } };
    if (typeof ref === "function") ref(current);
    else if (ref && typeof ref === "object") ref.current = current;
    tree.children.forEach(bindRefs);
  }
  return {
    get focused() { return focused; },
    render() {
      hook = 0;
      const tree = Component();
      effects.splice(0).forEach((run) => run());
      bindRefs(tree);
      return tree;
    },
  };
}

function nodes(tree) {
  return !tree || typeof tree !== "object" ? [] : [tree, ...tree.children.flatMap(nodes)];
}

function text(tree) {
  return typeof tree === "object" ? tree.children.map(text).join("") : String(tree);
}

function button(tree, label) {
  return nodes(tree).find((node) => node.type === "button"
    && (text(node) === label || node.props["aria-label"] === label));
}

function input(tree, label) {
  return nodes(tree).find((node) => node.type === "input" && node.props["aria-label"] === label);
}

const timestamp = "2026-01-01T00:00:00.000Z";
function idea(textValue, position, checked = false) {
  return { id: randomUUID(), text: textValue, checked, position, created_at: timestamp, updated_at: timestamp };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("Ideas loads an empty state, rejects whitespace, adds with Enter-compatible form, and retains a failed draft", async () => {
  const rows = [];
  let failCreate = false;
  const service = {
    load: async () => structuredClone(rows),
    async create(draft) {
      if (failCreate) throw new Error("offline");
      const saved = { ...draft, checked: false, position: rows.length + 1,
        created_at: timestamp, updated_at: timestamp };
      rows.push(saved);
      return structuredClone(saved);
    },
    check() {}, move() {}, remove() {},
  };
  const h = harness(service);
  h.render(); await flush();
  let tree = h.render();
  assert.match(text(tree), /No ideas yet\./);
  assert(input(tree, "Add idea"));

  input(tree, "Add idea").props.onChange({ target: { value: " \t " } });
  tree = h.render();
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(rows.length, 0);
  assert(nodes(h.render()).some((node) => node.props.role === "alert" && text(node) === "Enter nonblank Idea text."));

  input(h.render(), "Add idea").props.onChange({ target: { value: "Keep this draft" } });
  failCreate = true;
  tree = h.render();
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = h.render();
  assert.equal(input(tree, "Add idea").props.value, "Keep this draft");
  assert(nodes(tree).some((node) => node.props.role === "alert" && text(node) === "offline"));
  failCreate = false;
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = h.render();
  assert.equal(rows.length, 1);
  assert.equal(input(tree, "Add idea").props.value, "");
  assert.match(text(tree), /Keep this draft/);
  assert(h.focused);
});

test("Ideas checks without moving, reorders one adjacent row, disables edges, and preserves delete failures", async () => {
  const rows = [idea("First", 1), idea("Checked middle", 2, true), idea("Last", 3)];
  let failCheck = false;
  let failMove = false;
  let failDelete = false;
  const service = {
    load: async () => structuredClone(rows),
    async create() { throw new Error("not used"); },
    async check(id, checked) {
      if (failCheck) throw new Error("check failed");
      const row = rows.find((item) => item.id === id);
      Object.assign(row, { checked, updated_at: timestamp });
      return structuredClone(row);
    },
    async move(id, direction) {
      if (failMove) throw new Error("move failed");
      const sorted = [...rows].sort((a, b) => a.position - b.position);
      const index = sorted.findIndex((item) => item.id === id);
      const neighbor = index + direction;
      if (neighbor < 0 || neighbor >= sorted.length) return {
        moved: false, items: sorted.map(({ id: itemId, position, updated_at }) => ({ id: itemId, position, updated_at })),
      };
      [sorted[index].position, sorted[neighbor].position] = [sorted[neighbor].position, sorted[index].position];
      return { moved: true, items: sorted.sort((a, b) => a.position - b.position)
        .map(({ id: itemId, position, updated_at }) => ({ id: itemId, position, updated_at })) };
    },
    async remove(id) {
      if (failDelete) throw new Error("delete failed");
      rows.splice(rows.findIndex((item) => item.id === id), 1);
      return id;
    },
  };
  const h = harness(service);
  h.render(); await flush();
  let tree = h.render();
  const initialIds = nodes(tree).filter((node) => node.type === "li").map((node) => text(node).match(/First|Checked middle|Last/)[0]);
  assert.deepEqual(initialIds, ["First", "Checked middle", "Last"]);
  const firstUp = button(tree, `Move ${rows[0].text} up`);
  const lastDown = button(tree, `Move ${rows[2].text} down`);
  assert(firstUp.props.disabled);
  assert(lastDown.props.disabled);

  const checked = input(tree, "Uncheck Checked middle");
  await checked.props.onChange({ target: { checked: false } });
  tree = h.render();
  assert.equal(input(tree, "Check Checked middle").props.checked, false);
  assert.deepEqual(nodes(tree).filter((node) => node.type === "li").map((node) => text(node).match(/First|Checked middle|Last/)[0]), initialIds);
  assert(!input(tree, "Check Checked middle").props.checked);

  failCheck = true;
  await input(tree, "Check First").props.onChange({ target: { checked: true } });
  tree = h.render();
  assert.equal(input(tree, "Check First").props.checked, false);
  assert(nodes(tree).some((node) => node.props.role === "alert" && text(node) === "check failed"));
  failCheck = false;

  failMove = true;
  await button(tree, `Move ${rows[2].text} up`).props.onClick();
  tree = h.render();
  assert(nodes(tree).some((node) => node.props.role === "alert" && text(node) === "move failed"));
  assert.deepEqual(nodes(tree).filter((node) => node.type === "li").map((node) => text(node).match(/First|Checked middle|Last/)[0]), initialIds);
  failMove = false;
  await button(tree, `Move ${rows[1].text} up`).props.onClick();
  tree = h.render();
  assert.deepEqual(nodes(tree).filter((node) => node.type === "li").map((node) => text(node).match(/First|Checked middle|Last/)[0]),
    ["Checked middle", "First", "Last"]);

  failDelete = true;
  await button(tree, `Delete ${rows[0].text}`).props.onClick();
  tree = h.render();
  assert.match(text(tree), /First/);
  assert(nodes(tree).some((node) => node.props.role === "alert" && text(node) === "delete failed"));
  failDelete = false;
  await button(tree, `Delete ${rows[0].text}`).props.onClick();
  tree = h.render();
  assert(!text(tree).includes("First"));
  assert.match(text(tree), /Checked middle/);
  assert.match(text(tree), /Last/);
  assert(h.focused);
});

test("Ideas distinguishes load failure from an empty list and offers retry", async () => {
  let attempts = 0;
  const service = {
    async load() {
      if (!attempts++) throw new Error("load failed");
      return [];
    },
  };
  const h = harness(service);
  h.render(); await flush();
  let tree = h.render();
  assert(nodes(tree).some((node) => node.props.role === "alert" && text(node) === "load failed"));
  assert(!text(tree).includes("No ideas yet."));
  await button(tree, "Retry loading Ideas").props.onClick();
  h.render(); await flush();
  tree = h.render();
  assert.match(text(tree), /No ideas yet\./);
});
