import { TimelineDragTrip } from "./TimelineDragDrop.jsx";
import "./TripMarker.css";

function formatDate(value) {
  if (value == null || value === "") return "";
  const dateText = String(value).trim();
  const dateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText);
  if (dateOnly) return `${Number(dateOnly[2])}/${Number(dateOnly[3])}/${dateOnly[1]}`;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

export default function TripMarker({ trip, year, month, monthName, className, onClick }) {
  const title = String(trip.destination || "Untitled trip");
  const location = String(trip.location || "").trim();
  const startDate = formatDate(trip.startDate);
  const endDate = formatDate(trip.endDate);
  const dates = startDate && endDate ? `${startDate} – ${endDate}` : startDate || endDate;
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1).toLowerCase()}`;
  const accessibleLabel = [title, location, dates, `${monthLabel} ${year}`].filter(Boolean).join(", ");

  return <TimelineDragTrip
    trip={trip}
    year={year}
    month={month}
    className={`${className} trip-marker`}
    title={accessibleLabel}
    aria-label={accessibleLabel}
    onClick={onClick}
  >
    <span className="trip-title">{title}</span>
    {location && <span className="trip-location">{location}</span>}
    {dates && <span className="trip-dates">{dates}</span>}
  </TimelineDragTrip>;
}