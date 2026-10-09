import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TimelineGrid from "../components/TimelineGrid.jsx";
import ViewTripModal from "../components/ViewTripModal.jsx";
import MonthDetailsModal from "../components/MonthDetailsModal.jsx";
import { getTimeline, getTrips, updateTimelineMonth, updateTrip } from "../services/sheetsClient.js";
import { tripPriority } from "../utils/priorityUtils.js";
import { TIMELINE_MONTHS, timelineColor, timelineKey, timelineTripIds } from "../utils/timelineUtils.js";
import "./TimelineView.css";

function monthDraft(entry) {
  return { color: timelineColor(entry?.color), notes: String(entry?.notes || ""), blocks: String(entry?.blocks || "") };
}

export default function TimelineView() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [timeline, setTimeline] = useState([]);
  const [trips, setTrips] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [draft, setDraft] = useState(monthDraft());
  const [extraYears, setExtraYears] = useState([]);
  const [yearInput, setYearInput] = useState(String(now.getFullYear() + 2));
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [placementTripId, setPlacementTripId] = useState("");
  const [pendingPlacement, setPendingPlacement] = useState(null);
  const [viewTrip, setViewTrip] = useState(null);
  const [modalMonth, setModalMonth] = useState(null);
  const monthDetails = useRef(null);
  const timelineMain = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([getTimeline(), getTrips()]).then(([months, allTrips]) => {
      if (!active) return;
      setTimeline(months);
      setTrips(allTrips);
      setLoaded(true);
      setDraft(monthDraft(months.find((entry) => Number(entry.year) === now.getFullYear() && Number(entry.month) === now.getMonth() + 1)));
    }).catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [now]);

  const selectedEntry = timeline.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(selectedMonth.year, selectedMonth.month));
  const ids = timelineTripIds(selectedEntry?.tripIds);
  const associatedTrips = ids.map((id) => trips.find((trip) => String(trip.tripId) === id)).filter(Boolean);
  const dirty = JSON.stringify(draft) !== JSON.stringify(monthDraft(selectedEntry));
  const locked = !loaded || loading || busy || Boolean(pendingPlacement);

  async function refreshData() {
    const [months, allTrips] = await Promise.all([getTimeline(), getTrips()]);
    setTimeline(months);
    setTrips(allTrips);
    setLoaded(true);
    return { months, allTrips };
  }

  async function retryLoad() {
    setLoading(true);
    setError("");
    try {
      const { months } = await refreshData();
      setDraft(monthDraft(months.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(selectedMonth.year, selectedMonth.month))));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function showMonthDetails() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      window.requestAnimationFrame(() => monthDetails.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function chooseMonth(month, scrollToDetails = true) {
    if (locked) return false;
    if (timelineKey(month.year, month.month) === timelineKey(selectedMonth.year, selectedMonth.month)) {
      if (scrollToDetails) showMonthDetails();
      return true;
    }
    if (dirty && !window.confirm("Discard unsaved month changes?")) return false;
    setSelectedMonth(month);
    setDraft(monthDraft(timeline.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(month.year, month.month))));
    setPlacementTripId("");
    setError("");
    setNotice("");
    if (scrollToDetails) showMonthDetails();
    return true;
  }

  async function saveMonth(event) {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateTimelineMonth(selectedMonth.year, selectedMonth.month, draft);
      const { months } = await refreshData();
      setDraft(monthDraft(months.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(selectedMonth.year, selectedMonth.month))));
      setNotice("Month saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function placeTrip(plan) {
    if (loading || busy) return;
    if (!pendingPlacement && dirty && !window.confirm("Discard unsaved month changes?")) return;
    setBusy(true);
    setPendingPlacement(plan);
    setError("");
    setNotice("");
    try {
      const [months, allTrips] = await Promise.all([getTimeline(), getTrips()]);
      const trip = allTrips.find((item) => String(item.tripId) === String(plan.tripId));
      if (!trip) throw new Error("Trip no longer exists.");
      const targetKey = timelineKey(plan.year, plan.month);
      const target = months.find((entry) => timelineKey(entry.year, entry.month) === targetKey);
      if (plan.remove) {
        if (timelineKey(trip.timelineYear, trip.timelineMonth) === targetKey) {
          await updateTrip(trip.tripId, { timelineMonth: "", timelineYear: "" });
        } else {
          await updateTimelineMonth(plan.year, plan.month, { tripIds: timelineTripIds(target?.tripIds).filter((id) => id !== String(plan.tripId)) });
        }
      } else {
        await updateTrip(trip.tripId, { timelineMonth: Number(plan.month), timelineYear: Number(plan.year) });
      }
      const { months: confirmed } = await refreshData();
      setDraft(monthDraft(confirmed.find((entry) => timelineKey(entry.year, entry.month) === targetKey)));
      setPendingPlacement(null);
      setPlacementTripId("");
      setNotice(plan.remove ? "Trip removed from month." : "Trip assigned to month.");
    } catch (placementError) {
      setError(`Placement may be partially saved. Retry to finish syncing both sheets. ${placementError.message}`);
    } finally {
      setBusy(false);
    }
  }

  function addYear(event) {
    event.preventDefault();
    const year = Number(yearInput);
    if (!Number.isInteger(year) || year < 1 || year > 9999) return;
    setExtraYears((current) => [...new Set([...current, year])]);
    chooseMonth({ year, month: 1 });
  }

  return (
    <main className="timeline-page">
      <header className="timeline-page-header"><div><p className="trip-eyebrow">Travel calendar</p><h1>Timeline</h1></div><button type="button" disabled={busy || Boolean(pendingPlacement)} onClick={() => navigate("/")}><ArrowLeft size={16} aria-hidden="true" />Back to Trips</button></header>
      {loading && <p role="status">Loading timeline...</p>}
      {error && <div className="timeline-error" role="alert"><p>{error}</p>{pendingPlacement && <button type="button" disabled={busy} onClick={() => placeTrip(pendingPlacement)}>Retry placement</button>}{!loaded && !loading && <button type="button" onClick={retryLoad}>Retry loading</button>}</div>}
      {notice && <p className="timeline-notice" role="status">{notice}</p>}
      <div className="timeline-layout">
        <div className="timeline-main" ref={timelineMain}>
          <form className="timeline-year-form" onSubmit={addYear}><label>Year<input type="number" min="1" max="9999" step="1" value={yearInput} onChange={(event) => setYearInput(event.target.value)} required /></label><button type="submit" disabled={locked}>Add Year</button></form>
          <TimelineGrid timeline={timeline} trips={trips} selectedMonth={selectedMonth} extraYears={extraYears} onMonthSelect={(month) => { if (chooseMonth(month, false)) setModalMonth(month); }} onTripClick={(trip, month) => { if (chooseMonth(month, false)) setViewTrip(trip); }} />
        </div>
        <aside ref={monthDetails} className="timeline-month-details" aria-label="Month details">
          <header><p className="trip-eyebrow">Month details</p><h2>{TIMELINE_MONTHS[selectedMonth.month - 1]} {selectedMonth.year}</h2><button type="button" className="timeline-mobile-back" onClick={() => timelineMain.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><ArrowLeft size={14} aria-hidden="true" />Back to Timeline</button></header>
          <form onSubmit={saveMonth}>
            <fieldset disabled={locked}>
              <label>Color<select aria-label="Color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}><option value="">None</option>{["IDEAL", "CAUTION", "CONFLICT"].map((color) => <option key={color} value={color}>{color}</option>)}</select></label>
              <label>Notes<textarea aria-label="Notes" rows={4} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
              <label>Blocks<input aria-label="Blocks" type="text" value={draft.blocks} onChange={(event) => setDraft((current) => ({ ...current, blocks: event.target.value }))} placeholder="Block 01-14" /></label>
              <button type="submit">{busy ? "Saving..." : "Save Month"}</button>
            </fieldset>
          </form>
          <section className="timeline-month-trip-list"><h3>Associated Trips</h3>
            {associatedTrips.map((trip) => <article key={trip.tripId} className="timeline-associated-trip">
              <button type="button" className="timeline-view-trip" onClick={() => setViewTrip(trip)}>{trip.destination}</button>
              <p>{[trip.tripType, [TIMELINE_MONTHS[Number(trip.timelineMonth) - 1] || trip.timelineMonth, trip.timelineYear].filter(Boolean).join(" ")].filter(Boolean).join(" / ")}</p>
              <div className="timeline-marker-meta"><span className={`trip-status trip-status-${String(trip.status || "Idea").toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span>{tripPriority(trip) !== null && <span className="trip-priority-badge">#{tripPriority(trip)}</span>}<button type="button" className="timeline-remove-trip" disabled={locked} onClick={() => placeTrip({ tripId: trip.tripId, ...selectedMonth, remove: true })}>Remove from month</button></div>
            </article>)}
            {!associatedTrips.length && <p>No associated trips.</p>}
            {ids.length > associatedTrips.length && <p className="timeline-unavailable">Some referenced trip IDs no longer exist.</p>}
          </section>
          <form className="timeline-assign-form" onSubmit={(event) => { event.preventDefault(); if (placementTripId) placeTrip({ tripId: placementTripId, ...selectedMonth }); }}>
            <label>Assign or move trip<select aria-label="Assign or move trip" value={placementTripId} disabled={locked} onChange={(event) => setPlacementTripId(event.target.value)}><option value="">Choose a trip</option>{trips.filter((trip) => !ids.includes(String(trip.tripId))).map((trip) => <option key={trip.tripId} value={trip.tripId}>{trip.destination}</option>)}</select></label>
            <button type="submit" disabled={locked || !placementTripId}>Assign to Month</button>
          </form>
        </aside>
      </div>
      {viewTrip && <ViewTripModal trip={viewTrip} onClose={() => setViewTrip(null)} />}
      {modalMonth && <MonthDetailsModal key={timelineKey(modalMonth.year, modalMonth.month)} month={{ ...timeline.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(modalMonth.year, modalMonth.month)), ...modalMonth }} tripList={trips} onSave={async () => {
        const { months } = await refreshData();
        setDraft(monthDraft(months.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(modalMonth.year, modalMonth.month))));
      }} onTripsChange={refreshData} onClose={() => setModalMonth(null)} onTripClick={(trip) => { setModalMonth(null); setViewTrip(trip); }} />}
    </main>
  );
}