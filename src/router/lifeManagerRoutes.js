const aliases = {
  planner: "planner",
  workbench: "workbench",
  dashboard: "dashboard",
  calendar: "calendar",
  daily: "daily",
  "daily-activities": "daily",
  activities: "daily",
  "activity-planner": "daily",
  trips: "trips",
};

export function resolveLifeManagerRoute({ pathname, hash }) {
  const hashRoute = hash.replace(/^#\/?/, "");
  const pathRoute = pathname.replace(/^\/|\/$/g, "");
  if (Object.hasOwn(aliases, hashRoute)) return aliases[hashRoute];
  if (Object.hasOwn(aliases, pathRoute)) return aliases[pathRoute];
  return "trips";
}
