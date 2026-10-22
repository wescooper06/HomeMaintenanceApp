import { CalendarWidget } from "./CalendarWidget.js";

export function PlannerMoveTaskModal({ task, onClose, onSelectDate }) {
  const previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "planner-move-overlay";
  overlay.innerHTML = `
    <section class="planner-move-modal" role="dialog" aria-modal="true" aria-labelledby="planner-move-title" aria-describedby="planner-move-task-title" tabindex="-1">
      <header class="planner-move-header">
        <h2 id="planner-move-title">Move Task</h2>
        <button type="button" class="planner-move-close" aria-label="Close" title="Close">&#215;</button>
      </header>
      <p id="planner-move-task-title"></p>
    </section>
  `;
  const modal = overlay.querySelector(".planner-move-modal");
  modal.querySelector("p").textContent = task.title || "Untitled Task";
  const [year, month, day] = task.date.split("-").map(Number);
  const initialDate = new Date(year, month - 1, day);
  let closed = false;

  function close() {
    if (closed) {
      return;
    }
    closed = true;
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    if (previousFocus && previousFocus.isConnected) {
      previousFocus.focus();
    }
    onClose();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
    if (event.key === "Tab") {
      const buttons = [...modal.querySelectorAll("button")];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  modal.appendChild(CalendarWidget({
    initialDate: Number.isNaN(initialDate.getTime()) ? new Date() : initialDate,
    onSelectDate(date) {
      onSelectDate(date);
      close();
    },
  }));
  overlay.querySelector(".planner-move-close").addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      close();
    }
  });
  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlay);
  modal.querySelector(".is-selected, .planner-move-calendar-day").focus();
  return close;
}