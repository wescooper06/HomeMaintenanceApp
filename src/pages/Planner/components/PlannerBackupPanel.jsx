import { useRef, useState } from "react";

import { plannerBackup } from "../../../services/plannerBackupService.js";

import styles from "./PlannerBackupPanel.module.css";
import { usePlanner } from "./usePlanner.js";

export default function PlannerBackupPanel() {
  const { snapshot, actions } = usePlanner();
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const pending = useRef(false);

  async function run(operation) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try { await actions.backupOperation(operation); }
    catch (failure) {
      console.error("Planner backup operation failed", failure);
      setPreview(null);
      setStatus("");
      setError(failure.message || "Planner backup operation failed.");
    } finally { pending.current = false; setBusy(false); }
  }

  function changeRaw(value) {
    setRaw(value);
    setPreview(null);
    setError("");
    setStatus("");
  }

  async function download() {
    const contents = await plannerBackup.exportBackup();
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setStatus("Planner JSON export prepared. Keep your backup private.");
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  return (
    <details className={styles.panel}>
      <summary>Planner backup and restore</summary>
      <p>Planner tasks, weekly tasks, parking and week settings only. Projects, Trips,
        activities, Google events and credentials are not included.</p>
      <p>Live Supabase data is authoritative. Legacy backups are permanently unsupported
        and cannot be imported here; restore accepts only modern Planner JSON.</p>
      <p>Merge restore never overwrites or deletes existing rows. Conflicts block the
        restore. Reminder metadata does not schedule notifications. Backups may contain private data.</p>
      {snapshot.backupReloadRequired && <p role="alert">Planner must reload before editing.
        <button type="button" disabled={busy} onClick={() => void run(async () => {})}>Retry Planner reload</button>
      </p>}
      <div className={styles.actions}>
        <button type="button" disabled={busy || snapshot.loading} onClick={() => void run(download)}>Export Planner JSON</button>
        <label>Choose JSON backup
          <input type="file" accept=".json,application/json" disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void run(async () => { changeRaw(await file.text()); });
            }} />
        </label>
      </div>
      <label className={styles.input}>Or paste Planner backup JSON
        <textarea value={raw} disabled={busy} rows={5} onChange={(event) => changeRaw(event.target.value)} />
      </label>
      <button type="button" disabled={busy || !raw.trim()}
        onClick={() => void run(async () => { setPreview(await plannerBackup.preview(raw)); })}>Preview restore</button>
      {preview && <section aria-label="Backup restore preview">
        <p>{preview.counts.insert} new, {preview.counts.identical} identical,
          {" "}{preview.counts.conflict} conflicting row(s)/settings.</p>
        <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        {preview.conflicts.length > 0 && <ul role="alert">{preview.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>}
        <button type="button" disabled={busy || preview.conflicts.length > 0 || !preview.counts.insert}
          onClick={() => void run(async () => {
            const result = await plannerBackup.restore(raw);
            setPreview(null);
            setStatus(`Restored ${result.inserted} new row(s); skipped ${result.skipped} identical row(s). Planner has reloaded the merged data.`);
          })}>Confirm merge restore</button>
      </section>}
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">{busy ? "Working..." : status}</p>
    </details>
  );
}
