import { NavLink } from "react-router-dom";

export default function NavBar() {
  return (
    <nav
      aria-label="Main navigation"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        padding: "1rem",
        borderBottom: "1px solid #ccc",
      }}
    >
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/workbench">Workbench</NavLink>
      <NavLink to="/planner">Planner</NavLink>
      <NavLink to="/calendar">Calendar</NavLink>
      <NavLink to="/daily-activities">Daily Activities</NavLink>
      <NavLink to="/trips">Trips</NavLink>
      <NavLink to="/activity-planner">Activity Planner</NavLink>
    </nav>
  );
}
