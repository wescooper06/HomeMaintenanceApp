import { TimelineDropMonth, TimelineDropYear } from "./TimelineDragDrop.jsx";
import { TIMELINE_MONTHS, timelineColor, timelineKey, timelineTripIds } from "../../../utils/timelineUtils.js";
import MonthBox from "./MonthBox.jsx";
import TripMarker from "./TripMarker.jsx";
import TimelineYearRow from "./TimelineYearRow.jsx";
import "../TimelineView.css";

export default function TimelineGrid({ timeline, trips, selectedMonth, onMonthSelect, onTripClick, extraYears = [], collapsedYears = {}, onToggleYearCollapse, disabled = false }) {
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
        {years.map((year) => {
          const yearCollapsed = collapsedYears[year] === true;
          const monthRowId = `timeline-months-${year}`;
          const assignedTrips = new Set(TIMELINE_MONTHS.flatMap((_, index) => timelineTripIds(entries.get(timelineKey(year, index + 1))?.tripIds)).filter((id) => tripMap.has(id)));
          const yearTrips = [...assignedTrips].map((id) => tripMap.get(id)).filter(Boolean);
          const measurementKey = yearTrips.map((trip) => [trip.tripId, trip.destination, trip.location, trip.startDate, trip.endDate].join("|")).join(";");
          return <TimelineDropYear key={year} year={year} className="timeline-year" aria-label={`Year ${year}`}>
          <div className="timeline-year-heading">
            <button type="button" className="timeline-year-toggle" role="button" tabIndex={0} aria-expanded={!yearCollapsed} aria-controls={monthRowId} aria-label={`${year} timeline ${yearCollapsed ? "collapsed" : "expanded"}. ${yearCollapsed ? "Expand" : "Collapse"} year`} disabled={disabled} onClick={() => onToggleYearCollapse?.(year)}><span aria-hidden="true">{yearCollapsed ? "▸" : "▾"}</span></button>
            <h2>{year}</h2>
            {yearCollapsed && <span className="timeline-year-summary">{assignedTrips.size} {assignedTrips.size === 1 ? "trip" : "trips"}{disabled && <span className="timeline-year-drop-disabled"> · Drops disabled</span>}</span>}
          </div>
          <TimelineYearRow measurementKey={measurementKey}>
          <div id={monthRowId} className="timeline-months-collapse" data-collapsed={yearCollapsed} aria-hidden={yearCollapsed} inert={yearCollapsed}>
          <div className="timeline-months timeline-row">
            {TIMELINE_MONTHS.map((name, index) => {
              const month = index + 1;
              const key = timelineKey(year, month);
              const entry = entries.get(key);
              const ids = timelineTripIds(entry?.tripIds);
              const matches = ids.map((id) => tripMap.get(id)).filter(Boolean);
              const selected = selectedMonth && timelineKey(selectedMonth.year, selectedMonth.month) === key;
              const color = timelineColor(entry?.color);
              return <TimelineDropMonth key={month} year={year} month={month} disabled={yearCollapsed} className="timeline-month" data-state={color} data-selected={Boolean(selected)} onClick={() => onMonthSelect?.({ year, month })}>
                <MonthBox month={month} year={year} abbreviation={name} monthNotes={entry?.notes} selected={selected} />
                <div className="timeline-markers">{matches.map((trip) => <TripMarker key={trip.tripId} trip={trip} year={year} month={month} monthName={name} className="timeline-trip-marker" onClick={(event) => { event.stopPropagation(); onTripClick?.(trip, { year, month }); }} />)}</div>
              </TimelineDropMonth>;
            })}
          </div>
          </div>
          </TimelineYearRow>
        </TimelineDropYear>;
        })}
      </div>
    </section>
  );
}