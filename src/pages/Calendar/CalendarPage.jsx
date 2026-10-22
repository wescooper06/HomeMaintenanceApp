import "../../services/calendarService.js";
import CalendarProvider from "./components/CalendarContext.jsx";
import CalendarHeader from "./components/CalendarHeader.jsx";
import CalendarGrid from "./components/CalendarGrid.jsx";
import CalendarEventDialog from "./components/CalendarEventDialog.jsx";
import styles from "./CalendarPage.module.css";

export default function CalendarPage() {
  return (
    <CalendarProvider>
      <section
        className={`${styles["calendar-screen"]} hm-card`}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "1rem",
          boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div data-main-nav />
        <CalendarHeader />
        <CalendarGrid />
        <CalendarEventDialog />
      </section>
    </CalendarProvider>
  );
}
