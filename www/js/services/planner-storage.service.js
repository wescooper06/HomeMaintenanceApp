// PlannerStorage provides the local-first persistence boundary for planner features.
(function () {
  const STORAGE_KEYS = {
    parkingLot: "hm_parking_lot",
    retryQueue: "hm_sheet_write_retry_queue",
    taskManager: "hm_task_manager_tasks",
    repeatable: "hm_repeatable_tasks",
    weeklyPlanner: "hm_weekly_planner",
  };

  const SHEET_NAMES = {
    parkingLot: "Planner_ParkingLot",
    taskManager: "Planner_TaskManager",
    repeatable: "Planner_RepeatableOverrides",
    weeklyTasks: "Planner_WeeklyTasks",
  };

  const state = {
    useSheets: false,
    listeners: new Set(),
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function cleanText(value, fallback) {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureUuid(value) {
    const id = cleanText(value, "");
    return id || (typeof window.generateUuidV4 === "function" ? window.generateUuidV4() : `${Date.now()}-${Math.floor(Math.random() * 100000)}`);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emitChange(detail) {
    const event = new CustomEvent("planner-storage-change", { detail: detail || {} });
    window.dispatchEvent(event);
    state.listeners.forEach((listener) => {
      try {
        listener(detail || {});
      } catch (error) {
        console.warn("PlannerStorage listener failed", error);
      }
    });
  }

  function onChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }

  function getParkingLotLocal() {
    const items = readJson(STORAGE_KEYS.parkingLot, []);
    return Array.isArray(items)
      ? items.filter((item) => item && item.deleted !== true).map((item) => clone(item))
      : [];
  }

  function saveParkingLot(items) {
    writeJson(STORAGE_KEYS.parkingLot, Array.isArray(items) ? items : []);
  }

  function normalizeParkingItem(item) {
    const existing = item && typeof item === "object" ? item : {};
    const existingConvertedTo = existing.convertedTo && typeof existing.convertedTo === "object"
      ? { ...existing.convertedTo }
      : null;

    return {
      id: ensureUuid(existing.id),
      title: cleanText(existing.title, "Untitled Idea"),
      notes: cleanText(existing.notes, ""),
      createdAt: cleanText(existing.createdAt, nowIso()),
      updatedAt: nowIso(),
      source: "parking-lot",
      tags: cleanText(existing.tags, ""),
      priority: cleanText(existing.priority, "low"),
      convertedTo: existingConvertedTo,
      color: cleanText(existing.color, ""),
      checklistJson: cleanText(existing.checklistJson, "[]"),
      reminderJson: cleanText(existing.reminderJson, "{}"),
      metadataJson: cleanText(existing.metadataJson, "{}"),
      deleted: Boolean(existing.deleted),
      archived: Boolean(existing.archived),
      convertedFromParking: cleanText(existing.convertedFromParking, ""),
    };
  }

  function getParkingLot() {
    return Promise.resolve(getParkingLotLocal());
  }

  function upsertParkingItem(item) {
    const normalized = normalizeParkingItem(item);
    const current = readJson(STORAGE_KEYS.parkingLot, []);
    const index = Array.isArray(current) ? current.findIndex((entry) => cleanText(entry.id, "") === normalized.id) : -1;

    if (index >= 0) {
      current[index] = {
        ...current[index],
        ...normalized,
        createdAt: cleanText(current[index].createdAt, normalized.createdAt),
      };
    } else {
      current.push(normalized);
    }

    saveParkingLot(current);
    emitChange({ type: "parking-lot-upsert", item: clone(normalized) });
    return Promise.resolve(clone(normalized));
  }

  function deleteParkingItem(id, options) {
    const targetId = cleanText(id, "");
    const hardDelete = Boolean(options && options.hardDelete);
    const current = readJson(STORAGE_KEYS.parkingLot, []);
    const index = Array.isArray(current) ? current.findIndex((entry) => cleanText(entry.id, "") === targetId) : -1;

    if (index < 0) {
      return Promise.resolve({ ok: false, id: targetId });
    }

    let updatedItem = null;
    if (hardDelete) {
      updatedItem = current[index];
      current.splice(index, 1);
    } else {
      current[index] = {
        ...current[index],
        deleted: true,
        updatedAt: nowIso(),
      };
      updatedItem = current[index];
    }

    saveParkingLot(current);
    emitChange({ type: "parking-lot-delete", id: targetId, hardDelete, item: clone(updatedItem) });
    return Promise.resolve({ ok: true, id: targetId, hardDelete });
  }

  function readTaskManagerLocal() {
    const items = readJson(STORAGE_KEYS.taskManager, []);
    return Array.isArray(items) ? items : [];
  }

  function upsertTaskManagerTask(task) {
    const current = readTaskManagerLocal();
    const id = ensureUuid(task && (task.taskId || task.id));
    const normalized = {
      taskId: id,
      projectId: cleanText(task && task.projectId, id),
      title: cleanText(task && task.title, "Untitled Task"),
      source: cleanText(task && task.source, "unknown"),
      category: cleanText(task && task.category, "uncategorized"),
      state: cleanText(task && task.state, "unknown"),
      priority: task && task.priority != null ? task.priority : 3,
      order: task && task.order != null ? task.order : current.length + 1,
      recurrence: cleanText(task && task.recurrence, ""),
      asset: cleanText(task && task.asset, ""),
      mileage: cleanText(task && task.mileage, ""),
      updatedAt: nowIso(),
    };

    const index = current.findIndex((entry) => cleanText(entry.taskId, "") === normalized.taskId);
    if (index >= 0) {
      current[index] = { ...current[index], ...normalized };
    } else {
      current.push(normalized);
    }

    writeJson(STORAGE_KEYS.taskManager, current);
    emitChange({ type: "task-manager-upsert", item: clone(normalized) });
    return Promise.resolve(clone(normalized));
  }

  function readRepeatableLocal() {
    const items = readJson(STORAGE_KEYS.repeatable, []);
    return Array.isArray(items) ? items : [];
  }

  function upsertRepeatableOverride(override) {
    const current = readRepeatableLocal();
    const projectId = cleanText(override && override.projectId, "");
    if (!projectId) {
      throw new Error("upsertRepeatableOverride requires projectId.");
    }

    const normalized = {
      projectId,
      id: projectId,
      title: cleanText(override && override.title, "Untitled Task"),
      state: cleanText(override && override.state, "unknown"),
      category: cleanText(override && override.category, "uncategorized"),
      priority: override && override.priority != null ? override.priority : 3,
      order: override && override.order != null ? override.order : current.length + 1,
      recurrence: cleanText(override && override.recurrence, "weekly"),
      baseDay: cleanText(override && override.baseDay, "Monday"),
      monthWeek: cleanText(override && override.monthWeek, ""),
      baseBucket: cleanText(override && override.baseBucket, "Morning"),
      startDate: cleanText(override && override.startDate, ""),
      originalStartDate: cleanText(override && override.originalStartDate, ""),
      active: override && override.active !== false,
      removedFromPlanner: Boolean(override && override.removedFromPlanner),
      removedFromTaskManager: Boolean(override && override.removedFromTaskManager),
      asset: cleanText(override && override.asset, ""),
      mileage: cleanText(override && override.mileage, ""),
      updatedAt: nowIso(),
    };

    const index = current.findIndex((entry) => cleanText(entry.projectId, "") === projectId);
    if (index >= 0) {
      current[index] = { ...current[index], ...normalized };
    } else {
      current.push(normalized);
    }

    writeJson(STORAGE_KEYS.repeatable, current);
    emitChange({ type: "repeatable-upsert", item: clone(normalized) });
    return Promise.resolve(clone(normalized));
  }

  function readWeeklyPlannerLocal() {
    const planner = readJson(STORAGE_KEYS.weeklyPlanner, null);
    if (!planner || typeof planner !== "object") {
      return {
        weekStartDate: "",
        tasks: [],
      };
    }

    planner.tasks = Array.isArray(planner.tasks) ? planner.tasks : [];
    return planner;
  }

  function upsertWeeklyTask(task) {
    const planner = readWeeklyPlannerLocal();
    const id = ensureUuid(task && (task.id || task.taskId));
    const normalized = {
      id,
      taskId: id,
      taskType: cleanText(task && (task.taskType || task.type), "curated"),
      type: cleanText(task && (task.taskType || task.type), "curated"),
      title: cleanText(task && task.title, "Untitled Task"),
      source: cleanText(task && task.source, "unknown"),
      projectId: cleanText(task && task.projectId, ""),
      parentRepeatableId: cleanText(task && task.parentRepeatableId, ""),
      occurrenceDate: cleanText(task && task.occurrenceDate, cleanText(task && task.date, "")),
      date: cleanText(task && task.date, ""),
      timeSlot: cleanText(task && task.timeSlot, cleanText(task && task.slot, "morning")),
      bucket: cleanText(task && task.bucket, cleanText(task && task.timeSlot, "morning")),
      completed: Boolean(task && task.completed),
      overridden: Boolean(task && task.overridden),
      deletedInstance: Boolean(task && task.deletedInstance),
      checklist: Array.isArray(task && task.checklist) ? task.checklist : [],
      checklistOpen: Boolean(task && task.checklistOpen),
      reminder: task && task.reminder && typeof task.reminder === "object" ? { ...task.reminder } : {},
      metadata: task && task.metadata && typeof task.metadata === "object" ? { ...task.metadata } : {},
      priority: task && task.priority != null ? task.priority : null,
      recurrence: cleanText(task && task.recurrence, ""),
      updatedAt: nowIso(),
    };

    const index = planner.tasks.findIndex((entry) => cleanText(entry.id || entry.taskId, "") === normalized.id);
    if (index >= 0) {
      planner.tasks[index] = { ...planner.tasks[index], ...normalized };
    } else {
      planner.tasks.push(normalized);
    }

    writeJson(STORAGE_KEYS.weeklyPlanner, planner);
    emitChange({ type: "weekly-task-upsert", item: clone(normalized) });
    return Promise.resolve(clone(normalized));
  }

  function deleteWeeklyTask(id, options) {
    const planner = readWeeklyPlannerLocal();
    const targetId = cleanText(id, "");
    const hardDelete = Boolean(options && options.hardDelete);
    const index = planner.tasks.findIndex((entry) => cleanText(entry.id || entry.taskId, "") === targetId);

    if (index < 0) {
      return Promise.resolve({ ok: false, id: targetId });
    }

    if (hardDelete) {
      planner.tasks.splice(index, 1);
    } else {
      planner.tasks[index] = {
        ...planner.tasks[index],
        deletedInstance: true,
        updatedAt: nowIso(),
      };
    }

    writeJson(STORAGE_KEYS.weeklyPlanner, planner);
    emitChange({ type: "weekly-task-delete", id: targetId, hardDelete });
    return Promise.resolve({ ok: true, id: targetId, hardDelete });
  }

  function queueRetry(operation) {
    const queue = readJson(STORAGE_KEYS.retryQueue, []);
    queue.push({
      id: ensureUuid(operation && operation.id),
      operation,
      createdAt: nowIso(),
    });
    writeJson(STORAGE_KEYS.retryQueue, queue);
  }

  function batchApplyPlannerChanges(operations) {
    const list = Array.isArray(operations) ? operations : [];
    const results = [];

    list.forEach((operation) => {
      try {
        if (!operation || typeof operation !== "object") {
          return;
        }

        if (operation.sheet === SHEET_NAMES.parkingLot) {
          if (operation.op === "delete") {
            results.push({ sheet: operation.sheet, result: deleteParkingItem(operation.id, { hardDelete: Boolean(operation.hardDelete) }) });
            return;
          }

          results.push({ sheet: operation.sheet, result: upsertParkingItem(operation.row || operation.item) });
          return;
        }

        if (operation.sheet === SHEET_NAMES.weeklyTasks) {
          if (operation.op === "delete") {
            results.push({ sheet: operation.sheet, result: deleteWeeklyTask(operation.id, { hardDelete: Boolean(operation.hardDelete) }) });
            return;
          }

          results.push({ sheet: operation.sheet, result: upsertWeeklyTask(operation.row || operation.item) });
          return;
        }

        if (operation.sheet === SHEET_NAMES.taskManager) {
          if (operation.op === "delete") {
            const current = readTaskManagerLocal().filter((entry) => cleanText(entry.taskId, "") !== cleanText(operation.id, ""));
            writeJson(STORAGE_KEYS.taskManager, current);
            results.push({ sheet: operation.sheet, result: { ok: true, id: cleanText(operation.id, "") } });
            emitChange({ type: "task-manager-delete", id: cleanText(operation.id, "") });
            return;
          }

          results.push({ sheet: operation.sheet, result: upsertTaskManagerTask(operation.row || operation.item) });
          return;
        }

        if (operation.sheet === SHEET_NAMES.repeatable) {
          if (operation.op === "delete") {
            const current = readRepeatableLocal().filter((entry) => cleanText(entry.projectId, "") !== cleanText(operation.id, ""));
            writeJson(STORAGE_KEYS.repeatable, current);
            results.push({ sheet: operation.sheet, result: { ok: true, id: cleanText(operation.id, "") } });
            emitChange({ type: "repeatable-delete", id: cleanText(operation.id, "") });
            return;
          }

          results.push({ sheet: operation.sheet, result: upsertRepeatableOverride(operation.row || operation.item) });
          return;
        }

        results.push({ sheet: operation.sheet || "unknown", result: { ok: false, skipped: true } });
      } catch (error) {
        queueRetry(operation);
        results.push({ sheet: operation && operation.sheet ? operation.sheet : "unknown", error: String(error && error.message ? error.message : error) });
      }
    });

    emitChange({ type: "batch-apply", operations: list.length, results });
    return Promise.resolve({ ok: true, applied: results.length, results });
  }

  function importParkingToSheets() {
    const parkingItems = getParkingLotLocal();
    const chunks = [];

    for (let index = 0; index < parkingItems.length; index += 100) {
      chunks.push(parkingItems.slice(index, index + 100));
    }

    return chunks.reduce((promise, chunk) => promise.then(async (acc) => {
      const operations = chunk.map((item) => ({
        op: "upsert",
        sheet: SHEET_NAMES.parkingLot,
        row: item,
      }));
      const result = await batchApplyPlannerChanges(operations);
      acc.push(result);
      return acc;
    }), Promise.resolve([])).then((results) => ({
      ok: true,
      batches: results.length,
      imported: parkingItems.length,
      results,
    }));
  }

  function setUseSheets(enabled) {
    state.useSheets = Boolean(enabled);
  }

  function getUseSheets() {
    return state.useSheets;
  }

  window.PlannerStorage = {
    getParkingLot,
    upsertParkingItem,
    deleteParkingItem,
    importParkingToSheets,
    batchApplyPlannerChanges,
    upsertWeeklyTask,
    deleteWeeklyTask,
    upsertTaskManagerTask,
    upsertRepeatableOverride,
    setUseSheets,
    getUseSheets,
    onChange,
    emitChange,
    getTaskManagerTasks: () => Promise.resolve(clone(readTaskManagerLocal())),
    getRepeatableOverrides: () => Promise.resolve(clone(readRepeatableLocal())),
    getWeeklyPlanner: () => Promise.resolve(clone(readWeeklyPlannerLocal())),
  };
})();