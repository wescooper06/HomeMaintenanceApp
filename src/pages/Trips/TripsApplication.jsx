import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import NewTrip from "./NewTrip.jsx";
import TripDetails from "./TripDetails.jsx";
import TripsHome from "./TripsHome.jsx";
import PrioritizeTrips from "./PrioritizeTrips.jsx";
import TimelineView from "./TimelineView.jsx";
import { connectGoogleSheets, hasSheetsAccess } from "../../services/tripsService.js";

export default function TripsApplication({ home = false }) {
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
      <main className="page">
        <h1>Trips</h1>
        <p>Connect your Google account to access the Trips spreadsheet.</p>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={connect} disabled={connecting}>
          {connecting ? "Connecting..." : "Connect Google Sheets"}
        </button>
      </main>
    );
  }

  if (home) return <TripsHome />;

  return (
    <Routes>
      <Route path="/" element={<TripsHome />} />
      <Route path="/index.html" element={<TripsHome />} />
      <Route path="/prioritize" element={<PrioritizeTrips />} />
      <Route path="/timeline" element={<TimelineView />} />
      <Route path="/new" element={<NewTrip />} />
      <Route path="/:tripId" element={<TripDetails />} />
    </Routes>
  );
}
