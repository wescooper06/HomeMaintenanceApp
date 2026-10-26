import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { loadDashboard } from "../../services/dashboardService.js";

import styles from "./DashboardPage.module.css";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    loadDashboard().then((data) => {
      if (active) setSummary(data);
    }).catch((loadError) => {
      console.error("Dashboard loading failed", loadError);
      if (active) setError(loadError.message || "Unable to load dashboard.");
    });

    return () => {
      active = false;
    };
  }, []);

  function viewProjects() {
    navigate("/workbench");
  }

  function viewWeeklyPlanner() {
    navigate("/planner");
  }

  const upcomingTasks = summary?.upcomingTasks ?? [];

  return (
    <section className={styles.screen} aria-busy={!summary && !error}>
      <header className={styles.header}>
        <h1>Dashboard</h1>
        <p className={styles.muted}>Overview of projects, curated tasks, and weekly plan progress.</p>
      </header>

      {error && <p role="alert">{error}</p>}
      {!summary && !error && <p role="status">Loading dashboard...</p>}

      <section className={styles.grid} aria-label="Summary cards">
        <article className={styles.stat}>
          <p className={styles.statTitle}>Open Projects</p>
          <h2>{summary?.openProjects ?? "\u2014"}</h2>
          <button type="button" className={styles.linkButton} onClick={viewProjects}>View Projects</button>
        </article>

        <article className={styles.stat}>
          <p className={styles.statTitle}>Tasks in Task Manager</p>
          <h2>{summary?.taskManagerCount ?? "\u2014"}</h2>
        </article>

        <article className={styles.stat}>
          <p className={styles.statTitle}>Tasks Scheduled This Week</p>
          <h2>{summary?.scheduledCount ?? "\u2014"}</h2>
          <button type="button" className={styles.linkButton} onClick={viewWeeklyPlanner}>View Weekly Planner</button>
        </article>
      </section>

      <section className={styles.upcoming} aria-label="Upcoming tasks list">
        <h2>Upcoming Tasks</h2>
        <ul className={styles.upcomingList}>
          {upcomingTasks.map((item) => (
            <li key={`${item.day}-${item.slot}-${item.index}`} className={styles.upcomingItem}>
              <span>{item.title}</span>
              <span className={styles.upcomingMeta}>{item.dayLabel} - {item.slotLabel}</span>
            </li>
          ))}
          {summary && !upcomingTasks.length && (
            <li className={styles.upcomingEmpty}>No upcoming tasks.</li>
          )}
        </ul>
      </section>
    </section>
  );
}
