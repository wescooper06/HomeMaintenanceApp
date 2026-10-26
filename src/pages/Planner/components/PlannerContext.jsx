import { useEffect, useState } from "react";

import { createPlannerController } from "../../../services/plannerService.js";

import { PlannerContext } from "./usePlanner.js";

export default function PlannerProvider({ children }) {
  const [controller] = useState(createPlannerController);
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.actions.initialize().catch((error) => console.error("Unable to initialize React Planner", error));
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);
  return <PlannerContext.Provider value={{ snapshot, actions: controller.actions }}>{children}</PlannerContext.Provider>;
}
