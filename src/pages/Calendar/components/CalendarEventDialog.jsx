import styles from "../CalendarPage.module.css";
import useCalendarState from "./useCalendarState.js";
import CalendarCreateDialog from "./CalendarCreateDialog.jsx";
import CalendarEditDialog from "./CalendarEditDialog.jsx";
import CalendarDetailsDialog from "./CalendarDetailsDialog.jsx";

export default function CalendarEventDialog() {
  const { snapshot, actions, selectedEvent } = useCalendarState();
  const mode = snapshot.modalMode;
  return (
    <div id="calendar-modal" className={styles["weather-modal-host"]} hidden={!mode}
      onClick={(event) => { if (event.target === event.currentTarget) actions.closeDialog(); }}
      onKeyDown={(event) => { if (event.key === "Escape") actions.closeDialog(); }}
    >
      {mode === "create" ? <CalendarCreateDialog key={snapshot.dialogVersion} /> : null}
      {mode === "edit" && selectedEvent ? <CalendarEditDialog key={snapshot.dialogVersion} /> : null}
      {mode === "details" && selectedEvent ? <CalendarDetailsDialog /> : null}
    </div>
  );
}
