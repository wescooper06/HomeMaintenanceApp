import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { selectWeeklyView } from "../../../services/plannerService.js";
import { MealPlannerProvider, MealRow } from "../../Meals/MealRows.jsx";
import styles from "../PlannerPage.module.css";

import { WeeklyTaskCard } from "./ProjectCard.jsx";
import { usePlanner } from "./usePlanner.js";
import usePlannerDrag from "./usePlannerDrag.js";

export default function WeeklyGrid() {
  const { snapshot, actions } = usePlanner();
  const view = selectWeeklyView(snapshot);
  const { search } = useLocation();
  const requestedDate = new URLSearchParams(search).get("mealDate");
  const [selectedDayIndex, setSelectedDayIndex] = useState(null);
  const requestedIndex = view.days.findIndex((day) => day.date === requestedDate);
  const todayIndex = view.days.findIndex((day) => day.today);
  const activeDayIndex = selectedDayIndex ?? (requestedIndex >= 0 ? requestedIndex : Math.max(todayIndex, 0));
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
      setSelectedDayIndex(activeDayIndex);
      actions.shiftPlannerWeek(delta > 0 ? 7 : -7);
      timer = setTimeout(() => { locked = false; }, 220);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { element.removeEventListener("wheel", wheel); clearTimeout(timer); };
  }, [actions, activeDayIndex]);
  useEffect(() => { scroll.current.scrollLeft = 0; }, [snapshot.gridRevision, snapshot.planner.weekStartDate]);
  return (
    <section className={styles["planner-week"]} aria-label="Weekly planner grid">
      <div className={styles["weekly-week-nav"]} aria-label="Weekly navigation">
        <button type="button" id="week-prev" aria-label="Previous week" onClick={() => {
          setSelectedDayIndex(activeDayIndex);
          actions.shiftPlannerWeek(-7);
        }}>{"\u25c0"}</button>
        <h2 id="weekly-week-label">{view.label}</h2>
        <button type="button" id="week-today" className={styles["weekly-week-today"]} aria-label="Go to current week" onClick={() => {
          setSelectedDayIndex((new Date().getDay() + 6) % 7);
          actions.goToCurrentWeek();
        }}>Today</button>
        <button type="button" id="week-next" aria-label="Next week" onClick={() => {
          setSelectedDayIndex(activeDayIndex);
          actions.shiftPlannerWeek(7);
        }}>{"\u25b6"}</button>
      </div>
      <MealPlannerProvider week={snapshot.planner.weekStartDate}>
        <div id="weekly-scroll-container" ref={scroll}>
          <div className={styles["weekly-day-strip"]} role="group" aria-label="Choose a day">
            {view.days.map((day, index) => <button key={day.date} type="button"
              className={activeDayIndex === index ? styles["is-selected"] : ""}
              aria-label={`Show ${day.heading}`} aria-pressed={activeDayIndex === index}
              aria-current={day.today ? "date" : undefined} onClick={() => setSelectedDayIndex(index)}>
              <span>{day.label}</span><span>{Number(day.date.slice(-2))}</span>
            </button>)}
          </div>
          <div className={styles["weekly-week-block"]}>
            <div id="plannerWeekGrid" className={`${styles["planner-week-grid"]} ${styles["weekly-week-grid"]}`} aria-live="polite">
              {view.days.map((day, index) => <WeeklyDay key={day.date} day={day} mobileSelected={activeDayIndex === index} />)}
            </div>
          </div>
        </div>
      </MealPlannerProvider>
    </section>
  );
}

export function WeeklyDay({ day, mobileSelected }) {
  const { actions } = usePlanner();
  return (
    <article className={`${styles["weekly-day-column"]} ${mobileSelected ? styles["is-mobile-selected"] : ""}`} data-day={day.key} data-date={day.date}>
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
        try {
          const result = actions.dropOnSlot(drag.drag, day, date, slot);
          if (result?.catch) void result.catch((error) => console.warn("Planner drop failed", error));
        }
        finally { drag.end(); }
      }}>
      <h4 className={styles["day-slot-label"]}>{label}</h4>
      <MealRow date={date} slot={slot} />
      <section className={styles["slot-task-region"]} aria-label={`${label} tasks`}>
        <div className={styles["slot-task-list"]}>
          {tasks.length ? tasks.map((task) => <div key={task.id}
            className={`${styles["weekly-insertion-target"]} ${drag.dropTarget === `${target}:before:${task.id}` ? styles["insert-before"] : ""} ${drag.dropTarget === `${target}:after:${task.id}` ? styles["insert-after"] : ""}`}
            onDragOver={(event) => {
              if (drag.drag?.kind !== "weekly-move") return;
              const rect = event.currentTarget.getBoundingClientRect();
              const side = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
              drag.target(event, `${target}:${side}:${task.id}`);
            }} onDrop={(event) => {
              if (drag.drag?.kind !== "weekly-move") return;
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              const side = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
              try { actions.dropOnSlot(drag.drag, day, date, slot, { targetId: task.id, side }); }
              finally { drag.end(); }
            }}>
            <WeeklyTaskCard task={task} day={day} slot={slot} />
          </div>)
            : <div className={styles["slot-empty"]}>No tasks assigned</div>}
          {drag.drag?.kind === "weekly-move" && <div
            className={`${styles["weekly-end-target"]} ${drag.dropTarget === target ? styles["insert-before"] : ""}`}
            aria-hidden="true">Drop at end</div>}
        </div>
      </section>
    </section>
  );
}
