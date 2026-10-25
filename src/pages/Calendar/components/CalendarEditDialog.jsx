import styles from "../CalendarPage.module.css";

import useCalendarDialogs from "./useCalendarDialogs.js";

export default function CalendarEditDialog() {
  const { values, field, saving, eventId, dateKey, close, submit, remove } = useCalendarDialogs("edit");
  return (
    <div className={styles["weather-modal-card"]} role="dialog" aria-modal="true" aria-label="Edit calendar event">
      <header className={styles["weather-modal-header"]}>
        <div>
          <h3 className={styles["weather-modal-title"]}>Edit Event</h3>
          <p className={styles["weather-modal-location"]}>Google Calendar</p>
        </div>
        <button type="button" className={styles["weather-modal-close"]} data-action="modal-close" aria-label="Close event modal" onClick={close}>X</button>
      </header>
      <div className={styles["weather-modal-body"]}>
        <div className={styles["weather-modal-form"]}>
          <div className={`${styles["weather-modal-field"]} ${styles["field-full"]}`}>
            <label htmlFor="eventEditTitle">Title</label>
            <input id="eventEditTitle" type="text" {...field("title")} />
          </div>
          <div className={styles["weather-modal-time-column"]}>
            <h4 className={styles["weather-modal-column-title"]}>Start Date</h4>
            <div className={styles["weather-modal-field"]}>
              <label htmlFor="eventEditStartDate">Date</label>
              <input id="eventEditStartDate" type="date" {...field("startDate")} />
            </div>
            <div className={styles["weather-modal-field"]}>
              <label htmlFor="eventEditStartDateStartTime">Start time</label>
              <input id="eventEditStartDateStartTime" type="time" {...field("startDateStartTime")} />
            </div>
            <div className={styles["weather-modal-field"]}>
              <label htmlFor="eventEditStartDateEndTime">End time</label>
              <input id="eventEditStartDateEndTime" type="time" {...field("startDateEndTime")} />
            </div>
          </div>
          <div className={styles["weather-modal-time-column"]}>
            <h4 className={styles["weather-modal-column-title"]}>End Date</h4>
            <div className={styles["weather-modal-field"]}>
              <label htmlFor="eventEditEndDate">Date</label>
              <input id="eventEditEndDate" type="date" {...field("endDate")} />
            </div>
            <div className={styles["weather-modal-field"]}>
              <label htmlFor="eventEditEndDateStartTime">Start time</label>
              <input id="eventEditEndDateStartTime" type="time" {...field("endDateStartTime")} disabled={values.disabled} aria-disabled={values.ariaDisabled} />
            </div>
            <div className={styles["weather-modal-field"]}>
              <label htmlFor="eventEditEndDateEndTime">End time</label>
              <input id="eventEditEndDateEndTime" type="time" {...field("endDateEndTime")} disabled={values.disabled} aria-disabled={values.ariaDisabled} />
            </div>
          </div>
          <div className={`${styles["weather-modal-field"]} ${styles["field-full"]}`}>
            <label htmlFor="eventEditLocation">Location</label>
            <input id="eventEditLocation" type="text" {...field("location")} />
          </div>
          <div className={`${styles["weather-modal-field"]} ${styles["field-full"]}`}>
            <label htmlFor="eventEditDescription">Description</label>
            <textarea id="eventEditDescription" {...field("description")} />
          </div>
        </div>
        <div className={styles["weather-modal-actions"]}>
          <button type="button" className={styles.primary} data-action="save-event" data-event-id={eventId} data-date-key={dateKey} disabled={saving} onClick={() => void submit()}>Save Changes</button>
          <button type="button" className={styles.danger} data-action="delete-event" data-event-id={eventId} data-date-key={dateKey} disabled={saving} onClick={() => void remove()}>Delete Event</button>
          <button type="button" data-action="cancel-edit" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
