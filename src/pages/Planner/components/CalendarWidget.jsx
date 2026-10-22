import { useState } from "react";
import { addMonthsToDateKey, formatMonthYearLabel, getCalendarMonth, getMoveCalendar, getMoveTaskInitialDate, toMonthStartDateKey } from "../../../services/plannerService.js";
import { usePlanner } from "./usePlanner.js";
import styles from "../PlannerPage.module.css";

export default function CalendarWidget({ initialDate, onSelectDate }) {
  const selected = getMoveTaskInitialDate(initialDate);
  const [month, setMonth] = useState(() => toMonthStartDateKey(selected));
  const calendar = getMoveCalendar(month, selected);
  return (
    <div className={styles["planner-move-calendar"]}>
      <div className={styles["planner-move-calendar-nav"]}>
        <button type="button" data-month-offset="-1" aria-label="Previous month" title="Previous month" onClick={() => setMonth(addMonthsToDateKey(month, -1))}>{"\u2039"}</button>
        <h3 aria-live="polite">{formatMonthYearLabel(month)}</h3>
        <button type="button" data-month-offset="1" aria-label="Next month" title="Next month" onClick={() => setMonth(addMonthsToDateKey(month, 1))}>{"\u203a"}</button>
      </div>
      <div className={styles["planner-move-calendar-weekdays"]} aria-hidden="true">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>
      <div className={styles["planner-move-calendar-grid"]} role="group" aria-label="Choose a date">
        {calendar.blanks.map((index) => <span key={`blank-${index}`} />)}
        {calendar.days.map((day) => (
          <button key={day.date} type="button" className={`${styles["planner-move-calendar-day"]} ${day.today ? styles["is-today"] : ""} ${day.selected ? styles["is-selected"] : ""}`}
            aria-label={day.label} aria-pressed={String(day.selected)} aria-current={day.today ? "date" : undefined} onClick={() => onSelectDate(day.date)}>
            {day.day}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MiniCalendar() {
  const { snapshot, actions } = usePlanner();
  if (!snapshot.calendarMonthDate) return null;
  const calendar = getCalendarMonth(snapshot.calendarMonthDate, snapshot.selectedCalendarDate, snapshot.planner.weekStartDate);
  return (
    <div className={styles["mini-calendar-shell"]}>
      <div className={styles["mini-calendar-nav"]}>
        <button type="button" data-action="mini-calendar-prev-month" aria-label="Previous month" onClick={() => actions.changeMonth(-1)}>{"\u25c0"}</button>
        <div className={styles["mini-calendar-month-label"]}>{formatMonthYearLabel(snapshot.calendarMonthDate)}</div>
        <button type="button" data-action="mini-calendar-next-month" aria-label="Next month" onClick={() => actions.changeMonth(1)}>{"\u25b6"}</button>
      </div>
      <div className={styles["mini-calendar-weekdays"]}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <div key={day} className={styles["mini-calendar-weekday"]}>{day}</div>)}
      </div>
      <div className={styles["mini-calendar-grid"]}>
        {calendar.map((day) => (
          <button key={day.date} type="button" data-action="mini-calendar-date" data-date={day.date} aria-label={day.label}
            className={`${styles["mini-calendar-day"]} ${day.outside ? styles["is-outside-month"] : ""} ${day.visible ? styles["is-in-visible-week"] : ""} ${day.today ? styles["is-today"] : ""} ${day.selected ? styles["is-selected"] : ""}`}
            onClick={() => actions.jumpPlannerToDate(day.date, day.date)}>{day.day}</button>
        ))}
      </div>
    </div>
  );
}
