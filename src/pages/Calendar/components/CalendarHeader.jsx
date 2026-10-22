import styles from "../CalendarPage.module.css";
import useCalendarState from "./useCalendarState.js";

export default function CalendarHeader() {
  const { snapshot, actions } = useCalendarState();
  return (
    <header className={styles["calendar-header"]}>
      <div>
        <h1>Calendar</h1>
      </div>
      <div className={styles["calendar-controls"]} aria-label="Calendar month navigation">
        <span id="calendarStatus" className={styles["calendar-status"]} role="status" aria-live="polite">{snapshot.status}</span>
        <button id="calendar-add-event-btn" type="button" onClick={actions.openCreate}>+ Add Event</button>
        <button id="calendar-refresh-btn" type="button" onClick={() => void actions.refresh()}>{"\u27f3"} Refresh</button>
        <button id="calendarPrevMonth" type="button" aria-label="Previous month" onClick={() => void actions.navigate(-1)}>{"\u25c0"}</button>
        <button id="calendarToday" type="button" onClick={() => void actions.navigate("today")}>Today</button>
        <button id="calendarNextMonth" type="button" aria-label="Next month" onClick={() => void actions.navigate(1)}>{"\u25b6"}</button>
      </div>
    </header>
  );
}
