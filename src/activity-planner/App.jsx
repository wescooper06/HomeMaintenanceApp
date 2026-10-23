import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DailyActivityPlanner from "../pages/ActivityPlanner/DailyActivityPlanner.jsx";
import { connectGoogleSheets, hasSheetsAccess } from "../services/googleSheetsClient.js";
import styles from "../pages/ActivityPlanner/DailyActivityPlanner.module.css";

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
  const [connected, setConnected] = useState(hasSheetsAccess);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      await connectGoogleSheets();
      setConnected(true);
    } catch (connectError) {
      setError(connectError.message);
    } finally {
      setConnecting(false);
    }
  }

  if (!connected) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Daily Activity Planner</h1>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div>
          <button className={styles.refreshButton} type="button" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting..." : "Connect Google Sheets"}
          </button>
        </div>
      </main>
    );
  }

  return children || <DailyActivityPlanner />;
}