// PlannerStorage provides the local-first persistence boundary for planner features.
(function () {
  const PlannerCache = {
    projects: null,
    tasks: null,
    weekly: null,
    overrides: null,
    expires: 0,
  };

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
    weeklyPlannerWriteQueue: Promise.resolve(),
  };

  function cacheValid() {
    return Date.now() < PlannerCache.expires;
  }

  function setCache(data) {
    Object.assign(PlannerCache, data || {});
    PlannerCache.expires = Date.now() + 5 * 60 * 1000;
  }

  function invalidateCache(keys) {
    (Array.isArray(keys) ? keys : []).forEach((key) => {
      PlannerCache[key] = null;
    });
  }

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

  function parkingItemToSheetRow(item) {
    const normalized = normalizeParkingItem(item);
    const convertedTo = normalized.convertedTo && typeof normalized.convertedTo === "object" ? normalized.convertedTo : {};
    return {
      id: normalized.id,
      title: normalized.title,
      notes: normalized.notes,
      tags: normalized.tags,
      priority: normalized.priority,
      color: normalized.color,
      checklistJson: normalized.checklistJson,
      reminderJson: normalized.reminderJson,
      metadataJson: normalized.metadataJson,
      convertedToType: cleanText(convertedTo.type, ""),
      convertedToId: cleanText(convertedTo.id, ""),
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      deleted: normalized.deleted,
    };
  }

  function sheetRowToParkingItem(row) {
    const source = row && typeof row === "object" ? row : {};
    const convertedToType = cleanText(source.convertedToType, "");
    const convertedToId = cleanText(source.convertedToId, "");
    return normalizeParkingItem({
      ...source,
      convertedTo: convertedToType || convertedToId ? { type: convertedToType, id: convertedToId } : null,
      deleted: source.deleted === true || String(source.deleted).toLowerCase() === "true",
    });
  }

  function upsertParkingItemLocal(item) {
    const current = readJson(STORAGE_KEYS.parkingLot, []);
    const existingEntry = Array.isArray(current) ? current.find((entry) => cleanText(entry.id, "") === cleanText(item && item.id, "")) : null;
    const normalized = normalizeParkingItem({ ...(existingEntry || {}), ...item });
    const index = Array.isArray(current) ? current.findIndex((entry) => cleanText(entry.id, "") === normalized.id) : -1;

    if (index >= 0) {
      current[index] = normalized;
    } else {
      current.push(normalized);
    }

    saveParkingLot(current);
    emitChange({ type: "parking-lot-upsert", item: clone(normalized) });
    return clone(normalized);
  }

  function deleteParkingItemLocal(id, options) {
    const targetId = cleanText(id, "");
    const hardDelete = Boolean(options && options.hardDelete);
    const current = readJson(STORAGE_KEYS.parkingLot, []);
    const index = Array.isArray(current) ? current.findIndex((entry) => cleanText(entry.id, "") === targetId) : -1;

    if (index < 0) {
      return { ok: false, id: targetId };
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
    return { ok: true, id: targetId, hardDelete };
  }

  async function sendParkingLotBatch(mutations) {
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
      throw new Error(`Parking Lot write failed (${response.status}).`);
    }
    return { ok: true, clientTxnId };
  }

  // Read Parking Lot rows from Sheets and normalize the schema.
  async function getParkingLotFromSheets() {
    console.log("ParkingLot: calling getParkingLotState");
    const url = getSheetsEndpoint("getParkingLotState");
    url.searchParams.set("spreadsheetId", getSpreadsheetId());
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Parking Lot read failed (${response.status}).`);
    }
    const payload = await response.json();
    if (!payload || payload.ok === false) {
      throw new Error(cleanText(payload && payload.error, "Parking Lot read failed."));
    }
    if (!Array.isArray(payload.rows) || !payload.rows.length) {
      console.warn("ParkingLot: Sheets returned empty list — sheet may not exist yet");
    }
    return (Array.isArray(payload.rows) ? payload.rows : []).map(sheetRowToParkingItem);
  }

  // Sheets is the source of truth; fall back to the local offline cache only when Sheets is unreachable.
  async function getParkingLot() {
    if (state.useSheets) {
      try {
        const rows = await getParkingLotFromSheets();
        saveParkingLot(rows);
        const items = rows.filter((item) => item.deleted !== true).map((item) => clone(item));
        return items;
      } catch (error) {
        console.warn("Parking Lot Sheets read failed; using local fallback.", error);
        emitChange({ type: "parking-lot-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    return getParkingLotLocal();
  }

  // Persist a Parking Lot item locally first, then sync its row to Planner_ParkingLot.
  async function upsertParkingItem(item) {
    const normalized = upsertParkingItemLocal({ ...item, updatedAt: nowIso() });
    if (state.useSheets) {
      try {
        console.log("ParkingLot: upsertParkingItem \u2192 batchApplyPlannerChanges");
        await sendParkingLotBatch([{ op: "upsert", sheet: SHEET_NAMES.parkingLot, row: parkingItemToSheetRow(normalized) }]);
        // The optimistic emit fired before this write finished, so re-emit now that Sheets has the confirmed row.
        emitChange({ type: "parking-lot-sync", item: clone(normalized) });
      } catch (error) {
        queueRetry({ op: "upsert", sheet: SHEET_NAMES.parkingLot, row: parkingItemToSheetRow(normalized) });
        console.warn("Parking Lot Sheets write queued for retry.", error);
        emitChange({ type: "parking-lot-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    return clone(normalized);
  }

  // The Sheets write goes out via a "no-cors" POST, so its response is always opaque — we cannot see
  // whether the Apps Script side actually applied the delete (e.g. it may have silently no-opped from a
  // stale updatedAt conflict check or a stale deployment). Verify with a real, readable GET and retry
  // with a fresh timestamp if the row still shows up as not deleted.
  async function verifyParkingLotDeleteApplied(targetId, hardDelete) {
    try {
      const rows = await getParkingLotFromSheets();
      const match = rows.find((row) => cleanText(row.id, "") === targetId);
      return hardDelete ? !match : (!match || match.deleted === true);
    } catch (error) {
      return false;
    }
  }

  async function syncParkingLotDelete(targetId, hardDelete) {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        console.log("ParkingLot: deleteParkingItem \u2192 batchApplyPlannerChanges");
        await sendParkingLotBatch([{ op: "delete", sheet: SHEET_NAMES.parkingLot, id: targetId, hardDelete, row: { id: targetId, updatedAt: nowIso() } }]);
      } catch (error) {
        console.warn("Parking Lot Sheets delete request failed.", error);
      }
      if (await verifyParkingLotDeleteApplied(targetId, hardDelete)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return false;
  }

  // Soft-delete a Parking Lot item locally first, then sync the deletion to Sheets.
  async function deleteParkingItem(id, options) {
    const targetId = cleanText(id, "");
    const hardDelete = Boolean(options && options.hardDelete);
    const result = deleteParkingItemLocal(id, options);
    // Always attempt the Sheets delete when a valid id is given, even if the item was missing from the
    // local offline cache (e.g. a stale/never-populated cache) — the row can still exist in Sheets.
    if (state.useSheets && targetId) {
      const applied = await syncParkingLotDelete(targetId, hardDelete);
      if (applied) {
        // The optimistic emit fired before this write finished, so re-emit now that Sheets has the confirmed delete.
        emitChange({ type: "parking-lot-sync", id: targetId });
      } else {
        queueRetry({ op: "delete", sheet: SHEET_NAMES.parkingLot, id: targetId, hardDelete, row: { id: targetId, updatedAt: nowIso() } });
        console.warn("Parking Lot Sheets delete could not be verified after retries; queued for later retry.");
        emitChange({ type: "parking-lot-sync-error", error: "Parking Lot delete could not be verified." });
      }
    }
    return result.ok ? result : { ok: true, id: targetId, hardDelete };
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
    if (cacheValid() && Array.isArray(PlannerCache.tasks)) {
      return clone(PlannerCache.tasks);
    }
    if (state.useSheets) {
      try {
        const rows = await getTaskManagerFromSheets();
        saveTaskManagerLocal(rows);
        const sorted = clone(rows).sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
        setCache({ tasks: sorted });
        return sorted;
      } catch (error) {
        console.warn("Task Manager Sheets read failed; using local fallback.", error);
        emitChange({ type: "task-manager-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    const sorted = clone(readTaskManagerLocal()).sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    setCache({ tasks: sorted });
    return sorted;
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
    invalidateCache(["tasks"]);
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
    invalidateCache(["overrides"]);
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

  function normalizeWeeklySheetTask(task, defaultOrder) {
    const existing = task && typeof task === "object" ? task : {};
    const parseObject = (value, fallback) => {
      if (value && typeof value === "object") return value;
      try { return JSON.parse(cleanText(value, "")) || fallback; } catch (error) { return fallback; }
    };
    const parseArray = (value) => {
      const parsed = parseObject(value, []);
      return Array.isArray(parsed) ? parsed : [];
    };
    const metadata = parseObject(existing.metadata || existing.metadataJson, {});
    return {
      id: ensureUuid(existing.id || existing.taskId),
      taskId: ensureUuid(existing.id || existing.taskId),
      taskType: cleanText(existing.taskType || existing.type, "curated"),
      type: cleanText(existing.taskType || existing.type, "curated"),
      title: cleanText(existing.title, "Untitled Task"),
      source: cleanText(existing.source, "unknown"),
      projectId: cleanText(existing.projectId, ""),
      parentRepeatableId: cleanText(existing.parentRepeatableId, ""),
      occurrenceDate: cleanText(existing.occurrenceDate || existing.occurenceDate, cleanText(existing.date, "")),
      date: cleanText(existing.date, ""),
      timeSlot: cleanText(existing.timeSlot, "morning"),
      bucket: cleanText(existing.bucket, cleanText(existing.timeSlot, "morning")),
      completed: existing.completed === true || String(existing.completed).toLowerCase() === "true",
      overridden: existing.overridden === true || String(existing.overridden).toLowerCase() === "true",
      deletedInstance: existing.deletedInstance === true || String(existing.deletedInstance).toLowerCase() === "true",
      checklist: parseArray(existing.checklist || existing.checklistJson),
      checklistOpen: existing.checklistOpen === true || String(existing.checklistOpen).toLowerCase() === "true",
      reminder: parseObject(existing.reminder || existing.reminderJson, {}),
      metadata,
      priority: existing.priority != null ? existing.priority : null,
      recurrence: cleanText(existing.recurrence, ""),
      order: existing.order != null ? existing.order : (metadata.order != null ? metadata.order : defaultOrder),
      updatedAt: cleanText(existing.updatedAt, nowIso()),
    };
  }

  function weeklyTaskToSheetRow(task) {
    const normalized = normalizeWeeklySheetTask(task, 1);
    return {
      id: normalized.id,
      taskType: normalized.taskType,
      title: normalized.title,
      source: normalized.source,
      projectId: normalized.projectId,
      parentRepeatableId: normalized.parentRepeatableId,
      occurenceDate: normalized.occurrenceDate,
      date: normalized.date,
      timeSlot: normalized.timeSlot,
      bucket: normalized.bucket,
      completed: normalized.completed,
      overridden: normalized.overridden,
      deletedInstance: normalized.deletedInstance,
      checklistJson: JSON.stringify(normalized.checklist || []),
      checklistOpen: normalized.checklistOpen,
      reminderJson: JSON.stringify(normalized.reminder || {}),
      metadataJson: JSON.stringify({ ...(normalized.metadata || {}), order: normalized.order }),
      updatedAt: normalized.updatedAt,
      deleted: false,
    };
  }

  function sheetRowToWeeklyTask(row, index) {
    return normalizeWeeklySheetTask({
      ...row,
      occurrenceDate: row.occurenceDate || row.occurrenceDate,
      checklist: row.checklistJson,
      reminder: row.reminderJson,
      metadata: row.metadataJson,
    }, index + 1);
  }

  function sortWeeklyTasks(tasks) {
    const slotOrder = { morning: 0, afternoon: 1, evening: 2 };
    return [...(Array.isArray(tasks) ? tasks : [])].sort((left, right) => {
      const dateDifference = cleanText(left.date, "").localeCompare(cleanText(right.date, ""));
      if (dateDifference) return dateDifference;
      const slotDifference = (slotOrder[cleanText(left.timeSlot, "morning")] || 0) - (slotOrder[cleanText(right.timeSlot, "morning")] || 0);
      if (slotDifference) return slotDifference;
      return Number(left.order || 0) - Number(right.order || 0);
    });
  }

  // The local snapshot stays authoritative so a lagging Sheets write cannot restore removed tasks.
  function saveWeeklyPlannerLocal(planner) {
    const snapshot = {
      weekStartDate: cleanText(planner && planner.weekStartDate, ""),
      tasks: Array.isArray(planner && planner.tasks) ? planner.tasks : [],
    };
    writeJson(STORAGE_KEYS.weeklyPlanner, snapshot);
    setCache({ weekly: { ...clone(snapshot), tasks: sortWeeklyTasks(snapshot.tasks) } });
  }

  function upsertWeeklyTaskLocal(task) {
    const planner = readWeeklyPlannerLocal();
    const normalized = normalizeWeeklySheetTask({ ...task, updatedAt: nowIso() }, planner.tasks.length + 1);

    const index = planner.tasks.findIndex((entry) => cleanText(entry.id || entry.taskId, "") === normalized.id);
    if (index >= 0) {
      planner.tasks[index] = { ...planner.tasks[index], ...normalized };
    } else {
      planner.tasks.push(normalized);
    }

    saveWeeklyPlannerLocal(planner);
    emitChange({ type: "weekly-task-upsert", item: clone(normalized) });
    return clone(normalized);
  }

  function deleteWeeklyTaskLocal(id, options) {
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

    saveWeeklyPlannerLocal(planner);
    emitChange({ type: "weekly-task-delete", id: targetId, hardDelete });
    return { ok: true, id: targetId, hardDelete };
  }

  // Read Weekly Planner rows from Sheets first, preserving the existing planner object shape.
  async function getWeeklyPlanner() {
    if (cacheValid() && PlannerCache.weekly) {
      return clone(PlannerCache.weekly);
    }
    if (state.useSheets) {
      try {
        const url = getSheetsEndpoint("getWeeklyPlannerState");
        url.searchParams.set("spreadsheetId", getSpreadsheetId());
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Weekly Planner read failed (${response.status}).`);
        const payload = await response.json();
        if (!payload || payload.ok === false) throw new Error(cleanText(payload && payload.error, "Weekly Planner read failed."));
        const local = readWeeklyPlannerLocal();
        const tasks = (Array.isArray(payload.rows) ? payload.rows : []).map(sheetRowToWeeklyTask);
        if (!tasks.length && Array.isArray(local.tasks) && local.tasks.length) {
          console.warn("Weekly Planner Sheets state is empty; preserving local planner tasks for manual migration.");
          return { ...clone(local), tasks: sortWeeklyTasks(local.tasks) };
        }
        const planner = { weekStartDate: cleanText(local.weekStartDate, ""), tasks: sortWeeklyTasks(tasks) };
        saveWeeklyPlannerLocal(planner);
        setCache({ weekly: planner });
        return clone(planner);
      } catch (error) {
        console.warn("Weekly Planner Sheets read failed; using local fallback.", error);
      }
    }
    const planner = readWeeklyPlannerLocal();
    const result = { ...clone(planner), tasks: sortWeeklyTasks(planner.tasks) };
    setCache({ weekly: result });
    return result;
  }

  // Persist one Weekly Planner task optimistically, then sync its row to Planner_WeeklyTasks.
  async function upsertWeeklyTask(task) {
    const normalized = upsertWeeklyTaskLocal(task);
    if (state.useSheets) {
      try {
        await sendWeeklyPlannerBatch([{ op: "upsert", sheet: SHEET_NAMES.weeklyTasks, row: weeklyTaskToSheetRow(normalized) }]);
      } catch (error) {
        queueRetry({ op: "upsert", sheet: SHEET_NAMES.weeklyTasks, row: weeklyTaskToSheetRow(normalized) });
        emitChange({ type: "weekly-task-sync-error", error: String(error && error.message ? error.message : error) });
      }
    }
    return clone(normalized);
  }

  // Delete one Weekly Planner task optimistically, then sync its deletion to Sheets.
  async function deleteWeeklyTask(id, options) {
    const result = deleteWeeklyTaskLocal(id, options);
    if (state.useSheets && result.ok) {
      try {
        await sendWeeklyPlannerBatch([{ op: "delete", sheet: SHEET_NAMES.weeklyTasks, id: result.id, row: { id: result.id, updatedAt: nowIso() } }]);
      } catch (error) {
        queueRetry({ op: "delete", sheet: SHEET_NAMES.weeklyTasks, id: result.id, row: { id: result.id, updatedAt: nowIso() } });
      }
    }
    return result;
  }

  async function sendWeeklyPlannerBatch(mutations) {
    const url = getSheetsEndpoint("batchApplyPlannerChanges");
    const payload = { action: "batchApplyPlannerChanges", spreadsheetId: getSpreadsheetId(), clientTxnId: ensureUuid(), mutations };
    const response = await fetch(url.toString(), { method: "POST", mode: "no-cors", body: JSON.stringify(payload) });
    if (response.type !== "opaque" && !response.ok) throw new Error(`Weekly Planner write failed (${response.status}).`);
    return { ok: true, clientTxnId: payload.clientTxnId };
  }

  async function importWeeklyPlannerToSheets(sourcePlanner) {
    if (Array.isArray(sourcePlanner)) {
      const result = await sendWeeklyPlannerBatch(sourcePlanner);
      console.info("Imported Weekly Planner mutations to Sheets.", sourcePlanner.length);
      return { ...result, imported: sourcePlanner.length };
    }
    const planner = sourcePlanner && typeof sourcePlanner === "object" ? sourcePlanner : readWeeklyPlannerLocal();
    const rows = (Array.isArray(planner.tasks) ? planner.tasks : []).map((task, index) => weeklyTaskToSheetRow({ ...task, updatedAt: task.updatedAt || nowIso(), order: task.order || index + 1 }));
    const mutations = rows.map((row) => ({ op: "upsert", sheet: SHEET_NAMES.weeklyTasks, row }));
    const result = await sendWeeklyPlannerBatch(mutations);
    console.info("Imported Weekly Planner rows to Sheets.", rows.length);
    return { ...result, imported: rows.length };
  }

  // Persist the complete Weekly Planner snapshot while keeping week navigation metadata local.
  function saveWeeklyPlannerState(planner) {
    const nextPlanner = planner && typeof planner === "object" ? planner : { weekStartDate: "", tasks: [] };
    const previousTasks = readWeeklyPlannerLocal().tasks;
    const nextTasks = Array.isArray(nextPlanner.tasks) ? clone(nextPlanner.tasks) : [];
    saveWeeklyPlannerLocal({ weekStartDate: cleanText(nextPlanner.weekStartDate, ""), tasks: nextTasks });

    state.weeklyPlannerWriteQueue = state.weeklyPlannerWriteQueue.then(async () => {
      const nextIds = new Set(nextTasks.map((task) => cleanText(task && (task.id || task.taskId), "")));
      const currentRows = new Map((Array.isArray(previousTasks) ? previousTasks : []).map((task) => {
        const row = weeklyTaskToSheetRow(task);
        const comparable = { ...row };
        delete comparable.updatedAt;
        return [row.id, JSON.stringify(comparable)];
      }));
      const operations = [];
      nextTasks.forEach((task) => {
        const row = weeklyTaskToSheetRow(task);
        const comparable = { ...row };
        delete comparable.updatedAt;
        if (currentRows.get(row.id) !== JSON.stringify(comparable)) {
          operations.push({ op: "upsert", sheet: SHEET_NAMES.weeklyTasks, row });
        }
      });
      (Array.isArray(previousTasks) ? previousTasks : []).forEach((task) => {
        const id = cleanText(task && (task.id || task.taskId), "");
        if (id && !nextIds.has(id)) {
          operations.push({ op: "delete", sheet: SHEET_NAMES.weeklyTasks, id, row: { id, updatedAt: nowIso() } });
        }
      });
      if (operations.length) {
        await batchApplyPlannerChanges(operations);
      }
      emitChange({ type: "weekly-snapshot-saved", operations: operations.length });
    }).catch((error) => {
      console.warn("Weekly Planner snapshot save failed.", error);
      emitChange({ type: "weekly-task-sync-error", error: String(error && error.message ? error.message : error) });
    });
    return state.weeklyPlannerWriteQueue;
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
            results.push({ sheet: operation.sheet, result: deleteParkingItemLocal(operation.id, { hardDelete: Boolean(operation.hardDelete) }) });
            return;
          }

          results.push({ sheet: operation.sheet, result: upsertParkingItemLocal(operation.row || operation.item) });
          return;
        }

        if (operation.sheet === SHEET_NAMES.weeklyTasks) {
          if (operation.op === "delete") {
            results.push({ sheet: operation.sheet, result: deleteWeeklyTaskLocal(operation.id, { hardDelete: Boolean(operation.hardDelete) }) });
            return;
          }

          results.push({ sheet: operation.sheet, result: upsertWeeklyTaskLocal(operation.row || operation.item) });
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

    if (state.useSheets && list.some((operation) => operation && operation.sheet === SHEET_NAMES.weeklyTasks)) {
      const weeklyOperations = list.filter((operation) => operation && operation.sheet === SHEET_NAMES.weeklyTasks);
      try {
        await sendWeeklyPlannerBatch(weeklyOperations.map((operation) => ({
          ...operation,
          row: operation.row ? weeklyTaskToSheetRow(operation.row) : operation.row,
        })));
      } catch (error) {
        weeklyOperations.forEach(queueRetry);
        console.warn("Weekly Planner batch queued for retry.", error);
      }
    }

    if (state.useSheets && list.some((operation) => operation && operation.sheet === SHEET_NAMES.taskManager)) {
      const taskManagerOperations = list.filter((operation) => operation && operation.sheet === SHEET_NAMES.taskManager);
      try {
        await sendTaskManagerBatch(taskManagerOperations);
      } catch (error) {
        taskManagerOperations.forEach(queueRetry);
        console.warn("Planner batch queued for retry.", error);
      }
    }

    if (state.useSheets && list.some((operation) => operation && operation.sheet === SHEET_NAMES.parkingLot)) {
      const parkingOperations = list.filter((operation) => operation && operation.sheet === SHEET_NAMES.parkingLot);
      try {
        await sendParkingLotBatch(parkingOperations.map((operation) => ({
          ...operation,
          row: operation.row ? parkingItemToSheetRow(operation.row) : operation.row,
        })));
      } catch (error) {
        parkingOperations.forEach(queueRetry);
        console.warn("Parking Lot batch queued for retry.", error);
        emitChange({ type: "parking-lot-sync-error", error: String(error && error.message ? error.message : error) });
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

  function getCachedProjects() {
    return cacheValid() && Array.isArray(PlannerCache.projects)
      ? clone(PlannerCache.projects)
      : null;
  }

  function setCachedProjects(projects) {
    if (Array.isArray(projects)) {
      setCache({ projects: clone(projects) });
    }
  }

  async function prefetchAll() {
    if (cacheValid() && PlannerCache.tasks && PlannerCache.weekly && PlannerCache.overrides) {
      return { ...PlannerCache };
    }
    const projectsPromise = typeof window.loadAllProjects === "function"
      ? window.loadAllProjects().catch((error) => {
        console.warn("Projects prefetch failed.", error);
        return null;
      })
      : Promise.resolve(null);
    const [projects, tasks, weekly, overrides] = await Promise.all([
      projectsPromise,
      getTaskManager(),
      getWeeklyPlanner(),
      Promise.resolve(clone(readRepeatableLocal())),
    ]);
    setCache({ projects, tasks, weekly, overrides });
    return { ...PlannerCache };
  }

  window.PlannerStorage = {
    getParkingLot,
    upsertParkingItem,
    deleteParkingItem,
    importParkingToSheets,
    batchApplyPlannerChanges,
    getWeeklyPlanner,
    saveWeeklyPlannerState,
    importWeeklyPlannerToSheets,
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
    getCachedProjects,
    setCachedProjects,
    prefetchAll,
    onChange,
    emitChange,
    getTaskManagerTasks: () => getTaskManager(),
    getRepeatableOverrides: () => {
      if (cacheValid() && Array.isArray(PlannerCache.overrides)) {
        return Promise.resolve(clone(PlannerCache.overrides));
      }
      const overrides = clone(readRepeatableLocal());
      setCache({ overrides });
      return Promise.resolve(overrides);
    },
  };
})();