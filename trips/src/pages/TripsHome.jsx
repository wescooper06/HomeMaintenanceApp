// Trips Home Page
// Displays active trips from the Trips sheet.
// Uses getTrips() from sheetsClient.js.
// Allows opening a trip and adding a new one.
import { useEffect, useRef, useState } from "react";
import { deleteTrip, getTrips } from "../services/sheetsClient";
import { useNavigate } from "react-router-dom";
import CaptureTrip from "../components/CaptureTrip.jsx";
import ExpandedTripModal from "../components/ExpandedTripModal.jsx";
import ViewTripModal from "../components/ViewTripModal.jsx";
import { tripPriority } from "../utils/priorityUtils.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUSES = ["Idea", "Shortlisted", "Active", "Paused", "Deferred"];
const STATUS_PRIORITY = ["Active", "Shortlisted", "Idea", "Paused", "Deferred"];
const SAVED_FILTERS_KEY = "tripsSavedFilters";
const SORT_MODES = ["newest", "oldest", "alphabetical", "status", "timeline", "priority"];

function readSavedFilters() {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    const filters = new Map();
    stored.forEach((filter) => {
      if (!filter || typeof filter.name !== "string" || !filter.name.trim()) return;
      const name = filter.name.trim();
      filters.set(name, {
        name,
        activeStatuses: Array.isArray(filter.activeStatuses) ? [...new Set(filter.activeStatuses.filter((status) => STATUSES.includes(status)))] : [],
        searchQuery: typeof filter.searchQuery === "string" ? filter.searchQuery : "",
        sortMode: SORT_MODES.includes(filter.sortMode) ? filter.sortMode : "newest",
      });
    });
    return [...filters.values()];
  } catch {
    return [];
  }
}

function tripStatus(trip) {
  return String(trip.status || "Idea").trim().toLowerCase();
}

function timelineOrder(trip) {
  const month = Number(trip.timelineMonth);
  const year = Number(trip.timelineYear);
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year > 0
    ? year * 12 + month
    : Infinity;
}

export default function TripsHome() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [selectedTripForView, setSelectedTripForView] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [activeStatuses, setActiveStatuses] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("newest");
  const [savedFilters, setSavedFilters] = useState(readSavedFilters);
  const [selectedSavedFilter, setSelectedSavedFilter] = useState(null);
  const [filterError, setFilterError] = useState("");
  const [showSaveFilterPrompt, setShowSaveFilterPrompt] = useState(false);
  const [filterName, setFilterName] = useState("");
  const saveFilterDialog = useRef(null);

  const navigate = useNavigate();

  useEffect(() => {
    if (!showSaveFilterPrompt) return;
    const dialog = saveFilterDialog.current;
    const bodyOverflow = document.body.style.overflow;
    dialog.showModal();
    dialog.querySelector("input").focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
    };
  }, [showSaveFilterPrompt]);

  function toggleStatus(status) {
    setSelectedSavedFilter(null);
    setActiveStatuses((current) => current.includes(status)
      ? current.filter((item) => item !== status)
      : [...current, status]);
  }

  function saveCurrentFilter(event) {
    event.preventDefault();
    const name = filterName.trim();
    if (!name) {
      setFilterError("Enter a filter name.");
      return;
    }
    const configuration = { name, activeStatuses: [...activeStatuses], searchQuery, sortMode };
    try {
      const existing = readSavedFilters().filter((filter) => filter.name !== name);
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify([...existing, configuration]));
      setSavedFilters(readSavedFilters());
      setSelectedSavedFilter(name);
      setFilterError("");
      setShowSaveFilterPrompt(false);
    } catch {
      setFilterError("Unable to save filters. Browser storage may be unavailable or full.");
    }
  }

  function selectSavedFilter(value) {
    if (value === "clear-saved") {
      try {
        localStorage.removeItem(SAVED_FILTERS_KEY);
        setSavedFilters([]);
        setSelectedSavedFilter(null);
        setFilterError("");
      } catch {
        setFilterError("Unable to clear saved filters. Browser storage may be unavailable.");
      }
      return;
    }
    const filter = savedFilters.find((item) => `filter:${item.name}` === value);
    if (!filter) {
      setSelectedSavedFilter(null);
      return;
    }
    setActiveStatuses([...filter.activeStatuses]);
    setSearchQuery(filter.searchQuery);
    setSortMode(filter.sortMode);
    setSelectedSavedFilter(filter.name);
    setFilterError("");
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleTrips = trips.map((trip, index) => ({ trip, index })).filter(({ trip }) => {
    const matchesStatus = !activeStatuses.length || activeStatuses.some((status) => status.toLowerCase() === tripStatus(trip));
    const matchesQuery = !query || [trip.destination, trip.notes, trip.tags].some((value) => String(value ?? "").toLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  }).sort((first, second) => {
    if (sortMode === "newest") return second.index - first.index;
    if (sortMode === "oldest") return first.index - second.index;
    let result = 0;
    if (sortMode === "alphabetical") {
      result = String(first.trip.destination || "").localeCompare(String(second.trip.destination || ""), undefined, { sensitivity: "base" });
    } else if (sortMode === "status") {
      const priority = (trip) => {
        const rank = STATUS_PRIORITY.findIndex((status) => status.toLowerCase() === tripStatus(trip));
        return rank < 0 ? STATUS_PRIORITY.length : rank;
      };
      result = priority(first.trip) - priority(second.trip);
    } else if (sortMode === "timeline") {
      result = timelineOrder(first.trip) - timelineOrder(second.trip);
    } else if (sortMode === "priority") {
      result = (tripPriority(first.trip) ?? Infinity) - (tripPriority(second.trip) ?? Infinity);
      if (!result) return second.index - first.index;
    }
    return result || first.index - second.index;
  }).map(({ trip }) => trip);

  function closeCaptureModal(savedTrip) {
    if (savedTrip) setTrips((current) => [...current, savedTrip]);
    setShowCaptureModal(false);
  }

  function updateSavedTrip(savedTrip) {
    setTrips((current) => current.map((trip) => trip.tripId === savedTrip.tripId ? { ...trip, ...savedTrip } : trip));
  }

  async function removeTrip(trip) {
    if (deletingTripId !== null || !window.confirm("Are you sure you want to delete this trip?")) return;
    setDeletingTripId(trip.tripId);
    setActionError("");
    let deleted = false;
    try {
      await deleteTrip(trip.id ?? trip.tripId);
      deleted = true;
      setTrips((current) => current.filter((item) => item.tripId !== trip.tripId));
      setTrips(await getTrips());
    } catch (deleteError) {
      setActionError(deleted ? `Trip deleted, but refreshing failed: ${deleteError.message}` : `Unable to delete trip: ${deleteError.message}`);
    } finally {
      setDeletingTripId(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await getTrips();
        setTrips(data)
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p>Loading trips...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <main className="trips-backlog">
      <header className="trips-backlog-header">
        <div><h1>Travel Backlog</h1><p aria-live="polite">{visibleTrips.length} of {trips.length} {trips.length === 1 ? "idea" : "ideas"}</p></div>
        <div className="trips-header-actions">
          <button type="button" disabled={deletingTripId !== null} onClick={() => setShowCaptureModal(true)}>+ New Trip</button>
          <button type="button" disabled={deletingTripId !== null} onClick={() => navigate("/prioritize")}>Prioritize Trips</button>
        </div>
      </header>
      <section className="trips-filter-toolbar" aria-label="Trip filters">
        <div className="trip-status-filters" role="group" aria-label="Filter by status">
          {STATUSES.map((status) => <button key={status} type="button" className="trip-filter-chip" data-status={status} aria-pressed={activeStatuses.includes(status)} onClick={() => toggleStatus(status)}>{status}</button>)}
          {activeStatuses.length > 0 && <button type="button" className="trip-clear-filters" onClick={() => { setActiveStatuses([]); setSearchQuery(""); setSelectedSavedFilter(null); }}>Clear Filters</button>}
        </div>
        <div className="trip-filter-inputs">
          <label>Search<input type="search" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSelectedSavedFilter(null); }} placeholder="Destination, notes, or tags" /></label>
          <label>Sort<select aria-label="Sort" value={sortMode} onChange={(event) => { setSortMode(event.target.value); setSelectedSavedFilter(null); }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="alphabetical">Alphabetical (A → Z)</option>
            <option value="status">Status priority (Active → Shortlisted → Idea → Paused → Deferred)</option>
            <option value="timeline">Timeline order</option>
            <option value="priority">Priority order</option>
          </select></label>
          <label>Saved Filters<select aria-label="Saved Filters" value={selectedSavedFilter === null ? "" : `filter:${selectedSavedFilter}`} onChange={(event) => selectSavedFilter(event.target.value)}>
            <option value="">Select a saved filter</option>
            {savedFilters.map((filter) => <option key={filter.name} value={`filter:${filter.name}`}>{filter.name}</option>)}
            <option value="clear-saved" disabled={!savedFilters.length}>Clear Saved Filters</option>
          </select></label>
        </div>
        <div className="trip-filter-actions"><button type="button" className="trip-clear-filters" onClick={() => { setFilterName(selectedSavedFilter || ""); setFilterError(""); setShowSaveFilterPrompt(true); }}>Save Current Filter</button></div>
        {filterError && !showSaveFilterPrompt && <p className="trip-action-error" role="alert">{filterError}</p>}
      </section>
      {showSaveFilterPrompt && <dialog ref={saveFilterDialog} className="trip-save-filter-dialog" aria-labelledby="save-filter-title" onCancel={() => { setShowSaveFilterPrompt(false); setFilterError(""); }}>
        <form onSubmit={saveCurrentFilter}>
          <h2 id="save-filter-title">Save Current Filter</h2>
          <label>Filter name<input value={filterName} onChange={(event) => setFilterName(event.target.value)} required /></label>
          {filterError && <p className="trip-action-error" role="alert">{filterError}</p>}
          <div className="trip-save-filter-actions">
            <button type="submit">Save Filter</button>
            <button type="button" onClick={() => { setShowSaveFilterPrompt(false); setFilterError(""); }}>Cancel</button>
          </div>
        </form>
      </dialog>}
      {actionError && <p className="trip-action-error" role="alert">{actionError}</p>}
      <ul className="trip-cards">
        {visibleTrips.map((trip) => (
          <li key={trip.tripId} className="trip-card">
            <div className="trip-card-heading">
              <button className="trip-destination" type="button" onClick={() => navigate(`/${trip.tripId}`)}>{trip.destination}</button>
              <span className={`trip-status trip-status-${trip.status.toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span>
            </div>
            <div className="trip-card-summary">
              <span className="trip-type">{trip.tripType || "Unspecified"}</span>
              {tripPriority(trip) !== null && <span className="trip-priority-badge" aria-label={`Priority ${tripPriority(trip)}`}>#{tripPriority(trip)}</span>}
              <span>{[MONTHS[Number(trip.timelineMonth) - 1] || trip.timelineMonth, trip.timelineYear].filter(Boolean).join(" ")}</span>
            </div>
            <p className="trip-card-notes">{trip.notes || "No notes yet."}</p>
            <div className="trip-card-actions">
              <button type="button" className="trip-edit" disabled={deletingTripId !== null} onClick={() => navigate(`/prioritize?tripId=${encodeURIComponent(trip.tripId)}`)}>Prioritize</button>
              <button type="button" className="trip-edit" disabled={deletingTripId !== null} onClick={() => { setSelectedTripForView(trip); setShowViewModal(true); }}>View</button>
              <button type="button" className="trip-edit" disabled={deletingTripId !== null} onClick={() => { setSelectedTrip(trip); setShowExpandedModal(true); }}>Edit</button>
              <button type="button" className="trip-edit trip-delete" disabled={deletingTripId !== null} onClick={() => removeTrip(trip)}>{deletingTripId === trip.tripId ? "Deleting..." : "Delete"}</button>
            </div>
          </li>
        ))}
      </ul>
      {!trips.length && <p className="trips-empty">No trip ideas yet.</p>}
      {trips.length > 0 && !visibleTrips.length && <p className="trips-empty" role="status">No trips match these filters.</p>}
      {showCaptureModal && <CaptureTrip onClose={closeCaptureModal} />}
      {showExpandedModal && <ExpandedTripModal trip={selectedTrip} onClose={() => setShowExpandedModal(false)} onSave={updateSavedTrip} />}
      {showViewModal && <ViewTripModal trip={selectedTripForView} onClose={() => setShowViewModal(false)} />}
    </main>
  );
}
