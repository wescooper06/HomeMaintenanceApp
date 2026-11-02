const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const plannerSource = (file) => fs.readFileSync(path.join(root, file), "utf8");
const nodes = (tree) => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.children || []).flatMap(nodes)];

test("Planner day strip selects one day, preserves the seven-day desktop view, and honors meal-date navigation", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const file = path.join(root, "src", "pages", "Planner", "components", "WeeklyGrid.jsx");
  const source = fs.readFileSync(file, "utf8").replace(/^import .*;\r?$/gm, "")
    .replace("export default function", "function").replace(/^export /gm, "");
  const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic", pragma: "element" } });
  const days = [
    ["mon", "Mon", "2026-11-09"], ["tue", "Tue", "2026-11-10"], ["wed", "Wed", "2026-11-11"],
    ["thu", "Thu", "2026-11-12"], ["fri", "Fri", "2026-11-13"], ["sat", "Sat", "2026-11-14"],
    ["sun", "Sun", "2026-11-15"],
  ].map(([key, label, date], index) => ({
    key, label, date, heading: `${label} (${date.slice(5)})`, today: index === 2,
    weather: { condition: "Clear", icon: "☀" },
    slots: ["morning", "afternoon", "evening"].map((slot) => ({ slot, label: slot, tasks: [] })),
  }));
  function makeHarness(search = "") {
    const state = [], refs = [], effects = [];
    let hook = 0;
    const styles = new Proxy({}, { get: (_, key) => key });
    const modules = vm.runInNewContext(`(() => { ${code}; return { WeeklyGrid, WeeklyDay }; })()`, {
      element: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) }),
      usePlanner: () => ({
        snapshot: { planner: { weekStartDate: "2026-11-09", tasks: [] }, weatherByDate: {}, gridRevision: 0 },
        actions: { shiftPlannerWeek() {}, goToCurrentWeek() {}, openWeather() {} },
      }),
      selectWeeklyView: () => ({ label: "Nov 9-15, 2026", days }),
      useLocation: () => ({ search }),
      useState(initial) {
        const index = hook++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
      useRef(_initial) {
        const index = hook++;
        if (!(index in refs)) refs[index] = { current: { scrollLeft: 0, addEventListener() {}, removeEventListener() {} } };
        return refs[index];
      },
      useEffect(effect) { hook++; effects.push(effect); },
      MealPlannerProvider: "meal-provider", WeeklyDay: "weekly-day", styles, URLSearchParams,
      setTimeout, clearTimeout, console,
    });
    return {
      ...modules,
      render() {
        hook = 0;
        effects.length = 0;
        const tree = modules.WeeklyGrid();
        effects.splice(0).forEach((effect) => effect());
        return tree;
      },
    };
  }
  const h = makeHarness();
  let tree = h.render();
  const strip = () => nodes(tree).find((node) => node.props.className === "weekly-day-strip");
  const dayButtons = () => strip().children.filter((node) => node.type === "button");
  assert.equal(dayButtons().length, 7);
  assert.equal(dayButtons()[2].props["aria-pressed"], true, "today is the initial mobile selection");
  dayButtons()[5].props.onClick();
  tree = h.render();
  assert.equal(dayButtons()[5].props["aria-pressed"], true);
  const selectedDays = nodes(tree).filter((node) => node.type === h.WeeklyDay && node.props.mobileSelected);
  assert.equal(selectedDays.length, 1);
  assert.equal(selectedDays[0].props.day.date, "2026-11-14");

  const linked = makeHarness("?mealDate=2026-11-12");
  linked.render();
  tree = linked.render();
  const linkedButtons = nodes(tree).find((node) => node.props.className === "weekly-day-strip").children
    .filter((node) => node.type === "button");
  assert.equal(linkedButtons[3].props["aria-pressed"], true, "Recipe date navigation selects its requested day");
});

test("Planner responsive structure frames equal desktop days and separates Meals from Tasks", () => {
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  const mealCss = plannerSource("src/pages/Meals/MealPlanner.module.css");
  const grid = plannerSource("src/pages/Planner/components/WeeklyGrid.jsx");
  assert.match(css, /\.planner-week-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)[^}]*width:\s*100%/s);
  assert.doesNotMatch(css, /repeat\(7,\s*minmax\(160px|max\(100%,\s*1260px/);
  assert.match(css, /\.weekly-day-column\s*\{[^}]*border:[^}]*background:[^}]*padding:/s);
  assert.match(css, /\.weekly-day-strip\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.weekly-day-strip\s*\{[^}]*display:\s*grid[^}]*repeat\(7,\s*minmax\(44px,\s*1fr\)\)[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.weekly-day-strip button\s*\{[^}]*min-width:\s*44px/);
  assert.match(mealCss, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.row \.addButton\s*\{\s*min-width:\s*var\(--lm-control-mobile\);\s*min-height:\s*var\(--lm-control-mobile\);/);
  assert.match(css, /\.weekly-day-column\.is-mobile-selected\s*\{\s*display:\s*grid/s);
  assert.match(grid, /<MealRow date=\{date\} slot=\{slot\}\s*\/>/);
  assert.match(grid, /className=\{styles\["slot-task-region"\]\} aria-label=\{`\$\{label\} tasks`\}/);
  assert.doesNotMatch(grid, /<h5[^>]*>\s*Tasks\s*<\/h5>/);
  assert.match(css, /\.slot-task-region\s*\{[^}]*border-top:/s);
});

test("Mobile Planner exposes dedicated task and calendar controls without Projects or Repeatable assignment panels", () => {
  const page = plannerSource("src/pages/Planner/PlannerPage.jsx");
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  const sidebar = plannerSource("src/pages/Planner/components/PlannerSidebar.jsx");
  const grid = plannerSource("src/pages/Planner/components/WeeklyGrid.jsx");
  assert.match(page, /<PlannerSidebar mobilePanel=\{mobilePanel\} onMobilePanelChange=\{setMobilePanel\}\s*\/>/);
  assert.match(sidebar, /label: "Ad-Hoc Task", target: "adhoc-right"/);
  assert.match(sidebar, /label: "Task Parking Lot", target: "parking-lot-column"/);
  assert.match(sidebar, /label: "Calendar", target: "mini-calendar-column"/);
  assert.match(sidebar, /aria-expanded=\{expanded\}/);
  assert.match(sidebar, /data-mobile-panel=\{mobilePanel \|\| "closed"\}/);
  assert.match(sidebar, /Add Ad-Hoc Task/);
  assert.match(sidebar, /Repeatable Tasks/);
  assert.match(sidebar, /Task parking lot panel/);
  assert.match(sidebar, /planner-mobile-panel-projects/);
  assert.match(sidebar, /planner-mobile-panel-repeatable/);
  assert.match(css, /\.planner-mobile-controls\s*\{\s*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.planner-mobile-controls\s*\{\s*display:\s*flex/);
  assert.match(css, /\.planner-mobile-panel\s*\{\s*display:\s*none/);
  assert.match(css, /\.planner-top-panels\[data-mobile-panel="adhoc"\]\s+\.planner-mobile-panel-adhoc,[\s\S]*?\.planner-top-panels\[data-mobile-panel="calendar"\]\s+\.planner-mobile-panel-calendar\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css, /data-mobile-panel="(?:projects|repeatable)"/);
  assert.match(grid, /tasks\.length \? tasks\.map\(\(task\) =>/);
  assert.match(grid, /<WeeklyTaskCard task=\{task\} day=\{day\} slot=\{slot\}\s*\/>/);
  assert.match(css, /--lm-control-mobile/);
});

test("Mobile task controls occupy one row without hiding task actions or desktop task drag-and-drop", () => {
  const card = plannerSource("src/pages/Planner/components/ProjectCard.jsx");
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  assert.match(card, /data-action="weekly-drag-handle" draggable="true"/);
  assert.match(card, /data-action="task-complete-toggle"/);
  assert.match(card, /data-action="task-move"/);
  assert.match(card, /data-action="remove"/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.slot-task-handle\s*\{\s*display:\s*none/);
  assert.match(css, /\.slot-task-header-actions\s*\{[^}]*flex-wrap:\s*nowrap[^}]*gap:\s*0\.1rem[^}]*width:\s*100%/s);
  assert.match(css, /width:\s*40px;\s*min-width:\s*40px;\s*max-width:\s*40px;\s*min-height:\s*var\(--lm-control-mobile\)/);
  assert.doesNotMatch(css.slice(css.indexOf("@media (max-width: 700px)"), css.indexOf(".planner-parking-column", css.indexOf("@media (max-width: 700px)"))), /\.slot-task-handle\s*\{[^}]*min-width:/s);
});

test("Planner removes only the rejected future-checklist control and keeps task actions and type colors", () => {
  const card = plannerSource("src/pages/Planner/components/ProjectCard.jsx");
  const service = plannerSource("src/services/plannerService.js");
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  assert.doesNotMatch(card, /Use this checklist for future tasks/);
  assert.match(card, /task-complete-toggle/);
  assert.match(card, /weekly-move/);
  assert.match(card, /openChecklist/);
  assert.match(service, /saveChecklistTemplate/);
  for (const selector of [".slot-task-repeatable", ".slot-task-adhoc", ".slot-task-curated"]) assert(css.includes(selector));
});
