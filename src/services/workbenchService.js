import { parseResourceLinkEntries } from "./plannerService.js";
import { plannerStorage } from "./plannerSupabaseStorage.js";

export const clean = (value, fallback = "") => String(value ?? "").trim() || fallback;
export const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function sourceTag(value) {
  const source = clean(value, "unknown").toLowerCase();
  return source;
}

export async function loadWorkbench(forceReload = false) {
  const cached = !forceReload ? plannerStorage.getCachedProjects() : null;
  const [projects, tasks] = await Promise.all([
    cached || plannerStorage.getProjects(),
    plannerStorage.getTaskManager(),
  ]);
  plannerStorage.setCachedProjects(projects);
  return { projects, tasks, mode: "Supabase mode" };
}

export function filterProjects(projects, filters) {
  const query = filters.search.toLowerCase();
  const filtered = projects.filter((project) => {
    const source = sourceTag(project.source);
    const text = `${project.title} ${project.id} ${project.category} ${source}`.toLowerCase();
    return (!query || text.includes(query))
      && (!filters.source.length || filters.source.includes(source))
      && (!filters.category.length || filters.category.includes(clean(project.category)))
      && (!filters.projectState.length || filters.projectState.includes(clean(project.state)));
  });
  const value = (project, key) => number(project[key] ?? project.metadata?.[key], Number.MAX_SAFE_INTEGER);
  return filtered.sort((left, right) => {
    const difference = filters.projectSort === "category"
      ? clean(left.category).localeCompare(clean(right.category))
      : value(left, filters.projectSort === "priority" ? "priority" : "order")
        - value(right, filters.projectSort === "priority" ? "priority" : "order");
    return difference || clean(left.title).localeCompare(clean(right.title));
  });
}

export function getFilterOptions(projects) {
  const options = (values) => [...new Set(values.map((value) => clean(value)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return {
    source: options(projects.map((project) => sourceTag(project.source))),
    category: options(projects.map((project) => project.category)),
    projectState: options(projects.map((project) => project.state)),
  };
}

export function reconcileFilters(filters, known, options) {
  const next = { ...filters };
  Object.keys(options).forEach((key) => {
    const selected = [...new Set([
      ...filters[key].filter((value) => options[key].includes(value)),
      ...options[key].filter((value) => !known[key].includes(value)),
    ])];
    next[key] = selected.length ? selected : options[key];
  });
  return next;
}

export function groupTasks(tasks, sort) {
  const ordered = [...tasks].sort((left, right) => {
    const difference = number(left.order, 999999) - number(right.order, 999999);
    return sort === "desc" ? -difference : difference;
  });
  return [
    { title: "Project-Based Tasks", empty: "No project-based tasks yet.", tasks: ordered.filter((task) => sourceTag(task.source) !== "repeating") },
    { title: "Repeatable Tasks", empty: "No repeatable tasks yet.", tasks: ordered.filter((task) => sourceTag(task.source) === "repeating") },
  ];
}

export async function addProjectTask(project, tasks) {
  const existing = tasks.find((task) => clean(task.projectId) === clean(project.id)
    && sourceTag(task.source) === sourceTag(project.source));
  return plannerStorage.upsertTaskManagerTask({
    id: existing?.id,
    projectId: project.id,
    title: project.title,
    source: sourceTag(project.source),
    category: project.category,
    state: project.state,
    priority: number(project.priority, 3),
    order: number(project.order, tasks.length + 1),
    recurrence: project.recurrence || "",
    metadataJson: JSON.stringify({ asset: project.asset || "", mileage: project.mileage || "" }),
  });
}

export async function createProject(values) {
  const source = sourceTag(values.source);
  if (!["home", "vehicle", "repeating", "misc"].includes(source)) {
    throw new Error("Select a valid project type.");
  }
  const title = clean(values.title);
  if (!title) throw new Error("Project title is required.");
  if (source === "repeating" && !clean(values.recurrence)) {
    throw new Error("Recurrence is required for repeating projects.");
  }
  const metadata = {};
  for (const key of ["priority", "order", "property", "area", "actualCost", "dateCompleted",
    "vehicle", "mileage", "engineHours", "mechanic", "serviceDescription", "maintenanceChecks",
    "resourceLinks", "notes"]) {
    if (values[key] != null && values[key] !== "") metadata[key] = values[key];
  }
  return plannerStorage.createProject({
    source, title, category: clean(values.category, "uncategorized"),
    state: clean(values.state, "Not Started"), priority: clean(values.priority),
    order: clean(values.order), recurrence: clean(values.recurrence),
    metadata,
  });
}

export async function moveTask(task, tasks, action) {
  const repeating = sourceTag(task.source) === "repeating";
  const ordered = tasks.filter((item) => (sourceTag(item.source) === "repeating") === repeating)
    .sort((left, right) => number(left.order, 999999) - number(right.order, 999999));
  const index = ordered.findIndex((item) => item.id === task.id);
  const neighbor = ordered[index + (action === "up" ? -1 : 1)];
  if (index < 0 || !neighbor) throw new Error("This task cannot move further in that direction.");
  const saved = await Promise.all([
    plannerStorage.upsertTaskManagerTask({ ...task, order: neighbor.order }),
    plannerStorage.upsertTaskManagerTask({ ...neighbor, order: task.order }),
  ]);
  return saved;
}

export async function removeTask(task) {
  await plannerStorage.deleteTaskManagerTask(task.id);
}

export async function sendWeekly(task, taskCount) {
  if (sourceTag(task.source) !== "repeating") {
    await plannerStorage.upsertCuratedTask({
      taskId: clean(task.id, clean(task.projectId)), projectId: clean(task.projectId),
      title: clean(task.title, "Untitled Task"), source: sourceTag(task.source),
      category: clean(task.category, "uncategorized"), recurrence: clean(task.recurrence),
      priority: number(task.priority, 3), order: number(task.order, taskCount + 1),
    });
    return { message: `Added "${task.title}" to Planner Projects. Drag it onto a day to schedule it.` };
  }

  const projectId = clean(task.projectId, clean(task.id));
  let metadata;
  try {
    metadata = JSON.parse(clean(task.metadataJson, "{}")) || {};
  } catch (error) {
    throw new Error("Unable to read repeatable task metadata.", { cause: error });
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Repeatable task metadata must be an object.");
  }
  const saved = await plannerStorage.upsertTaskManagerTask({
    ...task, metadataJson: JSON.stringify({ ...metadata, plannerRepeatable: true }),
  });
  const overrides = await plannerStorage.getRepeatableOverrides();
  const existing = overrides.find((item) => clean(item.projectId) === projectId) || {};
  await plannerStorage.upsertRepeatableOverride({
    ...existing, projectId,
    title: clean(task.title, clean(existing.title, "Untitled Task")),
    state: clean(task.state, clean(existing.state, "unknown")),
    category: clean(task.category, clean(existing.category, "uncategorized")),
    priority: number(task.priority, number(existing.priority, 3)),
    order: number(task.order, number(existing.order, taskCount + 1)),
    recurrence: clean(task.recurrence, clean(existing.recurrence, "weekly")),
    startDate: "", originalStartDate: "", active: false,
    removedFromPlanner: false, removedFromTaskManager: false,
  });
  const planner = await plannerStorage.getWeeklyPlanner();
  const generated = (Array.isArray(planner?.tasks) ? planner.tasks : []).filter((item) =>
    !item.overridden && clean(item.parentRepeatableId) === projectId
  );
  await Promise.all(generated.map((item) =>
    plannerStorage.deleteWeeklyTask(clean(item.id || item.taskId), { hardDelete: true })
  ));
  return { task: saved, message: `Added "${task.title}" to Repeatable Tasks. Drag it onto a day to schedule it.` };
}


export const FIELD_OPTIONS = {
  source: ["home", "vehicle", "repeating", "misc"],
  category: ["Repair", "Maintenance", "Build", "Organize", "Install", "Clean", "SAR", "Travel", "Family", "Miscellaneous"],
  state: ["Not Started", "In Progress", "Recommended", "Completed"],
  priority: ["Low", "Medium", "High", "1", "2", "3", "4", "5"],
  area: ["Apartment", "Garage", "Yard", "Kitchen", "Bathroom", "Exterior"],
};

export const EDIT_OPTIONS = {
  ...FIELD_OPTIONS,
  category: FIELD_OPTIONS.category.slice(0, 6),
  state: [...FIELD_OPTIONS.state, "unknown"],
  recurrence: ["", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
};

export function getEditFields(project) {
  const value = (...keys) => {
    const metadata = project.metadata || {};
    const match = keys.find((key) => project[key] != null && project[key] !== "")
      || keys.find((key) => metadata[key] != null && metadata[key] !== "");
    return match ? project[match] != null && project[match] !== "" ? project[match] : metadata[match] : "";
  };
  const fields = [
    ["title", "Title", project.title], ["category", "Category", project.category],
    ["state", "State", project.state], ["priority", "Priority", value("priority")],
    ["order", "Order", value("order")], ["recurrence", "Recurrence", value("recurrence")],
    ["area", "Area", value("area")], ["actualCost", "Cost", value("actualCost", "cost")],
    ["resourceLinks", "Resource Links", parseResourceLinkEntries(value("resourceLinks")).map((entry) => entry.url).join("\n")],
    ["notes", "Notes", value("notes")],
    ["addToRepeating", "Add to Repeating List", Boolean(project.addToRepeating || value("recurrence"))],
  ];
  if (["home", "repeating"].includes(sourceTag(project.source))) {
    fields.push(["property", "Property", value("property")], ["dateCompleted", "Date Completed", value("dateCompleted", "datecompleted")]);
  }
  if (sourceTag(project.source) === "vehicle") {
    fields.push(["vehicle", "Vehicle / Small Engine", value("vehicle", "asset")], ["mileage", "Mileage", value("mileage")], ["engineHours", "Engine Hours", value("engineHours")]);
  }
  const reserved = new Set(fields.map(([key]) => key));
  const excluded = new Set(["sources", "sheetRowNumber", "rownumber", "_rowNumber", "_rownumber"]);
  Object.keys(project.metadata || {}).forEach((key) => {
    if (!reserved.has(key) && !excluded.has(key) && !key.startsWith("_")) fields.push([key, key, project.metadata[key]]);
  });
  return fields;
}



export async function updateProject(project, values) {
  const updated = { ...project, metadata: { ...project.metadata } };
  const core = new Set(["title", "category", "state"]);
  const numeric = new Set(["actualCost", "estimatedCost", "mileage", "engineHours", "order"]);
  Object.entries(values).forEach(([key, raw]) => {
    if (key === "addToRepeating") return;
    const text = clean(raw);
    const previous = key === "resourceLinks"
      ? parseResourceLinkEntries(project.metadata?.resourceLinks ?? project.resourceLinks).map((entry) => entry.url).join("\n")
      : clean(project.metadata?.[key]);
    if (!core.has(key) && text === previous) return;
    const value = numeric.has(key) && text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
    if (core.has(key)) updated[key] = value;
    else updated.metadata[key] = value;
  });
  const result = await plannerStorage.updateProject(updated);
  if (result?.ok === false) throw new Error(clean(result.error, "Unable to save project."));
  return updated;
}

export function cacheProjects(projects) {
  plannerStorage.setCachedProjects(projects);
}






