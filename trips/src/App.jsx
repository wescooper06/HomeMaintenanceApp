import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import NewTrip from "./pages/NewTrip.jsx";
import TripDetails from "./pages/TripDetails.jsx";
import TripsHome from "./pages/TripsHome.jsx";
import PrioritizeTrips from "./pages/PrioritizeTrips.jsx";
import { connectGoogleSheets, hasSheetsAccess } from "./services/sheetsClient.js";

export default function App() {
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

  return (
    <Routes>
      <Route path="/" element={<TripsHome />} />
      <Route path="/index.html" element={<TripsHome />} />
      <Route path="/prioritize" element={<PrioritizeTrips />} />
      <Route path="/new" element={<NewTrip />} />
      <Route path="/:tripId" element={<TripDetails />} />
    </Routes>
  );
}
