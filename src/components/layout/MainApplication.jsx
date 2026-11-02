import { lazy, Suspense } from "react";

import MainNavigation from "./MainNavigation.jsx";
import styles from "./MainNavigation.module.css";

const pages = {
  planner: lazy(() => import("../../pages/Planner/PlannerPage.jsx")),
  workbench: lazy(() => import("../../pages/Workbench/WorkbenchPage.jsx")),
  dashboard: lazy(() => import("../../pages/Dashboard/DashboardPage.jsx")),
  calendar: lazy(() => import("../../pages/Calendar/CalendarPage.jsx")),
  daily: lazy(() => import("../../pages/DailyActivities/DailyActivitiesPage.jsx")),
  meals: lazy(() => import("../../pages/Meals/MealsPage.jsx")),
};

export default function MainApplication({ route }) {
  const Page = pages[route];
  return (
    <>
      <div className={styles.frame}>
        <MainNavigation active={route} />
      </div>
      <Suspense fallback={<p role="status">Loading {route}...</p>}>
        <Page />
      </Suspense>
    </>
  );
}
