import styles from "../CalendarPage.module.css";
import useCalendarState from "./useCalendarState.js";
import CalendarEventList from "./CalendarEventList.jsx";
import { getCalendarLabels } from "../../../services/calendarService.js";

export function CalendarDay({ day }) {
  const { snapshot, actions } = useCalendarState();
  const { dateKey, dayNumber } = day;
  const classNames = [
    styles["calendar-day-cell"],
    day.outside ? styles["is-outside"] : "",
    day.today ? styles["is-today"] : "",
    snapshot.dropDateKey === dateKey ? styles["is-drop-target"] : "",
  ].filter(Boolean).join(" ");
  return (
    <article className={classNames} data-date-key={dateKey}
      onDragOver={(event) => {
        if (!snapshot.draggingEventId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        actions.setDropTarget(dateKey);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) actions.setDropTarget("");
      }}
      onDrop={(event) => {
        if (!snapshot.draggingEventId) return;
        event.preventDefault();
        void actions.drop(dateKey);
      }}
    >
      <div className={styles["calendar-day-number"]}>{dayNumber}</div>
      <CalendarEventList events={day.events} />
    </article>
  );
}

export default function CalendarGrid() {
  const { snapshot, days } = useCalendarState();
  const labels = getCalendarLabels(snapshot);
  return (
    <>
      <h2 id="calendarMonthLabel" className={styles["calendar-month-label"]}>{labels.month}</h2>
      <div id="calendarUpdatedAt" className={styles["calendar-updated-at"]}>{labels.updatedAt}</div>
      <div id="calendarEvents" className={styles["calendar-events"]}>
        {snapshot.loading ? <div className="hm-muted">Loading Google Calendar events...</div> : snapshot.loadError ? <div className="hm-muted">{snapshot.loadError}</div> : (
          <section className={styles["calendar-month-grid"]} aria-label="Monthly calendar">
            <div className={styles["calendar-weekday-row"]}>
              <div className={styles["calendar-weekday"]}>Sun</div>
              <div className={styles["calendar-weekday"]}>Mon</div>
              <div className={styles["calendar-weekday"]}>Tue</div>
              <div className={styles["calendar-weekday"]}>Wed</div>
              <div className={styles["calendar-weekday"]}>Thu</div>
              <div className={styles["calendar-weekday"]}>Fri</div>
              <div className={styles["calendar-weekday"]}>Sat</div>
            </div>
            <div className={styles["calendar-days-grid"]}>{days.map((day) => <CalendarDay key={day.dateKey} day={day} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}
