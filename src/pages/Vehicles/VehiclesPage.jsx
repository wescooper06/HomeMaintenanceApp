import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

import PageHeader from "../../components/layout/PageHeader.jsx";
import {
  buildRecordDeleteOperation,
  createVehicleChangesDraft,
  vehiclesService,
} from "../../services/vehiclesService.js";

import styles from "./VehiclesPage.module.css";

const serviceErrorMessages = {
  validation_error: "Review the highlighted service details and try again.",
  duplicate_service_date: "An Ongoing record already exists for that service date.",
  version_conflict: "Vehicles data changed elsewhere. Cancel or reload before saving again.",
  authorization_error: "Your session cannot save these changes. Sign in again.",
  not_found: "The asset or record is no longer available. Reload the workspace.",
  item_archived_or_unavailable: "A Maintenance Item is no longer available for this asset. Reload the workspace.",
  retryable_transport: "The save could not be confirmed because of a connection issue.",
  unknown_outcome: "The save outcome is unknown. Retry the exact request before making more changes.",
};

function copyRecords(records) {
  return records.map((record) => ({
    ...record,
    capturedItems: record.capturedItems.map((item) => ({ ...item })),
  }));
}

function recordValue(record) {
  return JSON.stringify({
    serviceDate: record.serviceDate,
    usageReadingValue: record.usageReadingValue,
    usageReadingUnit: record.usageReadingUnit,
    mechanic: record.mechanic,
    capturedItems: record.capturedItems,
  });
}

function getErrorMessage(error) {
  if (error?.code === "unknown_outcome") return serviceErrorMessages.unknown_outcome;
  if (error?.code === "read_failed" || error?.code === "data_error") {
    return "Vehicles data could not be loaded or refreshed. Retry loading the workspace.";
  }
  return serviceErrorMessages[error?.code] || "Vehicles changes could not be confirmed. Your draft is preserved.";
}

function createDateToday() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export default function VehiclesPage() {
  const [assets, setAssets] = useState(null);
  const [assetError, setAssetError] = useState("");
  const [assetAttempt, setAssetAttempt] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [workspace, setWorkspace] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0);
  const [baselineRecords, setBaselineRecords] = useState([]);
  const [workingRecords, setWorkingRecords] = useState([]);
  const [deletedRecords, setDeletedRecords] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryDraft, setRetryDraft] = useState(null);
  const saveLock = useRef(false);
  const dialogRef = useRef(null);

  const baselineById = new Map(baselineRecords.map((record) => [record.id, record]));
  const dirty = deletedRecords.length > 0 || workingRecords.some((record) => (
    record.isNew || recordValue(record) !== recordValue(baselineById.get(record.id) || record)
  ));
  const saveUncertain = retryDraft !== null;
  const blocker = useBlocker(() => dirty || saving || saveUncertain);

  useEffect(() => {
    let active = true;
    vehiclesService.listAssets().then((result) => {
      if (!active) return;
      setAssets(result);
      if (result.length) {
        setSelectedAssetId((current) => current || result[0].id);
      }
    }).catch(() => {
      if (active) setAssetError("Vehicles assets could not be loaded. Retry the request.");
    });
    return () => { active = false; };
  }, [assetAttempt]);

  useEffect(() => {
    if (!selectedAssetId) return undefined;
    let active = true;
    vehiclesService.loadVehicleWorkspace(selectedAssetId).then((result) => {
      if (!active) return;
      const records = copyRecords(result.ongoingMaintenanceRecords);
      setWorkspace(result);
      setBaselineRecords(records);
      setWorkingRecords(copyRecords(records));
      setDeletedRecords([]);
      setSelectedRecordId(vehiclesService.newestRecord(records)?.id || "");
      setRetryDraft(null);
    }).catch(() => {
      if (active) setWorkspaceError("The Vehicles workspace could not be loaded. Retry loading it.");
    }).finally(() => {
      if (active) setWorkspaceLoading(false);
    });
    return () => { active = false; };
  }, [selectedAssetId, workspaceAttempt]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation || blocker.state === "blocked") {
      if (dialog && !dialog.open) dialog.showModal();
    } else if (dialog?.open) {
      dialog.close();
    }
  }, [confirmation, blocker.state]);

  useEffect(() => {
    if (!dirty && !saving && !saveUncertain) return undefined;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving, saveUncertain]);

  function resetDraft() {
    setWorkingRecords(copyRecords(baselineRecords));
    setDeletedRecords([]);
    setSelectedRecordId(vehiclesService.newestRecord(baselineRecords)?.id || "");
    setRetryDraft(null);
    setSaveError("");
    setStatus("Changes canceled. The last saved records are restored.");
  }

  function selectAsset(assetId) {
    if (assetId === selectedAssetId) return;
    if (dirty || saveUncertain) {
      setConfirmation({ kind: "asset", value: assetId });
      return;
    }
    setWorkspace(null);
    setWorkspaceLoading(true);
    setWorkspaceError("");
    setSelectedAssetId(assetId);
  }

  function retryAssetLoad() {
    setAssetError("");
    setAssets(null);
    setAssetAttempt((attempt) => attempt + 1);
  }

  function retryWorkspaceLoad() {
    setWorkspaceError("");
    setWorkspaceLoading(true);
    setWorkspaceAttempt((attempt) => attempt + 1);
  }

  function selectRecord(recordId) {
    if (recordId === selectedRecordId) return;
    if (dirty || saveUncertain) {
      setConfirmation({ kind: "record", value: recordId });
      return;
    }
    setSelectedRecordId(recordId);
  }

  async function addRecord() {
    if (!workspace || saving || saveUncertain) return;
    setSaveError("");
    try {
      const template = await vehiclesService.createOngoingMaintenanceDraftTemplate(workspace.asset.id);
      const record = {
        id: crypto.randomUUID(),
        serviceDate: createDateToday(),
        usageReadingValue: null,
        usageReadingUnit: template.usageReadingUnit,
        mechanic: null,
        version: 1,
        capturedItems: template.items.map((item) => ({ ...item })),
        isNew: true,
      };
      setWorkingRecords((current) => [...current, record]);
      setSelectedRecordId(record.id);
      setStatus("New Ongoing record added to this unsaved editing session.");
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  }

  function updateRecord(recordId, update) {
    setWorkingRecords((current) => current.map((record) => (
      record.id === recordId ? { ...record, ...update } : record
    )));
    setStatus("");
    setSaveError("");
  }

  function updateItem(recordId, itemId, isPerformed) {
    setWorkingRecords((current) => current.map((record) => (
      record.id === recordId
        ? {
          ...record,
          capturedItems: record.capturedItems.map((item) => (
            item.maintenanceItemId === itemId ? { ...item, isPerformed } : item
          )),
        }
        : record
    )));
    setStatus("");
    setSaveError("");
  }

  function queueDelete() {
    const record = workingRecords.find((entry) => entry.id === selectedRecordId);
    if (!record || saving || saveUncertain) return;
    setConfirmation({ kind: "delete", record });
  }

  function finishConfirmation() {
    const action = confirmation;
    setConfirmation(null);
    if (!action) return;
    if (action.kind === "asset") {
      resetDraft();
      setWorkspace(null);
      setWorkspaceLoading(true);
      setWorkspaceError("");
      setSelectedAssetId(action.value);
    } else if (action.kind === "record") {
      resetDraft();
      setSelectedRecordId(action.value);
    } else if (action.kind === "delete") {
      const record = action.record;
      const remaining = workingRecords.filter((entry) => entry.id !== record.id);
      setWorkingRecords(remaining);
      if (selectedRecordId === record.id) {
        setSelectedRecordId(vehiclesService.newestRecord(remaining)?.id || "");
      }
      if (!record.isNew) setDeletedRecords((current) => [...current, record]);
      setStatus("Record deletion queued. It will take effect only after Save Changes.");
    }
  }

  function makeSaveDraft() {
    const draft = createVehicleChangesDraft(workspace);
    const originalById = new Map(baselineRecords.map((record) => [record.id, record]));
    for (const record of workingRecords) {
      const original = originalById.get(record.id);
      if (record.isNew) {
        draft.ongoingOperations.push({
          action: "create",
          id: record.id,
          serviceDate: record.serviceDate,
          usageReadingValue: record.usageReadingUnit === "none" ? null : record.usageReadingValue,
          usageReadingUnit: record.usageReadingUnit,
          mechanic: record.mechanic || null,
          items: record.capturedItems.map((item) => ({ ...item })),
        });
      } else if (original && recordValue(record) !== recordValue(original)) {
        draft.ongoingOperations.push({
          action: "update",
          id: record.id,
          expectedVersion: original.version,
          serviceDate: record.serviceDate,
          usageReadingValue: record.usageReadingUnit === "none" ? null : record.usageReadingValue,
          usageReadingUnit: record.usageReadingUnit,
          mechanic: record.mechanic || null,
          items: record.capturedItems.map((item) => ({ ...item })),
        });
      }
    }
    draft.ongoingOperations.push(...deletedRecords.map((record) => (
      buildRecordDeleteOperation("ongoing", record, workspace.asset.id).operation
    )));
    return draft;
  }

  async function reconcileConfirmedSave(result) {
    try {
      const fresh = await vehiclesService.loadVehicleWorkspace(workspace.asset.id);
      const records = copyRecords(fresh.ongoingMaintenanceRecords);
      setWorkspace(fresh);
      setBaselineRecords(records);
      setWorkingRecords(copyRecords(records));
      setDeletedRecords([]);
      setSelectedRecordId(vehiclesService.newestRecord(records)?.id || "");
      setStatus("Changes saved.");
    } catch {
      const records = workingRecords.map((record) => ({
        ...record,
        isNew: false,
        version: result.entityVersions?.ongoing?.[record.id] || record.version,
      }));
      setWorkspace((current) => ({
        ...current,
        asset: { ...current.asset, version: result.assetVersion },
      }));
      setBaselineRecords(copyRecords(records));
      setWorkingRecords(copyRecords(records));
      setDeletedRecords([]);
      setStatus("Changes were saved, but the latest workspace could not be reloaded. Retry loading before further edits.");
    }
  }

  async function saveChanges(event) {
    event?.preventDefault();
    if (!workspace || saveLock.current || !dirty || saving || workspaceLoading || saveUncertain) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError("");
    setStatus("Saving Vehicles changes...");
    const draft = makeSaveDraft();
    try {
      const result = await vehiclesService.saveVehicleChanges(draft);
      if (result.status === "saved") await reconcileConfirmedSave(result);
      else {
        setStatus("There are no changes to save.");
        setBaselineRecords(copyRecords(workingRecords));
        setDeletedRecords([]);
      }
    } catch (error) {
      if (error?.code === "unknown_outcome" && error.retryDraft) {
        setRetryDraft(error.retryDraft);
      }
      setSaveError(getErrorMessage(error));
      setStatus("");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function retryUnknownSave() {
    if (!retryDraft || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError("");
    setStatus("Retrying the same Vehicles save request...");
    try {
      const result = await vehiclesService.saveVehicleChanges(retryDraft);
      if (result.status === "saved") await reconcileConfirmedSave(result);
      setRetryDraft(null);
    } catch (error) {
      if (error?.code === "unknown_outcome" && error.retryDraft) setRetryDraft(error.retryDraft);
      setSaveError(getErrorMessage(error));
      setStatus("");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function handleRouteDiscard() {
    if (saveUncertain || saving) return;
    resetDraft();
    blocker.proceed();
  }

  const selectedRecord = workingRecords.find((record) => record.id === selectedRecordId);
  const confirmationTitle = confirmation?.kind === "delete"
    ? "Queue deletion of this Ongoing record?"
    : confirmation?.kind === "asset"
      ? "Discard changes and switch assets?"
      : confirmation?.kind === "record"
        ? "Discard changes and switch records?"
        : saveUncertain
          ? "Save outcome needs confirmation"
          : saving ? "Save is in progress" : "Discard unsaved Vehicles changes?";

  return (
    <main className={styles.page}>
      <PageHeader id="vehicles-page-title" title="Vehicles"
        subtitle="Ongoing Maintenance records for your vehicles."
        actions={dirty && (
          <>
            <button type="button" className="lm-button lm-button--secondary"
              onClick={resetDraft} disabled={saving || saveUncertain}>Cancel Changes</button>
            <button type="submit" form="vehicles-edit-form" className="lm-button lm-button--primary"
              disabled={!dirty || saving || workspaceLoading || saveUncertain}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </>
        )} />

      <div className={styles.assetRow}>
        <label className="lm-form-field" htmlFor="vehicles-asset-select">
          <span className="lm-form-label">Vehicle</span>
          <select id="vehicles-asset-select" className="lm-form-control" value={selectedAssetId}
            disabled={!assets?.length || saving || saveUncertain}
            onChange={(event) => selectAsset(event.target.value)}>
            {assets?.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
      </div>

      {assets === null && !assetError && <p className="lm-loading-state" role="status">Loading Vehicles...</p>}
      {assetError && <div className="lm-feedback lm-feedback--error" role="alert">
        <p>{assetError}</p>
        <button type="button" className="lm-button lm-button--secondary" onClick={retryAssetLoad}>
          Retry loading assets
        </button>
      </div>}
      {assets?.length === 0 && !assetError && <section className={`lm-surface ${styles.empty}`}
        aria-labelledby="vehicles-no-assets-title">
        <h2 id="vehicles-no-assets-title">No vehicles yet</h2>
        <p>Vehicles will appear here when an asset is available. Asset management is not available in this phase.</p>
      </section>}

      {assets?.length > 0 && (workspaceLoading || !workspace) && !workspaceError
        && <p className="lm-loading-state" role="status">Loading vehicle maintenance...</p>}
      {workspaceError && <div className="lm-feedback lm-feedback--error" role="alert">
        <p>{workspaceError}</p>
        <button type="button" className="lm-button lm-button--secondary"
          onClick={retryWorkspaceLoad} disabled={dirty || saving}>
          {dirty ? "Cancel changes before reloading" : "Retry loading workspace"}
        </button>
      </div>}

      {workspace && workspace.asset.id === selectedAssetId && !workspaceLoading && !workspaceError && (
        <>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Ongoing Maintenance</h2>
              <p>Service history is shown newest first. Existing item names and membership are preserved as captured.</p>
            </div>
            <button type="button" className="lm-button lm-button--secondary" onClick={addRecord}
              disabled={saving || saveUncertain}>Add Ongoing Record</button>
          </div>

          {saveError && <div className="lm-feedback lm-feedback--error" role="alert">
            <p>{saveError}</p>
            {saveUncertain
              ? <button type="button" className="lm-button lm-button--secondary" onClick={retryUnknownSave}
                disabled={saving}>Retry same save</button>
              : <button type="button" className="lm-button lm-button--secondary"
                onClick={retryWorkspaceLoad}
                disabled={dirty || saving}>Reload workspace</button>}
          </div>}
          {status && <p className="lm-feedback" role="status" aria-live="polite">{status}</p>}

          <div className={styles.workspace}>
            <section className={`lm-surface ${styles.recordList}`} aria-labelledby="ongoing-record-list-title">
              <h3 id="ongoing-record-list-title">Service records</h3>
              {workingRecords.length === 0
                ? <p className="lm-empty-state">{deletedRecords.length
                  ? "All existing records are queued for deletion. Save Changes to confirm."
                  : "No Ongoing Maintenance records for this vehicle."}</p>
                : <div className="lm-dense-list" aria-label="Ongoing Maintenance records">
                  {workingRecords.map((record) => (
                    <button key={record.id} type="button"
                      className={`${styles.recordButton} ${selectedRecordId === record.id ? styles.selected : ""}`}
                      aria-current={selectedRecordId === record.id ? "true" : undefined}
                      disabled={saving || saveUncertain}
                      onClick={() => selectRecord(record.id)}>
                      <strong>{record.serviceDate}</strong>
                      <span>{record.usageReadingUnit === "none" || record.usageReadingValue === null
                        ? "No usage reading"
                        : `${record.usageReadingValue} ${record.usageReadingUnit}`}</span>
                      {record.isNew && <span className="lm-badge">New draft</span>}
                    </button>
                  ))}
                </div>}
            </section>

            {selectedRecord ? (
              <form id="vehicles-edit-form" className={`lm-surface ${styles.detail}`}
                onSubmit={saveChanges} noValidate>
                <div className={styles.detailHeading}>
                  <div>
                    <h3>{selectedRecord.isNew ? "New Ongoing Record" : "Ongoing Record"}</h3>
                    <p>Edits remain a draft until Save Changes.</p>
                  </div>
                  <button type="button" className="lm-button lm-button--danger"
                    onClick={queueDelete} disabled={saving || saveUncertain}>Delete Record</button>
                </div>

                <div className={styles.fields}>
                  <label className="lm-form-field" htmlFor="vehicles-service-date">
                    <span className="lm-form-label">Service date</span>
                    <input id="vehicles-service-date" className="lm-form-control" type="date" required
                      value={selectedRecord.serviceDate} disabled={saving || saveUncertain}
                      aria-invalid={!selectedRecord.serviceDate}
                      onChange={(event) => updateRecord(selectedRecord.id, { serviceDate: event.target.value })} />
                  </label>
                  <label className="lm-form-field" htmlFor="vehicles-usage-unit">
                    <span className="lm-form-label">Historical usage unit</span>
                    <select id="vehicles-usage-unit" className="lm-form-control"
                      value={selectedRecord.usageReadingUnit} disabled={saving || saveUncertain}
                      onChange={(event) => updateRecord(selectedRecord.id, {
                        usageReadingUnit: event.target.value,
                        usageReadingValue: event.target.value === "none" ? null : selectedRecord.usageReadingValue,
                      })}>
                      <option value="miles">Miles</option>
                      <option value="hours">Hours</option>
                      <option value="none">No usage reading</option>
                    </select>
                  </label>
                  <label className="lm-form-field" htmlFor="vehicles-usage-value">
                    <span className="lm-form-label">Historical usage value</span>
                    <input id="vehicles-usage-value" className="lm-form-control" type="number" min="0" step="any"
                      value={selectedRecord.usageReadingValue ?? ""}
                      disabled={saving || saveUncertain || selectedRecord.usageReadingUnit === "none"}
                      onChange={(event) => updateRecord(selectedRecord.id, {
                        usageReadingValue: event.target.value === "" ? null : Number(event.target.value),
                      })} />
                  </label>
                  <label className="lm-form-field" htmlFor="vehicles-mechanic">
                    <span className="lm-form-label">Mechanic (optional)</span>
                    <input id="vehicles-mechanic" className="lm-form-control" type="text" maxLength="200"
                      value={selectedRecord.mechanic || ""} disabled={saving || saveUncertain}
                      onChange={(event) => updateRecord(selectedRecord.id, { mechanic: event.target.value || null })} />
                  </label>
                </div>

                <fieldset className={styles.items} disabled={saving || saveUncertain}>
                  <legend>Maintenance Items for this record</legend>
                  {selectedRecord.capturedItems.length
                    ? selectedRecord.capturedItems.map((item) => (
                      <label key={item.maintenanceItemId} className={styles.itemToggle}>
                        <input className="lm-checkbox" type="checkbox" checked={item.isPerformed}
                          aria-label={`Performed: ${item.displayNameSnapshot}`}
                          onChange={(event) => updateItem(selectedRecord.id, item.maintenanceItemId, event.target.checked)} />
                        <span>{item.displayNameSnapshot}</span>
                        <span className="lm-badge">{item.groupSnapshot.replaceAll("_", " ")}</span>
                      </label>
                    ))
                    : <p className="lm-empty-state">No Maintenance Items were captured for this record.</p>}
                </fieldset>

                {dirty && <div className={styles.inlineActions}>
                  <button type="button" className="lm-button lm-button--secondary"
                    onClick={resetDraft} disabled={saving || saveUncertain}>Cancel Changes</button>
                  <button type="submit" className="lm-button lm-button--primary"
                    disabled={saving || saveUncertain}>{saving ? "Saving..." : "Save Changes"}</button>
                </div>}
              </form>
            ) : <section className={`lm-surface ${styles.empty}`} aria-labelledby="ongoing-empty-title">
              <h3 id="ongoing-empty-title">Select or add an Ongoing record</h3>
              <p>This vehicle has no saved Ongoing records yet.</p>
            </section>}
          </div>
        </>
      )}

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="vehicles-confirm-title"
        onCancel={(event) => {
          event.preventDefault();
          if (blocker.state === "blocked" && !confirmation) blocker.reset();
          else setConfirmation(null);
        }}>
        <h2 id="vehicles-confirm-title">{confirmationTitle}</h2>
        <p>{confirmation?.kind === "delete"
          ? "The record will be removed from the draft and deleted only after Save Changes."
          : saveUncertain
            ? "Keep this request and its generated IDs unchanged. Retry the same save to confirm its outcome."
            : saving
              ? "Wait for the current save to finish before leaving this page."
              : "Unsaved changes will be discarded. They will not be saved automatically."}</p>
        <div className={styles.dialogActions}>
          <button type="button" className="lm-button lm-button--secondary"
            onClick={() => {
              if (blocker.state === "blocked" && !confirmation) blocker.reset();
              else setConfirmation(null);
            }}>Stay</button>
          {confirmation?.kind === "delete" && <button type="button" className="lm-button lm-button--danger"
            onClick={finishConfirmation}>Queue Delete</button>}
          {confirmation && confirmation.kind !== "delete" && !saveUncertain && !saving
            && <button type="button" className="lm-button lm-button--danger" onClick={finishConfirmation}>
              Discard and continue
            </button>}
          {blocker.state === "blocked" && !confirmation && !saving && !saveUncertain
            && <button type="button" className="lm-button lm-button--danger" onClick={handleRouteDiscard}>
              Discard changes
            </button>}
        </div>
      </dialog>
    </main>
  );
}
