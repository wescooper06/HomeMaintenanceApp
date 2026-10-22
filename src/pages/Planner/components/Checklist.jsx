import { useState } from "react";
import { normalizeChecklist } from "../../../services/plannerService.js";
import { usePlanner } from "./usePlanner.js";
import usePlannerDrag from "./usePlannerDrag.js";
import InlinePlannerText from "./InlinePlannerText.jsx";
import styles from "../PlannerPage.module.css";

export default function Checklist({ task, day, slot }) {
  const { actions } = usePlanner();
  return (
    <div className={styles["slot-checklist"]}>
      <button type="button" className={styles["slot-checklist-toggle"]} data-action="checklist-toggle"
        onClick={() => actions.toggleChecklistOpen(task.id, day, slot)}>Checklist {task.checklistOpen ? "\u25b2" : "\u25bc"}</button>
      {task.checklistOpen && <ChecklistBody task={task} day={day} slot={slot} />}
    </div>
  );
}

export function ChecklistBody({ task, day, slot, adhoc = false }) {
  const { actions } = usePlanner();
  const [text, setText] = useState("");
  const checklist = normalizeChecklist(task.checklist);
  const add = () => {
    if (actions.addChecklistItem(task.id, day, slot, text)) setText("");
  };
  return (
    <div className={styles["slot-checklist-body"]}>
      <div className={styles["slot-checklist-list"]}>
        {checklist.length ? checklist.map((item) => <ChecklistItem key={item.id} item={item} task={task} day={day} slot={slot} adhoc={adhoc} />)
          : <div className={styles["slot-checklist-empty"]}>No sub-tasks yet.</div>}
      </div>
      <div className={styles["slot-checklist-add"]}>
        <input type="text" data-action={adhoc ? "adhoc-checklist-add-input" : "checklist-add-input"} placeholder="Add sub-task" aria-label="Add sub-task" value={text}
          onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
        <button type="button" data-action={adhoc ? "adhoc-checklist-item-add" : "checklist-item-add"} onClick={add}>Add</button>
      </div>
    </div>
  );
}

export function ChecklistItem({ item, task, day, slot, adhoc = false }) {
  const { actions } = usePlanner();
  const drag = usePlannerDrag();
  const sameTask = drag.drag?.kind === "checklist-reorder" && drag.drag.taskId === task.id && drag.drag.day === day && drag.drag.slot === slot;
  const target = `checklist:${task.id}:${item.id}`;
  return (
    <div className={`${styles["slot-checklist-item"]} ${item.completed ? styles["is-complete"] : ""} ${sameTask && drag.drag.checklistId === item.id ? styles["is-dragging"] : ""} ${drag.dropTarget === target ? styles["is-drop-target"] : ""}`}
      data-checklist-id={item.id}
      onDragOver={(event) => { if (!adhoc && sameTask) drag.target(event, target); }}
      onDragLeave={drag.leave}
      onDrop={(event) => {
        if (adhoc || !sameTask) return;
        event.preventDefault();
        event.stopPropagation();
        actions.reorderChecklistItem(task.id, day, slot, drag.drag.checklistId, item.id);
        drag.end();
      }}>
      {!adhoc && <span className={styles["slot-checklist-handle"]} data-action="checklist-drag-handle" draggable="true" aria-label="Drag sub-task" title="Drag to reorder"
        onDragStart={(event) => drag.start(event, { kind: "checklist-reorder", taskId: task.id, day, slot, checklistId: item.id })} onDragEnd={drag.end}>{"\u22ee\u22ee"}</span>}
      <input type="checkbox" data-action={adhoc ? "adhoc-checklist-item-toggle" : "checklist-item-toggle"} data-checklist-id={item.id} checked={item.completed}
        onChange={(event) => { actions.toggleChecklistItem(task.id, day, slot, item.id, event.target.checked); if (adhoc) actions.refreshChecklist(); }} />
      <InlinePlannerText className={styles["slot-checklist-text"]} text={item.text} label="Sub-task name" onSave={(text) => actions.updateChecklistItem(task.id, item.id, text)} />
      <button type="button" className={styles["slot-checklist-remove"]} data-action={adhoc ? "adhoc-checklist-item-remove" : "checklist-item-remove"} data-checklist-id={item.id}
        onClick={() => { actions.removeChecklistItem(task.id, day, slot, item.id); if (adhoc) actions.refreshChecklist(); }}>X</button>
    </div>
  );
}

export function AdhocChecklistModal({ task, day, slot }) {
  const { actions } = usePlanner();
  return (
    <div className={styles["adhoc-checklist-modal-card"]} role="dialog" aria-modal="true" aria-labelledby="adhoc-checklist-modal-title">
      <div className={styles["adhoc-checklist-modal-header"]}>
        <div><h2 id="adhoc-checklist-modal-title">Checklist</h2><p>{task.title}</p></div>
        <button type="button" data-action="adhoc-checklist-close" aria-label="Close checklist dialog" title="Close" onClick={actions.closeChecklist}>X</button>
      </div>
      <ChecklistBody task={task} day={day} slot={slot} adhoc />
    </div>
  );
}
