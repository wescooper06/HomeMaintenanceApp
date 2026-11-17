const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const uuid = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const item = (id, name, performed, group = "routine") => ({
  maintenanceItemId: uuid(id),
  displayNameSnapshot: name,
  groupSnapshot: group,
  isPerformed: performed,
});
const catalogItem = (id, overrides = {}) => ({
  id: uuid(id),
  displayName: `Synthetic Maintenance ${id}`,
  group: "routine",
  availabilityMode: "all_assets",
  currentAssetId: null,
  selectedAssetIds: [],
  archivedAt: null,
  version: 3,
  ...overrides,
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
const interval = (id, maintenanceItemId, overrides = {}) => ({
  id: uuid(id),
  maintenanceItemId: uuid(maintenanceItemId),
  maintenanceItemName: `Synthetic Maintenance ${maintenanceItemId}`,
  recommendedInterval: { value: 5000, unit: "miles" },
  comments: null,
  version: 2,
  lastService: null,
  nextService: null,
  notCalculatedReason: "no_qualifying_service",
  ...overrides,
});
const workspace = (asset, records = [], maintenanceItems = [], maintenanceIntervals = [], maintenanceItemCatalog = maintenanceItems) => ({
  asset,
  ongoingMaintenanceRecords: records,
  maintenanceItems,
  maintenanceItemCatalog,
  maintenanceIntervals,
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

let compiled;
let bulletTransform;
let keyDocumentHelpers;
let intervalHelpers;
let calculateMaintenanceInterval;
test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const enginePath = path.join(root, "src", "services", "vehiclesMaintenanceIntervalEngine.js");
  const engineSource = fs.readFileSync(enginePath, "utf8").replace(/^export /gm, "");
  calculateMaintenanceInterval = vm.runInNewContext(
    `(() => { ${engineSource}; return calculateMaintenanceInterval; })()`
  );
  const file = path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx");
  const source = fs.readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?;\r?$/gm, "")
    .replace(/^export default /gm, "");
  compiled = (await transformWithOxc(source, file, {
    jsx: { runtime: "classic", pragma: "element", pragmaFrag: "fragment" },
  })).code;
  bulletTransform = vm.runInNewContext(`(() => { ${compiled}; return toggleDescriptionBullets; })()`);
  keyDocumentHelpers = vm.runInNewContext(`(() => { ${compiled}; return { readKeyDocument, keyDocumentLength }; })()`);
  intervalHelpers = vm.runInNewContext(
    `(() => { ${compiled}; return { intervalProjection, lastServiceLabel, nextServiceLabel }; })()`,
    { calculateMaintenanceInterval },
  );
});

function harness(overrides = {}) {
  const hookSlots = [];
  const refs = [];
  const effects = [];
  const documentListeners = new Map();
  const calls = {
    listAssets: 0, workspaces: [], templates: 0, saves: [], creates: [], catalogReads: 0, catalogSaves: [],
  };
  let hookIndex = 0;
  let refIndex = 0;
  let blockerPredicate;
  let nextRecordId = 900;
  const assetStore = structuredClone(overrides.initialAssets ?? assets);
  const catalogStore = structuredClone(overrides.initialMaintenanceItems ?? [
    catalogItem(301),
    catalogItem(302, { availabilityMode: "selected_assets", selectedAssetIds: [uuid(1), uuid(2)] }),
    catalogItem(303, { archivedAt: "2026-01-01T00:00:00Z" }),
  ]);
  const intervalStore = structuredClone(overrides.initialIntervals ?? []);
  const isApplicable = (entry, assetId) => entry.availabilityMode === "all_assets"
    || (entry.availabilityMode === "current_asset_only" && entry.currentAssetId === assetId)
    || (entry.availabilityMode === "selected_assets" && entry.selectedAssetIds.includes(assetId));
  let service = {
    listAssets: async () => {
      calls.listAssets += 1;
      return structuredClone(assetStore);
    },
    loadVehicleWorkspace: async (assetId) => {
      calls.workspaces.push(assetId);
      return workspace(assetStore.find((asset) => asset.id === assetId), assetId === uuid(1)
        ? [record(12, "2026-02-01"), record(11, "2026-01-01")]
        : [], catalogStore.filter((catalogItemEntry) => catalogItemEntry.archivedAt === null
          && isApplicable(catalogItemEntry, assetId)),
      intervalStore.filter((entry) => entry.assetId === assetId),
      structuredClone(catalogStore));
    },
    listMaintenanceItems: async () => {
      calls.catalogReads += 1;
      return structuredClone(catalogStore);
    },
    saveMaintenanceItem: async (request) => {
      calls.catalogSaves.push(structuredClone(request));
      const current = catalogStore.find((entry) => entry.id === request.id);
      const saved = {
        ...(current || catalogItem(301, { id: request.id, version: 0 })),
        id: request.id,
        displayName: request.displayName ?? current?.displayName,
        group: request.group ?? current?.group,
        availabilityMode: request.availabilityMode ?? current?.availabilityMode,
        currentAssetId: request.currentAssetId ?? null,
        selectedAssetIds: [...(request.selectedAssetIds || [])],
        archivedAt: request.operation === "archive" ? "2026-03-01T00:00:00Z" : null,
        version: (current?.version || 0) + 1,
      };
      const index = catalogStore.findIndex((entry) => entry.id === request.id);
      if (index >= 0) catalogStore[index] = saved;
      else catalogStore.push(saved);
      return {
        status: request.operation === "create" ? "created" : request.operation === "archive" ? "archived" : "updated",
        requestId: request.requestId,
        item: structuredClone(saved),
      };
    },
    createAsset: async (request) => {
      calls.creates.push(structuredClone(request));
      const created = {
        id: request.id,
        name: request.name,
        usageUnit: request.usageUnit,
        version: 1,
      };
      assetStore.push(created);
      return { status: "created", requestId: request.requestId, asset: created };
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
      if (draft.assetPatch && Object.keys(draft.assetPatch).length) {
        const current = assetStore.find((asset) => asset.id === draft.assetId);
        Object.assign(current, draft.assetPatch, { version: current.version + 1 });
        return { status: "saved", assetVersion: current.version, entityVersions: {} };
      }
      const intervalVersions = {};
      for (const operation of draft.intervalOperations || []) {
        const index = intervalStore.findIndex((entry) => entry.id === operation.id);
        if (operation.action === "delete") {
          if (index >= 0) intervalStore.splice(index, 1);
          continue;
        }
        const catalogItemEntry = catalogStore.find((entry) => entry.id === operation.maintenanceItemId);
        const saved = interval(1, 301, {
          id: operation.id,
          assetId: draft.assetId,
          maintenanceItemId: operation.maintenanceItemId,
          maintenanceItemName: catalogItemEntry?.displayName || "Unavailable item",
          recommendedInterval: { value: operation.intervalValue, unit: operation.intervalUnit },
          comments: operation.comments,
          version: index >= 0 ? intervalStore[index].version + 1 : 1,
        });
        if (index >= 0) intervalStore[index] = saved;
        else intervalStore.push(saved);
        intervalVersions[saved.id] = saved.version;
      }
      const currentAsset = assetStore.find((asset) => asset.id === draft.assetId);
      currentAsset.version += 1;
      return {
        status: "saved",
        assetVersion: currentAsset.version,
        entityVersions: { ongoing: {}, intervals: intervalVersions },
      };
    },
    ...overrides,
  };
  const blocker = {
    state: "unblocked",
    reset() { blocker.state = "unblocked"; },
    proceed() { blocker.state = "unblocked"; blocker.proceeded = true; },
  };
  const refObjects = [];
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {} };
  const manageDialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {} };
  const maintenanceDialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {} };
  const intervalDialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {} };
  const focusCounts = {
    managedName: 0, manageButton: 0, maintenanceItemName: 0, maintenanceItemButton: 0,
    maintenanceIntervalItem: 0, maintenanceIntervalsAddButton: 0, manageIntervalsButton: 0,
  };
  const mockDocument = {
    activeElement: { focus() {} },
    execCommand(command, _showUi, value) {
      assert.equal(command, "insertText");
      const editor = this.activeElement;
      editor.value = editor.value.slice(0, editor.selectionStart) + value + editor.value.slice(editor.selectionEnd);
      editor.insertions += 1;
      return true;
    },
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      documentListeners.set(type, (documentListeners.get(type) || []).filter((entry) => entry !== listener));
    },
  };
  const context = {
    element: (type, props, ...children) => {
      const renderedChildren = (children.length ? children : [props?.children]).flat(Infinity)
        .filter((child) => child !== null && child !== undefined && child !== false);
      if (typeof type === "function" && type.name === "KeyDocumentEditor") {
        return { type: "KeyDocumentEditor", props, children: [] };
      }
      if (typeof type === "function") return type({ ...props, children: renderedChildren });
      if (type === "details" && String(props?.className).includes("pageManageActions") && props.ref) {
        props.ref.current = { contains: (target) => target === "inside-manage" };
      }
      return { type, props: props || {}, children: renderedChildren };
    },
    fragment: "fragment",
    PageHeader: ({ id, title, subtitle, actions }) => ({
      type: "header", props: { id }, children: [title, subtitle, actions].filter(Boolean),
    }),
    MoreHorizontal: (props) => ({ type: "svg", props: props || {}, children: [] }),
    List: (props) => ({ type: "svg", props: props || {}, children: [] }),
    Bold: (props) => ({ type: "svg", props: props || {}, children: [] }),
    resolveLinkTitle: overrides.resolveLinkTitle || (async (url) => ({ url, title: url })),
    URL,
    styles: new Proxy({}, { get: (_target, key) => String(key) }),
    calculateMaintenanceInterval,
    vehiclesService: service,
    createVehicleChangesDraft: (...args) => service.createVehicleChangesDraft(...args),
    buildRecordDeleteOperation: (...args) => service.buildRecordDeleteOperation(...args),
    crypto: { randomUUID: () => uuid(nextRecordId++) },
    document: mockDocument,
    window: { addEventListener() {}, removeEventListener() {} },
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hookSlots)) hookSlots[index] = typeof initial === "function" ? initial() : initial;
      return [hookSlots[index], (next) => {
        hookSlots[index] = typeof next === "function" ? next(hookSlots[index]) : next;
      }];
    },
    useRef(initial) {
      hookIndex += 1;
      const index = refIndex++;
      if (!(index in refs)) {
        const current = index === 1 ? dialog : index === 2 ? manageDialog
          : index === 3 ? { focus() { focusCounts.managedName += 1; } }
            : index === 4 ? { focus() { focusCounts.manageButton += 1; } }
              : index === 5 ? { focus() { focusCounts.maintenanceItemButton += 1; } }
                : index === 6 ? maintenanceDialog
                  : index === 7 ? { focus() { focusCounts.maintenanceItemName += 1; } }
                    : index === 8 ? { focus() { focusCounts.maintenanceItemButton += 1; } }
                      : initial;
        refs[index] = { current };
        refObjects[index] = refs[index];
      }
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
    refIndex = 0;
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
    const optionLabels = {
      "Manage Assets": "Assets",
      "Manage Maintenance Items": "Maintenance Items",
      "Manage Maintenance Intervals": "Maintenance Intervals",
    };
    const targetLabel = optionLabels[label] || label;
    const candidates = nodes().filter((node) => node.type === "button" && text(node) === targetLabel);
    return optionLabels[label]
      ? candidates.find((node) => String(node.props.className).includes("pageManageActionsMenu")) || candidates[0]
      : candidates[0];
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
    manageDialog, maintenanceDialog, intervalDialog, focusCounts, assetStore,
    intervalStore,
    attachDescriptionEditor(start, end = start, id = "vehicles-recommended-description") {
      const node = input(id);
      const editor = {
        value: node.props.value, disabled: node.props.disabled,
        selectionStart: start, selectionEnd: end, selectionDirection: "forward", scrollTop: 25, insertions: 0,
        focus() { mockDocument.activeElement = editor; },
        setSelectionRange(first, last, direction = "forward") {
          editor.selectionStart = first;
          editor.selectionEnd = last;
          editor.selectionDirection = direction;
        },
      };
      node.props.ref.current = editor;
      return editor;
    },
    dispatchDocumentEvent(type, event) {
      for (const listener of [...(documentListeners.get(type) || [])]) listener(event);
    },
    documentListenerCount(type) { return (documentListeners.get(type) || []).length; },
    shouldBlock: () => blockerPredicate(),
    setService(next) { service = next; context.vehiclesService = next; },
  };
}

function enterOngoingEdit(ui) {
  const edit = ui.button("Edit");
  assert(edit, "saved Ongoing records expose a page-level Edit action");
  edit.props.onClick();
  ui.render();
  assert(ui.button("Cancel Changes"), "Edit enters the page-level Ongoing editing session");
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
  const ui = harness({ initialAssets: [] });
  await ui.settle();
  assert.match(ui.text(), /No vehicles yet/);
  assert.match(ui.text(), /No vehicles yet/);
  assert(ui.button("Manage Assets"));
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

test("Manage Assets is available in the empty state and opens an accessible create form", async () => {
  const ui = harness({ initialAssets: [] });
  await ui.settle();
  assert(ui.button("Manage Assets"));
  assert(ui.button("Add an asset"));
  assert.match(ui.text(), /No vehicles yet/);
  ui.button("Manage Assets").props.onClick();
  ui.render();
  assert.equal(ui.manageDialog.open, true);
  assert.match(ui.text(), /Manage Assets/);
  assert.match(ui.text(), /No saved assets yet/);
  assert.equal(ui.input("vehicles-managed-asset-name").props["aria-invalid"], false);
  assert(ui.nodes().some((node) => node.type === "label" && ui.text(node).includes("Asset name")));
  assert(ui.nodes().some((node) => node.type === "label" && ui.text(node).includes("Usage Unit")));
  assert(ui.focusCounts.managedName > 0);
  assert.equal(ui.nodes().some((node) => ui.text(node) === "Delete Asset"), false);
});

test("Manage Assets lists persisted assets and focuses the selected editable asset", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-managed-asset-name").props.value, "Synthetic car");
  assert.equal(ui.input("vehicles-managed-asset-unit").props.value, "miles");
  const list = ui.find((node) => node.props.role === "list" && node.props["aria-label"] === "Saved assets");
  assert(list);
  assert.match(ui.text(list), /Synthetic car/);
  assert.match(ui.text(list), /Synthetic truck/);
  assert(ui.focusCounts.managedName > 0);
});

test("Create asset drafts preserve one UUID and request ID and select the confirmed asset", async () => {
  const ui = harness({ initialAssets: [] });
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  const initialId = ui.input("vehicles-managed-asset-name");
  assert.equal(ui.button("Save Asset").props.disabled, false);
  initialId.props.onChange({ target: { value: "  Synthetic engine  " } });
  ui.render();
  ui.input("vehicles-managed-asset-unit").props.onChange({ target: { value: "hours" } });
  ui.render();
  const draftId = ui.input("vehicles-managed-asset-name").props.value;
  assert.equal(draftId, "  Synthetic engine  ");
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"));
  await form.props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(ui.calls.creates.length, 1);
  assert.equal(ui.calls.creates[0].name, "Synthetic engine");
  assert.equal(ui.calls.creates[0].usageUnit, "hours");
  assert.match(ui.calls.creates[0].id, /^[0-9a-f-]{36}$/i);
  assert.match(ui.calls.creates[0].requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(ui.manageDialog.open, false);
  assert.equal(ui.input("vehicles-asset-select").props.value, ui.calls.creates[0].id);
  assert.equal(ui.calls.workspaces.at(-1), ui.calls.creates[0].id);
});

test("Confirmed asset creation remains reconciled and reports a failed list refresh", async () => {
  let listReads = 0;
  let ui;
  ui = harness({
    initialAssets: [],
    listAssets: async () => {
      listReads += 1;
      if (listReads > 1) throw new Error("private read failure");
      return structuredClone(ui.assetStore);
    },
  });
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Reconciled engine" } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"))
    .props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(ui.assetStore.length, 1);
  assert.equal(ui.input("vehicles-asset-select").props.value, ui.assetStore[0].id);
  assert.match(ui.text(), /asset was saved, but the asset list could not be refreshed/i);
  assert(ui.button("Retry loading assets"));
  assert.doesNotMatch(ui.text(), /private read failure/);
});

test("New asset accepts miles, hours, and none while cancel leaves persisted assets unchanged", async () => {
  for (const [index, unit] of ["miles", "hours", "none"].entries()) {
    const ui = harness({ initialAssets: [] });
    await ui.settle();
    ui.button("Manage Assets").props.onClick();
    ui.render();
    ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: `Draft engine ${index}` } });
    ui.render();
    ui.input("vehicles-managed-asset-unit").props.onChange({ target: { value: unit } });
    ui.render();
    if (index === 0) {
      ui.button("Cancel").props.onClick();
      ui.render();
      assert.equal(ui.calls.creates.length, 0);
      assert.equal(ui.assetStore.length, 0);
      assert.match(ui.text(), /edits canceled/i);
    } else {
      await ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"))
        .props.onSubmit({ preventDefault() {} });
      assert.equal(ui.calls.creates[0].usageUnit, unit);
    }
  }
});

test("Renaming or changing Usage Unit uses the atomic save path with the expected asset version", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "  Synthetic truck  " } });
  ui.render();
  ui.input("vehicles-managed-asset-unit").props.onChange({ target: { value: "none" } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"))
    .props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(ui.calls.creates.length, 0);
  assert.equal(ui.calls.saves.length, 1);
  assert.equal(ui.calls.saves[0].assetId, uuid(1));
  assert.equal(ui.calls.saves[0].expectedAssetVersion, 4);
  assert.deepEqual(ui.calls.saves[0].assetPatch, { name: "Synthetic truck", usageUnit: "none" });
  assert.equal(ui.assetStore.find((asset) => asset.id === uuid(1)).version, 5);
  assert.equal(ui.assetStore.find((asset) => asset.id === uuid(1)).usageUnit, "none");
  assert.equal(ui.assetStore.find((asset) => asset.id === uuid(1)).name, "Synthetic truck");
});

test("Asset version conflict preserves the draft and reports a safe conflict message", async () => {
  const ui = harness({
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      throw { code: "version_conflict", message: "private database detail" };
    },
  });
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Conflict edit" } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"))
    .props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.equal(ui.calls.saves.length, 1);
  assert.equal(ui.input("vehicles-managed-asset-name").props.value, "Conflict edit");
  assert.match(ui.text(), /changed elsewhere/);
  assert.doesNotMatch(ui.text(), /private database detail/);
});

test("Cancel restores persisted asset values and no-op Save never calls persistence", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Temporary name" } });
  ui.render();
  ui.button("Cancel").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-managed-asset-name").props.value, "Synthetic car");
  assert.equal(ui.button("Save Changes").props.disabled, true);
  assert.equal(ui.calls.saves.length, 0);
});

test("Blank asset names are announced and rejected before persistence", async () => {
  const ui = harness({ listAssets: async () => [] });
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "   " } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"))
    .props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.equal(ui.calls.creates.length, 0);
  assert.match(ui.text(), /nonblank asset name/i);
  assert(ui.nodes().some((node) => node.props.role === "alert"));
  assert.equal(ui.input("vehicles-managed-asset-name").props.maxLength, "120");
});

test("Opening Manage Assets protects a dirty Ongoing Maintenance session", async () => {
  const ui = harness();
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-05" } });
  ui.render();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  assert.equal(ui.manageDialog.open, false);
  assert.match(ui.text(), /Discard Ongoing Maintenance edits and manage assets/);
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-05");
  ui.button("Discard and continue").props.onClick();
  ui.render();
  assert.equal(ui.manageDialog.open, true);
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert.match(ui.text(), /2026-02-01/);
});

test("Dirty asset close requires explicit discard and returns focus to Manage Assets", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Unsaved rename" } });
  ui.render();
  ui.button("Close").props.onClick();
  ui.render();
  assert.equal(ui.manageDialog.open, true);
  assert.match(ui.text(), /Discard asset edits/);
  ui.button("Stay").props.onClick();
  ui.render();
  assert.equal(ui.manageDialog.open, true);
  ui.button("Close").props.onClick();
  ui.render();
  ui.button("Discard and continue").props.onClick();
  ui.render();
  assert.equal(ui.manageDialog.open, false);
  assert(ui.focusCounts.manageButton > 0);
});

test("Asset creation prevents duplicate submissions", async () => {
  let release;
  const ui = harness({
    initialAssets: [],
    createAsset: (request) => {
      ui.calls.creates.push(structuredClone(request));
      return new Promise((resolve) => {
        release = () => resolve({ status: "created", asset: { ...request, version: 1 } });
      });
    },
  });
  await ui.settle();
  ui.button("Manage Assets").props.onClick();
  ui.render();
  ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Pending engine" } });
  ui.render();
  const submit = ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm")).props.onSubmit;
  const first = submit({ preventDefault() {} });
  const second = submit({ preventDefault() {} });
  await flush();
  assert.equal(ui.calls.creates.length, 1);
  release();
  await first;
  await second;
});

test("Create errors are safe and unknown or retryable outcomes retry the same IDs", async () => {
  for (const code of ["asset_id_conflict", "request_id_payload_mismatch", "version_conflict",
    "authorization_error", "not_found", "retryable_transport", "unknown_outcome"]) {
    let attempts = 0;
    const ui = harness({
      initialAssets: [],
      createAsset: async (request) => {
        attempts += 1;
        ui.calls.creates.push(structuredClone(request));
        if (attempts === 1) throw { code, message: "private PostgreSQL detail",
          retryDraft: { id: request.id, requestId: request.requestId, name: request.name, usageUnit: request.usageUnit } };
        const asset = { id: request.id, name: request.name, usageUnit: request.usageUnit, version: 1 };
        ui.assetStore.push(asset);
        return { status: "created", asset };
      },
    });
    await ui.settle();
    ui.button("Manage Assets").props.onClick();
    ui.render();
    ui.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Retry engine" } });
    ui.render();
    const submit = () => ui.find((node) => node.type === "form" && node.props.className?.includes("assetForm"))
      .props.onSubmit({ preventDefault() {} });
    await submit();
    ui.render();
    const expectedMessage = {
      unknown_outcome: /outcome is unknown/,
      retryable_transport: /connection issue/,
      asset_id_conflict: /already assigned/,
      request_id_payload_mismatch: /already used for different asset data/,
      version_conflict: /changed elsewhere/,
      authorization_error: /session cannot save/,
      not_found: /no longer available/,
    }[code];
    assert.match(ui.text(), expectedMessage);
    assert.doesNotMatch(ui.text(), /private PostgreSQL detail/);
    assert(ui.button("Retry same request"));
    await ui.button("Retry same request").props.onClick();
    await ui.settle();
    assert.equal(ui.calls.creates.length, 2);
    assert.equal(ui.calls.creates[0].id, ui.calls.creates[1].id);
    assert.equal(ui.calls.creates[0].requestId, ui.calls.creates[1].requestId);
  }
});

test("Manage Maintenance Items defaults new items to the current asset and maps that stable scope", async () => {
  const ui = harness({ initialMaintenanceItems: [] });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  assert.equal(ui.maintenanceDialog.open, true);
  assert.match(ui.text(), /No saved Maintenance Items yet/);
  assert.equal(ui.calls.catalogReads, 1);
  assert(ui.button("Add Maintenance Item"));
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  const scopeLabel = ui.find((node) => node.type === "label"
    && node.props.htmlFor === "vehicles-maintenance-item-applicability");
  assert.equal(ui.text(scopeLabel.children[0]), "Available For");
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props["aria-label"], undefined);
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props["aria-labelledby"], undefined);
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props.value, "current_asset_only");
  assert.deepEqual(ui.input("vehicles-maintenance-item-applicability").children.map((option) => ui.text(option)),
    ["All Assets", "Current Asset Only", "Selected Assets"]);
  assert.match(ui.text(), /Current asset: Synthetic car/);
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Synthetic oil change" } });
  ui.render();
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"));
  await form.props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.equal(ui.calls.catalogSaves.length, 1);
  const request = ui.calls.catalogSaves[0];
  assert.equal(request.operation, "create");
  assert.match(request.id, /^[0-9a-f-]{36}$/);
  assert.match(request.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(request.displayName, "Synthetic oil change");
  assert.equal(request.group, "routine");
  assert.equal(request.availabilityMode, "current_asset_only");
  assert.equal(request.currentAssetId, uuid(1));
  assert.deepEqual(request.selectedAssetIds, []);
  assert.match(ui.text(), /Synthetic oil change/);
  assert.match(ui.text(), /Active/);
});

test("Changing asset before Add changes the Current Asset Only UUID and Cancel persists nothing", async () => {
  for (const asset of [assets[0], assets[1], { id: uuid(3), name: "Synthetic unitless tool", usageUnit: "none", version: 1 }]) {
    const ui = harness({ initialAssets: [...assets, { id: uuid(3), name: "Synthetic unitless tool", usageUnit: "none", version: 1 }],
      initialMaintenanceItems: [] });
    await ui.settle();
    ui.input("vehicles-asset-select").props.onChange({ target: { value: asset.id } });
    ui.render();
    await ui.settle();
    assert.equal(ui.input("vehicles-asset-select").props.value, asset.id);
    ui.button("Manage Maintenance Items").props.onClick();
    ui.render();
    await ui.settle();
    ui.button("Add Maintenance Item").props.onClick();
    ui.render();
    const draft = ui.input("vehicles-maintenance-item-applicability");
    assert.equal(draft.props.value, "current_asset_only");
    assert.match(ui.text(), new RegExp(`Current asset: ${asset.name}`));
    assert.equal(ui.calls.catalogSaves.length, 0);
    ui.button("Cancel").props.onClick();
    ui.render();
    assert.equal(ui.calls.catalogSaves.length, 0);
  }
});

test("New Current Asset Only draft can explicitly switch to All Assets without stale scope", async () => {
  const ui = harness({ initialMaintenanceItems: [] });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Synthetic all-assets item" } });
  ui.input("vehicles-maintenance-item-applicability").props.onChange({ target: { value: "all_assets" } });
  ui.render();
  assert.equal(ui.calls.catalogSaves.length, 0);
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"));
  await form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(ui.calls.catalogSaves[0], {
    operation: "create",
    id: uuid(900),
    displayName: "Synthetic all-assets item",
    group: "routine",
    availabilityMode: "all_assets",
    currentAssetId: null,
    selectedAssetIds: [],
    requestId: uuid(901),
  });
});

test("New Current Asset Only draft maps an explicit selection of all three asset UUIDs", async () => {
  const allAssets = [...assets, { id: uuid(3), name: "Synthetic trailer", usageUnit: "none", version: 1 }];
  const ui = harness({ initialAssets: allAssets, initialMaintenanceItems: [] });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props.value, "current_asset_only");
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Synthetic selected ABC" } });
  ui.input("vehicles-maintenance-item-applicability").props.onChange({ target: { value: "selected_assets" } });
  ui.render();
  for (const asset of allAssets) {
    ui.input(`vehicles-maintenance-item-asset-${asset.id}`).props.onChange({ target: { checked: true } });
    ui.render();
  }
  await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
    .props.onSubmit({ preventDefault() {} });
  assert.equal(ui.calls.catalogSaves.length, 1);
  assert.deepEqual(ui.calls.catalogSaves[0], {
    operation: "create",
    id: uuid(900),
    displayName: "Synthetic selected ABC",
    group: "routine",
    availabilityMode: "selected_assets",
    currentAssetId: null,
    selectedAssetIds: allAssets.map((asset) => asset.id),
    requestId: uuid(901),
  });
});

test("Editing existing applicability preserves All Assets, Current Asset Only, and selected UUID sets", async () => {
  const assetsWithC = [...assets, { id: uuid(3), name: "Synthetic trailer", usageUnit: "hours", version: 1 }];
  const existing = [
    catalogItem(701, { displayName: "Existing all-assets", availabilityMode: "all_assets" }),
    catalogItem(702, { displayName: "Existing current-only", availabilityMode: "current_asset_only", currentAssetId: uuid(2) }),
    catalogItem(703, { displayName: "Existing selected", availabilityMode: "selected_assets", selectedAssetIds: [uuid(3), uuid(2)] }),
  ];
  for (const itemEntry of existing) {
    const ui = harness({ initialAssets: assetsWithC, initialMaintenanceItems: existing });
    await ui.settle();
    ui.button("Manage Maintenance Items").props.onClick();
    ui.render();
    await ui.settle();
    ui.find((node) => node.type === "button" && ui.text(node).includes(itemEntry.displayName)).props.onClick();
    ui.render();
    const draft = ui.input("vehicles-maintenance-item-applicability");
    assert.equal(draft.props.value, itemEntry.availabilityMode);
    assert.equal(ui.input("vehicles-managed-asset-select"), undefined);
    if (itemEntry.availabilityMode === "current_asset_only") {
      assert.match(ui.text(), /Current asset: Synthetic truck/);
    }
    if (itemEntry.availabilityMode === "selected_assets") {
      assert.deepEqual(assetsWithC.map((asset) => ui.input(`vehicles-maintenance-item-asset-${asset.id}`).props.checked),
        [false, true, true]);
    }
    assert.equal(ui.button("Save Changes").props.disabled, true);
    assert.equal(ui.calls.catalogSaves.length, 0);
    ui.input("vehicles-maintenance-item-applicability").props.onChange({ target: {
      value: itemEntry.availabilityMode === "all_assets" ? "current_asset_only" : "all_assets",
    } });
    ui.render();
    ui.button("Cancel").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-maintenance-item-applicability").props.value, itemEntry.availabilityMode);
    assert.equal(ui.button("Save Changes").props.disabled, true);
    assert.equal(ui.calls.catalogSaves.length, 0);
    ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: `${itemEntry.displayName} renamed` } });
    ui.render();
    await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
      .props.onSubmit({ preventDefault() {} });
    assert.equal(ui.calls.catalogSaves.length, 1);
    const request = ui.calls.catalogSaves[0];
    assert.equal(request.operation, "update");
    assert.equal(request.id, itemEntry.id);
    assert.equal(request.expectedVersion, itemEntry.version);
    assert.equal(request.availabilityMode, itemEntry.availabilityMode);
    assert.equal(request.currentAssetId, itemEntry.currentAssetId);
    assert.deepEqual(request.selectedAssetIds, [...itemEntry.selectedAssetIds].sort());
  }
});

test("Manage Maintenance Items announces loading and retries catalog errors without exposing backend details", async () => {
  let attempts = 0;
  const ui = harness({
    listMaintenanceItems: async () => {
      attempts += 1;
      if (attempts === 1) throw { code: "authorization_error", message: "private catalog detail" };
      return [];
    },
  });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  assert.match(ui.text(), /Loading Maintenance Items/);
  await ui.settle();
  assert.match(ui.text(), /Maintenance Items could not be loaded/);
  assert.doesNotMatch(ui.text(), /private catalog detail/);
  await ui.button("Retry loading catalog").props.onClick();
  ui.render();
  await ui.settle();
  assert.equal(attempts, 2);
  assert.match(ui.text(), /No saved Maintenance Items yet/);
});

test("Manage Maintenance Items validates names and Selected Assets and supports multiple stable asset IDs", async () => {
  const ui = harness({ initialAssets: [...assets, { id: uuid(3), name: "Synthetic trailer", usageUnit: "hours", version: 1 }],
    initialMaintenanceItems: [] });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props.value, "current_asset_only");
  assert.equal(ui.input("vehicles-maintenance-item-name").props.value, "");
  assert.equal(ui.nodes().some((node) => node.type === "input"
    && node.props.id === `vehicles-maintenance-item-asset-${uuid(1)}`), false);
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.match(ui.text(), /Current asset: Synthetic car/);
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Synthetic selected item" } });
  ui.render();
  const applicability = ui.input("vehicles-maintenance-item-applicability");
  applicability.props.onChange({ target: { value: "selected_assets" } });
  ui.render();
  assert.deepEqual([uuid(1), uuid(2), uuid(3)].map((assetId) =>
    ui.input(`vehicles-maintenance-item-asset-${assetId}`).props.checked), [false, false, false]);
  ui.input("vehicles-maintenance-item-group").props.onChange({ target: { value: "invalid" } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
    .props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.match(ui.text(), /choose a valid Group/);
  assert.equal(ui.calls.catalogSaves.length, 0);
  ui.input("vehicles-maintenance-item-group").props.onChange({ target: { value: "routine" } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
    .props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.match(ui.text(), /Select one or more available assets/);
  assert.equal(ui.calls.catalogSaves.length, 0);
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: " " } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
    .props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.match(ui.text(), /nonblank Maintenance Item name/);
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Synthetic filter" } });
  ui.render();
  ui.input(`vehicles-maintenance-item-asset-${uuid(2)}`).props.onChange({ target: { checked: true } });
  ui.render();
  ui.input(`vehicles-maintenance-item-asset-${uuid(3)}`).props.onChange({ target: { checked: true } });
  ui.render();
  ui.input("vehicles-maintenance-item-group").props.onChange({ target: { value: "components_other" } });
  ui.render();
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"));
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(ui.calls.catalogSaves.length, 1);
  assert.equal(ui.calls.catalogSaves[0].availabilityMode, "selected_assets");
  assert.equal(ui.calls.catalogSaves[0].currentAssetId, null);
  assert.deepEqual(ui.calls.catalogSaves[0].selectedAssetIds, [uuid(2), uuid(3)]);
  assert.equal(ui.calls.catalogSaves[0].group, "components_other");
});

test("Maintenance Item Current Asset Only updates preserve expected version and no-op Save does not persist", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  const savedItem = ui.find((node) => node.type === "button"
    && node.props["aria-pressed"] === false && ui.text(node).includes("Synthetic Maintenance 301"));
  savedItem.props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"));
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(ui.calls.catalogSaves.length, 0);
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Updated synthetic item" } });
  ui.render();
  ui.input("vehicles-maintenance-item-group").props.onChange({ target: { value: "fluids_drivetrain" } });
  ui.render();
  ui.input("vehicles-maintenance-item-applicability").props.onChange({ target: { value: "current_asset_only" } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
    .props.onSubmit({ preventDefault() {} });
  const request = ui.calls.catalogSaves[0];
  assert.equal(request.operation, "update");
  assert.equal(request.expectedVersion, 3);
  assert.equal(request.displayName, "Updated synthetic item");
  assert.equal(request.group, "fluids_drivetrain");
  assert.equal(request.availabilityMode, "current_asset_only");
  assert.equal(request.currentAssetId, uuid(1));
  assert.deepEqual(request.selectedAssetIds, []);
});

test("Maintenance Item Cancel restores persisted values and Archive requires confirmation", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  const savedItem = ui.find((node) => node.type === "button"
    && node.props["aria-pressed"] === false && ui.text(node).includes("Synthetic Maintenance 301"));
  savedItem.props.onClick();
  ui.render();
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Unsaved name" } });
  ui.render();
  ui.input("vehicles-maintenance-item-applicability").props.onChange({ target: { value: "selected_assets" } });
  ui.render();
  ui.input(`vehicles-maintenance-item-asset-${uuid(2)}`).props.onChange({ target: { checked: true } });
  ui.render();
  ui.button("Cancel").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-maintenance-item-name").props.value, "Synthetic Maintenance 301");
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props.value, "all_assets");
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.button("Archive").props.onClick();
  ui.render();
  assert.match(ui.text(), /Archive this Maintenance Item/);
  ui.button("Stay").props.onClick();
  ui.render();
  assert.equal(ui.calls.catalogSaves.length, 0);
  ui.button("Archive").props.onClick();
  ui.render();
  ui.button("Archive Maintenance Item").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.catalogSaves[0].operation, "archive");
  assert.equal(ui.calls.catalogSaves[0].id, uuid(301));
  assert.equal(ui.calls.catalogSaves[0].expectedVersion, 3);
  assert.match(ui.text(), /Archived/);
  assert.match(ui.text(), /unavailable to future Ongoing drafts/);
  assert.doesNotMatch(ui.text(), /Delete Maintenance Item/);
});

test("Maintenance Item interval conflict is owner-readable and preserves the draft", async () => {
  const ui = harness({
    saveMaintenanceItem: async () => {
      throw { code: "item_archived_or_unavailable", message: "private interval detail" };
    },
  });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  const savedItem = ui.find((node) => node.type === "button"
    && node.props["aria-pressed"] === false && ui.text(node).includes("Synthetic Maintenance 301"));
  savedItem.props.onClick();
  ui.render();
  ui.input("vehicles-maintenance-item-applicability").props.onChange({ target: { value: "selected_assets" } });
  ui.render();
  ui.input(`vehicles-maintenance-item-asset-${uuid(1)}`).props.onChange({ target: { checked: true } });
  ui.render();
  await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
    .props.onSubmit({ preventDefault() {} });
  ui.render();
  assert.match(ui.text(), /interval still references this item/i);
  assert.doesNotMatch(ui.text(), /private interval detail/);
  assert.equal(ui.input("vehicles-maintenance-item-applicability").props.value, "selected_assets");
  assert.equal(ui.button("Save Changes").props.disabled, false);
});

test("Maintenance Item version, availability, and request mismatches require a catalog reload", async () => {
  for (const [code, expected] of [
    ["version_conflict", /changed elsewhere/],
    ["not_found", /no longer available/],
    ["request_id_payload_mismatch", /used for different save values/],
  ]) {
    const ui = harness({
      saveMaintenanceItem: async () => { throw { code, message: "private database detail" }; },
    });
    await ui.settle();
    ui.button("Manage Maintenance Items").props.onClick();
    ui.render();
    await ui.settle();
    ui.find((node) => node.type === "button" && node.props["aria-pressed"] === false
      && ui.text(node).includes("Synthetic Maintenance 301")).props.onClick();
    ui.render();
    ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: `Changed ${code}` } });
    ui.render();
    await ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"))
      .props.onSubmit({ preventDefault() {} });
    ui.render();
    assert.match(ui.text(), expected);
    assert.doesNotMatch(ui.text(), /private database detail/);
    assert(ui.button("Reload catalog"));
    assert.equal(ui.input("vehicles-maintenance-item-name").props.disabled, true);
    assert.equal(ui.button("Save Changes").props.disabled, true);
  }
});

test("Maintenance Item unknown outcome retries the exact same request and prevents draft edits", async () => {
  let attempts = 0;
  const requests = [];
  const ui = harness({
    saveMaintenanceItem: async (request) => {
      requests.push(structuredClone(request));
      attempts += 1;
      if (attempts === 1) throw {
        code: "unknown_outcome",
        message: "private backend detail",
        retryDraft: structuredClone(request),
      };
      return {
        status: "created",
        requestId: request.requestId,
        item: catalogItem(0, {
          id: request.id, displayName: request.displayName, group: request.group,
          availabilityMode: request.availabilityMode, currentAssetId: request.currentAssetId,
          selectedAssetIds: request.selectedAssetIds, version: 1,
        }),
      };
    },
    initialMaintenanceItems: [],
  });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Retry stable item" } });
  ui.render();
  const submit = () => ui.find((node) => node.type === "form"
    && node.props.className?.includes("maintenanceItemForm")).props.onSubmit({ preventDefault() {} });
  await submit();
  ui.render();
  assert.match(ui.text(), /outcome is unknown/);
  assert.doesNotMatch(ui.text(), /private backend detail/);
  assert.equal(ui.input("vehicles-maintenance-item-name").props.disabled, true);
  await ui.button("Retry same request").props.onClick();
  await ui.settle();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.match(ui.text(), /Retry stable item/);
});

test("Maintenance Item duplicate submissions are locked and dirty close requires confirmation", async () => {
  let release;
  let calls = 0;
  const ui = harness({
    initialMaintenanceItems: [],
    saveMaintenanceItem: (request) => {
      calls += 1;
      return new Promise((resolve) => {
        release = () => resolve({
          status: "created",
          requestId: request.requestId,
          item: catalogItem(0, {
            id: request.id, displayName: request.displayName, group: request.group,
            availabilityMode: request.availabilityMode, currentAssetId: request.currentAssetId,
            selectedAssetIds: request.selectedAssetIds, version: 1,
          }),
        });
      });
    },
  });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Pending item" } });
  ui.render();
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"));
  const first = form.props.onSubmit({ preventDefault() {} });
  const second = form.props.onSubmit({ preventDefault() {} });
  await flush();
  ui.render();
  assert.equal(calls, 1);
  const closeCatalog = () => ui.find((node) => node.props["aria-label"] === "Close Manage Maintenance Items");
  assert.equal(closeCatalog().props.disabled, true);
  release();
  await first;
  await second;
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Pending item edit" } });
  ui.render();
  closeCatalog().props.onClick();
  ui.render();
  assert.equal(ui.maintenanceDialog.open, true);
  assert.match(ui.text(), /Discard Maintenance Item edits/);
  ui.button("Stay").props.onClick();
  ui.render();
  assert.equal(ui.maintenanceDialog.open, true);
  closeCatalog().props.onClick();
  ui.render();
  ui.button("Discard edits").props.onClick();
  ui.render();
  assert.equal(ui.maintenanceDialog.open, false);
  assert(ui.focusCounts.maintenanceItemButton > 0);
});

test("Opening Manage Maintenance Items protects unsaved Ongoing and Asset editing sessions", async () => {
  const ui = harness();
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-05" } });
  ui.render();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  assert.equal(ui.maintenanceDialog.open, false);
  assert.match(ui.text(), /Discard Ongoing Maintenance edits and manage Maintenance Items/);
  ui.button("Stay").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-05");
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  ui.button("Discard and continue").props.onClick();
  ui.render();
  assert.equal(ui.maintenanceDialog.open, true);
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert.match(ui.text(), /2026-02-01/);

  const assetUi = harness();
  await assetUi.settle();
  assetUi.button("Manage Assets").props.onClick();
  assetUi.render();
  assetUi.input("vehicles-managed-asset-name").props.onChange({ target: { value: "Unsaved asset" } });
  assetUi.render();
  assetUi.button("Manage Maintenance Items").props.onClick();
  assetUi.render();
  assert.equal(assetUi.maintenanceDialog.open, false);
  assert.match(assetUi.text(), /Discard Asset edits and manage Maintenance Items/);
  assetUi.button("Stay").props.onClick();
  assetUi.render();
  assert.equal(assetUi.manageDialog.open, true);
  assetUi.button("Manage Maintenance Items").props.onClick();
  assetUi.render();
  assetUi.button("Discard and continue").props.onClick();
  assetUi.render();
  assert.equal(assetUi.manageDialog.open, false);
  assert.equal(assetUi.maintenanceDialog.open, true);
});

test("Manage Assets does not expose database writes or Delete Asset", () => {
  const source = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx"), "utf8");
  assert.doesNotMatch(source, /\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|create_vehicle_asset/);
  assert.doesNotMatch(source, />\s*Delete Asset\s*</);
  assert.doesNotMatch(source, /\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|save_maintenance_item/);
  assert.doesNotMatch(source, />\s*Delete Maintenance Item\s*</);
  assert.match(source, /vehiclesService\.saveMaintenanceItem/);
});

test("Vehicles page actions show Manage, Edit, Add, and Delete directly", async () => {
  const ui = harness();
  await ui.settle();
  const actionContainer = ui.find((node) => node.props?.className === "pageActions");
  const actions = actionContainer.children.map((node) => {
    if (node.type === "details") {
      const summary = node.children.find((child) => child.type === "summary");
      return summary.props["aria-label"] || ui.text(summary);
    }
    return node.type === "button" ? ui.text(node) : "";
  }).filter(Boolean);
  assert.deepEqual(actions, ["Manage", "Edit", "Add Ongoing Record", "Delete Record"]);
  assert.equal(actionContainer.children.some((node) => node.type === "button" && ui.text(node) === "Delete Record"), true);
  assert.equal(actionContainer.children.some((node) => node.type === "details"
    && node.children.some((child) => child.type === "summary" && child.props["aria-label"] === "More actions")), false);
});

test("Manage actions share peer typography and offer centered exact labels", async () => {
  const ui = harness();
  await ui.settle();
  const manage = ui.find((node) => node.type === "details" && String(node.props.className).includes("pageManageActions"));
  const trigger = ui.nodes(manage).find((node) => node.type === "summary");
  const menu = ui.nodes(manage).find((node) => node.type === "div"
    && String(node.props.className).includes("pageManageActionsMenu"));
  const options = ui.nodes(menu).filter((node) => node.type === "button");
  const edit = ui.button("Edit");
  assert.equal(trigger.props["aria-expanded"], false);
  assert.equal(trigger.props.className, edit.props.className);
  assert.match(trigger.props.className, /lm-button/);
  assert.match(trigger.props.className, /lm-button--secondary/);
  assert.deepEqual(options.map((option) => ui.text(option)), [
    "Assets", "Maintenance Items", "Maintenance Intervals",
  ]);
  assert.equal(new Set(options.map((option) => option.props.className)).size, 1);

  const selector = ui.input("vehicles-asset-select");
  assert.equal(selector.props.value, uuid(1));
  assert.match(selector.props.className, /assetSelectorControl/);
  assert.equal(ui.find((node) => node.type === "label" && node.props.htmlFor === "vehicles-asset-select") !== undefined, true);

  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(css, /\.pageManageActionsMenu\s+button\s*\{[^}]*text-align:\s*center;[^}]*justify-content:\s*center/s);
  assert.match(css, /\.pageManageActionsMenu\s+button\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/s);
  assert.match(css, /\.assetSelectorControl\s*\{[^}]*border-color:\s*var\(--lm-color-border-strong\);[^}]*background:\s*var\(--lm-color-surface-subtle\);[^}]*font-weight:\s*700/s);
});

test("Manage popup preserves desktop anchoring and uses a viewport-safe mobile start edge", () => {
  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  const desktopMenu = css.match(/\.pageMoreActionsMenu\s*\{([^}]*)\}/s)?.[1] || "";
  assert.match(desktopMenu, /position:\s*absolute;/);
  assert.match(desktopMenu, /inset-inline-end:\s*0;/);
  assert.match(desktopMenu, /min-width:\s*14rem;/);

  const mobileCss = css.slice(css.indexOf("@media (max-width: 600px)"));
  const mobileMenu = mobileCss.match(/\.pageManageActionsMenu\s*\{([^}]*)\}/s)?.[1] || "";
  assert.match(mobileMenu, /inset-inline-start:\s*0;/);
  assert.match(mobileMenu, /inset-inline-end:\s*auto;/);
  assert.doesNotMatch(mobileMenu, /transform|translate|margin|font-size|(?:left|right):\s*-/);
  assert.equal(css.match(/\.pageManageActionsMenu\s*\{/g)?.length, 1);
});

test("Manage disclosure dismisses outside and on Escape, and interval shortcut navigates to the table", async () => {
  const ui = harness();
  await ui.settle();
  const manage = () => ui.find((node) => node.type === "details"
    && String(node.props.className).includes("pageManageActions"));
  const trigger = () => ui.nodes(manage()).find((node) => node.type === "summary");
  const open = () => {
    trigger().props.onClick({ preventDefault() {} });
    ui.render();
    assert.equal(manage().props.open, true);
    assert.equal(trigger().props["aria-expanded"], true);
    assert.equal(ui.documentListenerCount("pointerdown"), 1);
    assert.equal(ui.documentListenerCount("keydown"), 1);
  };

  open();
  ui.dispatchDocumentEvent("pointerdown", { target: "inside-manage" });
  ui.render();
  assert.equal(manage().props.open, true);
  ui.dispatchDocumentEvent("pointerdown", { target: "outside" });
  ui.render();
  assert.equal(manage().props.open, false);
  assert.equal(ui.documentListenerCount("pointerdown"), 0);
  assert.equal(ui.documentListenerCount("keydown"), 0);

  open();
  let escapePrevented = false;
  ui.dispatchDocumentEvent("keydown", { key: "Escape", preventDefault() { escapePrevented = true; } });
  ui.render();
  assert.equal(escapePrevented, true);
  assert.equal(manage().props.open, false);
  assert.equal(ui.documentListenerCount("pointerdown"), 0);
  assert.equal(ui.documentListenerCount("keydown"), 0);
  assert(ui.focusCounts.manageButton > 0);

  open();
  ui.button("Manage Assets").props.onClick();
  await ui.settle();
  assert.equal(manage().props.open, false);
  assert.equal(ui.manageDialog.open, true);
  assert.equal(ui.documentListenerCount("pointerdown"), 0);
  ui.find((node) => node.type === "button" && node.props["aria-label"] === "Close Manage Assets").props.onClick();
  ui.render();

  open();
  ui.button("Manage Maintenance Items").props.onClick();
  await ui.settle();
  assert.equal(manage().props.open, false);
  assert.equal(ui.maintenanceDialog.open, true);
  ui.find((node) => node.type === "button" && node.props["aria-label"] === "Close Manage Maintenance Items").props.onClick();
  ui.render();

  open();
  ui.button("Manage Maintenance Intervals").props.onClick();
  await ui.settle();
  assert.equal(manage().props.open, false);
  assert.equal(ui.intervalDialog.open, false);
  assert.equal(ui.find((node) => node.props?.["data-vehicles-section"] === "intervals").props["aria-selected"], true);
  assert(ui.button("+ New Service"));
  assert.equal(ui.calls.saves.length, 0);
});

test("Vehicles shell exposes the canonical five sections in order above section content", async () => {
  const ui = harness();
  await ui.settle();

  const sectionTabs = ui.find((node) => node.type === "nav" && node.props.role === "tablist");
  const tabs = ui.nodes(sectionTabs).filter((node) => node.type === "button" && node.props.role === "tab");
  const labels = [
    "Ongoing Maintenance", "Recommended Service", "Completed Service", "Maintenance Intervals", "Key Information",
  ];
  assert.deepEqual(tabs.map((tab) => ui.text(tab)), labels);
  assert.deepEqual(tabs.map((tab) => tab.props["aria-selected"]), [true, false, false, false, false]);

  const mobileSelector = ui.input("vehicles-section-select");
  assert.equal(mobileSelector.props.value, "ongoing");
  assert.deepEqual(mobileSelector.children.map((option) => ui.text(option)), labels);

  const sectionPanel = ui.find((node) => node.props?.id === "vehicles-section-panel");
  const orderedNodes = ui.nodes();
  const header = ui.find((node) => node.type === "header" && node.props.id === "vehicles-page-title");
  const contextRow = ui.find((node) => node.props?.className === "vehicleContextRow");
  const assetSelector = ui.find((node) => node.props?.className === "assetRow");
  const actionContainer = ui.find((node) => node.props?.className === "pageActions");
  assert(orderedNodes.indexOf(header) < orderedNodes.indexOf(assetSelector));
  assert(contextRow.children.includes(assetSelector));
  assert(contextRow.children.includes(actionContainer));
  assert(orderedNodes.indexOf(contextRow) < orderedNodes.indexOf(sectionTabs));
  assert(orderedNodes.indexOf(sectionTabs) < orderedNodes.indexOf(sectionPanel));
  assert.equal(sectionPanel.props.role, "tabpanel");
  assert.equal(sectionPanel.props["aria-label"], "Ongoing Maintenance");

  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(css, /\.sectionTabs\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.sectionTabActive\s*\{[^}]*border-bottom-color:\s*var\(--lm-color-primary\)/s);
  assert.match(css, /\.vehicleContextRow\s*\{[^}]*display:\s*flex/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.sectionTabs\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.vehicleContextRow\s*\{[^}]*display:\s*grid/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.mobileSectionSelector\s*\{[^}]*display:\s*grid/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.mobileSessionActions\s*\{[^}]*position:\s*sticky;[^}]*margin-top:\s*auto;[^}]*margin-bottom:\s*calc/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.pageEditing\s*\{[^}]*min-height:/);
});

test("Section switching preserves the asset and dirty Ongoing session without saving", async () => {
  const ui = harness();
  await ui.settle();
  const assetId = ui.input("vehicles-asset-select").props.value;
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
  const workspacesBefore = ui.calls.workspaces.length;
  const sectionTab = (id) => ui.find((node) => node.props?.["data-vehicles-section"] === id);

  for (const [label, expectedId] of [
    ["Recommended Service", "recommended"],
    ["Completed Service", "completed"],
    ["Key Information", "key-information"],
  ]) {
    sectionTab(expectedId).props.onClick();
    ui.render();
    const panel = ui.find((node) => node.props?.id === "vehicles-section-panel");
    assert.equal(panel.props["aria-label"], label);
    assert.equal(ui.input("vehicles-asset-select").props.value, assetId);
    assert.match(ui.text(panel), expectedId === "recommended"
      ? /No recommended service recorded for this asset/ : expectedId === "completed"
        ? /No completed service recorded for this asset/ : /No key maintenance information recorded for this asset/);
    assert.equal(ui.calls.saves.length, 0);
    assert.equal(ui.calls.workspaces.length, workspacesBefore);
    assert.equal(ui.button("Discard and continue"), undefined);
    assert.equal(ui.find((node) => node.props?.["data-vehicles-section"] === expectedId)
      .props["aria-selected"], true);
  }

  sectionTab("ongoing").props.onClick();
  ui.render();
  enterOngoingEdit(ui);
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-04" } });
  ui.render();
  for (const [label, expectedId] of [
    ["Recommended Service", "recommended"],
    ["Completed Service", "completed"],
    ["Maintenance Intervals", "intervals"],
    ["Key Information", "key-information"],
  ]) {
    sectionTab(expectedId).props.onClick();
    ui.render();
    assert.equal(ui.find((node) => node.props?.id === "vehicles-section-panel").props["aria-label"], label);
    assert.equal(ui.find((node) => node.props?.["data-vehicles-section"] === expectedId)
      .props["aria-selected"], true);
    assert.equal(ui.shouldBlock(), true);
    assert.equal(ui.input("vehicles-asset-select").props.value, assetId);
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert(ui.button("Cancel Changes"));
    assert(ui.button("Save Changes"));
    assert.equal(ui.button("Discard and continue"), undefined);
    assert.equal(ui.calls.saves.length, 0);
    assert.equal(ui.calls.workspaces.length, workspacesBefore);
  }
  const sectionPanel = ui.find((node) => node.props?.id === "vehicles-section-panel");
  const mobileSessionActions = ui.find((node) => node.props?.className === "mobileSessionActions");
  assert(mobileSessionActions);
  assert.equal(ui.nodes(sectionPanel).includes(mobileSessionActions), false);

  sectionTab("ongoing").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-04");
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.input("vehicles-asset-select").props.value, assetId);
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
});

function recommendedHarness(records = [], overrides = {}) {
  return harness({
    loadVehicleWorkspace: async () => ({ ...workspace(assets[0], [record(12, "2023-02-27")]),
      recommendedServiceRecords: records }),
    ...overrides,
  });
}

function openRecommended(ui) {
  ui.find((node) => node.props?.["data-vehicles-section"] === "recommended").props.onClick();
  ui.render();
}

const recommendation = (id = 501, overrides = {}) => ({
  id: uuid(id), serviceDate: "2026-01-20", usageReadingValue: 103100,
  usageReadingUnit: "miles", mechanic: "Synthetic Dealer", description: "Inspect front brake pads.",
  version: 3, ...overrides,
});

test("Recommended Service has an empty state and canonical independent date navigation without catalog controls", async () => {
  const empty = recommendedHarness();
  await empty.settle();
  openRecommended(empty);
  assert.match(empty.text(), /No recommended service recorded for this asset/);
  assert(empty.button("Add Recommended Service"));
  assert.equal(empty.input("vehicles-recommended-description"), undefined);
  assert.equal(empty.button("Edit"), undefined);
  assert.equal(empty.button("Delete Record"), undefined);

  const ui = recommendedHarness([recommendation(), recommendation(502, { serviceDate: "2025-01-01" })]);
  await ui.settle();
  openRecommended(ui);
  assert.equal(ui.input("vehicles-recommended-record").props.value, uuid(501));
  assert.match(ui.text(), /Inspect front brake pads/);
  assert.equal(ui.nodes().filter((node) => node.props?.role === "switch").length, 0);
  ui.input("vehicles-recommended-record").props.onChange({ target: { value: uuid(502) } });
  ui.render();
  assert.equal(ui.input("vehicles-recommended-record").props.value, uuid(502));
  assert.equal(ui.calls.saves.length, 0);
});

test("Recommended Add draft survives all sections, locks its asset, and cancels without saving", async () => {
  const ui = recommendedHarness();
  await ui.settle();
  openRecommended(ui);
  ui.button("Add Recommended Service").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Synthetic recommendation" } });
  ui.render();
  const date = ui.input("vehicles-recommended-date").props.value;
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.button("Delete Record"), undefined);
  for (const section of ["ongoing", "completed", "intervals", "key-information", "recommended"]) {
    ui.find((node) => node.props?.["data-vehicles-section"] === section).props.onClick();
    ui.render();
  }
  assert.equal(ui.input("vehicles-recommended-description").props.value, "Synthetic recommendation");
  assert.equal(ui.input("vehicles-recommended-date").props.value, date);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.shouldBlock(), true);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.match(ui.text(), /No recommended service recorded/);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.shouldBlock(), false);
});

test("Recommended Edit emits only changed fields with record and asset versions through the shared save", async () => {
  const ui = recommendedHarness([recommendation()]);
  await ui.settle();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Recheck synthetic brake pads." } });
  ui.render();
  await ui.find((node) => node.props?.id === "vehicles-recommended-form").props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  const saved = ui.calls.saves[0];
  assert.equal(saved.assetId, uuid(1));
  assert.equal(saved.expectedAssetVersion, 4);
  assert.deepEqual(saved.recommendedOperations, [{ action: "update", id: uuid(501), expectedVersion: 3,
    description: "Recheck synthetic brake pads." }]);
  assert.deepEqual(saved.ongoingOperations, []);
  assert.deepEqual(saved.completedOperations, []);
  assert.deepEqual(saved.intervalOperations, []);
});

test("Recommended invalid Description and readings never reach persistence", async () => {
  const ui = recommendedHarness();
  await ui.settle();
  openRecommended(ui);
  ui.button("Add Recommended Service").props.onClick();
  ui.render();
  const submit = async () => {
    await ui.find((node) => node.props?.id === "vehicles-recommended-form").props.onSubmit({ preventDefault() {} });
    await ui.settle();
  };
  await submit();
  assert.match(ui.text(), /Review Recommended Service/);
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Synthetic work" } });
  ui.input("vehicles-recommended-usage").props.onChange({ target: { value: "-1" } });
  ui.render();
  await submit();
  assert.equal(ui.calls.saves.length, 0);
});

test("Recommended create uses stable identity, exact asset scope, and no catalog or interval operations", async () => {
  const ui = recommendedHarness();
  await ui.settle();
  openRecommended(ui);
  ui.button("Add Recommended Service").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-date").props.onChange({ target: { value: "2026-03-04" } });
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Synthetic inspection" } });
  ui.input("vehicles-recommended-usage").props.onChange({ target: { value: "100.25" } });
  ui.render();
  await ui.find((node) => node.props?.id === "vehicles-recommended-form").props.onSubmit({ preventDefault() {} });
  await ui.settle();
  const saved = ui.calls.saves[0];
  assert.equal(saved.assetId, uuid(1));
  assert.deepEqual(saved.recommendedOperations, [{ action: "create", id: uuid(900),
    serviceDate: "2026-03-04", usageReadingValue: 100.25, usageReadingUnit: "miles",
    mechanic: null, description: "Synthetic inspection" }]);
  for (const field of ["ongoingOperations", "completedOperations", "intervalOperations", "maintenanceItemOperations"]) {
    assert.deepEqual(saved[field], []);
  }
  assert.equal(ui.calls.templates, 0);
  assert.equal(ui.calls.catalogReads, 0);
});

test("Recommended and Ongoing edits share one atomic vehicle save without losing either draft", async () => {
  const ui = recommendedHarness([recommendation()]);
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic mechanic" } });
  ui.render();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Combined synthetic inspection" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  assert.equal(ui.calls.saves[0].ongoingOperations[0].mechanic, "Synthetic mechanic");
  assert.equal(ui.calls.saves[0].recommendedOperations[0].description, "Combined synthetic inspection");
  assert.deepEqual(ui.calls.saves[0].completedOperations, []);
  assert.deepEqual(ui.calls.saves[0].intervalOperations, []);
});

test("Recommended deletion confirms and queues the committed versioned delete; Cancel restores history", async () => {
  const ui = recommendedHarness([recommendation()]);
  await ui.settle();
  openRecommended(ui);
  ui.button("Delete Record").props.onClick();
  ui.render();
  assert.match(ui.text(), /Queue deletion of this Recommended Service record/);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.button("Queue Delete").props["aria-label"], "Queue Delete");
  ui.button("Queue Delete").props.onClick();
  ui.render();
  assert.match(ui.text(), /All Recommended Service records are queued/);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-recommended-record").props.value, uuid(501));
  ui.button("Delete Record").props.onClick();
  ui.render();
  ui.button("Queue Delete").props.onClick();
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].recommendedOperations, [{ action: "delete", id: uuid(501), expectedVersion: 3 }]);
  assert.deepEqual(ui.calls.saves[0].ongoingOperations, []);
});

test("Recommended conflicts retain values, duplicate dates and malformed fields block saving", async () => {
  const ui = recommendedHarness([recommendation()], {
    saveVehicleChanges: async () => { throw { code: "version_conflict" }; },
  });
  await ui.settle();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Preserved synthetic work" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.match(ui.text(), /changed elsewhere/);
  assert.equal(ui.input("vehicles-recommended-description").props.value, "Preserved synthetic work");
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  ui.button("Add Recommended Service").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Duplicate date" } });
  ui.input("vehicles-recommended-date").props.onChange({ target: { value: "2026-01-20" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.match(ui.text(), /unique valid date/);
});

test("Recommended unknown-outcome retry uses the exact request and locks edits; submits cannot duplicate", async () => {
  let release;
  let attempts = 0;
  let retryDraft;
  const requests = [];
  const ui = recommendedHarness([recommendation()], {
    saveVehicleChanges: async (draft) => {
      requests.push(structuredClone(draft));
      attempts += 1;
      if (attempts === 1) {
        await new Promise((resolve) => { release = resolve; });
        retryDraft = { ...structuredClone(draft), requestId: uuid(990) };
        throw { code: "unknown_outcome", retryDraft };
      }
      return { status: "saved", assetVersion: 5, entityVersions: { recommended: { [uuid(501)]: 4 } } };
    },
  });
  await ui.settle();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Stable synthetic retry" } });
  ui.render();
  const submit = ui.button("Save Changes").props.onClick;
  const first = submit();
  await submit();
  assert.equal(attempts, 1);
  release();
  await first;
  await ui.settle();
  assert.equal(ui.input("vehicles-recommended-description").props.disabled, true);
  assert.equal(ui.button("Cancel Changes").props.disabled, true);
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.deepEqual(requests[1], retryDraft);
  assert.equal(requests[0].recommendedOperations[0].id, uuid(501));
});

test("Recommended uses its historical units without Maintenance Item applicability rules", async () => {
  for (const unit of ["hours", "none"]) {
    const asset = { ...assets[0], usageUnit: unit };
    const ui = recommendedHarness([recommendation(501, { usageReadingUnit: unit,
      usageReadingValue: unit === "none" ? null : 12 })], {
      loadVehicleWorkspace: async () => ({ ...workspace(asset, []), recommendedServiceRecords: [recommendation(501, {
        usageReadingUnit: unit, usageReadingValue: unit === "none" ? null : 12,
      })] }),
    });
    await ui.settle();
    openRecommended(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    assert.equal(Boolean(ui.input("vehicles-recommended-usage")), unit !== "none");
    assert.equal(ui.input("vehicles-recommended-description").props.maxLength, "10000");
    assert.equal(ui.input("vehicles-recommended-mechanic").props.maxLength, "160");
    assert.equal(ui.calls.catalogReads, 0);
  }
});

test("Recommended validates canonical dates, precision, text bounds, and whitespace before saving", async () => {
  for (const [field, value] of [
    ["vehicles-recommended-date", "2026-02-30"],
    ["vehicles-recommended-description", " padded text "],
    ["vehicles-recommended-description", " \\n "],
    ["vehicles-recommended-description", "X".repeat(10001)],
    ["vehicles-recommended-mechanic", "X".repeat(161)],
    ["vehicles-recommended-usage", "1.001"],
    ["vehicles-recommended-usage", "10000000000"],
  ]) {
    const ui = recommendedHarness([recommendation()]);
    await ui.settle();
    openRecommended(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    ui.input(field).props.onChange({ target: { value } });
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.equal(ui.calls.saves.length, 0, field);
    assert.match(ui.text(), /Review Recommended Service/);
  }
});

test("Recommended confirmed save survives a failed refresh and uses returned optimistic versions next time", async () => {
  let loads = 0;
  const ui = recommendedHarness([recommendation()], {
    loadVehicleWorkspace: async () => {
      loads += 1;
      if (loads > 1) throw Error("Synthetic reload failure");
      return { ...workspace(assets[0], []), recommendedServiceRecords: [recommendation()] };
    },
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      return { status: "saved", assetVersion: 5, entityVersions: { recommended: { [uuid(501)]: 4 } } };
    },
  });
  await ui.settle();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Confirmed synthetic work" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.match(ui.text(), /saved, but the latest workspace could not be reloaded/);
  assert.match(ui.text(), /Confirmed synthetic work/);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.input("vehicles-recommended-mechanic").props.onChange({ target: { value: "Synthetic shop" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[1].expectedAssetVersion, 5);
  assert.equal(ui.calls.saves[1].recommendedOperations[0].expectedVersion, 4);
});

test("Recommended layout keeps Date above paired fields and bounded desktop Description with stacked mobile flow", () => {
  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(css, /\.recommendedForm\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.recommendedFields\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.recommendedDescription textarea,\s*\.recommendedText\s*\{[^}]*overflow-y:\s*auto/s);
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /\.recommendedFields\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(mobile, /\.recommendedText\s*\{[^}]*overflow-y:\s*visible/s);
});

test("Recommended bullet toggle handles the current line, empty line, and relative caret", () => {
  const added = bulletTransform("Inspect tires", 4, 4);
  assert.equal(added.text, "\u2022 Inspect tires");
  assert.equal(added.selectionStart, 6);
  assert.equal(added.selectionEnd, 6);
  const removed = bulletTransform(added.text, added.selectionStart, added.selectionEnd);
  assert.equal(removed.text, "Inspect tires");
  assert.equal(removed.selectionStart, 4);
  assert.equal(bulletTransform("", 0, 0).text, "\u2022 ");
  assert.equal(bulletTransform("First\nSecond", 7, 7).text, "First\n\u2022 Second");
  assert.equal(bulletTransform("\nSecond", 0, 0).text, "\u2022 \nSecond");
});

test("Recommended multiline bullets preserve blank lines and never duplicate mixed prefixes", () => {
  const text = "Inspect tires\n\nCheck balance\n  \nInspect suspension";
  const added = bulletTransform(text, 0, text.length);
  assert.equal(added.text, "\u2022 Inspect tires\n\n\u2022 Check balance\n  \n\u2022 Inspect suspension");
  const removed = bulletTransform(added.text, added.selectionStart, added.selectionEnd);
  assert.equal(removed.text, text);
  assert.equal(removed.selectionStart, 0);
  assert.equal(removed.selectionEnd, text.length);
  const mixed = "\u2022 Inspect tires\nCheck balance\n\u2022 Inspect suspension";
  assert.equal(bulletTransform(mixed, 0, mixed.length).text,
    "\u2022 Inspect tires\n\u2022 Check balance\n\u2022 Inspect suspension");
  assert.equal(bulletTransform("\n  \n", 0, 4).text, "\n  \n");
  assert.equal(bulletTransform("First\nSecond", 0, 6).text, "\u2022 First\nSecond");
});

test("Recommended Bullets action preserves selection, textarea focus, text, and native insertion boundary", async () => {
  const description = "Customer reports vibration.\n\nInspect tires\nCheck balance";
  const ui = recommendedHarness([recommendation(501, { description })]);
  await ui.settle();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  const start = description.indexOf("Inspect");
  const editor = ui.attachDescriptionEditor(start, description.length);
  const button = ui.button("Bullets");
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-label"], "Toggle bullets");
  button.props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-recommended-description").props.value,
    "Customer reports vibration.\n\n\u2022 Inspect tires\n\u2022 Check balance");
  assert.equal(editor.insertions, 1);
  assert.equal(editor.selectionStart, start + 2);
  assert.equal(editor.selectionEnd, description.length + 4);
  assert.equal(editor.scrollTop, 25);
  assert.equal(ui.input("vehicles-recommended-description").props.onKeyDown, undefined);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.match(ui.text(), /Customer reports vibration/);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-recommended-description").props.value, description);
});

test("Recommended bullet prefixes count toward the limit and reject over-limit changes atomically", async () => {
  for (const [description, accepted] of [["X".repeat(9998), true], ["X".repeat(9999), false],
    ["X".repeat(9996) + "\nY", false]]) {
    const ui = recommendedHarness([recommendation(501, { description })]);
    await ui.settle();
    openRecommended(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    const editor = ui.attachDescriptionEditor(0, description.length);
    ui.button("Bullets").props.onClick();
    ui.render();
    const value = ui.input("vehicles-recommended-description").props.value;
    assert.equal(value, accepted ? "\u2022 " + description : description);
    assert.equal(editor.insertions, accepted ? 1 : 0);
    if (!accepted) {
      assert(ui.nodes().some((node) => node.props?.role === "alert" && ui.text(node).includes("10,000-character")));
      assert.equal(editor.selectionStart, 0);
      assert.equal(editor.selectionEnd, description.length);
      assert.equal(ui.button("Save Changes").props.disabled, true);
    }
  }
});

test("Recommended bullet text is preserved through Add save mapping, reload, traversal, and Cancel", async () => {
  const description = "Customer reports vibration at highway speed.\n\n\u2022 Inspect tires\n\u2022 Check wheel balance\n\u2022 Inspect front suspension";
  const ui = recommendedHarness();
  await ui.settle();
  openRecommended(ui);
  ui.button("Add Recommended Service").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: description } });
  ui.render();
  const date = ui.input("vehicles-recommended-date").props.value;
  for (const section of ["ongoing", "completed", "intervals", "key-information", "recommended"]) {
    ui.find((node) => node.props?.["data-vehicles-section"] === section).props.onClick();
    ui.render();
  }
  assert.equal(ui.input("vehicles-recommended-description").props.value, description);
  assert.equal(ui.input("vehicles-recommended-date").props.value, date);
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.calls.saves.length, 0);
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  const operation = ui.calls.saves[0].recommendedOperations[0];
  assert.equal(operation.description, description);
  assert.deepEqual(Object.keys(operation).sort(), ["action", "description", "id", "mechanic", "serviceDate", "usageReadingUnit", "usageReadingValue"].sort());

  const reloaded = recommendedHarness([recommendation(501, { description })]);
  await reloaded.settle();
  openRecommended(reloaded);
  const content = reloaded.find((node) => node.props?.["aria-label"] === "Recommended Service Description");
  assert.equal(reloaded.text(content), description);
  assert.equal(content.props.dangerouslySetInnerHTML, undefined);
  reloaded.button("Edit").props.onClick();
  reloaded.render();
  assert.equal(reloaded.input("vehicles-recommended-description").props.value, description);
  assert.equal(reloaded.button("Save Changes").props.disabled, true);
  reloaded.attachDescriptionEditor(description.indexOf("\u2022"), description.length);
  reloaded.button("Bullets").props.onClick();
  reloaded.render();
  reloaded.button("Cancel Changes").props.onClick();
  reloaded.render();
  assert.equal(reloaded.text(reloaded.find((node) => node.props?.["aria-label"] === "Recommended Service Description")), description);
});

test("Recommended Description safely displays HTML-like bullet text and keeps wrapping and mobile targets", async () => {
  const description = "\u2022 <script>alert('not HTML')</script>\n\nParagraph";
  const ui = recommendedHarness([recommendation(501, { description })]);
  await ui.settle();
  openRecommended(ui);
  const content = ui.find((node) => node.props?.["aria-label"] === "Recommended Service Description");
  assert.equal(ui.text(content), description);
  assert.equal(ui.nodes(content).some((node) => node.type === "script"), false);
  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(css, /\.recommendedText\s*\{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css.slice(css.indexOf("@media (max-width: 600px)")), /\.descriptionBullets\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/s);
});

test("Recommended actual service read/save mappers preserve exact bullet strings without a new field", () => {
  const loadSource = (file) => fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const { parseDateOnly } = vm.runInNewContext(`(() => {
    ${loadSource("src/services/vehiclesMaintenanceIntervalEngine.js")}; return { parseDateOnly };
  })()`);
  const { mapHistoryRow, mapSaveRequest } = vm.runInNewContext(`(() => {
    ${loadSource("src/services/vehiclesService.js")}; return { mapHistoryRow, mapSaveRequest };
  })()`, { parseDateOnly, getSupabaseClient: () => { throw Error("No production client in mapper tests"); } });
  const description = "Customer reports vibration.\n\n\u2022 Inspect  tires\n\u2022 Check balance\n\nParagraph after list.";
  const mapped = mapHistoryRow({ id: uuid(501), service_date: "2026-01-20", usage_reading_unit: "miles",
    usage_reading_value: 103100, mechanic: null, version: 3, description }, "recommended");
  assert.equal(mapped.description, description);
  const request = mapSaveRequest({ assetId: uuid(1), expectedAssetVersion: 4,
    recommendedOperations: [{ action: "update", id: mapped.id, expectedVersion: mapped.version, description: mapped.description }],
  }, uuid(999));
  assert.equal(request.recommended_operations[0].description, description);
  assert.deepEqual(Object.keys(request.recommended_operations[0]).sort(), ["action", "description", "expected_version", "id"]);
});

const completedRecord = (id = 701, overrides = {}) => ({
  id: uuid(id), serviceDate: "2025-12-05", usageReadingValue: 100820,
  usageReadingUnit: "miles", mechanic: "Synthetic tire shop",
  serviceDescription: "Replaced all 4 tires.\nBalanced and torqued to specification.", version: 7,
  ...overrides,
});

function completedHarness(records = [], overrides = {}) {
  return harness({
    loadVehicleWorkspace: async () => ({ ...workspace(assets[0], [record(12, "2023-02-27")]),
      recommendedServiceRecords: [recommendation()], completedServiceRecords: records }),
    ...overrides,
  });
}

function openCompleted(ui) {
  ui.find((node) => node.props?.["data-vehicles-section"] === "completed").props.onClick();
  ui.render();
}

test("Completed empty state is asset-specific without a blank form or unrelated actions", async () => {
  const ui = completedHarness();
  await ui.settle();
  openCompleted(ui);
  const panel = ui.find((node) => node.props?.id === "vehicles-section-panel");
  assert.equal(panel.props["aria-label"], "Completed Service");
  assert.match(ui.text(panel), /No completed service recorded for this asset/);
  assert(ui.button("Add Completed Service"));
  assert.equal(ui.button("Edit"), undefined);
  assert.equal(ui.button("Delete Record"), undefined);
  assert.equal(ui.input("vehicles-completed-description"), undefined);
  assert.equal(ui.calls.saves.length, 0);
});

test("Completed uses its own newest-first date selector and stable record IDs, not an Ongoing rail", async () => {
  const older = completedRecord(702, { serviceDate: "2024-01-03", serviceDescription: "Older synthetic service" });
  const ui = completedHarness([older, completedRecord()]);
  await ui.settle();
  openCompleted(ui);
  const selector = ui.input("vehicles-completed-record");
  assert.equal(selector.type, "select");
  assert.equal(selector.props.value, uuid(701));
  assert.deepEqual(selector.children.map((node) => node.props.value), [uuid(701), uuid(702)]);
  assert.deepEqual(selector.children.map((node) => ui.text(node)), ["2025-12-05", "2024-01-03"]);
  assert.match(ui.text(), /Service Description/);
  assert.equal(ui.button("Bullets"), undefined);
  assert.equal(ui.nodes().filter((node) => node.props?.role === "switch").length, 0);
  assert.equal(ui.find((node) => node.props?.["aria-label"] === "Ongoing Maintenance records"), undefined);
  selector.props.onChange({ target: { value: uuid(702) } });
  ui.render();
  assert.match(ui.text(), /Older synthetic service/);
  assert.equal(ui.input("vehicles-completed-record").props.value, uuid(702));
  assert.equal(ui.calls.saves.length, 0);
});

test("Completed Add preserves all fields across every section, locks its asset, and cancels without saving", async () => {
  const ui = completedHarness();
  await ui.settle();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  ui.input("vehicles-completed-date").props.onChange({ target: { value: "2026-04-04" } });
  ui.input("vehicles-completed-usage").props.onChange({ target: { value: "125.5" } });
  ui.input("vehicles-completed-mechanic").props.onChange({ target: { value: "Synthetic workshop" } });
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Synthetic service.\n\nSecond paragraph." } });
  ui.render();
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.button("Delete Record"), undefined);
  assert.equal(ui.input("vehicles-completed-description").props.onKeyDown, undefined);
  for (const section of ["ongoing", "recommended", "intervals", "key-information", "completed"]) {
    ui.find((node) => node.props?.["data-vehicles-section"] === section).props.onClick();
    ui.render();
    assert.equal(ui.calls.saves.length, 0);
  }
  assert.equal(ui.input("vehicles-completed-date").props.value, "2026-04-04");
  assert.equal(ui.input("vehicles-completed-usage").props.value, 125.5);
  assert.equal(ui.input("vehicles-completed-mechanic").props.value, "Synthetic workshop");
  assert.equal(ui.input("vehicles-completed-description").props.value, "Synthetic service.\n\nSecond paragraph.");
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.shouldBlock(), true);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.match(ui.text(), /No completed service recorded/);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.shouldBlock(), false);
});

test("Completed create emits only its committed fields and stable client identity in the shared envelope", async () => {
  const ui = completedHarness();
  await ui.settle();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  const description = "Synthetic completed work.\n\nLiteral <b>text</b> stays plain.";
  ui.input("vehicles-completed-date").props.onChange({ target: { value: "2026-04-04" } });
  ui.input("vehicles-completed-description").props.onChange({ target: { value: description } });
  ui.render();
  await ui.find((node) => node.props?.id === "vehicles-completed-form").props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  const draft = ui.calls.saves[0];
  assert.equal(draft.assetId, uuid(1));
  assert.equal(draft.expectedAssetVersion, 4);
  assert.deepEqual(draft.completedOperations, [{ action: "create", id: uuid(900), serviceDate: "2026-04-04",
    usageReadingValue: null, usageReadingUnit: "miles", mechanic: null, serviceDescription: description }]);
  for (const field of ["ongoingOperations", "recommendedOperations", "intervalOperations", "maintenanceItemOperations", "linkOperations"]) {
    assert.deepEqual(draft[field], []);
  }
  assert.equal(ui.calls.templates, 0);
  assert.equal(ui.calls.catalogReads, 0);
});

test("Completed Edit and no-op Save preserve content, while a changed field carries its expected version", async () => {
  const ui = completedHarness([completedRecord()]);
  await ui.settle();
  openCompleted(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-completed-description").props.value, completedRecord().serviceDescription);
  assert.equal(ui.button("Save Changes").props.disabled, true);
  await ui.button("Save Changes").props.onClick();
  assert.equal(ui.calls.saves.length, 0);
  ui.input("vehicles-completed-mechanic").props.onChange({ target: { value: "Updated synthetic shop" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].completedOperations, [{ action: "update", id: uuid(701), expectedVersion: 7,
    mechanic: "Updated synthetic shop" }]);
  assert.deepEqual(ui.calls.saves[0].recommendedOperations, []);
});

test("Completed cancellation restores the exact original multiline Service Description", async () => {
  const source = completedRecord(701, { serviceDescription: "Original line.\n\nSecond line." });
  const ui = completedHarness([source]);
  await ui.settle();
  openCompleted(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Changed synthetic text" } });
  ui.render();
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  const text = ui.find((node) => node.props?.["aria-label"] === "Completed Service Description");
  assert.equal(ui.text(text), source.serviceDescription);
  assert.equal(ui.calls.saves.length, 0);
});

test("Completed deletion is confirmed, cancelable, versioned, and pending until the shared Save", async () => {
  const ui = completedHarness([completedRecord()]);
  await ui.settle();
  openCompleted(ui);
  ui.button("Delete Record").props.onClick();
  ui.render();
  assert.match(ui.text(), /Queue deletion of this Completed Service record/);
  assert.equal(ui.button("Queue Delete").props["aria-label"], "Queue Delete");
  ui.button("Stay").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-completed-record").props.value, uuid(701));
  ui.button("Delete Record").props.onClick();
  ui.render();
  ui.button("Queue Delete").props.onClick();
  ui.render();
  assert.match(ui.text(), /All Completed Service records are queued/);
  assert.equal(ui.calls.saves.length, 0);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-completed-record").props.value, uuid(701));
  ui.button("Delete Record").props.onClick();
  ui.render();
  ui.button("Queue Delete").props.onClick();
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].completedOperations, [{ action: "delete", id: uuid(701), expectedVersion: 7 }]);
  assert.deepEqual(ui.calls.saves[0].ongoingOperations, []);
  assert.deepEqual(ui.calls.saves[0].recommendedOperations, []);
});

test("Completed enforces its actual date, description, mechanic and reading constraints before saving", async () => {
  for (const [field, value] of [
    ["vehicles-completed-date", "2026-02-30"],
    ["vehicles-completed-description", ""], ["vehicles-completed-description", " \n "],
    ["vehicles-completed-description", " padded "], ["vehicles-completed-description", "X".repeat(10001)],
    ["vehicles-completed-mechanic", "X".repeat(161)],
    ["vehicles-completed-usage", "-1"], ["vehicles-completed-usage", "1.001"],
    ["vehicles-completed-usage", "10000000000"],
  ]) {
    const ui = completedHarness([completedRecord()]);
    await ui.settle();
    openCompleted(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    ui.input(field).props.onChange({ target: { value } });
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.equal(ui.calls.saves.length, 0, field);
    assert(ui.nodes().some((node) => node.props?.role === "alert" && ui.text(node).includes("Review Completed Service")));
  }
});

test("Completed dates are unique only within Completed history, not Recommended or Ongoing", async () => {
  const ui = completedHarness([completedRecord()]);
  await ui.settle();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  ui.input("vehicles-completed-date").props.onChange({ target: { value: "2025-12-05" } });
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Synthetic duplicate" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 0);
  ui.input("vehicles-completed-date").props.onChange({ target: { value: "2023-02-27" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
});

test("Completed conflict and rejected saves preserve drafts and original optimistic versions", async () => {
  for (const code of ["version_conflict", "validation_error", "not_found"]) {
    const ui = completedHarness([completedRecord()], {
      saveVehicleChanges: async (draft) => { ui.calls.saves.push(structuredClone(draft)); throw { code }; },
    });
    await ui.settle();
    openCompleted(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    ui.input("vehicles-completed-description").props.onChange({ target: { value: "Retained synthetic work" } });
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.equal(ui.input("vehicles-completed-description").props.value, "Retained synthetic work");
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert.equal(ui.calls.saves[0].completedOperations[0].expectedVersion, 7);
    assert(ui.nodes().some((node) => node.props?.role === "alert"));
  }
});

test("Completed prevents duplicate submits and retries an unknown-outcome create with exact request and record IDs", async () => {
  let release;
  let exactRetry;
  const requests = [];
  const ui = completedHarness([], {
    saveVehicleChanges: async (draft) => {
      requests.push(structuredClone(draft));
      if (requests.length === 1) {
        await new Promise((resolve) => { release = resolve; });
        exactRetry = { ...structuredClone(draft), requestId: uuid(990) };
        throw { code: "unknown_outcome", retryDraft: exactRetry };
      }
      return { status: "saved", replayed: true, assetVersion: 5,
        entityVersions: { completed: { [uuid(900)]: 1 } } };
    },
  });
  await ui.settle();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Stable synthetic create" } });
  ui.render();
  const submit = ui.button("Save Changes").props.onClick;
  const first = submit();
  await submit();
  assert.equal(requests.length, 1);
  release();
  await first;
  await ui.settle();
  assert.equal(ui.input("vehicles-completed-description").props.disabled, true);
  assert.equal(ui.button("Cancel Changes").props.disabled, true);
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.deepEqual(requests[1], exactRetry);
  assert.equal(requests[1].completedOperations[0].id, uuid(900));
});

test("Completed confirmed-save reconciliation retains returned versions when workspace refresh fails", async () => {
  let loads = 0;
  const ui = completedHarness([completedRecord()], {
    loadVehicleWorkspace: async () => {
      if (loads++ > 0) throw Error("Synthetic read failure");
      return { ...workspace(assets[0], []), completedServiceRecords: [completedRecord()] };
    },
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      return { status: "saved", assetVersion: 5, entityVersions: { completed: { [uuid(701)]: 8 } } };
    },
  });
  await ui.settle();
  openCompleted(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Confirmed synthetic work" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.match(ui.text(), /saved, but the latest workspace could not be reloaded/);
  assert.match(ui.text(), /Confirmed synthetic work/);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.input("vehicles-completed-mechanic").props.onChange({ target: { value: "Synthetic other shop" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[1].expectedAssetVersion, 5);
  assert.equal(ui.calls.saves[1].completedOperations[0].expectedVersion, 8);
});

test("Completed, Recommended, and Ongoing share one changed-only atomic save", async () => {
  const ui = completedHarness([completedRecord()]);
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic ongoing shop" } });
  ui.render();
  openRecommended(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Synthetic recommended work" } });
  ui.render();
  openCompleted(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Synthetic completed work" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  const draft = ui.calls.saves[0];
  assert.equal(draft.completedOperations.length, 1);
  assert.equal(draft.recommendedOperations.length, 1);
  assert.equal(draft.ongoingOperations.length, 1);
  assert.deepEqual(draft.intervalOperations, []);
  assert.deepEqual(draft.maintenanceItemOperations, []);
  assert.equal(draft.keyInformationOperation, null);
});

test("Completed hours and none-usage assets preserve domain units without a catalog relationship", async () => {
  for (const unit of ["hours", "none"]) {
    const asset = { ...assets[0], usageUnit: unit };
    const source = completedRecord(701, { usageReadingUnit: unit, usageReadingValue: unit === "none" ? null : 125.5 });
    const ui = completedHarness([source], { loadVehicleWorkspace: async () => ({
      ...workspace(asset, []), completedServiceRecords: [source],
    }) });
    await ui.settle();
    openCompleted(ui);
    if (unit === "hours") assert.match(ui.text(), /Hours/);
    ui.button("Edit").props.onClick();
    ui.render();
    assert.equal(Boolean(ui.input("vehicles-completed-usage")), unit !== "none");
    assert.equal(ui.input("vehicles-completed-description").props.maxLength, "10000");
    assert.equal(ui.input("vehicles-completed-mechanic").props.maxLength, "160");
    assert.equal(ui.calls.catalogReads, 0);
    assert.equal(ui.button("Bullets").props["aria-label"], "Toggle bullets");
    ui.input("vehicles-completed-description").props.onChange({ target: { value: "Synthetic unit-specific service" } });
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.deepEqual(ui.calls.saves[0].completedOperations, [{ action: "update", id: uuid(701), expectedVersion: 7,
      serviceDescription: "Synthetic unit-specific service" }]);
  }
});

test("Completed renders multiline historical content safely, with labels and no direct mutation boundary", async () => {
  const description = "Annual maintenance completed.\n\n\u2022 Changed engine oil\n\u2022 Replaced oil filter\n\n<script>literal text</script>";
  const ui = completedHarness([completedRecord(701, { serviceDescription: description })]);
  await ui.settle();
  openCompleted(ui);
  const content = ui.find((node) => node.props?.["aria-label"] === "Completed Service Description");
  assert.equal(ui.text(content), description);
  assert.equal(content.props.dangerouslySetInnerHTML, undefined);
  assert.equal(ui.nodes(content).some((node) => node.type === "script"), false);
  ui.button("Edit").props.onClick();
  ui.render();
  for (const id of ["vehicles-completed-date", "vehicles-completed-usage", "vehicles-completed-mechanic", "vehicles-completed-description"]) {
    assert(ui.find((node) => node.type === "label" && node.props.htmlFor === id));
  }
  const source = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx"), "utf8");
  assert.doesNotMatch(source, /\.from\s*\(|\.rpc\s*\(|dangerouslySetInnerHTML/);
  assert.match(source, /draft\.completedOperations\.push/);
});

test("Completed actual service mappers and uncertain transport preserve plain text, stable IDs, and exact replay", async () => {
  const loadSource = (file) => fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const { parseDateOnly } = vm.runInNewContext(`(() => {
    ${loadSource("src/services/vehiclesMaintenanceIntervalEngine.js")}; return { parseDateOnly };
  })()`);
  const { createVehiclesDataAccess, VehiclesDataAccessError } = vm.runInNewContext(`(() => {
    ${loadSource("src/services/vehiclesDataAccess.js")}; return { createVehiclesDataAccess, VehiclesDataAccessError };
  })()`);
  const { createVehiclesService, mapHistoryRow } = vm.runInNewContext(`(() => {
    ${loadSource("src/services/vehiclesService.js")}; return { createVehiclesService, mapHistoryRow };
  })()`, { parseDateOnly, createVehiclesDataAccess, VehiclesDataAccessError,
    crypto: { randomUUID: () => uuid(990) },
    getSupabaseClient: () => { throw Error("No production client in Completed tests"); },
  });
  const requests = [];
  const client = {
    from() { throw Error("Completed save must not issue table writes"); },
    rpc(name, payload) {
      assert.equal(name, "save_vehicles_changes");
      requests.push(structuredClone(payload));
      if (requests.length === 1) return Promise.reject({ code: "ECONNRESET" });
      const request = payload.p_request;
      return Promise.resolve({ error: null, data: {
        ok: true, request_id: request.request_id, asset_id: request.asset_id, asset_version: 5, replayed: true,
        entity_versions: { completed: { [uuid(900)]: 1 } }, created_ids: { completed: [uuid(900)] },
        deleted_ids: {}, affected_asset_versions: {},
      } });
    },
  };
  const description = "Annual maintenance completed.\n\n\u2022 Changed engine oil\n\u2022 Replaced oil filter\n\nLiteral <b>text</b> stays plain.";
  const mapped = mapHistoryRow({ id: uuid(900), service_date: "2026-04-04", usage_reading_unit: "none",
    usage_reading_value: null, mechanic: null, version: 1, service_description: description }, "completed");
  assert.equal(mapped.serviceDescription, description);
  const service = createVehiclesService(() => client);
  let unknown;
  try {
    await service.saveVehicleChanges({ assetId: uuid(1), expectedAssetVersion: 4, completedOperations: [{
      action: "create", id: mapped.id, serviceDate: mapped.serviceDate, usageReadingUnit: "none",
      usageReadingValue: null, mechanic: null, serviceDescription: mapped.serviceDescription,
    }] });
  } catch (error) { unknown = error; }
  assert.equal(unknown.code, "unknown_outcome");
  assert.equal(unknown.retryDraft.requestId, uuid(990));
  assert.equal(unknown.retryDraft.completedOperations[0].id, uuid(900));
  const result = await service.saveVehicleChanges(unknown.retryDraft);
  assert.equal(result.replayed, true);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[0].p_request.completed_operations[0].service_description, description);
  assert.equal(requests[0].p_request.recommended_operations, undefined);
  assert.equal(requests[0].p_request.ongoing_operations, undefined);
  assert.equal(requests[0].p_request.interval_operations, undefined);
});

test("Completed shared-save errors remain accessible while viewing Intervals or Key Information", async () => {
  const ui = completedHarness();
  await ui.settle();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  for (const section of ["intervals", "key-information"]) {
    ui.find((node) => node.props?.["data-vehicles-section"] === section).props.onClick();
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert(ui.nodes().some((node) => node.props?.role === "alert" && ui.text(node).includes("Review Completed Service")));
    assert.equal(ui.calls.saves.length, 0);
  }
});

test("Completed bullets share the approved current-line, multiline, blank-line and mixed-prefix behavior", async () => {
  const scenarios = [
    { source: "Replaced oil filter", start: 5, end: 5, expected: "\u2022 Replaced oil filter", selection: [7, 7] },
    { source: "\u2022 Replaced oil filter", start: 5, end: 5, expected: "Replaced oil filter", selection: [3, 3] },
    { source: "Replaced oil filter\nChanged engine oil\nInspected air filter",
      expected: "\u2022 Replaced oil filter\n\u2022 Changed engine oil\n\u2022 Inspected air filter" },
    { source: "\u2022 Replaced oil filter\n\u2022 Changed engine oil\n\u2022 Inspected air filter",
      expected: "Replaced oil filter\nChanged engine oil\nInspected air filter" },
    { source: "Replaced oil filter\n\nChanged engine oil\n  \nInspected air filter",
      expected: "\u2022 Replaced oil filter\n\n\u2022 Changed engine oil\n  \n\u2022 Inspected air filter" },
    { source: "\u2022 Replaced oil filter\nChanged engine oil\n\u2022 Inspected air filter",
      expected: "\u2022 Replaced oil filter\n\u2022 Changed engine oil\n\u2022 Inspected air filter" },
  ];
  for (const scenario of scenarios) {
    const ui = completedHarness([completedRecord(701, { serviceDescription: scenario.source })]);
    await ui.settle();
    openCompleted(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    const editor = ui.attachDescriptionEditor(scenario.start ?? 0, scenario.end ?? scenario.source.length,
      "vehicles-completed-description");
    editor.selectionDirection = "backward";
    ui.button("Bullets").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-completed-description").props.value, scenario.expected);
    assert.equal(editor.insertions, 1);
    assert.equal(editor.selectionDirection, "backward");
    assert(editor.selectionStart >= 0 && editor.selectionEnd <= scenario.expected.length);
    if (scenario.selection) assert.deepEqual([editor.selectionStart, editor.selectionEnd], scenario.selection);
    assert.equal(editor.scrollTop, 25);
    assert.equal(ui.calls.saves.length, 0);
  }
});

test("Completed and Recommended use one native bullet handler without intercepting textarea keyboard history", async () => {
  const source = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx"), "utf8");
  assert.equal((source.match(/function toggleDescriptionBullets\(/g) || []).length, 1);
  assert.equal((source.match(/function toggleEditorBullets\(/g) || []).length, 1);
  assert.match(source, /toggleEditorBullets\(recommendedDescriptionRef\.current/);
  assert.match(source, /toggleEditorBullets\(completedDescriptionRef\.current/);
  const ui = completedHarness([completedRecord()]);
  await ui.settle();
  openCompleted(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  const textarea = ui.input("vehicles-completed-description");
  for (const handler of ["onKeyDown", "onKeyUp", "onBeforeInput", "onPaste", "onCopy"]) {
    assert.equal(textarea.props[handler], undefined);
  }
  const button = ui.button("Bullets");
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-label"], "Toggle bullets");
  assert.match(button.props.className, /descriptionBullets/);
});

test("Completed bullet transforms count prefixes and reject over-limit text atomically without truncation", async () => {
  for (const [description, expected] of [
    ["X".repeat(9998), "\u2022 " + "X".repeat(9998)],
    ["X".repeat(9999), null],
    ["X".repeat(9996) + "\nY", null],
    ["\u2022 " + "X".repeat(9998), "X".repeat(9998)],
  ]) {
    const ui = completedHarness([completedRecord(701, { serviceDescription: description })]);
    await ui.settle();
    openCompleted(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    const editor = ui.attachDescriptionEditor(0, description.length, "vehicles-completed-description");
    ui.button("Bullets").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-completed-description").props.value, expected ?? description);
    assert.equal(editor.insertions, expected === null ? 0 : 1);
    assert.equal(ui.input("vehicles-completed-description").props.maxLength, "10000");
    if (expected === null) {
      assert.equal(editor.selectionStart, 0);
      assert.equal(editor.selectionEnd, description.length);
      assert(ui.nodes().some((node) => node.props?.role === "alert" && ui.text(node).includes("10,000-character")));
      assert.equal(ui.button("Save Changes").props.disabled, true);
    }
  }
});

test("Completed mixed prose and bullets survive Add, all-section traversal and exact create mapping", async () => {
  const initial = "Annual maintenance completed.\n\nChanged engine oil\nReplaced oil filter\nInspected air filter\n\nVehicle tested normally afterward.";
  const expected = "Annual maintenance completed.\n\n\u2022 Changed engine oil\n\u2022 Replaced oil filter\n\u2022 Inspected air filter\n\nVehicle tested normally afterward.";
  const ui = completedHarness();
  await ui.settle();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  ui.input("vehicles-completed-date").props.onChange({ target: { value: "2026-04-04" } });
  ui.input("vehicles-completed-usage").props.onChange({ target: { value: "456.25" } });
  ui.input("vehicles-completed-mechanic").props.onChange({ target: { value: "Synthetic workshop" } });
  ui.input("vehicles-completed-description").props.onChange({ target: { value: initial } });
  ui.render();
  ui.attachDescriptionEditor(initial.indexOf("Changed"), initial.indexOf("\n\nVehicle"), "vehicles-completed-description");
  ui.button("Bullets").props.onClick();
  ui.render();
  for (const section of ["ongoing", "recommended", "intervals", "key-information", "completed"]) {
    ui.find((node) => node.props?.["data-vehicles-section"] === section).props.onClick();
    ui.render();
  }
  assert.equal(ui.input("vehicles-completed-description").props.value, expected);
  assert.equal(ui.input("vehicles-completed-date").props.value, "2026-04-04");
  assert.equal(ui.input("vehicles-completed-usage").props.value, 456.25);
  assert.equal(ui.input("vehicles-completed-mechanic").props.value, "Synthetic workshop");
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.calls.saves.length, 0);
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].completedOperations, [{ action: "create", id: uuid(900),
    serviceDate: "2026-04-04", usageReadingValue: 456.25, usageReadingUnit: "miles",
    mechanic: "Synthetic workshop", serviceDescription: expected }]);
});

test("Completed saved bullet text reopens exactly, cancels cleanly, and produces only a Description update", async () => {
  const original = "Annual maintenance completed.\n\n\u2022 Changed engine oil\n\u2022 Replaced oil filter\n\nVehicle tested normally afterward.";
  const expected = "Annual maintenance completed.\n\nChanged engine oil\nReplaced oil filter\n\nVehicle tested normally afterward.";
  const ui = completedHarness([completedRecord(701, { serviceDescription: original })]);
  await ui.settle();
  openCompleted(ui);
  const region = () => ui.find((node) => node.props?.["aria-label"] === "Completed Service Description");
  assert.equal(ui.text(region()), original);
  assert.equal(region().props.dangerouslySetInnerHTML, undefined);
  const editAndToggle = () => {
    ui.button("Edit").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-completed-description").props.value, original);
    assert.equal(ui.button("Save Changes").props.disabled, true);
    ui.attachDescriptionEditor(original.indexOf("\u2022"), original.indexOf("\n\nVehicle"), "vehicles-completed-description");
    ui.button("Bullets").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-completed-description").props.value, expected);
  };
  editAndToggle();
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.text(region()), original);
  assert.equal(ui.calls.saves.length, 0);
  editAndToggle();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].completedOperations, [{ action: "update", id: uuid(701), expectedVersion: 7,
    serviceDescription: expected }]);
});

const keyDocumentFixture = () => ({ schemaVersion: 1, blocks: [
  { type: "paragraph", runs: [{ text: "Oil & filter", bold: true }, { text: "", bold: false }] },
  { type: "paragraph", runs: [] },
  { type: "bullet_list", items: [
    [{ text: "Use ", bold: false }, { text: "5W-30", bold: true }, { text: " full synthetic" }],
    [], [{ text: "Replace the filter at every oil change" }],
  ] },
  { type: "paragraph", runs: [{ text: "Notes\nKeep service receipts.", bold: false }] },
] });
const keyNotes = (document = keyDocumentFixture()) => ({ id: uuid(801), document, version: 4 });
const keyLink = (id = 851, overrides = {}) => ({ id: uuid(id), url: "https://example.test/manual",
  displayTitle: "Owner manual", sortOrder: 5, version: 3, ...overrides });
function keyHarness(notes = null, links = [], overrides = {}) {
  return harness({ loadVehicleWorkspace: async () => ({ ...workspace(assets[0], [record(12, "2023-02-27")]),
    keyInformation: notes, links }), ...overrides });
}
function openKeyInformation(ui) {
  ui.find((node) => node.props?.["data-vehicles-section"] === "key-information").props.onClick();
  ui.render();
}
function keyEditor(ui) { return ui.find((node) => node.type === "KeyDocumentEditor"); }
function keyDomElement(name, children = [], style = {}) {
  const node = { nodeType: 1, nodeName: name.toUpperCase(), style, childNodes: children,
    children: children.filter((child) => child.nodeType === 1) };
  for (const child of children) child.parentNode = node;
  return node;
}
function keyDomText(text) { return { nodeType: 3, textContent: text }; }
function keyDocumentDom(document) {
  const runs = (values) => values.map((run) => keyDomElement(run.bold ? "strong" : "span", [keyDomText(run.text)]));
  return keyDomElement("div", document.blocks.map((block) => block.type === "paragraph"
    ? keyDomElement("p", runs(block.runs))
    : keyDomElement("ul", block.items.map((entry) => keyDomElement("li", runs(entry))))));
}

test("Key Information empty state is a singleton asset view with no history, Delete Record, or automatic creation", async () => {
  const ui = keyHarness();
  await ui.settle();
  openKeyInformation(ui);
  assert.match(ui.text(), /No key maintenance information recorded for this asset/);
  assert.match(ui.text(), /No links recorded for this asset/);
  assert(ui.button("Add Key Information"));
  assert.equal(ui.button("Delete Record"), undefined);
  assert.equal(ui.input("vehicles-completed-record"), undefined);
  assert.equal(keyEditor(ui), undefined);
  ui.button("Add Key Information").props.onClick();
  ui.render();
  assert.equal(JSON.stringify(keyEditor(ui).props.value), JSON.stringify({ schemaVersion: 1, blocks: [] }));
  assert.equal(ui.button("Save Changes").props.disabled, true);
  await ui.button("Save Changes").props.onClick();
  assert.equal(ui.calls.saves.length, 0);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(keyEditor(ui), undefined);
});

test("Key Information renders only schema paragraphs, structured bullets, bold runs, and safe clickable titles", async () => {
  const ui = keyHarness(keyNotes(), [keyLink(), keyLink(852, { displayTitle: null, sortOrder: 8 })]);
  await ui.settle();
  openKeyInformation(ui);
  assert.match(ui.text(), /Key Maintenance Information/);
  assert.match(ui.text(), /Links & References/);
  assert(ui.nodes().some((node) => node.type === "strong" && ui.text(node) === "Oil & filter"));
  assert(ui.nodes().some((node) => node.type === "strong" && ui.text(node) === "5W-30"));
  assert.equal(ui.nodes().filter((node) => node.type === "ul").length, 1);
  assert.equal(ui.nodes().filter((node) => node.type === "li").length, 3);
  const anchors = ui.nodes().filter((node) => node.type === "a");
  assert.deepEqual(anchors.map((node) => ui.text(node)), ["Owner manual", "example.test"]);
  assert(anchors.every((node) => node.props.rel === "noopener noreferrer"));
  assert.equal(ui.button("Delete Record"), undefined);
  assert.equal(keyEditor(ui), undefined);
});

test("Key Information document-to-editor serialization is exact for paragraphs, lists, empty items and optional bold flags", () => {
  for (const original of [keyDocumentFixture(), { schemaVersion: 1, blocks: [] },
    { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "", bold: false }] }] }]) {
    const restored = keyDocumentHelpers.readKeyDocument(keyDocumentDom(original), original);
    assert.equal(JSON.stringify(restored), JSON.stringify(original));
  }
  const original = keyDocumentFixture();
  const dom = keyDocumentDom(original);
  dom.childNodes[0] = keyDomElement("p", [keyDomText("Oil & "), keyDomElement("b", [keyDomText("filter")])]);
  const modified = keyDocumentHelpers.readKeyDocument(dom, original);
  assert.equal(modified.blocks[0].runs[1].bold, true);
  assert.equal(modified.blocks[0].runs[1].text, "filter");
  assert.equal(JSON.stringify(modified.blocks.slice(1)), JSON.stringify(original.blocks.slice(1)));
});

test("Key Information native list and bold DOM map to schema-v1, including bold removal and clearing", () => {
  const empty = { schemaVersion: 1, blocks: [] };
  const dom = keyDomElement("div", [keyDomElement("p", [keyDomText("Before")]),
    keyDomElement("ul", [keyDomElement("li", [keyDomText("List "), keyDomElement("strong", [keyDomText("bold")])]),
      keyDomElement("li", [keyDomText("Second")])]), keyDomElement("p", [keyDomText("After")])]);
  const value = keyDocumentHelpers.readKeyDocument(dom, empty);
  assert.equal(value.blocks[1].type, "bullet_list");
  assert.equal(value.blocks[1].items[0][1].bold, true);
  assert.equal(value.blocks[2].runs[0].text, "After");
  const unbold = keyDomElement("div", [keyDomElement("p", [keyDomElement("strong", [
    keyDomText("Still "), keyDomElement("span", [keyDomText("not bold")], { fontWeight: "normal" }),
  ])])]);
  const removed = keyDocumentHelpers.readKeyDocument(unbold, empty);
  assert.equal(removed.blocks[0].runs[0].bold, true);
  assert.equal(removed.blocks[0].runs[1].bold, undefined);
  const cleared = keyDocumentHelpers.readKeyDocument(keyDomElement("div", [keyDomElement("p", [keyDomElement("br")])]), value);
  assert.equal(JSON.stringify(cleared), JSON.stringify(empty));
});

test("Key Information unchanged Edit is an exact no-op; link-only changes do not rewrite the document", async () => {
  const notes = keyNotes();
  const ui = keyHarness(notes, [keyLink()]);
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(JSON.stringify(keyEditor(ui).props.value), JSON.stringify(notes.document));
  assert.equal(ui.button("Save Changes").props.disabled, true);
  await ui.button("Save Changes").props.onClick();
  assert.equal(ui.calls.saves.length, 0);
  ui.input(`vehicles-key-title-${uuid(851)}`).props.onChange({ target: { value: "Updated title" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[0].keyInformationOperation, null);
  assert.deepEqual(ui.calls.saves[0].linkOperations, [{ action: "update", id: uuid(851), expectedVersion: 3,
    displayTitle: "Updated title" }]);
});

test("Key Information creates one exact structured document and untouched collections emit nothing", async () => {
  const ui = keyHarness();
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Add Key Information").props.onClick();
  ui.render();
  keyEditor(ui).props.onChange(keyDocumentFixture());
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  const request = ui.calls.saves[0];
  assert.equal(request.assetId, uuid(1));
  assert.equal(request.expectedAssetVersion, 4);
  assert.deepEqual(request.keyInformationOperation, { action: "create", id: uuid(900), document: keyDocumentFixture() });
  for (const field of ["ongoingOperations", "recommendedOperations", "completedOperations", "intervalOperations", "linkOperations"]) {
    assert.deepEqual(request[field], []);
  }
});

test("Key Information updates and clears through the existing versioned empty-document path without Delete Record", async () => {
  const ui = keyHarness(keyNotes());
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  keyEditor(ui).props.onChange({ schemaVersion: 1, blocks: [] });
  ui.render();
  assert.equal(ui.button("Delete Record"), undefined);
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].keyInformationOperation, { action: "update", id: uuid(801), expectedVersion: 4,
    document: { schemaVersion: 1, blocks: [] } });
});

test("Key Information links can exist independently, append in order, and remove using stable versions", async () => {
  const ui = keyHarness(null, [keyLink(851, { sortOrder: 7 })]);
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.button("Add Link").props.onClick();
  ui.render();
  ui.input(`vehicles-key-url-${uuid(901)}`).props.onChange({ target: { value: "https://example.test/new" } });
  ui.input(`vehicles-key-title-${uuid(901)}`).props.onChange({ target: { value: "New manual" } });
  ui.render();
  ui.find((node) => node.props?.["aria-label"] === "Remove link Owner manual").props.onClick();
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[0].keyInformationOperation, null);
  assert.deepEqual(ui.calls.saves[0].linkOperations, [
    { action: "create", id: uuid(901), url: "https://example.test/new", displayTitle: "New manual", sortOrder: 8 },
    { action: "delete", id: uuid(851), expectedVersion: 3 },
  ]);
});

test("Key Information URL/title validation follows the committed HTTPS and length rules", async () => {
  for (const url of ["http://example.test", "javascript:alert(1)", "/relative", "https://user:pass@example.test",
    "https://example.test\\@evil.test", " https://example.test", "https://example.test/\u0001", "https://example.test/" + "x".repeat(2048)]) {
    const ui = keyHarness(null, [keyLink()]);
    await ui.settle();
    openKeyInformation(ui);
    ui.button("Edit").props.onClick();
    ui.render();
    ui.input(`vehicles-key-url-${uuid(851)}`).props.onChange({ target: { value: url } });
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.equal(ui.calls.saves.length, 0, url);
    assert(ui.nodes().some((node) => node.props?.role === "alert"));
  }
  const ui = keyHarness(null, [keyLink()]);
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input(`vehicles-key-title-${uuid(851)}`).props.onChange({ target: { value: "x".repeat(301) } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 0);
});

test("Key Information applies its aggregate 50,000-unit limit, not the service Description limit", async () => {
  const makeDocument = (text) => ({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text }] }] });
  assert.equal(keyDocumentHelpers.keyDocumentLength(makeDocument("\u{1f600}".repeat(25000))), 50000);
  for (const [length, accepted] of [[10001, true], [50000, true], [50001, false]]) {
    const ui = keyHarness();
    await ui.settle();
    openKeyInformation(ui);
    ui.button("Add Key Information").props.onClick();
    ui.render();
    keyEditor(ui).props.onChange(makeDocument("X".repeat(length)));
    ui.render();
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.equal(ui.calls.saves.length, accepted ? 1 : 0);
  }
});

test("Key Information exact structured draft and links survive every section; Cancel restores both", async () => {
  const original = keyNotes();
  const ui = keyHarness(original, [keyLink()]);
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  const changed = keyDocumentFixture();
  changed.blocks[0].runs.push({ text: " updated", bold: true });
  keyEditor(ui).props.onChange(changed);
  ui.input(`vehicles-key-title-${uuid(851)}`).props.onChange({ target: { value: "Changed title" } });
  ui.render();
  for (const section of ["ongoing", "recommended", "completed", "intervals", "key-information"]) {
    ui.find((node) => node.props?.["data-vehicles-section"] === section).props.onClick();
    ui.render();
  }
  assert.equal(JSON.stringify(keyEditor(ui).props.value), JSON.stringify(changed));
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.value, "Changed title");
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.calls.saves.length, 0);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(JSON.stringify(keyEditor(ui).props.value), JSON.stringify(original.document));
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.value, "Owner manual");
  assert.equal(ui.button("Save Changes").props.disabled, true);
});

test("Key Information shares one atomic save with dated sections without changing intervals", async () => {
  const ui = keyHarness(keyNotes());
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic shop" } });
  ui.render();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  keyEditor(ui).props.onChange({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Updated", bold: true }] }] });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  assert.equal(ui.calls.saves[0].ongoingOperations.length, 1);
  assert.equal(ui.calls.saves[0].keyInformationOperation.expectedVersion, 4);
  assert.deepEqual(ui.calls.saves[0].intervalOperations, []);
});

test("Key Information conflicts preserve documents; unknown saves lock editing and replay exact requests once", async () => {
  let release;
  const requests = [];
  let retry;
  const ui = keyHarness(keyNotes(), [], { saveVehicleChanges: async (draft) => {
    requests.push(structuredClone(draft));
    if (requests.length === 1) {
      await new Promise((resolve) => { release = resolve; });
      retry = { ...structuredClone(draft), requestId: uuid(990) };
      throw { code: "unknown_outcome", retryDraft: retry };
    }
    return { status: "saved", replayed: true, assetVersion: 5, entityVersions: { key_information: { [uuid(801)]: 5 } } };
  } });
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  const changed = { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Stable retry" }] }] };
  keyEditor(ui).props.onChange(changed);
  ui.render();
  const submit = ui.button("Save Changes").props.onClick;
  const pending = submit();
  await submit();
  assert.equal(requests.length, 1);
  release();
  await pending;
  await ui.settle();
  assert.equal(keyEditor(ui).props.disabled, true);
  assert.equal(ui.button("Cancel Changes").props.disabled, true);
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.deepEqual(requests[1], retry);
  assert.deepEqual(requests[1].keyInformationOperation.document, changed);

  const conflicted = keyHarness(keyNotes(), [], { saveVehicleChanges: async () => { throw { code: "version_conflict" }; } });
  await conflicted.settle();
  openKeyInformation(conflicted);
  conflicted.button("Edit").props.onClick();
  conflicted.render();
  keyEditor(conflicted).props.onChange(changed);
  conflicted.render();
  await conflicted.button("Save Changes").props.onClick();
  await conflicted.settle();
  assert.equal(JSON.stringify(keyEditor(conflicted).props.value), JSON.stringify(changed));
  assert.match(conflicted.text(), /changed elsewhere/);
});

test("Key Information cancels stale title lookup and preserves manually entered titles", async () => {
  let finish;
  const ui = keyHarness(null, [keyLink(851, { url: "https://example.com/manual", displayTitle: null })], {
    resolveLinkTitle: () => new Promise((resolve) => { finish = resolve; }),
  });
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  const pending = ui.input(`vehicles-key-url-${uuid(851)}`).props.onBlur();
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  finish({ title: "Late metadata", url: "https://example.com/manual" });
  await pending;
  await ui.settle();
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.value, "");
  const lookup = ui.input(`vehicles-key-url-${uuid(851)}`).props.onBlur();
  ui.input(`vehicles-key-title-${uuid(851)}`).props.onChange({ target: { value: "Manual title" } });
  ui.render();
  finish({ title: "Retrieved title", url: "https://example.com/manual" });
  await lookup;
  await ui.settle();
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.value, "Manual title");
});

test("Key Information uses Slide 6's bounded 65/35 regions, stacked mobile flow and accessible controls", async () => {
  const ui = keyHarness(keyNotes(), [keyLink()]);
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  assert(ui.find((node) => node.type === "label" && node.props.htmlFor === `vehicles-key-url-${uuid(851)}`));
  assert(ui.find((node) => node.type === "label" && node.props.htmlFor === `vehicles-key-title-${uuid(851)}`));
  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(css, /\.keyRegions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.85fr\) minmax\(0, 1fr\)/s);
  assert.match(css, /\.keyDocument ul\s*\{[^}]*padding-inline-start:\s*var\(--lm-space-4\)/s);
  assert.match(css.slice(css.indexOf("@media (max-width: 600px)")), /\.keyRegions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*height:\s*auto/s);
  const source = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx"), "utf8");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.rpc\s*\(|\.from\s*\(/);
});

test("Key Information actual service round trip retains exact document schema, runs and list structure", () => {
  const loadSource = (file) => fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const { mapKeyInformation, mapSaveRequest, cloneKeyDocument } = vm.runInNewContext(`(() => {
    ${loadSource("src/services/vehiclesService.js")}; return { mapKeyInformation, mapSaveRequest, cloneKeyDocument };
  })()`, { getSupabaseClient: () => { throw Error("No production client in Key Information tests"); } });
  const persisted = { id: uuid(801), asset_id: uuid(1), document: keyDocumentFixture(), version: 4 };
  const mapped = mapKeyInformation(persisted);
  const edited = keyDocumentHelpers.readKeyDocument(keyDocumentDom(mapped.document), mapped.document);
  const request = mapSaveRequest({ assetId: uuid(1), expectedAssetVersion: 4,
    keyInformationOperation: { action: "update", id: mapped.id, expectedVersion: mapped.version, document: edited },
  }, uuid(990));
  assert.equal(JSON.stringify(request.key_information_operation.document), JSON.stringify(persisted.document));
  const remapped = mapKeyInformation({ ...persisted, document: request.key_information_operation.document, version: 5 });
  assert.equal(JSON.stringify(remapped.document), JSON.stringify(persisted.document));
  const nearLimit = { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "\u{1f600}".repeat(25000), bold: true }] }] };
  assert.equal(JSON.stringify(cloneKeyDocument(nearLimit)), JSON.stringify(nearLimit));
  assert.throws(() => cloneKeyDocument({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "X".repeat(50001) }] }] }));
  assert.throws(() => cloneKeyDocument({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "<b>HTML</b>" }] }] }));
  assert.equal(request.link_operations, undefined);
});

test("Key Information confirmed-save fallback retains notes/link versions and clearing removes only notes", async () => {
  let loads = 0;
  const ui = keyHarness(keyNotes(), [keyLink()], {
    loadVehicleWorkspace: async () => {
      if (loads++ > 0) throw Error("Synthetic refresh failure");
      return { ...workspace(assets[0], []), keyInformation: keyNotes(), links: [keyLink()] };
    },
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      return { status: "saved", assetVersion: 5, entityVersions: {
        key_information: { [uuid(801)]: 5 }, links: { [uuid(851)]: 4 },
      } };
    },
  });
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  const changed = { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Confirmed", bold: true }] }] };
  keyEditor(ui).props.onChange(changed);
  ui.input(`vehicles-key-title-${uuid(851)}`).props.onChange({ target: { value: "Confirmed title" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.match(ui.text(), /saved, but the latest workspace could not be reloaded/);
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  assert.equal(JSON.stringify(keyEditor(ui).props.value), JSON.stringify(changed));
  keyEditor(ui).props.onChange({ schemaVersion: 1, blocks: [] });
  ui.input(`vehicles-key-title-${uuid(851)}`).props.onChange({ target: { value: "Another title" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[1].expectedAssetVersion, 5);
  assert.equal(ui.calls.saves[1].keyInformationOperation.expectedVersion, 5);
  assert.equal(ui.calls.saves[1].linkOperations[0].expectedVersion, 4);
  assert.match(ui.text(), /No key maintenance information/);
  assert.match(ui.text(), /Another title/);
  assert.equal(ui.button("Delete Record"), undefined);
});

test("Key Information best-effort title lookup updates only an eligible link in the active session", async () => {
  const ui = keyHarness(keyNotes(), [keyLink(851, { displayTitle: null })], {
    resolveLinkTitle: async (url) => ({ url, title: "Retrieved manual title" }),
  });
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  await ui.input(`vehicles-key-url-${uuid(851)}`).props.onBlur();
  await ui.settle();
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.value, "Retrieved manual title");
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[0].keyInformationOperation, null);
  assert.deepEqual(ui.calls.saves[0].linkOperations, [{ action: "update", id: uuid(851), expectedVersion: 3,
    displayTitle: "Retrieved manual title" }]);
});

test("Key Information title lookup cannot mutate a frozen unknown-outcome save request", async () => {
  let finishTitle;
  const requests = [];
  let retry;
  const ui = keyHarness(null, [keyLink(851, { displayTitle: null })], {
    resolveLinkTitle: () => new Promise((resolve) => { finishTitle = resolve; }),
    saveVehicleChanges: async (draft) => {
      requests.push(structuredClone(draft));
      if (requests.length === 1) {
        retry = { ...structuredClone(draft), requestId: uuid(990) };
        throw { code: "unknown_outcome", retryDraft: retry };
      }
      return { status: "saved", replayed: true, assetVersion: 5, entityVersions: {} };
    },
  });
  await ui.settle();
  openKeyInformation(ui);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input(`vehicles-key-url-${uuid(851)}`).props.onChange({ target: { value: "https://example.test/updated" } });
  ui.render();
  const pendingTitle = ui.input(`vehicles-key-url-${uuid(851)}`).props.onBlur();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  finishTitle({ url: "https://example.test/updated", title: "Late metadata" });
  await pendingTitle;
  await ui.settle();
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.value, "");
  assert.equal(ui.input(`vehicles-key-title-${uuid(851)}`).props.disabled, true);
  assert.equal(keyEditor(ui).props.disabled, true);
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.deepEqual(requests[1], retry);
  assert.deepEqual(requests[1].linkOperations, [{ action: "update", id: uuid(851), expectedVersion: 3,
    url: "https://example.test/updated" }]);
});

test("Interval table projection uses only the latest qualifying performed Ongoing item for Miles, Hours, and Months", () => {
  const maintenanceItemId = uuid(301);
  const ongoingRecords = [
    record(701, "2024-01-31", {
      usageReadingValue: 1000, capturedItems: [item(301, "Oil Change", true)],
    }),
    record(702, "2025-03-31", {
      usageReadingValue: 9000, capturedItems: [item(301, "Oil Change", false)],
    }),
    record(703, "2025-02-28", {
      usageReadingValue: 7000, capturedItems: [item(301, "Oil Change", true)],
    }),
  ];
  const milesWorkspace = workspace(assets[0], ongoingRecords);
  const miles = intervalHelpers.intervalProjection(milesWorkspace, maintenanceItemId, "5000", "miles");
  assert.equal(miles.lastService.recordId, uuid(703));
  assert.equal(miles.lastService.serviceDate, "2025-02-28");
  assert.equal(JSON.stringify(miles.nextService), JSON.stringify({ kind: "usage", value: 12000, unit: "miles" }));
  assert.equal(JSON.stringify(intervalHelpers.lastServiceLabel(miles.lastService)), JSON.stringify({
    value: "7,000 mi · 2/28/2025", detail: "",
  }));
  assert.equal(JSON.stringify(intervalHelpers.nextServiceLabel(miles)), JSON.stringify({ value: "12,000 mi", detail: "" }));

  const hoursWorkspace = workspace(assets[1], [record(704, "2025-06-15", {
    usageReadingValue: 100, usageReadingUnit: "hours",
    capturedItems: [item(301, "Oil Change", true)],
  })]);
  assert.equal(JSON.stringify(intervalHelpers.intervalProjection(hoursWorkspace, maintenanceItemId, "25", "hours").nextService),
    JSON.stringify({ kind: "usage", value: 125, unit: "hours" }));
  const months = intervalHelpers.intervalProjection(milesWorkspace, maintenanceItemId, "1", "months");
  assert.equal(JSON.stringify(months.nextService), JSON.stringify({ kind: "date", serviceDate: "2025-03-28" }));
  const noHistory = intervalHelpers.intervalProjection(workspace(assets[0], []), maintenanceItemId, "5000", "miles");
  assert.equal(noHistory.lastService, null);
  assert.equal(noHistory.nextService, null);
  assert.equal(noHistory.notCalculatedReason, "no_qualifying_service");
});

test("Maintenance Intervals section reads the inline table and derives Last and Next Service", async () => {
  const intervalEntry = interval(601, 301, {
    assetId: uuid(1),
    maintenanceItemName: "Oil Change",
  });
  const serviceRecord = record(602, "2026-02-01", {
    usageReadingValue: 99555,
    capturedItems: [item(301, "Oil Change", true)],
  });
  const ui = harness({ initialIntervals: [intervalEntry], loadVehicleWorkspace: async () => ({
    ...workspace(assets[0], [serviceRecord], [catalogItem(301, { displayName: "Oil Change" })], [intervalEntry]),
    maintenanceItemCatalog: [catalogItem(301, { displayName: "Oil Change" })],
  }) });
  await ui.settle();
  ui.find((node) => node.props?.["data-vehicles-section"] === "intervals").props.onClick();
  ui.render();
  const panel = ui.find((node) => node.props?.id === "vehicles-section-panel");
  assert.equal(panel.props["aria-label"], "Maintenance Intervals");
  assert.match(ui.text(panel), /Oil Change/);
  assert.match(ui.text(panel), /5,000 mi/);
  assert.match(ui.text(panel), /99,555 mi · 2\/1\/2026/);
  assert.match(ui.text(panel), /104,555 mi/);
  assert(ui.button("+ New Service"));
  assert.equal(ui.intervalDialog.open, false);
  assert.equal(ui.calls.saves.length, 0);
});

test("Workspace selects newest history and preserves historical snapshots and true/false states", async () => {
  const ui = harness();
  await ui.settle();
  assert.equal(ui.calls.workspaces[0], uuid(1));
  assert.match(ui.text(), /2026-02-01/);
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert(ui.button("Edit"));
  const checkboxes = ui.nodes().filter((node) => node.type === "input" && node.props.type === "checkbox");
  assert.deepEqual(checkboxes.map((node) => [node.props["aria-label"], node.props.checked]), [
    ["Performed: Historical item", true],
    ["Performed: Second snapshot", false],
  ]);
  assert.doesNotMatch(ui.text(), /Current applicable item/);
  assert.equal(ui.find((node) => node.type === "dialog" && node.props["aria-labelledby"] === "vehicles-confirm-title")
    .props["aria-labelledby"], "vehicles-confirm-title");
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
  assert(ui.button("Add Ongoing Record"));
  assert(ui.button("Delete Record"), "persisted selected records expose Delete Record in the action row");
  await ui.button("Add Ongoing Record").props.onClick();
  ui.render();
  assert.equal(ui.calls.templates, 1);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.button("Delete Record"), undefined, "new drafts are not deletable until persisted");
  assert.equal(ui.input("vehicles-usage-unit").props.value, "hours");
  assert.equal(ui.input("vehicles-mechanic").props.maxLength, "160");
  assert.deepEqual(ui.nodes().filter((node) => node.type === "input" && node.props.type === "checkbox")
    .map((node) => [node.props["aria-label"], node.props.checked]), [
      ["Performed: Current applicable item", false],
    ]);
  assert.match(ui.text(), /New draft/);
});

test("Edit renders historical checklist groups from captured snapshots without catalog matching", async () => {
  const capturedItems = [
    item(212, "Renamed Oil", true, "routine"),
    item(214, "Legacy Plug", false, "components_other"),
    item(213, "Brake Fluid", false, "fluids_drivetrain"),
    item(211, "Zinc Filter", false, "routine"),
  ];
  const ui = harness({
    loadVehicleWorkspace: async (assetId) => workspace(
      assets.find((asset) => asset.id === assetId),
      [record(12, "2026-02-01", { capturedItems })],
      [],
    ),
  });
  await ui.settle();

  const groups = ui.nodes().filter((node) => node.type === "section"
    && node.props.className === "itemGroup");
  assert.deepEqual(groups.map((group) => ui.text(ui.nodes(group).find((node) => node.type === "h4"))), [
    "Routine", "Fluids & Drivetrain", "Components & Other",
  ]);
  const groupItems = groups.map((group) => ui.nodes(group)
    .filter((node) => node.type === "input" && node.props.role === "switch")
    .map((node) => ({
      name: node.props["aria-label"].replace("Performed: ", ""),
      performed: node.props.checked,
    })));
  assert.deepEqual(groupItems, [
    [{ name: "Renamed Oil", performed: true }, { name: "Zinc Filter", performed: false }],
    [{ name: "Brake Fluid", performed: false }],
    [{ name: "Legacy Plug", performed: false }],
  ]);
  assert.equal(ui.calls.saves.length, 0);
});

test("Ongoing checklist groups stored snapshots and preserves IDs, states, and payload in Add mode", async () => {
  const templateItems = [
    item(204, "Spark Plugs", false, "components_other"),
    item(203, "Oil Filter", false, "routine"),
    item(202, "Brake Fluid", false, "fluids_drivetrain"),
    item(201, "Oil Change", false, "routine"),
  ];
  const ui = harness({
    createOngoingMaintenanceDraftTemplate: async (assetId) => ({
      assetId,
      usageReadingUnit: "miles",
      items: structuredClone(templateItems),
    }),
  });
  await ui.settle();
  assert(ui.button("Add Ongoing Record"));
  await ui.button("Add Ongoing Record").props.onClick();
  ui.render();

  const groups = ui.nodes().filter((node) => node.type === "section"
    && node.props.className === "itemGroup");
  assert.deepEqual(groups.map((group) => ui.text(ui.nodes(group).find((node) => node.type === "h4"))), [
    "Routine", "Fluids & Drivetrain", "Components & Other",
  ]);
  const itemsByGroup = groups.map((group) => ui.nodes(group)
    .filter((node) => node.type === "input" && node.props.role === "switch")
    .map((node) => ({
      name: node.props["aria-label"].replace("Performed: ", ""),
      id: node.props["aria-label"],
      performed: node.props.checked,
    })));
  assert.deepEqual(itemsByGroup.map((group) => group.map((entry) => entry.name)), [
    ["Oil Change", "Oil Filter"], ["Brake Fluid"], ["Spark Plugs"],
  ]);
  assert.equal(new Set(itemsByGroup.flat().map((entry) => entry.name)).size, templateItems.length);
  assert(itemsByGroup.flat().every((entry) => entry.performed === false));

  const oilFilter = ui.nodes().find((node) => node.type === "input"
    && node.props["aria-label"] === "Performed: Oil Filter");
  oilFilter.props.onChange({ target: { checked: true } });
  ui.render();
  const form = ui.find((node) => node.type === "form" && node.props.id === "vehicles-edit-form");
  await form.props.onSubmit({ preventDefault() {} });
  await ui.settle();

  assert.equal(ui.calls.saves.length, 1);
  assert.deepEqual(ui.calls.saves[0].ongoingOperations[0].items, [
    {
      maintenanceItemId: uuid(204), isPerformed: false,
      displayNameSnapshot: "Spark Plugs", groupSnapshot: "components_other",
    },
    {
      maintenanceItemId: uuid(203), isPerformed: true,
      displayNameSnapshot: "Oil Filter", groupSnapshot: "routine",
    },
    {
      maintenanceItemId: uuid(202), isPerformed: false,
      displayNameSnapshot: "Brake Fluid", groupSnapshot: "fluids_drivetrain",
    },
    {
      maintenanceItemId: uuid(201), isPerformed: false,
      displayNameSnapshot: "Oil Change", groupSnapshot: "routine",
    },
  ]);
});

test("Ongoing layout has compact desktop rows, full grouped content, and unbounded checklist flow", async () => {
  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(css, /\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(11rem,\s*0\.45fr\)\s+minmax\(0,\s*3\.55fr\)/s);
  assert.match(css, /\.fields\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.recordSummary\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.itemGroups\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.itemGroups\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.itemGroups\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.fields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.recordSummary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.itemToggle\s*\{[^}]*min-height:\s*36px/s);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.itemToggle\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/);
  assert.match(css, /\.itemToggle\s+:global\(\.lm-checkbox\):focus-visible\s*~\s*\.switchTrack\s*\{[^}]*outline:/s);
  const checklistRule = css.match(/\.items\s*\{([^}]*)\}/s)?.[1] || "";
  assert.doesNotMatch(checklistRule, /max-height|overflow-y:\s*auto/);
  assert.doesNotMatch(css, /\.itemGroup(List)?\s*\{[^}]*overflow-y:\s*auto/s);

  const fordAsset = { ...assets[0], name: "Ford Expedition", usageUnit: "miles" };
  const fordItems = [
    ["routine", ["Air Filter", "Cabin Filter", "Fuel Filter", "Oil Change", "Oil Filter", "Tire Rotation", "Tires", "Wiper Refills"]],
    ["fluids_drivetrain", ["A/C Refrigerant", "Brake Fluid", "Coolant", "Front Differential", "P/S Fluid", "Rear Differential", "Trans Fluid & Filter", "Transfer Case"]],
    ["components_other", ["Battery", "MAF", "PCV Valve", "Spark Plugs", "T-Body"]],
  ].flatMap(([group, names], groupIndex) => names.map((name, itemIndex) => item(
    400 + groupIndex * 20 + itemIndex,
    name,
    ["Fuel Filter", "Oil Change", "Oil Filter", "Tire Rotation", "Spark Plugs"].includes(name),
    group,
  )));
  const ui = harness({
    initialAssets: [fordAsset],
    loadVehicleWorkspace: async () => workspace(fordAsset, [record(12, "2023-02-27", {
      usageReadingValue: 81513,
      mechanic: "G&L Automotive",
      capturedItems: fordItems,
    })]),
    createOngoingMaintenanceDraftTemplate: async (assetId) => ({
      assetId,
      usageReadingUnit: "miles",
      items: fordItems.map((entry) => ({ ...entry, isPerformed: false })),
    }),
  });
  await ui.settle();

  const summary = ui.find((node) => node.type === "dl" && String(node.props.className).includes("recordSummary"));
  assert.equal(summary.children.length, 3);
  assert.match(ui.text(summary), /2023-02-27/);
  assert.match(ui.text(summary), /81,513 miles/);
  assert.match(ui.text(summary), /G&L Automotive/);
  const recordList = ui.find((node) => node.props?.["aria-label"] === "Ongoing Maintenance records");
  const navigationEntries = ui.nodes(recordList).filter((node) => node.type === "button"
    && String(node.props.className).includes("recordButton"));
  assert.deepEqual(navigationEntries.map((node) => ui.text(node)), ["2023-02-27"]);
  assert.doesNotMatch(ui.text(navigationEntries[0]), /81513|miles|hours|G&L Automotive/i);
  const groupNodes = ui.nodes().filter((node) => node.type === "section" && node.props.className === "itemGroup");
  assert.deepEqual(groupNodes.map((group) => ui.text(ui.nodes(group).find((node) => node.type === "h4"))), [
    "Routine", "Fluids & Drivetrain", "Components & Other",
  ]);
  const savedSwitches = ui.nodes().filter((node) => node.type === "input" && node.props.role === "switch");
  assert.equal(savedSwitches.length, 21);
  assert.equal(new Set(savedSwitches.map((node) => node.props["aria-label"])).size, 21);
  assert.equal(savedSwitches.filter((node) => node.props.checked).length, 5);

  enterOngoingEdit(ui);
  const form = ui.find((node) => node.type === "form" && node.props.id === "vehicles-edit-form");
  const editRow = form.children.find((node) => node.type === "div"
    && String(node.props.className).split(/\s+/).includes("fields"));
  assert.equal(editRow.children.length, 3);
  assert.equal(editRow.children[0].props.htmlFor, "vehicles-service-date");
  assert.equal(editRow.children[1].props.role, "group");
  assert.equal(editRow.children[2].props.htmlFor, "vehicles-mechanic");
  assert(ui.input("vehicles-usage-unit"));
  assert(ui.input("vehicles-usage-value"));
  assert.equal(ui.nodes().filter((node) => node.type === "input" && node.props.role === "switch").length, 21);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.calls.saves.length, 0);

  await ui.button("Add Ongoing Record").props.onClick();
  ui.render();
  const addStatus = ui.find((node) => node.props?.role === "status" && ui.text(node).includes("New Ongoing record"));
  assert(addStatus);
  assert.match(addStatus.props.className, /visuallyHidden/);
  const addForm = ui.find((node) => node.type === "form" && node.props.id === "vehicles-edit-form");
  const addRow = addForm.children.find((node) => node.type === "div"
    && String(node.props.className).split(/\s+/).includes("fields"));
  assert.equal(addRow.children.length, 3);
  assert.equal(ui.nodes().filter((node) => node.type === "input" && node.props.role === "switch").length, 21);
  assert.equal(ui.calls.saves.length, 0);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.calls.saves.length, 0);

  const noUsageAsset = { ...fordAsset, usageUnit: "none" };
  const noUsageUi = harness({
    initialAssets: [noUsageAsset],
    loadVehicleWorkspace: async () => workspace(noUsageAsset, [record(13, "2026-02-01", {
      usageReadingValue: null,
      usageReadingUnit: "none",
      mechanic: "No Usage Shop",
    })]),
    createOngoingMaintenanceDraftTemplate: async (assetId) => ({
      assetId,
      usageReadingUnit: "none",
      items: [item(500, "Engine Oil", false)],
    }),
  });
  await noUsageUi.settle();
  const noUsageSummary = noUsageUi.find((node) => node.type === "dl"
    && String(node.props.className).includes("recordSummary"));
  assert.equal(noUsageSummary.children.length, 2);
  await noUsageUi.button("Add Ongoing Record").props.onClick();
  noUsageUi.render();
  const noUsageForm = noUsageUi.find((node) => node.type === "form" && node.props.id === "vehicles-edit-form");
  const noUsageRow = noUsageForm.children.find((node) => node.type === "div"
    && String(node.props.className).split(/\s+/).includes("fields"));
  assert.equal(noUsageRow.children.length, 2);
  assert.equal(noUsageUi.input("vehicles-usage-unit"), undefined);
  assert.equal(noUsageUi.input("vehicles-usage-value"), undefined);
  assert.equal(noUsageUi.calls.saves.length, 0);
});

test("Each Ongoing field or performed-item edit natively locks the shared asset selector until Cancel", async () => {
  for (const [id, value, usageUnit = "miles"] of [
    ["vehicles-service-date", "2026-02-03"],
    ["vehicles-usage-value", "450"],
    ["vehicles-usage-value", "345", "hours"],
    ["vehicles-mechanic", "Synthetic mechanic"],
    [null, false],
  ]) {
    const ui = harness({
      loadVehicleWorkspace: async () => workspace({ ...assets[0], usageUnit },
        [record(12, "2026-02-01", { usageReadingUnit: usageUnit })]),
    });
    await ui.settle();
    const selector = () => ui.input("vehicles-asset-select");
    assert.equal(selector().props.disabled, false);
    assert.equal(selector().props.value, uuid(1));
    assert.equal(ui.text(ui.find((node) => node.type === "label"
      && node.props.htmlFor === "vehicles-asset-select")).startsWith("Vehicle"), true);
    enterOngoingEdit(ui);
    assert.equal(selector().props.disabled, false, "unchanged Edit has no unsaved work");
    const field = id ? ui.input(id) : ui.find((node) => node.props["aria-label"] === "Performed: Historical item");
    field.props.onChange({ target: { value, checked: value } });
    ui.render();
    assert.equal(selector().type, "select");
    assert.equal(selector().props.disabled, true, id || "performed-item toggle");
    assert.equal(selector().props.value, uuid(1));
    assert.equal(ui.shouldBlock(), true);
    ui.button("Cancel Changes").props.onClick();
    ui.render();
    assert.equal(selector().props.disabled, false);
    assert.equal(selector().props.value, uuid(1));
    assert.equal(ui.shouldBlock(), false);
    assert.equal(ui.input("vehicles-service-date"), undefined);
    enterOngoingEdit(ui);
    assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-01");
    assert.equal(ui.input("vehicles-usage-value").props.value, 120);
    assert.equal(ui.input("vehicles-mechanic").props.value, "");
    assert.equal(ui.find((node) => node.props["aria-label"] === "Performed: Historical item").props.checked, true);
    assert.equal(selector().props.disabled, false);
    assert.equal(ui.calls.saves.length, 0);
  }
});

test("Ongoing Add locks its current asset immediately and Cancel removes the untouched draft", async () => {
  const ui = harness();
  await ui.settle();
  ui.input("vehicles-asset-select").props.onChange({ target: { value: uuid(2) } });
  await ui.settle();
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
  await ui.button("Add Ongoing Record").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(2));
  assert.equal(ui.input("vehicles-usage-unit").props.value, "hours");
  assert.equal(ui.shouldBlock(), true);
  assert.equal(ui.button("Delete Record"), undefined);
  const draftDate = ui.input("vehicles-service-date").props.value;
  for (const section of ["recommended", "completed", "intervals", "key-information", "ongoing"]) {
    ui.input("vehicles-section-select").props.onChange({ target: { value: section } });
    ui.render();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert.equal(ui.input("vehicles-asset-select").props.value, uuid(2));
  }
  assert.equal(ui.input("vehicles-service-date").props.value, draftDate);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(2));
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert.match(ui.text(), /No Ongoing Maintenance records/);
  assert.equal(ui.shouldBlock(), false);
  assert.equal(ui.calls.saves.length, 0);
  ui.input("vehicles-asset-select").props.onChange({ target: { value: uuid(1) } });
  await ui.settle();
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
});

test("Every isolated section and a mixed vehicle session use the same dirty asset lock", async () => {
  for (const section of ["ongoing", "recommended", "completed", "intervals", "key-information", "mixed"]) {
    const ui = harness();
    await ui.settle();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
    if (section === "ongoing" || section === "mixed") {
      enterOngoingEdit(ui);
      ui.input("vehicles-mechanic").props.onChange({ target: { value: "Shared dirty session" } });
      ui.render();
    }
    if (section !== "ongoing") {
      ui.input("vehicles-section-select").props.onChange({
        target: { value: section === "mixed" ? "recommended" : section },
      });
      ui.render();
      if (section === "key-information") {
        ui.button("Add Key Information").props.onClick();
        ui.render();
        keyEditor(ui).props.onChange({
          schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Shared note" }] }],
        });
      } else {
        ui.button(section === "completed" ? "Add Completed Service"
          : section === "intervals" ? "+ New Service" : "Add Recommended Service").props.onClick();
      }
      ui.render();
    }
    for (const destination of ["ongoing", "recommended", "completed", "intervals", "key-information"]) {
      ui.input("vehicles-section-select").props.onChange({ target: { value: destination } });
      ui.render();
      assert.equal(ui.input("vehicles-asset-select").props.disabled, true, `${section} at ${destination}`);
      assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
      assert.equal(ui.input("vehicles-section-select").props.disabled, undefined);
      assert.equal(ui.button("Discard and continue"), undefined);
    }
    ui.button("Cancel Changes").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, false, section);
    assert.equal(ui.shouldBlock(), false);
    assert.equal(ui.calls.saves.length, 0);
    assert.equal(ui.calls.workspaces.length, 1);
  }
});

test("Successful synthetic Ongoing create and update reconcile versions and unlock the same asset", async () => {
  for (const action of ["create", "update"]) {
    let stored = [record(12, "2026-02-01")];
    let assetVersion = 4;
    let release;
    const ui = harness({
      loadVehicleWorkspace: async () => workspace({ ...assets[0], version: assetVersion }, structuredClone(stored)),
      saveVehicleChanges: (draft) => {
        ui.calls.saves.push(structuredClone(draft));
        return new Promise((resolve) => {
          release = () => {
            const operation = draft.ongoingOperations[0];
            assetVersion += 1;
            const saved = {
              id: operation.id, serviceDate: operation.serviceDate,
              usageReadingValue: operation.usageReadingValue, usageReadingUnit: operation.usageReadingUnit,
              mechanic: operation.mechanic, capturedItems: structuredClone(operation.items),
              version: (stored.find((entry) => entry.id === operation.id)?.version || 0) + 1,
            };
            stored = [saved];
            resolve({ status: "saved", assetVersion, entityVersions: { ongoing: { [saved.id]: saved.version } } });
          };
        });
      },
    });
    await ui.settle();
    if (action === "create") await ui.button("Add Ongoing Record").props.onClick();
    else enterOngoingEdit(ui);
    ui.render();
    ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic saved mechanic" } });
    ui.render();
    const pending = ui.button("Save Changes").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert.equal(ui.button("Cancel Changes").props.disabled, true);
    release();
    await pending;
    await ui.settle();
    const request = ui.calls.saves[0];
    assert.equal(request.assetId, uuid(1));
    assert.equal(request.expectedAssetVersion, 4);
    assert.equal(request.ongoingOperations.length, 1);
    assert.equal(request.ongoingOperations[0].action, action);
    assert.equal(request.ongoingOperations[0].mechanic, "Synthetic saved mechanic");
    if (action === "update") assert.equal(request.ongoingOperations[0].expectedVersion, 14);
    assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
    assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
    assert.equal(ui.shouldBlock(), false);
    assert.equal(ui.button("Cancel Changes"), undefined);
    assert.match(ui.text(), /Changes saved/);
    enterOngoingEdit(ui);
    assert.equal(ui.input("vehicles-mechanic").props.value, "Synthetic saved mechanic");
    assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
    ui.input("vehicles-mechanic").props.onChange({ target: { value: "Next edit" } });
    ui.render();
    const savedVersion = stored[0].version;
    const nextSave = ui.button("Save Changes").props.onClick();
    release();
    await nextSave;
    await ui.settle();
    assert.equal(ui.calls.saves[1].expectedAssetVersion, 5);
    assert.equal(ui.calls.saves[1].ongoingOperations[0].expectedVersion, savedVersion);
  }
});

test("Edit marks the session dirty; Cancel restores persisted values without an RPC", async () => {
  const ui = harness();
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-03" } });
  ui.render();
  assert(ui.button("Cancel Changes"));
  assert.equal(ui.shouldBlock(), true);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert.match(ui.text(), /2026-02-01/);
  assert.equal(ui.calls.saves.length, 0);
  assert.equal(ui.shouldBlock(), false);
});

test("Save sends only changed Ongoing operations once and reconciles confirmed versions", async () => {
  const ui = harness();
  await ui.settle();
  enterOngoingEdit(ui);
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
  enterOngoingEdit(ui);
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

test("Deleting the sole Ongoing record keeps the page-level Save action available", async () => {
  let ui;
  ui = harness({
    loadVehicleWorkspace: async (assetId) => workspace(
      assets.find((asset) => asset.id === assetId),
      [record(12, "2026-02-01")],
    ),
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      return { status: "saved", assetVersion: 5, entityVersions: { ongoing: { [uuid(12)]: 2 } } };
    },
  });
  await ui.settle();
  ui.button("Delete Record").props.onClick();
  ui.render();
  ui.button("Queue Delete").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert(ui.button("Cancel Changes"));
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].ongoingOperations, [
    { action: "delete", id: uuid(12), expectedVersion: 14 },
  ]);
});

test("A programmatic asset-change event still requires discard despite the natively disabled selector", async () => {
  const ui = harness();
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-04" } });
  ui.render();
  const selector = ui.input("vehicles-asset-select");
  assert.equal(selector.props.disabled, true);
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
  enterOngoingEdit(ui);
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
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert.match(ui.text(), /2026-01-01/);
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
    enterOngoingEdit(ui);
    ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-05" } });
    ui.render();
    await ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    ui.render();
    assert.match(ui.text(), expected);
    assert.doesNotMatch(ui.text(), /raw PostgreSQL detail/);
    assert(ui.button("Cancel Changes"));
    assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-05");
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
    ui.input("vehicles-mechanic").props.onChange({ target: { value: "Corrected draft" } });
    ui.render();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert.equal(ui.button("Cancel Changes").props.disabled, false);
    ui.button("Cancel Changes").props.onClick();
    ui.render();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
    assert.equal(ui.shouldBlock(), false);
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
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.button("Cancel Changes").props.disabled, true);
  assert.equal(ui.input("vehicles-mechanic").props.disabled, true);
  for (const section of ["recommended", "completed", "intervals", "key-information", "ongoing"]) {
    ui.input("vehicles-section-select").props.onChange({ target: { value: section } });
    ui.render();
    assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
    assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  }
  const firstPayload = ui.calls.saves[0];
  assert.equal(firstPayload.ongoingOperations[0].id, uuid(900));
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves[1].requestId, uuid(777));
  assert.equal(ui.calls.saves[1].ongoingOperations[0].id, firstPayload.ongoingOperations[0].id);
  assert.deepEqual(ui.calls.saves[1], attempted);
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
  assert.equal(ui.input("vehicles-asset-select").props.value, uuid(1));
  assert.equal(ui.shouldBlock(), false);
});

test("Unsaved record changes block route navigation and require explicit discard", async () => {
  const ui = harness();
  await ui.settle();
  enterOngoingEdit(ui);
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

test("Maintenance Interval table changes remain pending until one shared multi-collection Save", async () => {
  const existing = interval(401, 301, {
    assetId: uuid(1),
    recommendedInterval: { value: 5000, unit: "miles" },
    comments: "Old comment",
    version: 7,
    lastService: { serviceDate: "2026-02-01", usageReadingValue: 120, usageReadingUnit: "miles" },
    nextService: { kind: "usage", value: 5120, unit: "miles" },
    notCalculatedReason: null,
  });
  const ui = harness({ initialIntervals: [existing] });
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic interval session" } });
  ui.render();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  assert.match(ui.text(), /Last Service/);
  assert.match(ui.text(), /Next Service/);
  ui.input(`vehicles-maintenance-interval-value-${existing.id}`).props.onChange({ target: { value: "7500" } });
  ui.render();
  assert.equal(ui.calls.saves.length, 0, "editing a table cell must not send a request");
  assert(ui.button("Cancel Changes"));
  assert(ui.button("Save Changes"));
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);

  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  assert.deepEqual(ui.calls.saves[0].intervalOperations, [{
    action: "update", id: existing.id, expectedVersion: existing.version, intervalValue: 7500,
  }]);
  assert.equal(ui.calls.saves[0].ongoingOperations[0].mechanic, "Synthetic interval session");
  assert.deepEqual(ui.calls.saves[0].recommendedOperations, []);
  assert.deepEqual(ui.calls.saves[0].completedOperations, []);
});

test("Ongoing, Recommended, Completed and Key Information each save atomically with an Interval edit", async () => {
  const combinations = ["ongoing", "recommended", "completed", "key-information"];
  for (const section of combinations) {
    const existing = interval(401, 301, {
      assetId: uuid(1),
      recommendedInterval: { value: 5000, unit: "miles" },
      version: 7,
    });
    const ui = harness({ initialIntervals: [existing] });
    await ui.settle();
    if (section === "ongoing") {
      enterOngoingEdit(ui);
      ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic mechanic" } });
      ui.render();
    } else if (section === "recommended") {
      openRecommended(ui);
      ui.button("Add Recommended Service").props.onClick();
      ui.render();
      ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Synthetic recommendation" } });
      ui.render();
    } else if (section === "completed") {
      openCompleted(ui);
      ui.button("Add Completed Service").props.onClick();
      ui.render();
      ui.input("vehicles-completed-description").props.onChange({ target: { value: "Synthetic completion" } });
      ui.render();
    } else {
      ui.button("Key Information").props.onClick();
      ui.render();
      ui.button("Add Key Information").props.onClick();
      ui.render();
      keyEditor(ui).props.onChange({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic key note" }] }] });
      ui.render();
    }
    ui.button("Maintenance Intervals").props.onClick();
    ui.render();
    ui.input(`vehicles-maintenance-interval-value-${existing.id}`).props.onChange({ target: { value: "7500" } });
    ui.render();
    assert.equal(ui.calls.saves.length, 0, `${section} plus interval must remain local before Save`);
    await ui.button("Save Changes").props.onClick();
    await ui.settle();
    assert.equal(ui.calls.saves.length, 1, `${section} plus interval must be one atomic request`);
    const request = ui.calls.saves[0];
    assert.equal(request.intervalOperations.length, 1);
    assert.deepEqual(request.intervalOperations[0], {
      action: "update", id: existing.id, expectedVersion: existing.version, intervalValue: 7500,
    });
    assert.equal(request.ongoingOperations.length, section === "ongoing" ? 1 : 0);
    assert.equal(request.recommendedOperations.length, section === "recommended" ? 1 : 0);
    assert.equal(request.completedOperations.length, section === "completed" ? 1 : 0);
    assert.equal(Boolean(request.keyInformationOperation), section === "key-information");
    assert.deepEqual(request.maintenanceItemOperations, []);
    assert.deepEqual(request.availabilityOperations, []);
    assert.deepEqual(request.linkOperations, []);
  }
});

test("One Save atomically commits all historical sections, Key Information and Intervals", async () => {
  const existing = interval(401, 301, {
    assetId: uuid(1), recommendedInterval: { value: 5000, unit: "miles" }, version: 7,
  });
  const ui = harness({ initialIntervals: [existing] });
  await ui.settle();
  enterOngoingEdit(ui);
  ui.input("vehicles-mechanic").props.onChange({ target: { value: "Synthetic mechanic" } });
  ui.render();
  openRecommended(ui);
  ui.button("Add Recommended Service").props.onClick();
  ui.render();
  ui.input("vehicles-recommended-description").props.onChange({ target: { value: "Synthetic recommendation" } });
  ui.render();
  openCompleted(ui);
  ui.button("Add Completed Service").props.onClick();
  ui.render();
  ui.input("vehicles-completed-description").props.onChange({ target: { value: "Synthetic completion" } });
  ui.render();
  ui.button("Key Information").props.onClick();
  ui.render();
  ui.button("Add Key Information").props.onClick();
  ui.render();
  keyEditor(ui).props.onChange({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "Synthetic key note" }] }] });
  ui.render();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.input(`vehicles-maintenance-interval-value-${existing.id}`).props.onChange({ target: { value: "7500" } });
  ui.render();
  assert.equal(ui.calls.saves.length, 0);
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  const request = ui.calls.saves[0];
  assert.equal(request.ongoingOperations.length, 1);
  assert.equal(request.recommendedOperations.length, 1);
  assert.equal(request.completedOperations.length, 1);
  assert(request.keyInformationOperation);
  assert.equal(request.intervalOperations.length, 1);
  assert.deepEqual(request.maintenanceItemOperations, []);
  assert.deepEqual(request.availabilityOperations, []);
  assert.deepEqual(request.linkOperations, []);
});

test("Inline interval Add starts an empty local row with only active applicable unassigned items", async () => {
  const ui = harness({
    initialMaintenanceItems: [
      catalogItem(301),
      catalogItem(302, { availabilityMode: "selected_assets", selectedAssetIds: [uuid(1)] }),
      catalogItem(303, { archivedAt: "2026-01-01T00:00:00Z" }),
      catalogItem(304, { availabilityMode: "selected_assets", selectedAssetIds: [uuid(2)] }),
    ],
  });
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  assert.match(ui.text(), /No Maintenance Intervals are set for this asset/);
  assert(ui.button("+ New Service"));
  ui.button("+ New Service").props.onClick();
  ui.render();
  const input = ui.input(`vehicles-maintenance-interval-item-${uuid(900)}`);
  assert(input);
  const options = input.children.map((node) => ui.text(node));
  assert.deepEqual(options, [
    "Choose a Maintenance Item",
    "Synthetic Maintenance 301",
    "Synthetic Maintenance 302",
  ]);
  assert.doesNotMatch(ui.text(), /Synthetic Maintenance 303|Synthetic Maintenance 304/);
  assert.equal(ui.calls.saves.length, 0);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input(`vehicles-maintenance-interval-item-${uuid(900)}`), undefined);
  assert.equal(ui.calls.saves.length, 0);
});

test("Inline interval create stays local and is committed only by page-level Save Changes", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.button("+ New Service").props.onClick();
  ui.render();
  const id = uuid(900);
  ui.input(`vehicles-maintenance-interval-item-${id}`).props.onChange({ target: { value: uuid(301) } });
  ui.input(`vehicles-maintenance-interval-value-${id}`).props.onChange({ target: { value: "5000" } });
  ui.input(`vehicles-maintenance-interval-unit-${id}`).props.onChange({ target: { value: "miles" } });
  ui.input(`vehicles-maintenance-interval-comments-${id}`).props.onChange({ target: { value: "Synthetic change" } });
  ui.render();
  assert.equal(ui.calls.saves.length, 0);
  assert(ui.button("Cancel Changes"));
  assert(ui.button("Save Changes"));
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  const request = ui.calls.saves[0];
  assert.equal(request.assetId, uuid(1));
  assert.equal(request.expectedAssetVersion, 4);
  assert.deepEqual(request.intervalOperations, [{
    action: "create", id,
    maintenanceItemId: uuid(301),
    intervalValue: 5000,
    intervalUnit: "miles",
    comments: "Synthetic change",
  }]);
  assert.match(ui.text(), /Changes saved/);
  assert.equal(ui.intervalStore.length, 1);
  assert.equal(ui.intervalStore[0].assetId, uuid(1));
});

test("Inline interval edit emits only changed fields with the saved entity version", async () => {
  const existing = interval(401, 301, {
    assetId: uuid(1),
    recommendedInterval: { value: 5000, unit: "miles" },
    comments: "Old comment",
    version: 7,
  });
  const ui = harness({ initialIntervals: [existing] });
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.button("Edit").props.onClick();
  ui.render();
  ui.input(`vehicles-maintenance-interval-value-${existing.id}`).props.onChange({ target: { value: "7500" } });
  ui.input(`vehicles-maintenance-interval-comments-${existing.id}`).props.onChange({ target: { value: "New comment" } });
  ui.render();
  assert.equal(ui.calls.saves.length, 0);
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 1);
  assert.deepEqual(ui.calls.saves[0].intervalOperations[0], {
    action: "update",
    id: existing.id,
    expectedVersion: 7,
    intervalValue: 7500,
    comments: "New comment",
  });
  assert.equal(ui.intervalStore[0].version, 8);
});

test("Shared interval Save validates active item, positive precision and whole months", async () => {
  const ui = harness();
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.button("+ New Service").props.onClick();
  ui.render();
  const id = uuid(900);
  await ui.button("Save Changes").props.onClick();
  ui.render();
  assert.match(ui.text(), /Choose an active Maintenance Item enabled for this asset/);
  ui.input(`vehicles-maintenance-interval-item-${id}`).props.onChange({ target: { value: uuid(301) } });
  ui.input(`vehicles-maintenance-interval-unit-${id}`).props.onChange({ target: { value: "months" } });
  ui.input(`vehicles-maintenance-interval-value-${id}`).props.onChange({ target: { value: "1.5" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  ui.render();
  assert.match(ui.text(), /positive interval value/);
  assert.equal(ui.calls.saves.length, 0);
  ui.input(`vehicles-maintenance-interval-value-${id}`).props.onChange({ target: { value: "12" } });
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].intervalOperations[0], {
    action: "create", id, maintenanceItemId: uuid(301), intervalValue: 12, intervalUnit: "months", comments: null,
  });
});

test("Interval values reverted to baseline emit no operation and shared Cancel restores view state", async () => {
  const existing = interval(401, 301, {
    assetId: uuid(1),
    recommendedInterval: { value: 2500, unit: "hours" },
    comments: "Persisted",
  });
  const ui = harness({ initialIntervals: [existing] });
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.button("Edit").props.onClick();
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  const value = `vehicles-maintenance-interval-value-${existing.id}`;
  const comments = `vehicles-maintenance-interval-comments-${existing.id}`;
  ui.input(value).props.onChange({ target: { value: "3000" } });
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, false);
  ui.input(value).props.onChange({ target: { value: "2500" } });
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, true);
  ui.input(comments).props.onChange({ target: { value: "Temporary" } });
  ui.render();
  assert.equal(ui.button("Save Changes").props.disabled, false);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input(value), undefined);
  assert.match(ui.text(), /2,500 hours/);
  assert.match(ui.text(), /Persisted/);
  assert.equal(ui.calls.saves.length, 0);
});

test("Inline Add defaults hours assets to Hours and unitless assets to Months without saving", async () => {
  for (const [usageUnit, expected] of [["hours", "hours"], ["none", "months"]]) {
    const ui = harness({ initialAssets: [{ ...assets[0], usageUnit }] });
    await ui.settle();
    ui.button("Maintenance Intervals").props.onClick();
    ui.render();
    ui.button("+ New Service").props.onClick();
    ui.render();
    assert.equal(ui.input(`vehicles-maintenance-interval-unit-${uuid(900)}`).props.value, expected);
    assert.equal(ui.calls.saves.length, 0);
    ui.button("Cancel Changes").props.onClick();
    ui.render();
    assert.equal(ui.calls.saves.length, 0);
  }
});

test("Shared interval Save conflict preserves the pending row for cancel or retry", async () => {
  for (const [code, expected] of [
    ["version_conflict", /changed elsewhere/],
    ["item_archived_or_unavailable", /Maintenance Item is no longer available/],
  ]) {
    let ui;
    ui = harness({
      saveVehicleChanges: async (draft) => {
        ui.calls.saves.push(structuredClone(draft));
        throw { code };
      },
    });
    await ui.settle();
    ui.button("Maintenance Intervals").props.onClick();
    ui.render();
    ui.button("+ New Service").props.onClick();
    ui.render();
    const id = uuid(900);
    ui.input(`vehicles-maintenance-interval-item-${id}`).props.onChange({ target: { value: uuid(301) } });
    ui.input(`vehicles-maintenance-interval-value-${id}`).props.onChange({ target: { value: "100" } });
    ui.render();
    await ui.button("Save Changes").props.onClick();
    ui.render();
    assert.match(ui.text(), expected);
    assert.equal(ui.input(`vehicles-maintenance-interval-value-${id}`).props.value, "100");
    assert.equal(ui.calls.saves.length, 1);
    ui.button("Cancel Changes").props.onClick();
    ui.render();
    assert.equal(ui.input(`vehicles-maintenance-interval-value-${id}`), undefined);
  }
});

test("Interval unknown outcome uses the shared lock and replays the exact request with stable client ID", async () => {
  let ui;
  let exactRetry;
  ui = harness({
    saveVehicleChanges: async (draft) => {
      ui.calls.saves.push(structuredClone(draft));
      if (ui.calls.saves.length === 1) {
        exactRetry = { ...structuredClone(draft), requestId: uuid(777) };
        throw { code: "unknown_outcome", retryDraft: exactRetry };
      }
      return { status: "saved", assetVersion: 5, entityVersions: { intervals: {} } };
    },
  });
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.button("+ New Service").props.onClick();
  ui.render();
  const id = uuid(900);
  ui.input(`vehicles-maintenance-interval-item-${id}`).props.onChange({ target: { value: uuid(301) } });
  ui.input(`vehicles-maintenance-interval-value-${id}`).props.onChange({ target: { value: "12.5" } });
  ui.input(`vehicles-maintenance-interval-unit-${id}`).props.onChange({ target: { value: "hours" } });
  ui.render();
  const submit = ui.button("Save Changes").props.onClick;
  const firstAttempt = submit();
  const duplicateAttempt = submit();
  await Promise.all([firstAttempt, duplicateAttempt]);
  ui.render();
  assert.match(ui.text(), /outcome is unknown/);
  assert.equal(ui.calls.saves.length, 1);
  assert.equal(ui.button("Save Changes").props.disabled, true);
  const first = ui.calls.saves[0];
  await ui.button("Retry same save").props.onClick();
  await ui.settle();
  assert.equal(ui.calls.saves.length, 2);
  assert.deepEqual(ui.calls.saves[1], exactRetry);
  assert.deepEqual(ui.calls.saves[1].intervalOperations, first.intervalOperations);
  assert.equal(ui.calls.saves[1].intervalOperations[0].id, id);
  assert.equal(ui.calls.saves[1].intervalOperations[0].id, first.intervalOperations[0].id);
  assert.equal(ui.calls.saves[1].requestId, uuid(777));
  assert.equal(ui.calls.saves[1].intervalOperations[0].intervalValue, 12.5);
});

test("Interval Remove queues a versioned delete and shared Cancel restores the saved row", async () => {
  const existing = interval(401, 301, { assetId: uuid(1), version: 3 });
  const ui = harness({ initialIntervals: [existing] });
  await ui.settle();
  ui.button("Maintenance Intervals").props.onClick();
  ui.render();
  ui.button("Edit").props.onClick();
  ui.render();
  ui.find((node) => node.type === "button"
    && node.props["aria-label"] === "Remove Service Synthetic Maintenance 301").props.onClick();
  ui.render();
  assert.equal(ui.calls.saves.length, 0);
  assert.doesNotMatch(ui.text(), /Synthetic Maintenance 301/);
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.match(ui.text(), /Synthetic Maintenance 301/);
  ui.button("Edit").props.onClick();
  ui.render();
  ui.find((node) => node.type === "button"
    && node.props["aria-label"] === "Remove Service Synthetic Maintenance 301").props.onClick();
  ui.render();
  await ui.button("Save Changes").props.onClick();
  await ui.settle();
  assert.deepEqual(ui.calls.saves[0].intervalOperations, [{
    action: "delete",
    id: existing.id,
    expectedVersion: 3,
  }]);
  assert.equal(ui.intervalStore.length, 0);
});

test("Interval drafts survive all-section traversal and shared Cancel restores both sections", async () => {
  const existing = interval(401, 301, {
    assetId: uuid(1),
    recommendedInterval: { value: 5000, unit: "miles" },
    version: 3,
  });
  const ui = harness({ initialIntervals: [existing] });
  await ui.settle();
  const selectSection = (id) => ui.find((node) => node.props?.["data-vehicles-section"] === id).props.onClick();
  enterOngoingEdit(ui);
  ui.input("vehicles-service-date").props.onChange({ target: { value: "2026-02-05" } });
  ui.render();
  selectSection("intervals");
  ui.render();
  const value = `vehicles-maintenance-interval-value-${existing.id}`;
  ui.input(value).props.onChange({ target: { value: "7500" } });
  ui.render();
  assert.equal(ui.input("vehicles-asset-select").props.disabled, true);
  assert.equal(ui.calls.saves.length, 0);
  for (const section of ["recommended", "completed", "key-information", "ongoing"]) {
    selectSection(section);
    ui.render();
    assert.equal(ui.find((node) => node.props?.["data-vehicles-section"] === section).props["aria-selected"], true);
  }
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-05");
  selectSection("intervals");
  ui.render();
  assert.equal(ui.input(value).props.value, "7500");
  ui.button("Cancel Changes").props.onClick();
  ui.render();
  assert.equal(ui.input(value), undefined);
  assert.equal(ui.input("vehicles-service-date"), undefined);
  assert.equal(ui.input("vehicles-asset-select").props.disabled, false);
  assert.equal(ui.calls.saves.length, 0);
});

test("Manage Maintenance Intervals entry navigates to the inline table and opens no modal", async () => {
  const ui = harness();
  await ui.settle();
  ui.find((node) => node.type === "summary" && node.props["aria-label"] === "Manage")
    .props.onClick({ preventDefault() {} });
  ui.button("Manage Maintenance Intervals").props.onClick();
  ui.render();
  assert.match(ui.text(), /Maintenance Intervals/);
  assert.equal(ui.intervalDialog.open, false);
  assert.equal(ui.button("+ New Service") !== undefined, true);
});

test("Inline Maintenance Interval table uses the shared service save and accessible canonical fields", () => {
  const source = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.jsx"), "utf8");
  const css = fs.readFileSync(path.join(root, "src", "pages", "Vehicles", "VehiclesPage.module.css"), "utf8");
  assert.match(source, /vehiclesService\.saveVehicleChanges\(draft\)/);
  assert.doesNotMatch(source, /\.from\s*\(|\.rpc\s*\(|save_vehicles_changes|vehicle_maintenance_intervals/);
  assert.match(source, /role="table" aria-label=\{`Maintenance Intervals for/);
  assert.match(source, /role="columnheader">Last Service/);
  assert.match(source, /role="columnheader">Next Service/);
  assert.match(source, /aria-label=\{`Interval value \$\{interval\.maintenanceItemName\}`\}/);
  assert.match(source, /aria-label=\{`Interval unit \$\{interval\.maintenanceItemName\}`\}/);
  assert.match(source, /aria-label=\{`Comments \$\{interval\.maintenanceItemName\}`\}/);
  assert.match(source, /intervalOperations\.push\(\.\.\.buildMaintenanceIntervalOperations\(\)\)/);
  assert.doesNotMatch(source, /persistMaintenanceInterval|maintenanceIntervalsDialogRef|>Save<\/button>/);
  assert.match(css, /\.intervalTableBody\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.intervalRow\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
