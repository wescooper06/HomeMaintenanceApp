// PlannerStorage provides the local-first persistence boundary for planner features.
(function () {
  const STORAGE_KEYS = {
    parkingLot: "hm_parking_lot",
    retryQueue: "hm_sheet_write_retry_queue",
    taskManager: "hm_task_manager_tasks",
    curatedTasks: "hm_planner_curated_tasks",
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
    useSheets: Boolean(window.APP_CONFIG && window.APP_CONFIG.USE_SHEETS),
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
    return Array.isArray(items) ? items.map((item) => normalizeTaskManagerTask(item)) : [];
  }

  function normalizeTaskManagerTask(task, defaultOrder) {
    const existing = task && typeof task === "object" ? task : {};
    const id = ensureUuid(existing.id || existing.taskId);
    return {
      id,
      projectId: cleanText(existing.projectId, id),
      title: cleanText(existing.title, "Untitled Task"),
      source: cleanText(existing.source, "unknown"),
      category: cleanText(existing.category, "uncategorized"),
      state: cleanText(existing.state, "unknown"),
      priority: existing.priority != null ? existing.priority : 3,
      order: existing.order != null ? existing.order : defaultOrder,
      recurrence: cleanText(existing.recurrence, ""),
      startDate: cleanText(existing.startDate, ""),
      updatedAt: cleanText(existing.updatedAt, nowIso()),
      metadataJson: cleanText(existing.metadataJson, existing.metadata ? JSON.stringify(existing.metadata) : "{}"),
    };
  }

  function saveTaskManagerLocal(items) {
    writeJson(STORAGE_KEYS.taskManager, Array.isArray(items) ? items : []);
  }

  function getCuratedTasks() {
    const items = readJson(STORAGE_KEYS.curatedTasks, []);
    return Array.isArray(items) ? clone(items) : [];
  }

  async function upsertCuratedTask(task) {
    const current = getCuratedTasks();
    const normalized = {
      taskId: ensureUuid(task && (task.taskId || task.id)),
      projectId: cleanText(task && task.projectId, ""),
      title: cleanText(task && task.title, "Untitled Task"),
      source: cleanText(task && task.source, "unknown"),
      category: cleanText(task && task.category, "uncategorized"),
      recurrence: cleanText(task && task.recurrence, ""),
      priority: task && task.priority != null ? task.priority : 3,
      order: task && task.order != null ? task.order : current.length + 1,
    };
    const index = current.findIndex((item) => cleanText(item.taskId, "") === normalized.taskId);
    if (index >= 0) current[index] = { ...current[index], ...normalized };
    else current.push(normalized);
    writeJson(STORAGE_KEYS.curatedTasks, current);
    emitChange({ type: "curated-task-upsert", item: clone(normalized) });
    return clone(normalized);
  }

  function getSheetsEndpoint(action) {
    const baseUrl = cleanText(window.APP_CONFIG && window.APP_CONFIG.GOOGLE_SHEETS_WRITE_URL, "");
    if (!baseUrl) {
      throw new Error("Google Apps Script endpoint is not configured.");
    }
    const url = new URL(baseUrl);
    url.searchParams.set("action", action);
    return url;
  }

  function getSpreadsheetId() {
    return cleanText(window.APP_CONFIG && window.APP_CONFIG.GOOGLE_SHEETS_SPREADSHEET_ID, "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k");
  }

  // Read Task Manager rows from Sheets and normalize the fixed planner schema.
  async function getTaskManagerFromSheets() {
    const url = getSheetsEndpoint("getTaskManagerState");
    url.searchParams.set("spreadsheetId", getSpreadsheetId());
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Task Manager read failed (${response.status}).`);
    }
    const payload = await response.json();
    if (!payload || payload.ok === false) {
      throw new Error(cleanText(payload && payload.error, "Task Manager read failed."));
    }
    return (Array.isArray(payload.rows) ? payload.rows : []).map((row, index) => normalizeTaskManagerTask(row, index + 1));
  }

  async function sendTaskManagerBatch(mutations) {
    const url = getSheetsEndpoint("batchApplyPlannerChanges");
    const clientTxnId = ensureUuid();
    const payload = {
      action: "batchApplyPlannerChanges",
      spreadsheetId: getSpreadsheetId(),
      clientTxnId,
      mutations,
    };
    const response = await fetch(url.toString(), {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });
    if (response.type !== "opaque" && !response.ok) {
      throw new Error(`Task Manager write failed (${response.status}).`);
    }
    return { ok: true, clientTxnId };
  }

  // Return Sheets rows first when enabled, falling back to the optimistic local copy.
  async function getTaskManager() {
    if (state.useSheets) {
      try {
        const rows = await getTaskManagerFromSheets();
        saveTaskManagerLocal(rows);
        return clone(rows).sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
      } catch (error) {
        console.warn("Task Manager Sheets read failed; using local fallback.", error);
        emitChange({ type: "task-manager-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    return clone(readTaskManagerLocal()).sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  }

  // Persist a Task Manager task locally first, then sync its latest timestamp to Sheets.
  async function upsertTaskManagerTask(task) {
    const current = readTaskManagerLocal();
    const normalized = normalizeTaskManagerTask({ ...task, updatedAt: nowIso() }, current.length + 1);

    const index = current.findIndex((entry) => cleanText(entry.id || entry.taskId, "") === normalized.id);
    if (index >= 0) {
      current[index] = { ...current[index], ...normalized };
    } else {
      current.push(normalized);
    }

    saveTaskManagerLocal(current);
    emitChange({ type: "task-manager-upsert", item: clone(normalized) });
    if (state.useSheets) {
      try {
        await sendTaskManagerBatch([{ op: "upsert", sheet: SHEET_NAMES.taskManager, row: normalized }]);
      } catch (error) {
        queueRetry({ op: "upsert", sheet: SHEET_NAMES.taskManager, row: normalized });
        console.warn("Task Manager Sheets write queued for retry.", error);
        emitChange({ type: "task-manager-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    return clone(normalized);
  }

  // Remove a Task Manager task locally first and enqueue the Sheets delete on failure.
  async function deleteTaskManagerTask(id) {
    const targetId = cleanText(id, "");
    const current = readTaskManagerLocal().filter((entry) => cleanText(entry.id || entry.taskId, "") !== targetId);
    saveTaskManagerLocal(current);
    emitChange({ type: "task-manager-delete", id: targetId });
    if (state.useSheets) {
      try {
        await sendTaskManagerBatch([{ op: "delete", sheet: SHEET_NAMES.taskManager, id: targetId, row: { id: targetId, updatedAt: nowIso() } }]);
      } catch (error) {
        queueRetry({ op: "delete", sheet: SHEET_NAMES.taskManager, id: targetId, row: { id: targetId, updatedAt: nowIso() } });
        console.warn("Task Manager Sheets delete queued for retry.", error);
        emitChange({ type: "task-manager-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    return { ok: true, id: targetId };
  }

  // Batch-import the legacy local Task Manager copy without deleting it.
  async function importTaskManagerToSheets(sourceRows) {
    const rows = (Array.isArray(sourceRows) ? sourceRows : readTaskManagerLocal())
      .map((row, index) => normalizeTaskManagerTask(row, index + 1));
    const mutations = rows.map((row) => ({ op: "upsert", sheet: SHEET_NAMES.taskManager, row }));
    try {
      const result = await sendTaskManagerBatch(mutations);
      console.info("Imported Task Manager rows to Sheets.", rows.length);
      return { ...result, imported: rows.length };
    } catch (error) {
      console.error("Task Manager migration failed.", error);
      mutations.forEach(queueRetry);
      throw error;
    }
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

  async function batchApplyPlannerChanges(operations) {
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
            const current = readTaskManagerLocal().filter((entry) => cleanText(entry.id || entry.taskId, "") !== cleanText(operation.id, ""));
            writeJson(STORAGE_KEYS.taskManager, current);
            results.push({ sheet: operation.sheet, result: { ok: true, id: cleanText(operation.id, "") } });
            emitChange({ type: "task-manager-delete", id: cleanText(operation.id, "") });
            return;
          }

          const current = readTaskManagerLocal();
          const normalized = normalizeTaskManagerTask({ ...(operation.row || operation.item), updatedAt: nowIso() }, current.length + 1);
          const index = current.findIndex((entry) => cleanText(entry.id || entry.taskId, "") === normalized.id);
          if (index >= 0) current[index] = { ...current[index], ...normalized };
          else current.push(normalized);
          saveTaskManagerLocal(current);
          emitChange({ type: "task-manager-upsert", item: clone(normalized) });
          results.push({ sheet: operation.sheet, result: clone(normalized) });
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

    if (state.useSheets && list.some((operation) => operation && operation.sheet === SHEET_NAMES.taskManager)) {
      const taskManagerOperations = list.filter((operation) => operation && operation.sheet === SHEET_NAMES.taskManager);
      try {
        await sendTaskManagerBatch(taskManagerOperations);
      } catch (error) {
        taskManagerOperations.forEach(queueRetry);
        console.warn("Planner batch queued for retry.", error);
      }
    }
    emitChange({ type: "batch-apply", operations: list.length, results });
    return { ok: true, applied: results.length, results };
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
    getTaskManager,
    getCuratedTasks,
    upsertCuratedTask,
    upsertWeeklyTask,
    deleteWeeklyTask,
    upsertTaskManagerTask,
    deleteTaskManagerTask,
    importTaskManagerToSheets,
    upsertRepeatableOverride,
    setUseSheets,
    getUseSheets,
    onChange,
    emitChange,
    getTaskManagerTasks: () => getTaskManager(),
    getRepeatableOverrides: () => Promise.resolve(clone(readRepeatableLocal())),
    getWeeklyPlanner: () => Promise.resolve(clone(readWeeklyPlannerLocal())),
  };
})();