function initTasksScreen() {
  if (window.location.hash.replace("#", "") !== "tasks") {
    return;
  }

  const SERVICE_VERSION = "20260727-4";

  const STORAGE_KEYS = {
    curated: "hm_task_manager_tasks",
    legacyQueue: "hm_task_manager_queue",
    repeatable: "hm_repeatable_tasks",
    weeklyPlanner: "hm_weekly_planner_queue",
  };

  const state = {
    allProjects: [],
    projectTasks: [],
    repeatableTasks: [],
  };

  const elements = {
    status: document.getElementById("tasksStatus"),
    projectList: document.getElementById("projectTaskList"),
    repeatableList: document.getElementById("repeatableTaskList"),
  };

  if (!elements.status || !elements.projectList || !elements.repeatableList) {
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

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.curated);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Failed to read curated tasks", error);
      return [];
    }
  }

  function saveTasks(tasks) {
    localStorage.setItem(STORAGE_KEYS.curated, JSON.stringify(tasks));
  }

  function addTask(project) {
    const tasks = loadTasks();
    const task = {
      taskId: makeTaskId(project.projectId),
      projectId: project.projectId,
      title: project.title,
      source: project.source,
      category: project.category,
      state: project.state,
      priority: parseNumber(project.priority, 3),
      order: parseNumber(project.order, tasks.length + 1),
      recurrence: cleanText(project.recurrence, ""),
      asset: cleanText(project.asset, ""),
      mileage: cleanText(project.mileage, ""),
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = tasks.findIndex((item) => item.taskId === task.taskId);
    if (existingIndex >= 0) {
      tasks[existingIndex] = { ...tasks[existingIndex], ...task };
    } else {
      tasks.push(task);
    }

    saveTasks(tasks);
    return task;
  }

  function updateTask(task) {
    const tasks = loadTasks();
    const index = tasks.findIndex((item) => item.taskId === task.taskId);
    if (index < 0) {
      return null;
    }

    tasks[index] = {
      ...tasks[index],
      ...task,
      updatedAt: new Date().toISOString(),
    };

    saveTasks(tasks);
    return tasks[index];
  }

  function removeTask(taskId) {
    const tasks = loadTasks();
    const nextTasks = tasks.filter((item) => item.taskId !== taskId);
    saveTasks(nextTasks);
    return nextTasks;
  }

  window.TaskManagerStorage = {
    loadTasks,
    saveTasks,
    addTask,
    updateTask,
    removeTask,
  };

  function loadRepeatableOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.repeatable);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Failed to read repeatable task overrides", error);
      return [];
    }
  }

  function saveRepeatableOverrides(items) {
    localStorage.setItem(STORAGE_KEYS.repeatable, JSON.stringify(items));
  }

  function ensureProjectServicesLoaded() {
    return loadScriptFresh("js/services/sheets.service.js")
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

  function migrateLegacyQueue(projectMap) {
    let legacy;
    try {
      legacy = JSON.parse(localStorage.getItem(STORAGE_KEYS.legacyQueue) || "[]");
    } catch (error) {
      legacy = [];
    }

    if (!Array.isArray(legacy) || legacy.length === 0) {
      return;
    }

    legacy.forEach((entry) => {
      const project = projectMap.get(cleanText(entry.projectId, ""));
      if (project) {
        addTask(project);
      }
    });

    localStorage.removeItem(STORAGE_KEYS.legacyQueue);
  }

  function buildProjectTasks(projectMap) {
    const curated = loadTasks();

    state.projectTasks = curated
      .map((item) => {
        const enriched = projectMap.get(item.projectId);
        if (!enriched) {
          return {
            ...item,
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
      .sort((a, b) => a.order - b.order || a.priority - b.priority || a.title.localeCompare(b.title));
  }

  function buildRepeatableTasks(projectMap) {
    const overrides = loadRepeatableOverrides();
    const overrideMap = new Map(overrides.map((item) => [item.projectId, item]));

    state.repeatableTasks = [...projectMap.values()]
      .filter((project) => project.source === "repeating")
      .map((project, index) => {
        const override = overrideMap.get(project.projectId) || {};
        return {
          taskId: `repeatable-${project.projectId}`,
          projectId: project.projectId,
          title: project.title,
          recurrence: cleanText(project.recurrence, "none").toLowerCase(),
          priority: parseNumber(override.priority, parseNumber(project.priority, 3)),
          order: parseNumber(override.order, parseNumber(project.order, index + 1)),
          category: project.category,
        };
      })
      .sort((a, b) => a.order - b.order || a.priority - b.priority || a.title.localeCompare(b.title));
  }

  function renderProjectTasks() {
    if (!state.projectTasks.length) {
      elements.projectList.innerHTML = '<div class="task-empty">No project-based tasks yet. Use "Add to Task Manager" on the Projects screen.</div>';
      return;
    }

    elements.projectList.innerHTML = state.projectTasks
      .map((task) => {
        const recurrence = task.recurrence || "-";
        return `
          <article class="task-card" data-type="project" data-task-id="${task.taskId}">
            <h3>${task.title}</h3>
            <div class="task-meta-grid">
              <div class="task-meta"><strong>Source:</strong> ${task.source}</div>
              <div class="task-meta"><strong>Category:</strong> ${task.category}</div>
              <div class="task-meta"><strong>State:</strong> ${task.state}</div>
              <div class="task-meta"><strong>Priority:</strong> ${task.priority}</div>
              <div class="task-meta"><strong>Order:</strong> ${task.order}</div>
              <div class="task-meta"><strong>Recurrence:</strong> ${recurrence}</div>
            </div>
            <div class="task-actions">
              <button type="button" data-action="priority-up">Increase priority</button>
              <button type="button" data-action="priority-down">Decrease priority</button>
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
      .map((task) => `
        <article class="task-card" data-type="repeatable" data-task-id="${task.taskId}">
          <h3>${task.title}</h3>
          <div class="task-meta-grid">
            <div class="task-meta"><strong>Recurrence:</strong> ${task.recurrence}</div>
            <div class="task-meta"><strong>Priority:</strong> ${task.priority}</div>
            <div class="task-meta"><strong>Order:</strong> ${task.order}</div>
            <div class="task-meta"><strong>Category:</strong> ${task.category}</div>
          </div>
          <div class="task-actions">
            <button type="button" data-action="priority-up">Increase priority</button>
            <button type="button" data-action="priority-down">Decrease priority</button>
            <button type="button" data-action="move-up">Move up</button>
            <button type="button" data-action="move-down">Move down</button>
            <button type="button" class="primary" data-action="send-weekly">Add to weekly planner</button>
          </div>
        </article>
      `)
      .join("");
  }

  function refreshStatus() {
    elements.status.textContent = `${state.projectTasks.length} project tasks and ${state.repeatableTasks.length} repeatable tasks`;
  }

  function renderAll() {
    renderProjectTasks();
    renderRepeatableTasks();
    refreshStatus();
  }

  function sendToWeeklyPlanner(task, type) {
    let plannerItems;
    try {
      plannerItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.weeklyPlanner) || "[]");
    } catch (error) {
      plannerItems = [];
    }

    plannerItems.push({
      id: `${type}-${task.projectId}-${Date.now()}`,
      projectId: task.projectId,
      title: task.title,
      priority: task.priority,
      order: task.order,
      recurrence: cleanText(task.recurrence, ""),
      source: cleanText(task.source, type),
      addedAt: new Date().toISOString(),
    });

    localStorage.setItem(STORAGE_KEYS.weeklyPlanner, JSON.stringify(plannerItems));
    elements.status.textContent = `Sent "${task.title}" to Weekly Planner.`;
  }

  function updateProjectTaskList(nextList) {
    state.projectTasks = nextList.sort((a, b) => a.order - b.order || a.priority - b.priority || a.title.localeCompare(b.title));
    saveTasks(state.projectTasks);
    renderAll();
  }

  function saveRepeatableState() {
    const overrides = state.repeatableTasks.map((task) => ({
      projectId: task.projectId,
      priority: task.priority,
      order: task.order,
    }));

    saveRepeatableOverrides(overrides);
  }

  function updateRepeatableTaskList(nextList) {
    state.repeatableTasks = nextList.sort((a, b) => a.order - b.order || a.priority - b.priority || a.title.localeCompare(b.title));
    saveRepeatableState();
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

  function onProjectAction(action, taskId) {
    const list = [...state.projectTasks];
    const index = list.findIndex((item) => item.taskId === taskId);
    if (index < 0) {
      return;
    }

    if (action === "priority-up") {
      list[index].priority = Math.max(1, parseNumber(list[index].priority, 3) - 1);
      updateTask(list[index]);
      updateProjectTaskList(list);
      return;
    }

    if (action === "priority-down") {
      list[index].priority = Math.min(9, parseNumber(list[index].priority, 3) + 1);
      updateTask(list[index]);
      updateProjectTaskList(list);
      return;
    }

    if (action === "move-up") {
      updateProjectTaskList(shiftOrder(list, taskId, -1));
      return;
    }

    if (action === "move-down") {
      updateProjectTaskList(shiftOrder(list, taskId, 1));
      return;
    }

    if (action === "remove") {
      removeTask(taskId);
      state.projectTasks = state.projectTasks.filter((item) => item.taskId !== taskId);
      renderAll();
      return;
    }

    if (action === "send-weekly") {
      sendToWeeklyPlanner(list[index], "project");
    }
  }

  function onRepeatableAction(action, taskId) {
    const list = [...state.repeatableTasks];
    const index = list.findIndex((item) => item.taskId === taskId);
    if (index < 0) {
      return;
    }

    if (action === "priority-up") {
      list[index].priority = Math.max(1, parseNumber(list[index].priority, 3) - 1);
      updateRepeatableTaskList(list);
      return;
    }

    if (action === "priority-down") {
      list[index].priority = Math.min(9, parseNumber(list[index].priority, 3) + 1);
      updateRepeatableTaskList(list);
      return;
    }

    if (action === "move-up") {
      updateRepeatableTaskList(shiftOrder(list, taskId, -1));
      return;
    }

    if (action === "move-down") {
      updateRepeatableTaskList(shiftOrder(list, taskId, 1));
      return;
    }

    if (action === "send-weekly") {
      sendToWeeklyPlanner(list[index], "repeatable");
    }
  }

  function attachEvents() {
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
    await ensureProjectServicesLoaded();
    const projects = await window.loadAllProjects();
    state.allProjects = (projects || []).map(toProjectView);

    const projectMap = new Map(state.allProjects.map((project) => [project.projectId, project]));
    migrateLegacyQueue(projectMap);
    buildProjectTasks(projectMap);
    buildRepeatableTasks(projectMap);
    renderAll();
  }

  attachEvents();
  loadTaskManager().catch((error) => {
    console.error(error);
    elements.status.textContent = "Unable to load Task Manager.";
    elements.projectList.innerHTML = `<div class="task-empty">Failed to load project tasks. ${error.message || "Unknown error"}</div>`;
    elements.repeatableList.innerHTML = "";
  });
}

window.initTasksScreen = initTasksScreen;
