import { Navigate, Route, Routes } from "react-router-dom";

import DailyActivityPlanner from "../pages/ActivityPlanner/DailyActivityPlanner.jsx";

export default function App() {
  return (
    <DailyActivitiesApplication>
      <Routes>
        <Route path="/activity-planner" element={<DailyActivityPlanner />} />
        <Route path="/" element={<Navigate to="/activity-planner" replace />} />
        <Route path="/activity-planner/index.html" element={<Navigate to="/activity-planner" replace />} />
      </Routes>
    </DailyActivitiesApplication>
  );
}

export function DailyActivitiesApplication({ children }) {
  return children || <DailyActivityPlanner />;
}