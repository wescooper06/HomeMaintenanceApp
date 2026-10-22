import { createBrowserRouter, Navigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.jsx";
import DashboardPage from "../pages/Dashboard/DashboardPage.jsx";
import WorkbenchPage from "../pages/Workbench/WorkbenchPage.jsx";
import PlannerPage from "../pages/Planner/PlannerPage.jsx";
import CalendarPage from "../pages/Calendar/CalendarPage.jsx";
import DailyActivitiesPage from "../pages/DailyActivities/DailyActivitiesPage.jsx";
import TripsPage from "../pages/Trips/TripsPage.jsx";
import ActivityPlannerPage from "../pages/ActivityPlanner/ActivityPlannerPage.jsx";

export default createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/planner" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "workbench", element: <WorkbenchPage /> },
      { path: "planner", element: <PlannerPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "daily-activities", element: <DailyActivitiesPage /> },
      { path: "trips", element: <TripsPage /> },
      { path: "activity-planner", element: <ActivityPlannerPage /> },
    ],
  },
]);
