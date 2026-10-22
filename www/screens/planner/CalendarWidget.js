export function CalendarWidget({ initialDate = new Date(), onSelectDate }) {
  const selectedDate = new Date(initialDate.getTime());
  const month = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const today = new Date();
  const root = document.createElement("div");
  root.className = "planner-move-calendar";

  function sameDay(first, second) {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }

  function render() {
    root.innerHTML = `
      <div class="planner-move-calendar-nav">
        <button type="button" data-month-offset="-1" aria-label="Previous month" title="Previous month">&#8249;</button>
        <h3 aria-live="polite"></h3>
        <button type="button" data-month-offset="1" aria-label="Next month" title="Next month">&#8250;</button>
      </div>
      <div class="planner-move-calendar-weekdays" aria-hidden="true">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<span>${day}</span>`).join("")}
      </div>
      <div class="planner-move-calendar-grid" role="group" aria-label="Choose a date"></div>
    `;
    root.querySelector("h3").textContent = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const grid = root.querySelector(".planner-move-calendar-grid");
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let blank = 0; blank < month.getDay(); blank += 1) {
      grid.appendChild(document.createElement("span"));
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "planner-move-calendar-day";
      button.textContent = String(day);
      button.setAttribute("aria-label", date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
      button.setAttribute("aria-pressed", String(sameDay(date, selectedDate)));
      if (sameDay(date, today)) {
        button.classList.add("is-today");
        button.setAttribute("aria-current", "date");
      }
      if (sameDay(date, selectedDate)) {
        button.classList.add("is-selected");
      }
      button.addEventListener("click", () => onSelectDate(new Date(date.getTime())));
      grid.appendChild(button);
    }
    root.querySelectorAll("[data-month-offset]").forEach(button => {
      button.addEventListener("click", () => {
        const offset = button.dataset.monthOffset;
        month.setMonth(month.getMonth() + Number(offset));
        render();
        root.querySelector(`[data-month-offset="${offset}"]`).focus();
      });
    });
  }

  render();
  return root;
}