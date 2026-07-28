function initCalendarScreen() {
  const events = [
    { date: "Tue", title: "Pool filter inspection" },
    { date: "Fri", title: "Lawn irrigation test" },
    { date: "Sun", title: "Garage door lubrication" },
  ];

  const container = document.getElementById("calendarEvents");
  if (!container) return;

  container.innerHTML = events
    .map(
      (event) => `
        <article class="calendar-event">
          <div class="date">${event.date}</div>
          <strong>${event.title}</strong>
        </article>
      `
    )
    .join("");
}

window.initCalendarScreen = initCalendarScreen;
