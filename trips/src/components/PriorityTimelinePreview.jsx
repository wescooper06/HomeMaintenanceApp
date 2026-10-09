import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTimeline, getTrips, initializeTimelineYear } from "../services/sheetsClient.js";
import { TIMELINE_MONTHS, timelineColor, timelineTripIds } from "../utils/timelineUtils.js";
import { tripPriority } from "../utils/priorityUtils.js";
import MonthDetailsModal from "./MonthDetailsModal.jsx";
import "./PriorityTimelinePreview.css";

export default function PriorityTimelinePreview({ trips, onSelectTrip }) {
  const [timeline, setTimeline] = useState([]);
  const [allTrips, setAllTrips] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadYear() {
      try {
        await initializeTimelineYear(currentYear);
        if (!active) return;
        const [months, loadedTrips] = await Promise.all([getTimeline(), getTrips()]);
        if (active) {
          setTimeline(months.filter((entry) => Number(entry.year) === currentYear));
          setAllTrips(loadedTrips);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadYear();
    return () => { active = false; };
  }, [currentYear, reload]);

  function changeYear(direction) {
    const nextYear = currentYear + direction;
    if (loading || nextYear < 1 || nextYear > 9999) return;
    setLoading(true);
    setError("");
    setSelectedMonth(null);
    setCurrentYear(nextYear);
  }

  const months = new Map(timeline.filter((entry) => Number(entry.year) === currentYear).map((entry) => [Number(entry.month), entry]));
  const tripMap = new Map([...allTrips, ...trips].map((trip) => [String(trip.tripId), trip]));
  const rankedIds = new Set(trips.map((trip) => String(trip.tripId)));

  return <section id="priority-timeline-preview" className="priority-timeline-preview priority-year-timeline" aria-label="Prioritized trips timeline">
    <header className="priority-year-header">
      <h2>Timeline</h2>
      <div className="priority-year-navigation" aria-label="Timeline year navigation">
        <button type="button" disabled={loading || currentYear <= 1} onClick={() => changeYear(-1)}><ChevronLeft size={16} aria-hidden="true" />Previous Year</button>
        <p aria-live="polite">{currentYear}</p>
        <button type="button" disabled={loading || currentYear >= 9999} onClick={() => changeYear(1)}>Next Year<ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </header>
    <div className="priority-year-legend" aria-label="Month color legend"><span data-state="IDEAL">Ideal</span><span data-state="CAUTION">Caution</span><span data-state="CONFLICT">Conflict</span></div>
    {loading && <p role="status">Loading timeline...</p>}
    {error && <div className="priority-year-load-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(""); setReload((current) => current + 1); }}>Retry year</button></div>}
    {!loading && !error && <div className="priority-year-months" aria-label={`Months of ${currentYear}`}>
      {TIMELINE_MONTHS.map((name, index) => {
        const month = index + 1;
        const entry = months.get(month);
        const color = timelineColor(entry?.color);
        const associatedTrips = timelineTripIds(entry?.tripIds).map((id) => tripMap.get(id)).filter(Boolean);
        const selected = selectedMonth?.year === currentYear && selectedMonth?.month === month;
        return <section key={month} className="priority-year-month" data-state={color} data-selected={Boolean(selected)} onClick={() => { setSelectedMonth({ year: currentYear, month }); setShowMonthModal(true); }}>
          <button type="button" className="priority-year-month-heading" title={`${name} ${currentYear}${color ? `: ${color}` : ""}`} aria-label={`Select ${name} ${currentYear}`} aria-pressed={Boolean(selected)}>{name}</button>
          <div className="priority-year-markers">{associatedTrips.map((trip) => {
            const status = String(trip.status || "Idea");
            const priority = tripPriority(trip);
            return <button key={trip.tripId} type="button" data-trip-id={trip.tripId} className="priority-year-trip" title={`${trip.destination} / ${status}${priority !== null ? ` / Priority ${priority}` : ""}`} aria-label={`${rankedIds.has(String(trip.tripId)) ? "Select trip" : "Highlight month for"} ${trip.destination}`} onClick={(event) => { event.stopPropagation(); setSelectedMonth({ year: currentYear, month }); if (rankedIds.has(String(trip.tripId))) onSelectTrip(trip.tripId, trip); }}>
              <strong>{trip.destination}</strong>
              <span className={`trip-status priority-year-status trip-status-${status.toLowerCase().replace(/\s/g, "-")}`} title={status}><span className="priority-year-status-label">{status}</span><span className="priority-year-status-short" aria-hidden="true">{status.slice(0, 1)}</span></span>
              {priority !== null && <span className="trip-priority-badge" aria-label={`Priority ${priority}`}>#{priority}</span>}
            </button>;
          })}</div>
        </section>;
      })}
    </div>}
    {showMonthModal && selectedMonth && <MonthDetailsModal key={`${selectedMonth.year}-${selectedMonth.month}`} month={{ ...months.get(selectedMonth.month), ...selectedMonth }} tripList={[...tripMap.values()]} onSave={async () => setTimeline(await getTimeline())} onTripsChange={async () => {
      const [months, loadedTrips] = await Promise.all([getTimeline(), getTrips()]);
      setTimeline(months);
      setAllTrips(loadedTrips);
    }} onClose={() => setShowMonthModal(false)} onTripClick={(trip) => { setShowMonthModal(false); onSelectTrip(trip.tripId, trip); }} />}
  </section>;
}