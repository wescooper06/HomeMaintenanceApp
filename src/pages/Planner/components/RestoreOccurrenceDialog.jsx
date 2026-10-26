import { useRef } from "react";

import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";
import usePlannerDialog from "./usePlannerDialog.js";

export default function RestoreOccurrenceDialog() {
  const { snapshot, actions } = usePlanner();
  const ref = useRef(null);
  usePlannerDialog(ref, actions.cancelRestore, "[data-action='restore-cancel']");
  const proposal = snapshot.restoreProposal;
  const busy = snapshot.restoreBusy;
  const different = proposal.date !== proposal.requestedDate || proposal.timeSlot !== proposal.requestedTimeSlot;
  const restore = async () => {
    try { await actions.restoreRepeatableOccurrence(); }
    catch (error) { console.warn("Planner restoration failed", error); }
  };
  return (
    <div className={styles["planner-move-overlay"]} onClick={(event) => {
      if (event.target === event.currentTarget) actions.cancelRestore();
    }}>
      <section ref={ref} className={styles["planner-move-modal"]} role="dialog" aria-modal="true"
        aria-labelledby="planner-restore-title" aria-describedby="planner-restore-description" aria-busy={busy} tabIndex={-1}>
        <h2 id="planner-restore-title">Restore deleted occurrence?</h2>
        <div id="planner-restore-description">
          {different ? <>
            <p>You dropped &ldquo;{proposal.title}&rdquo; on {proposal.requestedDate}, {proposal.requestedTimeSlot}.</p>
            <p>Its deleted occurrence for {proposal.occurrenceDate} is saved at {proposal.date}, {proposal.timeSlot}.</p>
            <p>Restoring will keep that existing location. It will not move the occurrence or change the repeatable schedule.</p>
          </> : <>
            <p>&ldquo;{proposal.title}&rdquo; was previously deleted for {proposal.occurrenceDate}.</p>
            <p>Restore it at {proposal.date}, {proposal.timeSlot}?</p>
            <p>Its saved progress and checklist will be preserved.</p>
          </>}
        </div>
        {busy && <p role="status">{"Restoring occurrence\u2026"}</p>}
        {snapshot.restoreError && <p role="alert">{snapshot.restoreError}</p>}
        <div className={styles["planner-link-project-actions"]}>
          <button type="button" data-action="restore-cancel" disabled={busy} onClick={actions.cancelRestore}>Cancel</button>
          <button type="button" data-action="restore-confirm" disabled={busy || Boolean(snapshot.restoreError)}
            onClick={() => void restore()}>{different ? "Restore at existing location" : "Restore"}</button>
        </div>
      </section>
    </div>
  );
}
