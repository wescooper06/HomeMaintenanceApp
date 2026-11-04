import { useRef, useState } from "react";

import { normalizeChecklist } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import InlinePlannerText from "./InlinePlannerText.jsx";
import useChecklistReorder from "./useChecklistReorder.js";
import { usePlanner } from "./usePlanner.js";
import usePlannerDialog from "./usePlannerDialog.js";

export default function ChecklistAction({ task, day, slot }) {
  const { actions } = usePlanner();
  const checklist = normalizeChecklist(task.checklist);
  const completed = checklist.filter((item) => item.completed).length;
  return (
    <button type="button" id={`planner-checklist-${task.id}`}
      className={`${styles["slot-task-checklist-button"]} ${checklist.length ? styles["has-checklist-items"] : ""}`}
      data-action="checklist-open" aria-haspopup="dialog"
      aria-label={`Open checklist for ${task.title}, ${completed} of ${checklist.length} sub-tasks complete`}
      title={checklist.length ? "Checklist has sub-tasks" : "Checklist"}
      onClick={() => actions.openChecklist(task.id, day, slot)}>
      <svg className={styles["planner-action-icon"]} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M11 20h10" />
      </svg>
    </button>
  );
}

export function ChecklistBody({ task, day, slot, adhoc = false }) {
  const { actions } = usePlanner();
  const [text, setText] = useState("");
  const checklist = normalizeChecklist(task.checklist);
  const listRef = useRef(null);
  const reorder = useChecklistReorder({ task: { ...task, checklist }, day, slot, listRef });
  const add = () => {
    if (actions.addChecklistItem(task.id, day, slot, text)) setText("");
  };
  return (
    <div className={styles["slot-checklist-body"]}>
      <p className={styles["checklist-reorder-status"]} role="status" aria-live="polite">{reorder.status}</p>
      <div ref={listRef} className={styles["slot-checklist-list"]}>
        {checklist.length ? checklist.map((item, index) => <ChecklistItem key={item.id} item={item} index={index}
          count={checklist.length} reorder={reorder} task={task} day={day} slot={slot} adhoc={adhoc} />)
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

export function ChecklistItem({ item, index, count, reorder, task, day, slot, adhoc = false }) {
  const { actions } = usePlanner();
  return (
    <div className={`${styles["slot-checklist-item"]} ${item.completed ? styles["is-complete"] : ""} ${reorder?.drag?.fromId === item.id ? styles["is-dragging"] : ""} ${reorder?.drag?.toId === item.id ? styles["is-drop-target"] : ""}`}
      data-checklist-id={item.id} data-checklist-placement={reorder?.drag?.toId === item.id ? reorder.drag.placement : undefined}>
      {count > 1 && <button type="button" className={styles["slot-checklist-handle"]} data-action="checklist-drag-handle"
          data-checklist-dragging={reorder.drag?.fromId === item.id}
          aria-disabled={reorder.busy} aria-label={`Reorder ${item.text}`} title="Drag to reorder; arrow keys move up or down"
          onPointerDown={(event) => reorder.start(event, item.id)} onPointerMove={reorder.pointerMove}
          onPointerUp={reorder.finish} onPointerCancel={reorder.cancel} onLostPointerCapture={reorder.cancel}
          onKeyDown={(event) => reorder.handleKey(event, index)} onDragStart={(event) => event.preventDefault()}>{"\u22ee\u22ee"}</button>}
      <input type="checkbox" aria-label={item.text} data-action={adhoc ? "adhoc-checklist-item-toggle" : "checklist-item-toggle"} data-checklist-id={item.id} checked={item.completed}
        onChange={(event) => { actions.toggleChecklistItem(task.id, day, slot, item.id, event.target.checked); if (adhoc) actions.refreshChecklist(); }} />
      <InlinePlannerText className={styles["slot-checklist-text"]} text={item.text} label="Sub-task name" editable
        onSave={(text) => actions.updateChecklistItem(task.id, item.id, text)} />
      <button type="button" className={styles["slot-checklist-remove"]} data-action={adhoc ? "adhoc-checklist-item-remove" : "checklist-item-remove"} data-checklist-id={item.id}
        aria-label={`Remove ${item.text}`}
        onClick={() => { actions.removeChecklistItem(task.id, day, slot, item.id); if (adhoc) actions.refreshChecklist(); }}>X</button>
    </div>
  );
}

export function ChecklistModal({ task, day, slot }) {
  const { snapshot, actions } = usePlanner();
  const ref = useRef(null);
  usePlannerDialog(ref, actions.closeChecklist, "[data-action='checklist-close']", {
    isolate: true, returnFocusId: `planner-checklist-${task.id}`,
  });
  return (
    <section ref={ref} className={styles["checklist-modal-card"]} role="dialog" aria-modal="true"
      aria-labelledby="checklist-modal-title checklist-modal-task-title" tabIndex={-1}>
      <div className={styles["checklist-modal-header"]}>
        <div><h2 id="checklist-modal-title">Checklist</h2><p id="checklist-modal-task-title">{task.title}</p></div>
        <button type="button" data-action="checklist-close" aria-label="Close checklist dialog" title="Close" onClick={actions.closeChecklist}>X</button>
      </div>
      <div className={styles["checklist-modal-content"]} data-checklist-scroll>
        {snapshot.error && <p className={styles["checklist-modal-error"]} role="alert">{snapshot.error}</p>}
        <fieldset disabled={Boolean(snapshot.error)} className={styles["checklist-modal-editor"]}>
          <ChecklistBody task={task} day={day} slot={slot} adhoc={(task.taskType || task.type) === "adhoc"} />
        </fieldset>
      </div>
    </section>
  );
}
