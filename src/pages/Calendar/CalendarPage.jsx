import "../../services/calendarService.js";
import styles from "./CalendarPage.module.css";
import CalendarProvider from "./components/CalendarContext.jsx";
import CalendarEventDialog from "./components/CalendarEventDialog.jsx";
import CalendarGrid from "./components/CalendarGrid.jsx";
import CalendarHeader from "./components/CalendarHeader.jsx";

export default function CalendarPage() {
  return (
    <CalendarProvider>
      <section
        className={styles["calendar-screen"]}
      >
        <CalendarHeader />
        <CalendarGrid />
        <CalendarEventDialog />
      </section>
    </CalendarProvider>
  );
}
