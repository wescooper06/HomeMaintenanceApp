import { Route, Routes } from "react-router-dom";

import NewTrip from "./NewTrip.jsx";
import PrioritizeTrips from "./PrioritizeTrips.jsx";
import TimelineView from "./TimelineView.jsx";
import TripDetails from "./TripDetails.jsx";
import TripsHome from "./TripsHome.jsx";

export default function TripsApplication({ home = false }) {
  if (home) return <TripsHome />;

  return (
    <Routes>
      <Route path="/" element={<TripsHome />} />
      <Route path="/index.html" element={<TripsHome />} />
      <Route path="/prioritize" element={<PrioritizeTrips />} />
      <Route path="/timeline" element={<TimelineView />} />
      <Route path="/new" element={<NewTrip />} />
      <Route path="/:tripId" element={<TripDetails />} />
    </Routes>
  );
}
