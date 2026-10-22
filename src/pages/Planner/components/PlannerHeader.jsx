import styles from "../PlannerPage.module.css";
import { usePlanner } from "./usePlanner.js";

export default function PlannerHeader() {
  const { snapshot } = usePlanner();
  return (
    <header className={styles["planner-header"]}>
      <div>
        <h1>Weekly Planner</h1>
      </div>
      <div>
        <div id="plannerMode" className={styles["planner-status"]}>{snapshot.mode}</div>
        <div id="plannerStatus" className={styles["planner-status"]}>{snapshot.status}</div>
      </div>
    </header>
  );
}
