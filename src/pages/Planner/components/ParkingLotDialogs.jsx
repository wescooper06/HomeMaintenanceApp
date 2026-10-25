import { useState } from "react";

import {
  deleteParkingItem, getParkingDropdownValues, saveParkingAdHocTitle, saveParkingItem, saveParkingProjectEditor,
} from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

function SelectField({ name, label, values, value, onChange, allowEmpty = false }) {
  const options = (Array.isArray(values) ? values : []).filter((entry) => String(entry ?? "").trim());
  if (value && !options.includes(value)) options.unshift(value);
  if (!value && allowEmpty) options.unshift("");
  if (!options.length) options.push(value || "");
  return (
    <label>{label}<select name={name} value={value} onChange={onChange}>
      {options.map((option) => <option key={option} value={option}>{option || (allowEmpty ? "— None —" : "—")}</option>)}
    </select></label>
  );
}

export default function ParkingLotDialogs({ dialog, onClose, onSaved }) {
  const { kind, item, editor } = dialog;
  const [values, setValues] = useState(() => kind === "project" ? { ...editor.values } : {
    title: item?.title || "", notes: item?.notes || "",
    convertTo: ["task-manager", "project", "repeatable"].includes(item?.convertedTo?.type) ? item.convertedTo.type : "none",
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const project = kind === "project";
  const adhoc = kind === "adhoc";
  const title = project ? `Edit Project Details (ID: ${editor.project.id})`
    : adhoc ? "Ad-Hoc Task" : item?.id ? "Edit Parking Lot Item" : "Add Parking Lot Item";
  const subtitle = project ? "Update the project without leaving Planner."
    : adhoc ? "Use the title as the ad-hoc task name." : "Store ideas before they become work.";
  const titleId = project ? "parking-project-edit-title" : "parking-lot-title";
  const dropdowns = project ? editor.dropdowns[values.source] || {} : {};
  const change = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
  };
  const changeSource = (event) => {
    const source = event.target.value;
    const nextDropdowns = editor.dropdowns[source] || {};
    setValues((previous) => {
      const next = { ...previous, source };
      for (const field of ["category", "state", "priority", "area", "property"]) {
        const options = getParkingDropdownValues(nextDropdowns, field);
        next[field] = options.includes(previous[field]) ? previous[field] : "";
      }
      return next;
    });
  };
  const perform = async (operation) => {
    setBusy(true);
    setStatus("");
    try {
      const result = await operation();
      await onSaved(result, { localOnly: adhoc });
      onClose();
    } catch (error) {
      setStatus(error.message || "Unable to save parking lot item.");
      setBusy(false);
    }
  };
  const save = () => perform(() => project ? saveParkingProjectEditor(editor, values, setStatus)
    : adhoc ? saveParkingAdHocTitle(item, values.title) : saveParkingItem(item || {}, values));
  const remove = () => perform(() => item?.id ? deleteParkingItem(item.id) : Promise.resolve());

  return (
    <div className={styles["parking-lot-modal"]} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
      <div className={styles["parking-lot-modal-header"]}>
        <div><h3 id={titleId}>{title}</h3><p>{subtitle}</p></div>
        <button type="button" data-action="dialog-close" aria-label="Close parking lot dialog" title="Close" disabled={busy} onClick={onClose}>X</button>
      </div>
      <div className={styles["parking-lot-modal-body"]}>
        <form className={styles["parking-lot-form-grid"]} onSubmit={(event) => { event.preventDefault(); if (!busy) void save(); }}>
          <label>Title<input name="title" type="text" required={!adhoc} value={values.title} onChange={change} /></label>
          {!project && !adhoc && <>
            <label>Notes<textarea name="notes" value={values.notes} onChange={change} /></label>
            <label>Convert To<select name="convertTo" value={values.convertTo} onChange={change}>
              <option value="none">None</option><option value="task-manager">Ad-Hoc Task</option>
              <option value="project">Project</option><option value="repeatable">Repeatable Project</option>
            </select></label>
          </>}
          {project && <>
            <label>Source<select name="source" value={values.source} onChange={changeSource}>
              <option value="home">Home</option><option value="vehicle">Vehicle</option>
              <option value="repeating">Repeating</option><option value="misc">Miscellaneous</option>
            </select></label>
            {["category", "state", "priority"].map((field) => <SelectField key={field} name={field} label={field[0].toUpperCase() + field.slice(1)} values={getParkingDropdownValues(dropdowns, field)} value={values[field]} onChange={change} allowEmpty={!values[field]} />)}
            <label>Order<input name="order" type="text" value={values.order} onChange={change} /></label>
            <SelectField name="area" label="Area" values={dropdowns.area} value={values.area} onChange={change} allowEmpty={!values.area} />
            <SelectField name="property" label="Property" values={dropdowns.property} value={values.property} onChange={change} allowEmpty />
            <label>Date Completed<input name="dateCompleted" type="text" value={values.dateCompleted} onChange={change} /></label>
          </>}
        </form>
        {(project || status) && <p className="parking-lot-edit-status" data-role="project-edit-status" aria-live="polite">{status}</p>}
        <div className={styles["parking-lot-modal-actions"]}>
          <button type="button" className={styles.primary} data-action={project ? "project-edit-save" : adhoc ? "ad-hoc-save" : "dialog-save"} disabled={busy} onClick={() => void save()}>{project ? "Save Changes" : "Save"}</button>
          {!project && !adhoc && <button type="button" className={styles.danger} data-action="dialog-delete" disabled={busy} onClick={() => void remove()}>Delete</button>}
          <button type="button" data-action="dialog-close" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
