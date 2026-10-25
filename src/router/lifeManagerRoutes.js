const aliases = {
  planner: "planner",
  parking: "planner",
  workbench: "workbench",
  dashboard: "dashboard",
  calendar: "calendar",
  daily: "daily",
  trips: "trips",
};

export function lifeManagerBasename(pathname) {
  const match = pathname.match(/^(.*\/trips)(?:\/|$)/);
  return match ? match[1] : "/";
}

export function resolveLifeManagerRoute({ pathname, hash }) {
  const hashRoute = hash.replace(/^#\/?/, "");
  const pathRoute = pathname.replace(/^\/|\/$/g, "");
  if (pathRoute === "projects/new") return "project-create";
  if (Object.hasOwn(aliases, hashRoute)) return aliases[hashRoute];
  if (Object.hasOwn(aliases, pathRoute)) return aliases[pathRoute];
  return "trips";
}
