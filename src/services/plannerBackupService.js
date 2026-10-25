import { plannerStorage } from "./plannerSupabaseStorage.js";

const FORMAT = "homemaintenance-planner";
const VERSION = 1;
const groups = ["tasks", "weeklyTasks", "parkingItems"];
const copy = (value) => structuredClone(value);
const text = (value) => String(value ?? "").trim();

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function json(value, fallback, label) {
  const result = typeof value === "string" ? JSON.parse(value) : value ?? copy(fallback);
  if (Array.isArray(fallback)) {
    if (!Array.isArray(result)) throw new Error(`${label} must be an array.`);
  } else object(result, label);
  return result;
}

function date(value, label, optional = false) {
  const result = text(value);
  if (optional && !result) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result))
      || new Date(result).toISOString().slice(0, 10) !== result) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
  return result;
}

function flag(value, label) {
  if (value == null) return false;
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

function numeric(value, label, fallback = null) {
  if (value == null || value === "") return fallback;
  if (!["string", "number"].includes(typeof value)) throw new Error(`${label} must be an integer.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} must be an integer.`);
  return result;
}

function base(item, label) {
  object(item, label);
  const rawId = item.id || item.taskId;
  if (typeof rawId !== "string") throw new Error(`${label} requires a stable string ID.`);
  const id = text(rawId);
  if (!id || id === "week-settings") throw new Error(`${label} requires a stable, non-settings ID.`);
  if (!text(item.title)) throw new Error(`${label} requires a title.`);
  return { id, title: text(item.title) };
}

function normalizeTask(item) {
  return {
    ...base(item, "Task"), taskId: text(item.id || item.taskId),
    projectId: text(item.projectId), source: text(item.source) || "unknown",
    category: text(item.category) || "uncategorized", state: text(item.state) || "unknown",
    priority: numeric(item.priority, "Task priority", 3), order: numeric(item.order, "Task order"),
    recurrence: text(item.recurrence), startDate: date(item.startDate, "Task start date", true),
    metadataJson: JSON.stringify(json(item.metadataJson, {}, "Task metadata")),
    deleted: flag(item.deleted, "Task deleted"),
  };
}

function normalizeWeekly(item) {
  const record = base(item, "Weekly task");
  const metadata = { ...json(item.metadata, {}, "Weekly metadata"),
    ...json(item.metadataJson, {}, "Weekly metadata") };
  const known = new Set(["id", "taskId", "title", "taskType", "type", "source", "projectId",
    "parentRepeatableId", "occurrenceDate", "date", "timeSlot", "slot",
    "bucket", "completed", "overridden", "deleted", "deletedInstance", "checklist",
    "checklistJson", "checklistOpen", "reminder", "reminderJson", "metadata", "metadataJson",
    "updatedAt", "createdAt"]);
  for (const [key, value] of Object.entries(item)) if (!known.has(key)) metadata[key] = value;
  const timeSlot = text(item.timeSlot || item.slot || item.bucket || "morning").toLowerCase();
  if (!["morning", "afternoon", "evening", "all day"].includes(timeSlot)) {
    throw new Error(`Weekly task ${record.id} has an invalid time slot.`);
  }
  const reminder = json(item.reminder ?? item.reminderJson, {}, "Weekly reminder");
  if (Object.hasOwn(reminder, "active")) flag(reminder.active, "Weekly reminder active");
  return {
    ...record, taskId: record.id, taskType: text(item.taskType || item.type) || "curated",
    type: text(item.taskType || item.type) || "curated",
    source: text(item.source) || "unknown", projectId: text(item.projectId),
    parentRepeatableId: text(item.parentRepeatableId),
    date: date(item.date, "Weekly date", Boolean(item.deleted || item.deletedInstance)),
    occurrenceDate: date(item.occurrenceDate, "Occurrence date", true),
    timeSlot, bucket: text(item.bucket || timeSlot).toLowerCase(),
    completed: flag(item.completed, "Weekly completed"),
    overridden: flag(item.overridden, "Weekly overridden"),
    deletedInstance: flag(item.deletedInstance, "Weekly deleted instance"),
    deleted: flag(item.deleted, "Weekly deleted"),
    checklistOpen: flag(item.checklistOpen, "Weekly checklist open"),
    checklist: json(item.checklist ?? item.checklistJson, [], "Weekly checklist"),
    reminder,
    metadata,
  };
}

function normalizeParking(item) {
  const record = base(item, "Parking item");
  const conversion = item.convertedTo == null ? null : object(item.convertedTo, "Parking conversion");
  if (conversion && (!text(conversion.id) || !text(conversion.type))) throw new Error("Invalid Parking conversion.");
  const reminder = json(item.reminderJson, {}, "Parking reminder");
  if (Object.hasOwn(reminder, "active")) flag(reminder.active, "Parking reminder active");
  if (item.createdAt != null && (typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)))) {
    throw new Error("Parking createdAt must be a valid timestamp.");
  }
  const metadata = json(item.metadataJson, {}, "Parking metadata");
  if (conversion) metadata.conversionType = conversion.type;
  else delete metadata.conversionType;
  return {
    ...record, notes: String(item.notes ?? ""), tags: String(item.tags ?? ""),
    priority: text(item.priority) || "low", color: text(item.color),
    ...(item.createdAt != null ? { createdAt: item.createdAt } : {}),
    checklistJson: JSON.stringify(json(item.checklistJson, [], "Parking checklist")),
    reminderJson: JSON.stringify(reminder),
    metadataJson: JSON.stringify(metadata),
    convertedTo: conversion, deleted: flag(item.deleted, "Parking deleted"),
  };
}

function normalizeState(input) {
  object(input, "Backup data");
  const normalize = { tasks: normalizeTask, weeklyTasks: normalizeWeekly, parkingItems: normalizeParking };
  const state = {};
  for (const group of groups) {
    if (!Array.isArray(input[group])) throw new Error(`Backup ${group} must be an array.`);
    const ids = new Set();
    state[group] = input[group].map((item) => {
      const result = normalize[group](item);
      if (ids.has(result.id)) throw new Error(`Duplicate ${group} ID ${result.id}.`);
      ids.add(result.id);
      return result;
    });
  }
  if (input.weekStartDate != null) state.weekStartDate = date(input.weekStartDate, "Week start");
  return state;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])])
  );
  return value;
}
const comparable = (item) => canonical(Object.fromEntries(Object.entries(item).map(([key, value]) =>
  [key, ["metadataJson", "checklistJson", "reminderJson"].includes(key) ? JSON.parse(value) : value])));
const equal = (left, right) => JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));

function restoredItem(group, item) {
  const result = copy(item);
  const reminder = group === "weeklyTasks" ? result.reminder
    : group === "parkingItems" ? JSON.parse(result.reminderJson) : null;
  if (reminder?.active) {
    const review = { active: false, needsReview: true, imported: reminder };
    if (group === "weeklyTasks") result.reminder = review;
    else result.reminderJson = JSON.stringify(review);
  }
  return result;
}

export function parsePlannerBackup(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Choose or paste a JSON backup.");
  const parsed = object(JSON.parse(raw), "Backup");
  if (parsed.format !== FORMAT || Object.keys(parsed).some((key) => key.startsWith("hm_"))) {
    throw new Error("Legacy backups are permanently unsupported. Only modern Planner JSON backups can be restored.");
  }
  if (parsed.version !== VERSION) throw new Error("Unsupported Planner backup version.");
  return { data: normalizeState(parsed.data) };
}

export function createPlannerBackupService(storage = plannerStorage) {
  async function exportBackup() {
    const state = await storage.loadPlannerState();
    return JSON.stringify({
      format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
      scope: "Planner tasks, weekly tasks, parking and week settings only; not projects, Trips, activities, Google events or credentials.",
      data: normalizeState(state),
    }, null, 2);
  }

  async function preview(raw) {
    const parsed = parsePlannerBackup(raw);
    const [currentRaw, projects] = await Promise.all([storage.loadPlannerState(), storage.getProjects()]);
    const current = normalizeState(currentRaw);
    const conflicts = [];
    const changes = { tasks: [], weeklyTasks: [], parkingItems: [] };
    const counts = { insert: 0, identical: 0, conflict: conflicts.length };
    const projectIds = new Set(projects.map((project) => project.id));
    const taskIds = new Set([...current.tasks, ...parsed.data.tasks].map((item) => item.id));
    const weeklyIds = new Set([...current.weeklyTasks, ...parsed.data.weeklyTasks].map((item) => item.id));
    for (const group of groups) {
      const existing = new Map(current[group].map((item) => [item.id, item]));
      for (const item of parsed.data[group]) {
        const old = existing.get(item.id);
        const restored = restoredItem(group, item);
        if (old && (equal(old, item) || equal(old, restored))) {
          counts.identical += 1;
          continue;
        }
        if (item.convertedTo) {
          const targets = { project: projectIds, repeatable: projectIds, weekly: weeklyIds,
            "task-manager": taskIds, "ad-hoc": taskIds };
          if (!Object.hasOwn(targets, item.convertedTo.type)
            || !targets[item.convertedTo.type].has(item.convertedTo.id)) {
            conflicts.push(`${group} ${item.id}: conversion target ${item.convertedTo.id} is missing or unsupported.`);
            counts.conflict += 1;
            continue;
          }
        }
        const reference = item.projectId;
        if (reference && item.source !== "google-calendar" && !projectIds.has(reference)) {
          conflicts.push(`${group} ${item.id}: project ${reference} is not an existing Supabase project UUID.`);
          counts.conflict += 1;
          continue;
        }
        if (item.parentRepeatableId && !projectIds.has(item.parentRepeatableId) && !taskIds.has(item.parentRepeatableId)) {
          conflicts.push(`${group} ${item.id}: repeatable reference ${item.parentRepeatableId} is missing.`);
          counts.conflict += 1;
          continue;
        }
        if (old) {
          conflicts.push(`${group} ${item.id}: existing content differs.`);
          counts.conflict += 1;
        } else {
          changes[group].push(restored);
          counts.insert += 1;
        }
      }
    }
    if (parsed.data.weekStartDate && parsed.data.weekStartDate !== current.weekStartDate) {
      conflicts.push("Week settings differ. Merge restore cannot change the current planning week.");
      counts.conflict += 1;
    }
    return { counts, conflicts, changes,
      warnings: [
        "Existing rows are never overwritten or deleted. Restore is not a whole-database transaction.",
        "Imported active reminders are marked inactive for review, with their original settings preserved. Restore does not schedule or cancel Google notifications.",
      ] };
  }

  async function restore(raw) {
    const plan = await preview(raw);
    if (plan.conflicts.length) throw new Error(`Restore blocked: ${plan.conflicts.join(" ")}`);
    const skipped = plan.counts.identical;
    if (!plan.counts.insert) return { inserted: 0, skipped };
    const saved = await storage.restorePlannerState(plan.changes);
    const inserted = saved.filter((item) => item.inserted).length;
    return { inserted, skipped: skipped + saved.length - inserted };
  }
  return { exportBackup, preview, restore };
}

export const plannerBackup = createPlannerBackupService(plannerStorage);
