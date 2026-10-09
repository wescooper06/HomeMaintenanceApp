import { TimelineDragTrip, TimelineDropMonth, TimelineDropYear } from "./TimelineDragDrop.jsx";
import { tripPriority } from "../utils/priorityUtils.js";
import { TIMELINE_MONTHS, timelineColor, timelineKey, timelineTripIds } from "../utils/timelineUtils.js";
import "../pages/TimelineView.css";

export default function TimelineGrid({ timeline, trips, selectedMonth, onMonthSelect, onTripClick, extraYears = [], showUnavailable = true }) {
  const currentYear = new Date().getFullYear();
  const years = [...new Set([currentYear, currentYear + 1, ...timeline.map((entry) => Number(entry.year)), ...extraYears])]
    .filter((year) => Number.isInteger(year) && year > 0 && year <= 9999).sort((first, second) => first - second);
  const entries = new Map(timeline.map((entry) => [timelineKey(entry.year, entry.month), entry]));
  const tripMap = new Map(trips.map((trip) => [String(trip.tripId), trip]));

  return (
    <section className="timeline-board" aria-label="Multi-year trip timeline">
      <div className="timeline-board-tools">
        <div className="timeline-legend"><span data-state="IDEAL">IDEAL</span><span data-state="CAUTION">CAUTION</span><span data-state="CONFLICT">CONFLICT</span></div>
      </div>
      <div className="timeline-scroll" aria-label="Timeline months">
        {years.map((year) => <TimelineDropYear key={year} year={year} className="timeline-year" aria-label={`Year ${year}`}>
          <h2>{year}</h2>
          <div className="timeline-months timeline-row">
            {TIMELINE_MONTHS.map((name, index) => {
              const month = index + 1;
              const key = timelineKey(year, month);
              const entry = entries.get(key);
              const ids = timelineTripIds(entry?.tripIds);
              const matches = ids.map((id) => tripMap.get(id)).filter(Boolean);
              const unavailable = ids.length - matches.length;
              const selected = selectedMonth && timelineKey(selectedMonth.year, selectedMonth.month) === key;
              const color = timelineColor(entry?.color);
              return <TimelineDropMonth key={month} year={year} month={month} className="timeline-month" data-state={color} data-selected={Boolean(selected)} onClick={() => onMonthSelect?.({ year, month })}>
                <button type="button" className="timeline-month-heading" aria-label={`Select ${name} ${year}`} aria-pressed={Boolean(selected)}><strong>{name}</strong>{color && <span>{color}</span>}</button>
                <div className="timeline-markers">{matches.map((trip) => <TimelineDragTrip key={trip.tripId} trip={trip} year={year} month={month} className="timeline-trip-marker" title={trip.destination} onClick={(event) => { event.stopPropagation(); onTripClick?.(trip, { year, month }); }}>
                  <strong>{trip.destination}</strong><span className="timeline-marker-meta"><span className={`trip-status trip-status-${String(trip.status || "Idea").toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span>{tripPriority(trip) !== null && <span className="trip-priority-badge">#{tripPriority(trip)}</span>}</span>
                </TimelineDragTrip>)}</div>
                {showUnavailable && unavailable > 0 && <p className="timeline-unavailable">{unavailable} unavailable {unavailable === 1 ? "trip" : "trips"}</p>}
              </TimelineDropMonth>;
            })}
          </div>
        </TimelineDropYear>)}
      </div>
    </section>
  );
}