export function tripPriority(trip) {
  const priority = Number(trip?.priority);
  return Number.isInteger(priority) && priority > 0 ? priority : null;
}

export function prioritizedTrips(trips) {
  return trips.filter((trip) => tripPriority(trip) !== null)
    .sort((first, second) => tripPriority(first) - tripPriority(second));
}