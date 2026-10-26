import { useEffect, useState } from "react";

import { createCalendarController } from "../../../services/calendarService.js";

import { CalendarContext } from "./useCalendarState.js";

export default function CalendarProvider({ children, controller: providedController }) {
  const [controller] = useState(() => providedController || createCalendarController());
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.actions.initialize();
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);
  return <CalendarContext.Provider value={{ snapshot, actions: controller.actions }}>{children}</CalendarContext.Provider>;
}
