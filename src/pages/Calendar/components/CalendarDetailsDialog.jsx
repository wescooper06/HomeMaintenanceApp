import { Fragment } from "react";

import { getCalendarEventDetails } from "../../../services/calendarService.js";
import styles from "../CalendarPage.module.css";

import useCalendarState from "./useCalendarState.js";

export default function CalendarDetailsDialog() {
  const { snapshot, actions, selectedEvent } = useCalendarState();
  const details = getCalendarEventDetails(selectedEvent);
  return (
    <div className={styles["weather-modal-card"]} role="dialog" aria-modal="true" aria-label="Calendar event details">
      <header className={styles["weather-modal-header"]}>
        <div>
          <h3 className={styles["weather-modal-title"]}>{details.title}</h3>
          <p className={styles["weather-modal-location"]}>Google Calendar</p>
        </div>
        <button type="button" className={styles["weather-modal-close"]} data-action="modal-close" aria-label="Close event modal" onClick={actions.closeDialog}>X</button>
      </header>
      <div className={styles["weather-modal-body"]}>
        <div className={styles["weather-modal-grid"]}>
          <div className={styles["weather-modal-item"]}><strong>Date:</strong> {details.date}</div>
          <div className={styles["weather-modal-item"]}><strong>Start:</strong> {details.start}</div>
          <div className={styles["weather-modal-item"]}><strong>End:</strong> {details.end}</div>
          <div className={styles["weather-modal-item"]}><strong>Location:</strong> {details.location}</div>
        </div>
        <div className={styles["weather-modal-item"]}><strong>Description:</strong><br />{details.description}</div>
        <div className={styles["weather-modal-item"]}><strong>Recurrence:</strong><br />{details.recurrence ? details.recurrence.split("\n").map((line, index) => <Fragment key={index}>{index ? <br /> : null}{line}</Fragment>) : "-"}</div>
        <div className={styles["weather-modal-item"]}><strong>Attendees:</strong><br />{details.attendees}</div>
        <label className={styles["weather-modal-item"]}>Google Calendar notification
          <select disabled={snapshot.isSavingEvent} value=""
            onChange={(event) => { if (event.target.value) void actions.setReminder(
              event.target.value === "off" ? null : Number(event.target.value)
            ); }}>
            <option value="">Choose a notification setting</option>
            <option value="0">At event start</option>
            <option value="10">10 minutes before</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
            <option value="off">Disable event notifications</option>
          </select>
        </label>
        <div className={styles["weather-modal-actions"]}>
          <button type="button" className={styles.primary} data-action="toggle-edit" data-event-id={snapshot.selectedEventId} data-date-key={snapshot.selectedEventDateKey} onClick={() => actions.openEvent(snapshot.selectedEventId, snapshot.selectedEventDateKey)}>Edit Event</button>
          <button type="button" className={styles.primary} data-action="add-to-planner" data-event-id={snapshot.selectedEventId} data-date-key={snapshot.selectedEventDateKey} disabled={snapshot.isSavingEvent} onClick={() => void actions.addToPlanner()}>Add to Planner</button>
          <button type="button" data-action="modal-close" onClick={actions.closeDialog}>Close</button>
        </div>
      </div>
    </div>
  );
}
