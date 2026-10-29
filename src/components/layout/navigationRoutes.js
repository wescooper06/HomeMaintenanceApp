export const navigationLinks = [
  ["dashboard", "Dashboard"],
  ["workbench", "Workbench"],
  ["planner", "Planner"],
  ["calendar", "Calendar"],
  ["daily", "Daily Activities"],
  ["meals", "Meals"],
  ["trips", "Trips"],
];

export function standaloneNavigationHref(route, location) {
  if (route === "daily") return "#daily";
  if (route === "meals") {
    if (["5173", "5174"].includes(location.port)) {
      return `${location.protocol}//${location.hostname}:5173/meals`;
    }
    const root = location.pathname.match(/^(.*\/)activity-planner(?:\/|$)/)?.[1] || "/";
    return `${root}trips/meals`;
  }
  if (["5173", "5174"].includes(location.port)) {
    return `${location.protocol}//${location.hostname}:5173/#${route}`;
  }
  const root = location.pathname.match(/^(.*\/)activity-planner(?:\/|$)/)?.[1] || "/";
  return `${root}index.html#${route}`;
}
