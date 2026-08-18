// Manual Task Manager migration helper. This file is intentionally not loaded by the router.
(function () {
  async function importTaskManagerFromLocalStorage() {
    if (!window.PlannerStorage || typeof window.PlannerStorage.importTaskManagerToSheets !== "function") {
      throw new Error("PlannerStorage must be loaded before running the Task Manager migration.");
    }

    let legacyRows = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem("hm_task_manager_tasks") || "[]");
      legacyRows = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Unable to read legacy Task Manager localStorage data.", error);
      throw error;
    }

    const sheetRows = legacyRows.map((entry, index) => ({
      id: entry.id || entry.taskId || window.generateUuidV4(),
      projectId: entry.projectId || "",
      title: entry.title || "Untitled Task",
      source: entry.source || "unknown",
      category: entry.category || "uncategorized",
      state: entry.state || "unknown",
      priority: entry.priority == null ? 3 : entry.priority,
      order: entry.order == null ? index + 1 : entry.order,
      recurrence: entry.recurrence || "",
      startDate: entry.startDate || "",
      updatedAt: entry.updatedAt || new Date().toISOString(),
      metadataJson: entry.metadataJson || JSON.stringify(entry.metadata || {}),
    }));
    console.info("Preparing legacy Task Manager rows for Sheets migration.", sheetRows.length);
    try {
      const result = await window.PlannerStorage.importTaskManagerToSheets(sheetRows);
      console.info("Task Manager migration completed.", result);
      return result;
    } catch (error) {
      console.error("Task Manager migration failed.", error);
      throw error;
    }
  }

  window.TaskManagerMigration = {
    importTaskManagerFromLocalStorage,
  };
})();
