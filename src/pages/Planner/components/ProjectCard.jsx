import { useState } from "react";

import { cleanText, DAY_ORDER, getWeeklyTaskType, parseResourceLinkEntries, parseWeeklySourceId, SLOT_ORDER } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import Checklist from "./Checklist.jsx";
import InlinePlannerText from "./InlinePlannerText.jsx";
import { usePlanner } from "./usePlanner.js";
import usePlannerDrag from "./usePlannerDrag.js";


export default function ProjectCard({ task, index, globalIndex }) {
  const { actions } = usePlanner();
  const drag = usePlannerDrag();
  const [day, setDay] = useState("mon");
  const [slot, setSlot] = useState("morning");
  return (
    <article className={`${styles["pool-task-card"]} ${drag.drag?.kind === "curated-reorder" && drag.drag.taskId === task.taskId ? styles["is-dragging"] : ""} ${drag.dropTarget.startsWith("curated:") && drag.dropTarget.endsWith(`:${task.taskId}`) ? styles["is-drop-target"] : ""}`}
      data-curated-index={index} data-curated-global-index={globalIndex} data-task-id={task.taskId}>
      <div className={styles["pool-task-layout"]}>
        <span className={styles["pool-card-drag-handle"]} data-action="curated-drag-handle" draggable="true" title="Drag to reorder" aria-label="Drag to reorder"
          onDragStart={(event) => drag.start(event, { kind: "curated-reorder", taskId: task.taskId, index: globalIndex })} onDragEnd={drag.end}>{"\u22ee\u22ee"}</span>
        <div className={styles["pool-task-main"]}>
          <div className={styles["pool-task-head"]}>
            <div className={styles["pool-task-title"]}>{task.title}</div>
            <div className={styles["pool-task-head-actions"]}>
              <button type="button" className={`${styles["pool-icon-btn"]} ${styles["curated-only"]}`} data-action="remove-curated" title="Remove from Projects" aria-label="Remove from Projects"
                onClick={() => actions.removeTaskFromCurated(task.taskId)}>{"\ud83d\uddc2\ufe0f"}</button>
              <button type="button" className={`${styles["pool-icon-btn"]} ${styles.danger}`} data-action="remove-planner" title="Remove from Planner" aria-label="Remove from Planner"
                onClick={() => { actions.removeTaskFromCurated(task.taskId); actions.setStatus("Project removed from the Planner container. Weekly schedule entries were preserved."); }}>{"\ud83d\uddd1\ufe0f"}</button>
            </div>
            <span className={styles["pool-order-pill"]}>Order: {cleanText(task.order, "-")}</span>
          </div>
          <div className={styles["pool-task-meta"]}>ID: {task.projectId || "-"} | Source: {task.source}</div>
          <div>
            <label>Day <select aria-label={`Day for ${task.title}`} value={day} onChange={(event) => setDay(event.target.value)}>
              {DAY_ORDER.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select></label>
            <label>Time <select aria-label={`Time for ${task.title}`} value={slot} onChange={(event) => setSlot(event.target.value)}>
              {SLOT_ORDER.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <button type="button" onClick={() => actions.assignTask(task.taskId, day, slot)}>Continue / assign</button>
            <button type="button" disabled={task.checklistTemplate == null}
              title={task.checklistTemplate == null ? "Save a checklist for future tasks from a scheduled task first" : "Start a separate task with all checklist items unchecked"}
              onClick={() => actions.assignTask(task.taskId, day, slot, { fresh: true })}>Start fresh task</button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function RepeatableCard({ task }) {
  const { actions } = usePlanner();
  const drag = usePlannerDrag();
  return (
    <article className={styles["repeatable-task-card"]} data-repeatable-project-id={task.projectId}>
      <span className={styles["repeatable-task-handle"]} data-action="repeatable-drag-handle" draggable="true" title="Drag to weekly planner" aria-label="Drag repeatable task"
        onDragStart={(event) => drag.start(event, { kind: "repeatable-copy", projectId: task.projectId }, "copyMove")} onDragEnd={drag.end}>{"\u22ee\u22ee"}</span>
      <div className={styles["repeatable-task-title"]}>{task.title}</div>
      <button type="button" className={styles["repeatable-task-remove"]} data-action="remove-repeatable-master" title="Remove repeatable task" aria-label="Remove repeatable task"
        onClick={() => actions.removeRepeatableMaster(task.projectId)}>X</button>
    </article>
  );
}

export function WeeklyTaskCard({ task, day, slot }) {
  const { snapshot, actions } = usePlanner();
  const drag = usePlannerDrag();
  const type = getWeeklyTaskType(task);
  const project = actions.getTaskProject(task);
  const links = parseResourceLinkEntries(project?.resourceLinkEntries || project?.resourceLinks);
  const activeReminder = Boolean(task.reminder?.active && task.reminder.sendAt);
  const cardClass = type === "repeatable" ? styles["slot-task-repeatable"] : type === "adhoc" ? styles["slot-task-adhoc"] : styles["slot-task-curated"];
  return (
    <div className={`${styles["slot-task"]} ${cardClass} ${task.completed ? styles["is-complete"] : ""} ${type === "repeatable" && task.overridden ? styles["is-overridden"] : ""}`}
      data-date={task.date} data-slot={slot} data-task-id={task.id} data-task-type={type}>
      <div className={styles["slot-task-layout"]}>
        <span className={styles["slot-task-handle"]} data-action="weekly-drag-handle" draggable="true" title="Drag to move" aria-label="Drag to move"
          onDragStart={(event) => drag.start(event, { kind: "weekly-move", taskId: task.id, day, date: task.date, slot, weeklyTask: structuredClone(task) })} onDragEnd={drag.end}>{"\u22ee\u22ee"}</span>
        <div className={styles["slot-task-main"]}>
          <div className={styles["slot-task-header"]}>
            <InlinePlannerText as="div" className={styles["slot-task-title"]} text={cleanText(task.title, "Untitled Task")} label="Task title"
              onSave={(title) => actions.saveTaskTitleEdit(task.id, title)} />
            <div className={styles["slot-task-header-actions"]}>
              {type !== "adhoc" && links.length > 0 && <button type="button" className={styles["slot-task-links-button"]} data-action="open-resource-links" data-task-id={task.id}
                data-project-id={project?.projectId || task.projectId || parseWeeklySourceId(task)} aria-label="Open resource links" title="Resource Links"
                onClick={() => { void actions.openLinks(task.id).catch((error) => console.warn("Resource links failed", error)); }}>{"\ud83d\udd17"}</button>}
              <button type="button" className={`${styles["slot-task-reminder-button"]} ${activeReminder ? styles["is-active"] : ""}`} data-action="reminder-open"
                aria-label={activeReminder ? "Edit active reminder" : "Set reminder"} title={activeReminder ? "Reminder active" : "Send Reminder"}
                onClick={() => actions.openReminder(task.id)}>{activeReminder ? "\ud83d\udd14" : "\ud83d\udd15"}</button>
              {type === "repeatable" && task.parentRepeatableId && <button type="button" className={styles["slot-task-series-button"]} data-action="series-edit" aria-label="Edit recurrence series" title="Edit Series"
                onClick={() => actions.openSeries(task.id)}>{"\u21bb"}</button>}
              {type === "adhoc" && <button type="button" className={styles["slot-task-checklist-button"]} data-action="adhoc-checklist-open" aria-label="Open checklist" title="Checklist"
                onClick={() => actions.openChecklist(task.id, day, slot)}><span className={styles["material-symbols-rounded"]}>checklist</span></button>}
              <button type="button" className={styles["move-task-icon"]} data-action="task-move" aria-label="Move Task" title="Move Task" onClick={() => actions.openMove(task.id)}>
                <span className={`${styles["material-symbols-rounded"]} ${styles["slot-task-week-icon"]}`} aria-hidden="true">calendar_month</span>
              </button>
              <input type="checkbox" className={styles["slot-task-complete"]} data-action="task-complete-toggle" aria-label="Mark task complete" checked={Boolean(task.completed)}
                onChange={(event) => actions.setTaskCompleted(task.id, day, slot, event.target.checked)} />
              <button type="button" className={styles["slot-task-remove"]} data-action="remove" aria-label="Remove task" title="Remove task" onClick={() => actions.removeTask(task.id)}>X</button>
            </div>
          </div>
          <div className={styles["slot-task-reminder-confirmation"]} data-role="reminder-confirmation" aria-live="polite" hidden={!snapshot.confirmations[task.id]}>{snapshot.confirmations[task.id]}</div>
          {(type === "curated" || type === "project") && <Checklist task={task} day={day} slot={slot} />}
          {(type === "curated" || type === "project") && <button type="button"
            onClick={() => { void actions.saveChecklistTemplate(task.id).catch((error) => console.warn("Checklist template was not saved", error)); }}>
            Use this checklist for future tasks
          </button>}
        </div>
      </div>
    </div>
  );
}
