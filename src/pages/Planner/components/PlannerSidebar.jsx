import styles from "../PlannerPage.module.css";
import { useState } from "react";
import { usePlanner } from "./usePlanner.js";
import usePlannerDrag from "./usePlannerDrag.js";
import ProjectCard, { RepeatableCard } from "./ProjectCard.jsx";
import ParkingLot from "./ParkingLot.jsx";
import { MiniCalendar } from "./CalendarWidget.jsx";

export default function PlannerSidebar() {
  const { snapshot, actions } = usePlanner();
  const drag = usePlannerDrag();
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("mon");
  const [slot, setSlot] = useState("morning");
  const renderProjects = (side) => snapshot.curatedTasks.map((task, index) => ({ task, index }))
    .filter(({ index }) => index % 2 === (side === "left" ? 0 : 1))
    .map(({ task, index }) => <ProjectCard key={task.taskId} task={task} index={0} globalIndex={index} />);
  const placement = (element, y) => {
    const cards = [...element.querySelectorAll("[data-curated-global-index]")]
      .filter((card) => Number(card.dataset.curatedGlobalIndex) !== drag.drag.index);
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (y <= rect.top + rect.height / 2) return { index: Number(card.dataset.curatedGlobalIndex), id: card.dataset.taskId };
    }
    const last = cards[cards.length - 1];
    return { index: last ? Number(last.dataset.curatedGlobalIndex) + 1 : null, id: last?.dataset.taskId || "" };
  };
  const dropHandlers = (side) => ({
    onDragOver(event) {
      if (drag.drag?.kind !== "curated-reorder") return;
      const target = placement(event.currentTarget, event.clientY);
      drag.target(event, `curated:${side}:${target.id}`);
    },
    onDragLeave: drag.leave,
    onDrop(event) {
      if (drag.drag?.kind !== "curated-reorder") return;
      event.preventDefault();
      event.stopPropagation();
      const target = placement(event.currentTarget, event.clientY);
      actions.reorderCuratedByPlacement(drag.drag.index, target.index, side);
      drag.end();
    },
  });
  const add = () => {
    if (actions.addAdHocTask(title, day, slot)) { setTitle(""); setDay("mon"); setSlot("morning"); }
  };
  return (
    <section className={styles["planner-top-panels"]} aria-label="Task assignment panels">
      <div id="planner-top-columns">
        <section id="curated-left" className={`${styles["planner-pool"]} ${styles["curated-drop-zone"]} ${drag.dropTarget.startsWith("curated:left:") ? styles["drag-over"] : ""}`} aria-label="Projects left column" {...dropHandlers("left")}>
          <h2>Projects</h2>
          <div id="curated-warning" style={{ display: snapshot.warning ? "block" : "none" }}>{snapshot.warning}</div>
          <div id="plannerTaskPoolLeft" className={styles["planner-task-pool"]} data-curated-column="left" aria-live="polite">
            {snapshot.curatedTasks.length ? renderProjects("left") : <div className={styles["pool-empty"]}>No curated tasks found. Add tasks in Task Manager first.</div>}
          </div>
        </section>

        <section id="curated-middle" className={`${styles["planner-pool"]} ${styles["curated-drop-zone"]} ${drag.dropTarget.startsWith("curated:middle:") ? styles["drag-over"] : ""}`} aria-label="Projects middle column" {...dropHandlers("middle")}>
          <h2>Projects</h2>
          <div id="plannerTaskPoolMiddle" className={styles["planner-task-pool"]} data-curated-column="middle" aria-live="polite">{renderProjects("middle")}</div>
        </section>

        <section id="adhoc-right" className={styles["planner-adhoc-column"]} aria-label="Add ad-hoc task panel">
          <h2>Add Ad-Hoc Task</h2>
          <div className={styles["planner-adhoc-panel"]}>
            <div className={styles["adhoc-form"]}>
              <label htmlFor="adhocTaskTitle">Title</label>
              <input id="adhocTaskTitle" className={styles["planner-control-field"]} type="text" placeholder="Enter task title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <label htmlFor="adhocTaskDay">Day</label>
              <select id="adhocTaskDay" className={styles["planner-control-field"]} value={day} onChange={(event) => setDay(event.target.value)}>
                <option value="mon">Monday</option>
                <option value="tue">Tuesday</option>
                <option value="wed">Wednesday</option>
                <option value="thu">Thursday</option>
                <option value="fri">Friday</option>
                <option value="sat">Saturday</option>
                <option value="sun">Sunday</option>
              </select>
              <label htmlFor="adhocTaskSlot">Time</label>
              <select id="adhocTaskSlot" className={styles["planner-control-field"]} value={slot} onChange={(event) => setSlot(event.target.value)}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
              <div className={styles["adhoc-actions"]}>
                <button id="adhocTaskAddBtn" type="button" className={styles.primary} disabled={snapshot.loading} onClick={add}>Add</button>
              </div>
            </div>
          </div>
        </section>

        <section id="repeatable-right" className={styles["planner-repeatable-column"]} aria-label="Repeatable tasks panel">
          <h2>Repeatable Tasks</h2>
          <div id="repeatable-tasks-panel" className={styles["repeatable-task-panel"]} aria-live="polite">
            {snapshot.repeatableTasks.length ? snapshot.repeatableTasks.map((task) => <RepeatableCard key={task.projectId} task={task} />)
              : <div className={styles["pool-empty"]}>No repeatable tasks found.</div>}
          </div>
        </section>
        <section id="parking-lot-column" className={styles["planner-parking-column"]} aria-label="Task parking lot panel">
          <div id="parking-lot-host">{!snapshot.loading && <ParkingLot />}</div>
        </section>
        <section id="mini-calendar-column" className={styles["planner-calendar-column"]} aria-label="Mini calendar panel">
          <h2>Task Calendar</h2>
          <div id="mini-calendar">{!snapshot.loading && <MiniCalendar />}</div>
        </section>
      </div>
    </section>
  );
}
