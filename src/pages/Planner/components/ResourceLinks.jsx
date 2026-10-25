import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";

export default function ResourceLinks() {
  const { snapshot, actions } = usePlanner();
  const modal = snapshot.modal;
  return (
    <div className={styles["weather-modal-card"]} role="dialog" aria-modal="true" aria-label="Resource Links">
      <header className={styles["weather-modal-header"]}>
        <div>
          <h3 className={styles["weather-modal-title"]}>Resource Links</h3>
          <p className={styles["weather-modal-location"]}>{modal.title || "Project"}</p>
        </div>
        <button type="button" className={styles["weather-modal-close"]} data-action="links-close" aria-label="Close resource links modal" onClick={actions.closeWeather}>X</button>
      </header>
      <div className={styles["weather-modal-body"]}>
        {modal.loading ? <div className={styles["weather-modal-item"]}>Loading links...</div>
          : modal.entries.map((entry, index) => <div key={`${entry.url}:${index}`} className={styles["weather-modal-item"]}><a href={entry.url} target="_blank" rel="noopener noreferrer">{entry.title || entry.url}</a></div>)}
        <div className={styles["weather-modal-actions"]}>
          <button type="button" data-action="links-close" onClick={actions.closeWeather}>Close</button>
        </div>
      </div>
    </div>
  );
}
