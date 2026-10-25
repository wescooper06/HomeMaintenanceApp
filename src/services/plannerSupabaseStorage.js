import { createPlannerDataAccess } from "./plannerDataAccess.js";
import { assertProjectWriteAllowed } from "./projectPolicy.js";
import { getSupabaseClient } from "./supabaseClient.js";

const copy = (value) => structuredClone(value);
const clean = (value, fallback = "") => String(value ?? "").trim() || fallback;
const metadata = (task) => JSON.parse(task.metadataJson || "{}");
const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function createPlannerSupabaseStorage(getData) {
  const listeners = new Set();
  let projects = null;
  let weekly = [];
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

  async function getWeeklyPlanner() {
    const state = await loadPlannerState();
    return { weekStartDate: state.weekStartDate, tasks: state.weeklyTasks };
  }

  function saveWeeklyPlannerState(planner) {
    const snapshot = copy(planner);
    return enqueue(async () => {
      const current = await getData().loadPlannerState();
      const ids = new Set(snapshot.tasks.map((task) => task.id));
      const next = copy(snapshot.tasks);
      for (const task of current.weeklyTasks) {
        if (!ids.has(task.id)) next.push({ ...task, deleted: true, deletedInstance: true });
      }

      const baseline = new Map(weekly.map((task) => [task.id, task]));
      const changed = next.filter((task) => JSON.stringify(task) !== JSON.stringify(baseline.get(task.id)));
      await getData().savePlannerState({
        weeklyTasks: changed, weekStartDate: snapshot.weekStartDate,
      });
      weekly = next.filter((task) => !task.deleted);
      emit({ type: "weekly-snapshot-saved" });
    });
  }

  async function getTaskManager() {
    return (await loadPlannerState()).tasks;
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

  async function getRepeatableOverrides() {
    const state = await loadPlannerState();
    return state.tasks.filter((task) => metadata(task).series).map((task) => {
      const series = metadata(task).series;
      const first = state.weeklyTasks.filter((row) => row.parentRepeatableId === task.projectId)
        .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))[0];
      const startDate = task.startDate || series.startDate || first?.occurrenceDate || "";
      const weekday = series.weekdays?.[0];
      const baseDay = fullDays.find((day) => day.slice(0, 3).toLowerCase() === clean(weekday).toLowerCase());
      return { ...series, id: task.projectId, projectId: task.projectId,
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
        const task = state.tasks.find((item) => item.projectId === override.projectId
          && (metadata(item).series || clean(item.source).toLowerCase() === "repeating"));
        const oldSeries = task ? metadata(task).series || {} : {};
        const series = { ...oldSeries, ...override };
        const oldDay = oldSeries.baseDay || fullDays.find((day) =>
          day.slice(0, 3).toLowerCase() === clean(oldSeries.weekdays?.[0]).toLowerCase());
        const dayChanged = override.baseDay && override.baseDay !== oldDay;
        if (dayChanged) series.weekdays = [override.baseDay.slice(0, 3)];
        if (override.recurrence && override.recurrence !== oldSeries.recurrence) series.interval = 1;
        delete series.id;
        delete series.projectId;
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

  async function deleteWeeklyTask(id) {
    const task = (await loadPlannerState()).weeklyTasks.find((item) => item.id === id);
    if (!task) throw new Error(`Weekly task ${id} no longer exists.`);
    await savePlannerState({ weeklyTasks: [{ ...task, deleted: true, deletedInstance: true }] },
      { type: "weekly-task-delete" });
    return { ok: true, id };
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
    loadPlannerState, savePlannerState, restorePlannerState, getProjects, updateProject,
    createProject, deleteProject: () => assertProjectWriteAllowed("delete"),
    getWeeklyPlanner, saveWeeklyPlannerState, upsertWeeklyTask, deleteWeeklyTask,
    getParkingLot: async () => (await loadPlannerState()).parkingItems,
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
