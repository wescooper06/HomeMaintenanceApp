// Trips Home Page
// Displays active trips from the Trips sheet.
// Uses getTrips() from sheetsClient.js.
// Allows opening a trip and adding a new one.
import { useEffect, useState } from "react";
import { getTrips } from "../services/sheetsClient";
import { useNavigate } from "react-router-dom";

export default function TripsHome() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await getTrips();
        setTrips(data)
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p>Loading trips...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Trips</h1>

      <button
        onClick={() => navigate("/new")}
        style={{ marginBottom: "20px" }}
      >
        New Trip
      </button>

      <ul>
        {trips.map((trip) => (
          <li key={trip.tripId} onClick={() => navigate(`/${trip.tripId}`)}>
            <strong>{trip.destination}</strong> — {trip.startDate} → {trip.endDate}
          </li>
        ))}
      </ul>
    </div>
  );
}
