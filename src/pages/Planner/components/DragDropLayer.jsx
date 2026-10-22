import { useEffect } from "react";
import { usePlanner } from "./usePlanner.js";
import "../PlannerPage.module.css";

export default function DragDropLayer({ children }) {
  const { actions } = usePlanner();
  useEffect(() => {
    const clear = () => actions.setDrag(null);
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, [actions]);
  return <>{children}</>;
}
