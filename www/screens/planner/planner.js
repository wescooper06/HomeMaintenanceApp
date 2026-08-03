function initPlannerScreen() {
  if (window.location.hash.replace("#", "") !== "planner") {
    return;
  }

  const STORAGE_KEYS = {
    curatedTasks: "hm_task_manager_tasks",
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
    taskPool: document.getElementById("plannerTaskPool"),
    weekGrid: document.getElementById("plannerWeekGrid"),
  };

  if (!elements.status || !elements.taskPool || !elements.weekGrid) {
    return;
  }

  const controller = new AbortController();
  const state = {
    curatedTasks: [],
    planner: null,
  };

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
              taskId: cleanText(item.taskId, `slot-${index + 1}`),
              title: cleanText(item.title, "Untitled Task"),
              priority: parseNumber(item.priority, 3),
              source: cleanText(item.source, "unknown"),
              recurrence: cleanText(item.recurrence, ""),
            }))
            .filter((item) => item.taskId);
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

  function findAssignment(taskId) {
    for (let d = 0; d < DAY_ORDER.length; d += 1) {
      const dayKey = DAY_ORDER[d].key;
      for (let s = 0; s < SLOT_ORDER.length; s += 1) {
        const slotKey = SLOT_ORDER[s];
        const slotItems = state.planner.days[dayKey][slotKey] || [];
        const index = slotItems.findIndex((item) => item.taskId === taskId);
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
    return {
      taskId: cleanText(taskLike.taskId, ""),
      title: cleanText(taskLike.title, "Untitled Task"),
      priority: parseNumber(taskLike.priority, 3),
      source: cleanText(taskLike.source, "unknown"),
      recurrence: cleanText(taskLike.recurrence, ""),
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

    dayBucket[slot].push(toPlannerSlotItem(task));

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Assigned \"${task.title}\" to ${day.toUpperCase()} ${slot}.`;
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
      taskId: normalizedTaskId,
      title: cleanText(entry.title, "Untitled Task"),
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
    dayBucket[slot] = dayBucket[slot].filter((item) => item.taskId !== taskId);

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
        state.planner.days[day.key][slot] = state.planner.days[day.key][slot].filter((item) => item.taskId !== taskId);
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
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = "Task removed from Planner and schedule.";
    return true;
  }

  function buildAssignmentMap() {
    const map = new Map();

    DAY_ORDER.forEach((day) => {
      SLOT_ORDER.forEach((slot) => {
        const items = state.planner.days[day.key][slot] || [];
        items.forEach((item) => {
          if (!map.has(item.taskId)) {
            map.set(item.taskId, {
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
    if (!state.curatedTasks.length) {
      elements.taskPool.innerHTML = '<div class="pool-empty">No curated tasks found. Add tasks in Task Manager first.</div>';
      return;
    }

    const assignmentMap = buildAssignmentMap();

    elements.taskPool.innerHTML = state.curatedTasks
      .slice()
      .sort((a, b) => a.order - b.order || a.priority - b.priority || a.title.localeCompare(b.title))
      .map((task) => {
        const assignment = assignmentMap.get(task.taskId);
        const dayOptions = DAY_ORDER.map((day) => `<option value="${day.key}">${day.label}</option>`).join("");
        const slotOptions = SLOT_ORDER.map((slot) => `<option value="${slot}">${slot[0].toUpperCase()}${slot.slice(1)}</option>`).join("");

        const daySelectOptions = `<option value="">Day</option>${dayOptions}`;
        const slotSelectOptions = `<option value="">Time</option>${slotOptions}`;

        return `
          <article class="pool-task-card" data-task-id="${task.taskId}">
            <div class="pool-task-title">${task.title}</div>
            <div class="pool-task-meta">Priority: ${task.priority} | Source: ${task.source} | Category: ${task.category}</div>
            <div class="pool-task-controls">
              <label class="pool-control-label">Day
                <select data-role="day">${daySelectOptions}</select>
              </label>
              <label class="pool-control-label">Time
                <select data-role="slot">${slotSelectOptions}</select>
              </label>
              <button type="button" class="danger" data-action="remove-planner">Remove from Planner</button>
            </div>
          </article>
        `;
      })
      .join("");

    elements.taskPool.querySelectorAll(".pool-task-card").forEach((card) => {
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

  function renderWeekGrid() {
    elements.weekGrid.innerHTML = DAY_ORDER
      .map((day) => {
        const dayData = state.planner.days[day.key];

        const slotHtml = SLOT_ORDER
          .map((slot) => {
            const tasks = dayData[slot] || [];
            const taskHtml = tasks.length
              ? tasks
                  .map((task) => `
                    <div class="slot-task" draggable="true" data-day="${day.key}" data-slot="${slot}" data-task-id="${task.taskId}">
                      <div class="slot-task-title">${task.title}</div>
                      <div class="slot-task-meta">Priority: ${task.priority}</div>
                      <button type="button" data-action="remove">Remove</button>
                    </div>
                  `)
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
      const task = state.curatedTasks.find((item) => item.projectId === entry.projectId || item.taskId === entry.taskId);
      if (task) {
        const assigned = assignTask(task.taskId, "mon", "morning");
        changed = changed || assigned;
      } else {
        const assigned = assignEntryToSlot(entry, "mon", "morning");
        changed = changed || assigned;
      }
    });

    localStorage.removeItem(STORAGE_KEYS.staged);

    if (changed) {
      savePlanner();
      renderTaskPool();
      renderWeekGrid();
      elements.status.textContent = "Staged tasks were added to Monday morning.";
    }
  }

  function attachEvents() {
    elements.taskPool.addEventListener("click", (event) => {
      const removeButton = event.target.closest("button[data-action='remove-planner']");
      if (!removeButton) {
        return;
      }

      const card = removeButton.closest(".pool-task-card");
      if (!card) {
        return;
      }

      removeTaskFromPlanner(card.dataset.taskId);
    }, { signal: controller.signal });

    elements.taskPool.addEventListener("change", (event) => {
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
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("click", (event) => {
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
      const taskEl = event.target.closest(".slot-task[draggable='true']");
      if (!taskEl) {
        return;
      }

      const payload = {
        taskId: taskEl.dataset.taskId,
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
