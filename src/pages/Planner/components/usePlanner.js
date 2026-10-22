import { createContext, useContext } from "react";

export const PlannerContext = createContext(null);

export function usePlanner() {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("Planner components must be rendered inside PlannerProvider.");
  return planner;
}
