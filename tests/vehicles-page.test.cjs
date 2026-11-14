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
  let service = {
    listAssets: async () => {
      calls.listAssets += 1;
      return structuredClone(assetStore);
    },
    loadVehicleWorkspace: async (assetId) => {
      calls.workspaces.push(assetId);
      return workspace(assetStore.find((asset) => asset.id === assetId), assetId === uuid(1)
        ? [record(12, "2026-02-01"), record(11, "2026-01-01")]
        : []);
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
      return { status: "saved", assetVersion: 5, entityVersions: { ongoing: {} } };
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
  const focusCounts = { managedName: 0, manageButton: 0, maintenanceItemName: 0, maintenanceItemButton: 0 };
  const context = {
    element: (type, props, ...children) => {
      const renderedChildren = (children.length ? children : [props?.children]).flat(Infinity)
        .filter((child) => child !== null && child !== undefined && child !== false);
      if (typeof type === "function") return type({ ...props, children: renderedChildren });
      return { type, props: props || {}, children: renderedChildren };
    },
    fragment: "fragment",
    PageHeader: ({ id, title, subtitle, actions }) => ({
      type: "header", props: { id }, children: [title, subtitle, actions].filter(Boolean),
    }),
    styles: new Proxy({}, { get: (_target, key) => String(key) }),
    vehiclesService: service,
    createVehicleChangesDraft: (...args) => service.createVehicleChangesDraft(...args),
    buildRecordDeleteOperation: (...args) => service.buildRecordDeleteOperation(...args),
    crypto: { randomUUID: () => uuid(nextRecordId++) },
    document: { activeElement: { focus() {} } },
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
    manageDialog, maintenanceDialog, focusCounts, assetStore,
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
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-01");
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

test("Manage Maintenance Items shows an empty catalog and creates a local All Assets draft through the service", async () => {
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
  assert.equal(request.availabilityMode, "all_assets");
  assert.equal(request.currentAssetId, null);
  assert.deepEqual(request.selectedAssetIds, []);
  assert.match(ui.text(), /Synthetic oil change/);
  assert.match(ui.text(), /Active/);
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
  const ui = harness({ initialMaintenanceItems: [] });
  await ui.settle();
  ui.button("Manage Maintenance Items").props.onClick();
  ui.render();
  await ui.settle();
  ui.button("Add Maintenance Item").props.onClick();
  ui.render();
  ui.input("vehicles-maintenance-item-name").props.onChange({ target: { value: "Synthetic selected item" } });
  ui.render();
  const applicability = ui.input("vehicles-maintenance-item-applicability");
  applicability.props.onChange({ target: { value: "selected_assets" } });
  ui.render();
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
  ui.input(`vehicles-maintenance-item-asset-${uuid(1)}`).props.onChange({ target: { checked: true } });
  ui.render();
  ui.input(`vehicles-maintenance-item-asset-${uuid(2)}`).props.onChange({ target: { checked: true } });
  ui.render();
  ui.input("vehicles-maintenance-item-group").props.onChange({ target: { value: "components_other" } });
  ui.render();
  const form = ui.find((node) => node.type === "form" && node.props.className?.includes("maintenanceItemForm"));
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(ui.calls.catalogSaves.length, 1);
  assert.equal(ui.calls.catalogSaves[0].availabilityMode, "selected_assets");
  assert.deepEqual(ui.calls.catalogSaves[0].selectedAssetIds, [uuid(1), uuid(2)]);
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
  ui.button("Cancel").props.onClick();
  ui.render();
  assert.equal(ui.input("vehicles-maintenance-item-name").props.value, "Synthetic Maintenance 301");
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
  assert.equal(ui.input("vehicles-service-date").props.value, "2026-02-01");

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
