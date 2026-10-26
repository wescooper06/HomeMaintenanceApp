import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { assignTripToMonth, getTrips } from "../../../services/tripsService.js";
import { getTimeline, propagateTimelineYear } from "../../../services/tripsTimelineService.js";
import { TIMELINE_MONTHS, timelineColor, timelineTripIds } from "../../../utils/timelineUtils.js";

import MonthBox from "./MonthBox.jsx";
import MonthDetailsModal from "./MonthDetailsModal.jsx";
import { TimelineDragDrop, TimelineDropMonth, TimelineDropYear } from "./TimelineDragDrop.jsx";
import TimelineYearRow from "./TimelineYearRow.jsx";
import TripMarker from "./TripMarker.jsx";
import "./PriorityTimelinePreview.css";

export default function PriorityTimelinePreview({ trips, onSelectTrip, onTimelineRefresh, refreshVersion = 0 }) {
  const [timeline, setTimeline] = useState([]);
  const [allTrips, setAllTrips] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [reload, setReload] = useState(0);
  const [moving, setMoving] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadYear() {
      try {
        const [months, loadedTrips] = await Promise.all([getTimeline(), getTrips()]);
        if (active) {
          setTimeline(months);
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
  }, [currentYear, reload, refreshVersion]);

  function changeYear(direction) {
    const nextYear = currentYear + direction;
    if (loading || moving || propagating || nextYear < 1 || nextYear > 9999) return;
    setLoading(true);
    setError("");
    setSelectedMonth(null);
    setCurrentYear(nextYear);
  }

  async function refreshData() {
    const [months, loadedTrips] = await Promise.all([getTimeline(), getTrips()]);
    setTimeline(months);
    setAllTrips(loadedTrips);
    onTimelineRefresh?.(loadedTrips);
  }

  async function propagateYear() {
    if (loading || moving || propagating || currentYear >= 9999) return;
    setPropagating(true);
    setError("");
    setNotice("");
    try {
      await propagateTimelineYear(currentYear, currentYear + 1);
      await refreshData();
      setNotice(`Month colors and notes copied to ${currentYear + 1}.`);
    } catch (propagationError) {
      setError(`Propagation may be partially saved. Retry propagation to finish. ${propagationError.message}`);
    } finally {
      setPropagating(false);
    }
  }

  const months = new Map(timeline.filter((entry) => Number(entry.year) === currentYear).map((entry) => [Number(entry.month), entry]));
  const tripMap = new Map(allTrips.map((trip) => [String(trip.tripId), trip]));
  for (const trip of trips) {
    const id = String(trip.tripId);
    tripMap.set(id, { ...trip, ...tripMap.get(id), priority: trip.priority });
  }
  const measurementKey = TIMELINE_MONTHS.flatMap((_, index) => timelineTripIds(months.get(index + 1)?.tripIds))
    .map((id) => tripMap.get(id)).filter(Boolean)
    .map((trip) => [trip.tripId, trip.destination, trip.location, trip.startDate, trip.endDate].join("|")).join(";");
  return <TimelineDragDrop disabled={loading || moving || propagating} onBusyChange={setMoving} onMove={async (tripId, year, month) => {
    await assignTripToMonth(tripId, year, month);
    await refreshData();
  }}><section id="priority-timeline-preview" className="priority-timeline-preview priority-year-timeline" aria-label="Prioritized trips timeline">
    <header className="priority-year-header">
      <h2>Timeline</h2>
      <div className="priority-year-navigation" aria-label="Timeline year navigation">
        <TimelineDropYear year={currentYear - 1} as="div"><button type="button" disabled={loading || moving || propagating || currentYear <= 1} onClick={() => changeYear(-1)}><ChevronLeft size={16} aria-hidden="true" />Previous Year</button></TimelineDropYear>
        <p aria-live="polite">{currentYear}</p>
        <TimelineDropYear year={currentYear + 1} as="div"><button type="button" disabled={loading || moving || propagating || currentYear >= 9999} onClick={() => changeYear(1)}>Next Year<ChevronRight size={16} aria-hidden="true" /></button></TimelineDropYear>
      </div>
    </header>
    <button type="button" className="timeline-propagate" disabled={loading || moving || propagating || currentYear >= 9999} onClick={propagateYear}>{propagating ? "Propagating..." : "Propagate Month Colors & Notes to Next Year"}</button>
    {notice && <p className="timeline-operation-status" role="status">{notice}</p>}
    <div className="priority-year-legend" aria-label="Month color legend"><span data-state="IDEAL">Ideal</span><span data-state="CAUTION">Caution</span><span data-state="CONFLICT">Conflict</span></div>
    {loading && <p role="status">Loading timeline...</p>}
    {error && <div className="priority-year-load-error" role="alert"><p>{error}</p><button type="button" disabled={loading || moving || propagating} onClick={() => { setLoading(true); setError(""); setReload((current) => current + 1); }}>Retry year</button></div>}
    {!loading && <TimelineDropYear year={currentYear} as="div"><TimelineYearRow className="priority-year-months timeline-row" measurementKey={measurementKey} aria-label={`Months of ${currentYear}`}>
      {TIMELINE_MONTHS.map((name, index) => {
        const month = index + 1;
        const entry = months.get(month);
        const color = timelineColor(entry?.color);
        const associatedTrips = timelineTripIds(entry?.tripIds).map((id) => tripMap.get(id)).filter(Boolean);
        const selected = selectedMonth?.year === currentYear && selectedMonth?.month === month;
        return <TimelineDropMonth key={month} year={currentYear} month={month} className="priority-year-month" data-state={color} data-selected={Boolean(selected)} onClick={() => { setSelectedMonth({ year: currentYear, month }); setShowMonthModal(true); }}>
          <MonthBox month={month} year={currentYear} abbreviation={name} monthNotes={entry?.notes} selected={selected} />
          <div className="priority-year-markers">{associatedTrips.map((trip) => {
            return <TripMarker key={trip.tripId} trip={trip} year={currentYear} month={month} monthName={name} className="priority-year-trip" onClick={(event) => { event.stopPropagation(); setSelectedMonth({ year: currentYear, month }); onSelectTrip(trip.tripId, trip); }} />;
          })}</div>
        </TimelineDropMonth>;
      })}
    </TimelineYearRow></TimelineDropYear>}
    {showMonthModal && selectedMonth && <MonthDetailsModal key={`${selectedMonth.year}-${selectedMonth.month}`} month={{ ...timeline.find((entry) => Number(entry.year) === selectedMonth.year && Number(entry.month) === selectedMonth.month), ...selectedMonth }} tripList={[...tripMap.values()]} refreshVersion={timeline} onSave={refreshData} onTripsChange={refreshData} onClose={() => setShowMonthModal(false)} onTripClick={(trip) => { setShowMonthModal(false); onSelectTrip(trip.tripId, trip); }} />}
  </section></TimelineDragDrop>;
}