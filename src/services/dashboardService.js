// Reuse the legacy Sheets adapters until the shared project service is migrated.
import "../../www/js/services/sheets.service.js";
import "../../www/js/services/projects.service.js";

const DAY_LABELS = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const SLOT_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

function readStoredJson(key, fallback) {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Unable to read dashboard data from ${key}: ${error.message}`, { cause: error });
  }
}

function getWeekStartISO(dateValue) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

export async function loadDashboard() {
  const projects = await window.ProjectsService.loadAllProjects();
  const curatedTasks = readStoredJson("hm_task_manager_tasks", []);
  if (!Array.isArray(curatedTasks)) {
    throw new Error("Dashboard task manager data must be an array.");
  }

  const planner = readStoredJson("hm_weekly_planner", null);
  if (planner !== null && (typeof planner !== "object" || Array.isArray(planner))) {
    throw new Error("Dashboard weekly planner data must be an object.");
  }
  const days = planner?.weekStart === getWeekStartISO(new Date()) ? planner.days : {};
  const tasks = [];

  Object.entries(DAY_LABELS).forEach(([day, dayLabel]) => {
    Object.entries(SLOT_LABELS).forEach(([slot, slotLabel]) => {
      const items = days?.[day]?.[slot];
      if (!Array.isArray(items)) return;
      items.forEach((task, index) => {
        tasks.push({
          title: String(task?.title || "Untitled Task").trim() || "Untitled Task",
          day, dayLabel, slot, slotLabel, index,
        });
      });
    });
  });

  return {
    openProjects: (projects || []).filter((project) =>
      String(project?.state || "").trim().toLowerCase() !== "completed"
    ).length,
    taskManagerCount: curatedTasks.length,
    scheduledCount: tasks.length,
    upcomingTasks: tasks.slice(0, 5),
  };
}
