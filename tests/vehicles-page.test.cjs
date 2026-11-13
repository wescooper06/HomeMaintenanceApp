const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const uuid = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const item = (id, name, performed) => ({
  maintenanceItemId: uuid(id),
  displayNameSnapshot: name,
  groupSnapshot: "routine",
  isPerformed: performed,
});
const record = (id, date, overrides = {}) => ({
  id: uuid(id),
  serviceDate: date,
  usageReadingValue: 120,
  usageReadingUnit: "miles",
  mechanic: null,
  version: id + 2,
  capturedItems: [item(101, "Historical item", true), item(102, "Second snapshot", false)],
  ...overrides,
});
const assets = [
  { id: uuid(1), name: "Synthetic car", usageUnit: "miles", version: 4 },
  { id: uuid(2), name: "Synthetic truck", usageUnit: "hours", version: 2 },
];
const workspace = (asset, records = []) => ({
  asset,
  ongoingMaintenanceRecords: records,
  maintenanceItems: [],
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

let compiled;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx");
  const source = fs.readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?;\r?$/gm, "")
    .replace(/^export default /gm, "");
  compiled = (await transformWithOxc(source, file, {
    jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" },
  })).code;
});

function harness(overrides = {}) {
  const hookSlots = [];
  const refs = [];
  const effects = [];
  const calls = { listAssets: 0, workspaces: [], templates: 0, saves: [] };
  let hookIndex = 0;
  let blockerPredicate;
  let nextRecordId = 900;
  let service = {
    listAssets: async () => {
      calls.listAssets += 1;
      return assets;
    },
    loadVehicleWorkspace: async (assetId) => {
      calls.workspaces.push(assetId);
      return workspace(assets.find((asset) => asset.id === assetId), assetId === uuid(1)
        ? [record(12, "2026-02-01"), record(11, "2026-01-01")]
        : []);
    },
    createOngoingMaintenanceDraftTemplate: async (assetId) => {
      calls.templates += 1;
      return {
        assetId,
        usageReadingUnit: "hours",
        items: [item(201, "Current applicable item", false)],
      };
    },
    newestRecord: (records) => [...records].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)
      || a.id.localeCompare(b.id))[0] || null,
    createVehicleChangesDraft: (current) => ({
      assetId: current.asset.id,
      expectedAssetVersion: current.asset.version,
      assetPatch: {},
      maintenanceItemOperations: [],
      availabilityOperations: [],
      ongoingOperations: [],
      recommendedOperations: [],
      completedOperations: [],
      intervalOperations: [],
      keyInformationOperation: null,
      linkOperations: [],
    }),
    buildRecordDeleteOperation: (_kind, selected, assetId) => ({
      assetId,
      collection: "ongoingOperations",
      operation: { action: "delete", id: selected.id, expectedVersion: selected.version },
    }),
    saveVehicleChanges: async (draft) => {
      calls.saves.push(structuredClone(draft));
      return { status: "saved", assetVersion: 5, entityVersions: { ongoing: {} } };
    },
    ...overrides,
  };
  const blocker = {
    state: "unblocked",
    reset() { blocker.state = "unblocked"; },
    proceed() { blocker.state = "unblocked"; blocker.proceeded = true; },
  };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const context = {
    element: (type, props, ...children) => ({
      type,
      props: props || {},
      children: (children.length ? children : [props?.children]).flat(Infinity)
        .filter((child) => child !== null && child !== undefined && child !== false),
    }),
    fragment: "fragment",
    PageHeader: ({ id, title, subtitle, actions }) => ({
      type: "header", props: { id }, children: [title, subtitle, actions].filter(Boolean),
    }),
    styles: new Proxy({}, { get: (_target, key) => String(key) }),
    vehiclesService: service,
    createVehicleChangesDraft: (...args) => service.createVehicleChangesDraft(...args),
    buildRecordDeleteOperation: (...args) => service.buildRecordDeleteOperation(...args),
    crypto: { randomUUID: () => uuid(nextRecordId++) },
    window: { addEventListener() {}, removeEventListener() {} },
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hookSlots)) hookSlots[index] = typeof initial === "function" ? initial() : initial;
      return [hookSlots[index], (next) => {
        hookSlots[index] = typeof next === "function" ? next(hookSlots[index]) : next;
      }];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (!(index in refs)) refs[index] = { current: initial === null ? dialog : initial };
      return refs[index];
    },
    useEffect(effect, dependencies) {
      const index = hookIndex++;
      const previous = hookSlots[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        effects.push(() => {
          previous?.cleanup?.();
          hookSlots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
    useBlocker(predicate) {
      blockerPredicate = predicate;
      return blocker;
    },
  };
  const Page = vm.runInNewContext(`(() => { ${compiled}; return VehiclesPage; })()`, context);
  let tree;
  function render() {
    hookIndex = 0;
    tree = Page();
    effects.splice(0).forEach((run) => run());
    return tree;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    return [node, ...(node.children || []).flatMap((child) => nodes(child))];
  }
  function text(node) {
    if (node === null || node === undefined || node === false) return "";
    if (typeof node !== "object") return String(node);
    return (node.children || []).map(text).join("");
  }
  function find(predicate) { return nodes().find(predicate); }
  function button(label) {
    return nodes().find((node) => node.type === "button" && text(node) === label);
  }
  function input(id) { return nodes().find((node) => node.props.id === id); }
  async function settle() {
    for (let i = 0; i < 5; i += 1) {
      await flush();
      render();
    }
  }
  render();
  return {
    render, settle, nodes, text: (node = tree) => text(node), find, button, input, calls, blocker, dialog,
    shouldBlock: () => blockerPredicate(),
    setService(next) { service = next; context.vehiclesService = next; },
  };
}

test("Vehicles route resolves by path and hash and renders the authenticated desktop navigation entry", () => {
  const routes = fs.readFileSync(path.join(root, "src", "router", "lifeManagerRoutes.js"), "utf8")
    .replace(/^export /gm, "");
  const { resolveLifeManagerRoute } = vm.runInNewContext(
    `(() => { ${routes}; return { resolveLifeManagerRoute }; })()`,
  );
  assert.equal(resolveLifeManagerRoute({ pathname: "/", hash: "#vehicles" }), "vehicles");
  assert.equal(resolveLifeManagerRoute({ pathname: "/vehicles", hash: "" }), "vehicles");

  const links = fs.readFileSync(path.join(root, "src", "components", "layout", "navigationRoutes.js"), "utf8");
  assert.match(links, /\["vehicles", "Vehicles"\]/);
  const router = fs.readFileSync(path.join(root, "src", "components", "layout", "MainApplication.jsx"), "utf8");
  assert.match(router, /vehicles: lazy\(\(\) => import\("\.\.\/\.\.\/pages\/Vehicles\/VehiclesPage\.jsx"\)\)/);
});

test("No assets renders a stable empty state without calling the workspace loader", async () => {
  const ui = harness({ listAssets: async () => [] });
  await ui.settle();
  assert.match(ui.text(), /No vehicles yet/);
  assert.match(ui.text(), /Asset management is not available in this phase/);
  assert.equal(ui.calls.workspaces.length, 0);
  assert.equal(ui.button("Add Ongoing Record"), undefined);
});

test("Asset loading failure is distinct from a legitimate empty asset list", async () => {
  const ui = harness({ listAssets: async () => { throw new Error("private backend detail"); } });
  await ui.settle();
  assert.match(ui.text(), /assets could not be loaded/i);
  assert.doesNotMatch(ui.text(), /private backend detail/);
  assert.doesNotMatch(ui.text(), /No vehicles yet/);
  assert(ui.button("Retry loading assets"));
});

test("Workspace selects newest history and preserves historical snapshots and true/false states", async () => {
  const ui = harness();
  await ui.settle();
  assert.equal(ui.calls.workspaces[0], uuid(1));
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-01");
  assert(ui.input("vehicles-service-date"));
  const checkboxes = ui.nodes().filter((node) => node.type === "input" && node.props.type === "checkbox");
  assert.deepEqual(checkboxes.map((node) => [node.props["aria-label"], node.props.checked]), [
    ["Performed: Historical item", true],
    ["Performed: Second snapshot", false],
  ]);
  assert.doesNotMatch(ui.text(), /Current applicable item/);
  assert.equal(ui.find((node) => node.type === "dialog").props["aria-labelledby"], "vehicles-confirm-title");
});

test("Empty Ongoing list is shown when a loaded asset has no history", async () => {
  const ui = harness({ loadVehicleWorkspace: async (_assetId) => workspace(assets[0], []) });
  await ui.settle();
  assert.match(ui.text(), /No Ongoing Maintenance records for this vehicle/);
  assert.match(ui.text(), /Select or add an Ongoing record/);
});

test("Workspace load failure is not presented as an empty history", async () => {
  const ui = harness({
    loadVehicleWorkspace: async () => { throw new Error("private backend detail"); },
  });
  await ui.settle();
  assert.match(ui.text(), /workspace could not be loaded/i);
  assert.doesNotMatch(ui.text(), /No Ongoing Maintenance records/);
  assert.doesNotMatch(ui.text(), /private backend detail/);
  assert(ui.button("Retry loading workspace"));
});

test("Add draft uses the service template, false states and asset usage unit without persisting", async () => {
  const ui = harness();
  await ui.settle();
  await ui.button("Add Ongoing Record").props.onClick();
  ui.render();
  assert.equal(ui.calls.templates, 1);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.input("vehicles-usage-unit").props.value, "hours");
  assert.deepEqual(ui.nodes().filter((node) => node.type === "input" && node.props.type === "checkbox")
    .map((node) => [node.props["aria-label"], node.props.checked]), [
      ["Performed: Current applicable item", false],
    ]);
  assert.match(ui.text(), /New draft/);
});

test("Edit marks the session dirty; Cancel restores persisted values without an RPC", async () => {
  const ui = harness();
  await ui.settle();
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-03" } });
  ui.render();
  assert(ui.button("Cancel Changes"));
  assert.equal(ui.shouldBlock(), true);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-01");
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.shouldBlock(), false);
});

test("Save sends only changed Ongoing operations once and reconciles confirmed versions", async () => {
  const ui = harness();
  await ui.settle();
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-03" } });
  ui.render();
  const form = ui.find((node) => node.type === "form");
  await form.props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  assert.deepEqual(ui.calls.saves[0].ongoingOperations.map(({ action, id, expectedVersion, serviceDate }) =>
    [action, id, expectedVersion, serviceDate]), [["update", uuid(12), 14, "2026-02-03"]]);
  assert.equal(ui.button("Cancel Changes"), undefined);
  assert.match(ui.text(), /Changes saved/);
});

test("Duplicate Save submissions are locked while the first request is pending", async () => {
  let release;
  const ui = harness({
    saveVehicleChanges: (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      return new Promise((resolve) => { release = () => resolve({ status: "saved", assetVersion: 5, entityVersions: { ongoing: {} } }); });
    },
  });
  await ui.settle();
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-03" } });
  ui.render();
  const submit = ui.find((node) => node.type === "form").props.onSubmit;
  const first = submit({ preventDefault() {} });
  const second = submit({ preventDefault() {} });
  await flush();
  assert.equal(ui.calls.saves.length, 1);
  release();
  await first;
  await second;
});

test("Delete requires confirmation and queues a versioned operation until Save Changes", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Delete Record").props.onClick();
  ui.render();
  assert.equal(ui.dialog.open, true);
  assert.match(ui.text(), /Queue deletion/);
  ui.button("Queue Delete").props.onClick();
  ui.render();
  assert.equal(ui.calls.saves.length, 0);
  assert.match(ui.text(), /queued/);
  await ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(ui.calls.saves[0].ongoingOperations, [
    { action: "delete", id: uuid(12), expectedVersion: 14 },
  ]);
});

test("Switching assets with unsaved edits requires explicit discard", async () => {
  const ui = harness();
  await ui.settle();
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-04" } });
  ui.render();
  const selector = ui.input("vehicles-asset-select");
  selector.props.onChange({ target: { value: uuid(2) } });
  ui.render();
  assert.match(ui.text(), /Discard changes and switch assets/);
  assert.equal(ui.calls.workspaces.length, 1);
  ui.button("Discard and continue").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.workspaces.at(-1), uuid(2));
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(2));
});

test("Switching records with unsaved edits requires explicit discard", async () => {
  const ui = harness();
  await ui.settle();
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-04" } });
  ui.render();
  const previousRecord = ui.nodes().find((node) => node.type === "button"
    && node.props.className?.includes("recordButton")
    && ui.text(node).includes("2026-01-01"));
  previousRecord.props.onClick();
  ui.render();
  assert.match(ui.text(), /Discard changes and switch records/);
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-04");
  ui.button("Discard and continue").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-01-01");
  assert.equal(ui.button("Cancel Changes"), undefined);
  assert.equal(ui.calls.saves.length, 0);
});

test("Validation and conflict failures keep drafts and use safe user-facing messages", async () => {
  for (const [code, expected] of [
    ["validation_error", /highlighted service details/],
    ["duplicate_service_date", /already exists/],
    ["version_conflict", /changed elsewhere/],
    ["retryable_transport", /connection issue/],
  ]) {
    const ui = harness({
      saveVehicleChanges: async () => { throw { code, message: "raw PostgreSQL detail must not appear" }; },
    });
    await ui.settle();
    ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-05" } });
    ui.render();
    await ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    ui.render();
    assert.match(ui.text(), expected);
    assert.doesNotMatch(ui.text(), /raw PostgreSQL detail/);
    assert(ui.button("Cancel Changes"));
  }
});

test("Unknown outcome preserves request and client IDs and retry reuses the exact payload", async () => {
  let attempted;
  let retry = true;
  const ui = harness({
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      if (retry) {
        retry = false;
        attempted = { ...structuredClone(draft), requestId: uuid(777) };
        throw { code: "unknown_outcome", retryDraft: attempted, message: "private database detail" };
      }
      return { status: "saved", assetVersion: 5, entityVersions: { ongoing: {} } };
    },
  });
  await ui.settle();
  await ui.button("Add Ongoing Record").props.onClick();
  ui.render();
  await ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.match(ui.text(), /outcome is unknown/);
  assert.doesNotMatch(ui.text(), /private database detail/);
  const firstPayload = ui.calls.saves[0];
  assert.equal(firstPayload.ongoingOperations[0].id, uuid(900));
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[1].requestId, uuid(777));
  assert.equal(ui.calls.saves[1].ongoingOperations[0].id, firstPayload.ongoingOperations[0].id);
  assert.deepEqual(ui.calls.saves[1], attempted);
});

test("Unsaved record changes block route navigation and require explicit discard", async () => {
  const ui = harness();
  await ui.settle();
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-06" } });
  ui.render();
  assert.equal(ui.shouldBlock(), true);
  ui.blocker.state = "blocked";
  ui.render();
  assert.match(ui.text(), /Discard unsaved Vehicles changes/);
  ui.button("Discard changes").props.onClick();
  ui.render();
  assert.equal(ui.blocker.proceeded, true);
  assert.equal(ui.calls.saves.length, 0);
});

test("Vehicles UI uses the service boundary and semantic accessible performed controls", () => {
  const source = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx"), "utf8");
  assert.doesNotMatch(source, /\.from\s*\(|\.rpc\s*\(/);
  assert.match(source, /vehiclesService\.saveVehicleChanges/);
  assert.match(source, /aria-label=\{`Performed: \$\{item\.displayNameSnapshot\}`\}/);
  assert.match(source, /<dialog[\s\S]*aria-labelledby="vehicles-confirm-title"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /role="alert"/);
});
