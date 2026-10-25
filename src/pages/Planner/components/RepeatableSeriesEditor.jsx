import { getSeriesEditorValues } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";

export default function RepeatableSeriesEditor({ taskId }) {
  const { actions } = usePlanner();
  const { master, current } = actions.getSeries(taskId);
  const defaults = getSeriesEditorValues(master, current);
  const save = (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    actions.saveSeries(taskId, {
      recurrence: values.get("recurrence"), monthWeek: values.get("month-week"),
      baseDay: values.get("base-day"), baseBucket: values.get("base-bucket"), applyScope: values.get("apply-scope"),
    });
  };
  return (
    <div className={styles["series-modal-card"]} role="dialog" aria-modal="true" aria-labelledby="series-modal-title">
      <div className={styles["series-modal-header"]}>
        <div><h2 id="series-modal-title">Edit Recurrence Series</h2><p>{master.title}</p></div>
        <button type="button" data-action="series-cancel" aria-label="Close series editor" title="Close" onClick={actions.closeSeries}>X</button>
      </div>
      <form className={styles["series-form"]} onSubmit={save}>
        <label>Recurrence type<select name="recurrence" defaultValue={defaults.recurrence}>
          <option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
        </select></label>
        <label>Week of month<select name="month-week" defaultValue={defaults.monthWeek}>
          <option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="last">Last</option>
        </select></label>
        <label>Series day<select name="base-day" defaultValue={defaults.baseDay}>
          <option value="Monday">Monday</option><option value="Tuesday">Tuesday</option><option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option><option value="Friday">Friday</option><option value="Saturday">Saturday</option><option value="Sunday">Sunday</option>
        </select></label>
        <label>Series bucket<select name="base-bucket" defaultValue={defaults.baseBucket}>
          <option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option>
        </select></label>
        <fieldset>
          <legend>Apply changes</legend>
          <label><input type="radio" name="apply-scope" value="future" defaultChecked /> Apply to all future occurrences</label>
          <label><input type="radio" name="apply-scope" value="this-future" /> Apply to this and future occurrences</label>
          <label><input type="radio" name="apply-scope" value="entire" /> Apply to entire series (including past)</label>
        </fieldset>
        <div className={styles["series-modal-actions"]}>
          <button type="submit" className={styles.primary}>Save Series Changes</button>
          <button type="button" className={styles.danger} data-action="series-delete" onClick={() => {
            if (window.confirm(`Delete the entire recurrence series "${master.title}"?`)) actions.deleteSeries(taskId);
          }}>Delete Series</button>
          <button type="button" data-action="series-cancel" onClick={actions.closeSeries}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
