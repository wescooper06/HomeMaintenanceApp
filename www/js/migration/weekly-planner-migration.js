// Manual Weekly Planner migration helper. This file is intentionally not loaded automatically.
(function () {
  function getJsonField(item, objectKey, jsonKey, fallback) {
    if (Object.prototype.hasOwnProperty.call(item, jsonKey)) {
      return item[jsonKey];
    }
    if (Object.prototype.hasOwnProperty.call(item, objectKey)) {
      return JSON.stringify(item[objectKey]);
    }
    return fallback;
  }

  function convertWeeklyItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const knownKeys = new Set([
      "id", "taskId", "taskType", "type", "title", "source", "projectId",
      "parentRepeatableId", "occurrenceDate", "occurenceDate", "date", "timeSlot",
      "bucket", "completed", "overridden", "deletedInstance", "checklist",
      "checklistJson", "checklistOpen", "reminder", "reminderJson", "metadata",
      "metadataJson", "updatedAt", "deleted",
    ]);
    const legacyFields = {};
    Object.keys(source).forEach((key) => {
      if (!knownKeys.has(key)) legacyFields[key] = source[key];
    });

    let metadataJson = source.metadataJson;
    if (!metadataJson || Object.keys(legacyFields).length) {
      let metadata = source.metadata && typeof source.metadata === "object" ? source.metadata : {};
      if (metadataJson) {
        try { metadata = { ...metadata, ...(JSON.parse(metadataJson) || {}) }; } catch (error) { /* Preserve source metadata. */ }
      }
      metadata = { ...metadata, ...legacyFields };
      metadataJson = JSON.stringify(metadata);
    }

    const id = source.id || source.taskId || window.generateUuidV4();
    return {
      id,
      taskType: source.taskType || source.type || "curated",
      title: source.title == null ? "Untitled Task" : source.title,
      source: source.source || "unknown",
      projectId: source.projectId || "",
      parentRepeatableId: source.parentRepeatableId || "",
      occurenceDate: source.occurenceDate || source.occurrenceDate || source.date || "",
      date: source.date || "",
      timeSlot: source.timeSlot || source.slot || "morning",
      bucket: source.bucket || source.timeSlot || source.slot || "morning",
      completed: source.completed == null ? false : source.completed,
      overridden: source.overridden == null ? false : source.overridden,
      deletedInstance: source.deletedInstance == null ? false : source.deletedInstance,
      checklistJson: getJsonField(source, "checklist", "checklistJson", "[]"),
      checklistOpen: source.checklistOpen == null ? false : source.checklistOpen,
      reminderJson: getJsonField(source, "reminder", "reminderJson", "{}"),
      metadataJson: metadataJson || "{}",
      updatedAt: new Date().toISOString(),
      deleted: source.deleted == null ? false : source.deleted,
    };
  }

  async function importWeeklyPlannerFromLocalStorage() {
    if (!window.PlannerStorage || typeof window.PlannerStorage.importWeeklyPlannerToSheets !== "function") {
      throw new Error("PlannerStorage must be loaded before running the Weekly Planner migration.");
    }

    let weekly;
    try {
      const raw = window.localStorage.getItem("hm_weekly_planner");
      weekly = JSON.parse(raw || "[]");
    } catch (error) {
      console.error("Unable to read legacy Weekly Planner localStorage data.", error);
      throw error;
    }

    const items = Array.isArray(weekly)
      ? weekly
      : weekly && typeof weekly === "object" && Array.isArray(weekly.tasks)
        ? weekly.tasks
        : [];
    const mutations = [];
    let skipped = 0;
    items.forEach((item) => {
      if (!item || typeof item !== "object") {
        skipped += 1;
        console.warn("Skipped invalid Weekly Planner item during migration.", item);
        return;
      }
      mutations.push({
        op: "upsert",
        sheet: "Planner_WeeklyTasks",
        row: convertWeeklyItem(item),
      });
    });

    console.info(`Migrating ${mutations.length} Weekly Planner item(s); skipped ${skipped}.`);
    try {
      const result = await window.PlannerStorage.importWeeklyPlannerToSheets(mutations);
      console.info("Weekly Planner migration completed.", result);
      return { ...result, skipped, migrated: mutations.length };
    } catch (error) {
      console.error("Weekly Planner migration failed.", error);
      throw error;
    }
  }

  window.WeeklyPlannerMigration = { importWeeklyPlannerFromLocalStorage };
  window.runWeeklyPlannerMigration = () => window.WeeklyPlannerMigration.importWeeklyPlannerFromLocalStorage();
})();
