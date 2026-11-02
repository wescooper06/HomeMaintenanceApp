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
  const [mobilePanel, setMobilePanel] = useState(null);
  return (
    <DragDropLayer>
      <section className={`${styles.plannerScreen} hm-card`} aria-busy={snapshot.backupBusy || snapshot.reminderBusy || snapshot.restoreBusy}>
        <PlannerHeader />
        <div inert={snapshot.backupBusy || snapshot.backupReloadRequired || Boolean(snapshot.restoreProposal)}>
          <PlannerSidebar mobilePanel={mobilePanel} onMobilePanelChange={setMobilePanel} />
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
