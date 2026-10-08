import CaptureTrip from "./CaptureTrip.jsx";

export default function ExpandedTripModal({ trip, onClose, onSave }) {
  return <CaptureTrip key={trip.tripId} trip={trip} onClose={onClose} onSave={onSave} expanded />;
}