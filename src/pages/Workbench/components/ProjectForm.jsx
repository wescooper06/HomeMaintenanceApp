import { useEffect, useId, useRef, useState } from "react";
import { ADD_FIELDS, EDIT_OPTIONS, FIELD_OPTIONS, getEditFields, RECURRENCE_OPTIONS } from "../../../services/workbenchService.js";
import styles from "../WorkbenchPage.module.css";

export default function ProjectForm({ project, busy, error, onClose, onSubmit }) {
  const editing = Boolean(project);
  const fields = editing ? getEditFields(project) : ADD_FIELDS;
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key, , value]) => [
    key, key === "addToRepeating" ? Boolean(value) : Array.isArray(value) ? value.join("\n") : String(value ?? ""),
  ])));
  const titleId = useId();
  const closeButton = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => { previous?.focus(); };
  }, []);

  function close() {
    if (!busy) onClose();
  }

  function change(key, value) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(!editing && key === "addToRepeating" && !value ? { recurrence: "" } : {}),
    }));
  }

  function field([key, label]) {
    if (key === "addToRepeating") return null;
    const value = values[key] ?? "";
    const options = editing ? EDIT_OPTIONS[key] : FIELD_OPTIONS[key];
    const choices = options ? [...new Set(editing ? [value, ...options] : ["", ...options])] : null;
    const multiline = key === "notes" || key === "resourceLinks" || (editing && value.length > 80);
    return (
      <label key={key}>
        {label}
        {choices ? (
          <select name={key} value={value} onChange={(event) => change(key, event.target.value)}>
            {choices.map((option) => <option key={option} value={option}>{option || (editing ? "-" : `Select ${label.toLowerCase()}`)}</option>)}
          </select>
        ) : multiline ? (
          <textarea name={key} value={value} onChange={(event) => change(key, event.target.value)} />
        ) : (
          <input name={key} value={value} onChange={(event) => change(key, event.target.value)} />
        )}
      </label>
    );
  }

  return (
    <div className={styles.modal} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if (event.key === "Tab") {
            const controls = [...event.currentTarget.querySelectorAll("button, input, select, textarea")]
              .filter((element) => !element.disabled);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className={styles.modalHeader}>
          <h2 id={titleId}>{editing ? `Edit Project Details (ID: ${project.id || "-"})` : "Add Project"}</h2>
          <button ref={closeButton} type="button" aria-label="Close" onClick={close} disabled={busy}>X</button>
        </div>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <fieldset className={styles.editGrid} disabled={busy}>
            {fields.map(field)}
            <div className={styles.repeatingControls}>
              <label className={styles.checkbox}>
                <input type="checkbox" name="addToRepeating" checked={Boolean(values.addToRepeating)} onChange={(event) => change("addToRepeating", event.target.checked)} />
                Add to Repeating List
              </label>
              {!editing && values.addToRepeating && (
                <label>
                  Recurrance
                  <select name="recurrence" value={values.recurrence ?? ""} onChange={(event) => change("recurrence", event.target.value)}>
                    <option value="">Select recurrance</option>
                    {RECURRENCE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              )}
            </div>
          </fieldset>
          <div className={styles.modalActions}>
            <button type="button" onClick={close} disabled={busy}>Cancel</button>
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
