import { lazy, Suspense } from "react";

import MainNavigation from "./MainNavigation.jsx";

const pages = {
  planner: lazy(() => import("../../pages/Planner/PlannerPage.jsx")),
  workbench: lazy(() => import("../../pages/Workbench/WorkbenchPage.jsx")),
  dashboard: lazy(() => import("../../pages/Dashboard/DashboardPage.jsx")),
  calendar: lazy(() => import("../../pages/Calendar/CalendarPage.jsx")),
  daily: lazy(() => import("../../pages/DailyActivities/DailyActivitiesPage.jsx")),
};

export default function MainApplication({ route }) {
  const Page = pages[route];
  const navigation = <MainNavigation active={route} />;
  return (
    <Suspense fallback={<p role="status">Loading {route}...</p>}>
      {route === "planner" ? <Page navigation={navigation} /> : (
        <>
          {navigation}
          <Page />
        </>
      )}
    </Suspense>
  );
}
