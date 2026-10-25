import { useEffect, useRef } from "react";

import { selectWeeklyView } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import { WeeklyTaskCard } from "./ProjectCard.jsx";
import { usePlanner } from "./usePlanner.js";
import usePlannerDrag from "./usePlannerDrag.js";

export default function WeeklyGrid() {
  const { snapshot, actions } = usePlanner();
  const view = selectWeeklyView(snapshot);
  const scroll = useRef(null);
  useEffect(() => {
    const element = scroll.current;
    element.scrollLeft = 0;
    let locked = false;
    let timer;
    const wheel = (event) => {
      const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (Math.abs(delta) < 16 || locked) return;
      event.preventDefault();
      locked = true;
      actions.shiftPlannerWeek(delta > 0 ? 7 : -7);
      timer = setTimeout(() => { locked = false; }, 220);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { element.removeEventListener("wheel", wheel); clearTimeout(timer); };
  }, [actions]);
  useEffect(() => { scroll.current.scrollLeft = 0; }, [snapshot.gridRevision, snapshot.planner.weekStartDate]);
  return (
    <section className={styles["planner-week"]} aria-label="Weekly planner grid">
      <div className={styles["weekly-week-nav"]} aria-label="Weekly navigation">
        <button type="button" id="week-prev" aria-label="Previous week" onClick={() => actions.shiftPlannerWeek(-7)}>{"\u25c0"}</button>
        <h2 id="weekly-week-label">{view.label}</h2>
        <button type="button" id="week-today" className={styles["weekly-week-today"]} aria-label="Go to current week" onClick={actions.goToCurrentWeek}>Today</button>
        <button type="button" id="week-next" aria-label="Next week" onClick={() => actions.shiftPlannerWeek(7)}>{"\u25b6"}</button>
      </div>
      <div id="weekly-scroll-container" ref={scroll}>
        <div className={styles["weekly-week-block"]}>
          <div id="plannerWeekGrid" className={`${styles["planner-week-grid"]} ${styles["weekly-week-grid"]}`} aria-live="polite">
            {view.days.map((day) => <WeeklyDay key={day.date} day={day} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

export function WeeklyDay({ day }) {
  const { actions } = usePlanner();
  return (
    <article className={styles["weekly-day-column"]} data-day={day.key} data-date={day.date}>
      <h3 className={`${styles["weekly-day-label"]} ${day.today ? styles["is-today"] : ""}`}>
        <span className={styles["weekly-day-label-text"]}>{day.heading}</span>
        <button type="button" className={styles["weekly-weather-icon"]} data-action="weather-open" data-date={day.date} title={day.weather.condition}
          aria-label={`Open weather for ${day.heading}: ${day.weather.condition}`} onClick={() => actions.openWeather(day.date)}>{day.weather.icon}</button>
      </h3>
      {day.slots.map((slot) => <DaySlot key={slot.slot} day={day.key} date={day.date} {...slot} />)}
    </article>
  );
}

export function DaySlot({ day, date, slot, label, tasks }) {
  const { actions } = usePlanner();
  const drag = usePlannerDrag();
  const target = `slot:${date}:${slot}`;
  return (
    <section className={`${styles["day-slot"]} ${drag.dropTarget === target ? styles["is-drop-target"] : ""}`} data-day={day} data-date={date} data-slot={slot}
      onDragOver={(event) => {
        if (drag.drag && drag.drag.kind !== "checklist-reorder") drag.target(event, target, ["repeatable-copy", "parking-item"].includes(drag.drag.kind) ? "copy" : "move");
      }} onDragLeave={drag.leave} onDrop={(event) => {
        if (!drag.drag || drag.drag.kind === "checklist-reorder") return;
        event.preventDefault();
        event.stopPropagation();
        try { actions.dropOnSlot(drag.drag, day, date, slot); }
        finally { drag.end(); }
      }}>
      <h4 className={styles["day-slot-label"]}>{label}</h4>
      <div className={styles["slot-task-list"]}>
        {tasks.length ? tasks.map((task) => <WeeklyTaskCard key={task.id} task={task} day={day} slot={slot} />)
          : <div className={styles["slot-empty"]}>No tasks assigned</div>}
      </div>
    </section>
  );
}
