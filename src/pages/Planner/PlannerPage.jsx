import "../../services/plannerService.js";
import DragDropLayer from "./components/DragDropLayer.jsx";
import PlannerProvider from "./components/PlannerContext.jsx";
import PlannerFooter from "./components/PlannerFooter.jsx";
import PlannerHeader from "./components/PlannerHeader.jsx";
import PlannerSidebar from "./components/PlannerSidebar.jsx";
import { usePlanner } from "./components/usePlanner.js";
import WeeklyGrid from "./components/WeeklyGrid.jsx";
import styles from "./PlannerPage.module.css";

function PlannerScreen({ navigation }) {
  const { snapshot } = usePlanner();
  return (
    <DragDropLayer>
      <section className={`${styles["planner-screen"]} ${styles["hm-card"]}`} aria-busy={snapshot.backupBusy || snapshot.reminderBusy}>
        <div data-main-nav>{navigation}</div>
        <PlannerHeader />
        <div inert={snapshot.backupBusy || snapshot.backupReloadRequired}>
          <PlannerSidebar />
          <WeeklyGrid />
          <PlannerFooter />
        </div>
      </section>
    </DragDropLayer>
  );
}

export default function PlannerPage({ navigation = null }) {
  return (
    <PlannerProvider>
      <PlannerScreen navigation={navigation} />
    </PlannerProvider>
  );
}
