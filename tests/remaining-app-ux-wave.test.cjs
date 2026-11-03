const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const lastRule = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))].at(-1)?.[1] || "";
};

test("Project editor groups fields without dropping dynamic project details", () => {
  const editor = read("src", "pages", "Workbench", "ProjectEditor.jsx");
  assert.match(editor, /title: "Project details"/);
  assert.match(editor, /title: "Schedule and assets"/);
  assert.match(editor, /title: "Cost and service"/);
  assert.match(editor, /title: "Notes and resources"/);
  assert.match(editor, /title: "Additional details", fields: additional/);
  assert.match(editor, /fieldGroups\.map\(\(group\)/);
  assert.match(editor, /group\.fields\.map\(field\)/);
  const styles = read("src", "pages", "Workbench", "WorkbenchPage.module.css");
  assert.match(styles, /\.modalCard label\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /\.modalCard input:not\(\[type="checkbox"\]\),[\s\S]*\.modalCard textarea/);
  assert.match(styles, /\.modalCard input\[type="checkbox"\]\s*\{[^}]*width:\s*20px/);
  for (const key of ["source", "title", "category", "state", "priority", "order", "recurrence",
    "area", "property", "actualCost", "dateCompleted", "vehicle", "mileage", "engineHours",
    "mechanic", "serviceDescription", "resourceLinks", "notes"]) {
    assert.match(editor, new RegExp(`\\["${key}",`), `missing create field ${key}`);
  }
});

test("Dashboard retains its existing summary and upcoming-task destinations", () => {
  const dashboard = read("src", "pages", "Dashboard", "DashboardPage.jsx");
  const styles = read("src", "pages", "Dashboard", "DashboardPage.module.css");
  for (const text of ["Open Projects", "Tasks in Task Manager", "Tasks Scheduled This Week", "Upcoming Tasks"]) {
    assert(dashboard.includes(text), `missing existing Dashboard content: ${text}`);
  }
  assert.match(dashboard, /navigate\("\/workbench"\)/);
  assert.match(dashboard, /navigate\("\/planner"\)/);
  assert.match(styles, /border-top:\s*3px solid var\(--lm-color-primary\)/);
  assert.match(styles, /\.upcoming\s*\{[^}]*background:\s*var\(--lm-color-surface\)/);
});

test("Daily Activities uses shared tokens while keeping its weekly grid internally scrollable", () => {
  const page = read("src", "pages", "ActivityPlanner", "DailyActivityPlanner.module.css");
  const grid = read("src", "pages", "ActivityPlanner", "components", "WeeklyGrid.module.css");
  const component = read("src", "pages", "ActivityPlanner", "components", "WeeklyGrid.jsx");
  const modal = read("src", "pages", "ActivityPlanner", "components", "ActivityRuleModal.module.css");
  assert.match(page, /height:\s*calc\(100dvh[^}]*--lm-control-compact/);
  assert.match(page, /@media \(max-width:\s*600px\)[\s\S]*\.page\s*\{[^}]*height:\s*calc\(100dvh[^}]*--lm-control-mobile/);
  assert.match(page, /background:\s*var\(--lm-color-canvas\)/);
  assert.match(page, /\.gridArea\s*\{[^}]*overflow:\s*hidden/);
  assert.match(grid, /overflow:\s*auto/);
  assert.match(grid, /grid-template-columns:\s*var\(--gutter-width\) repeat\(7, minmax\(90px, 1fr\)\)/);
  assert.match(grid, /background:\s*var\(--block-color\)/);
  assert.match(page, /@media \(max-width:\s*600px\)[\s\S]*\.refreshButton\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/);
  assert.match(modal, /\.dayToggle\s*\{[^}]*min-height:\s*var\(--lm-control-mobile\)/);
  assert.match(modal, /@media \(max-width:\s*480px\)[\s\S]*\.field select,[\s\S]*\.primaryButton,[\s\S]*min-height:\s*var\(--lm-control-mobile\)/);
  assert.match(modal, /background:\s*var\(--lm-color-primary\)/);
  assert.match(component, /const FIRST_VISIBLE_SLOT = 14/);
  assert.match(component, /slotToMinutes\(slot\).*formatTimeLabel/);
  assert.match(component, /Activities scheduled before 7:00 AM/);
  assert.match(component, /onClick=\{\(\) => onBlockClick\(/);
  assert.match(component, /--start": block\.startSlot - FIRST_VISIBLE_SLOT/);
  assert.match(grid, /\.earlyActivities\s*\{[^}]*background:\s*var\(--lm-color-surface-subtle\)/);
});

test("Calendar month grid is contained on mobile and overlays use Foundation styles", () => {
  const calendar = read("src", "pages", "Calendar", "CalendarPage.module.css");
  assert.match(lastRule(calendar, ".calendar-events"), /overflow-x:\s*auto/);
  assert.match(lastRule(calendar, ".calendar-month-grid"), /min-width:\s*720px/);
  assert.match(calendar, /\.calendar-screen\s*\{[^}]*min-height:\s*calc\(100dvh[^}]*--lm-control-compact/);
  assert.match(calendar, /\.calendar-status\s*\{[^}]*white-space:\s*normal/);
  assert.match(calendar, /@media \(max-width:\s*600px\)[\s\S]*\.calendar-screen\s*\{[^}]*min-height:\s*calc\(100dvh[^}]*--lm-control-mobile/);
  assert(calendar.includes("background: var(--lm-color-overlay)"));
  assert.match(lastRule(calendar, ".weather-modal-actions button.primary"), /background:\s*var\(--lm-color-primary\)/);
  assert.match(calendar, /@media \(max-width:\s*600px\)[\s\S]*\.calendar-controls button,[\s\S]*min-height:\s*var\(--lm-control-mobile\)/);
  assert.match(calendar, /@media \(max-width:\s*600px\)[\s\S]*\.weather-modal-field input,[\s\S]*min-height:\s*var\(--lm-control-mobile\)/);
});

test("Trips styles share the Foundation palette and retain semantic Timeline states", () => {
  const trips = read("trips", "src", "index.css");
  const editor = read("src", "pages", "Trips", "components", "TripEditorPanel.css");
  const timeline = read("src", "pages", "Trips", "TimelineView.css");
  assert.match(trips, /html\[data-vite-page="trips"\]\s*\{[^}]*color:\s*var\(--lm-color-text\)/);
  assert.match(lastRule(trips, ".trip-card"), /background:\s*var\(--lm-color-surface\)/);
  assert.match(trips, /@media \(max-width:\s*600px\)[\s\S]*\.trip-filter-chip,[\s\S]*min-height:\s*var\(--lm-control-mobile\)/);
  assert.match(lastRule(editor, '.trips-list-column .trip-card[data-selected="true"]'), /background:\s*var\(--lm-color-surface-selected\)/);
  assert.match(lastRule(timeline, ".timeline-scroll"), /overflow-x:\s*auto/);
  assert.match(timeline, /@media \(max-width:\s*600px\)[\s\S]*\.timeline-year\s*\{\s*min-width:\s*1144px/);
  assert.match(timeline, /@media \(max-width:\s*600px\)[\s\S]*\.timeline-year-toggle\s*\{[^}]*height:\s*var\(--lm-control-mobile\)/);
  assert.match(trips, /@media \(max-width:\s*600px\)[\s\S]*\.priority-drag-handle\s*\{[^}]*height:\s*var\(--lm-control-mobile\)/);
  assert.match(trips, /@media \(max-width:\s*600px\)[\s\S]*\.trip-modal-tabs button/);
  assert.match(trips, /\.prioritize-header button,[\s\S]*padding:\s*0 var\(--lm-space-3\)/);
  assert.doesNotMatch(read("src", "pages", "Trips", "PrioritizeTrips.jsx"), /PriorityTimelinePreview/);
  assert.match(trips, /\.prioritize-page\s*\{[^}]*height:\s*calc\(100dvh[^}]*--lm-control-compact/);
  assert.match(trips, /@media \(max-width:\s*600px\)[\s\S]*\.prioritize-page\s*\{[^}]*height:\s*calc\(100dvh[^}]*--lm-control-mobile/);
  assert.match(editor, /\.trips-backlog\.trips-editor-home\s*\{[^}]*height:\s*calc\(100dvh[^}]*--lm-control-compact/);
  assert.match(editor, /@media \(max-width:\s*600px\)[\s\S]*\.trips-backlog\.trips-editor-home\s*\{[^}]*--lm-control-mobile/);
  assert.match(editor, /@media \(max-width:\s*600px\)[\s\S]*\.trips-editor-home > \.trips-filter-toolbar\s*\{[^}]*max-height:\s*24vh/);
  assert.match(timeline, /\.timeline-page\s*\{[^}]*min-height:\s*calc\(100dvh[^}]*--lm-control-compact/);
  assert.match(timeline, /@media \(max-width:\s*600px\)[\s\S]*\.timeline-page\s*\{[^}]*min-height:\s*calc\(100dvh[^}]*--lm-control-mobile/);
  assert.match(lastRule(timeline, ".timeline-page"), /max-width:\s*none/);
  assert.match(lastRule(timeline, ".timeline-months"), /min-width:\s*1144px/);
  assert.match(read("src", "pages", "Trips", "components", "TripEditorPanel.css"), /\.trips-workspace\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1/);
  assert.doesNotMatch(read("src", "pages", "Trips", "TripsHome.jsx"), /backlog\.current\.style\.height/);
  for (const color of ["#4ade80", "#facc15", "#ef4444"]) assert(timeline.includes(color), `missing semantic Timeline color ${color}`);
});

test("Workbench hides only the Order pill on mobile and retains desktop order data", () => {
  const page = read("src", "pages", "Workbench", "WorkbenchPage.jsx");
  const styles = read("src", "pages", "Workbench", "WorkbenchPage.module.css");
  assert.match(page, /project\.order\s*\?\?\s*metadata\.order/);
  assert.match(page, /className=\{styles\.orderPill\}/);
  assert.match(page, /value="order">Order/);
  assert.match(styles, /\.orderPill\s*\{[^}]*display:\s*inline-flex/);
  assert.match(styles, /@media \(max-width:\s*600px\)\s*\{[\s\S]*\.orderPill\s*\{\s*display:\s*none/);
  assert.match(styles, /\.taskOrder\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(styles, /@media \(max-width:\s*600px\)\s*\{[\s\S]*\.taskOrder\s*\{\s*display:\s*none/);
});
