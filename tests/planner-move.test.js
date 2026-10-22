"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../www/screens/planner/planner.js"), "utf8");
function functionSource(name) {
  const matches = [...source.matchAll(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`, "g"))];
  assert.ok(matches.length, `${name} exists`);
  return matches[matches.length - 1][0];
}

function setup(overrides = {}) {
  const task = {
    id: "adhoc-2026-10-18-original", taskId: "adhoc-2026-10-18-original",
    taskType: "adhoc", title: "Test task", date: "2026-10-18",
    timeSlot: "morning", bucket: "morning", completed: true,
    checklist: [{ id: "item", text: "Keep me", completed: true }],
    checklistOpen: true, reminder: { active: true, sendAt: "2026-10-18T08:00:00" },
    ...overrides,
  };
  const state = {
    planner: { weekStartDate: "2026-10-12", tasks: [task] },
    selectedCalendarDate: "2026-10-18",
    calendarMonthDate: "2026-10-01",
  };
  const counts = { saves: 0, poolRenders: 0, gridRenders: 0 };
  const saved = [];
  const helpers = ["cleanText", "toDateKey", "parseDateKey", "getWeekStartISO", "toMonthStartDateKey", "buildWeeklyTaskId", "parseWeeklySourceId", "moveTaskToDate", "updateTaskTitle", "updateChecklistItem"].map(functionSource).join("\n");
  const handlers = new Function("state", "elements", "findWeeklyTaskById", "savePlanner", "renderTaskPool", "renderWeekGrid", `${helpers}\nreturn { move: moveTaskToDate, updateTaskTitle, updateChecklistItem };`)(
    state, { status: {} }, id => id === task.id ? { item: task } : null,
    () => { counts.saves += 1; saved.push(JSON.parse(JSON.stringify(state.planner))); },
    () => { counts.poolRenders += 1; }, () => { counts.gridRenders += 1; },
  );
  return { task, state, counts, saved, ...handlers };
}

for (const timeSlot of ["morning", "afternoon", "evening"]) {
  test(`moves to an arbitrary Sunday and preserves ${timeSlot} and task details`, () => {
    const { task, state, counts, saved, move } = setup({ timeSlot, bucket: timeSlot });
    const original = JSON.parse(JSON.stringify(task));
    const target = new Date(2027, 0, 3, 23, 30);
    const timestamp = target.getTime();
    assert.equal(move(task.id, target), true);
    assert.equal(task.date, "2027-01-03");
    assert.equal(state.planner.weekStartDate, "2026-10-12");
    assert.equal(state.selectedCalendarDate, "2026-10-18");
    assert.equal(state.calendarMonthDate, "2026-10-01");
    assert.equal(target.getTime(), timestamp);
    for (const key of Object.keys(original).filter(key => !["id", "taskId", "date"].includes(key))) {
      assert.deepEqual(task[key], original[key], key);
    }
    assert.equal(task.taskId, task.id);
    assert.match(task.id, /^adhoc-2027-01-03-/);
    assert.equal(saved[0].tasks[0].date, "2027-01-03");
    assert.equal(saved[0].weekStartDate, "2026-10-12");
    assert.deepEqual(counts, { saves: 1, poolRenders: 1, gridRenders: 1 });
  });
}

test("recurring instance moves to leap day without changing occurrence identity", () => {
  const { task, state, move } = setup({ parentRepeatableId: "series", occurrenceDate: "2026-10-18" });
  const id = task.id;
  assert.equal(move(id, new Date(2028, 1, 29)), true);
  assert.equal(task.id, id);
  assert.equal(task.occurrenceDate, "2026-10-18");
  assert.equal(task.overridden, true);
  assert.equal(task.date, "2028-02-29");
  assert.equal(state.planner.weekStartDate, "2026-10-12");
});

test("invalid dates and unknown tasks do not mutate or persist", () => {
  const { task, counts, move } = setup();
  const original = JSON.parse(JSON.stringify(task));
  for (const date of [new Date(NaN), null, "2026-10-19"]) {
    assert.equal(move(task.id, date), false);
  }
  assert.equal(move("missing", new Date()), false);
  assert.deepEqual(task, original);
  assert.deepEqual(counts, { saves: 0, poolRenders: 0, gridRenders: 0 });
});

for (const taskType of ["curated", "project", "adhoc", "repeatable"]) {
  test(`title edits persist without changing ${taskType} task details or visible week`, () => {
    const { task, state, counts, saved, updateTaskTitle } = setup({ taskType });
    const original = structuredClone(task);
    assert.equal(updateTaskTitle(task.id, "  Updated title <&>  "), true);
    assert.deepEqual(task, { ...original, title: "Updated title <&>" });
    assert.equal(saved[0].tasks[0].title, "Updated title <&>");
    assert.equal(state.planner.weekStartDate, "2026-10-12");
    assert.deepEqual(counts, { saves: 1, poolRenders: 0, gridRenders: 1 });
  });
}

for (const taskType of ["curated", "project", "adhoc"]) {
  for (const completed of [true, false]) {
    test(`${taskType} checklist edits preserve completed=${completed} and sibling items`, () => {
      const { task, saved, counts, updateChecklistItem } = setup({ taskType, checklist: [
        { id: "item", text: "Original", completed },
        { id: "other", text: "Unchanged", completed: !completed },
      ] });
      const original = structuredClone(task);
      assert.equal(updateChecklistItem(task.id, "item", "  Renamed <&>  "), true);
      original.checklist[0].text = "Renamed <&>";
      assert.deepEqual(task, original);
      assert.deepEqual(saved[0].tasks[0], original);
      assert.equal(counts.saves, 1);
    });
  }
}

test("empty, unchanged and unknown edits do not persist", () => {
  const { task, counts, updateTaskTitle, updateChecklistItem } = setup();
  assert.equal(updateTaskTitle(task.id, "  "), false);
  assert.equal(updateTaskTitle("missing", "New title"), false);
  assert.equal(updateTaskTitle(task.id, task.title), true);
  assert.equal(updateChecklistItem(task.id, "item", "  "), false);
  assert.equal(updateChecklistItem(task.id, "missing", "New text"), false);
  assert.equal(updateChecklistItem("missing", "item", "New text"), false);
  assert.equal(updateChecklistItem(task.id, "item", task.checklist[0].text), true);
  assert.deepEqual(counts, { saves: 0, poolRenders: 0, gridRenders: 0 });
});

function setupMaster(sourceName, options = {}) {
  const project = {
    id: "PA0001", title: "Master title", source: sourceName, category: "Repair", state: "Active",
    metadata: { sheetRowNumber: 7, property: "House", priority: 2, order: 4, notes: "Retain notes" },
  };
  const original = structuredClone(project);
  let cache = options.cacheMiss ? null : [project];
  const unified = [structuredClone(project)];
  const view = { projectId: project.id, title: project.title };
  const writes = [];
  let refreshes = 0;
  const browser = {
    PlannerStorage: { getCachedProjects: () => cache, setCachedProjects: value => { cache = value; } },
    ProjectsService: { UnifiedProjectList: options.cacheMiss ? [] : unified },
    loadAllProjects: async () => [project],
    SheetsService: { updateProjectInSheet: async value => {
      writes.push(structuredClone(value));
      return options.failure ? { ok: false, error: "Write rejected" } : { ok: true };
    } },
    location: { hash: options.workbench ? "#workbench" : "#planner" },
    loadWorkbench: async () => { refreshes += 1; },
  };
  const update = new Function("window", "getProjectById", `${functionSource("cleanText")}\n${functionSource("updateProjectMasterTitle")}\nreturn updateProjectMasterTitle;`)(browser, id => id === project.id ? view : null);
  return { update, project, original, view, writes, unified, getCache: () => cache, getRefreshes: () => refreshes };
}

for (const sourceName of ["home", "vehicle", "repeating", "misc"]) {
  test(`master title update preserves all other ${sourceName} project fields and refreshes cache`, async () => {
    const { update, project, original, writes, getCache, view, unified } = setupMaster(sourceName);
    assert.equal(await update(project.id, "  New master title  "), true);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      ...original, title: "New master title",
      metadata: { ...original.metadata, _originalTitle: original.title, _originalId: original.id },
    });
    assert.deepEqual(project, { ...original, title: "New master title" });
    assert.equal(getCache()[0].title, "New master title");
    assert.equal(unified[0].title, "New master title");
    assert.equal(view.title, "New master title");
  });
}

test("master title update resolves exact IDs on cache miss and refreshes an active Workbench", async () => {
  const { update, getCache, getRefreshes } = setupMaster("misc", { cacheMiss: true, workbench: true });
  await update("PA0001", "Updated");
  assert.equal(getCache()[0].title, "Updated");
  assert.equal(getRefreshes(), 1);
});

test("missing masters and rejected writes do not change master caches", async () => {
  const { update, project, original, getCache } = setupMaster("home", { failure: true });
  await assert.rejects(update("missing", "Updated"), /Unable to locate/);
  await assert.rejects(update(project.id, "Updated"), /Write rejected/);
  assert.deepEqual(getCache()[0], original);
  await assert.rejects(update("", "Updated"), /required/);
  await assert.rejects(update(project.id, " "), /required/);
});

for (const taskType of ["project", "curated", "adhoc", "repeatable"]) {
  test(`${taskType} inline title editing ${["project", "curated"].includes(taskType) ? "updates" : "does not update"} the project master`, async () => {
    const task = { id: "weekly-instance", projectId: "PD0001", taskType, title: "Original" };
    const calls = [];
    const save = new Function("findWeeklyTaskById", "getWeeklyTaskType", "parseWeeklySourceId", "updateTaskTitle", "updateProjectMasterTitle", "elements", "resolveTaskMasterProjectId", `${functionSource("cleanText")}\n${functionSource("saveTaskTitleEdit")}\nreturn saveTaskTitleEdit;`)(
      id => id === task.id ? { item: task } : null,
      item => item.taskType, () => "wrong-fallback",
      (id, title) => { calls.push(["instance", id, title]); return true; },
      async (id, title) => { calls.push(["master", id, title]); },
      { status: {} },
      async item => item.projectId,
    );
    assert.equal(await save(task.id, "Edited"), true);
    assert.deepEqual(calls, [
      ...(["project", "curated"].includes(taskType) ? [["master", task.projectId, "Edited"]] : []),
      ["instance", task.id, "Edited"],
    ]);
  });
}

test("failed master writes do not commit a Planner-only title and can be retried", async () => {
  const task = { id: "weekly-instance", projectId: "PA0159", taskType: "curated", title: "Original title" };
  const status = {};
  const calls = [];
  let rejectWrite = true;
  const save = new Function("findWeeklyTaskById", "getWeeklyTaskType", "parseWeeklySourceId", "updateTaskTitle", "updateProjectMasterTitle", "elements", "renderWeekGrid", "console", "resolveTaskMasterProjectId", `${functionSource("cleanText")}\n${functionSource("saveTaskTitleEdit")}\nreturn saveTaskTitleEdit;`)(
    () => ({ item: task }), item => item.taskType, () => "",
    (id, title) => { task.title = title; calls.push("instance"); return true; },
    async () => { calls.push("master"); if (rejectWrite) throw new Error("Sheet rejected update"); },
    { status }, () => calls.push("render"), { warn: () => {} },
    async item => item.projectId,
  );
  assert.equal(await save(task.id, "Edited title"), false);
  assert.equal(task.title, "Original title");
  assert.deepEqual(calls, ["master", "render"]);
  assert.match(status.textContent, /not saved.*Sheet rejected update/);
  rejectWrite = false;
  assert.equal(await save(task.id, "Edited title"), true);
  assert.equal(task.title, "Edited title");
  assert.deepEqual(calls, ["master", "render", "master", "instance"]);
});

function loadRowVerification(rows) {
  const sheetSource = fs.readFileSync(path.join(__dirname, "../www/js/services/sheets.service.js"), "utf8");
  const verifySource = sheetSource.match(/  async function verifyUpdatedRow\([^]*?\n  \}/)[0];
  return new Function("cleanCell", "sourceToTabName", "fetchTab", "findRowById", "getRowTitleValue", "delay", `${verifySource}\nreturn verifyUpdatedRow;`)(
    value => String(value == null ? "" : value).trim(), () => "Project List_A",
    async () => ({ rows }), (entries, id) => entries.find(entry => entry.ID === id) || null,
    row => row.Title, async () => {},
  );
}

test("master verification follows project ID when the Sheet row moves", async () => {
  const verify = loadRowVerification([
    { ID: "PA0011", Title: "Unrelated project", _rowNumber: 16 },
    { ID: "PA0159", Title: "Updated title", _rowNumber: 18 },
  ]);
  assert.deepEqual(await verify({ id: "PA0159", title: "Updated title", source: "home", metadata: { sheetRowNumber: 16 } }), {
    ok: true, rowNumber: 18,
  });
});

test("master verification cannot confirm a different project at a stale row number", async () => {
  const verify = loadRowVerification([{ ID: "PA0011", Title: "Updated title", _rowNumber: 16 }]);
  const result = await verify({ id: "PA0159", title: "Updated title", source: "home", metadata: { sheetRowNumber: 16 } });
  assert.equal(result.ok, false);
});

for (const projectId of ["303", "PA0159"]) {
  for (const cached of [true, false]) {
    test(`existing project ID ${projectId} resolves from ${cached ? "cache" : "refreshed project list"} without the dropdown`, async () => {
      const project = { id: projectId, title: "Master project" };
      let cache = cached ? [project] : [];
      let reloads = 0;
      const resolve = new Function("window", "parseWeeklySourceId", "selectTaskMasterProject", `${functionSource("cleanText")}\n${functionSource("resolveTaskMasterProjectId")}\nreturn resolveTaskMasterProjectId;`)(
        {
          PlannerStorage: { getCachedProjects: () => cache, setCachedProjects: value => { cache = value; } },
          loadAllProjects: async () => { reloads += 1; return [project]; },
        },
        () => "", () => { throw new Error("Matching IDs must not open the project picker"); },
      );
      assert.equal(await resolve({ projectId }), projectId);
      assert.equal(reloads, cached ? 0 : 1);
      assert.equal(await resolve({ projectId }), projectId);
      assert.equal(reloads, cached ? 0 : 1);
    });
  }
}

test("a stale Planner reference requires explicit selection rather than a title guess", async () => {
  const master = { id: "PA0159", title: "Replace wall unit with new display cabinet", source: "home" };
  const selections = [];
  let cache = [];
  const resolve = new Function("window", "parseWeeklySourceId", "selectTaskMasterProject", `${functionSource("cleanText")}\n${functionSource("resolveTaskMasterProjectId")}\nreturn resolveTaskMasterProjectId;`)(
    { PlannerStorage: { getCachedProjects: () => cache, setCachedProjects: value => { cache = value; } }, loadAllProjects: async () => [master] },
    () => "303", async (task, projects) => { selections.push({ task, projects }); return master.id; },
  );
  const task = { projectId: "303", title: "Replace main wall unit with new display cabinet", source: "home" };
  assert.equal(await resolve(task), "PA0159");
  assert.equal(selections.length, 1);
  assert.equal(task.projectId, "303");
  assert.deepEqual(selections[0].projects, [master]);
  assert.equal(await resolve({ projectId: "PA0159" }), "PA0159");
  assert.equal(selections.length, 1);
});

test("a repaired explicit project ID takes precedence over the old ID in the weekly instance key", () => {
  const parse = new Function(`${functionSource("cleanText")}\n${functionSource("parseWeeklySourceId")}\nreturn parseWeeklySourceId;`)();
  assert.equal(parse({ id: "curated-303-2026-10-18-123-456", taskType: "curated", projectId: "PA0159" }), "PA0159");
});