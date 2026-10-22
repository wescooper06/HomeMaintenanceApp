import "../../services/plannerService.js";
import PlannerProvider from "./components/PlannerContext.jsx";
import PlannerHeader from "./components/PlannerHeader.jsx";
import PlannerSidebar from "./components/PlannerSidebar.jsx";
import WeeklyGrid from "./components/WeeklyGrid.jsx";
import PlannerFooter from "./components/PlannerFooter.jsx";
import DragDropLayer from "./components/DragDropLayer.jsx";
import styles from "./PlannerPage.module.css";

export default function PlannerPage() {
  return (
    <PlannerProvider>
      <DragDropLayer>
        <section className={`${styles["planner-screen"]} ${styles["hm-card"]}`}>
          <div data-main-nav />
          <PlannerHeader />
          <PlannerSidebar />
          <WeeklyGrid />
          <PlannerFooter />
        </section>
      </DragDropLayer>
    </PlannerProvider>
  );
}
