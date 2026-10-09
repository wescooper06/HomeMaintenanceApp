import { useEffect, useRef, useState } from "react";
import { assignTripToMonth, getTimelineMonth, getTrips, updateTimelineMonth } from "../services/sheetsClient.js";
import { TIMELINE_MONTHS, timelineColor, timelineMonthNumber, timelineTripIds } from "../utils/timelineUtils.js";
import { tripPriority } from "../utils/priorityUtils.js";
import "./MonthDetailsModal.css";

export default function MonthDetailsModal({ month, tripList = [], refreshVersion, onSave, onTripsChange, onClose, onTripClick }) {
  const dialog = useRef(null);
  const previousRefresh = useRef(refreshVersion);
  const [data, setData] = useState(month);
  const [trips, setTrips] = useState(tripList);
  const [draft, setDraft] = useState({ color: timelineColor(month.color), notes: String(month.notes || "") });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignmentTripId, setAssignmentTripId] = useState("");
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const year = Number(month.year);
  const monthNumber = timelineMonthNumber(month.month);

  useEffect(() => {
    const modal = dialog.current;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    function resize() {
      let height = window.innerHeight;
      try {
        const bounds = window.frameElement?.getBoundingClientRect();
        if (bounds) height = Math.max(0, Math.min(bounds.bottom, window.parent.innerHeight) - Math.max(bounds.top, 0));
      } catch {
        height = window.innerHeight;
      }
      modal.style.height = `${height}px`;
    }
    resize();
    window.addEventListener("resize", resize);
    modal.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", resize);
      modal.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getTimelineMonth(year, monthNumber), getTrips()]).then(([entry, loadedTrips]) => {
      if (!active) return;
      setData(entry);
      setTrips(loadedTrips);
      setDraft({ color: timelineColor(entry.color), notes: String(entry.notes || "") });
      setLoading(false);
      setError("");
    }).catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [year, monthNumber, reload]);

  useEffect(() => {
    if (previousRefresh.current === refreshVersion) return;
    previousRefresh.current = refreshVersion;
    let active = true;
    Promise.all([getTimelineMonth(year, monthNumber), getTrips()]).then(([entry, loadedTrips]) => {
      if (active) { setData(entry); setTrips(loadedTrips); }
    }).catch((refreshError) => { if (active) setError(refreshError.message); });
    return () => { active = false; };
  }, [refreshVersion, year, monthNumber]);

  async function save(event) {
    event.preventDefault();
    if (loading || saving || assigning) return;
    setSaving(true);
    setError("");
    try {
      await updateTimelineMonth(year, monthNumber, draft);
      await onSave?.();
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function assignTrip() {
    if (loading || saving || assigning || !assignmentTripId) return;
    setAssigning(true);
    setAssignmentNotice("");
    setError("");
    try {
      await assignTripToMonth(assignmentTripId, year, monthNumber);
      const [entry, loadedTrips] = await Promise.all([getTimelineMonth(year, monthNumber), getTrips()]);
      setData(entry);
      setTrips(loadedTrips);
      await onTripsChange?.();
      setAssignmentTripId("");
      setAssignmentNotice("Trip assigned to month.");
    } catch (assignmentError) {
      setError(`Assignment may be partially saved. Click Assign Trip again to retry. ${assignmentError.message}`);
    } finally {
      setAssigning(false);
    }
  }

  const ids = timelineTripIds(data.tripIds);
  const assigned = ids.map((id) => trips.find((trip) => String(trip.tripId) === id)).filter(Boolean);
  return <dialog ref={dialog} className="capture-trip month-details-modal" aria-labelledby="month-modal-title" aria-modal="true" onCancel={(event) => { event.preventDefault(); if (!saving && !assigning) onClose(); }}>
    <article className="month-modal-card">
      <header><p className="trip-eyebrow">Month details</p><h1 id="month-modal-title">{TIMELINE_MONTHS[monthNumber - 1]} {year}</h1></header>
      <form onSubmit={save} aria-busy={loading || saving || assigning}>
        <div className="month-modal-body">
          {loading && !error && <p role="status">Loading month...</p>}
          <fieldset disabled={loading || saving || assigning}>
            <label>Color<select aria-label="Month color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}><option value="">None</option><option value="IDEAL">Ideal</option><option value="CAUTION">Caution</option><option value="CONFLICT">Conflict</option></select></label>
            <label>Notes<textarea aria-label="Month notes" rows={3} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
          </fieldset>
          {!loading && <section className="month-modal-trips"><h2>Associated Trips</h2>{assigned.map((trip) => <article key={trip.tripId}>
            <button type="button" className="month-modal-trip-link" disabled={saving || assigning} onClick={() => onTripClick?.(trip)}>{trip.destination}</button><p>{trip.tripType || "Unspecified"}</p>
            <div><span className={`trip-status trip-status-${String(trip.status || "Idea").toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span>{tripPriority(trip) !== null ? <span className="trip-priority-badge">#{tripPriority(trip)}</span> : <span className="month-modal-unranked">Not prioritized</span>}</div>
          </article>)}{!assigned.length && <p>No assigned trips.</p>}{assigned.length < ids.length && <p className="timeline-unavailable">Some referenced trips are unavailable.</p>}</section>}
          <fieldset className="month-modal-assignment" disabled={loading || saving || assigning}>
            <label>Assign or move trip<select value={assignmentTripId} onChange={(event) => { setAssignmentTripId(event.target.value); setAssignmentNotice(""); }}><option value="">Choose a trip</option>{trips.map((trip) => <option key={trip.tripId} value={trip.tripId}>{trip.destination}</option>)}</select></label>
            <button type="button" className="month-modal-assign-button" disabled={!assignmentTripId} onClick={assignTrip}>{assigning ? "Assigning..." : "Assign Trip"}</button>
          </fieldset>
          {assignmentNotice && <p className="month-modal-assignment-notice" role="status">{assignmentNotice}</p>}
        </div>
        <footer className="trip-modal-footer">
          {error && <p role="alert" className="capture-error">{error}</p>}
          {loading && error && <button type="button" onClick={() => { setError(""); setReload((current) => current + 1); }}>Retry loading</button>}
          <div className="capture-actions"><button type="submit" disabled={loading || saving || assigning}>{saving ? "Saving..." : "Save"}</button><button type="button" className="button-secondary" disabled={saving || assigning} onClick={() => onClose()}>Close</button></div>
        </footer>
      </form>
    </article>
  </dialog>;
}