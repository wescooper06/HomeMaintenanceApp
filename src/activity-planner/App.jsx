import { Route, Routes } from "react-router-dom";

import DailyActivityPlanner from "../pages/ActivityPlanner/DailyActivityPlanner.jsx";

export default function App() {
  return (
    <DailyActivitiesApplication>
      <Routes>
        <Route path="/" element={<DailyActivityPlanner />} />
        <Route path="/index.html" element={<DailyActivityPlanner />} />
      </Routes>
    </DailyActivitiesApplication>
  );
}

export function DailyActivitiesApplication({ children }) {
  return children || <DailyActivityPlanner />;
}