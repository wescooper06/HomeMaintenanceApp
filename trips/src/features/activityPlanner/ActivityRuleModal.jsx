import { useEffect, useId, useState } from "react";
import styles from "./ActivityRuleModal.module.css";
import { DAYS, TIME_OPTIONS, formatTimeLabel, timeToMinutes } from "./plannerUtils.js";

function validate(draft) {
  if (!draft.activity_type_id) return "Choose an activity type.";
  if (!draft.days.length) return "Select at least one day.";
  const start = timeToMinutes(draft.start_time);
  const end = timeToMinutes(draft.end_time);
  if (Number.isNaN(start) || Number.isNaN(end)) return "Start and end times must be valid.";
  if (end <= start) return "End time must be after start time.";
  if (!Number.isFinite(Number(draft.priority))) return "Priority must be a number.";
  return "";
}

const START_OPTIONS = TIME_OPTIONS.slice(0, -1);
const END_OPTIONS = TIME_OPTIONS.slice(1);

/** Includes a rule's stored time even when it falls outside the 06:00–24:00 grid options. */
function optionsWith(options, value) {
  return !value || options.includes(value) ? options : [value, ...options];
}

/**
 * Create/edit form for one ActivityRules row. Mount with a fresh `key` per open so
 * the draft initializes from `initialRule` without syncing effects.
 */
export default function ActivityRuleModal({ isEditing, editingSingleDay, initialRule, activityTypes, saving, error, onSave, onDelete, onCancel }) {
  const [draft, setDraft] = useState(initialRule);
  const [validationError, setValidationError] = useState("");
  const titleId = useId();
  const fieldId = useId();

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saving, onCancel]);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleDay(day) {
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((value) => value !== day) : DAYS.filter((value) => value === day || current.days.includes(value)),
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const message = validate(draft);
    setValidationError(message);
    if (!message) onSave({ ...draft, priority: Number(draft.priority) });
  }

  function handleDelete() {
    if (window.confirm("Delete this activity rule? Every slot it generates will be removed.")) onDelete(draft.id);
  }

  const shownError = validationError || error;

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 id={titleId}>{isEditing ? "Edit activity rule" : "New activity rule"}</h2>
          <button type="button" className={styles.closeButton} onClick={onCancel} disabled={saving} aria-label="Close">×</button>
        </header>

        <div className={styles.body}>
          <label className={styles.field} htmlFor={`${fieldId}-type`}>
            <span>Activity type</span>
            <select
              id={`${fieldId}-type`}
              value={draft.activity_type_id}
              onChange={(event) => updateField("activity_type_id", event.target.value)}
              disabled={saving}
              autoFocus
            >
              <option value="">Select an activity…</option>
              {activityTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.category ? `${type.name} (${type.category})` : type.name}</option>
              ))}
            </select>
            {activityTypes.length === 0 && (
              <small className={styles.hint}>No activity types loaded. Add rows to the ActivityTypes sheet (with an id), then Refresh.</small>
            )}
          </label>

          <fieldset className={styles.field}>
            <legend>Days</legend>
            <div className={styles.dayToggles}>
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`${styles.dayToggle} ${draft.days.includes(day) ? styles.dayToggleOn : ""}`}
                  aria-pressed={draft.days.includes(day)}
                  onClick={() => toggleDay(day)}
                  disabled={saving || editingSingleDay}
                >
                  {day}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles.row}>
            <label className={styles.field} htmlFor={`${fieldId}-start`}>
              <span>Start time</span>
              <select id={`${fieldId}-start`} value={draft.start_time} onChange={(event) => updateField("start_time", event.target.value)} disabled={saving}>
                {optionsWith(START_OPTIONS, draft.start_time).map((time) => (
                  <option key={time} value={time}>{formatTimeLabel(timeToMinutes(time))}</option>
                ))}
              </select>
            </label>
            <label className={styles.field} htmlFor={`${fieldId}-end`}>
              <span>End time</span>
              <select id={`${fieldId}-end`} value={draft.end_time} onChange={(event) => updateField("end_time", event.target.value)} disabled={saving}>
                {optionsWith(END_OPTIONS, draft.end_time).map((time) => (
                  <option key={time} value={time}>{formatTimeLabel(timeToMinutes(time))}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.field} htmlFor={`${fieldId}-priority`}>
              <span>Priority</span>
              <input
                id={`${fieldId}-priority`}
                type="number"
                step="1"
                value={draft.priority}
                onChange={(event) => updateField("priority", event.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <label className={styles.switchField}>
            <input
              type="checkbox"
              role="switch"
              checked={draft.allow_override}
              onChange={(event) => updateField("allow_override", event.target.checked)}
              disabled={saving}
            />
            <span>Allow override</span>
          </label>

          <label className={styles.field} htmlFor={`${fieldId}-notes`}>
            <span>Notes</span>
            <textarea id={`${fieldId}-notes`} rows={3} value={draft.notes} onChange={(event) => updateField("notes", event.target.value)} disabled={saving} />
          </label>

          {shownError && <p className={styles.error} role="alert">{shownError}</p>}
        </div>

        <footer className={styles.footer}>
          {isEditing && (
            <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={saving}>Delete</button>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </footer>
      </form>
    </div>
  );
}
