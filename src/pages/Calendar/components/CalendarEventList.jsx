import styles from "../CalendarPage.module.css";
import useCalendarState from "./useCalendarState.js";

export function CalendarPlannerIndicator() {
  return (
    <span className={styles["calendar-planner-indicator"]} aria-label="In Planner" title="Added to Planner">P</span>
  );
}

export function CalendarEventTime({ children }) {
  return <span className={styles["calendar-event-chip-time"]}>{children}</span>;
}

export function CalendarEventDescription({ children }) {
  return <span className={styles["calendar-event-chip-description"]}>{children}</span>;
}

export function CalendarEventItem({ event }) {
  const { snapshot, actions } = useCalendarState();
  const { eventId, dateKey, title, time, description, inPlanner } = event;
  const dragging = snapshot.draggingEventId === eventId && snapshot.draggingEventDateKey === dateKey;
  return (
    <div className={`${styles["calendar-event-item"]}${dragging ? ` ${styles["is-dragging"]}` : ""}`} draggable="true" data-action="drag-event" data-event-id={eventId} data-date-key={dateKey}
      onDragStart={(dragEvent) => {
        actions.startDrag(eventId, dateKey);
        if (dragEvent.dataTransfer && eventId) {
          dragEvent.dataTransfer.setData("text/plain", eventId);
          dragEvent.dataTransfer.effectAllowed = "move";
        }
      }}
      onDragEnd={actions.endDrag}
    >
      <div className={styles["calendar-event-card"]} data-event-id={eventId} title={title}>
        {inPlanner ? <CalendarPlannerIndicator /> : null}
        <button type="button" className={styles["calendar-event-open"]} data-action="open-event" data-event-id={eventId} data-date-key={dateKey} aria-label={`Open event ${title}`}
          onClick={() => actions.openEvent(eventId, dateKey)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
            keyEvent.preventDefault();
            actions.openEvent(eventId, dateKey);
          }}
        >
          <span className={styles["calendar-event-chip"]}>
            {time ? <CalendarEventTime>{time}</CalendarEventTime> : null}
            <span>{title}</span>
            {description ? <CalendarEventDescription>{description}</CalendarEventDescription> : null}
          </span>
        </button>
        <div className={styles["calendar-event-actions"]}>
          <button type="button" className={styles["calendar-edit-pill"]} data-action="toggle-edit" data-event-id={eventId} data-date-key={dateKey} onClick={() => actions.openEvent(eventId, dateKey)}>Edit</button>
          <button type="button" className={styles["calendar-add-planner"]} data-action="add-to-planner" data-event-id={eventId} data-date-key={dateKey} onClick={() => void actions.addToPlanner(eventId, dateKey)}>Add to Planner</button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarEventList({ events }) {
  return <div className={styles["calendar-day-events"]}>{events.map((event, index) => <CalendarEventItem key={`${event.eventId}|${event.dateKey}|${index}`} event={event} />)}</div>;
}
