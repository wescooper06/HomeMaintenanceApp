import { useState } from "react";

import "../../services/plannerService.js";
import DragDropLayer from "./components/DragDropLayer.jsx";
import PlannerProvider from "./components/PlannerContext.jsx";
import PlannerFooter from "./components/PlannerFooter.jsx";
import PlannerHeader from "./components/PlannerHeader.jsx";
import PlannerSidebar from "./components/PlannerSidebar.jsx";
import { usePlanner } from "./components/usePlanner.js";
import WeeklyGrid from "./components/WeeklyGrid.jsx";
import styles from "./PlannerPage.module.css";

function PlannerScreen() {
  const { snapshot } = usePlanner();
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  return (
    <DragDropLayer>
      <section className={`${styles.plannerScreen} hm-card`} aria-busy={snapshot.backupBusy || snapshot.reminderBusy || snapshot.restoreBusy}>
        <PlannerHeader />
        <div inert={snapshot.backupBusy || snapshot.backupReloadRequired || Boolean(snapshot.restoreProposal)}>
          <div className={styles["planner-mobile-add"]}>
            <button type="button" aria-controls="planner-task-assignment-panels" aria-expanded={mobileAddOpen}
              onClick={() => setMobileAddOpen((open) => !open)}>
              {mobileAddOpen ? "Close Add options" : "+ Add"}
            </button>
          </div>
          <div id="planner-task-assignment-panels"
            className={`${styles["planner-mobile-panels"]} ${mobileAddOpen ? styles["is-mobile-open"] : ""}`}>
            <PlannerSidebar />
          </div>
          <WeeklyGrid />
          <PlannerFooter />
        </div>
      </section>
    </DragDropLayer>
  );
}

export default function PlannerPage() {
  return (
    <PlannerProvider>
      <PlannerScreen />
    </PlannerProvider>
  );
}
