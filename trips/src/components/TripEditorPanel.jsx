import { useEffect, useState } from "react";
import { getTripById, updateTrip } from "../services/sheetsClient.js";
import { tripPriority } from "../utils/priorityUtils.js";
import "./TripEditorPanel.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEFAULT_FIELDS = {
  destination: "", startDate: "", endDate: "", tripType: "", status: "Idea",
  timelineMonth: "", timelineYear: "", notes: "", duration: "", seasonality: "",
  costRange: "", considerations: "", tags: "", links: "",
};

function tripFields(trip) {
  return Object.fromEntries(Object.entries(DEFAULT_FIELDS).map(([field, fallback]) => [field, String(trip?.[field] ?? fallback)]));
}

export default function TripEditorPanel({ selectedTrip, onSave, onClose, onBusyChange }) {
  const [fields, setFields] = useState(() => tripFields(selectedTrip));
  const [loadedTrip, setLoadedTrip] = useState(selectedTrip);
  const [tab, setTab] = useState("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const tripId = selectedTrip?.tripId;

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    getTripById(tripId).then((trip) => {
      if (!active) return;
      if (!trip) throw new Error("Trip no longer exists.");
      setLoadedTrip(trip);
      setFields(tripFields(trip));
      setLoading(false);
      setError("");
    }).catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [tripId, reload]);

  function changeField(event) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
    setNotice("");
  }

  function textField(name, label, type = "text") {
    return <label key={name}>{label}<input name={name} type={type} value={fields[name]} onChange={changeField} /></label>;
  }

  function noteField(name, label) {
    return <label key={name}>{label}<textarea name={name} rows={2} value={fields[name]} onChange={changeField} /></label>;
  }

  async function saveTrip(event) {
    event.preventDefault();
    if (loading || saving) return;
    const destination = fields.destination.trim();
    if (!destination) {
      setTab("details");
      setError("Destination is required.");
      return;
    }
    setSaving(true);
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      await updateTrip(tripId, { ...fields, destination });
      const savedTrip = await getTripById(tripId);
      if (!savedTrip) throw new Error("Trip no longer exists.");
      setLoadedTrip(savedTrip);
      setFields(tripFields(savedTrip));
      onSave?.(savedTrip);
      setNotice("Trip saved.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save trip.");
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  if (!selectedTrip) return <p className="trip-editor-placeholder">Select a trip to edit.</p>;
  const priority = tripPriority(loadedTrip);

  return <article className="capture-trip trip-editor-panel" aria-labelledby="trip-editor-title">
    <header className="trip-modal-header">
      <div><p className="trip-eyebrow">Expanded idea</p><h2 id="trip-editor-title">{fields.destination || selectedTrip.destination || "Edit Trip"}</h2><p>{[fields.tripType, fields.duration].filter(Boolean).join(" / ")}</p></div>
      <div className="trip-modal-badges"><span className={`trip-status trip-status-${fields.status.toLowerCase().replace(/\s/g, "-")}`}>{fields.status}</span><output className="trip-priority-badge" aria-label="Priority">{priority === null ? "Not prioritized" : `Priority #${priority}`}</output></div>
    </header>
    <div className="trip-modal-tabs" role="tablist" aria-label="Trip fields">
      {["details", "planning"].map((name) => <button key={name} type="button" role="tab" id={`trip-editor-tab-${name}`} aria-controls={`trip-editor-fields-${name}`} aria-selected={tab === name} disabled={loading || saving} onClick={() => setTab(name)}>{name === "details" ? "Details" : "Planning"}</button>)}
    </div>
    <form onSubmit={saveTrip} aria-label="Edit trip" aria-busy={loading || saving}>
      <fieldset disabled={loading || saving} className="capture-fields">
        {loading && !error && <p role="status">Loading trip...</p>}
        <div role="tabpanel" id="trip-editor-fields-details" aria-labelledby="trip-editor-tab-details" hidden={tab !== "details"}>
          <label>Destination (required)<input name="destination" type="text" value={fields.destination} onChange={changeField} aria-required="true" /></label>
          <div className="capture-pair">
            <label>Trip Type<select name="tripType" value={fields.tripType} onChange={changeField}><option value="">None</option>{[...new Set(["cruise", "road trip", "flight", "other", fields.tripType].filter(Boolean))].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label>Status<select name="status" value={fields.status} onChange={changeField}>{[...new Set(["Idea", "Shortlisted", "Active", "Paused", "Deferred", fields.status])].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          </div>
          <div className="capture-pair">{textField("startDate", "Start Date", "date")}{textField("endDate", "End Date", "date")}</div>
          <div className="capture-pair"><label>Timeline Month<select name="timelineMonth" value={fields.timelineMonth} onChange={changeField}><option value="">None</option>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>{textField("timelineYear", "Timeline Year", "number")}</div>
          {noteField("notes", "Notes")}
        </div>
        <div role="tabpanel" id="trip-editor-fields-planning" aria-labelledby="trip-editor-tab-planning" hidden={tab !== "planning"}>
          <div className="capture-pair">{textField("duration", "Duration")}{textField("costRange", "Estimated Cost Range")}</div>
          <div className="capture-pair">{noteField("links", "Links")}{noteField("seasonality", "Seasonality Notes")}</div>
          {noteField("considerations", "Considerations")}{textField("tags", "Tags")}
        </div>
      </fieldset>
      <footer className="trip-modal-footer">
        {error && <p className="capture-error" role="alert">{error}</p>}
        {loading && error && <button type="button" className="trip-editor-retry" onClick={() => { setError(""); setReload((current) => current + 1); }}>Retry loading</button>}
        {notice && <p className="trip-editor-notice" role="status">{notice}</p>}
        <div className="capture-actions"><button type="submit" disabled={loading || saving}>{saving ? "Saving..." : "Save"}</button><button type="button" className="button-secondary" disabled={saving} onClick={onClose}>Close</button></div>
      </footer>
    </form>
  </article>;
}