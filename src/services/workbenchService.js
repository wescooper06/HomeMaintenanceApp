// Keep the existing persistence boundary until the shared adapters are migrated.
import "../../www/js/utils/uuid.js";
import "../../www/js/services/sheets.service.js";
import "../../www/js/services/projects.service.js";
import "../../www/js/services/planner-storage.service.js";

export const clean = (value, fallback = "") => String(value ?? "").trim() || fallback;
export const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function sourceTag(value) {
  const source = clean(value, "unknown").toLowerCase();
  if (source.includes("vehicle") || source.includes("list_b")) return "vehicle";
  if (source.includes("repeating") || source.includes("list_c")) return "repeating";
  if (source.includes("home") || source.includes("list_a")) return "home";
  if (source.includes("misc") || source.includes("list_d")) return "misc";
  return source;
}

export async function loadWorkbench(forceReload = false) {
  const cached = !forceReload ? window.PlannerStorage.getCachedProjects() : null;
  const [projects, tasks] = await Promise.all([
    cached || window.ProjectsService.loadAllProjects(),
    window.PlannerStorage.getTaskManager(),
  ]);
  window.PlannerStorage.setCachedProjects(projects);
  return { projects, tasks, mode: window.PlannerStorage.getUseSheets() ? "Sheets mode" : "Local mode" };
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
  return window.PlannerStorage.upsertTaskManagerTask({
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

export async function moveTask(task, tasks, action) {
  const repeating = sourceTag(task.source) === "repeating";
  const ordered = tasks.filter((item) => (sourceTag(item.source) === "repeating") === repeating)
    .sort((left, right) => number(left.order, 999999) - number(right.order, 999999));
  const index = ordered.findIndex((item) => item.id === task.id);
  const neighbor = ordered[index + (action === "up" ? -1 : 1)];
  if (index < 0 || !neighbor) throw new Error("This task cannot move further in that direction.");
  const saved = await Promise.all([
    window.PlannerStorage.upsertTaskManagerTask({ ...task, order: neighbor.order }),
    window.PlannerStorage.upsertTaskManagerTask({ ...neighbor, order: task.order }),
  ]);
  return saved;
}

export async function removeTask(task) {
  await window.PlannerStorage.deleteTaskManagerTask(task.id);
}

export async function sendWeekly(task, taskCount) {
  if (sourceTag(task.source) !== "repeating") {
    await window.PlannerStorage.upsertCuratedTask({
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
  const saved = await window.PlannerStorage.upsertTaskManagerTask({
    ...task, metadataJson: JSON.stringify({ ...metadata, plannerRepeatable: true }),
  });
  const overrides = await window.PlannerStorage.getRepeatableOverrides();
  const existing = overrides.find((item) => clean(item.projectId) === projectId) || {};
  await window.PlannerStorage.upsertRepeatableOverride({
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
  const planner = await window.PlannerStorage.getWeeklyPlanner();
  const generated = (Array.isArray(planner?.tasks) ? planner.tasks : []).filter((item) =>
    !item.overridden && (clean(item.parentRepeatableId) === projectId
      || clean(item.id || item.taskId).startsWith(`repeatable-${projectId}-`))
  );
  await Promise.all(generated.map((item) =>
    window.PlannerStorage.deleteWeeklyTask(clean(item.id || item.taskId), { hardDelete: true })
  ));
  return { task: saved, message: `Added "${task.title}" to Repeatable Tasks. Drag it onto a day to schedule it.` };
}

export const ADD_FIELDS = [
  ["title", "Title"], ["source", "Source (home, vehicle, repeating, or misc)"],
  ["category", "Category"], ["state", "State"], ["priority", "Priority"],
  ["order", "Order"], ["area", "Area"], ["property", "Property"],
  ["vehicle", "Vehicle / Engine"], ["cost", "Cost"], ["resourceLinks", "Resource Links"],
  ["notes", "Notes"],
];
export const FIELD_OPTIONS = {
  source: ["home", "vehicle", "repeating", "misc"],
  category: ["Repair", "Maintenance", "Build", "Organize", "Install", "Clean", "SAR", "Travel", "Family", "Miscellaneous"],
  state: ["Not Started", "In Progress", "Recommended", "Completed"],
  priority: ["Low", "Medium", "High", "1", "2", "3", "4", "5"],
  area: ["Apartment", "Garage", "Yard", "Kitchen", "Bathroom", "Exterior"],
};
export const RECURRENCE_OPTIONS = ["Daily", "Weekly", "Bi-Weekly", "Monthly", "Quarterly", "Semi-Annual", "Annual"];
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
    ["resourceLinks", "Resource Links", value("resourceLinks")], ["notes", "Notes", value("notes")],
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

export async function createProject(values) {
  const source = sourceTag(values.source);
  if (!["home", "vehicle", "repeating", "misc"].includes(source)) throw new Error("Select a project source.");
  if (!clean(values.title) || !clean(values.category) || !clean(values.state)) throw new Error("Title, category, and state are required.");
  if ((source === "repeating" || values.addToRepeating) && !clean(values.recurrence)) {
    throw new Error("Recurrance is required for repeating projects.");
  }
  return window.ProjectsService.createProject({
    ...values, source, recurrence: clean(values.recurrence), addToRepeating: Boolean(values.addToRepeating),
  });
}

export async function updateProject(project, values) {
  const updated = { ...project, metadata: { ...project.metadata } };
  const core = new Set(["title", "category", "state"]);
  const numeric = new Set(["actualCost", "estimatedCost", "mileage", "engineHours", "order"]);
  Object.entries(values).forEach(([key, raw]) => {
    if (key === "addToRepeating") return;
    const text = clean(raw);
    const value = numeric.has(key) && text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
    if (core.has(key)) updated[key] = value;
    else updated.metadata[key] = value;
  });
  updated.metadata._originalTitle = clean(updated.metadata._originalTitle, clean(project.title));
  updated.metadata._originalId = clean(updated.metadata._originalId, clean(project.id));
  const result = await window.SheetsService.updateProjectInSheet(updated);
  if (result?.ok === false) throw new Error(clean(result.error, "Unable to save project."));
  return updated;
}

export function cacheProjects(projects) {
  window.PlannerStorage.setCachedProjects(projects);
}

export async function deleteProject(project) {
  const result = await window.SheetsService.deleteProject(project);
  if (result?.ok === false) throw new Error(result.error || "Unable to delete project.");
}

export const AGENT_EXAMPLE = 'Try: create a new project under the Home category called "Test Project"';

export function parseCommand(command) {
  const text = clean(command);
  const lower = text.toLowerCase();
  if (!text) return { intent: "unknown" };
  if (lower === "help" || lower === "commands") return { intent: "help" };
  if (lower.includes("clear")) return { intent: "clear" };
  const match = text.match(/(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?project(?:\s+under\s+the\s+(?<source>home|vehicle|repeating))?/i);
  if (!match) return { intent: "unknown" };
  const quoted = text.match(/["\u201c\u201d']([^"\u201c\u201d']+)["\u201c\u201d']/);
  const title = quoted?.[1]?.trim() || text
    .replace(/^(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?project(?:\s+under\s+the\s+(?:home|vehicle|repeating))?(?:\s+category)?(?:\s+called\s+|\s+named\s+|\s+titled\s+|\s+as\s+)?/i, "")
    .replace(/^[\s:,-]+/, "").replace(/^["\u201c\u201d']|["\u201c\u201d']$/g, "").trim() || "Test Project";
  return { intent: "create-project", source: clean(match.groups?.source, "home").toLowerCase(), title, category: "Repair", state: "Not Started", order: "0" };
}

export async function createAgentProject(command) {
  try {
    const result = await window.ProjectsService.createProject(command);
    // A refresh failure must not create a duplicate local project after a successful write.
    return { message: `Created project ${result.id} in ${result.tabName}.`, local: false };
  } catch (error) {
    console.warn("Agent Sheets creation failed; retaining the project locally.", error);
    const projects = [...(window.PlannerStorage.getCachedProjects() || [])];
    const nextId = projects.reduce((max, project) => {
      const numeric = Number(String(project?.id || "").replace(/[^0-9]/g, ""));
      return Number.isFinite(numeric) && numeric > max ? numeric : max;
    }, 0) + 1;
    projects.push({
      id: String(nextId), title: command.title, source: command.source,
      category: command.category, state: command.state, priority: "Medium",
      order: projects.length + 1, metadata: { sources: [command.source] },
    });
    cacheProjects(projects);
    return { message: `Created project locally. Sheets sync was unavailable: ${error.message}`, local: true };
  }
}
