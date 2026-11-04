const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const plannerSource = (file) => fs.readFileSync(path.join(root, file), "utf8");
const nodes = (tree) => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.children || []).flatMap(nodes)];

test("Planner action icons are fixed-size local SVGs independent of external font availability", () => {
  const checklist = plannerSource("src\\pages\\Planner\\components\\Checklist.jsx");
  const cards = plannerSource("src\\pages\\Planner\\components\\ProjectCard.jsx");
  const css = plannerSource("src\\pages\\Planner\\PlannerPage.module.css");
  for (const component of [checklist, cards]) {
    assert.match(component, /<svg className=\{styles\["planner-action-icon"\]\} viewBox="0 0 24 24"/);
    assert.match(component, /aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(component, /calendar_month|material-symbols-rounded/);
  }
  assert.match(css, /\.planner-action-icon\s*\{[^}]*width: 1rem;[^}]*height: 1rem;[^}]*flex: 0 0 auto;[^}]*pointer-events: none;/s);
  assert.doesNotMatch(css, /Material Icons Round|material-symbols-rounded|slot-task-week-icon/);
});

test("shared checklist reorder keeps captured pointers and touch-sized handles without visible arrows or reserved spacing", () => {
  const checklist = plannerSource("src\\pages\\Planner\\components\\Checklist.jsx");
  const hook = plannerSource("src\\pages\\Planner\\components\\useChecklistReorder.js");
  const css = plannerSource("src\\pages\\Planner\\PlannerPage.module.css");
  assert.match(checklist, /data-action="checklist-drag-handle"/);
  assert.match(checklist, /count > 1/);
  assert.match(checklist, /onPointerCancel=\{reorder.cancel\}/);
  assert.match(checklist, /onLostPointerCapture=\{reorder.cancel\}/);
  assert.doesNotMatch(checklist, /checklist-move-up|checklist-move-down|checklist-reorder-controls/);
  assert.match(checklist, /onKeyDown=\{\(event\) => reorder.handleKey\(event, index\)\}/);
  assert.doesNotMatch(checklist, /draggable="true"|onDrop/);
  assert.match(checklist, /onDragStart=\{\(event\) => event.preventDefault\(\)\}/);
  assert.match(hook, /setPointerCapture/);
  assert.match(hook, /requestAnimationFrame\(tick\)/);
  assert.match(hook, /await actions.reorderChecklistItem/);
  assert.match(css, /\.slot-checklist-handle\s*\{[^}]*touch-action:\s*none;/s);
  assert.doesNotMatch(css, /checklist-reorder-controls/);
  assert.match(css, /\.slot-checklist-handle\s*\{[^}]*min-width:\s*var\(--lm-control-mobile\);[^}]*min-height:\s*var\(--lm-control-mobile\);/s);
});

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
  const mealRows = plannerSource("src/pages/Meals/MealRows.jsx");
  const grid = plannerSource("src/pages/Planner/components/WeeklyGrid.jsx");
  assert.match(css, /\.planner-week-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)[^}]*width:\s*100%/s);
  assert.doesNotMatch(css, /repeat\(7,\s*minmax\(160px|max\(100%,\s*1260px/);
  assert.match(css, /\.weekly-day-column\s*\{[^}]*border:[^}]*background:[^}]*padding:/s);
  assert.match(css, /\.weekly-day-strip\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.weekly-day-strip\s*\{[^}]*display:\s*grid[^}]*repeat\(7,\s*minmax\(44px,\s*1fr\)\)[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.weekly-day-strip button\s*\{[^}]*min-width:\s*44px/);
  assert.match(mealCss, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.row \.addButton\s*\{\s*min-width:\s*var\(--lm-control-mobile\);\s*min-height:\s*var\(--lm-control-mobile\);/);
  assert.match(mealCss, /\.row\s*\{[^}]*border:[^}]*background:[^}]*padding:/s);
  assert.match(css, /\.slot-task\s*\{[^}]*font-size:\s*0\.88rem/);
  assert.match(mealCss, /\.occurrence\s*\{[^}]*font-size:\s*\.88rem/);
  assert.match(mealCss, /\.occurrenceActions button\s*\{\s*font-size:\s*1rem;\s*\}/);
  assert.match(mealCss, /\.recipeLink\s*\{[^}]*color:\s*var\(--lm-color-meals\);[^}]*font-weight:\s*600/);
  assert.match(mealCss, /\.dialog button, \.row button, \.row a\s*\{[^}]*min-height:\s*44px/);
  assert.doesNotMatch(mealRows, /No meals planned/);
  assert.match(mealRows, /<section className=\{styles\.row\} aria-label=\{`\$\{label\} \$\{date\}`\}>[\s\S]*?<div className=\{styles\.rowHeader\}>[\s\S]*?<button[^>]*className=\{styles\.addButton\}/);
  assert.match(mealRows, /<ul aria-label=\{`\$\{label\} meals`\}>\{entries\.map/);
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

test("Mobile task controls wrap only as needed without hiding actions or desktop task drag-and-drop", () => {
  const card = plannerSource("src/pages/Planner/components/ProjectCard.jsx");
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  assert.match(card, /data-action="weekly-drag-handle" draggable="true"/);
  assert.match(card, /data-action="task-complete-toggle"/);
  assert.match(card, /data-action="task-move"/);
  assert.match(card, /data-action="remove"/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.slot-task-handle\s*\{\s*display:\s*none/);
  assert.match(css, /\.slot-task-header-actions\s*\{[^}]*flex-wrap:\s*wrap[^}]*gap:\s*0\.1rem[^}]*width:\s*100%/s);
  assert.match(css, /width:\s*40px;\s*min-width:\s*40px;\s*max-width:\s*40px;\s*min-height:\s*var\(--lm-control-mobile\)/);
  assert.doesNotMatch(css.slice(css.indexOf("@media (max-width: 700px)"), css.indexOf(".planner-parking-column", css.indexOf("@media (max-width: 700px)"))), /\.slot-task-handle\s*\{[^}]*min-width:/s);
});

test("Mobile checklist controls use touch-sized targets and constrain long checklist text", () => {
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  assert.doesNotMatch(css, /\.slot-task-repeatable \.slot-checklist[^{}]*\{[^}]*display:\s*none/s);
  const mobile = css.slice(css.indexOf("@media (max-width: 700px)"), css.indexOf(".planner-parking-column", css.indexOf("@media (max-width: 700px)")));
  assert.match(mobile, /\.checklist-modal-header button,[\s\S]*?\.checklist-text-edit\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/s);
  assert.match(mobile, /\.slot-checklist-item input\[type="checkbox"\]\s*\{[^}]*width:\s*var\(--lm-control-mobile\)[^}]*height:\s*var\(--lm-control-mobile\)/s);
  assert.match(mobile, /\.slot-checklist-remove,[\s\S]*?\.slot-checklist-add button\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/s);
  assert.match(mobile, /\.slot-checklist-add input\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/s);
  assert.match(mobile, /\.slot-checklist-text\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test("Planner removes only the rejected future-checklist control and keeps task actions and type colors", () => {
  const card = plannerSource("src/pages/Planner/components/ProjectCard.jsx");
  const service = plannerSource("src/services/plannerService.js");
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  assert.doesNotMatch(card, /Use this checklist for future tasks/);
  assert.match(card, /task-complete-toggle/);
  assert.match(card, /weekly-move/);
  assert.match(card, /<ChecklistAction task=\{task\}/);
  assert.match(service, /saveChecklistTemplate/);
  for (const selector of [".slot-task-repeatable", ".slot-task-adhoc", ".slot-task-curated"]) assert(css.includes(selector));
});

test("unified checklist popup is bounded, scrollable and never rendered inline in scheduled cards", () => {
  const css = plannerSource("src/pages/Planner/PlannerPage.module.css");
  const card = plannerSource("src/pages/Planner/components/ProjectCard.jsx");
  assert.doesNotMatch(card, /<Checklist(?:Body)?\s/);
  assert.match(css, /\.slot-task-header\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.checklist-modal-card\s*\{[^}]*box-sizing:\s*border-box[^}]*max-height:\s*calc\(100dvh - 2rem\)/s);
  assert.match(css, /\.checklist-modal-content\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.checklist-modal-header\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /\.checklist-text-edit\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.slot-task \.slot-task-checklist-button\.has-checklist-items/);
});
