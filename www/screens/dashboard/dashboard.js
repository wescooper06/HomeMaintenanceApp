function initDashboardScreen() {
  if (window.location.hash.replace("#", "") !== "dashboard") {
    return;
  }

  const SERVICE_VERSION = "20260727-4";

  const STORAGE_KEYS = {
    curatedTasks: "hm_task_manager_tasks",
    planner: "hm_weekly_planner",
  };

  const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_LABELS = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const SLOT_ORDER = ["morning", "afternoon", "evening"];
  const SLOT_LABELS = {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
  };

  const elements = {
    openProjects: document.getElementById("dashboardOpenProjects"),
    taskManagerCount: document.getElementById("dashboardTaskManagerCount"),
    scheduledCount: document.getElementById("dashboardScheduledCount"),
    upcomingList: document.getElementById("dashboardUpcomingList"),
  };

  if (!elements.openProjects || !elements.taskManagerCount || !elements.scheduledCount || !elements.upcomingList) {
    return;
  }

  const controller = new AbortController();

  function safeParseArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function getWeekStartISO(dateValue) {
    const d = new Date(dateValue);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function safeParsePlanner() {
    const weekStart = getWeekStartISO(new Date());

    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.planner) || "null");
      if (!parsed || typeof parsed !== "object") {
        return {
          weekStart,
          days: {},
        };
      }

      if ((parsed.weekStart || "") !== weekStart) {
        return {
          weekStart,
          days: {},
        };
      }

      return parsed;
    } catch (error) {
      return {
        weekStart,
        days: {},
      };
    }
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

  function countScheduledTasks(planner) {
    return DAY_ORDER.reduce((count, day) => {
      const dayBucket = planner.days && planner.days[day] ? planner.days[day] : {};
      const dayTotal = SLOT_ORDER.reduce((slotTotal, slot) => {
        const slotItems = Array.isArray(dayBucket[slot]) ? dayBucket[slot] : [];
        return slotTotal + slotItems.length;
      }, 0);
      return count + dayTotal;
    }, 0);
  }

  function getUpcomingTasks(planner) {
    const all = [];

    DAY_ORDER.forEach((day) => {
      const dayBucket = planner.days && planner.days[day] ? planner.days[day] : {};

      SLOT_ORDER.forEach((slot) => {
        const slotItems = Array.isArray(dayBucket[slot]) ? dayBucket[slot] : [];
        slotItems.forEach((task, index) => {
          all.push({
            title: String((task && task.title) || "Untitled Task").trim() || "Untitled Task",
            day,
            dayIndex: DAY_ORDER.indexOf(day),
            slot,
            slotIndex: SLOT_ORDER.indexOf(slot),
            index,
          });
        });
      });
    });

    all.sort((a, b) => a.dayIndex - b.dayIndex || a.slotIndex - b.slotIndex || a.index - b.index);
    return all.slice(0, 5);
  }

  function renderUpcomingList(items) {
    if (!items.length) {
      elements.upcomingList.innerHTML = '<li class="dashboard-upcoming-empty">No upcoming tasks.</li>';
      return;
    }

    elements.upcomingList.innerHTML = items
      .map((item) => `
        <li class="dashboard-upcoming-item">
          <span>${item.title}</span>
          <span class="dashboard-upcoming-meta">${DAY_LABELS[item.day]} - ${SLOT_LABELS[item.slot]}</span>
        </li>
      `)
      .join("");
  }

  function attachEvents() {
    document.querySelectorAll(".dashboard-link-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.getAttribute("data-target") || "#dashboard";
        window.location.hash = target;
      }, { signal: controller.signal });
    });

    const teardownIfRouteChanges = () => {
      if (window.location.hash.replace("#", "") !== "dashboard") {
        controller.abort();
        window.removeEventListener("hashchange", teardownIfRouteChanges);
      }
    };

    window.addEventListener("hashchange", teardownIfRouteChanges);
  }

  async function loadDashboard() {
    await ensureProjectServicesLoaded();

    const projects = await window.loadAllProjects();
    const curatedTasks = safeParseArray(STORAGE_KEYS.curatedTasks);
    const planner = safeParsePlanner();

    const openProjects = (projects || []).filter((project) => {
      const state = String((project && project.state) || "").trim().toLowerCase();
      return state !== "completed";
    }).length;

    elements.openProjects.textContent = String(openProjects);
    elements.taskManagerCount.textContent = String(curatedTasks.length);
    elements.scheduledCount.textContent = String(countScheduledTasks(planner));
    renderUpcomingList(getUpcomingTasks(planner));
  }

  attachEvents();
  loadDashboard().catch((error) => {
    console.error(error);
    elements.upcomingList.innerHTML = '<li class="dashboard-upcoming-empty">No upcoming tasks.</li>';
  });
}

window.initDashboardScreen = initDashboardScreen;
