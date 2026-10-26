import { createPlannerDataAccess } from "./plannerDataAccess.js";
import { assertProjectWriteAllowed } from "./projectPolicy.js";
import { getSupabaseClient } from "./supabaseClient.js";

const copy = (value) => structuredClone(value);
const clean = (value, fallback = "") => String(value ?? "").trim() || fallback;
const metadata = (task) => JSON.parse(task.metadataJson || "{}");
const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const repeatableUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function repeatableSeries(task) {
  const series = metadata(task).series;
  if (series == null) return null;
  if (typeof series !== "object" || Array.isArray(series)) {
    throw new Error("Invalid Repeatable series metadata. Reload before assigning.");
  }
  return series;
}

export function createPlannerSupabaseStorage(getData) {
  const listeners = new Set();
  let projects = null;
  let weekly = [];
  let submittedWeekly = new Map();
  let weekStartDate;
  let queue = Promise.resolve();
  const emit = (detail) => listeners.forEach((listener) => listener(detail));

  function enqueue(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {
      // Callers report failures; later explicit saves can still retry.
    });
    return result;
  }

  async function loadPlannerState() {
    await queue;
    const state = await getData().loadPlannerState();
    weekly = copy(state.weeklyTasks);
    submittedWeekly = new Map();
    weekStartDate = state.weekStartDate;
    return state;
  }

  function savePlannerState(changes, detail = { type: "weekly-snapshot-saved" }) {
    const snapshot = copy(changes);
    return enqueue(async () => {
      const saved = await getData().savePlannerState(snapshot);
      emit(detail);
      return saved;
    });
  }

  async function getProjects() {
    projects = await getData().loadProjects();
    return copy(projects);
  }

  async function updateProject(project) {
    const saved = await getData().saveProject(copy(project));
    projects = null;
    emit({ type: "project-upsert", item: saved });
    return saved;
  }

  async function createProject(project) {
    assertProjectWriteAllowed("create");
    const saved = await getData().createProject(copy(project));
    projects = null;
    emit({ type: "project-created", item: saved });
    return saved;
  }

  async function deleteProject(project) {
    assertProjectWriteAllowed("deleteWorkbench");
    const result = await enqueue(() => getData().deleteProject(copy(project)));
    projects = null;
    weekly = [];
    emit({ type: "project-deleted", id: result.id });
    return result;
  }

  async function getWeeklyPlanner() {
    const state = await loadPlannerState();
    return { weekStartDate: state.weekStartDate, tasks: state.weeklyTasks };
  }

  function saveWeeklyPlannerState(planner, { deletedTaskIds = [] } = {}) {
    const snapshot = copy(planner);
    const deletions = new Set(deletedTaskIds);
    return enqueue(async () => {
      const current = await getData().loadPlannerState();
      const baseline = new Map(weekly.map((task) => [task.id, task]));
      const persisted = new Map(current.weeklyTasks.map((task) => [task.id, task]));
      const changed = [];
      for (const task of snapshot.tasks) {
        const previous = submittedWeekly.get(task.id) || baseline.get(task.id);
        if (previous && weeklyEqual(task, previous) && !deletions.has(task.id)) continue;
        if (["curated", "project"].includes(task.taskType || task.type)) {
          const related = (row) => !row.deleted && !row.deletedInstance
            && ["curated", "project"].includes(row.taskType || row.type)
            && (task.metadata?.sourceTaskId && row.metadata?.sourceTaskId
              ? task.metadata.sourceTaskId === row.metadata.sourceTaskId
              : task.projectId && row.projectId === task.projectId && row.source === task.source);
          const ids = (rows) => rows.filter(related).map((row) => row.id).sort().join("\n");
          if (ids(weekly) !== ids(current.weeklyTasks)) {
            throw new Error(`Project occurrences for ${task.id} changed in another session. Reload before assigning.`);
          }
        }
        const old = baseline.get(task.id);
        const live = persisted.get(task.id);
        if (old && !submittedWeekly.has(task.id) && task.updatedAt !== old.updatedAt) {
          throw new Error(`Planner task ${task.id} was loaded from an older revision. Reload before editing.`);
        }
        if (old && (!live || !weeklyEqual(old, live) || old.updatedAt !== live.updatedAt)) {
          throw new Error(`Planner task ${task.id} changed in another session. Reload Planner before editing.`);
        }
        if (!old && live) throw new Error(`Planner task ${task.id} already exists. Reload Planner before editing.`);
        if (!deletions.has(task.id) && (task.deleted || task.deletedInstance)
          && !(old?.deleted || old?.deletedInstance)) {
          throw new Error(`Deleting Planner task ${task.id} requires explicit deletion intent.`);
        }
        changed.push({ ...task, updatedAt: live?.updatedAt });
      }
      for (const id of deletions) {
        const old = baseline.get(id);
        const live = persisted.get(id);
        if (!old || !live || !weeklyEqual(old, live) || old.updatedAt !== live.updatedAt) {
          throw new Error(`Planner task ${id} changed or is missing. Reload before deleting.`);
        }
        const index = changed.findIndex((task) => task.id === id);
        const deleted = { ...live, deleted: true, deletedInstance: true };
        if (index < 0) changed.push(deleted);
        else changed[index] = deleted;
      }
      const changingWeek = snapshot.weekStartDate !== weekStartDate;
      if (changingWeek && current.weekStartDate !== weekStartDate) {
        throw new Error("Planner week changed in another session. Reload before navigating.");
      }
      const result = await getData().savePlannerState({
        weeklyTasks: changed, deletedWeeklyTaskIds: [...deletions],
        ...(changingWeek ? { weekStartDate: snapshot.weekStartDate, expectedWeekStartDate: current.weekStartDate } : {}),
      });
      const saved = await getData().loadPlannerState();
      for (const { table, row } of result) {
        if (table === "planner_weekly_tasks" && row.id !== "week-settings"
          && saved.weeklyTasks.find((task) => task.id === row.id)?.updatedAt !== row.updated_at) {
          throw new Error(`Planner task ${row.id} changed after saving. Reload before editing again.`);
        }
      }
      if (changingWeek && saved.weekStartDate !== snapshot.weekStartDate) {
        throw new Error("Planner week changed after saving. Reload before navigating again.");
      }
      const writtenIds = new Set(changed.map((task) => task.id));
      weekly = [...weekly.filter((task) => !writtenIds.has(task.id)),
        ...saved.weeklyTasks.filter((task) => writtenIds.has(task.id))];
      for (const task of snapshot.tasks) submittedWeekly.set(task.id, copy(task));
      weekStartDate = snapshot.weekStartDate;
      emit({ type: "weekly-snapshot-saved" });
    });
  }

  function restoreRepeatableOccurrence(request) {
    const intent = copy(request);
    return enqueue(async () => {
      const old = weekly.find((row) => row.id === intent.taskId);
      const current = (await getData().loadPlannerState()).weeklyTasks.find((row) => row.id === intent.taskId);
      if (!old || !current || !weeklyEqual(old, current)
        || (old.updatedAt ?? null) !== intent.expectedUpdatedAt
        || (current.updatedAt ?? null) !== intent.expectedUpdatedAt) {
        throw new Error("This occurrence changed since the restoration prompt opened. Nothing was restored by this request. Reload Planner and review it again.");
      }
      const saved = await getData().restoreRepeatableOccurrence(intent);
      weekly = weekly.map((row) => row.id === saved.id ? copy(saved) : row);
      submittedWeekly.delete(saved.id);
      emit({ type: "weekly-snapshot-saved" });
      return saved;
    });
  }

  async function getTaskManager() {
    return (await getData().loadPlannerState()).tasks;
  }

  function restorePlannerState(changes) {
    const snapshot = copy(changes);
    return enqueue(async () => {
      const result = await getData().restorePlannerState(snapshot);
      try { weekly = copy((await getData().loadPlannerState()).weeklyTasks); }
      catch (error) {
        throw new Error(`Backup rows were saved, but reloading Planner failed. Refresh and preview again before retrying. ${error.message}`, { cause: error });
      }
      emit({ type: "backup-restored" });
      return result;
    });
  }

  async function upsertTaskManagerTask(task) {
    const current = await getTaskManager();
    const previous = current.find((row) => row.id === task.id)
      || (task.projectId && current.find((row) => row.projectId === task.projectId && row.source === task.source));
    if (task.id && !previous) throw new Error(`Task ${task.id} no longer exists. Refresh before editing.`);
    const item = {
      ...previous, ...copy(task), id: previous?.id,
      taskId: previous?.id,
      title: clean(task.title, "Untitled Task"), projectId: clean(task.projectId),
      source: clean(task.source, "unknown"), category: clean(task.category, "uncategorized"),
      state: clean(task.state, "unknown"), priority: task.priority ?? 3,
      order: task.order ?? current.length + 1, startDate: clean(task.startDate, previous?.startDate),
      metadataJson: JSON.stringify({ ...metadata(previous || {}),
        ...metadata(task) }),
    };
    const result = await savePlannerState({ tasks: [item] }, { type: "task-upsert" });
    const saved = (await getData().loadPlannerState()).tasks.find((row) => row.id === result[0].row.id);
    return saved;
  }

  async function deleteTaskManagerTask(id) {
    const task = (await getTaskManager()).find((item) => item.id === id);
    if (!task) throw new Error(`Task ${id} no longer exists.`);
    await savePlannerState({ tasks: [{ ...task, deleted: true }] }, { type: "task-delete" });
    return { ok: true, id };
  }

  async function getCuratedTasks() {
    return (await getTaskManager()).filter((task) => metadata(task).queue === "curated")
      .sort((a, b) => (metadata(a).queueOrder ?? a.order ?? 0)
        - (metadata(b).queueOrder ?? b.order ?? 0));
  }

  function saveCuratedTasks(items) {
    const snapshot = copy(items);
    return enqueue(async () => {
      const state = await getData().loadPlannerState();
      const updates = [];
      const seen = new Set();
      snapshot.forEach((item, index) => {
        const task = state.tasks.find((entry) => entry.id === item.taskId);
        if (!task) throw new Error(`Curated task ${item.taskId} no longer exists. Refresh Planner.`);
        if (seen.has(task.id)) throw new Error("Duplicate curated task.");
        seen.add(task.id);
        updates.push({ ...task, metadataJson: JSON.stringify({
          ...metadata(task), queue: "curated", queueOrder: index,
        }) });
      });
      for (const task of state.tasks) {
        if (metadata(task).queue === "curated" && !seen.has(task.id)) {
          const next = metadata(task);
          next.queue = null;
          next.queueOrder = null;
          updates.push({ ...task, metadataJson: JSON.stringify(next) });
        }
      }
      await getData().savePlannerState({ tasks: updates });
      emit({ type: "curated-snapshot-saved" });
    });
  }

  async function upsertCuratedTask(task) {
    const current = await getCuratedTasks();
    const all = await getTaskManager();
    const target = all.find((entry) => entry.id === (task.taskId || task.id));
    if (!target) throw new Error("Select an existing Planner task before adding it to the queue.");
    const index = current.findIndex((entry) => entry.id === target.id);
    if (index < 0) current.push(target);
    else current[index] = target;
    await saveCuratedTasks(current);
    return target;
  }

  async function getStagedTasks() {
    return (await getTaskManager()).filter((task) => metadata(task).queue === "staged")
      .sort((a, b) => (metadata(a).queueOrder ?? a.order ?? 0)
        - (metadata(b).queueOrder ?? b.order ?? 0))
      .map((task) => ({ id: task.id, item: { ...task, ...metadata(task).series } }));
  }

  function deleteStagedTasks(ids) {
    return enqueue(async () => {
      const state = await getData().loadPlannerState();
      const updates = state.tasks.filter((task) => ids.includes(task.id)
        && metadata(task).queue === "staged").map((task) => {
        const next = metadata(task);
        next.queue = null;
        next.queueOrder = null;
        return { ...task, metadataJson: JSON.stringify(next) };
      });
      await getData().savePlannerState({ tasks: updates });
    });
  }

  function findRepeatableMaster(tasks, projectId, taskId, { saving = false } = {}) {
    const related = tasks.filter((task) => !task.deleted && task.projectId === projectId
      && clean(task.source).toLowerCase() === "repeating");
    let matches = related.filter((task) => {
      const series = repeatableSeries(task);
      return series && (saving || series.removedFromPlanner !== true);
    });
    // A project-derived task can acquire its first series only through an exact master mapping.
    if (saving && !matches.length) matches = related.filter((task) => !repeatableSeries(task));
    if (!repeatableUuid.test(projectId) || (taskId && !repeatableUuid.test(taskId))
      || matches.some((task) => !repeatableUuid.test(task.id))
      || matches.length > 1 || (taskId && matches[0]?.id !== taskId)) {
      throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
    }
    return matches[0];
  }

  async function getRepeatableOverrides() {
    const state = await getData().loadPlannerState();
    const candidates = state.tasks.filter((task) => !task.deleted
      && clean(task.source).toLowerCase() === "repeating" && repeatableSeries(task));
    const included = new Set(candidates.filter((task) => repeatableSeries(task).removedFromPlanner !== true)
      .map((task) => task.projectId));
    return candidates.filter((task) => repeatableSeries(task).removedFromPlanner !== true
      || !included.has(task.projectId)).map((task) => {
      const series = repeatableSeries(task);
      if (series.removedFromPlanner !== true) findRepeatableMaster(state.tasks, task.projectId, task.id);
      const first = state.weeklyTasks.filter((row) => row.parentRepeatableId === task.projectId)
        .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))[0];
      const startDate = task.startDate || series.startDate || first?.occurrenceDate || "";
      const weekday = series.weekdays?.[0];
      const baseDay = fullDays.find((day) => day.slice(0, 3).toLowerCase() === clean(weekday).toLowerCase());
      return { ...series, id: task.projectId, projectId: task.projectId, taskId: task.id,
        title: task.title, recurrence: series.recurrence || task.recurrence,
        interval: series.interval ?? 1, weekdays: series.weekdays || [],
        baseDay: series.baseDay || baseDay || (startDate ? fullDays[new Date(`${startDate}T12:00:00`).getDay()] : "Monday"),
        baseBucket: series.baseBucket || first?.timeSlot || "Morning",
        startDate, originalStartDate: series.originalStartDate || startDate };
    });
  }

  function saveRepeatableOverrides(items) {
    const snapshot = copy(items);
    return enqueue(async () => {
      const state = await getData().loadPlannerState();
      const updates = snapshot.map((override) => {
        const task = findRepeatableMaster(state.tasks, override.projectId, override.taskId, { saving: true });
        const oldSeries = task ? metadata(task).series || {} : {};
        const series = { ...oldSeries, ...override };
        const oldDay = oldSeries.baseDay || fullDays.find((day) =>
          day.slice(0, 3).toLowerCase() === clean(oldSeries.weekdays?.[0]).toLowerCase());
        const dayChanged = override.baseDay && override.baseDay !== oldDay;
        if (dayChanged) series.weekdays = [override.baseDay.slice(0, 3)];
        if (override.recurrence && override.recurrence !== oldSeries.recurrence) series.interval = 1;
        delete series.id;
        delete series.projectId;
        delete series.taskId;
        return {
          ...task, projectId: override.projectId, source: "repeating",
          title: override.title || task?.title, recurrence: override.recurrence || task?.recurrence,
          priority: override.priority ?? task?.priority ?? 3, order: override.order ?? task?.order ?? 1,
          category: override.category || task?.category, state: override.state || task?.state,
          startDate: override.startDate ?? task?.startDate,
          metadataJson: JSON.stringify({ ...metadata(task || {}), series }),
        };
      });
      await getData().savePlannerState({ tasks: updates });
      emit({ type: "series-upsert" });
    });
  }

  async function upsertWeeklyTask(task) {
    await savePlannerState({ weeklyTasks: [task] }, { type: "weekly-task-upsert" });
    return task;
  }

  function saveProjectChecklistTemplate(masterId, weeklyId, items) {
    const definition = copy(items);
    return enqueue(async () => {
      if (!Array.isArray(definition) || definition.some((item) =>
        !item || typeof item.id !== "string" || !item.id.trim()
        || typeof item.text !== "string" || !item.text.trim()
        || Object.keys(item).some((key) => !["id", "text"].includes(key)))
        || new Set(definition.map((item) => item.id)).size !== definition.length) {
        throw new Error("Checklist template requires unique item IDs and nonempty labels.");
      }
      const state = await getData().loadPlannerState();
      const master = state.tasks.find((task) => task.id === masterId);
      const task = state.weeklyTasks.find((row) => row.id === weeklyId);
      const linkedId = task?.metadata?.sourceTaskId;
      const matches = master && state.tasks.filter((row) =>
        row.projectId === master.projectId && row.source === master.source);
      if (!master || !task || !["curated", "project"].includes(task.taskType)
        || task.deleted || task.deletedInstance || matches.length !== 1
        || task.source !== master.source
        || (linkedId ? linkedId !== masterId : !master.projectId || task.projectId !== master.projectId)
        || JSON.stringify(task.checklist.map(({ id, text }) => ({ id, text }))) !== JSON.stringify(definition)) {
        throw new Error("Project checklist changed or its ownership is ambiguous. Reload and review before saving a template.");
      }
      await getData().savePlannerState({ tasks: [{ ...master,
        metadataJson: JSON.stringify({ ...metadata(master), checklistTemplate: { version: 1, items: definition } }),
      }] });
      emit({ type: "checklist-template-saved", id: masterId });
    });
  }

  async function deleteWeeklyTask(id) {
    const task = (await getData().loadPlannerState()).weeklyTasks.find((item) => item.id === id);
    if (!task) throw new Error(`Weekly task ${id} no longer exists.`);
    await savePlannerState({ weeklyTasks: [{ ...task, deleted: true, deletedInstance: true }],
      deletedWeeklyTaskIds: [id] },
      { type: "weekly-task-delete" });
    return { ok: true, id };
  }

  function weeklyEqual(left, right) {
    const shape = (task) => ({
      id: task.id, date: task.date, timeSlot: task.timeSlot,
      taskType: task.taskType || task.type || "curated", title: task.title,
      projectId: task.projectId || "", source: task.source,
      parentRepeatableId: task.parentRepeatableId || "", occurrenceDate: task.occurrenceDate || task.date || "",
      completed: Boolean(task.completed), overridden: Boolean(task.overridden),
      deleted: Boolean(task.deleted), deletedInstance: Boolean(task.deletedInstance),
      checklist: task.checklist || [], checklistOpen: Boolean(task.checklistOpen),
      reminder: { ...(task.reminder || {}), active: Boolean(task.reminder?.active && task.reminder?.sendAt) },
      metadata: task.metadata || {},
    });
    const canonical = (value) => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
    return JSON.stringify(canonical(shape(left))) === JSON.stringify(canonical(shape(right)));
  }

  async function upsertParkingItem(item) {
    const saved = await savePlannerState({ parkingItems: [item] }, { type: "parking-lot-upsert" });
    return (await getData().loadPlannerState()).parkingItems.find((entry) => entry.id === saved[0].row.id);
  }

  async function deleteParkingItem(id) {
    const item = (await loadPlannerState()).parkingItems.find((entry) => entry.id === id);
    if (!item) throw new Error(`Parking item ${id} no longer exists.`);
    await savePlannerState({ parkingItems: [{ ...item, deleted: true }] },
      { type: "parking-lot-delete" });
    return { ok: true, id };
  }

  return {
    loadPlannerState, savePlannerState, restorePlannerState, restoreRepeatableOccurrence, getProjects, updateProject,
    createProject, deleteProject,
    getWeeklyPlanner, saveWeeklyPlannerState, upsertWeeklyTask, deleteWeeklyTask, saveProjectChecklistTemplate,
    getParkingLot: async () => (await getData().loadPlannerState()).parkingItems,
    upsertParkingItem, deleteParkingItem,
    getTaskManager, upsertTaskManagerTask, deleteTaskManagerTask,
    getCuratedTasks, saveCuratedTasks, upsertCuratedTask, getStagedTasks, deleteStagedTasks,
    getRepeatableOverrides, saveRepeatableOverrides,
    upsertRepeatableOverride: (item) => saveRepeatableOverrides([item]),
    getCachedProjects: () => projects && copy(projects),
    setCachedProjects: (items) => { projects = copy(items); },
    invalidateCachedProjects: () => { projects = null; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

let data;
export const plannerStorage = createPlannerSupabaseStorage(() => {
  if (!data) data = createPlannerDataAccess(getSupabaseClient());
  return data;
});
