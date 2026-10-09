import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTrip, updateWorkflowMetadata } from "../services/sheetsClient";

export default function NewTrip() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    destination: "",
    startDate: "",
    endDate: "",
    tripType: "",
    status: "Active",
    timelineMonth: "",
    timelineYear: "",
    notes: "",
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const tripId = crypto.randomUUID();

    await createTrip({ tripId, ...form });

    await updateWorkflowMetadata(tripId, {
      stage: "Define",
      stageNotes: "",
    });

    navigate(`/${tripId}`);
  }

  return (
    <div className="page">
      <h1>Create New Trip</h1>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Destination:
            <input name="destination" value={form.destination} onChange={handleChange} />
          </label>

          <label>
            Start Date:
            <input name="startDate" value={form.startDate} onChange={handleChange} />
          </label>

          <label>
            End Date:
            <input name="endDate" value={form.endDate} onChange={handleChange} />
          </label>

          <label>
            Trip Type:
            <input name="tripType" value={form.tripType} onChange={handleChange} />
          </label>

          <label>
            Timeline Month:
            <input name="timelineMonth" value={form.timelineMonth} onChange={handleChange} />
          </label>

          <label>
            Timeline Year:
            <input name="timelineYear" value={form.timelineYear} onChange={handleChange} />
          </label>

          <label>
            Notes:
            <textarea name="notes" value={form.notes} onChange={handleChange} />
          </label>

          <button type="submit">Create Trip</button>
        </form>
      </div>

      <button className="button-secondary" onClick={() => navigate("/")}>
        Cancel
      </button>
    </div>
  );
}
