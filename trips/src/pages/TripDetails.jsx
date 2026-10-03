import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getTrips,
  getWorkflowMetadata,
  updateWorkflowMetadata,
} from "../services/sheetsClient";

export default function TripDetails() {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [stage, setStage] = useState("Define");
  const [stageNotes, setStageNotes] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const allTrips = await getTrips();
        const found = allTrips.find((t) => t.tripId === tripId);

        if (!found) {
          setError("Trip not found");
          setLoading(false);
          return;
        }

        const workflow = await getWorkflowMetadata(tripId);

        setTrip(found);
        setStage(workflow.stage);
        setStageNotes(workflow.stageNotes);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [tripId]);

  async function handleSaveWorkflow() {
    await updateWorkflowMetadata(tripId, { stage, stageNotes });
    alert("Workflow updated.");
  }

  if (loading) return <p className="page">Loading trip...</p>;
  if (error) return <p className="page">Error: {error}</p>;
  if (!trip) return <p className="page">No trip found.</p>;

  return (
    <div className="page">
      <h1>{trip.destination}</h1>

      <div className="card">
        <p>{trip.startDate} → {trip.endDate}</p>
        <p>Type: {trip.tripType}</p>
        <p>Status: {trip.status}</p>
        <p>Timeline: {trip.timelineMonth} {trip.timelineYear}</p>
        <p>Notes: {trip.notes}</p>
      </div>

      <h2>Workflow</h2>

      <div className="card">
        <label>
          Stage:
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="Define">Define</option>
            <option value="Research">Research</option>
            <option value="Book">Book</option>
            <option value="Prepare">Prepare</option>
            <option value="Itinerary">Itinerary</option>
            <option value="Travel">Travel</option>
            <option value="Review">Review</option>
          </select>
        </label>

        <label>
          Stage Notes:
          <textarea
            value={stageNotes}
            onChange={(e) => setStageNotes(e.target.value)}
            rows={4}
          />
        </label>

        <button onClick={handleSaveWorkflow}>Save Workflow</button>
      </div>

      <button className="button-secondary" onClick={() => navigate("/")}>
        Back to Trips
      </button>
    </div>
  );
}
