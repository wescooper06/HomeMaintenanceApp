function initPlannerScreen() {
  if (window.location.hash.replace("#", "") !== "planner") {
    return;
  }

  const STORAGE_KEYS = {
    curatedTasks: "hm_planner_curated_tasks",
    planner: "hm_weekly_planner",
    staged: "hm_weekly_planner_queue",
  };

  const DAY_ORDER = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
  ];

  const SLOT_ORDER = ["morning", "afternoon", "evening"];

  const elements = {
    status: document.getElementById("plannerStatus"),
    taskPoolLeft: document.getElementById("plannerTaskPoolLeft"),
    taskPoolMiddle: document.getElementById("plannerTaskPoolMiddle"),
    curatedWarning: document.getElementById("curated-warning"),
    weekGrid: document.getElementById("plannerWeekGrid"),
    adhocTitle: document.getElementById("adhocTaskTitle"),
    adhocDay: document.getElementById("adhocTaskDay"),
    adhocSlot: document.getElementById("adhocTaskSlot"),
    adhocAddBtn: document.getElementById("adhocTaskAddBtn"),
  };

  if (!elements.status || !elements.taskPoolLeft || !elements.taskPoolMiddle || !elements.curatedWarning || !elements.weekGrid || !elements.adhocTitle || !elements.adhocDay || !elements.adhocSlot || !elements.adhocAddBtn) {
    return;
  }

  const controller = new AbortController();
  const state = {
    curatedTasks: [],
    planner: null,
    curatedWarningTimer: null,
    activeCuratedDragTaskId: "",
  };

  const CURATED_TASK_LIMIT = 8;

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

    const num = Number(String(text).replace(/[$,]/g, ""));
    return Number.isFinite(num) ? num : fallback;
  }

  function normalizeChecklist(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const text = cleanText(item.text, "");
        if (!text) {
          return null;
        }

        return {
          id: cleanText(item.id, `check-${index + 1}`),
          text,
          completed: Boolean(item.completed),
        };
      })
      .filter((item) => item && item.id);
  }

  function getSlotItemId(item) {
    return cleanText(item && (item.id || item.taskId), "");
  }

  function getWeekStartISO(dateValue) {
    const d = new Date(dateValue);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function emptyDay() {
    return {
      morning: [],
      afternoon: [],
      evening: [],
      notes: "",
    };
  }

  function buildEmptyPlanner(weekStart) {
    const days = {};
    DAY_ORDER.forEach((day) => {
      days[day.key] = emptyDay();
    });

    return {
      weekStart,
      days,
    };
  }

  function loadCuratedTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.curatedTasks);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((task, index) => ({
        taskId: cleanText(task.taskId, `task-${index + 1}`),
        projectId: cleanText(task.projectId, ""),
        title: cleanText(task.title, "Untitled Task"),
        source: cleanText(task.source, "unknown"),
        category: cleanText(task.category, "uncategorized"),
        recurrence: cleanText(task.recurrence, ""),
        priority: parseNumber(task.priority, 3),
        order: parseNumber(task.order, index + 1),
      }));
    } catch (error) {
      console.warn("Failed to read curated tasks", error);
      return [];
    }
  }

  function loadPlanner() {
    const weekStart = getWeekStartISO(new Date());

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.planner);
      const parsed = JSON.parse(raw || "null");

      if (!parsed || typeof parsed !== "object") {
        return buildEmptyPlanner(weekStart);
      }

      if (cleanText(parsed.weekStart, "") !== weekStart) {
        return buildEmptyPlanner(weekStart);
      }

      const safePlanner = buildEmptyPlanner(weekStart);
      DAY_ORDER.forEach((day) => {
        const existingDay = parsed.days && parsed.days[day.key] ? parsed.days[day.key] : {};
        SLOT_ORDER.forEach((slot) => {
          const slotItems = Array.isArray(existingDay[slot]) ? existingDay[slot] : [];
          safePlanner.days[day.key][slot] = slotItems
            .map((item, index) => ({
              id: cleanText(item.id || item.taskId, `slot-${index + 1}`),
              taskId: cleanText(item.taskId, ""),
              title: cleanText(item.title, "Untitled Task"),
              type: cleanText(item.type, "curated"),
              priority: parseNumber(item.priority, null),
              source: cleanText(item.source, "unknown"),
              recurrence: cleanText(item.recurrence, ""),
              checklist: normalizeChecklist(item && item.checklist),
              checklistOpen: Boolean(item && item.checklistOpen),
              completed: Boolean(item && item.completed),
            }))
            .filter((item) => getSlotItemId(item));
        });
        safePlanner.days[day.key].notes = cleanText(existingDay.notes, "");
      });

      return safePlanner;
    } catch (error) {
      console.warn("Failed to read planner data", error);
      return buildEmptyPlanner(weekStart);
    }
  }

  function savePlanner() {
    if (!state.planner) {
      return;
    }

    localStorage.setItem(STORAGE_KEYS.planner, JSON.stringify(state.planner));
  }

  function saveCuratedTasks() {
    localStorage.setItem(STORAGE_KEYS.curatedTasks, JSON.stringify(state.curatedTasks));
  }

  function hideCuratedWarning() {
    if (state.curatedWarningTimer) {
      clearTimeout(state.curatedWarningTimer);
      state.curatedWarningTimer = null;
    }

    elements.curatedWarning.style.display = "none";
    elements.curatedWarning.textContent = "";
  }

  function showCuratedWarning(message) {
    if (state.curatedWarningTimer) {
      clearTimeout(state.curatedWarningTimer);
      state.curatedWarningTimer = null;
    }

    elements.curatedWarning.textContent = cleanText(message, "");
    elements.curatedWarning.style.display = "block";
    state.curatedWarningTimer = window.setTimeout(() => {
      hideCuratedWarning();
    }, 5000);
  }

  function findAssignment(taskId) {
    const targetId = cleanText(taskId, "");
    if (!targetId) {
      return null;
    }

    for (let d = 0; d < DAY_ORDER.length; d += 1) {
      const dayKey = DAY_ORDER[d].key;
      for (let s = 0; s < SLOT_ORDER.length; s += 1) {
        const slotKey = SLOT_ORDER[s];
        const slotItems = state.planner.days[dayKey][slotKey] || [];
        const index = slotItems.findIndex((item) => getSlotItemId(item) === targetId);
        if (index >= 0) {
          return {
            day: dayKey,
            slot: slotKey,
            index,
            item: slotItems[index],
          };
        }
      }
    }

    return null;
  }

  function toPlannerSlotItem(taskLike) {
    const type = cleanText(taskLike && taskLike.type, "curated");
    const normalizedId = cleanText(taskLike && (taskLike.id || taskLike.taskId), "");
    const checklist = normalizeChecklist(taskLike && taskLike.checklist);

    return {
      id: normalizedId,
      taskId: cleanText(taskLike && taskLike.taskId, ""),
      title: cleanText(taskLike.title, "Untitled Task"),
      type,
      priority: parseNumber(taskLike.priority, null),
      source: cleanText(taskLike.source, "unknown"),
      recurrence: cleanText(taskLike.recurrence, ""),
      checklist,
      checklistOpen: Boolean(taskLike && taskLike.checklistOpen),
      completed: Boolean(taskLike && taskLike.completed),
    };
  }

  function assignTask(taskId, day, slot) {
    const dayBucket = state.planner.days[day];
    if (!dayBucket || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const task = state.curatedTasks.find((item) => item.taskId === taskId);
    if (!task) {
      return false;
    }

    const existing = findAssignment(taskId);
    if (existing && existing.day === day && existing.slot === slot) {
      return true;
    }

    if (existing) {
      state.planner.days[existing.day][existing.slot].splice(existing.index, 1);
    }

    dayBucket[slot].push(toPlannerSlotItem({
      ...task,
      id: cleanText(task.taskId, ""),
      type: "curated",
    }));

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Assigned \"${task.title}\" to ${day.toUpperCase()} ${slot}.`;
    return true;
  }

  function addAdHocTask(title, day, slot) {
    const normalizedTitle = cleanText(title, "");
    if (!normalizedTitle) {
      elements.status.textContent = "Ad-hoc task title is required.";
      return false;
    }

    const dayBucket = state.planner.days[day];
    if (!dayBucket || !SLOT_ORDER.includes(slot)) {
      elements.status.textContent = "Please select a valid day and time for the ad-hoc task.";
      return false;
    }

    const adHocItem = {
      id: `adhoc-${Date.now()}`,
      title: normalizedTitle,
      type: "adhoc",
      source: "adhoc",
      recurrence: "",
      priority: null,
    };

    dayBucket[slot].push(toPlannerSlotItem(adHocItem));
    savePlanner();
    renderWeekGrid();

    elements.adhocTitle.value = "";
    elements.adhocDay.value = "mon";
    elements.adhocSlot.value = "morning";
    elements.status.textContent = `Added ad-hoc task "${normalizedTitle}" to ${day.toUpperCase()} ${slot}.`;
    return true;
  }

  function assignEntryToSlot(entry, day, slot) {
    const dayBucket = state.planner.days[day];
    if (!dayBucket || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const normalizedTaskId = cleanText(entry.taskId, "") || cleanText(entry.projectId, "") || cleanText(entry.id, "");
    if (!normalizedTaskId) {
      return false;
    }

    const existing = findAssignment(normalizedTaskId);
    if (existing && existing.day === day && existing.slot === slot) {
      return true;
    }

    if (existing) {
      state.planner.days[existing.day][existing.slot].splice(existing.index, 1);
    }

    dayBucket[slot].push(toPlannerSlotItem({
      id: normalizedTaskId,
      taskId: normalizedTaskId,
      title: cleanText(entry.title, "Untitled Task"),
      type: "curated",
      priority: parseNumber(entry.priority, 3),
      source: cleanText(entry.source, "unknown"),
      recurrence: cleanText(entry.recurrence, ""),
    }));

    return true;
  }

  function moveTask(taskId, toDay, toSlot) {
    const targetDay = state.planner.days[toDay];
    if (!targetDay || !SLOT_ORDER.includes(toSlot)) {
      return false;
    }

    const existing = findAssignment(taskId);
    if (!existing) {
      return false;
    }

    if (existing.day === toDay && existing.slot === toSlot) {
      return true;
    }

    state.planner.days[existing.day][existing.slot].splice(existing.index, 1);
    state.planner.days[toDay][toSlot].push(existing.item);

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Moved "${existing.item.title}" to ${toDay.toUpperCase()} ${toSlot}.`;
    return true;
  }

  function removeTask(taskId, day, slot) {
    const dayBucket = state.planner.days[day];
    if (!dayBucket || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const before = dayBucket[slot].length;
    dayBucket[slot] = dayBucket[slot].filter((item) => getSlotItemId(item) !== taskId);

    if (before === dayBucket[slot].length) {
      return false;
    }

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = "Task removed from planner slot.";
    return true;
  }

  function removeTaskFromPlanner(taskId) {
    const beforeCurated = state.curatedTasks.length;
    state.curatedTasks = state.curatedTasks.filter((task) => task.taskId !== taskId);
    const removedFromCurated = state.curatedTasks.length !== beforeCurated;

    let removedFromSchedule = false;
    DAY_ORDER.forEach((day) => {
      SLOT_ORDER.forEach((slot) => {
        const before = state.planner.days[day.key][slot].length;
        state.planner.days[day.key][slot] = state.planner.days[day.key][slot].filter((item) => getSlotItemId(item) !== taskId);
        if (state.planner.days[day.key][slot].length !== before) {
          removedFromSchedule = true;
        }
      });
    });

    if (!removedFromCurated && !removedFromSchedule) {
      return false;
    }

    saveCuratedTasks();
    savePlanner();
    hideCuratedWarning();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = "Task removed from Planner and schedule.";
    return true;
  }

  function removeTaskFromCurated(taskId) {
    const beforeCurated = state.curatedTasks.length;
    state.curatedTasks = state.curatedTasks.filter((task) => task.taskId !== taskId);
    if (state.curatedTasks.length === beforeCurated) {
      return false;
    }

    saveCuratedTasks();
    hideCuratedWarning();
    renderTaskPool();
    elements.status.textContent = "Task removed from Curated Tasks.";
    return true;
  }

  function findSlotTask(day, slot, taskId) {
    const dayBucket = state.planner.days[day];
    if (!dayBucket || !SLOT_ORDER.includes(slot)) {
      return null;
    }

    const slotItems = dayBucket[slot] || [];
    const index = slotItems.findIndex((item) => getSlotItemId(item) === taskId);
    if (index < 0) {
      return null;
    }

    return {
      item: slotItems[index],
      index,
    };
  }

  function toggleChecklistOpen(taskId, day, slot) {
    const match = findSlotTask(day, slot, taskId);
    if (!match || cleanText(match.item.type, "curated") !== "curated") {
      return false;
    }

    match.item.checklistOpen = !Boolean(match.item.checklistOpen);
    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Checklist ${match.item.checklistOpen ? "expanded" : "collapsed"} for "${match.item.title}".`;
    return true;
  }

  function toggleChecklistItem(taskId, day, slot, checklistId, completed) {
    const match = findSlotTask(day, slot, taskId);
    if (!match || cleanText(match.item.type, "curated") !== "curated") {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const item = checklist.find((entry) => cleanText(entry.id, "") === cleanText(checklistId, ""));
    if (!item) {
      return false;
    }

    item.completed = Boolean(completed);
    match.item.checklist = checklist;
    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Checklist updated for "${match.item.title}".`;
    return true;
  }

  function addChecklistItem(taskId, day, slot, text) {
    const match = findSlotTask(day, slot, taskId);
    if (!match || cleanText(match.item.type, "curated") !== "curated") {
      return false;
    }

    const normalizedText = cleanText(text, "");
    if (!normalizedText) {
      elements.status.textContent = "Sub-task text is required.";
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    checklist.push({
      id: `check-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      text: normalizedText,
      completed: false,
    });

    match.item.checklist = checklist;
    match.item.checklistOpen = true;
    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Added sub-task to "${match.item.title}".`;
    return true;
  }

  function removeChecklistItem(taskId, day, slot, checklistId) {
    const match = findSlotTask(day, slot, taskId);
    if (!match || cleanText(match.item.type, "curated") !== "curated") {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const before = checklist.length;
    match.item.checklist = checklist.filter((entry) => cleanText(entry.id, "") !== cleanText(checklistId, ""));

    if (before === match.item.checklist.length) {
      return false;
    }

    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Removed sub-task from "${match.item.title}".`;
    return true;
  }

  function reorderChecklistItem(taskId, day, slot, fromChecklistId, toChecklistId) {
    const match = findSlotTask(day, slot, taskId);
    if (!match || cleanText(match.item.type, "curated") !== "curated") {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const fromId = cleanText(fromChecklistId, "");
    const toId = cleanText(toChecklistId, "");
    const fromIndex = checklist.findIndex((entry) => cleanText(entry.id, "") === fromId);
    const toIndex = checklist.findIndex((entry) => cleanText(entry.id, "") === toId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return false;
    }

    const [moved] = checklist.splice(fromIndex, 1);
    checklist.splice(toIndex, 0, moved);

    match.item.checklist = checklist;
    savePlanner();
    renderWeekGrid();
    return true;
  }

  function setTaskCompleted(taskId, day, slot, completed) {
    const match = findSlotTask(day, slot, taskId);
    if (!match) {
      return false;
    }

    match.item.completed = Boolean(completed);
    savePlanner();
    renderWeekGrid();
    return true;
  }

  function buildAssignmentMap() {
    const map = new Map();

    DAY_ORDER.forEach((day) => {
      SLOT_ORDER.forEach((slot) => {
        const items = state.planner.days[day.key][slot] || [];
        items.forEach((item) => {
          const id = cleanText(item.taskId, "");
          if (!id) {
            return;
          }

          if (!map.has(id)) {
            map.set(id, {
              day: day.key,
              slot,
            });
          }
        });
      });
    });

    return map;
  }

  function renderTaskPool() {
    const renderPoolCards = (tasks) => tasks
      .map((task, index) => {
        const assignment = assignmentMap.get(task.taskId);
        const dayOptions = DAY_ORDER.map((day) => `<option value="${day.key}">${day.label}</option>`).join("");
        const slotOptions = SLOT_ORDER.map((slot) => `<option value="${slot}">${slot[0].toUpperCase()}${slot.slice(1)}</option>`).join("");

        const daySelectOptions = `<option value="">Day</option>${dayOptions}`;
        const slotSelectOptions = `<option value="">Time</option>${slotOptions}`;
        const orderValue = task.order == null || String(task.order).trim() === "" ? "-" : String(task.order);

        return `
          <article class="pool-task-card" data-curated-index="${index}" data-task-id="${task.taskId}">
            <div class="pool-task-layout">
              <span class="pool-card-drag-handle" data-action="curated-drag-handle" draggable="true" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span>
              <div class="pool-task-main">
                <div class="pool-task-head">
                  <div class="pool-task-title">${task.title}</div>
                  <span class="pool-order-pill">Order: ${orderValue}</span>
                </div>
                <div class="pool-task-meta">ID: ${task.projectId || "-"} | Source: ${task.source}</div>
                <div class="pool-task-controls">
                  <label class="pool-control-label">Day
                    <select class="planner-control-field" data-role="day">${daySelectOptions}</select>
                  </label>
                  <label class="pool-control-label">Time
                    <select class="planner-control-field" data-role="slot">${slotSelectOptions}</select>
                  </label>
                  <button type="button" class="pool-icon-btn curated-only" data-action="remove-curated" title="Remove from Curated Tasks" aria-label="Remove from Curated Tasks">🗂️</button>
                  <button type="button" class="pool-icon-btn danger" data-action="remove-planner" title="Remove from Planner" aria-label="Remove from Planner">🗑️</button>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    if (!state.curatedTasks.length) {
      elements.taskPoolLeft.innerHTML = '<div class="pool-empty">No curated tasks found. Add tasks in Task Manager first.</div>';
      elements.taskPoolMiddle.innerHTML = "";
      return;
    }

    const assignmentMap = buildAssignmentMap();
    const ordered = state.curatedTasks.slice();

    const leftTasks = ordered.slice(0, 4);
    const middleTasks = ordered.slice(4, CURATED_TASK_LIMIT);

    elements.taskPoolLeft.innerHTML = renderPoolCards(leftTasks);
    elements.taskPoolMiddle.innerHTML = renderPoolCards(middleTasks);

    const cards = [
      ...elements.taskPoolLeft.querySelectorAll(".pool-task-card"),
      ...elements.taskPoolMiddle.querySelectorAll(".pool-task-card"),
    ];

    cards.forEach((card) => {
      const taskId = card.getAttribute("data-task-id");
      const assignment = assignmentMap.get(taskId);
      const daySelect = card.querySelector("select[data-role='day']");
      const slotSelect = card.querySelector("select[data-role='slot']");
      if (daySelect) {
        daySelect.value = assignment ? assignment.day : "";
      }
      if (slotSelect) {
        slotSelect.value = assignment ? assignment.slot : "";
      }
    });
  }

  function reorderCuratedTasks(fromTaskId, toTaskId, targetSide) {
    const fromId = cleanText(fromTaskId, "");
    const toId = cleanText(toTaskId, "");
    const fromIndex = state.curatedTasks.findIndex((task) => cleanText(task.taskId, "") === fromId);
    if (fromIndex < 0) {
      return false;
    }

    const [moved] = state.curatedTasks.splice(fromIndex, 1);

    if (toId) {
      const toIndex = state.curatedTasks.findIndex((task) => cleanText(task.taskId, "") === toId);
      if (toIndex < 0) {
        state.curatedTasks.splice(fromIndex, 0, moved);
        return false;
      }

      state.curatedTasks.splice(toIndex, 0, moved);
    } else {
      const insertIndex = targetSide === "left"
        ? Math.min(4, state.curatedTasks.length)
        : state.curatedTasks.length;
      state.curatedTasks.splice(insertIndex, 0, moved);
    }

    saveCuratedTasks();
    renderTaskPool();
    return true;
  }

  function renderWeekGrid() {
    elements.weekGrid.innerHTML = DAY_ORDER
      .map((day) => {
        const dayData = state.planner.days[day.key];

        const slotHtml = SLOT_ORDER
          .map((slot) => {
            const tasks = dayData[slot] || [];
            const taskHtml = tasks.length
              ? tasks
                  .map((task) => {
                    const taskId = getSlotItemId(task);
                    const type = cleanText(task.type, "curated");
                    const sourceLabel = type === "adhoc" ? "Ad-Hoc" : cleanText(task.source, "unknown");
                    const recurrence = cleanText(task.recurrence, "");
                    const meta = recurrence
                      ? `${sourceLabel} | ${recurrence}`
                      : sourceLabel;
                    const checklist = normalizeChecklist(task.checklist);
                    const checklistOpen = Boolean(task.checklistOpen);
                    const taskCompleted = Boolean(task.completed);
                    const checklistToggleLabel = `Checklist ${checklistOpen ? "▲" : "▼"}`;

                    const checklistHtml = type === "curated"
                      ? `
                      <div class="slot-checklist">
                        <button type="button" class="slot-checklist-toggle" data-action="checklist-toggle">${checklistToggleLabel}</button>
                        ${checklistOpen ? `
                        <div class="slot-checklist-body">
                          <div class="slot-checklist-list">
                            ${checklist.length
                              ? checklist.map((entry) => `
                              <div class="slot-checklist-item ${entry.completed ? "is-complete" : ""}" data-checklist-id="${entry.id}">
                                <span class="slot-checklist-handle" data-action="checklist-drag-handle" draggable="true" aria-label="Drag sub-task" title="Drag to reorder">⋮⋮</span>
                                <input type="checkbox" data-action="checklist-item-toggle" data-checklist-id="${entry.id}" ${entry.completed ? "checked" : ""} />
                                <span class="slot-checklist-text">${entry.text}</span>
                                <button type="button" class="slot-checklist-remove" data-action="checklist-item-remove" data-checklist-id="${entry.id}">X</button>
                              </div>
                              `).join("")
                              : '<div class="slot-checklist-empty">No sub-tasks yet.</div>'}
                          </div>
                          <div class="slot-checklist-add">
                            <input type="text" data-action="checklist-add-input" placeholder="Add sub-task" aria-label="Add sub-task" />
                            <button type="button" data-action="checklist-item-add">Add</button>
                          </div>
                        </div>
                        ` : ""}
                      </div>
                      `
                      : "";

                    return `
                    <div class="slot-task slot-task-${type === "adhoc" ? "adhoc" : "curated"} ${taskCompleted ? "is-complete" : ""}" draggable="true" data-day="${day.key}" data-slot="${slot}" data-task-id="${taskId}">
                      <div class="slot-task-header">
                        <div class="slot-task-title">${task.title}</div>
                        <input type="checkbox" class="slot-task-complete" data-action="task-complete-toggle" aria-label="Mark task complete" ${taskCompleted ? "checked" : ""} />
                      </div>
                      <div class="slot-task-meta">${meta}</div>
                      ${checklistHtml}
                      <button type="button" data-action="remove">Remove</button>
                    </div>
                    `;
                  })
                  .join("")
              : '<div class="slot-empty">No tasks assigned</div>';

            return `
              <section class="day-slot" data-day="${day.key}" data-slot="${slot}">
                <h4>${slot[0].toUpperCase()}${slot.slice(1)}</h4>
                <div class="slot-task-list">${taskHtml}</div>
              </section>
            `;
          })
          .join("");

        return `
          <article class="planner-day" data-day="${day.key}">
            <h3>${day.label}</h3>
            ${slotHtml}
            <div class="day-notes">
              <label for="notes-${day.key}">Notes</label>
              <textarea id="notes-${day.key}" data-role="notes" data-day="${day.key}" placeholder="Notes for ${day.label}...">${dayData.notes || ""}</textarea>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function consumeStagedQueue() {
    let staged;
    let changed = false;
    try {
      staged = JSON.parse(localStorage.getItem(STORAGE_KEYS.staged) || "[]");
    } catch (error) {
      staged = [];
    }

    if (!Array.isArray(staged) || !staged.length) {
      return;
    }

    staged.forEach((entry) => {
      const normalizedTaskId = cleanText(entry.taskId, "") || cleanText(entry.projectId, "") || cleanText(entry.id, "");
      if (!normalizedTaskId) {
        return;
      }

      const normalizedProjectId = cleanText(entry.projectId, normalizedTaskId);
      const existingIndex = state.curatedTasks.findIndex((item) => item.taskId === normalizedTaskId || item.projectId === normalizedProjectId);

      const upsertRecord = {
        taskId: normalizedTaskId,
        projectId: normalizedProjectId,
        title: cleanText(entry.title, "Untitled Task"),
        source: cleanText(entry.source, "unknown"),
        category: cleanText(entry.category, "uncategorized"),
        recurrence: cleanText(entry.recurrence, ""),
        priority: parseNumber(entry.priority, 3),
        order: parseNumber(entry.order, state.curatedTasks.length + 1),
      };

      if (existingIndex >= 0) {
        state.curatedTasks[existingIndex] = {
          ...state.curatedTasks[existingIndex],
          ...upsertRecord,
        };
      } else {
        if (state.curatedTasks.length >= CURATED_TASK_LIMIT) {
          showCuratedWarning("You already have 8 curated tasks. Remove one or convert this task to an ad-hoc task.");
          return;
        }

        state.curatedTasks.push(upsertRecord);
      }

      changed = true;
    });

    localStorage.removeItem(STORAGE_KEYS.staged);

    if (changed) {
      saveCuratedTasks();
      hideCuratedWarning();
      renderTaskPool();
      renderWeekGrid();
      elements.status.textContent = "Staged tasks were added to Curated Tasks. Select Day and Time to assign.";
    }
  }

  function attachEvents() {
    elements.adhocAddBtn.addEventListener("click", () => {
      addAdHocTask(elements.adhocTitle.value, elements.adhocDay.value, elements.adhocSlot.value);
    }, { signal: controller.signal });

    const onTaskPoolClick = (event) => {
      const removeCuratedButton = event.target.closest("button[data-action='remove-curated']");
      if (removeCuratedButton) {
        const card = removeCuratedButton.closest(".pool-task-card");
        if (!card) {
          return;
        }

        removeTaskFromCurated(card.dataset.taskId);
        return;
      }

      const removeButton = event.target.closest("button[data-action='remove-planner']");
      if (!removeButton) {
        return;
      }

      const card = removeButton.closest(".pool-task-card");
      if (!card) {
        return;
      }

      const approved = window.confirm("This will permanently remove all scheduled instances and all checklist items for this task.");
      if (!approved) {
        return;
      }

      removeTaskFromPlanner(card.dataset.taskId);
    };

    elements.taskPoolLeft.addEventListener("click", onTaskPoolClick, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("click", onTaskPoolClick, { signal: controller.signal });

    const onTaskPoolChange = (event) => {
      const select = event.target.closest("select[data-role]");
      if (!select) {
        return;
      }

      const card = select.closest(".pool-task-card");
      if (!card) {
        return;
      }

      const taskId = card.dataset.taskId;
      const daySelect = card.querySelector("select[data-role='day']");
      const slotSelect = card.querySelector("select[data-role='slot']");
      const day = cleanText(daySelect && daySelect.value, "");
      const slot = cleanText(slotSelect && slotSelect.value, "");

      if (!day || !slot) {
        return;
      }

      assignTask(taskId, day, slot);
    };

    elements.taskPoolLeft.addEventListener("change", onTaskPoolChange, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("change", onTaskPoolChange, { signal: controller.signal });

    const clearCuratedDropTargets = () => {
      [
        ...elements.taskPoolLeft.querySelectorAll(".pool-task-card.is-drop-target"),
        ...elements.taskPoolMiddle.querySelectorAll(".pool-task-card.is-drop-target"),
      ].forEach((card) => card.classList.remove("is-drop-target"));
    };

    const onCuratedDragStart = (event) => {
      const handle = event.target.closest("[data-action='curated-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest(".pool-task-card");
      if (!card) {
        return;
      }

      const payload = {
        kind: "curated-reorder",
        taskId: cleanText(card.dataset.taskId, ""),
      };

      state.activeCuratedDragTaskId = payload.taskId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      card.classList.add("is-dragging");
      event.stopPropagation();
    };

    const onCuratedDragEnd = (event) => {
      const handle = event.target.closest("[data-action='curated-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest(".pool-task-card");
      if (card) {
        card.classList.remove("is-dragging");
      }
      state.activeCuratedDragTaskId = "";
      clearCuratedDropTargets();
    };

    const onCuratedDragOver = (event, side) => {
      if (!cleanText(state.activeCuratedDragTaskId, "")) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const card = event.target.closest(".pool-task-card");
      clearCuratedDropTargets();
      if (card) {
        card.classList.add("is-drop-target");
      }
    };

    const onCuratedDrop = (event, side) => {
      const fromTaskId = cleanText(state.activeCuratedDragTaskId, "");
      if (!fromTaskId) {
        return;
      }

      event.preventDefault();

      const targetCard = event.target.closest(".pool-task-card");
      const toTaskId = targetCard ? cleanText(targetCard.dataset.taskId, "") : "";
      reorderCuratedTasks(fromTaskId, toTaskId, side);
      clearCuratedDropTargets();
      state.activeCuratedDragTaskId = "";
    };

    elements.taskPoolLeft.addEventListener("dragstart", onCuratedDragStart, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragstart", onCuratedDragStart, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("dragend", onCuratedDragEnd, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragend", onCuratedDragEnd, { signal: controller.signal });

    elements.taskPoolLeft.addEventListener("dragover", (event) => onCuratedDragOver(event, "left"), { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragover", (event) => onCuratedDragOver(event, "middle"), { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("drop", (event) => onCuratedDrop(event, "left"), { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("drop", (event) => onCuratedDrop(event, "middle"), { signal: controller.signal });

    elements.weekGrid.addEventListener("click", (event) => {
      const slotTask = event.target.closest(".slot-task[data-day][data-slot][data-task-id]");
      const actionButton = event.target.closest("button[data-action]");

      if (slotTask && actionButton) {
        const taskId = cleanText(slotTask.dataset.taskId, "");
        const day = cleanText(slotTask.dataset.day, "");
        const slot = cleanText(slotTask.dataset.slot, "");
        const checklistId = cleanText(actionButton.dataset.checklistId, "");
        const action = cleanText(actionButton.dataset.action, "");

        if (action === "checklist-toggle") {
          toggleChecklistOpen(taskId, day, slot);
          return;
        }

        if (action === "checklist-item-remove") {
          removeChecklistItem(taskId, day, slot, checklistId);
          return;
        }

        if (action === "checklist-item-add") {
          const input = slotTask.querySelector("input[data-action='checklist-add-input']");
          if (!input) {
            return;
          }

          const added = addChecklistItem(taskId, day, slot, input.value);
          if (added) {
            input.value = "";
          }
          return;
        }
      }

      const removeButton = event.target.closest("button[data-action='remove']");
      if (!removeButton) {
        return;
      }

      const taskEl = removeButton.closest(".slot-task");
      if (!taskEl) {
        return;
      }

      const taskId = taskEl.dataset.taskId;
      const day = taskEl.dataset.day;
      const slot = taskEl.dataset.slot;
      removeTask(taskId, day, slot);
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("change", (event) => {
      const taskCompleteCheckbox = event.target.closest("input[data-action='task-complete-toggle']");
      if (taskCompleteCheckbox) {
        const slotTask = taskCompleteCheckbox.closest(".slot-task[data-day][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        setTaskCompleted(
          cleanText(slotTask.dataset.taskId, ""),
          cleanText(slotTask.dataset.day, ""),
          cleanText(slotTask.dataset.slot, ""),
          taskCompleteCheckbox.checked
        );
        return;
      }

      const checkbox = event.target.closest("input[data-action='checklist-item-toggle']");
      if (!checkbox) {
        return;
      }

      const slotTask = checkbox.closest(".slot-task[data-day][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      toggleChecklistItem(
        cleanText(slotTask.dataset.taskId, ""),
        cleanText(slotTask.dataset.day, ""),
        cleanText(slotTask.dataset.slot, ""),
        cleanText(checkbox.dataset.checklistId, ""),
        checkbox.checked
      );
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("keydown", (event) => {
      const input = event.target.closest("input[data-action='checklist-add-input']");
      if (!input || event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      const slotTask = input.closest(".slot-task[data-day][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      addChecklistItem(
        cleanText(slotTask.dataset.taskId, ""),
        cleanText(slotTask.dataset.day, ""),
        cleanText(slotTask.dataset.slot, ""),
        input.value
      );
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("input", (event) => {
      const notesArea = event.target.closest("textarea[data-role='notes']");
      if (!notesArea) {
        return;
      }

      const day = notesArea.dataset.day;
      if (!state.planner.days[day]) {
        return;
      }

      state.planner.days[day].notes = notesArea.value;
      savePlanner();
      elements.status.textContent = `Saved notes for ${day.toUpperCase()}.`;
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const slotTask = handle.closest(".slot-task[data-day][data-slot][data-task-id]");
      const checklistItem = handle.closest(".slot-checklist-item[data-checklist-id]");
      if (!slotTask || !checklistItem) {
        return;
      }

      const payload = {
        kind: "checklist-reorder",
        taskId: cleanText(slotTask.dataset.taskId, ""),
        day: cleanText(slotTask.dataset.day, ""),
        slot: cleanText(slotTask.dataset.slot, ""),
        checklistId: cleanText(checklistItem.dataset.checklistId, ""),
      };

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      checklistItem.classList.add("is-dragging");
      event.stopPropagation();
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragend", (event) => {
      const handle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      elements.weekGrid.querySelectorAll(".slot-checklist-item.is-dragging, .slot-checklist-item.is-drop-target").forEach((itemEl) => {
        itemEl.classList.remove("is-dragging", "is-drop-target");
      });
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragover", (event) => {
      const targetItem = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (!targetItem) {
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch (error) {
        payload = null;
      }

      if (!payload || payload.kind !== "checklist-reorder") {
        return;
      }

      const slotTask = targetItem.closest(".slot-task[data-day][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      const sameTask = cleanText(slotTask.dataset.taskId, "") === cleanText(payload.taskId, "")
        && cleanText(slotTask.dataset.day, "") === cleanText(payload.day, "")
        && cleanText(slotTask.dataset.slot, "") === cleanText(payload.slot, "");

      if (!sameTask) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      targetItem.classList.add("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragleave", (event) => {
      const targetItem = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (!targetItem) {
        return;
      }

      if (event.relatedTarget && targetItem.contains(event.relatedTarget)) {
        return;
      }

      targetItem.classList.remove("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("drop", (event) => {
      const targetItem = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (!targetItem) {
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch (error) {
        payload = null;
      }

      if (!payload || payload.kind !== "checklist-reorder") {
        return;
      }

      const slotTask = targetItem.closest(".slot-task[data-day][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      const sameTask = cleanText(slotTask.dataset.taskId, "") === cleanText(payload.taskId, "")
        && cleanText(slotTask.dataset.day, "") === cleanText(payload.day, "")
        && cleanText(slotTask.dataset.slot, "") === cleanText(payload.slot, "");

      if (!sameTask) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const targetChecklistId = cleanText(targetItem.dataset.checklistId, "");
      reorderChecklistItem(payload.taskId, payload.day, payload.slot, payload.checklistId, targetChecklistId);
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragstart", (event) => {
      if (event.target.closest("[data-action='checklist-drag-handle']")) {
        return;
      }

      if (event.target.closest("button, input, textarea, select, label")) {
        event.preventDefault();
        return;
      }

      const taskEl = event.target.closest(".slot-task[draggable='true']");
      if (!taskEl) {
        return;
      }

      const payload = {
        taskId: cleanText(taskEl.dataset.taskId, ""),
      };

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      taskEl.classList.add("is-dragging");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragend", (event) => {
      const taskEl = event.target.closest(".slot-task[draggable='true']");
      if (taskEl) {
        taskEl.classList.remove("is-dragging");
      }

      elements.weekGrid.querySelectorAll(".day-slot.is-drop-target").forEach((slotEl) => {
        slotEl.classList.remove("is-drop-target");
      });
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragover", (event) => {
      const slotEl = event.target.closest(".day-slot[data-day][data-slot]");
      if (!slotEl) {
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch (error) {
        payload = null;
      }

      if (payload && payload.kind === "checklist-reorder") {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      slotEl.classList.add("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragleave", (event) => {
      const slotEl = event.target.closest(".day-slot[data-day][data-slot]");
      if (!slotEl) {
        return;
      }

      slotEl.classList.remove("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("drop", (event) => {
      const slotEl = event.target.closest(".day-slot[data-day][data-slot]");
      if (!slotEl) {
        return;
      }

      event.preventDefault();
      slotEl.classList.remove("is-drop-target");

      let payload = null;
      try {
        payload = JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch (error) {
        payload = null;
      }

      if (payload && payload.kind === "checklist-reorder") {
        return;
      }

      const taskId = payload && payload.taskId ? payload.taskId : "";
      if (!taskId) {
        return;
      }

      moveTask(taskId, slotEl.dataset.day, slotEl.dataset.slot);
    }, { signal: controller.signal });

    const teardownIfRouteChanges = () => {
      if (window.location.hash.replace("#", "") !== "planner") {
        controller.abort();
        window.removeEventListener("hashchange", teardownIfRouteChanges);
      }
    };

    window.addEventListener("hashchange", teardownIfRouteChanges);
  }

  function initialize() {
    state.curatedTasks = loadCuratedTasks();
    state.planner = loadPlanner();
    renderTaskPool();
    renderWeekGrid();
    consumeStagedQueue();
    elements.status.textContent = `Planning week of ${state.planner.weekStart}.`;
  }

  window.loadPlanner = loadPlanner;
  window.savePlanner = savePlanner;
  window.assignTask = assignTask;
  window.removeTask = removeTask;

  attachEvents();
  initialize();
}

window.initPlannerScreen = initPlannerScreen;
