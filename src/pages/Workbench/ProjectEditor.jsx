import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import * as service from "../../services/workbenchService.js";
import { EDIT_OPTIONS, getEditFields } from "../../services/workbenchService.js";

import styles from "./WorkbenchPage.module.css";

const EMPTY_PROJECT = {
  source: "home", title: "", repeatingProject: false, category: "Repair", state: "Not Started",
  priority: "3", order: "", recurrence: "", area: "", property: "",
  actualCost: "", dateCompleted: "", vehicle: "", mileage: "", engineHours: "",
  mechanic: "", serviceDescription: "", resourceLinks: "", notes: "",
};

const CREATE_FIELDS = [
  ["source", "Project Type"], ["repeatingProject", "Repeating project"],
  ["title", "Title"], ["category", "Category"],
  ["state", "State"], ["priority", "Priority"], ["order", "Order"],
  ["recurrence", "Recurrence"], ["area", "Area"], ["property", "Property"],
  ["actualCost", "Cost"], ["dateCompleted", "Date Completed"], ["vehicle", "Vehicle / Small Engine"],
  ["mileage", "Mileage"], ["engineHours", "Engine Hours"], ["mechanic", "Mechanic"],
  ["serviceDescription", "Service Description"], ["resourceLinks", "Resource Links"], ["notes", "Notes"],
];

export default function ProjectEditor({ mode = "edit", project, busy = false, error = "", onClose, onSubmit, onDelete, deleteOnly = false }) {
  const creating = mode === "create";
  const navigate = useNavigate();
  const fields = creating ? CREATE_FIELDS : getEditFields(project);
  const [values, setValues] = useState(() => creating
    ? { ...EMPTY_PROJECT }
    : Object.fromEntries(fields.map(([key, , value]) => [
      key, key === "addToRepeating" ? Boolean(value) : Array.isArray(value) ? value.join("\n") : String(value ?? ""),
    ])));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(() =>
    !creating && deleteOnly && service.canDeleteProject(project));
  const deleting = useRef(false);
  const titleId = useId();
  const closeButton = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => { previous?.focus(); };
  }, []);

  function close() {
    if (creating) navigate("/", { replace: true, state: { projectCreated: false } });
    else if (!busy && onClose) onClose();
  }

  function change(key, value) {
    setValues((current) => ({
      ...current, [key]: value,
      ...(creating && key === "repeatingProject" && !value ? { recurrence: "" } : {}),
    }));
  }

  function field([key, label]) {
    if (creating && key === "recurrence" && !values.repeatingProject) return null;
    if (creating && key === "repeatingProject") {
      return (
        <label key={key} className={styles.repeatingControl}>
          <input type="checkbox" name={key} checked={values.repeatingProject}
            onChange={(event) => change(key, event.target.checked)} />
          {label}
        </label>
      );
    }
    const value = values[key] ?? "";
    const options = creating && key === "source" ? ["home", "vehicle", "misc"] : EDIT_OPTIONS[key];
    const choices = options ? [...new Set([value, ...options])] : null;
    const multiline = ["notes", "resourceLinks", "serviceDescription"].includes(key) || value.length > 80;
    return (
      <label key={key}>
        {label}
        {choices ? (
          <select name={key} value={value} onChange={(event) => change(key, event.target.value)}
            disabled={creating && key === "source" && values.repeatingProject}
            required={key === "source" || (creating && key === "recurrence" && values.repeatingProject)}>
            {choices.map((option) => <option key={option} value={option}>{option || "-"}</option>)}
          </select>
        ) : multiline ? (
          <textarea name={key} value={value} onChange={(event) => change(key, event.target.value)} />
        ) : (
          <input name={key} value={value} onChange={(event) => change(key, event.target.value)}
            required={creating && key === "title"} />
        )}
      </label>
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!creating) return onSubmit(values);
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await service.createProject(values);
      navigate("/", { replace: true, state: { projectCreated: true } });
    } catch (failure) {
      console.error("Project creation failed", failure);
      setSaveError(failure.message || "Unable to create project.");
    } finally {
      setSaving(false);
    }

  }

  async function confirmDelete() {
    if (deleting.current || busy || saving) return;
    deleting.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await onDelete(project);
      setConfirmingDelete(false);
    } catch (failure) {
      console.error("Project deletion failed", failure);
      setSaveError(failure.message || "Unable to delete project.");
    } finally {
      deleting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={creating ? styles.screen : styles.modal}
      onClick={(event) => { if (creating && event.target === event.currentTarget) close(); }}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.modalHeader}>
          <h1 id={titleId}>{creating ? "Create Project" : deleteOnly ? "Delete Project" : `Edit Project Details (ID: ${project.id || "-"})`}</h1>
          <button ref={closeButton} type="button" aria-label="Close" onClick={close}
            disabled={busy || saving}>X</button>
        </div>
        {(error || saveError) && <p role="alert">{error || saveError}</p>}
        {confirmingDelete ? (
          <div role="alertdialog" aria-label="Confirm project deletion">
            <p>Permanently delete &quot;{project.title}&quot; (UUID: {project.id})?</p>
            <p>Modern Planner tasks, weekly records, and linked modern Parking records owned by this project will also be permanently deleted. This cannot be undone.</p>
            <button type="button" disabled={busy || saving}
              onClick={() => { if (deleteOnly) close(); else setConfirmingDelete(false); }}>Cancel</button>
            <button type="button" className={styles.danger} disabled={busy || saving}
              onClick={() => void confirmDelete()}>Delete Project</button>
          </div>
        ) : <form onSubmit={(event) => void submit(event)}>
          <fieldset className={styles.editGrid} disabled={busy || saving}>
            {fields.map(field)}
            {creating && values.repeatingProject && (
              <p role="status">Project Type: repeating. Uncheck Repeating project to use the selected non-repeating type.</p>
            )}
          </fieldset>
          <div className={styles.modalActions}>
            {!creating && onDelete && service.canDeleteProject(project) && (
              <button type="button" className={styles.danger} disabled={busy || saving}
                onClick={() => setConfirmingDelete(true)}>Delete Project</button>
            )}
            <button type="button" onClick={close} disabled={busy || saving}>Cancel</button>
            <button className={styles.primary} type="submit" disabled={busy || saving}>
              {busy || saving ? "Saving..." : creating ? "Create Project" : "Save Changes"}
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
}
