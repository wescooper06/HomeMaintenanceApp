function initPlannerScreen() {
  if (window.location.hash.replace("#", "") !== "planner") {
    return;
  }

  const SERVICE_VERSION = "20260802-8";

  const STORAGE_KEYS = {
    curatedTasks: "hm_planner_curated_tasks",
    planner: "hm_weekly_planner",
    staged: "hm_weekly_planner_queue",
    repeatable: "hm_repeatable_tasks",
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
    curatedLeftColumn: document.getElementById("curated-left"),
    curatedMiddleColumn: document.getElementById("curated-middle"),
    taskPoolLeft: document.getElementById("plannerTaskPoolLeft"),
    taskPoolMiddle: document.getElementById("plannerTaskPoolMiddle"),
    repeatablePanel: document.getElementById("repeatable-tasks-panel"),
    curatedWarning: document.getElementById("curated-warning"),
    weekPrev: document.getElementById("week-prev"),
    weekNext: document.getElementById("week-next"),
    weekRangeLabel: document.getElementById("weekly-week-label"),
    weekScrollContainer: document.getElementById("weekly-scroll-container"),
    weekGrid: document.getElementById("plannerWeekGrid"),
    adhocTitle: document.getElementById("adhocTaskTitle"),
    adhocDay: document.getElementById("adhocTaskDay"),
    adhocSlot: document.getElementById("adhocTaskSlot"),
    adhocAddBtn: document.getElementById("adhocTaskAddBtn"),
  };

  if (!elements.status || !elements.curatedLeftColumn || !elements.curatedMiddleColumn || !elements.taskPoolLeft || !elements.taskPoolMiddle || !elements.repeatablePanel || !elements.curatedWarning || !elements.weekPrev || !elements.weekNext || !elements.weekRangeLabel || !elements.weekScrollContainer || !elements.weekGrid || !elements.adhocTitle || !elements.adhocDay || !elements.adhocSlot || !elements.adhocAddBtn) {
    return;
  }

  const controller = new AbortController();
  const state = {
    curatedTasks: [],
    repeatableTasks: [],
    repeatableOverrideMap: new Map(),
    planner: null,
    curatedWarningTimer: null,
    activeCuratedDragTaskId: "",
    activeCuratedDragIndex: -1,
    activeWeeklyDrag: null,
    allProjects: [],
  };

  const CURATED_TASK_LIMIT = 8;

  function shiftPlannerWeek(offsetDays) {
    if (!state.planner) {
      return false;
    }

    const days = parseNumber(offsetDays, 0);
    if (!days) {
      return false;
    }

    state.planner.weekStartDate = addDaysToDateKey(state.planner.weekStartDate, days);
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Planning week of ${state.planner.weekStartDate}.`;
    return true;
  }

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

  function toDateKey(dateValue) {
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey) {
    const [year, month, day] = cleanText(dateKey, "").split("-").map((part) => parseInt(part, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDaysToDateKey(dateKey, days) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    date.setDate(date.getDate() + days);
    return toDateKey(date);
  }

  function cleanSource(source) {
    return cleanText(source, "unknown").toLowerCase();
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

  function normalizeSource(source) {
    const text = cleanSource(source);
    if (text.includes("list_a") || text.includes("home")) return "home";
    if (text.includes("list_b") || text.includes("vehicle")) return "vehicle";
    if (text.includes("list_c") || text.includes("repeating")) return "repeating";
    return text;
  }

  function getWeekStartISO(dateValue) {
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return toDateKey(new Date());
    }

    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return toDateKey(date);
  }

  function getWeekDateKey(weekStartDate, dayIndex) {
    return addDaysToDateKey(weekStartDate, dayIndex);
  }

  function getVisibleWeekDateRange(weekStartDate) {
    return DAY_ORDER.map((day, index) => ({
      key: day.key,
      label: day.label,
      date: getWeekDateKey(weekStartDate, index),
    }));
  }

  function formatDateLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatWeekDayLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    const day = DAY_ORDER[(date.getDay() + 6) % 7];
    return `${day.label} (${formatDateLabel(dateKey)})`;
  }

  function buildWeeklyTaskId(taskType, sourceId, dateKey) {
    const safeSource = cleanText(sourceId, "");
    const safeDate = cleanText(dateKey, "");
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    if (taskType === "adhoc") {
      return `adhoc-${safeDate}-${stamp}`;
    }

    return `${taskType}-${safeSource}-${safeDate}-${stamp}`;
  }

  function parseWeeklySourceId(task) {
    const id = cleanText(task && (task.id || task.taskId), "");
    if (!id) {
      return "";
    }

    const taskType = cleanText(task && (task.taskType || task.type), "curated");
    if (taskType === "adhoc") {
      return "";
    }

    const match = id.match(/^(curated|repeatable)-(.+)-(\d{4}-\d{2}-\d{2})-\d+(?:-\d+)?$/);
    if (!match) {
      return cleanText(task.projectId, "");
    }

    return cleanText(match[2], "");
  }

  function buildEmptyPlanner(weekStartDate) {
    return {
      weekStartDate,
      tasks: [],
    };
  }

  function normalizeWeeklyTask(task, fallbackDate, fallbackTimeSlot) {
    if (!task || typeof task !== "object") {
      return null;
    }

    const taskType = cleanText(task.taskType || task.type, "curated");
    const date = cleanText(task.date, fallbackDate);
    const timeSlot = cleanText(task.timeSlot || task.slot, fallbackTimeSlot);
    const id = cleanText(task.id || task.taskId, buildWeeklyTaskId(taskType, task.projectId || task.taskId || task.id || "task", date));

    if (!date || !SLOT_ORDER.includes(timeSlot) || !id) {
      return null;
    }

    return {
      id,
      taskId: id,
      date,
      timeSlot,
      taskType,
      type: taskType,
      title: cleanText(task.title, "Untitled Task"),
      checklist: normalizeChecklist(task.checklist),
      checklistOpen: Boolean(task.checklistOpen),
      completed: Boolean(task.completed),
      source: cleanText(task.source, "unknown"),
      recurrence: cleanText(task.recurrence, ""),
      projectId: cleanText(task.projectId, ""),
      priority: parseNumber(task.priority, null),
    };
  }

  function migrateLegacyPlanner(parsed, weekStartDate) {
    const legacyWeekStart = cleanText(parsed.weekStartDate || parsed.weekStart, weekStartDate);
    const tasks = [];

    DAY_ORDER.forEach((day, dayIndex) => {
      const existingDay = parsed.days && parsed.days[day.key] ? parsed.days[day.key] : {};
      SLOT_ORDER.forEach((slot) => {
        const slotItems = Array.isArray(existingDay[slot]) ? existingDay[slot] : [];
        const date = getWeekDateKey(legacyWeekStart, dayIndex);
        slotItems.forEach((item, index) => {
          const normalized = normalizeWeeklyTask({
            ...item,
            id: cleanText(item.id || item.taskId, `legacy-${day.key}-${slot}-${index + 1}`),
            taskId: cleanText(item.taskId || item.id, `legacy-${day.key}-${slot}-${index + 1}`),
            date,
            timeSlot: slot,
          }, date, slot);
          if (normalized) {
            tasks.push(normalized);
          }
        });
      });
    });

    return {
      weekStartDate: legacyWeekStart,
      tasks,
    };
  }

  function ensureProjectServicesLoaded() {
    return loadScriptFresh("js/services/sheets.service.js")
      .then(() => loadScriptFresh("js/services/projects.service.js"));
  }

  function loadScriptFresh(src) {
    const versionedSrc = `${src}?v=${SERVICE_VERSION}`;

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-module-src="${src}"]`);
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
    const weekStartDate = getWeekStartISO(new Date());

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.planner);
      const parsed = JSON.parse(raw || "null");

      if (!parsed || typeof parsed !== "object") {
        return buildEmptyPlanner(weekStartDate);
      }

      if (Array.isArray(parsed.tasks)) {
        const safePlanner = buildEmptyPlanner(cleanText(parsed.weekStartDate || parsed.weekStart, weekStartDate));
        safePlanner.tasks = parsed.tasks
          .map((item) => normalizeWeeklyTask(item, cleanText(item.date, safePlanner.weekStartDate), cleanText(item.timeSlot || item.slot, "morning")))
          .filter(Boolean);
        return safePlanner;
      }

      if (parsed.days) {
        return migrateLegacyPlanner(parsed, cleanText(parsed.weekStartDate || parsed.weekStart, weekStartDate));
      }

      return buildEmptyPlanner(cleanText(parsed.weekStartDate || parsed.weekStart, weekStartDate));
    } catch (error) {
      console.warn("Failed to read planner data", error);
      return buildEmptyPlanner(weekStartDate);
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

  function getVisibleDateForDay(dayKey) {
    const dayIndex = DAY_ORDER.findIndex((item) => item.key === dayKey);
    if (dayIndex < 0) {
      return "";
    }

    return getWeekDateKey(state.planner.weekStartDate, dayIndex);
  }

  function assignTask(taskId, day, slot) {
    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const task = state.curatedTasks.find((item) => item.taskId === taskId);
    if (!task) {
      return false;
    }

    upsertWeeklyTaskFromSource({
      ...task,
      taskType: "curated",
      type: "curated",
      checklist: task.checklist || [],
      completed: false,
    }, date, slot, "curated");

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Assigned "${task.title}" to ${day.toUpperCase()} ${slot}.`;
    return true;
  }

  function addAdHocTask(title, day, slot) {
    const normalizedTitle = cleanText(title, "");
    if (!normalizedTitle) {
      elements.status.textContent = "Ad-hoc task title is required.";
      return false;
    }

    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      elements.status.textContent = "Please select a valid day and time for the ad-hoc task.";
      return false;
    }

    const adHocItem = toPlannerSlotItem({
      id: buildWeeklyTaskId("adhoc", "adhoc", date),
      taskId: buildWeeklyTaskId("adhoc", "adhoc", date),
      date,
      timeSlot: slot,
      title: normalizedTitle,
      type: "adhoc",
      taskType: "adhoc",
      source: "adhoc",
      recurrence: "",
      priority: null,
      checklist: [],
      checklistOpen: false,
      completed: false,
    });

    state.planner.tasks.push(adHocItem);
    savePlanner();
    renderWeekGrid();

    elements.adhocTitle.value = "";
    elements.adhocDay.value = "mon";
    elements.adhocSlot.value = "morning";
    elements.status.textContent = `Added ad-hoc task "${normalizedTitle}" to ${day.toUpperCase()} ${slot}.`;
    return true;
  }

  function assignEntryToSlot(entry, day, slot) {
    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const normalizedTaskId = cleanText(entry.taskId, "") || cleanText(entry.projectId, "") || cleanText(entry.id, "");
    if (!normalizedTaskId) {
      return false;
    }

    upsertWeeklyTaskFromSource({
      id: normalizedTaskId,
      taskId: normalizedTaskId,
      title: cleanText(entry.title, "Untitled Task"),
      type: "curated",
      taskType: "curated",
      priority: parseNumber(entry.priority, 3),
      source: cleanText(entry.source, "unknown"),
      recurrence: cleanText(entry.recurrence, ""),
      checklist: normalizeChecklist(entry.checklist),
      checklistOpen: Boolean(entry.checklistOpen),
      completed: Boolean(entry.completed),
    }, date, slot, "curated");

    return true;
  }

  function moveTask(taskId, toDate, toSlot) {
    const targetDate = cleanText(toDate, "");
    if (!targetDate || !SLOT_ORDER.includes(toSlot)) {
      return false;
    }

    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    const taskType = cleanText(existing.item.taskType || existing.item.type, "curated");
    const sourceId = parseWeeklySourceId(existing.item) || cleanText(existing.item.projectId, "") || cleanText(existing.item.taskId, "");
    existing.item.date = targetDate;
    existing.item.timeSlot = toSlot;
    existing.item.id = buildWeeklyTaskId(taskType, sourceId, targetDate);
    existing.item.taskId = existing.item.id;
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Moved "${existing.item.title}" to ${targetDate} ${toSlot}.`;
    return true;
  }

  function shiftTaskWeek(taskId, offsetWeeks) {
    const existing = findWeeklyTaskById(taskId);
    const weekOffset = parseNumber(offsetWeeks, 0);
    if (!existing) {
      return false;
    }

    if (!weekOffset) {
      renderWeekGrid();
      return true;
    }

    const taskType = cleanText(existing.item.taskType || existing.item.type, "curated");
    const sourceId = parseWeeklySourceId(existing.item) || cleanText(existing.item.projectId, "") || cleanText(existing.item.taskId, "");
    const newDate = addDaysToDateKey(existing.item.date, weekOffset * 7);
    const newWeekStartDate = getWeekStartISO(parseDateKey(newDate) || newDate);

    existing.item.date = newDate;
    existing.item.id = buildWeeklyTaskId(taskType, sourceId, newDate);
    existing.item.taskId = existing.item.id;
    state.planner.weekStartDate = newWeekStartDate;

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Moved "${existing.item.title}" ${weekOffset > 0 ? "forward" : "back"} one week.`;
    return true;
  }

  function closeWeekMenus(exceptPicker) {
    elements.weekGrid.querySelectorAll(".slot-task-week-picker.is-open").forEach((picker) => {
      if (exceptPicker && picker === exceptPicker) {
        return;
      }

      picker.classList.remove("is-open");
      const menu = picker.querySelector("[data-role='task-week-menu']");
      if (menu) {
        menu.hidden = true;
      }
    });
  }

  function removeTask(taskId) {
    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    state.planner.tasks.splice(existing.index, 1);
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

    const beforeSchedule = state.planner.tasks.length;
    state.planner.tasks = state.planner.tasks.filter((item) => cleanText(item.taskType || item.type, "curated") !== "curated" || parseWeeklySourceId(item) !== cleanText(taskId, ""));
    const removedFromSchedule = state.planner.tasks.length !== beforeSchedule;

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

  function removeWeeklyCopiesForRepeatable(projectId) {
    const before = state.planner.tasks.length;
    state.planner.tasks = state.planner.tasks.filter((item) => cleanText(item.taskType || item.type, "curated") !== "repeatable" || parseWeeklySourceId(item) !== cleanText(projectId, ""));
    return state.planner.tasks.length !== before;
  }

  function removeRepeatableMaster(projectId) {
    const override = state.repeatableOverrideMap.get(projectId) || {};
    state.repeatableOverrideMap.set(projectId, {
      ...override,
      projectId,
      removed: true,
    });

    const removedCopies = removeWeeklyCopiesForRepeatable(projectId);
    state.repeatableTasks = state.repeatableTasks.filter((task) => task.projectId !== projectId);

    saveRepeatableOverrides(Array.from(state.repeatableOverrideMap.values()));
    savePlanner();
    renderRepeatablePanel();
    renderWeekGrid();
    if (removedCopies) {
      elements.status.textContent = "Repeatable task removed and all weekly copies cleared.";
    } else {
      elements.status.textContent = "Repeatable task removed from master list.";
    }
  }

  function createWeeklyRepeatableCopy(masterTask, date, slot) {
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const uniqueId = buildWeeklyTaskId("repeatable", masterTask.projectId, date);

    const weeklyTask = toPlannerSlotItem({
      id: uniqueId,
      taskId: uniqueId,
      date,
      timeSlot: slot,
      projectId: masterTask.projectId,
      title: cleanText(masterTask.title, "Untitled Task"),
      type: "repeatable",
      taskType: "repeatable",
      source: "repeating",
      category: cleanText(masterTask.category, "uncategorized"),
      state: cleanText(masterTask.state, "unknown"),
      priority: null,
      recurrence: "",
      order: null,
      checklist: [],
      checklistOpen: false,
      completed: false,
    });

    state.planner.tasks.push(weeklyTask);
    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Added repeatable task "${masterTask.title}" to ${date}.`;
    return true;
  }

  function findWeeklyTaskById(taskId) {
    const targetId = cleanText(taskId, "");
    if (!targetId) {
      return null;
    }

    const index = Array.isArray(state.planner.tasks)
      ? state.planner.tasks.findIndex((item) => getSlotItemId(item) === targetId)
      : -1;

    if (index < 0) {
      return null;
    }

    return {
      item: state.planner.tasks[index],
      index,
    };
  }

  function findVisibleWeeklySourceTask(taskType, sourceId) {
    const visibleDates = new Set(getVisibleWeekDateRange(state.planner.weekStartDate).map((item) => item.date));
    const targetSourceId = cleanText(sourceId, "");

    return state.planner.tasks.find((item) => {
      if (cleanText(item.taskType || item.type, "curated") !== taskType) {
        return false;
      }

      if (!visibleDates.has(cleanText(item.date, ""))) {
        return false;
      }

      return parseWeeklySourceId(item) === targetSourceId;
    }) || null;
  }

  function toPlannerSlotItem(taskLike) {
    return normalizeWeeklyTask(taskLike, cleanText(taskLike && taskLike.date, ""), cleanText(taskLike && (taskLike.timeSlot || taskLike.slot), "morning"));
  }

  function upsertWeeklyTaskFromSource(taskLike, date, timeSlot, taskType) {
    const normalizedDate = cleanText(date, "");
    const normalizedSlot = cleanText(timeSlot, "");
    if (!normalizedDate || !SLOT_ORDER.includes(normalizedSlot)) {
      return null;
    }

    const sourceId = cleanText(taskLike.taskId || taskLike.projectId || taskLike.id, "");
    const existingIndex = state.planner.tasks.findIndex((item) => {
      return cleanText(item.taskType || item.type, "curated") === taskType
        && parseWeeklySourceId(item) === sourceId
        && cleanText(item.date, "") === normalizedDate;
    });

    const weeklyTask = toPlannerSlotItem({
      id: existingIndex >= 0 ? state.planner.tasks[existingIndex].id : buildWeeklyTaskId(taskType, sourceId, normalizedDate),
      taskId: existingIndex >= 0 ? state.planner.tasks[existingIndex].taskId : buildWeeklyTaskId(taskType, sourceId, normalizedDate),
      date: normalizedDate,
      timeSlot: normalizedSlot,
      taskType,
      type: taskType,
      title: cleanText(taskLike.title, "Untitled Task"),
      checklist: taskType === "curated" ? normalizeChecklist(taskLike.checklist) : [],
      checklistOpen: Boolean(taskLike.checklistOpen),
      completed: Boolean(taskLike.completed),
      source: cleanText(taskLike.source, taskType === "adhoc" ? "adhoc" : "unknown"),
      recurrence: cleanText(taskLike.recurrence, ""),
      projectId: cleanText(taskLike.projectId, ""),
      priority: parseNumber(taskLike.priority, null),
    });

    if (existingIndex >= 0) {
      state.planner.tasks[existingIndex] = {
        ...state.planner.tasks[existingIndex],
        ...weeklyTask,
      };
    } else {
      state.planner.tasks.push(weeklyTask);
    }

    return weeklyTask;
  }

  function renderRepeatablePanel() {
    if (!state.repeatableTasks.length) {
      elements.repeatablePanel.innerHTML = '<div class="pool-empty">No repeatable tasks found.</div>';
      return;
    }

    elements.repeatablePanel.innerHTML = state.repeatableTasks
      .map((task) => `
        <article class="repeatable-task-card" data-repeatable-project-id="${task.projectId}">
          <span class="repeatable-task-handle" data-action="repeatable-drag-handle" draggable="true" title="Drag to weekly planner" aria-label="Drag repeatable task">⋮⋮</span>
          <div class="repeatable-task-title">${task.title}</div>
          <button type="button" class="repeatable-task-remove" data-action="remove-repeatable-master" title="Remove repeatable task" aria-label="Remove repeatable task">X</button>
        </article>
      `)
      .join("");
  }

  async function loadRepeatableTasks() {
    try {
      await ensureProjectServicesLoaded();
      const projects = await window.loadAllProjects();
      state.allProjects = (projects || []).map(toProjectView);

      const overrides = loadRepeatableOverrides();
      const overrideMap = new Map(overrides.map((item) => [item.projectId, item]));
      state.repeatableOverrideMap = overrideMap;

      state.repeatableTasks = [...state.allProjects]
        .filter((project) => project.source === "repeating")
        .map((project, index) => {
          const override = overrideMap.get(project.projectId) || {};
          if (override.removed === true) {
            return null;
          }

          return {
            taskId: `repeatable-${project.projectId}`,
            projectId: project.projectId,
            title: project.title,
            source: "repeating",
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

      renderRepeatablePanel();
    } catch (error) {
      console.warn("Failed to load repeatable tasks", error);
      state.repeatableTasks = [];
      renderRepeatablePanel();
    }
  }

  function findSlotTask(day, slot, taskId) {
    const dayIndex = DAY_ORDER.findIndex((item) => item.key === day);
    if (dayIndex < 0 || !SLOT_ORDER.includes(slot)) {
      return null;
    }

    const date = getWeekDateKey(state.planner.weekStartDate, dayIndex);
    const index = state.planner.tasks.findIndex((item) => getSlotItemId(item) === taskId && cleanText(item.date, "") === date && cleanText(item.timeSlot, "") === slot);
    if (index < 0) {
      return null;
    }

    return {
      item: state.planner.tasks[index],
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

    const visibleDates = new Set(getVisibleWeekDateRange(state.planner.weekStartDate).map((item) => item.date));
    state.planner.tasks.forEach((item) => {
      const taskType = cleanText(item.taskType || item.type, "curated");
      const sourceId = parseWeeklySourceId(item);
      if (taskType !== "curated" || !sourceId || !visibleDates.has(cleanText(item.date, ""))) {
        return;
      }

      if (!map.has(sourceId)) {
        map.set(sourceId, {
          date: cleanText(item.date, ""),
          slot: cleanText(item.timeSlot, ""),
        });
      }
    });

    return map;
  }

  function getWeeklyTaskType(task) {
    return cleanText(task && (task.taskType || task.type), "curated");
  }

  function renderWeeklyTaskCard(task, dateKey, slot) {
    const taskType = getWeeklyTaskType(task);
    const taskId = getSlotItemId(task);
    const taskCompleted = Boolean(task.completed);
    const title = cleanText(task.title, "Untitled Task");
    const weekPickerMenu = `
      <div class="slot-task-week-picker">
        <button type="button" class="slot-task-week-button" data-action="task-week-picker" aria-label="Move task to week" title="Move task to week">
          <span class="slot-task-week-icon" aria-hidden="true"></span>
        </button>
        <div class="slot-task-week-menu" data-role="task-week-menu" hidden>
          <button type="button" class="slot-task-week-menu-item" data-action="task-week-shift" data-week-offset="-1">Last Week</button>
          <button type="button" class="slot-task-week-menu-item" data-action="task-week-shift" data-week-offset="0">This Week</button>
          <button type="button" class="slot-task-week-menu-item" data-action="task-week-shift" data-week-offset="1">Next Week</button>
        </div>
      </div>
    `;
    const cardClass = taskType === "repeatable"
      ? "slot-task slot-task-repeatable"
      : taskType === "adhoc"
        ? "slot-task slot-task-adhoc"
        : "slot-task slot-task-curated";

    if (taskType === "repeatable") {
      return `
        <div class="${cardClass} ${taskCompleted ? "is-complete" : ""}" data-date="${dateKey}" data-slot="${slot}" data-task-id="${taskId}" data-task-type="${taskType}">
          <div class="slot-task-layout">
            <span class="slot-task-handle" data-action="weekly-drag-handle" draggable="true" title="Drag to move" aria-label="Drag to move">⋮⋮</span>
            <div class="slot-task-main">
              <div class="slot-task-header">
                <div class="slot-task-title">${title}</div>
                <div class="slot-task-header-actions">
                  ${weekPickerMenu}
                  <input type="checkbox" class="slot-task-complete" data-action="task-complete-toggle" aria-label="Mark task complete" ${taskCompleted ? "checked" : ""} />
                  <button type="button" class="slot-task-remove" data-action="remove" aria-label="Remove task" title="Remove task">X</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const checklist = normalizeChecklist(task.checklist);
    const checklistOpen = Boolean(task.checklistOpen);
    const checklistToggleLabel = `Checklist ${checklistOpen ? "▲" : "▼"}`;
    const checklistHtml = taskType === "curated"
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
      <div class="${cardClass} ${taskCompleted ? "is-complete" : ""}" data-date="${dateKey}" data-slot="${slot}" data-task-id="${taskId}" data-task-type="${taskType}">
        <div class="slot-task-layout">
          <span class="slot-task-handle" data-action="weekly-drag-handle" draggable="true" title="Drag to move" aria-label="Drag to move">⋮⋮</span>
          <div class="slot-task-main">
            <div class="slot-task-header">
              <div class="slot-task-title">${title}</div>
              <div class="slot-task-header-actions">
                ${weekPickerMenu}
                <input type="checkbox" class="slot-task-complete" data-action="task-complete-toggle" aria-label="Mark task complete" ${taskCompleted ? "checked" : ""} />
                <button type="button" class="slot-task-remove" data-action="remove" aria-label="Remove task" title="Remove task">X</button>
              </div>
            </div>
            ${checklistHtml}
          </div>
        </div>
      </div>
    `;
  }

  function renderTaskPool() {
    const renderPoolCards = (tasks, startIndex) => tasks
      .map((task, index) => {
        const assignment = assignmentMap.get(task.taskId);
        const dayOptions = DAY_ORDER.map((day) => `<option value="${day.key}">${day.label}</option>`).join("");
        const slotOptions = SLOT_ORDER.map((slot) => `<option value="${slot}">${slot[0].toUpperCase()}${slot.slice(1)}</option>`).join("");

        const daySelectOptions = `<option value="">Day</option>${dayOptions}`;
        const slotSelectOptions = `<option value="">Time</option>${slotOptions}`;
        const orderValue = task.order == null || String(task.order).trim() === "" ? "-" : String(task.order);

        return `
          <article class="pool-task-card" data-curated-index="${index}" data-curated-global-index="${startIndex + index}" data-task-id="${task.taskId}">
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

    elements.taskPoolLeft.innerHTML = renderPoolCards(leftTasks, 0);
    elements.taskPoolMiddle.innerHTML = renderPoolCards(middleTasks, 4);

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
    const weekDates = getVisibleWeekDateRange(state.planner.weekStartDate);
    if (elements.weekRangeLabel) {
      const first = weekDates[0] ? formatDateLabel(weekDates[0].date) : "";
      const last = weekDates[6] ? formatDateLabel(weekDates[6].date) : "";
      const year = weekDates[0] ? parseDateKey(weekDates[0].date)?.getFullYear() : "";
      elements.weekRangeLabel.textContent = first && last ? `${first} - ${last}${year ? ` (${year})` : ""}` : "";
    }

    elements.weekScrollContainer.scrollLeft = 0;

    elements.weekGrid.innerHTML = weekDates
      .map((day) => {
        const dayHeading = formatWeekDayLabel(day.date);
        const slotHtml = SLOT_ORDER
          .map((slot) => {
            const tasks = state.planner.tasks.filter((item) => cleanText(item.date, "") === day.date && cleanText(item.timeSlot, "") === slot);
            const taskHtml = tasks.length
              ? tasks
                  .map((task) => renderWeeklyTaskCard(task, day.date, slot))
                  .join("")
              : '<div class="slot-empty">No tasks assigned</div>';
            const slotLabel = `${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;

            return `
              <section class="day-slot" data-day="${day.key}" data-date="${day.date}" data-slot="${slot}">
                <h4 class="day-slot-label">${slotLabel}</h4>
                <div class="slot-task-list">${taskHtml}</div>
              </section>
            `;
          })
          .join("");

        return `
          <article class="weekly-day-column" data-day="${day.key}" data-date="${day.date}">
            <h3 class="weekly-day-label">${dayHeading}</h3>
            ${slotHtml}
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

    elements.repeatablePanel.addEventListener("click", (event) => {
      const removeButton = event.target.closest("button[data-action='remove-repeatable-master']");
      if (!removeButton) {
        return;
      }

      const card = removeButton.closest(".repeatable-task-card");
      if (!card) {
        return;
      }

      removeRepeatableMaster(card.dataset.repeatableProjectId);
    }, { signal: controller.signal });

    elements.repeatablePanel.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-action='repeatable-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest(".repeatable-task-card");
      if (!card) {
        return;
      }

      const payload = {
        kind: "repeatable-copy",
        projectId: cleanText(card.dataset.repeatableProjectId, ""),
      };

      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    }, { signal: controller.signal });

    elements.repeatablePanel.addEventListener("dragend", () => {
      state.activeWeeklyDrag = null;
      elements.repeatablePanel.querySelectorAll(".repeatable-task-card.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
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
      elements.curatedLeftColumn.classList.remove("drag-over");
      elements.curatedMiddleColumn.classList.remove("drag-over");
      [
        ...elements.taskPoolLeft.querySelectorAll(".pool-task-card.is-drop-target"),
        ...elements.taskPoolMiddle.querySelectorAll(".pool-task-card.is-drop-target"),
      ].forEach((card) => card.classList.remove("is-drop-target"));
    };

    const getCuratedColumnSide = (columnEl) => {
      if (columnEl === elements.curatedLeftColumn) {
        return "left";
      }
      if (columnEl === elements.curatedMiddleColumn) {
        return "middle";
      }
      return "";
    };

    const resolveCuratedColumn = (eventTarget, fallbackTarget) => {
      const fromEventTarget = eventTarget && eventTarget.closest
        ? eventTarget.closest("#curated-left, #curated-middle")
        : null;
      if (fromEventTarget) {
        return fromEventTarget;
      }

      const fromCurrentTarget = fallbackTarget && fallbackTarget.closest
        ? fallbackTarget.closest("#curated-left, #curated-middle")
        : null;
      return fromCurrentTarget || null;
    };

    const getCuratedDropPlacement = (columnEl, clientY) => {
      const cards = Array.from(columnEl.querySelectorAll(".pool-task-card"));
      const cardWithoutDragged = cards.filter((card) => parseNumber(card.dataset.curatedGlobalIndex, -1) !== state.activeCuratedDragIndex);

      if (!cardWithoutDragged.length) {
        return {
          targetGlobalIndex: null,
          highlightTaskId: "",
        };
      }

      for (let i = 0; i < cardWithoutDragged.length; i += 1) {
        const card = cardWithoutDragged[i];
        const rect = card.getBoundingClientRect();
        const midpoint = rect.top + (rect.height / 2);
        if (clientY <= midpoint) {
          const globalIndex = parseNumber(card.dataset.curatedGlobalIndex, null);
          return {
            targetGlobalIndex: globalIndex,
            highlightTaskId: cleanText(card.dataset.taskId, ""),
          };
        }
      }

      const lastCard = cardWithoutDragged[cardWithoutDragged.length - 1];
      const lastGlobalIndex = parseNumber(lastCard.dataset.curatedGlobalIndex, null);
      return {
        targetGlobalIndex: lastGlobalIndex == null ? null : (lastGlobalIndex + 1),
        highlightTaskId: cleanText(lastCard.dataset.taskId, ""),
      };
    };

    const reorderCuratedTasksByPlacement = (fromIndex, targetGlobalIndex, side) => {
      if (fromIndex < 0) {
        return false;
      }

      const next = [...state.curatedTasks];
      const [moved] = next.splice(fromIndex, 1);

      let insertIndex;
      if (targetGlobalIndex == null) {
        insertIndex = side === "left" ? 0 : Math.min(4, next.length);
      } else {
        insertIndex = targetGlobalIndex;
        if (targetGlobalIndex > fromIndex) {
          insertIndex -= 1;
        }
      }

      if (side === "left") {
        insertIndex = Math.min(insertIndex, Math.min(4, next.length));
      } else if (side === "middle") {
        insertIndex = Math.max(insertIndex, Math.min(4, next.length));
      }

      insertIndex = Math.max(0, Math.min(insertIndex, next.length));
      next.splice(insertIndex, 0, moved);
      state.curatedTasks = next;
      saveCuratedTasks();
      renderTaskPool();
      return true;
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
        index: parseNumber(card.dataset.curatedGlobalIndex, -1),
      };

      state.activeCuratedDragTaskId = payload.taskId;
      state.activeCuratedDragIndex = payload.index;
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
      state.activeCuratedDragIndex = -1;
      clearCuratedDropTargets();
    };

    const onCuratedDragOver = (event) => {
      if (!cleanText(state.activeCuratedDragTaskId, "")) {
        return;
      }

      const columnEl = resolveCuratedColumn(event.target, event.currentTarget);
      if (!columnEl) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      elements.curatedLeftColumn.classList.toggle("drag-over", columnEl === elements.curatedLeftColumn);
      elements.curatedMiddleColumn.classList.toggle("drag-over", columnEl === elements.curatedMiddleColumn);

      const placement = getCuratedDropPlacement(columnEl, event.clientY);
      clearCuratedDropTargets();
      elements.curatedLeftColumn.classList.toggle("drag-over", columnEl === elements.curatedLeftColumn);
      elements.curatedMiddleColumn.classList.toggle("drag-over", columnEl === elements.curatedMiddleColumn);

      const highlightTaskId = placement.highlightTaskId;
      const card = highlightTaskId
        ? columnEl.querySelector(`.pool-task-card[data-task-id="${highlightTaskId}"]`)
        : null;

      if (card) {
        card.classList.add("is-drop-target");
      }
    };

    const onCuratedDragLeave = (event) => {
      const columnEl = resolveCuratedColumn(event.target, event.currentTarget);
      if (!columnEl) {
        return;
      }

      if (event.relatedTarget && columnEl.contains(event.relatedTarget)) {
        return;
      }

      columnEl.classList.remove("drag-over");
      clearCuratedDropTargets();
    };

    const onCuratedDrop = (event) => {
      const fromTaskId = cleanText(state.activeCuratedDragTaskId, "");
      if (!fromTaskId) {
        return;
      }

      const columnEl = resolveCuratedColumn(event.target, event.currentTarget);
      const side = getCuratedColumnSide(columnEl);
      if (!columnEl || !side) {
        return;
      }

      event.preventDefault();

      let transferPayload = null;
      try {
        transferPayload = JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch (error) {
        transferPayload = null;
      }

      const draggedTaskId = cleanText(transferPayload && transferPayload.taskId, fromTaskId);
      const draggedIndexFromPayload = parseNumber(transferPayload && transferPayload.index, state.activeCuratedDragIndex);
      const resolvedFromIndex = Number.isInteger(draggedIndexFromPayload)
        && draggedIndexFromPayload >= 0
        && draggedIndexFromPayload < state.curatedTasks.length
        ? draggedIndexFromPayload
        : state.curatedTasks.findIndex((task) => cleanText(task.taskId, "") === draggedTaskId);
      const placement = getCuratedDropPlacement(columnEl, event.clientY);

      reorderCuratedTasksByPlacement(resolvedFromIndex, placement.targetGlobalIndex, side);
      clearCuratedDropTargets();
      state.activeCuratedDragTaskId = "";
      state.activeCuratedDragIndex = -1;
    };

    elements.curatedLeftColumn.addEventListener("dragstart", onCuratedDragStart, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragstart", onCuratedDragStart, { signal: controller.signal });
    elements.curatedLeftColumn.addEventListener("dragend", onCuratedDragEnd, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragend", onCuratedDragEnd, { signal: controller.signal });

    elements.curatedLeftColumn.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.curatedLeftColumn.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.curatedLeftColumn.addEventListener("drop", onCuratedDrop, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("drop", onCuratedDrop, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("drop", onCuratedDrop, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("drop", onCuratedDrop, { signal: controller.signal });

    elements.weekPrev.addEventListener("click", () => {
      shiftPlannerWeek(-7);
    }, { signal: controller.signal });

    elements.weekNext.addEventListener("click", () => {
      shiftPlannerWeek(7);
    }, { signal: controller.signal });

    document.addEventListener("click", (event) => {
      closeWeekMenus(event.target.closest(".slot-task-week-picker"));
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("click", (event) => {
      const slotTask = event.target.closest(".slot-task[data-date][data-slot][data-task-id]");
      const actionButton = event.target.closest("button[data-action]");

      if (slotTask && actionButton) {
        const taskId = cleanText(slotTask.dataset.taskId, "");
        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");
        const day = cleanText(daySlot && daySlot.dataset.day, "");
        const slot = cleanText(slotTask.dataset.slot, "");
        const checklistId = cleanText(actionButton.dataset.checklistId, "");
        const action = cleanText(actionButton.dataset.action, "");

        if (action === "task-week-picker") {
          const picker = actionButton.closest(".slot-task-week-picker");
          const menu = picker && picker.querySelector("[data-role='task-week-menu']");
          if (!picker || !menu) {
            return;
          }

          const nextOpen = !picker.classList.contains("is-open");
          closeWeekMenus(nextOpen ? picker : null);
          picker.classList.toggle("is-open", nextOpen);
          menu.hidden = !nextOpen;
          return;
        }

        if (action === "task-week-shift") {
          closeWeekMenus();
          shiftTaskWeek(taskId, parseNumber(actionButton.dataset.weekOffset, 0));
          return;
        }

        if (action === "remove") {
          closeWeekMenus();
          removeTask(taskId);
          return;
        }

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
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("change", (event) => {
      const taskCompleteCheckbox = event.target.closest("input[data-action='task-complete-toggle']");
      if (taskCompleteCheckbox) {
        const slotTask = taskCompleteCheckbox.closest(".slot-task[data-date][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

        setTaskCompleted(
          cleanText(slotTask.dataset.taskId, ""),
          cleanText(daySlot && daySlot.dataset.day, ""),
          cleanText(slotTask.dataset.slot, ""),
          taskCompleteCheckbox.checked
        );
        return;
      }

      const checkbox = event.target.closest("input[data-action='checklist-item-toggle']");
      if (!checkbox) {
        return;
      }

      const slotTask = checkbox.closest(".slot-task[data-date][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

      toggleChecklistItem(
        cleanText(slotTask.dataset.taskId, ""),
        cleanText(daySlot && daySlot.dataset.day, ""),
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

      const slotTask = input.closest(".slot-task[data-date][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

      addChecklistItem(
        cleanText(slotTask.dataset.taskId, ""),
        cleanText(daySlot && daySlot.dataset.day, ""),
        cleanText(slotTask.dataset.slot, ""),
        input.value
      );
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const slotTask = handle.closest(".slot-task[data-date][data-slot][data-task-id]");
      const checklistItem = handle.closest(".slot-checklist-item[data-checklist-id]");
      if (!slotTask || !checklistItem) {
        return;
      }

      const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

      const payload = {
        kind: "checklist-reorder",
        taskId: cleanText(slotTask.dataset.taskId, ""),
        day: cleanText(daySlot && daySlot.dataset.day, ""),
        slot: cleanText(slotTask.dataset.slot, ""),
        checklistId: cleanText(checklistItem.dataset.checklistId, ""),
      };

      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      checklistItem.classList.add("is-dragging");
      event.stopPropagation();
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragstart", (event) => {
      const checklistHandle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (checklistHandle) {
        return;
      }

      const handle = event.target.closest("[data-action='weekly-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const taskCard = handle.closest(".slot-task[data-date][data-slot][data-task-id]");
      if (!taskCard) {
        return;
      }

      const daySlot = taskCard.closest(".day-slot[data-day][data-date][data-slot]");

      const payload = {
        kind: "weekly-move",
        taskId: cleanText(taskCard.dataset.taskId, ""),
        day: cleanText(daySlot && daySlot.dataset.day, ""),
        date: cleanText(taskCard.dataset.date, ""),
        slot: cleanText(taskCard.dataset.slot, ""),
      };

      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragend", (event) => {
      const checklistHandle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (checklistHandle) {
        state.activeWeeklyDrag = null;
        elements.weekGrid.querySelectorAll(".slot-checklist-item.is-dragging, .slot-checklist-item.is-drop-target").forEach((itemEl) => {
          itemEl.classList.remove("is-dragging", "is-drop-target");
        });
        return;
      }

      state.activeWeeklyDrag = null;
      elements.weekGrid.querySelectorAll(".day-slot.is-drop-target").forEach((slotEl) => {
        slotEl.classList.remove("is-drop-target");
      });
      elements.weekGrid.querySelectorAll(".slot-task.is-dragging").forEach((card) => {
        card.classList.remove("is-dragging");
      });
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragover", (event) => {
      const checklistTarget = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (checklistTarget && state.activeWeeklyDrag && state.activeWeeklyDrag.kind === "checklist-reorder") {
        const slotTask = checklistTarget.closest(".slot-task[data-date][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

        const sameTask = cleanText(slotTask.dataset.taskId, "") === cleanText(state.activeWeeklyDrag.taskId, "")
          && cleanText(daySlot && daySlot.dataset.day, "") === cleanText(state.activeWeeklyDrag.day, "")
          && cleanText(slotTask.dataset.slot, "") === cleanText(state.activeWeeklyDrag.slot, "");

        if (!sameTask) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        checklistTarget.classList.add("is-drop-target");
        return;
      }

      const slotEl = event.target.closest(".day-slot[data-day][data-date][data-slot]");
      if (!slotEl || !state.activeWeeklyDrag) {
        return;
      }

      if (state.activeWeeklyDrag.kind === "checklist-reorder") {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = state.activeWeeklyDrag.kind === "repeatable-copy" ? "copy" : "move";
      slotEl.classList.add("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragleave", (event) => {
      const checklistTarget = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (checklistTarget) {
        if (event.relatedTarget && checklistTarget.contains(event.relatedTarget)) {
          return;
        }

        checklistTarget.classList.remove("is-drop-target");
        return;
      }

      const slotEl = event.target.closest(".day-slot[data-day][data-date][data-slot]");
      if (!slotEl) {
        return;
      }

      if (event.relatedTarget && slotEl.contains(event.relatedTarget)) {
        return;
      }

      slotEl.classList.remove("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("drop", (event) => {
      const checklistTarget = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (checklistTarget && state.activeWeeklyDrag && state.activeWeeklyDrag.kind === "checklist-reorder") {
        const slotTask = checklistTarget.closest(".slot-task[data-date][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

        const sameTask = cleanText(slotTask.dataset.taskId, "") === cleanText(state.activeWeeklyDrag.taskId, "")
          && cleanText(daySlot && daySlot.dataset.day, "") === cleanText(state.activeWeeklyDrag.day, "")
          && cleanText(slotTask.dataset.slot, "") === cleanText(state.activeWeeklyDrag.slot, "");

        if (!sameTask) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const targetChecklistId = cleanText(checklistTarget.dataset.checklistId, "");
        reorderChecklistItem(state.activeWeeklyDrag.taskId, state.activeWeeklyDrag.day, state.activeWeeklyDrag.slot, state.activeWeeklyDrag.checklistId, targetChecklistId);
        state.activeWeeklyDrag = null;
        return;
      }

      const slotEl = event.target.closest(".day-slot[data-day][data-date][data-slot]");
      if (!slotEl || !state.activeWeeklyDrag) {
        return;
      }

      if (state.activeWeeklyDrag.kind === "checklist-reorder") {
        return;
      }

      event.preventDefault();
      slotEl.classList.remove("is-drop-target");

      const day = cleanText(slotEl.dataset.day, "");
      const date = cleanText(slotEl.dataset.date, "");
      const slot = cleanText(slotEl.dataset.slot, "");
      const payload = state.activeWeeklyDrag;

      if (payload.kind === "repeatable-copy") {
        const masterTask = state.repeatableTasks.find((task) => cleanText(task.projectId, "") === cleanText(payload.projectId, ""));
        if (masterTask) {
          createWeeklyRepeatableCopy(masterTask, date, slot);
        }
        state.activeWeeklyDrag = null;
        return;
      }

      if (payload.kind === "weekly-move") {
        moveTask(payload.taskId, cleanText(slotEl.dataset.date, ""), slot);
      }

      state.activeWeeklyDrag = null;
    }, { signal: controller.signal });

    const teardownIfRouteChanges = () => {
      if (window.location.hash.replace("#", "") !== "planner") {
        controller.abort();
        window.removeEventListener("hashchange", teardownIfRouteChanges);
      }
    };

    window.addEventListener("hashchange", teardownIfRouteChanges);
  }

  async function initialize() {
    state.curatedTasks = loadCuratedTasks();
    state.planner = loadPlanner();
    await loadRepeatableTasks();
    renderTaskPool();
    renderWeekGrid();
    consumeStagedQueue();
    elements.status.textContent = `Planning week of ${state.planner.weekStartDate}.`;
  }

  window.loadPlanner = loadPlanner;
  window.savePlanner = savePlanner;
  window.assignTask = assignTask;
  window.removeTask = removeTask;
  window.shiftPlannerWeek = shiftPlannerWeek;

  attachEvents();
  initialize().catch((error) => {
    console.error(error);
    elements.status.textContent = "Unable to load Planner.";
  });
}

window.initPlannerScreen = initPlannerScreen;
