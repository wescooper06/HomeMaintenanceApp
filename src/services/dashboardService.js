import { ensurePlannerAdapters } from "./plannerService.js";
import { plannerStorage } from "./plannerSupabaseStorage.js";

const DAY_LABELS = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const SLOT_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

function getWeekStartISO(dateValue) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function loadDashboard() {
  await ensurePlannerAdapters();
  const [projects, curatedTasks, planner] = await Promise.all([
    plannerStorage.getProjects(), plannerStorage.getTaskManager(), plannerStorage.getWeeklyPlanner(),
  ]);
  const weekStart = getWeekStartISO(new Date());
  const tasks = [];

  Object.entries(DAY_LABELS).forEach(([day, dayLabel], dayIndex) => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + dayIndex);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    Object.entries(SLOT_LABELS).forEach(([slot, slotLabel]) => {
      const items = planner.tasks.filter((task) => task.date === dateKey
        && task.timeSlot === slot && !task.deletedInstance);
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
