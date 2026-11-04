import { useCallback, useEffect, useRef, useState } from "react";

import styles from "../PlannerPage.module.css";

export default function InlinePlannerText({ as: Tag = "span", className, text, label, onSave, editable = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const finished = useRef(false);
  const editButton = useRef(null);
  useEffect(() => { if (editable && !editing && finished.current) editButton.current?.focus(); }, [editable, editing]);
  const focusInput = useCallback((element) => { element?.focus(); element?.select(); }, []);
  const finish = (save) => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    if (save && draft.trim()) {
      const result = onSave(draft.trim());
      if (result?.catch) void result.catch((error) => console.warn("Planner inline edit failed", error));
    }
  };
  const start = (event) => {
    event.preventDefault();
    if (editing) return;
    finished.current = false;
    setDraft(text);
    setEditing(true);
  };
  return (
    <Tag className={className} onDoubleClick={start}>
      {editing ? <input ref={focusInput} type="text" className={styles["planner-inline-edit"]}
        data-planner-inline-edit
        aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === "Enter");
          }
        }} /> : editable ? <button ref={editButton} type="button" className={styles["checklist-text-edit"]}
          aria-label={`Edit ${text}`} title="Edit sub-task" onClick={start}>{text}</button> : text}
    </Tag>
  );
}
