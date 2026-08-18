// Manual Weekly Planner backup restore helper. This file never runs automatically.
(function () {
  function jsonValue(item, objectKey, jsonKey, fallback) {
    if (Object.prototype.hasOwnProperty.call(item, jsonKey)) {
      return item[jsonKey];
    }
    if (Object.prototype.hasOwnProperty.call(item, objectKey)) {
      return JSON.stringify(item[objectKey]);
    }
    return fallback;
  }

  function convertItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const id = source.id || source.taskId || window.generateUuidV4();
    const knownKeys = new Set([
      "id", "taskId", "taskType", "type", "title", "source", "projectId",
      "parentRepeatableId", "occurrenceDate", "occurenceDate", "date", "timeSlot",
      "slot", "bucket", "completed", "overridden", "deletedInstance", "checklist",
      "checklistJson", "checklistOpen", "reminder", "reminderJson", "metadata",
      "metadataJson", "updatedAt", "deleted",
    ]);
    const extraMetadata = {};
    Object.keys(source).forEach((key) => {
      if (!knownKeys.has(key)) {
        extraMetadata[key] = source[key];
      }
    });

    let metadata = source.metadata && typeof source.metadata === "object" ? source.metadata : {};
    if (source.metadataJson) {
      try {
        metadata = { ...metadata, ...(JSON.parse(source.metadataJson) || {}) };
      } catch (error) {
        console.warn("Weekly Planner metadataJson could not be parsed; preserving source metadata.", error);
      }
    }
    metadata = { ...metadata, ...extraMetadata };

    return {
      id,
      taskType: source.taskType || source.type || "curated",
      title: Object.prototype.hasOwnProperty.call(source, "title") ? source.title : "Untitled Task",
      source: Object.prototype.hasOwnProperty.call(source, "source") ? source.source : "unknown",
      projectId: source.projectId || "",
      parentRepeatableId: source.parentRepeatableId || "",
      occurenceDate: source.occurenceDate || source.occurrenceDate || source.date || "",
      date: source.date || "",
      timeSlot: source.timeSlot || source.slot || "morning",
      bucket: source.bucket || source.timeSlot || source.slot || "morning",
      completed: source.completed == null ? false : source.completed,
      overridden: source.overridden == null ? false : source.overridden,
      deletedInstance: source.deletedInstance == null ? false : source.deletedInstance,
      checklistJson: jsonValue(source, "checklist", "checklistJson", "[]"),
      checklistOpen: source.checklistOpen == null ? false : source.checklistOpen,
      reminderJson: jsonValue(source, "reminder", "reminderJson", "{}"),
      metadataJson: JSON.stringify(metadata),
      updatedAt: new Date().toISOString(),
      deleted: source.deleted == null ? false : source.deleted,
    };
  }

  async function importFromBackupJson(jsonString) {
    if (!window.PlannerStorage || typeof window.PlannerStorage.importWeeklyPlannerToSheets !== "function") {
      throw new Error("PlannerStorage must be loaded before running the Weekly Planner backup restore.");
    }

    let backup;
    let weekly;
    try {
      if (typeof jsonString !== "string" || !jsonString.trim()) {
        throw new Error("Weekly Planner backup JSON is empty.");
      }
      backup = JSON.parse(jsonString);
      if (!backup || typeof backup !== "object") {
        throw new Error("Weekly Planner backup must be a JSON object.");
      }
      weekly = JSON.parse(backup.hm_weekly_planner || "[]");
      if (!Array.isArray(weekly) && (!weekly || !Array.isArray(weekly.tasks))) {
        throw new Error("Backup does not contain a valid hm_weekly_planner task list.");
      }
    } catch (error) {
      const message = `Unable to parse Weekly Planner backup JSON: ${error.message || error}`;
      console.error(message);
      throw new Error(message);
    }

    const items = Array.isArray(weekly)
      ? weekly
      : weekly && typeof weekly === "object" && Array.isArray(weekly.tasks)
        ? weekly.tasks
        : [];
    const mutations = [];
    let skipped = 0;

    items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        skipped += 1;
        console.warn(`Skipped invalid Weekly Planner backup item at index ${index}.`);
        return;
      }
      mutations.push({
        op: "upsert",
        sheet: "Planner_WeeklyTasks",
        row: convertItem(item),
      });
    });

    console.info(`Restoring ${mutations.length} Weekly Planner item(s); skipped ${skipped}.`);
    try {
      const result = await window.PlannerStorage.importWeeklyPlannerToSheets(mutations);
      console.info("Weekly Planner backup restore completed.", result);
      return { ...result, restored: mutations.length, skipped };
    } catch (error) {
      console.error("Weekly Planner backup restore failed.", error);
      throw error;
    }
  }

  function importFromFile(file) {
    if (!file || typeof file.text !== "function") {
      return Promise.reject(new Error("Please provide a JSON backup file."));
    }
    return file.text().then((raw) => importFromBackupJson(raw));
  }

  async function importFromUrl(url) {
    const target = String(url || "").trim();
    if (!target) throw new Error("A Weekly Planner backup URL is required.");
    const response = await fetch(target);
    if (response.status === 404) {
      throw new Error(`Backup file not found at: ${target}`);
    }
    if (!response.ok) {
      throw new Error(`Unable to load Weekly Planner backup (${response.status}) from: ${target}`);
    }
    return importFromBackupJson(await response.text());
  }

  window.WeeklyPlannerRestore = { importFromBackupJson, importFromFile, importFromUrl };
  window.runWeeklyPlannerRestoreFromUrl = (url) => window.WeeklyPlannerRestore.importFromUrl(url);
  window.runWeeklyPlannerRestoreFromFile = (file) => window.WeeklyPlannerRestore.importFromFile(file);
  window.runWeeklyPlannerRestoreFromPaste = (jsonString) => window.WeeklyPlannerRestore.importFromBackupJson(jsonString);
  window.runWeeklyPlannerRestore = (path) => window.WeeklyPlannerRestore.importFromUrl(path);
})();
