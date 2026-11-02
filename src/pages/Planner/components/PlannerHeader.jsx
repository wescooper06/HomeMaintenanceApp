import PageHeader from "../../../components/layout/PageHeader.jsx";
import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";

export default function PlannerHeader() {
  const { snapshot } = usePlanner();
  return (
    <PageHeader title="Weekly Planner" actions={
      <div className={styles["planner-header-actions"]}>
        <div id="plannerMode" className={styles["planner-status"]}>{snapshot.mode}</div>
        <div id="plannerStatus" className={styles["planner-status"]}>{snapshot.status}</div>
      </div>
    } />
  );
}
