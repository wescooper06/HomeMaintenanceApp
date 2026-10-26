const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));
function exportsFrom(file, names, context = {}) {
  const code = fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  return vm.runInNewContext(`(() => { ${code}; return {${names.join(",")}}; })()`,
    { structuredClone, ...context });
}

async function editorFixture(request, props = { mode: "create" }) {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Workbench", "ProjectEditor.jsx");
  const source = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function");
  const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic", pragma: "element" } });
  const states = [], calls = [], navigation = [], errors = [];
  let cursor = 0;
  let refCursor = 0;
  const refs = [];
  let failure;
  const { createPlannerDataAccess } = exportsFrom("src\\services\\plannerDataAccess.js", ["createPlannerDataAccess"]);
  const data = createPlannerDataAccess({
    async rpc(name, args) {
      calls.push({ name, args: plain(args) });
      if (failure) return { data: null, error: { message: failure } };
      if (request) return request(args);
      return { data: { ...plain(args.p_project), id: "11111111-1111-4111-8111-111111111111",
        external_id: { home: "PA0210", vehicle: "PB0083", repeating: "PC0009", misc: "PD0005" }[args.p_type] }, error: null };
    },
    from() { throw new Error("Unexpected direct-table creation"); },
  });
  const service = exportsFrom("src\\services\\workbenchService.js", ["createProject", "deleteProject", "canDeleteProject"], {
    plannerStorage: { createProject: data.createProject, deleteProject: data.deleteProject },
  });
  const component = vm.runInNewContext(`(() => { ${code}; return ProjectEditor; })()`, {
    element: (type, attributes, ...children) => ({ type, props: attributes || {}, children: children.flat(Infinity).filter(Boolean) }),
    useNavigate: () => (...args) => navigation.push(args),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef: (initial) => {
      const index = refCursor++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index];
    }, useEffect: () => {}, useId: () => "project-title",
    service, EDIT_OPTIONS: {
      recurrence: ["", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
    }, getEditFields: () => [], styles: { danger: "destructive-red" }, console: { error: (...args) => errors.push(args) },
  });
  let tree;
  function render() {
    cursor = 0;
    refCursor = 0;
    tree = component({ ...props, onDelete: props.mode === "edit"
      ? props.onDelete || (async (project) => { await service.deleteProject(project); navigation.push("deleted"); })
      : undefined });
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of node.children || []) {
      const match = find(predicate, child);
      if (match) return match;
    }
    return null;
  }
  function change(name, value) {
    const node = find((item) => item.props.name === name);
    assert(node, `Missing ${name} control`);
    node.props.onChange({ target: { value, checked: value } });
    render();
  }
  async function submit() {
    find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    await new Promise((resolve) => setImmediate(resolve));
    render();
  }
  render();
  return { change, find, submit, calls, navigation, errors, states,
    fail(message) { failure = message; }, render };
}

for (const source of ["home", "vehicle", "misc"]) {
  test(`unchecked repeating checkbox sends p_type ${source}, never inferred from stale recurrence`, async () => {
    const ui = await editorFixture();
    ui.change("source", source);
    ui.change("title", "Fixture");
    assert.equal(ui.find((node) => node.props.name === "recurrence"), null);
    ui.states[0].recurrence = "weekly";
    await ui.submit();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].args.p_type, source);
    assert(!Object.hasOwn(ui.calls[0].args.p_project, "recurrence"));
    assert(!Object.hasOwn(ui.calls[0].args.p_project.metadata, "recurrence"));
    assert.equal(ui.navigation.length, 1);
  });
}

test("checkbox overrides the non-repeating type and preserves the selected recurrence through the RPC", async () => {
  const ui = await editorFixture();
  ui.change("source", "vehicle");
  ui.change("title", "Repeating fixture");
  ui.change("repeatingProject", true);
  assert.equal(ui.find((node) => node.props.name === "source").props.disabled, true);
  assert.equal(ui.find((node) => node.props.name === "recurrence").props.required, true);
  ui.change("recurrence", "biweekly");
  await ui.submit();
  assert.equal(ui.calls[0].name, "create_workbench_project");
  assert.equal(ui.calls[0].args.p_type, "repeating");
  assert.equal(ui.calls[0].args.p_project.recurrence, "biweekly");
  assert.equal(ui.states[0].source, "vehicle");
});

test("unchecking hides and clears recurrence and restores the non-repeating type", async () => {
  const ui = await editorFixture();
  ui.change("source", "misc");
  ui.change("title", "Normal fixture");
  ui.change("repeatingProject", true);
  ui.change("recurrence", "monthly");
  ui.change("repeatingProject", false);
  assert.equal(ui.states[0].recurrence, "");
  assert.equal(ui.find((node) => node.props.name === "recurrence"), null);
  assert.equal(ui.find((node) => node.props.name === "source").props.disabled, false);
  await ui.submit();
  assert.equal(ui.calls[0].args.p_type, "misc");
});

test("missing recurrence, invalid type and RPC failures never navigate to a success state", async () => {
  const ui = await editorFixture();
  ui.change("title", "Fixture");
  ui.change("repeatingProject", true);
  await ui.submit();
  assert.equal(ui.calls.length, 0);
  assert.match(ui.find((node) => node.props.role === "alert").children.join(""), /Recurrence is required/);
  ui.change("recurrence", "weekly");
  ui.fail("Denied fixture");
  await ui.submit();
  assert.equal(ui.navigation.length, 0);
  assert.match(ui.find((node) => node.props.role === "alert").children.join(""), /Denied fixture/);
  for (const source of ["", "repeatable", "recurring", "unknown", "repeating"]) {
    const invalid = await editorFixture();
    invalid.change("title", "Invalid source");
    invalid.states[0].source = source;
    await invalid.submit();
    assert.equal(invalid.calls.length, 0);
    assert.equal(invalid.navigation.length, 0);
    assert(invalid.find((node) => node.props.role === "alert"));
  }
});

test("service rejects missing source and non-boolean repeating controls explicitly", async () => {
  const service = exportsFrom("src\\services\\workbenchService.js", ["createProject"], {
    plannerStorage: { createProject() { throw new Error("Unexpected write"); } },
  });
  await assert.rejects(service.createProject({ title: "Missing type", repeatingProject: true }), /valid project type/);
  for (const repeatingProject of ["true", "false", 1, null]) {
    await assert.rejects(service.createProject({ source: "home", title: "Invalid boolean", repeatingProject }), /must be a boolean/);
  }
});

test("the actual checkbox create flow inserts only into projects_repeating and is visible through the saved live view", async () => {
  const { PGlite } = require("@electric-sql/pglite");
  const { schema } = require("./fixtures/workbench-live-schema.cjs");
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(schema);
    await db.exec(fs.readFileSync(path.join(root, "supabase", "review", "202610250001_project_creation.sql"), "utf8"));
    await db.exec("set role anon");
    const ui = await editorFixture(async ({ p_type, p_project }) => {
      const { rows } = await db.query("select public.create_workbench_project($1, $2::jsonb) as project",
        [p_type, JSON.stringify(p_project)]);
      return { data: rows[0].project, error: null };
    });
    ui.change("title", "Recycle");
    ui.change("repeatingProject", true);
    ui.change("recurrence", "weekly");
    await ui.submit();
    assert.equal(ui.errors.length, 0);
    assert.equal(ui.navigation.length, 1);
    const { rows } = await db.query("select id, external_id, recurrence, project_type from public.projects_all");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].project_type, "repeating");
    assert.equal(rows[0].external_id, "PC0009");
    assert.equal(rows[0].recurrence, "weekly");
    assert.match(rows[0].id, /^[0-9a-f-]{36}$/i);
    for (const kind of ["home", "vehicle", "misc"]) {
      assert.equal((await db.query(`select * from public.projects_${kind}`)).rows.length, 0);
    }
    assert.equal((await db.query("select id from public.projects_repeating")).rows[0].id, rows[0].id);
    const verified = (await db.query(`select r.id,
      a.external_id = r.external_id as external_identity_matches,
      a.recurrence = r.recurrence as recurrence_matches
      from public.projects_repeating r join public.projects_all a
        on a.id = r.id and a.project_type = 'repeating'
      where r.id = $1`, [rows[0].id])).rows;
    assert.equal(verified.length, 1);
    assert.equal(verified[0].id, rows[0].id);
    assert.equal(verified[0].external_identity_matches, true);
    assert.equal(verified[0].recurrence_matches, true);
  } finally {
    await db.close();
  }
});

test("missing persisted identities cannot produce a successful create navigation", async () => {
  for (const data of [null, { id: "uuid-only" }, { external_id: "PC0009" }]) {
    const ui = await editorFixture(async () => ({ data, error: null }));
    ui.change("title", "Unpersisted fixture");
    ui.change("repeatingProject", true);
    ui.change("recurrence", "weekly");
    await ui.submit();
    assert.equal(ui.navigation.length, 0);
    assert(ui.find((node) => node.props.role === "alert"));
  }
});

for (const source of ["home", "vehicle", "repeating", "misc"]) {
  test(`persisted ${source} exposes red project deletion, cancellation is write-free and double confirmation sends one RPC`, async () => {
    const project = { id: "11111111-1111-4111-8111-111111111111", source, title: "Exact persisted fixture" };
    let finish;
    const ui = await editorFixture(() => new Promise((resolve) => { finish = resolve; }), { mode: "edit", project });
    const button = () => ui.find((node) => node.type === "button" && node.children.includes("Delete Project"));
    assert.equal(button().props.className, "destructive-red");
    button().props.onClick();
    ui.render();
    const dialog = ui.find((node) => node.props.role === "alertdialog");
    const text = JSON.stringify(dialog);
    assert.match(text, /Exact persisted fixture/);
    assert.match(text, /weekly records/);
    assert(text.includes(project.id));
    ui.find((node) => node.type === "button" && node.children.includes("Cancel")).props.onClick();
    ui.render();
    assert.equal(ui.calls.length, 0);
    button().props.onClick();
    ui.render();
    const confirm = button().props.onClick;
    confirm();
    confirm();
    ui.render();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].name, "delete_workbench_project");
    assert.deepEqual(ui.calls[0].args, { p_id: project.id, p_type: source });
    assert.equal(ui.navigation.length, 0);
    assert.equal(button().props.disabled, true);
    finish({ data: { deleted: true, id: project.id, external_id: "stable",
      project_type: source, table: `projects_${source}`,
      counts: { [`projects_${source}`]: 1, planner_tasks: 1, planner_weekly_tasks: 2, planner_parking_lot: 0 } }, error: null });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(ui.navigation, ["deleted"]);
  });
}

test("create/draft editors never expose deletion; failed confirmed deletion stays open without success", async () => {
  const create = await editorFixture();
  assert.equal(create.find((node) => node.children.includes("Delete Project")), null);
  const draft = await editorFixture(undefined, { mode: "edit", project: { id: "draft", source: "home" } });
  assert.equal(draft.find((node) => node.children.includes("Delete Project")), null);
  const ui = await editorFixture(async () => ({ error: { message: "Active remote notification blocks deletion" } }),
    { mode: "edit", project: { id: "11111111-1111-4111-8111-111111111111", source: "home", title: "Keep visible" } });
  const button = () => ui.find((node) => node.type === "button" && node.children.includes("Delete Project"));
  button().props.onClick();
  ui.render();
  button().props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  ui.render();
  assert.equal(ui.navigation.length, 0);
  assert(ui.find((node) => node.props.role === "alertdialog"));
  assert.match(JSON.stringify(ui.find((node) => node.props.role === "alert")), /Active remote/);
});

test("Workbench card delete is adjacent/red, opens the shared confirmation without navigation, and preserves commit safeguards", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const filename = path.join(root, "src", "pages", "Workbench", "WorkbenchPage.jsx");
  const source = fs.readFileSync(filename, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function");
  const { code } = await transformWithOxc(source, filename, { jsx: { runtime: "classic", pragma: "element" } });
  const project = { id: "11111111-1111-4111-8111-111111111111", source: "home", title: "Persisted" };
  let projects = [project], deleteCalls = 0, readCalls = 0, fail = true, release;
  const deleted = [], navigation = [];
  const storage = {
    getCachedProjects: () => null, setCachedProjects: () => {},
    getProjects: async () => { readCalls += 1; return projects; },
    getTaskManager: async () => [],
    deleteProject: async (selected) => {
      deleted.push(plain(selected));
      deleteCalls += 1;
      if (fail) throw new Error("Keep project: denied");
      await new Promise((resolve) => { release = resolve; });
      projects = [];
    },
  };
  const service = exportsFrom("src\\services\\workbenchService.js",
    ["loadWorkbench", "getFilterOptions", "reconcileFilters", "filterProjects", "groupTasks",
      "number", "clean", "sourceTag", "deleteProject", "canDeleteProject"], { plannerStorage: storage });
  const states = [], refs = [];
  let cursor, refCursor, effect, tree;
  const Editor = () => {};
  const component = vm.runInNewContext(`(() => {${code}; return WorkbenchPage;})()`, {
    element: (type, attributes, ...children) => ({ type, props: attributes || {},
      children: children.flat(Infinity).filter(Boolean) }),
    useNavigate: () => (...args) => navigation.push(args), service,
    styles: { action: "action", danger: "danger", projectDelete: "projectDelete" }, ProjectEditor: Editor,
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
    },
    useRef(initial) { const i = refCursor++; return refs[i] || (refs[i] = { current: initial }); },
    useEffect(callback) { if (!effect) effect = callback; }, console,
  });
  function render() { cursor = 0; refCursor = 0; tree = component(); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of node.children) { const match = find(predicate, child); if (match) return match; }
    return null;
  }
  render();
  effect();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  await find((node) => node.type === "button" && node.children.includes("Edit Details")).props.onClick();
  render();
  assert.equal(find((node) => node.type === Editor).props.deleteOnly, false);
  const actions = find((node) => node.children.some((child) =>
    child?.type === "button" && child.children.includes("Add to Task Manager")));
  assert.deepEqual(actions.children.map((node) => node.children[0]),
    ["Edit Details", "Add to Task Manager", "Delete Project"]);
  const cardDelete = actions.children[2];
  assert.equal(cardDelete.props.className, "action danger projectDelete");
  let prevented = 0, stopped = 0;
  const event = { preventDefault() { prevented += 1; }, stopPropagation() { stopped += 1; } };
  cardDelete.props.onClick(event);
  render();
  const props = find((node) => node.type === Editor).props;
  assert.equal(props.deleteOnly, true);
  assert.deepEqual(plain(props.project), project);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(navigation.length, 0);
  const cancelled = await editorFixture(undefined, props);
  assert.match(JSON.stringify(cancelled.find((node) => node.props.role === "alertdialog")), /Persisted/);
  cancelled.find((node) => node.type === "button" && node.children.includes("Cancel")).props.onClick();
  render();
  assert.equal(find((node) => node.type === Editor), null);
  assert.equal(deleteCalls, 0);
  assert.equal(cancelled.calls.length, 0);

  cardDelete.props.onClick(event);
  render();
  const confirmation = await editorFixture(undefined, find((node) => node.type === Editor).props);
  const confirm = () => confirmation.find((node) => node.type === "button" && node.children.includes("Delete Project"));
  confirm().props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  confirmation.render();
  render();
  assert(find((node) => node.type === Editor));
  assert.equal(states[0].projects.length, 1);
  assert.match(JSON.stringify(confirmation.find((node) => node.props.role === "alert")), /denied/);
  fail = false;
  const doubleClick = confirm().props.onClick;
  doubleClick();
  doubleClick();
  assert.equal(deleteCalls, 2);
  assert.equal(states[0].projects.length, 1);
  assert.equal(readCalls, 1);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  assert.equal(find((node) => node.type === Editor), null);
  assert.equal(states[0].projects.length, 0);
  assert.equal(readCalls, 2);
  assert.equal(deleteCalls, 2);
  assert.deepEqual(deleted, [project, project]);
  for (const invalid of [
    { id: "draft", source: "home" },
    { id: "00000000-0000-0000-0000-000000000000", source: "home" },
    { id: project.id, source: "unknown" },
  ]) {
    states[0] = { projects: [invalid], tasks: [] };
    states[1] = { ...states[1], source: [], category: [], projectState: [] };
    render();
    assert(find((node) => node.type === "button" && node.children.includes("Add to Task Manager")));
    assert.equal(find((node) => node.type === "button" && node.children.includes("Delete Project")), null);
  }
});

for (const source of ["home", "vehicle", "repeating", "misc"]) {
  test(`card-initiated ${source} confirmation uses the existing one-RPC editor path`, async () => {
    const project = { id: "11111111-1111-4111-8111-111111111111", source, title: `Card ${source}` };
    const ui = await editorFixture(async () => ({ data: {
      deleted: true, id: project.id, project_type: source, external_id: "opaque",
      table: `projects_${source}`, counts: { [`projects_${source}`]: 1,
        planner_tasks: 0, planner_weekly_tasks: 0, planner_parking_lot: 0 },
    } }), { mode: "edit", project, deleteOnly: true });
    assert.equal(ui.find((node) => node.type === "form"), null);
    const dialog = JSON.stringify(ui.find((node) => node.props.role === "alertdialog"));
    assert(dialog.includes(project.title));
    assert(dialog.includes(project.id));
    assert.match(dialog, /permanently deleted/);
    const confirm = ui.find((node) => node.type === "button" && node.children.includes("Delete Project")).props.onClick;
    confirm();
    confirm();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(ui.calls, [{ name: "delete_workbench_project", args: { p_id: project.id, p_type: source } }]);
    assert.deepEqual(ui.navigation, ["deleted"]);
  });
}

test("project deletion eligibility requires a non-nil persisted UUID and an exact canonical type", () => {
  const { canDeleteProject } = exportsFrom("src\\services\\workbenchService.js", ["canDeleteProject"]);
  const id = "11111111-1111-4111-8111-111111111111";
  for (const source of ["home", "vehicle", "repeating", "misc"]) {
    assert.equal(canDeleteProject({ id, source }), true);
  }
  for (const project of [null, {}, { id: "draft", source: "home" },
    { id: "00000000-0000-0000-0000-000000000000", source: "home" },
    { id }, { id, source: "projects_home" }, { id, source: "unknown", external_id: "PA0211" }]) {
    assert.equal(canDeleteProject(project), false);
  }
  const css = fs.readFileSync(path.join(root, "src", "pages", "Workbench", "WorkbenchPage.module.css"), "utf8");
  assert.match(css, /\.action\.projectDelete\s*\{[^}]*background:\s*#b91c1c;[^}]*color:\s*#fff;/);
  assert.match(css, /\.actions\s*\{[^}]*flex-wrap:\s*wrap;/);
});
