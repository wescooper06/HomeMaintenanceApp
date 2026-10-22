import { useCallback, useRef, useState } from "react";
import styles from "../PlannerPage.module.css";

export default function InlinePlannerText({ as: Tag = "span", className, text, label, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const finished = useRef(false);
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
  return (
    <Tag className={className} onDoubleClick={(event) => {
      event.preventDefault();
      if (editing) return;
      finished.current = false;
      setDraft(text);
      setEditing(true);
    }}>
      {editing ? <input ref={focusInput} type="text" className={styles["planner-inline-edit"]}
        aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === "Enter");
          }
        }} /> : text}
    </Tag>
  );
}
