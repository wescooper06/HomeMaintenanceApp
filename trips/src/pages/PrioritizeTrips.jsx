import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, CalendarDays, GripVertical } from "lucide-react";
import TripDetailsPanel from "../components/TripDetailsPanel.jsx";
import PriorityTimelinePreview from "../components/PriorityTimelinePreview.jsx";
import { ensureTripPriorityColumn, getTrips, updateTrip } from "../services/sheetsClient.js";
import { prioritizedTrips, tripPriority } from "../utils/priorityUtils.js";
import { resolveLinkTitle } from "../utils/resolveLinkTitle.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function RankedRow({ trip, rank, selected, disabled, onSelect }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: trip.tripId, disabled });
  const windowLabel = [MONTHS[Number(trip.timelineMonth) - 1] || trip.timelineMonth, trip.timelineYear].filter(Boolean).join(" ");
  return (
    <tr ref={setNodeRef} data-selected={selected} className={isDragging ? "priority-row-dragging" : ""} style={{ transform: CSS.Transform.toString(transform), transition }} onClick={onSelect}>
      <td className="priority-rank-cell">
        <button ref={setActivatorNodeRef} type="button" className="priority-drag-handle" disabled={disabled} title={`Drag to rank ${trip.destination}`} aria-label={`Move ${trip.destination}`} {...attributes} {...listeners}><GripVertical size={16} aria-hidden="true" /></button>
        <span>{rank}</span>
      </td>
      <td><button className="priority-select-trip" type="button" aria-pressed={selected} onClick={onSelect}>{trip.destination}</button></td>
      <td>{trip.tripType || "Not set"}</td>
      <td>{windowLabel || "Not set"}</td>
      <td>{trip.seasonality || trip.considerations || "Not set"}</td>
      <td><span className={`trip-status trip-status-${String(trip.status || "Idea").toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span></td>
      <td>{trip.considerations || "None"}</td>
    </tr>
  );
}

export default function PrioritizeTrips() {
  const navigate = useNavigate();
  const [parameters] = useSearchParams();
  const requestedTripId = parameters.get("tripId");
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [timelineSelectedTrip, setTimelineSelectedTrip] = useState(null);
  const rowsRef = useRef([]);
  const timer = useRef(null);
  const pendingOrder = useRef(null);
  const writing = useRef(false);
  const mounted = useRef(false);
  const page = useRef(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    function resize() {
      let height = window.innerHeight;
      try {
        const bounds = window.frameElement?.getBoundingClientRect();
        if (bounds) height = Math.max(0, Math.min(bounds.bottom, window.parent.innerHeight) - Math.max(bounds.top, 0));
      } catch {
        height = window.innerHeight;
      }
      page.current.style.height = `${height}px`;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    async function load() {
      try {
        await ensureTripPriorityColumn();
        if (!active) return;
        let trips = await getTrips();
        if (!active) return;
        const ordered = prioritizedTrips(trips);
        const requested = trips.find((trip) => trip.tripId === requestedTripId);
        if (requestedTripId && !requested) throw new Error("The selected trip no longer exists.");
        if (requested && tripPriority(requested) === null) ordered.push(requested);
        const changed = ordered.filter((trip, index) => tripPriority(trip) !== index + 1);
        if (changed.length) {
          if (active) setSyncStatus("saving");
          for (const trip of changed) await updateTrip(trip.tripId, { priority: ordered.indexOf(trip) + 1 });
          trips = await getTrips();
        }
        if (!active) return;
        const confirmed = prioritizedTrips(trips);
        rowsRef.current = confirmed;
        setRows(confirmed);
        setSelectedId(requested?.tripId || confirmed[0]?.tripId || null);
        setSyncStatus("ready");
        setError("");
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          setSyncStatus("error");
        }
      }
    }
    load();
    return () => {
      active = false;
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, [requestedTripId, reload]);

  async function writeOrder() {
    if (writing.current || !pendingOrder.current) return;
    const ordered = pendingOrder.current;
    pendingOrder.current = null;
    writing.current = true;
    setSyncStatus("saving");
    setError("");
    try {
      for (const [index, trip] of ordered.entries()) await updateTrip(trip.tripId, { priority: index + 1 });
      const confirmed = prioritizedTrips(await getTrips());
      if (!mounted.current) return;
      rowsRef.current = confirmed;
      setRows(confirmed);
      setSyncStatus("ready");
    } catch (saveError) {
      if (mounted.current) {
        setError(`Ranking save failed; some rows may have updated. Retry to finish syncing. ${saveError.message}`);
        setSyncStatus("error");
      }
    } finally {
      writing.current = false;
    }
  }

  function scheduleOrder(ordered) {
    window.clearTimeout(timer.current);
    pendingOrder.current = ordered;
    setSyncStatus("pending");
    setError("");
    timer.current = window.setTimeout(writeOrder, 600);
  }

  function finishDrag({ active, over }) {
    if (!over || active.id === over.id) {
      if (pendingOrder.current) scheduleOrder(pendingOrder.current);
      return;
    }
    const fromIndex = rowsRef.current.findIndex((trip) => trip.tripId === active.id);
    const toIndex = rowsRef.current.findIndex((trip) => trip.tripId === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const ordered = arrayMove(rowsRef.current, fromIndex, toIndex);
    rowsRef.current = ordered;
    setRows(ordered);
    scheduleOrder(ordered);
  }

  function retry() {
    if (rowsRef.current.length) scheduleOrder(rowsRef.current);
    else {
      setSyncStatus("loading");
      setReload((current) => current + 1);
    }
  }

  const selectedTrip = rows.find((trip) => trip.tripId === selectedId) || (timelineSelectedTrip?.tripId === selectedId ? timelineSelectedTrip : null) || rows[0];
  const locked = syncStatus === "loading" || syncStatus === "saving" || syncStatus === "error";

  return (
    <main ref={page} className="prioritize-page">
      <header className="prioritize-header">
        <div><p className="trip-eyebrow">Travel priorities</p><h1>Prioritize Trips</h1></div>
        <div className="prioritize-header-actions">
          <span role="status">{syncStatus === "loading" ? "Loading..." : syncStatus === "pending" ? "Changes pending" : syncStatus === "saving" ? "Saving..." : syncStatus === "ready" ? "Synced" : "Sync failed"}</span>
          <Link to="/timeline" aria-disabled={syncStatus !== "ready"} tabIndex={syncStatus === "ready" ? 0 : -1} onClick={(event) => { if (syncStatus !== "ready") event.preventDefault(); }}><CalendarDays size={16} aria-hidden="true" />Timeline</Link>
          <button type="button" disabled={syncStatus !== "ready"} onClick={() => navigate("/")}><ArrowLeft size={16} aria-hidden="true" />Back to Trips</button>
        </div>
      </header>
      {error && <div className="priority-error" role="alert"><p>{error}</p><button type="button" onClick={retry}>Retry</button></div>}
      <div className="prioritize-layout">
        <section className="priority-list" aria-label="Ranked trips">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => { window.clearTimeout(timer.current); setSelectedId(active.id); }} onDragEnd={finishDrag} onDragCancel={() => { if (pendingOrder.current) scheduleOrder(pendingOrder.current); }}>
            <div className="priority-table-scroll">
              <table className="priority-table">
                <thead><tr><th>Rank</th><th>Destination</th><th>Trip Type</th><th>Target Window</th><th>Feasibility</th><th>Status</th><th>Notes / Constraints</th></tr></thead>
                <SortableContext items={rows.map((trip) => trip.tripId)} strategy={verticalListSortingStrategy}>
                  <tbody>{rows.map((trip, index) => <RankedRow key={trip.tripId} trip={trip} rank={index + 1} selected={trip.tripId === selectedTrip?.tripId} disabled={locked} onSelect={() => setSelectedId(trip.tripId)} />)}</tbody>
                </SortableContext>
              </table>
            </div>
          </DndContext>
          {syncStatus === "ready" && !rows.length && <p className="priority-empty">No prioritized trips.</p>}
        </section>
        <aside className="priority-details" aria-label="Selected trip details">
          {selectedTrip ? <TripDetailsPanel key={selectedTrip.tripId} trip={selectedTrip} titleId="priority-trip-title" resolveTitle={resolveLinkTitle} /> : <p className="priority-empty">No trip selected.</p>}
        </aside>
      </div>
      <PriorityTimelinePreview trips={rows} onSelectTrip={(tripId, trip) => { setSelectedId(tripId); setTimelineSelectedTrip(trip || null); }} onTimelineRefresh={(loadedTrips) => {
        const freshTrips = new Map(loadedTrips.map((trip) => [trip.tripId, trip]));
        const refreshWindow = (trip) => {
          const fresh = freshTrips.get(trip.tripId);
          return fresh ? { ...trip, timelineMonth: fresh.timelineMonth, timelineYear: fresh.timelineYear } : trip;
        };
        rowsRef.current = rowsRef.current.map(refreshWindow);
        setRows((current) => current.map(refreshWindow));
        setTimelineSelectedTrip((current) => current ? refreshWindow(current) : current);
      }} />
    </main>
  );
}