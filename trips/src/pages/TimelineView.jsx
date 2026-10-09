import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ListOrdered } from "lucide-react";
import TimelineGrid from "../components/TimelineGrid.jsx";
import ViewTripModal from "../components/ViewTripModal.jsx";
import MonthDetailsModal from "../components/MonthDetailsModal.jsx";
import { TimelineDragDrop } from "../components/TimelineDragDrop.jsx";
import { assignTripToMonth, getTimeline, getTrips, propagateTimelineYear } from "../services/sheetsClient.js";
import { timelineKey } from "../utils/timelineUtils.js";
import "./TimelineView.css";

export default function TimelineView() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [timeline, setTimeline] = useState([]);
  const [trips, setTrips] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [extraYears, setExtraYears] = useState([]);
  const [yearInput, setYearInput] = useState(String(now.getFullYear() + 2));
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [viewTrip, setViewTrip] = useState(null);
  const [modalMonth, setModalMonth] = useState(null);
  const [moving, setMoving] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getTimeline(), getTrips()]).then(([months, allTrips]) => {
      if (!active) return;
      setTimeline(months);
      setTrips(allTrips);
      setLoaded(true);
    }).catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [now]);

  const locked = !loaded || loading || moving || propagating;
  const currentYear = selectedMonth.year;

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
      await refreshData();
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function chooseMonth(month) {
    if (locked) return false;
    setSelectedMonth(month);
    setError("");
    return true;
  }

  function addYear(event) {
    event.preventDefault();
    const year = Number(yearInput);
    if (!Number.isInteger(year) || year < 1 || year > 9999) return;
    setExtraYears((current) => [...new Set([...current, year])]);
    chooseMonth({ year, month: 1 });
  }

  async function propagateYear() {
    if (locked || currentYear >= 9999) return;
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

  return (
    <main className="timeline-page">
      <header className="timeline-page-header">
        <div><p className="trip-eyebrow">Travel calendar</p><h1>Timeline</h1></div>
        <div className="timeline-header-actions">
          <Link to="/prioritize" aria-disabled={moving || propagating} tabIndex={moving || propagating ? -1 : 0} onClick={(event) => { if (moving || propagating) event.preventDefault(); }}><ListOrdered size={16} aria-hidden="true" />Prioritize Trips</Link>
          <button type="button" disabled={moving || propagating} onClick={() => navigate("/")}><ArrowLeft size={16} aria-hidden="true" />Back to Trips</button>
        </div>
      </header>
      {loading && <p role="status">Loading timeline...</p>}
      {error && <div className="timeline-error" role="alert"><p>{error}</p>{!loaded && !loading && <button type="button" onClick={retryLoad}>Retry loading</button>}</div>}
      <form className="timeline-year-form" onSubmit={addYear}><label>Year<input type="number" min="1" max="9999" step="1" value={yearInput} onChange={(event) => setYearInput(event.target.value)} required /></label><button type="submit" disabled={locked}>Add Year</button></form>
      <button type="button" className="timeline-propagate" disabled={locked || currentYear >= 9999} title={`${currentYear} to ${currentYear + 1}`} onClick={propagateYear}>{propagating ? "Propagating..." : "Propagate Month Colors & Notes to Next Year"}</button>
      {notice && <p className="timeline-operation-status" role="status">{notice}</p>}
      <TimelineDragDrop disabled={locked} onBusyChange={setMoving} onMove={async (tripId, year, month) => {
        await assignTripToMonth(tripId, year, month);
        await refreshData();
      }}>
        <TimelineGrid timeline={timeline} trips={trips} selectedMonth={selectedMonth} extraYears={extraYears} onMonthSelect={(month) => { if (chooseMonth(month)) setModalMonth(month); }} onTripClick={(trip, month) => { if (chooseMonth(month)) setViewTrip(trip); }} />
      </TimelineDragDrop>
      {viewTrip && <ViewTripModal trip={viewTrip} onClose={() => setViewTrip(null)} />}
      {modalMonth && <MonthDetailsModal key={timelineKey(modalMonth.year, modalMonth.month)} month={{ ...timeline.find((entry) => timelineKey(entry.year, entry.month) === timelineKey(modalMonth.year, modalMonth.month)), ...modalMonth }} tripList={trips} refreshVersion={timeline} onSave={refreshData} onTripsChange={refreshData} onClose={() => setModalMonth(null)} onTripClick={(trip) => { setModalMonth(null); setViewTrip(trip); }} />}
    </main>
  );
}