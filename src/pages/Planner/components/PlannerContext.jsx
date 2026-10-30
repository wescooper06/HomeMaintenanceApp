import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { validMealDate } from "../../../services/mealPlannerService.js";
import { createPlannerController } from "../../../services/plannerService.js";

import { PlannerContext } from "./usePlanner.js";

export default function PlannerProvider({ children }) {
  const [controller] = useState(createPlannerController);
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  const { search } = useLocation();
  const requestedDate = new URLSearchParams(search).get("mealDate");
  const appliedDate = useRef(null);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.actions.initialize().catch((error) => console.error("Unable to initialize React Planner", error));
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);
  useEffect(() => {
    if (!snapshot.loading && snapshot.planner && requestedDate && validMealDate(requestedDate)
      && appliedDate.current !== requestedDate) {
      appliedDate.current = requestedDate;
      controller.actions.jumpPlannerToDate(requestedDate);
    }
  }, [controller, snapshot.loading, snapshot.planner, requestedDate]);
  return <PlannerContext.Provider value={{ snapshot, actions: controller.actions }}>{children}</PlannerContext.Provider>;
}
