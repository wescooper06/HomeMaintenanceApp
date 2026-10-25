import { useRef, useState } from "react";

import { formatDateLabel } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";

export default function ReminderModal({ task }) {
  const { actions } = usePlanner();
  const active = Boolean(task.reminder?.active && task.reminder.sendAt);
  const current = active ? new Date(task.reminder.sendAt) : null;
  const [choice, setChoice] = useState("10");
  const [time, setTime] = useState(() => current && !Number.isNaN(current.getTime())
    ? `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}` : "09:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (action) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await actions.reminder(task.id, action, choice, time); }
    catch (failure) { setError(failure.message || "Unable to update reminder."); }
    finally { pending.current = false; setBusy(false); }
  };
  return (
    <div className={styles["reminder-modal-card"]} role="dialog" aria-modal="true" aria-labelledby="reminder-modal-title">
      <div className={styles["reminder-modal-header"]}>
        <div><h2 id="reminder-modal-title">Google Calendar Notification</h2><p>{task.title} - {formatDateLabel(task.date)}</p></div>
        <button type="button" data-action="reminder-cancel" aria-label="Close reminder dialog" title="Close" disabled={busy} onClick={actions.closeReminder}>X</button>
      </div>
      <form className={styles["reminder-form"]} onSubmit={(event) => { event.preventDefault(); void run("send"); }}>
        <p>Allow notifications in Google Calendar. Cancelling here disables
          the notification but retains its Calendar entry for safe retries.</p>
        {task.reminder?.needsReview && <p role="status">This reminder was imported for review.
          Its original settings are preserved in the backup metadata; no notification was scheduled by restore.</p>}
        <button type="button" disabled={busy} onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          try { await actions.connectReminders(); }
          catch (failure) { setError(failure.message || "Unable to connect Google Calendar."); }
          finally { pending.current = false; setBusy(false); }
        }}>Connect Google Calendar</button>
        <label><input type="radio" name="reminder-time" value="10" checked={choice === "10"} onChange={() => setChoice("10")} /> 10 minutes before bucket time</label>
        <label><input type="radio" name="reminder-time" value="30" checked={choice === "30"} onChange={() => setChoice("30")} /> 30 minutes before bucket time</label>
        <label><input type="radio" name="reminder-time" value="60" checked={choice === "60"} onChange={() => setChoice("60")} /> 1 hour before bucket time</label>
        <label className={styles["reminder-custom-option"]}>
          <input type="radio" name="reminder-time" value="custom" checked={choice === "custom"} onChange={() => setChoice("custom")} />
          <span>Custom time:</span>
          <input type="time" name="custom-time" value={time} onFocus={() => setChoice("custom")} onChange={(event) => setTime(event.target.value)} />
        </label>
        <div className={styles["reminder-error"]} role="alert" hidden={!error}>{error}</div>
        <div className={styles["reminder-modal-actions"]}>
          <button type="submit" className={styles.primary} data-action="reminder-send" disabled={busy}>Send Reminder</button>
          {active && <><button type="button" data-action="reminder-reset" disabled={busy} onClick={() => { void run("reset"); }}>Reset Reminder</button>
            <button type="button" className={styles.danger} data-action="reminder-delete" disabled={busy} onClick={() => { void run("delete"); }}>Delete Reminder</button></>}
          <button type="button" data-action="reminder-cancel" disabled={busy} onClick={actions.closeReminder}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
