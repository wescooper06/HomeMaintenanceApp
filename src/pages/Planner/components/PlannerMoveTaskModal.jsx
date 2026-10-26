import { useRef, useState } from "react";

import { parseDateKey, SLOT_ORDER } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import CalendarWidget from "./CalendarWidget.jsx";
import { usePlanner } from "./usePlanner.js";
import usePlannerDialog from "./usePlannerDialog.js";

export default function PlannerMoveTaskModal({ task }) {
  const { actions } = usePlanner();
  const ref = useRef(null);
  const [slot, setSlot] = useState(task.timeSlot);
  usePlannerDialog(ref, actions.closeMove, "button[aria-pressed='true'], button[aria-pressed]");
  const select = (date) => {
    if (actions.moveTaskToDate(task.id, parseDateKey(date), slot)) actions.closeMove();
    else actions.setStatus("Unable to move that Planner task. Please try again.");
  };
  return (
    <div className={styles["planner-move-overlay"]} onClick={(event) => { if (event.target === event.currentTarget) actions.closeMove(); }}>
      <section ref={ref} className={styles["planner-move-modal"]} role="dialog" aria-modal="true" aria-labelledby="planner-move-title" aria-describedby="planner-move-task-title" tabIndex={-1}>
        <header className={styles["planner-move-header"]}>
          <h2 id="planner-move-title">Move Task</h2>
          <button type="button" className={styles["planner-move-close"]} aria-label="Close" title="Close" onClick={actions.closeMove}>{"\u00d7"}</button>
        </header>
        <p id="planner-move-task-title">{task.title || "Untitled Task"}</p>
        <label>
          Time slot
          <select value={slot} onChange={(event) => setSlot(event.target.value)}>
            {SLOT_ORDER.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </label>
        <CalendarWidget initialDate={task.date} onSelectDate={select} />
      </section>
    </div>
  );
}
