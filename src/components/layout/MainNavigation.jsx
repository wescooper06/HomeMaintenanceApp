import { Link } from "react-router-dom";

import styles from "./MainNavigation.module.css";
import { navigationLinks } from "./navigationRoutes.js";

export default function MainNavigation({ active }) {
  return (
    <nav className={styles["hm-nav"]} aria-label="Life Manager navigation">
      {navigationLinks.map(([route, label]) => (
        <Link key={route} id={`nav-${route}`}
          to={route === "meals" ? "/meals" : { pathname: "/", hash: `#${route}` }}
          className={route === active ? styles.active : undefined}
          aria-current={route === active ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
