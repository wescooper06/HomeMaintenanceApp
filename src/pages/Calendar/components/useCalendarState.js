import { createContext, useContext, useMemo } from "react";
import {
  buildCalendarGrid,
  getCalendarEventById,
  getPlannerEventIdSet,
} from "../../../services/calendarService.js";

export const CalendarContext = createContext(null);

export default function useCalendarState() {
  const context = useContext(CalendarContext);
  if (!context) throw new Error("Calendar components must be mounted inside CalendarProvider.");
  const { snapshot, actions } = context;
  const days = useMemo(() => buildCalendarGrid(
    snapshot.currentMonth,
    snapshot.events,
    getPlannerEventIdSet(snapshot.planner),
  ), [snapshot.currentMonth, snapshot.events, snapshot.planner]);
  const selectedEvent = getCalendarEventById(snapshot.events, snapshot.selectedEventId, snapshot.selectedEventDateKey);
  return { snapshot, actions, days, selectedEvent };
}
