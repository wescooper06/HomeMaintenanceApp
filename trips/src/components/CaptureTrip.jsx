import { useEffect, useRef, useState } from "react";
import { createTrip, updateTrip } from "../services/sheetsClient";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_FIELDS = {
  destination: "", startDate: "", endDate: "", tripType: "", status: "Idea",
  timelineMonth: "", timelineYear: "", notes: "", duration: "", seasonality: "",
  costRange: "", considerations: "", tags: "", links: "",
};

export default function CaptureTrip({ onClose, trip, onSave, expanded = false }) {
  const dialog = useRef(null);
  const tripId = useRef(trip?.tripId || null);
  const [fields, setFields] = useState(() => Object.fromEntries(
    Object.entries(DEFAULT_FIELDS).map(([field, fallback]) => [field, String(trip?.[field] ?? fallback)])
  ));
  const [tab, setTab] = useState("details");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const modal = dialog.current;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    function fitVisibleViewport() {
      let height = window.innerHeight;
      try {
        const frame = window.frameElement;
        if (frame) {
          const bounds = frame.getBoundingClientRect();
          height = Math.max(0, Math.min(bounds.bottom, window.parent.innerHeight) - Math.max(bounds.top, 0));
        }
      } catch {
        height = window.innerHeight;
      }
      modal.style.height = `${height}px`;
    }
    fitVisibleViewport();
    window.addEventListener("resize", fitVisibleViewport);
    modal.showModal();
    modal.querySelector("input[name='destination']").focus();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", fitVisibleViewport);
      modal.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  function changeField(event) {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  }

  function textField(name, label, type = "text") {
    return <label key={name}>{label}<input name={name} type={type} value={fields[name]} onChange={changeField} /></label>;
  }

  function noteField(name, label) {
    return <label key={name}>{label}<textarea name={name} rows={2} value={fields[name]} onChange={changeField} /></label>;
  }

  async function saveTrip(event) {
    event.preventDefault();
    if (saving) return;
    const destination = fields.destination.trim();
    if (!destination) {
      setTab("details");
      setError("Destination is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      tripId.current ??= crypto.randomUUID();
      const savedTrip = { ...fields, destination, tripId: tripId.current };
      if (trip?.tripId) await updateTrip(trip.tripId, savedTrip);
      else await createTrip(savedTrip);
      onSave?.(savedTrip);
      onClose(savedTrip);
    } catch (saveError) {
      setError(saveError.message || "Unable to save trip.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className={`capture-trip${expanded ? " expanded-trip" : ""}`} aria-labelledby="capture-title" aria-modal="true" onCancel={(event) => {
      event.preventDefault();
      if (!saving) onClose();
    }}>
      <article className="capture-card" aria-labelledby="capture-title">
        <header className="trip-modal-header">
          <div>
            {expanded && <p className="trip-eyebrow">Expanded idea</p>}
            <h1 id="capture-title">{expanded ? fields.destination || "Edit Trip" : trip ? "Edit Trip" : "Capture Trip"}</h1>
            <p>{expanded ? [fields.tripType, fields.duration].filter(Boolean).join(" / ") : "Record a new trip idea."}</p>
          </div>
          <span className={`trip-status trip-status-${fields.status.toLowerCase().replace(/\s/g, "-")}`}>{fields.status}</span>
        </header>
        <div className="trip-modal-tabs" role="tablist" aria-label="Trip fields">
          {["details", "planning"].map((name) => <button key={name} type="button" role="tab" id={`trip-tab-${name}`} aria-controls={`trip-panel-${name}`} aria-selected={tab === name} disabled={saving} onClick={() => setTab(name)}>{name === "details" ? "Details" : "Planning"}</button>)}
        </div>
        <form onSubmit={saveTrip} aria-busy={saving}>
          <fieldset disabled={saving} className="capture-fields">
            <div role="tabpanel" id="trip-panel-details" aria-labelledby="trip-tab-details" hidden={tab !== "details"}>
              <label>Destination (required)<input name="destination" type="text" value={fields.destination} onChange={changeField} aria-required="true" /></label>
              <div className="capture-pair">
                <label>Trip Type<select name="tripType" value={fields.tripType} onChange={changeField}>
                  <option value="">None</option>
                  {[...new Set(["cruise", "road trip", "flight", "other", fields.tripType].filter(Boolean))].map((type) => <option key={type} value={type}>{type}</option>)}
                </select></label>
                <label>Status<select name="status" value={fields.status} onChange={changeField}>
                  {[...new Set(["Idea", "Shortlisted", "Active", "Paused", "Deferred", fields.status])].map((status) => <option key={status} value={status}>{status}</option>)}
                </select></label>
              </div>
              <div className="capture-pair">
                {textField("startDate", "Start Date", "date")}
                {textField("endDate", "End Date", "date")}
              </div>
              <div className="capture-pair">
                <label>Timeline Month<select name="timelineMonth" value={fields.timelineMonth} onChange={changeField}>
                  <option value="">None</option>
                  {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select></label>
                {textField("timelineYear", "Timeline Year", "number")}
              </div>
              {noteField("notes", "Notes")}
            </div>
            <div role="tabpanel" id="trip-panel-planning" aria-labelledby="trip-tab-planning" hidden={tab !== "planning"}>
              <div className="capture-pair">
                {textField("duration", "Duration")}
                {textField("costRange", "Estimated Cost Range")}
              </div>
              <div className="capture-pair">
                {noteField("links", "Links")}
                {noteField("seasonality", "Seasonality Notes")}
              </div>
              {noteField("considerations", "Considerations")}
              {textField("tags", "Tags")}
            </div>
          </fieldset>
          <footer className="trip-modal-footer">
            {error && <p className="capture-error" role="alert">{error}</p>}
            <div className="capture-actions">
              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              <button type="button" className="button-secondary" disabled={saving} onClick={() => onClose()}>{expanded ? "Close" : "Cancel"}</button>
            </div>
          </footer>
        </form>
      </article>
    </dialog>
  );
}