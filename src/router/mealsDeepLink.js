export function restoreMealsDeepLink(location, history) {
  const url = new URL(location.href);
  const destinations = url.searchParams.getAll("__meals");
  if (destinations.length === 0) return;
  const entry = url.pathname.match(/^(.*\/www\/trips)\/index\.html$/);
  if (!entry || destinations.length !== 1) throw new Error("Invalid Meals deep-link entry.");
  const destination = destinations[0];
  if (!/^\/meals(?:[/?#]|$)/.test(destination)
    || [...destination].some((character) => character === "\\" || character.charCodeAt(0) <= 32)) {
    throw new Error("Invalid Meals deep-link destination.");
  }
  const restored = new URL(`${entry[1]}${destination}`, url.origin);
  const modulePath = restored.pathname.slice(entry[1].length);
  if (restored.origin !== url.origin || !restored.pathname.startsWith(`${entry[1]}/`)
    || !/^\/meals(?:\/|$)/.test(modulePath)) {
    throw new Error("Meals deep link escaped its application base.");
  }
  history.replaceState(null, "", `${restored.pathname}${restored.search}${restored.hash}`);
}
