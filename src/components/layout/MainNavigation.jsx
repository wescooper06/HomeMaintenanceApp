import { Link } from "react-router-dom";
import styles from "./MainNavigation.module.css";

const links = [
  ["dashboard", "Dashboard"],
  ["workbench", "Workbench"],
  ["planner", "Planner"],
  ["calendar", "Calendar"],
  ["daily", "Daily Activities"],
  ["trips", "Trips"],
];

export default function MainNavigation({ active }) {
  return (
    <nav className={styles["hm-nav"]} aria-label="Life Manager navigation">
      <Link to={{ pathname: "/", hash: "#planner" }}>Life Manager</Link>
      {links.map(([route, label]) => (
        <Link key={route} id={`nav-${route}`}
          to={{ pathname: "/", hash: `#${route}` }}
          className={route === active ? styles.active : undefined}
          aria-current={route === active ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
