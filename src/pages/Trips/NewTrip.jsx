import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TRIPS_HOME_ROUTE } from "../../router/lifeManagerRoutes.js";
import { createTrip } from "../../services/tripsService.js";

export default function NewTrip() {
  const navigate = useNavigate();
  const tripId = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    destination: "",
    startDate: "",
    endDate: "",
    tripType: "",
    status: "Active",
    purpose: "",
    location: "",
    timelineMonth: "",
    timelineYear: "",
    notes: "",
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      tripId.current ??= crypto.randomUUID();
      const trip = await createTrip({ tripId: tripId.current, ...form });
      navigate(`/${trip.tripId}`);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Create New Trip</h1>

      <div className="card">
        <form onSubmit={handleSubmit} aria-busy={saving}>
          <fieldset disabled={saving}>
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
            Purpose:
            <select name="purpose" value={form.purpose} onChange={handleChange}>
              <option value="">None</option>
              <option value="Business">Business</option>
              <option value="Vacation">Vacation</option>
              <option value="Combo">Combo</option>
              <option value="SAR">SAR</option>
              <option value="Running">Running</option>
            </select>
          </label>

          <label>
            Location:
            <input name="location" value={form.location} onChange={handleChange} />
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

          {error && <p role="alert">{error}</p>}
          <button type="submit">{saving ? "Creating..." : "Create Trip"}</button>
          </fieldset>
        </form>
      </div>

      <button disabled={saving} className="button-secondary" onClick={() => navigate(TRIPS_HOME_ROUTE)}>
        Cancel
      </button>
    </div>
  );
}
