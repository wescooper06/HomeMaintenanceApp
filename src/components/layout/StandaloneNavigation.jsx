import styles from "./MainNavigation.module.css";
import { navigationLinks, standaloneNavigationHref } from "./navigationRoutes.js";

export default function StandaloneNavigation() {
  return (
    <nav className={styles["hm-nav"]} aria-label="Life Manager navigation">
      {navigationLinks.map(([route, label]) => (
        <a key={route} href={standaloneNavigationHref(route, window.location)}
          className={route === "daily" ? styles.active : undefined}
          aria-current={route === "daily" ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
