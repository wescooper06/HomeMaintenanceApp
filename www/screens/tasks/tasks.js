function initTasksScreen() {
  if (window.location.hash.replace("#", "") !== "tasks") {
    return;
  }

  const SERVICE_VERSION = "20260814-1";

  const state = {
    allProjects: [],
    projectTasks: [],
    repeatableTasks: [],
    repeatableOverrideMap: new Map(),
    sortDirection: {
      project: "asc",
      repeatable: "asc",
    },
  };

  const elements = {
    status: document.getElementById("tasksStatus"),
    mode: document.getElementById("tasksMode"),
    error: document.getElementById("tasksError"),
    projectList: document.getElementById("projectTaskList"),
    repeatableList: document.getElementById("repeatableTaskList"),
    projectSortToggle: document.getElementById("projectTaskSortToggle"),
    repeatableSortToggle: document.getElementById("repeatableTaskSortToggle"),
  };

  if (!elements.status || !elements.mode || !elements.error || !elements.projectList || !elements.repeatableList || !elements.projectSortToggle || !elements.repeatableSortToggle) {
    return;
  }

  const controller = new AbortController();

  function cleanText(value, fallback) {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function parseNumber(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const text = cleanText(value, "");
    if (!text) {
      return fallback;
    }

    const parsed = Number(String(text).replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeSource(source) {
    const text = cleanText(source, "unknown").toLowerCase();
    if (text.includes("list_a") || text.includes("home")) return "home";
    if (text.includes("list_b") || text.includes("vehicle")) return "vehicle";
    if (text.includes("list_c") || text.includes("repeating")) return "repeating";
    return text;
  }

  function firstDefined(obj, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== "") {
        return obj[key];
      }
    }

    return null;
  }

  function toProjectView(project) {
    const metadata = project.metadata || {};
    return {
      projectId: cleanText(project.id, "unknown"),
      title: cleanText(project.title, "Untitled Project"),
      source: normalizeSource(project.source),
      category: cleanText(project.category, "uncategorized"),
      state: cleanText(project.state, "unknown"),
      priority: parseNumber(firstDefined(metadata, ["priority", "rank", "urgency"]), 3),
      order: parseNumber(firstDefined(metadata, ["order", "sortorder", "sequence", "displayorder"]), 999),
      recurrence: cleanText(firstDefined(metadata, ["recurrence", "frequency", "interval"]), ""),
      asset: cleanText(firstDefined(metadata, ["asset", "vehicle", "equipment", "assetname"]), ""),
      mileage: cleanText(firstDefined(metadata, ["mileage", "odometer"]), ""),
    };
  }

  function makeTaskId(projectId) {
    return `task-${projectId}`;
  }

  function makeProjectKey(source, projectId) {
    return `${normalizeSource(source)}::${cleanText(projectId, "")}`;
  }

  async function loadTasks() {
    return window.PlannerStorage.getTaskManager();
  }

  async function addTask(project) {
    const task = {
      id: makeTaskId(project.projectId),
      projectId: project.projectId,
      title: project.title,
      source: project.source,
      category: project.category,
      state: project.state,
      priority: parseNumber(project.priority, 3),
      order: parseNumber(project.order, 1),
      recurrence: cleanText(project.recurrence, ""),
      asset: cleanText(project.asset, ""),
      mileage: cleanText(project.mileage, ""),
      metadataJson: "{}",
    };
    return window.PlannerStorage.upsertTaskManagerTask(task);
  }

  async function updateTask(task) {
    return window.PlannerStorage.upsertTaskManagerTask(task);
  }

  async function removeTask(taskId) {
    return window.PlannerStorage.deleteTaskManagerTask(taskId);
  }

  window.TaskManagerStorage = {
    loadTasks,
    addTask,
    updateTask,
    removeTask,
  };

  async function loadRepeatableOverrides() {
    return window.PlannerStorage.getRepeatableOverrides();
  }

  function ensureProjectServicesLoaded() {
    return loadScriptFresh("js/utils/uuid.js")
      .then(() => loadScriptFresh("js/services/planner-storage.service.js"))
      .then(() => loadScriptFresh("js/services/sheets.service.js"))
      .then(() => loadScriptFresh("js/services/projects.service.js"));
  }

  function loadScriptFresh(src) {
    const versionedSrc = `${src}?v=${SERVICE_VERSION}`;

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-module-src=\"${src}\"]`);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement("script");
      script.src = versionedSrc;
      script.dataset.moduleSrc = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  async function buildProjectTasks(projectMapByKey, projectMapById) {
    const curated = await loadTasks();

    state.projectTasks = curated
      .map((item) => {
        const itemProjectId = cleanText(item.projectId, "");
        const enrichedByKey = projectMapByKey.get(makeProjectKey(item.source, itemProjectId));
        const byId = projectMapById.get(itemProjectId) || [];
        const fallback = byId.find((project) => normalizeSource(project.source) !== "repeating") || byId[0] || null;
        const enriched = enrichedByKey || fallback;
        if (!enriched) {
          return {
            ...item,
            taskId: cleanText(item.id || item.taskId, makeTaskId(itemProjectId)),
            title: cleanText(item.title, "Unknown Project"),
            source: normalizeSource(item.source),
            category: cleanText(item.category, "uncategorized"),
            state: cleanText(item.state, "unknown"),
            priority: parseNumber(item.priority, 3),
            order: parseNumber(item.order, 999),
            recurrence: cleanText(item.recurrence, ""),
            asset: cleanText(item.asset, ""),
            mileage: cleanText(item.mileage, ""),
          };
        }

        return {
          ...item,
          taskId: cleanText(item.id || item.taskId, makeTaskId(itemProjectId)),
          title: enriched.title,
          source: enriched.source,
          category: enriched.category,
          state: enriched.state,
          recurrence: cleanText(item.recurrence || enriched.recurrence, ""),
          asset: cleanText(item.asset || enriched.asset, ""),
          mileage: cleanText(item.mileage || enriched.mileage, ""),
          priority: parseNumber(item.priority, parseNumber(enriched.priority, 3)),
          order: parseNumber(item.order, parseNumber(enriched.order, 999)),
        };
      })
      .filter((item) => normalizeSource(item.source) !== "repeating");

    state.projectTasks = sortTaskList(state.projectTasks, "project");
  }

  async function buildRepeatableTasks(projects) {
    const overrides = await loadRepeatableOverrides();
    const overrideMap = new Map(overrides.map((item) => [cleanText(item && item.projectId, ""), item]).filter((entry) => Boolean(entry[0])));
    state.repeatableOverrideMap = overrideMap;

    const projectMapById = new Map((projects || []).map((project) => [cleanText(project.projectId, ""), project]).filter((entry) => Boolean(entry[0])));

    const seenRepeatableIds = new Set();

    state.repeatableTasks = [...(projects || [])]
      .filter((project) => normalizeSource(cleanText(project && project.source, "")) === "repeating")
      .map((project, index) => {
        const projectId = cleanText(project.projectId, "");
        if (!projectId) {
          return null;
        }

        seenRepeatableIds.add(projectId);

        const override = overrideMap.get(projectId) || {};
        if (override.removedFromTaskManager === true || override.removed === true) {
          return null;
        }

        return {
          taskId: `repeatable-${projectId}`,
          projectId,
          title: project.title,
          source: normalizeSource(project.source) || "repeating",
          state: cleanText(project.state, "unknown"),
          recurrence: cleanText(project.recurrence, "none").toLowerCase(),
          priority: parseNumber(override.priority, parseNumber(project.priority, 3)),
          order: parseNumber(override.order, parseNumber(project.order, index + 1)),
          category: project.category,
          asset: cleanText(project.asset, ""),
          mileage: cleanText(project.mileage, ""),
        };
      })
      .filter(Boolean);

    overrides.forEach((override, index) => {
      if (!override || override.removedFromTaskManager === true || override.removed === true) {
        return;
      }

      const projectId = cleanText(override.projectId, "");
      if (!projectId || seenRepeatableIds.has(projectId)) {
        return;
      }

      const title = cleanText(override.title, "");
      if (!title) {
        return;
      }

      const overrideSource = cleanText(override.source, "");
      const isRepeatableFromOverride = normalizeSource(overrideSource) === "repeating" || overrideSource.toLowerCase().includes("repeating") || overrideSource.toLowerCase().includes("list_c") || overrideSource === "repeating";
      if (!isRepeatableFromOverride) {
        return;
      }

      seenRepeatableIds.add(projectId);
      state.repeatableTasks.push({
        taskId: `repeatable-${projectId}`,
        projectId,
        title,
        source: "repeating",
        state: cleanText(override.state, "unknown"),
        recurrence: cleanText(override.recurrence, "none").toLowerCase(),
        priority: parseNumber(override.priority, 3),
        order: parseNumber(override.order, index + 1),
        category: cleanText(override.category, "uncategorized"),
        asset: cleanText(override.asset, ""),
        mileage: cleanText(override.mileage, ""),
      });
    });

    state.repeatableTasks = sortTaskList(state.repeatableTasks, "repeatable");
  }

  function compareTasksAscending(a, b) {
    const leftOrder = parseNumber(a.order, Number.MAX_SAFE_INTEGER);
    const rightOrder = parseNumber(b.order, Number.MAX_SAFE_INTEGER);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return a.title.localeCompare(b.title);
  }

  function sortTaskList(items, listType) {
    const direction = (state.sortDirection && state.sortDirection[listType]) === "desc" ? "desc" : "asc";
    const sorted = [...(items || [])].sort(compareTasksAscending);
    return direction === "desc" ? sorted.reverse() : sorted;
  }

  function orderBadge(task) {
    const orderValue = parseNumber(task.order, null);
    const displayOrder = orderValue == null ? "" : String(orderValue);
    return `<span class="task-order-badge">Order: ${displayOrder || "-"}</span>`;
  }

  function updateSortToggleLabels() {
    elements.projectSortToggle.textContent = `Sort: ${state.sortDirection.project === "asc" ? "Ascending" : "Descending"}`;
    elements.repeatableSortToggle.textContent = `Sort: ${state.sortDirection.repeatable === "asc" ? "Ascending" : "Descending"}`;
  }

  function renderProjectTasks() {
    if (!state.projectTasks.length) {
      elements.projectList.innerHTML = '<div class="task-empty">No project-based tasks yet. Use "Add to Task Manager" on the Projects screen.</div>';
      return;
    }

    elements.projectList.innerHTML = state.projectTasks
      .map((task) => {
        const recurrence = task.recurrence || "-";
        const orderPill = orderBadge(task);
        return `
          <article class="task-card" data-type="project" data-task-id="${task.taskId}">
            <h3 class="task-card-title"><span class="task-title-main">${task.title}</span>${orderPill}</h3>
            <div class="task-meta-grid">
              <div class="task-meta"><strong>Source:</strong> ${task.source}</div>
              <div class="task-meta"><strong>Category:</strong> ${task.category}</div>
              <div class="task-meta"><strong>State:</strong> ${task.state}</div>
              <div class="task-meta"><strong>Recurrence:</strong> ${recurrence}</div>
            </div>
            <div class="task-actions">
              <button type="button" data-action="move-up">Move up</button>
              <button type="button" data-action="move-down">Move down</button>
              <button type="button" class="primary" data-action="send-weekly">Send to Weekly Planner</button>
              <button type="button" class="danger" data-action="remove">Remove from Task Manager</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderRepeatableTasks() {
    if (!state.repeatableTasks.length) {
      elements.repeatableList.innerHTML = '<div class="task-empty">No repeatable tasks found in Project List_C.</div>';
      return;
    }

    elements.repeatableList.innerHTML = state.repeatableTasks
      .map((task) => {
        const orderPill = orderBadge(task);
        return `
        <article class="task-card" data-type="repeatable" data-task-id="${task.taskId}">
          <h3 class="task-card-title"><span class="task-title-main">${task.title}</span>${orderPill}</h3>
          <div class="task-meta-grid">
            <div class="task-meta"><strong>Recurrence:</strong> ${task.recurrence}</div>
            <div class="task-meta"><strong>Category:</strong> ${task.category}</div>
          </div>
          <div class="task-actions">
            <button type="button" data-action="move-up">Move up</button>
            <button type="button" data-action="move-down">Move down</button>
            <button type="button" class="primary" data-action="send-weekly">Add to weekly planner</button>
            <button type="button" class="danger" data-action="remove">Remove from Task Manager</button>
          </div>
        </article>
      `;
      })
      .join("");
  }

  function refreshStatus() {
    elements.status.textContent = `${state.projectTasks.length} project tasks and ${state.repeatableTasks.length} repeatable tasks`;
  }

  function renderAll() {
    updateSortToggleLabels();
    renderProjectTasks();
    renderRepeatableTasks();
    refreshStatus();
  }

  async function sendToWeeklyPlanner(task, type) {
    const isRepeatable = type === "repeating";
    if (isRepeatable) {
      const taskManagerTasks = await window.PlannerStorage.getTaskManager();
      const storedTask = taskManagerTasks.find((item) => cleanText(item.projectId, "") === cleanText(task.projectId, ""));
      if (storedTask) {
        let metadata = {};
        try {
          metadata = JSON.parse(cleanText(storedTask.metadataJson, "{}")) || {};
        } catch (error) {
          metadata = {};
        }

        await window.PlannerStorage.upsertTaskManagerTask({
          ...storedTask,
          metadataJson: JSON.stringify({ ...metadata, plannerRepeatable: true }),
        });
        const generatedDate = cleanText(task.startDate, new Date().toISOString().slice(0, 10));
        await window.PlannerStorage.deleteWeeklyTask(`repeatable-${storedTask.projectId}-${generatedDate}`);
      }
      elements.status.textContent = `Added "${task.title}" to Repeatable Tasks.`;
      return;
    }

    const projectId = cleanText(task.projectId, "");
    const generatedDate = cleanText(task.startDate, new Date().toISOString().slice(0, 10));
    await window.PlannerStorage.deleteWeeklyTask(`curated-${projectId}-${generatedDate}`);
    await window.PlannerStorage.upsertCuratedTask({
      taskId: cleanText(task.id || task.taskId, ""),
      projectId: task.projectId,
      title: task.title,
      priority: task.priority,
      order: task.order,
      recurrence: cleanText(task.recurrence, ""),
      source: cleanText(task.source, type),
    });
    elements.status.textContent = `Added "${task.title}" to Planner Projects.`;
  }

  async function updateProjectTaskList(nextList) {
    state.projectTasks = sortTaskList(nextList, "project");
    await Promise.all(state.projectTasks.map((task) => updateTask(task)));
    renderAll();
  }

  function toProjectTaskRecord(task) {
    return {
      taskId: cleanText(task.taskId, ""),
      projectId: cleanText(task.projectId, ""),
      title: cleanText(task.title, "Untitled Task"),
      source: normalizeSource(task.source),
      category: cleanText(task.category, "uncategorized"),
      state: cleanText(task.state, "unknown"),
      priority: parseNumber(task.priority, 3),
      order: parseNumber(task.order, 999),
      recurrence: cleanText(task.recurrence, ""),
      asset: cleanText(task.asset, ""),
      mileage: cleanText(task.mileage, ""),
    };
  }

  async function addRepeatableToCuratedTasks(task) {
    const saved = await addTask({
      projectId: cleanText(task.projectId, ""),
      title: cleanText(task.title, "Untitled Task"),
      source: normalizeSource(task.source) || "repeating",
      category: cleanText(task.category, "uncategorized"),
      state: cleanText(task.state, "unknown"),
      priority: parseNumber(task.priority, 3),
      order: parseNumber(task.order, 999),
      recurrence: cleanText(task.recurrence, ""),
      asset: cleanText(task.asset, ""),
      mileage: cleanText(task.mileage, ""),
    });

    const normalized = toProjectTaskRecord(saved);
    const list = [...state.projectTasks];
    const index = list.findIndex((item) => item.taskId === normalized.taskId);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        ...normalized,
      };
    } else {
      list.push(normalized);
    }

    state.projectTasks = sortTaskList(list, "project");
    renderAll();
  }

  async function saveRepeatableState() {
    const overrides = Array.from(state.repeatableOverrideMap.values());
    await Promise.all(overrides.map((override) => window.PlannerStorage.upsertRepeatableOverride(override)));
  }

  async function updateRepeatableTaskList(nextList) {
    state.repeatableTasks = sortTaskList(nextList, "repeatable");

    state.repeatableTasks.forEach((task) => {
      const existing = state.repeatableOverrideMap.get(task.projectId) || {};
      state.repeatableOverrideMap.set(task.projectId, {
        ...existing,
        projectId: task.projectId,
        priority: task.priority,
        order: task.order,
        removed: false,
        removedFromTaskManager: false,
      });
    });

    await saveRepeatableState();
    renderAll();
  }

  function shiftOrder(items, taskId, direction) {
    const index = items.findIndex((item) => item.taskId === taskId);
    if (index < 0) {
      return items;
    }

    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= items.length) {
      return items;
    }

    const cloned = [...items];
    const currentOrder = cloned[index].order;
    cloned[index].order = cloned[swapIndex].order;
    cloned[swapIndex].order = currentOrder;
    return cloned;
  }

  async function onProjectAction(action, taskId) {
    const list = [...state.projectTasks];
    const index = list.findIndex((item) => item.taskId === taskId);
    if (index < 0) {
      return;
    }

    if (action === "move-up") {
      await updateProjectTaskList(shiftOrder(list, taskId, -1));
      return;
    }

    if (action === "move-down") {
      await updateProjectTaskList(shiftOrder(list, taskId, 1));
      return;
    }

    if (action === "remove") {
      await removeTask(taskId);
      state.projectTasks = state.projectTasks.filter((item) => item.taskId !== taskId);
      renderAll();
      return;
    }

    if (action === "send-weekly") {
      await sendToWeeklyPlanner(list[index], "project");
    }
  }

  async function onRepeatableAction(action, taskId) {
    const list = [...state.repeatableTasks];
    const index = list.findIndex((item) => item.taskId === taskId);
    if (index < 0) {
      return;
    }

    if (action === "move-up") {
      await updateRepeatableTaskList(shiftOrder(list, taskId, -1));
      return;
    }

    if (action === "move-down") {
      await updateRepeatableTaskList(shiftOrder(list, taskId, 1));
      return;
    }

    if (action === "send-weekly") {
      await sendToWeeklyPlanner(list[index], "repeating");
      return;
    }

    if (action === "remove") {
      const task = list[index];
      const existing = state.repeatableOverrideMap.get(task.projectId) || {};
      state.repeatableOverrideMap.set(task.projectId, {
        ...existing,
        projectId: task.projectId,
        priority: task.priority,
        order: task.order,
        removedFromTaskManager: true,
      });

      state.repeatableTasks = state.repeatableTasks.filter((item) => item.taskId !== taskId);
      await saveRepeatableState();
      renderAll();
    }
  }

  function attachEvents() {
    elements.projectSortToggle.addEventListener("click", () => {
      state.sortDirection.project = state.sortDirection.project === "asc" ? "desc" : "asc";
      state.projectTasks = sortTaskList(state.projectTasks, "project");
      renderAll();
    }, { signal: controller.signal });

    elements.repeatableSortToggle.addEventListener("click", () => {
      state.sortDirection.repeatable = state.sortDirection.repeatable === "asc" ? "desc" : "asc";
      state.repeatableTasks = sortTaskList(state.repeatableTasks, "repeatable");
      renderAll();
    }, { signal: controller.signal });

    elements.projectList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const card = button.closest("[data-task-id]");
      if (!card) {
        return;
      }

      onProjectAction(button.dataset.action, card.dataset.taskId);
    }, { signal: controller.signal });

    elements.repeatableList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const card = button.closest("[data-task-id]");
      if (!card) {
        return;
      }

      onRepeatableAction(button.dataset.action, card.dataset.taskId);
    }, { signal: controller.signal });

    const teardownIfRouteChanges = () => {
      if (window.location.hash.replace("#", "") !== "tasks") {
        controller.abort();
        window.removeEventListener("hashchange", teardownIfRouteChanges);
      }
    };

    window.addEventListener("hashchange", teardownIfRouteChanges);
  }

  async function loadTaskManager() {
    elements.status.textContent = "Loading tasks...";
    elements.error.hidden = true;
    await ensureProjectServicesLoaded();
    elements.mode.textContent = window.PlannerStorage.getUseSheets() ? "Sheets mode" : "Local mode";
    const projects = await window.loadAllProjects();
    state.allProjects = (projects || []).map(toProjectView);

    const projectMapByKey = new Map(state.allProjects.map((project) => [makeProjectKey(project.source, project.projectId), project]));
    const projectMapById = new Map();
    state.allProjects.forEach((project) => {
      const key = cleanText(project.projectId, "");
      if (!projectMapById.has(key)) {
        projectMapById.set(key, []);
      }
      projectMapById.get(key).push(project);
    });

    await buildProjectTasks(projectMapByKey, projectMapById);
    await buildRepeatableTasks(state.allProjects);
    renderAll();
  }

  window.PlannerStorage && window.PlannerStorage.onChange((detail) => {
    if (detail && detail.type === "task-manager-sync-error") {
      elements.error.textContent = `Sheets sync queued: ${detail.error}`;
      elements.error.hidden = false;
      return;
    }
    if (detail && String(detail.type || "").startsWith("task-manager-")) {
      loadTaskManager().catch((error) => console.warn("Task Manager refresh failed", error));
    }
  });

  attachEvents();
  loadTaskManager().catch((error) => {
    console.error(error);
    elements.status.textContent = "Unable to load Task Manager.";
    elements.error.textContent = error.message || "Unable to load Task Manager.";
    elements.error.hidden = false;
    elements.projectList.innerHTML = `<div class="task-empty">Failed to load project tasks. ${error.message || "Unknown error"}</div>`;
    elements.repeatableList.innerHTML = "";
  });
}

window.initTasksScreen = initTasksScreen;
