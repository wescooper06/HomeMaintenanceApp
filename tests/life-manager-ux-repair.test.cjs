const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const navigation = read("src", "components", "layout", "MainNavigation.module.css");
const foundation = read("src", "components", "layout", "lifeManagerFoundation.css");
const mainApplication = read("src", "components", "layout", "MainApplication.jsx");
const router = read("src", "router", "LifeManagerRouter.jsx");
const workbench = read("src", "pages", "Workbench", "WorkbenchPage.jsx");
const workbenchStyles = read("src", "pages", "Workbench", "WorkbenchPage.module.css");
let compiledWorkbench;

test.before(async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Workbench", "WorkbenchPage.jsx");
  const source = workbench.replace(/^import .*;\r?$/gm, "")
    .replace(/^export default /gm, "").replace(/^export /gm, "");
  compiledWorkbench = (await transformWithOxc(source, file, {
    jsx: { runtime: "classic", pragma: "element" },
  })).code;
});

test("all Life Manager destinations share a fixed navigation shell and geometry", () => {
  assert.match(mainApplication, /<div className=\{styles\.frame\}>[\s\S]*<MainNavigation active=\{route\} \/>/);
  assert.match(router, /<div className=\{navigationStyles\.frame\}>[\s\S]*<MainNavigation active="trips" \/>/);
  assert.match(router, /<div className=\{navigationStyles\.frame\}>[\s\S]*<MainNavigation active="workbench" \/>/);
  assert.match(navigation, /height:\s*var\(--lm-navigation-height/);
  assert.match(navigation, /flex:\s*0 0 var\(--lm-navigation-height/);
  assert.match(navigation, /flex-wrap:\s*nowrap/);
  assert.match(navigation, /align-items:\s*center/);
  assert.match(navigation, /overflow-x:\s*auto/);
  assert.match(foundation, /--lm-navigation-height:\s*56px/);
  assert.match(foundation, /--lm-navigation-height:\s*60px/);
  assert.match(foundation, /html\s*\{\s*scrollbar-gutter:\s*stable/);
  assert.match(read("src", "components", "layout", "mainApplication.css"),
    /html\[data-vite-page\] #root[\s\S]*padding:\s*var\(--lm-root-padding\)/);
  assert.match(read("trips", "src", "index.css"),
    /html\[data-vite-page="trips"\] #root[\s\S]*padding:\s*var\(--lm-root-padding/);

  const planner = read("src", "pages", "Planner", "PlannerPage.jsx");
  const calendar = read("src", "pages", "Calendar", "CalendarPage.jsx");
  assert.doesNotMatch(planner, /data-main-nav|navigation=\{navigation\}/);
  assert.doesNotMatch(calendar, /data-main-nav/);
  const plannerStyles = read("src", "pages", "Planner", "PlannerPage.module.css");
  assert.match(plannerStyles, /\.plannerScreen\s*\{[^}]*padding:\s*var\(--lm-space-6\)/);
  assert.match(plannerStyles, /\.planner-top-panels\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(read("src", "pages", "Calendar", "CalendarPage.module.css"), /\.calendar-screen\s*\{[^}]*margin-top/);
  assert.match(read("trips", "src", "index.css"), /h1:not\(\.lm-page-title\)/);
});

test("module page headings use the shared header hierarchy and responsive spacing", () => {
  const headers = [
    ["src", "pages", "Dashboard", "DashboardPage.jsx"],
    ["src", "pages", "Workbench", "WorkbenchPage.jsx"],
    ["src", "pages", "Planner", "components", "PlannerHeader.jsx"],
    ["src", "pages", "Calendar", "components", "CalendarHeader.jsx"],
    ["src", "pages", "ActivityPlanner", "DailyActivityPlanner.jsx"],
    ["src", "pages", "Meals", "MealsPage.jsx"],
    ["src", "pages", "Trips", "TripsHome.jsx"],
    ["src", "pages", "Trips", "TimelineView.jsx"],
    ["src", "pages", "Trips", "PrioritizeTrips.jsx"],
    ["src", "pages", "Trips", "NewTrip.jsx"],
    ["src", "pages", "Trips", "TripDetails.jsx"],
    ["src", "pages", "Workbench", "ProjectEditor.jsx"],
  ];
  for (const file of headers) assert.match(read(...file), /<PageHeader\b/, file.join("\\"));
  assert.match(foundation, /\.lm-page-header\s*\{[^}]*align-items:\s*center/);
  assert.match(foundation, /\.lm-page-title\s*\{[^}]*font-size:\s*var\(--lm-font-page-title\)/);
  assert.match(foundation, /--lm-font-page-title:\s*28px/);
  assert.match(foundation, /\.lm-page-header--modal\s*\{[^}]*margin:\s*0/);
  assert.match(foundation, /@media \(max-width:\s*600px\)[\s\S]*\.lm-page-header\s*\{[^}]*flex-direction:\s*column/);
  assert.match(read("src", "pages", "Trips", "TimelineView.css"), /\.timeline-page h1:not\(\.lm-page-title\)/);
  assert.match(read("src", "pages", "Trips", "NewTrip.jsx"), /<main className="new-trip-page">[\s\S]*<PageHeader/);
  assert.match(read("trips", "src", "index.css"), /\.new-trip-page\s*\{[^}]*padding:\s*24px/);
  assert.match(read("src", "pages", "Meals", "MealsPage.module.css"),
    /\.meals\s*\{[^}]*max-width:\s*none[^}]*padding:\s*0 24px/);
  assert.match(read("src", "pages", "Calendar", "CalendarPage.module.css"),
    /@media \(max-width:\s*600px\)[\s\S]*\.calendar-screen\s*\{[^}]*margin-top:\s*0[^}]*padding:\s*7px 7px/);
  assert.match(read("src", "pages", "ActivityPlanner", "DailyActivityPlanner.module.css"),
    /@media \(max-width:\s*600px\)[\s\S]*\.page\s*\{[^}]*padding:\s*8px/);
  assert.match(read("trips", "src", "index.css"),
    /@media \(max-width:\s*480px\)[\s\S]*\.new-trip-page\s*\{[^}]*padding:\s*8px/);
  assert.match(read("src", "pages", "Trips", "TimelineView.css"),
    /@media \(max-width:\s*480px\)\s*\{\s*\.timeline-page\s*\{ padding:\s*8px/);
});

test("Workbench filters dismiss outside and on Escape without losing selection or reflowing", () => {
  assert.match(workbench, /const \[openFilter, setOpenFilter\] = useState\(null\)/);
  assert.match(workbench, /document\.addEventListener\("pointerdown", dismissOutside\)/);
  assert.match(workbench, /details\.current\?\.contains\(event\.target\)/);
  assert.match(workbench, /document\.addEventListener\("keydown", dismissEscape\)/);
  assert.match(workbench, /event\.key !== "Escape"/);
  assert.match(workbench, /summaryElement\.current\?\.focus\(\)/);
  assert.match(workbench, /setOpenFilter\(\(current\) => current === key \? null : key\)/);
  assert.match(workbench, /checked=\{selected\.includes\(value\)\}/);
  assert.match(workbench, /onChange=\{\(event\) =>\s*onChange\(event\.target\.checked \? \[\.\.\.selected, value\] : selected\.filter\(\(item\) => item !== value\)\)/);
  assert.match(workbenchStyles, /\.multiSelectOptions\s*\{\s*display:\s*none/);
  assert.match(workbenchStyles, /\.multiSelect\[open\] \.multiSelectOptions\s*\{\s*position:\s*absolute/);
});

test("Workbench filter interaction preserves selection, dismisses correctly, and switches filters", () => {
  const slots = [];
  const pendingEffects = [];
  const listeners = new Map();
  const inside = {};
  let index = 0;
  let focused = 0;
  let openFilter = null;
  let selected = ["Home"];

  const context = {
    document: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    },
    element(type, props, ...children) {
      const node = { type, props: props || {}, children: children.flat(Infinity).filter((child) =>
        child !== null && child !== undefined && child !== false) };
      if (type === "details" && node.props.ref) {
        node.props.ref.current = { contains: (target) => target === inside };
      }
      if (type === "summary" && node.props.ref) {
        node.props.ref.current = { focus: () => { focused += 1; } };
      }
      return node;
    },
    styles: { filterField: "filter-field", multiSelect: "multi-select", multiSelectOptions: "options" },
    useRef(value) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: value };
      return slots[slot];
    },
    useEffect(effect, dependencies) {
      const slot = index++;
      const current = slots[slot];
      if (!current || dependencies.some((value, i) => value !== current.dependencies[i])) {
        pendingEffects.push(() => {
          current?.cleanup?.();
          slots[slot] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const MultiSelect = vm.runInNewContext(`(() => { ${compiledWorkbench}; return MultiSelect; })()`, context);
  const toggleFilter = (key) => { openFilter = openFilter === key ? null : key; };
  const setOpenFilter = (key) => { openFilter = typeof key === "function" ? key(openFilter) : key; };
  function render(key = "source") {
    index = 0;
    const tree = MultiSelect({
      label: key === "source" ? "Source" : "Category",
      allLabel: key === "source" ? "All sources" : "All categories",
      options: ["Home", "Garden"],
      selected,
      onChange: (next) => { selected = next; },
      open: openFilter === key,
      onToggle: () => toggleFilter(key),
      setOpenFilter,
    });
    pendingEffects.splice(0).forEach((effect) => effect());
    return tree;
  }
  const findNodes = (tree, predicate) => [
    ...(predicate(tree) ? [tree] : []),
    ...tree.children.flatMap((child) => typeof child === "object" ? findNodes(child, predicate) : []),
  ];

  let tree = render();
  const summary = findNodes(tree, (node) => node.type === "summary")[0];
  let defaultPrevented = false;
  summary.props.onClick({ preventDefault: () => { defaultPrevented = true; } });
  assert.equal(defaultPrevented, true);
  tree = render();
  assert.equal(findNodes(tree, (node) => node.type === "details")[0].props.open, true);

  listeners.get("pointerdown")({ target: inside });
  tree = render();
  assert.equal(findNodes(tree, (node) => node.type === "details")[0].props.open, true);

  const garden = findNodes(tree, (node) => node.type === "input" && node.props.value === "Garden")[0];
  garden.props.onChange({ target: { checked: true } });
  tree = render();
  assert.deepEqual([...selected], ["Home", "Garden"]);
  assert.equal(findNodes(tree, (node) => node.type === "details")[0].props.open, true);

  listeners.get("pointerdown")({ target: {} });
  tree = render();
  assert.equal(findNodes(tree, (node) => node.type === "details")[0].props.open, false);
  assert.deepEqual([...selected], ["Home", "Garden"]);

  findNodes(tree, (node) => node.type === "summary")[0].props.onClick({ preventDefault() {} });
  tree = render();
  assert.deepEqual(findNodes(tree, (node) => node.type === "input" && node.props.checked)
    .map((node) => node.props.value), ["Home", "Garden"]);

  let escapePrevented = false;
  listeners.get("keydown")({
    key: "Escape",
    preventDefault: () => { escapePrevented = true; },
  });
  tree = render();
  assert.equal(escapePrevented, true);
  assert.equal(focused, 1);
  assert.equal(findNodes(tree, (node) => node.type === "details")[0].props.open, false);

  toggleFilter("source");
  assert.equal(findNodes(render("source"), (node) => node.type === "details")[0].props.open, true);
  toggleFilter("category");
  assert.equal(findNodes(render("source"), (node) => node.type === "details")[0].props.open, false);
  assert.equal(findNodes(render("category"), (node) => node.type === "details")[0].props.open, true);
});
