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
  asset_id_conflict: "This asset ID is already assigned to incompatible data. Keep this draft and contact support.",
  request_id_payload_mismatch: "This request ID was already used for different asset data. Keep this draft and contact support.",
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

function assetErrorMessage(error) {
  if (error?.code === "validation_error") return "Review the asset name and Usage Unit and try again.";
  if (error?.code === "unknown_outcome") {
    return "The create outcome is unknown. Retry the same request; its asset ID will be preserved.";
  }
  if (error?.code === "retryable_transport") {
    return "The create request could not be completed because of a connection issue. Retry the same request.";
  }
  return serviceErrorMessages[error?.code] || "Asset changes could not be confirmed. Your draft is preserved.";
}

function persistedAssetDraft(asset) {
  return { id: asset.id, name: asset.name, usageUnit: asset.usageUnit, version: asset.version, isNew: false };
}

function createAssetDraft() {
  return {
    id: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    name: "",
    usageUnit: "miles",
    version: 1,
    isNew: true,
  };
}

function makeMaintenanceItemDraft(item = null, currentAssetId = "") {
  if (!item) {
    return {
      operation: "create",
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      expectedVersion: null,
      displayName: "",
      group: "routine",
      availabilityMode: "all_assets",
      currentAssetId,
      selectedAssetIds: [],
    };
  }
  return {
    operation: "update",
    id: item.id,
    requestId: crypto.randomUUID(),
    expectedVersion: item.version,
    displayName: item.displayName,
    group: item.group,
    availabilityMode: item.availabilityMode,
    currentAssetId: item.currentAssetId || "",
    selectedAssetIds: [...item.selectedAssetIds].sort(),
  };
}

function maintenanceItemErrorMessage(error) {
  if (error?.code === "validation_error") return "Review the highlighted Maintenance Item details and try again.";
  if (error?.code === "version_conflict") return "This Maintenance Item changed elsewhere. Reload the catalog before trying again.";
  if (error?.code === "authorization_error") return "Your session cannot save this Maintenance Item. Sign in again.";
  if (error?.code === "not_found") return "This Maintenance Item or one of its assets is no longer available. Reload the catalog.";
  if (error?.code === "item_archived_or_unavailable") {
    return "An interval still references this item for an asset that would become unavailable. No changes were saved; the draft is preserved.";
  }
  if (error?.code === "request_id_payload_mismatch") {
    return "This request ID was used for different save values. Reload the catalog and select the item again; your draft is preserved.";
  }
  if (error?.code === "retryable_transport") {
    return "The save could not be confirmed because of a connection issue. Retry the same request.";
  }
  if (error?.code === "unknown_outcome") {
    return "The save outcome is unknown. Retry the exact request before making more changes.";
  }
  if (error?.code === "duplicate_active_item_name") return "An active Maintenance Item already uses this name.";
  return "Maintenance Item changes could not be confirmed. Your draft is preserved.";
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
  const [manageAssetsOpen, setManageAssetsOpen] = useState(false);
  const [manageAssetId, setManageAssetId] = useState("");
  const [manageDraft, setManageDraft] = useState(null);
  const [manageRetryDraft, setManageRetryDraft] = useState(null);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageStatus, setManageStatus] = useState("");
  const [manageMaintenanceItemsOpen, setManageMaintenanceItemsOpen] = useState(false);
  const [maintenanceItems, setMaintenanceItems] = useState(null);
  const [maintenanceItemsLoading, setMaintenanceItemsLoading] = useState(false);
  const [maintenanceItemsError, setMaintenanceItemsError] = useState("");
  const [maintenanceItemsAttempt, setMaintenanceItemsAttempt] = useState(0);
  const [selectedMaintenanceItemId, setSelectedMaintenanceItemId] = useState("");
  const [maintenanceItemDraft, setMaintenanceItemDraft] = useState(null);
  const [maintenanceItemRetryDraft, setMaintenanceItemRetryDraft] = useState(null);
  const [maintenanceItemNeedsReload, setMaintenanceItemNeedsReload] = useState(false);
  const [maintenanceItemSaving, setMaintenanceItemSaving] = useState(false);
  const [maintenanceItemError, setMaintenanceItemError] = useState("");
  const [maintenanceItemStatus, setMaintenanceItemStatus] = useState("");
  const saveLock = useRef(false);
  const dialogRef = useRef(null);
  const assetsDialogRef = useRef(null);
  const assetsNameRef = useRef(null);
  const manageButtonRef = useRef(null);
  const manageMaintenanceItemsButtonRef = useRef(null);
  const maintenanceItemsDialogRef = useRef(null);
  const maintenanceItemNameRef = useRef(null);
  const maintenanceItemsAddButtonRef = useRef(null);
  const manageSaveLock = useRef(false);
  const maintenanceItemSaveLock = useRef(false);

  const baselineById = new Map(baselineRecords.map((record) => [record.id, record]));
  const selectedMaintenanceItem = maintenanceItems?.find((item) => item.id === selectedMaintenanceItemId);
  const maintenanceItemBaseline = maintenanceItems?.find((item) => item.id === maintenanceItemDraft?.id);
  const maintenanceItemDirty = Boolean(maintenanceItemDraft && (
    maintenanceItemDraft.operation === "create"
    || !maintenanceItemBaseline
    || maintenanceItemDraft.displayName !== maintenanceItemBaseline.displayName
    || maintenanceItemDraft.group !== maintenanceItemBaseline.group
    || maintenanceItemDraft.availabilityMode !== maintenanceItemBaseline.availabilityMode
    || maintenanceItemDraft.currentAssetId !== (maintenanceItemBaseline.currentAssetId || "")
    || JSON.stringify(maintenanceItemDraft.selectedAssetIds)
      !== JSON.stringify([...maintenanceItemBaseline.selectedAssetIds].sort())
  ));
  const dirty = deletedRecords.length > 0 || workingRecords.some((record) => (
    record.isNew || recordValue(record) !== recordValue(baselineById.get(record.id) || record)
  ));
  const saveUncertain = retryDraft !== null;
  const manageAssetDraftDirty = manageDraftIsDirty();
  const hasMaintenanceItemDraft = Boolean(maintenanceItemDraft);
  const blocker = useBlocker(() => dirty || saving || saveUncertain
    || maintenanceItemDirty || maintenanceItemSaving || maintenanceItemRetryDraft !== null
    || (manageAssetsOpen && manageAssetDraftDirty) || manageSaving || manageRetryDraft !== null);

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
    const dialog = assetsDialogRef.current;
    if (manageAssetsOpen) {
      if (dialog && !dialog.open) dialog.showModal();
      assetsNameRef.current?.focus();
    } else if (dialog?.open) {
      dialog.close();
    }
  }, [manageAssetsOpen, manageAssetId]);

  useEffect(() => {
    const dialog = maintenanceItemsDialogRef.current;
    if (manageMaintenanceItemsOpen) {
      if (dialog && !dialog.open) dialog.showModal();
      if (hasMaintenanceItemDraft) maintenanceItemNameRef.current?.focus();
      else maintenanceItemsAddButtonRef.current?.focus();
    } else if (dialog?.open) {
      dialog.close();
    }
  }, [manageMaintenanceItemsOpen, hasMaintenanceItemDraft, maintenanceItemDraft?.id]);

  useEffect(() => {
    if (!manageMaintenanceItemsOpen) return undefined;
    let active = true;
    vehiclesService.listMaintenanceItems().then((items) => {
      if (!active) return;
      setMaintenanceItems(items);
    }).catch(() => {
      if (active) setMaintenanceItemsError("Maintenance Items could not be loaded. Retry loading the catalog.");
    }).finally(() => {
      if (active) setMaintenanceItemsLoading(false);
    });
    return () => { active = false; };
  }, [manageMaintenanceItemsOpen, maintenanceItemsAttempt]);

  useEffect(() => {
    if (!dirty && !saving && !saveUncertain && !maintenanceItemDirty
      && !maintenanceItemSaving && !maintenanceItemRetryDraft
      && !(manageAssetsOpen && manageAssetDraftDirty) && !manageSaving && !manageRetryDraft) return undefined;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving, saveUncertain, maintenanceItemDirty, maintenanceItemSaving, maintenanceItemRetryDraft,
    manageAssetsOpen, manageAssetDraftDirty, manageSaving, manageRetryDraft]);

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

  function openManageAssets() {
    if (saving || saveUncertain) return;
    if (dirty) {
      setConfirmation({ kind: "manage-assets-open" });
      return;
    }
    beginManageAssets();
  }

  function beginManageMaintenanceItems() {
    setMaintenanceItems(null);
    setMaintenanceItemsLoading(true);
    setMaintenanceItemsError("");
    setMaintenanceItemError("");
    setMaintenanceItemStatus("");
    setMaintenanceItemDraft(null);
    setMaintenanceItemRetryDraft(null);
    setMaintenanceItemNeedsReload(false);
    setSelectedMaintenanceItemId("");
    setManageMaintenanceItemsOpen(true);
  }

  function openManageMaintenanceItems() {
    if (manageMaintenanceItemsOpen) return;
    if (saving || saveUncertain || manageSaving || manageRetryDraft || maintenanceItemSaving) return;
    if (manageAssetsOpen) {
      if (manageDraftIsDirty()) {
        setConfirmation({ kind: "manage-items-open-assets" });
        return;
      }
      closeManageAssets();
    }
    if (dirty) {
      setConfirmation({ kind: "manage-items-open" });
      return;
    }
    beginManageMaintenanceItems();
  }

  function closeManageMaintenanceItems() {
    if (maintenanceItemsDialogRef.current?.open) maintenanceItemsDialogRef.current.close();
    setManageMaintenanceItemsOpen(false);
    setMaintenanceItems(null);
    setMaintenanceItemsLoading(false);
    setMaintenanceItemsError("");
    setMaintenanceItemError("");
    setMaintenanceItemStatus("");
    setMaintenanceItemDraft(null);
    setMaintenanceItemRetryDraft(null);
    setMaintenanceItemNeedsReload(false);
    setSelectedMaintenanceItemId("");
    manageMaintenanceItemsButtonRef.current?.focus();
  }

  function requestCloseManageMaintenanceItems() {
    if (maintenanceItemSaving) return;
    if (maintenanceItemRetryDraft) {
      setMaintenanceItemError("Resolve the pending save by retrying the same request before closing.");
      return;
    }
    if (maintenanceItemDirty) {
      setConfirmation({ kind: "manage-items-close" });
      return;
    }
    closeManageMaintenanceItems();
  }

  function selectMaintenanceItem(item) {
    if (maintenanceItemSaving || maintenanceItemRetryDraft) return;
    if (maintenanceItemDirty) {
      setConfirmation({ kind: "manage-items-switch", value: item.id });
      return;
    }
    setSelectedMaintenanceItemId(item.id);
    setMaintenanceItemDraft(item.archivedAt ? null : makeMaintenanceItemDraft(item, selectedAssetId));
    setMaintenanceItemNeedsReload(false);
    setMaintenanceItemError("");
    setMaintenanceItemStatus("");
  }

  function startNewMaintenanceItem() {
    if (maintenanceItemDirty || maintenanceItemSaving || maintenanceItemRetryDraft) {
      if (maintenanceItemDirty) setConfirmation({ kind: "manage-items-new" });
      return;
    }
    setSelectedMaintenanceItemId("");
    setMaintenanceItemDraft(makeMaintenanceItemDraft(null, selectedAssetId));
    setMaintenanceItemNeedsReload(false);
    setMaintenanceItemError("");
    setMaintenanceItemStatus("");
  }

  function updateMaintenanceItemDraft(update) {
    if (maintenanceItemNeedsReload || maintenanceItemRetryDraft || maintenanceItemSaving) return;
    setMaintenanceItemDraft((current) => ({ ...current, ...update }));
    setMaintenanceItemError("");
    setMaintenanceItemStatus("");
  }

  function cancelMaintenanceItemDraft() {
    if (!maintenanceItemDraft || maintenanceItemSaving || maintenanceItemRetryDraft) return;
    if (maintenanceItemDraft.operation === "create") {
      setMaintenanceItemDraft(null);
      setSelectedMaintenanceItemId("");
    } else {
      const original = maintenanceItems?.find((item) => item.id === maintenanceItemDraft.id);
      setMaintenanceItemDraft(original ? makeMaintenanceItemDraft(original, selectedAssetId) : null);
      setSelectedMaintenanceItemId(original?.id || "");
    }
    setMaintenanceItemNeedsReload(false);
    setMaintenanceItemError("");
    setMaintenanceItemStatus("Changes canceled. Saved Maintenance Item values are restored.");
  }

  function validateMaintenanceItemDraft(draft) {
    const name = draft.displayName.trim();
    const validAssets = new Set((assets || []).map((asset) => asset.id));
    if (!name || [...name].length > 100 || !["routine", "fluids_drivetrain", "components_other"].includes(draft.group)) {
      setMaintenanceItemError("Enter a nonblank Maintenance Item name of 1-100 characters and choose a valid Group.");
      return false;
    }
    if (!["all_assets", "current_asset_only", "selected_assets"].includes(draft.availabilityMode)) {
      setMaintenanceItemError("Choose a valid applicability option.");
      return false;
    }
    if (draft.availabilityMode === "current_asset_only" && !validAssets.has(draft.currentAssetId)) {
      setMaintenanceItemError("Choose an available asset for Current Asset Only.");
      return false;
    }
    if (draft.availabilityMode === "selected_assets"
      && (!draft.selectedAssetIds.length || draft.selectedAssetIds.some((id) => !validAssets.has(id)))) {
      setMaintenanceItemError("Select one or more available assets.");
      return false;
    }
    return true;
  }

  function updateMaintenanceItemCatalog(item, message) {
    setMaintenanceItems((current) => [...(current || []).filter((entry) => entry.id !== item.id), item]
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id)));
    setSelectedMaintenanceItemId(item.id);
    setMaintenanceItemRetryDraft(null);
    setMaintenanceItemNeedsReload(false);
    setMaintenanceItemError("");
    if (item.archivedAt) {
      setMaintenanceItemDraft(null);
    } else {
      setMaintenanceItemDraft(makeMaintenanceItemDraft(item, selectedAssetId));
    }
    setMaintenanceItemStatus(message);
  }

  async function persistMaintenanceItem(request) {
    if (maintenanceItemSaveLock.current || maintenanceItemSaving) return;
    maintenanceItemSaveLock.current = true;
    setMaintenanceItemSaving(true);
    setMaintenanceItemError("");
    setMaintenanceItemStatus("Saving Maintenance Item...");
    try {
      const result = await vehiclesService.saveMaintenanceItem(request);
      if (!result?.item || !["created", "updated", "archived"].includes(result.status)) {
        throw { code: "unknown_outcome", retryDraft: request };
      }
      const message = result.status === "created" ? "Maintenance Item created."
        : result.status === "archived" ? "Maintenance Item archived."
          : "Maintenance Item changes saved.";
      updateMaintenanceItemCatalog(result.item, message);
    } catch (error) {
      if (error?.retryDraft) setMaintenanceItemRetryDraft(error.retryDraft);
      if (["version_conflict", "not_found", "request_id_payload_mismatch"].includes(error?.code)) {
        setMaintenanceItemNeedsReload(true);
      }
      setMaintenanceItemError(maintenanceItemErrorMessage(error));
      setMaintenanceItemStatus("");
    } finally {
      maintenanceItemSaveLock.current = false;
      setMaintenanceItemSaving(false);
    }
  }

  async function saveMaintenanceItemChanges(event) {
    event?.preventDefault();
    const draft = maintenanceItemDraft;
    if (!draft || maintenanceItemSaveLock.current || maintenanceItemSaving
      || maintenanceItemRetryDraft || maintenanceItemNeedsReload || !maintenanceItemDirty) return;
    if (!validateMaintenanceItemDraft(draft)) return;
    await persistMaintenanceItem({
      operation: draft.operation,
      id: draft.id,
      ...(draft.operation === "update" ? { expectedVersion: draft.expectedVersion } : {}),
      displayName: draft.displayName.trim(),
      group: draft.group,
      availabilityMode: draft.availabilityMode,
      currentAssetId: draft.availabilityMode === "current_asset_only" ? draft.currentAssetId : null,
      selectedAssetIds: draft.availabilityMode === "selected_assets" ? [...draft.selectedAssetIds].sort() : [],
      requestId: draft.requestId,
    });
  }

  function archiveMaintenanceItem(item) {
    if (!item || item.archivedAt || maintenanceItemSaving || maintenanceItemRetryDraft) return;
    persistMaintenanceItem({
      operation: "archive",
      id: item.id,
      expectedVersion: item.version,
      requestId: crypto.randomUUID(),
    });
  }

  function retryMaintenanceItemSave() {
    if (!maintenanceItemRetryDraft || maintenanceItemSaveLock.current) return;
    persistMaintenanceItem(maintenanceItemRetryDraft);
  }

  function reloadMaintenanceItems() {
    setMaintenanceItemsLoading(true);
    setMaintenanceItemsError("");
    setMaintenanceItemsAttempt((attempt) => attempt + 1);
  }

  function beginManageAssets() {
    setManageAssetId(assets?.[0]?.id || "");
    setManageDraft(assets?.length ? persistedAssetDraft(assets[0]) : createAssetDraft());
    setManageRetryDraft(null);
    setManageError("");
    setManageStatus("");
    setManageAssetsOpen(true);
  }

  function manageDraftIsDirty() {
    if (!manageDraft) return false;
    if (manageDraft.isNew) return true;
    const original = assets?.find((asset) => asset.id === manageDraft.id);
    return !original || manageDraft.name !== original.name || manageDraft.usageUnit !== original.usageUnit;
  }

  function requestCloseManageAssets() {
    if (manageSaving) return;
    if (manageDraftIsDirty() || manageRetryDraft) {
      setConfirmation({ kind: "manage-assets-close" });
      return;
    }
    closeManageAssets();
  }

  function closeManageAssets() {
    setManageAssetsOpen(false);
    setManageDraft(null);
    setManageRetryDraft(null);
    setManageError("");
    setManageStatus("");
    manageButtonRef.current?.focus();
  }

  function chooseManageAsset(nextDraft) {
    if (manageSaving || nextDraft.id === manageDraft?.id) return;
    if (manageDraftIsDirty() || manageRetryDraft) {
      setConfirmation({ kind: "manage-assets-switch", value: nextDraft });
      return;
    }
    setManageAssetId(nextDraft.id);
    setManageDraft(nextDraft);
    setManageRetryDraft(null);
    setManageError("");
    setManageStatus("");
  }

  function editManagedAsset(update) {
    setManageDraft((current) => current ? { ...current, ...update } : current);
    setManageError("");
    setManageStatus("");
  }

  async function refreshAssetsAfterSave(savedAsset) {
    let refreshed;
    let listRefreshed = true;
    try {
      refreshed = await vehiclesService.listAssets();
      if (!refreshed.some((asset) => asset.id === savedAsset.id)) {
        refreshed.push(savedAsset);
        listRefreshed = false;
      }
    } catch {
      refreshed = (assets || []).filter((asset) => asset.id !== savedAsset.id);
      refreshed.push(savedAsset);
      listRefreshed = false;
    }
    setAssets(refreshed);
    if (selectedAssetId === savedAsset.id) {
      try {
        const freshWorkspace = await vehiclesService.loadVehicleWorkspace(savedAsset.id);
        const records = copyRecords(freshWorkspace.ongoingMaintenanceRecords);
        setWorkspace(freshWorkspace);
        setBaselineRecords(records);
        setWorkingRecords(copyRecords(records));
        setDeletedRecords([]);
        setSelectedRecordId(vehiclesService.newestRecord(records)?.id || "");
        setWorkspaceError("");
      } catch {
        setWorkspace((current) => current?.asset.id === savedAsset.id
          ? { ...current, asset: savedAsset } : current);
        setWorkspaceError("Asset changes were saved. Reload the workspace to refresh its details.");
      }
    }
    return listRefreshed;
  }

  async function saveManagedAsset(event) {
    event?.preventDefault();
    if (!manageDraft || manageSaveLock.current || manageSaving || !manageDraftIsDirty()) return;
    const name = manageDraft.name.trim();
    if (!name || [...name].length > 120 || !["miles", "hours", "none"].includes(manageDraft.usageUnit)) {
      setManageError("Enter a nonblank asset name of 1–120 characters and choose a supported Usage Unit.");
      return;
    }
    manageSaveLock.current = true;
    setManageSaving(true);
    setManageError("");
    setManageStatus(manageDraft.isNew ? "Creating asset..." : "Saving asset changes...");
    try {
      let savedAsset;
      if (manageDraft.isNew) {
        const result = await vehiclesService.createAsset({
          id: manageDraft.id,
          requestId: manageRetryDraft?.requestId || manageDraft.requestId,
          name,
          usageUnit: manageDraft.usageUnit,
        });
        savedAsset = result.asset;
      } else {
        const current = assets?.find((asset) => asset.id === manageDraft.id);
        if (!current) throw { code: "not_found" };
        const draft = createVehicleChangesDraft({ asset: current });
        draft.assetPatch = { name, usageUnit: manageDraft.usageUnit };
        const retry = manageRetryDraft || draft;
        const result = await vehiclesService.saveVehicleChanges(retry);
        if (result.status !== "saved") {
          setManageStatus("There are no asset changes to save.");
          return;
        }
        savedAsset = { ...current, name, usageUnit: manageDraft.usageUnit, version: result.assetVersion };
      }
      const assetsRefreshed = await refreshAssetsAfterSave(savedAsset);
      if (!assetsRefreshed) {
        setAssetError("The asset was saved, but the asset list could not be refreshed. Retry loading assets.");
      }
      setManageStatus("Asset saved.");
      if (manageDraft.isNew) {
        setSelectedAssetId(savedAsset.id);
        setWorkspace(null);
        setWorkspaceLoading(true);
        setWorkspaceError("");
      }
      closeManageAssets();
    } catch (error) {
      if (error?.retryDraft) setManageRetryDraft(error.retryDraft);
      setManageError(assetErrorMessage(error));
      setManageStatus("");
    } finally {
      manageSaveLock.current = false;
      setManageSaving(false);
    }
  }

  function retryManagedAsset() {
    if (!manageRetryDraft || manageSaveLock.current) return;
    saveManagedAsset();
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
    if (action.kind === "manage-assets-open") {
      resetDraft();
      beginManageAssets();
    } else if (action.kind === "manage-items-open") {
      resetDraft();
      beginManageMaintenanceItems();
    } else if (action.kind === "manage-items-open-assets") {
      closeManageAssets();
      beginManageMaintenanceItems();
    } else if (action.kind === "manage-items-close") {
      closeManageMaintenanceItems();
    } else if (action.kind === "manage-items-switch") {
      const item = maintenanceItems?.find((entry) => entry.id === action.value);
      setSelectedMaintenanceItemId(item?.id || "");
      setMaintenanceItemDraft(item && !item.archivedAt
        ? makeMaintenanceItemDraft(item, selectedAssetId) : null);
      setMaintenanceItemNeedsReload(false);
      setMaintenanceItemError("");
      setMaintenanceItemStatus("");
    } else if (action.kind === "manage-items-new") {
      setSelectedMaintenanceItemId("");
      setMaintenanceItemDraft(makeMaintenanceItemDraft(null, selectedAssetId));
      setMaintenanceItemNeedsReload(false);
      setMaintenanceItemError("");
      setMaintenanceItemStatus("");
    } else if (action.kind === "maintenance-item-archive") {
      archiveMaintenanceItem(action.value);
    } else if (action.kind === "manage-assets-close") {
      closeManageAssets();
    } else if (action.kind === "manage-assets-switch") {
      setManageAssetId(action.value.id);
      setManageDraft(action.value);
      setManageRetryDraft(null);
      setManageError("");
      setManageStatus("");
    } else if (action.kind === "asset") {
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
    if (saveUncertain || saving || maintenanceItemSaving || maintenanceItemRetryDraft) return;
    resetDraft();
    if (maintenanceItemDirty) closeManageMaintenanceItems();
    if (manageAssetsOpen && manageDraftIsDirty()) closeManageAssets();
    blocker.proceed();
  }

  const selectedRecord = workingRecords.find((record) => record.id === selectedRecordId);
  const confirmationTitle = confirmation?.kind === "delete"
    ? "Queue deletion of this Ongoing record?"
    : confirmation?.kind === "maintenance-item-archive"
      ? "Archive this Maintenance Item?"
      : confirmation?.kind === "manage-items-close"
        ? "Discard Maintenance Item edits?"
        : confirmation?.kind === "manage-items-switch"
          ? "Discard Maintenance Item edits and switch?"
          : confirmation?.kind === "manage-items-new"
            ? "Discard Maintenance Item edits and start a new item?"
            : confirmation?.kind === "manage-items-open"
              ? "Discard Ongoing Maintenance edits and manage Maintenance Items?"
              : confirmation?.kind === "manage-items-open-assets"
                ? "Discard Asset edits and manage Maintenance Items?"
    : confirmation?.kind === "manage-assets-open"
      ? "Discard Ongoing Maintenance edits and manage assets?"
      : confirmation?.kind === "manage-assets-close"
        ? "Discard asset edits?"
        : confirmation?.kind === "manage-assets-switch"
          ? "Discard asset edits and switch?"
          : confirmation?.kind === "asset"
      ? "Discard changes and switch assets?"
      : confirmation?.kind === "record"
        ? "Discard changes and switch records?"
        : maintenanceItemRetryDraft
          ? "Maintenance Item save outcome needs confirmation"
          : maintenanceItemSaving
            ? "Maintenance Item save is in progress"
          : saveUncertain
          ? "Save outcome needs confirmation"
          : saving ? "Save is in progress" : "Discard unsaved Vehicles changes?";

  return (
    <main className={styles.page}>
      <PageHeader id="vehicles-page-title" title="Vehicles"
        subtitle="Ongoing Maintenance records for your vehicles."
        actions={(
          <>
            <button ref={manageButtonRef} type="button" className="lm-button lm-button--secondary"
              onClick={openManageAssets} disabled={saving || saveUncertain || manageSaving
                || maintenanceItemSaving || manageMaintenanceItemsOpen}>Manage Assets</button>
            <button ref={manageMaintenanceItemsButtonRef} type="button" className="lm-button lm-button--secondary"
              onClick={openManageMaintenanceItems} disabled={saving || saveUncertain || manageSaving
                || manageRetryDraft || maintenanceItemSaving}>Manage Maintenance Items</button>
            {dirty && <button type="button" className="lm-button lm-button--secondary"
              onClick={resetDraft} disabled={saving || saveUncertain}>Cancel Changes</button>
            }
            {dirty && <button type="submit" form="vehicles-edit-form" className="lm-button lm-button--primary"
              disabled={!dirty || saving || workspaceLoading || saveUncertain}>
              {saving ? "Saving..." : "Save Changes"}
            </button>}
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
        <p>Add a vehicle or small engine to begin its maintenance workspace.</p>
        <button ref={manageButtonRef} type="button" className="lm-button lm-button--primary"
          onClick={openManageAssets} disabled={saving || saveUncertain}>Add an asset</button>
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

      <dialog ref={assetsDialogRef} className={`${styles.dialog} ${styles.assetsDialog}`}
        aria-labelledby="vehicles-manage-assets-title" onCancel={(event) => {
          event.preventDefault();
          requestCloseManageAssets();
        }}>
        <div className={styles.detailHeading}>
          <div>
            <h2 id="vehicles-manage-assets-title">Manage Assets</h2>
            <p>Vehicles and small engines share the same asset list.</p>
          </div>
          <button type="button" className="lm-button lm-button--secondary" onClick={requestCloseManageAssets}
            disabled={manageSaving} aria-label="Close Manage Assets">Close</button>
        </div>
        <div className={styles.assetManager}>
          <section aria-label="Assets">
            <div className={styles.sectionHeading}>
              <h3>Assets</h3>
              <button type="button" className="lm-button lm-button--secondary" onClick={() => {
                chooseManageAsset(createAssetDraft());
              }} disabled={manageSaving || Boolean(manageRetryDraft)}>Add Asset</button>
            </div>
            {assets?.length
              ? <div className={styles.managedAssetList} role="list" aria-label="Saved assets">
                {assets.map((asset) => <button key={asset.id} type="button" role="listitem"
                  className={`${styles.managedAsset} ${manageAssetId === asset.id ? styles.managedAssetSelected : ""}`}
                  aria-pressed={manageAssetId === asset.id}
                  onClick={() => chooseManageAsset(persistedAssetDraft(asset))}
                  disabled={manageSaving || Boolean(manageRetryDraft)}>
                  <strong>{asset.name}</strong><span>{asset.usageUnit}</span>
                </button>)}
              </div>
              : <p className="lm-empty-state">No saved assets yet.</p>}
          </section>
          {manageDraft && <form className={styles.assetForm} onSubmit={saveManagedAsset} noValidate>
            <h3>{manageDraft.isNew ? "New Asset" : "Edit Asset"}</h3>
            <label className="lm-form-field" htmlFor="vehicles-managed-asset-name">
              <span className="lm-form-label">Asset name</span>
              <input ref={assetsNameRef} id="vehicles-managed-asset-name" className="lm-form-control"
                type="text" maxLength="120" required value={manageDraft.name}
                aria-invalid={Boolean(manageError && (!manageDraft.name.trim() || [...manageDraft.name.trim()].length > 120))}
                onChange={(event) => editManagedAsset({ name: event.target.value })}
                disabled={manageSaving || Boolean(manageRetryDraft)} />
            </label>
            <label className="lm-form-field" htmlFor="vehicles-managed-asset-unit">
              <span className="lm-form-label">Usage Unit</span>
              <select id="vehicles-managed-asset-unit" className="lm-form-control"
                value={manageDraft.usageUnit} onChange={(event) => editManagedAsset({ usageUnit: event.target.value })}
                disabled={manageSaving || Boolean(manageRetryDraft)}>
                <option value="miles">Miles</option>
                <option value="hours">Hours</option>
                <option value="none">None</option>
              </select>
            </label>
            {manageError && <p className="lm-feedback lm-feedback--error" role="alert">{manageError}</p>}
            {manageStatus && <p className="lm-feedback" role="status" aria-live="polite">{manageStatus}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className="lm-button lm-button--secondary" onClick={() => {
                if (manageDraft.isNew) {
                  setManageDraft(assets?.length ? persistedAssetDraft(assets[0]) : createAssetDraft());
                  setManageAssetId(assets?.[0]?.id || "");
                } else {
                  setManageDraft(persistedAssetDraft(assets.find((asset) => asset.id === manageDraft.id)));
                }
                setManageRetryDraft(null);
                setManageError("");
                setManageStatus("Asset edits canceled. Saved values are restored.");
              }} disabled={manageSaving || Boolean(manageRetryDraft)}>Cancel</button>
              {manageRetryDraft && <button type="button" className="lm-button lm-button--secondary"
                onClick={retryManagedAsset} disabled={manageSaving}>Retry same request</button>}
              <button type="submit" className="lm-button lm-button--primary"
                disabled={manageSaving || Boolean(manageRetryDraft) || !manageDraftIsDirty()}>
                {manageSaving ? "Saving..." : manageDraft.isNew ? "Save Asset" : "Save Changes"}
              </button>
            </div>
          </form>}
        </div>
      </dialog>

      <dialog ref={maintenanceItemsDialogRef} className={`${styles.dialog} ${styles.maintenanceItemsDialog}`}
        aria-labelledby="vehicles-manage-items-title" onCancel={(event) => {
          event.preventDefault();
          requestCloseManageMaintenanceItems();
        }}>
        <div className={styles.detailHeading}>
          <div>
            <h2 id="vehicles-manage-items-title">Manage Maintenance Items</h2>
            <p>Changes apply to future Ongoing drafts. Saved history keeps its captured item details.</p>
          </div>
          <button type="button" className="lm-button lm-button--secondary"
            onClick={requestCloseManageMaintenanceItems} disabled={maintenanceItemSaving}
            aria-label="Close Manage Maintenance Items">Close</button>
        </div>

        {maintenanceItemsLoading && <p className="lm-loading-state" role="status">Loading Maintenance Items...</p>}
        {maintenanceItemsError && <div className="lm-feedback lm-feedback--error" role="alert">
          <p>{maintenanceItemsError}</p>
          <button type="button" className="lm-button lm-button--secondary" onClick={reloadMaintenanceItems}>
            Retry loading catalog
          </button>
        </div>}

        {!maintenanceItemsLoading && maintenanceItems && (!maintenanceItemsError || maintenanceItemDraft) && (
          <div className={styles.maintenanceItemManager}>
            <section aria-label="Maintenance Item catalog">
              <div className={styles.sectionHeading}>
                <h3>Catalog</h3>
                <button ref={maintenanceItemsAddButtonRef} type="button" className="lm-button lm-button--secondary"
                  onClick={startNewMaintenanceItem}
                  disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft) || maintenanceItemNeedsReload}>
                  Add Maintenance Item
                </button>
              </div>
              {maintenanceItems.length === 0
                ? <p className="lm-empty-state">No saved Maintenance Items yet.</p>
                : <ul className={styles.maintenanceItemList} aria-label="Saved Maintenance Items">
                  {[...maintenanceItems].sort((left, right) => left.displayName.localeCompare(right.displayName)
                    || left.id.localeCompare(right.id)).map((item) => (
                    <li key={item.id}>
                      <button type="button"
                        className={`${styles.managedAsset} ${selectedMaintenanceItemId === item.id
                          ? styles.managedAssetSelected : ""}`}
                        aria-pressed={selectedMaintenanceItemId === item.id}
                        onClick={() => selectMaintenanceItem(item)}
                        disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft)}>
                        <strong>{item.displayName}</strong>
                        <span>{item.group.replaceAll("_", " ")} · {item.archivedAt ? "Archived" : "Active"}</span>
                      </button>
                    </li>
                  ))}
                </ul>}
            </section>

            {maintenanceItemDraft ? (
              <form className={styles.maintenanceItemForm} onSubmit={saveMaintenanceItemChanges} noValidate>
                <h3>{maintenanceItemDraft.operation === "create" ? "New Maintenance Item" : "Edit Maintenance Item"}</h3>
                <label className="lm-form-field" htmlFor="vehicles-maintenance-item-name">
                  <span className="lm-form-label">Name</span>
                  <input ref={maintenanceItemNameRef} id="vehicles-maintenance-item-name" className="lm-form-control"
                    type="text" maxLength="100" required value={maintenanceItemDraft.displayName}
                    aria-invalid={Boolean(maintenanceItemError && (!maintenanceItemDraft.displayName.trim()
                      || [...maintenanceItemDraft.displayName.trim()].length > 100))}
                    aria-describedby={maintenanceItemError ? "vehicles-maintenance-item-error" : undefined}
                    onChange={(event) => updateMaintenanceItemDraft({ displayName: event.target.value })}
                    disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft) || maintenanceItemNeedsReload} />
                </label>
                <label className="lm-form-field" htmlFor="vehicles-maintenance-item-group">
                  <span className="lm-form-label">Group</span>
                  <select id="vehicles-maintenance-item-group" className="lm-form-control"
                    value={maintenanceItemDraft.group}
                    aria-invalid={Boolean(maintenanceItemError
                      && !["routine", "fluids_drivetrain", "components_other"].includes(maintenanceItemDraft.group))}
                    aria-describedby={maintenanceItemError ? "vehicles-maintenance-item-error" : undefined}
                    onChange={(event) => updateMaintenanceItemDraft({ group: event.target.value })}
                    disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft) || maintenanceItemNeedsReload}>
                    <option value="routine">Routine</option>
                    <option value="fluids_drivetrain">Fluids &amp; drivetrain</option>
                    <option value="components_other">Components &amp; other</option>
                  </select>
                </label>
                <label className="lm-form-field" htmlFor="vehicles-maintenance-item-applicability">
                  <span className="lm-form-label">Applicability</span>
                  <select id="vehicles-maintenance-item-applicability" className="lm-form-control"
                    value={maintenanceItemDraft.availabilityMode}
                    aria-describedby={maintenanceItemError ? "vehicles-maintenance-item-error" : undefined}
                    onChange={(event) => updateMaintenanceItemDraft({
                      availabilityMode: event.target.value,
                      currentAssetId: event.target.value === "current_asset_only" ? selectedAssetId : "",
                    })}
                    disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft) || maintenanceItemNeedsReload}>
                    <option value="all_assets">All Assets</option>
                    <option value="current_asset_only">Current Asset Only</option>
                    <option value="selected_assets">Selected Assets</option>
                  </select>
                </label>
                {maintenanceItemDraft.availabilityMode === "current_asset_only" && (
                  <p className="lm-feedback" role="status">
                    Current asset: {assets?.find((asset) => asset.id === maintenanceItemDraft.currentAssetId)?.name
                      || "No asset is currently selected."}
                  </p>
                )}
                {maintenanceItemDraft.availabilityMode === "selected_assets" && (
                  <fieldset className={styles.maintenanceItemAssets}>
                    <legend>Selected Assets</legend>
                    {!assets?.length && <p>No assets are available to select.</p>}
                    {assets?.map((asset) => (
                      <label key={asset.id} className={styles.maintenanceItemAsset}>
                        <input id={`vehicles-maintenance-item-asset-${asset.id}`} type="checkbox"
                          checked={maintenanceItemDraft.selectedAssetIds.includes(asset.id)}
                          onChange={(event) => {
                            const selectedAssetIds = event.target.checked
                              ? [...new Set([...maintenanceItemDraft.selectedAssetIds, asset.id])].sort()
                              : maintenanceItemDraft.selectedAssetIds.filter((id) => id !== asset.id);
                            updateMaintenanceItemDraft({ selectedAssetIds });
                          }}
                          disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft) || maintenanceItemNeedsReload} />
                        <span>{asset.name}</span>
                      </label>
                    ))}
                  </fieldset>
                )}

                {maintenanceItemError && <p id="vehicles-maintenance-item-error"
                  className="lm-feedback lm-feedback--error" role="alert">{maintenanceItemError}</p>}
                {maintenanceItemStatus && <p className="lm-feedback" role="status" aria-live="polite">
                  {maintenanceItemStatus}
                </p>}
                {maintenanceItemNeedsReload && <div className="lm-feedback" role="status" aria-live="polite">
                  <p>Refresh the catalog, then select an item again to safely resume editing.</p>
                  <button type="button" className="lm-button lm-button--secondary" onClick={reloadMaintenanceItems}
                    disabled={maintenanceItemsLoading}>Reload catalog</button>
                </div>}
                <div className={styles.dialogActions}>
                  <button type="button" className="lm-button lm-button--secondary"
                    onClick={cancelMaintenanceItemDraft}
                    disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft)
                      || maintenanceItemNeedsReload}>Cancel</button>
                  {maintenanceItemRetryDraft && <button type="button" className="lm-button lm-button--secondary"
                    onClick={retryMaintenanceItemSave} disabled={maintenanceItemSaving}>Retry same request</button>}
                  <button type="submit" className="lm-button lm-button--primary"
                    disabled={maintenanceItemSaving || Boolean(maintenanceItemRetryDraft)
                      || maintenanceItemNeedsReload || !maintenanceItemDirty}>
                    {maintenanceItemSaving ? "Saving..." : maintenanceItemDraft.operation === "create"
                      ? "Save Maintenance Item" : "Save Changes"}
                  </button>
                  {maintenanceItemDraft.operation === "update" && !selectedMaintenanceItem?.archivedAt && (
                    <button type="button" className={`lm-button lm-button--danger ${styles.archiveAction}`}
                      aria-label="Archive"
                      onClick={() => setConfirmation({ kind: "maintenance-item-archive", value: selectedMaintenanceItem })}
                      disabled={maintenanceItemDirty || maintenanceItemSaving || Boolean(maintenanceItemRetryDraft)
                        || maintenanceItemNeedsReload}>
                      Archive
                    </button>
                  )}
                </div>
              </form>
            ) : selectedMaintenanceItem?.archivedAt ? (
              <section className={`lm-surface ${styles.maintenanceItemReadOnly}`} aria-label="Archived Maintenance Item">
                <h3>{selectedMaintenanceItem.displayName}</h3>
                <p>{selectedMaintenanceItem.group.replaceAll("_", " ")}</p>
                <p><strong>Archived</strong> — unavailable to future Ongoing drafts.</p>
              </section>
            ) : (
              <section className={`lm-surface ${styles.maintenanceItemReadOnly}`}>
                <h3>{maintenanceItems.length ? "Select a Maintenance Item" : "Catalog is empty"}</h3>
                <p>Maintenance Item edits affect future Ongoing drafts only. Existing history is not changed.</p>
              </section>
            )}
          </div>
        )}
      </dialog>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="vehicles-confirm-title"
        onCancel={(event) => {
          event.preventDefault();
          if (blocker.state === "blocked" && !confirmation) blocker.reset();
          else setConfirmation(null);
        }}>
        <h2 id="vehicles-confirm-title">{confirmationTitle}</h2>
        <p>{confirmation?.kind === "delete"
          ? "The record will be removed from the draft and deleted only after Save Changes."
          : confirmation?.kind === "maintenance-item-archive"
            ? "The item will be archived, not deleted. It remains available to historical records and is excluded from future Ongoing drafts."
          : confirmation?.kind === "manage-items-open"
            ? "Unsaved Ongoing Maintenance edits will be discarded only if you choose the discard action. No item is saved automatically."
          : confirmation?.kind === "manage-items-open-assets"
            ? "Unsaved Asset edits will be discarded only if you choose the discard action. No asset is removed from the account."
          : confirmation?.kind?.startsWith("manage-items")
            ? "Unsaved Maintenance Item values will be discarded only if you choose the discard action. No item is saved automatically."
          : confirmation?.kind?.startsWith("manage-assets")
            ? "Unsaved changes will be discarded only if you choose the discard action. No asset is removed from the account."
          : saveUncertain
            ? "Keep this request and its generated IDs unchanged. Retry the same save to confirm its outcome."
            : saving || maintenanceItemSaving
              ? "Wait for the current save to finish before leaving this page."
              : "Unsaved changes will be discarded. They will not be saved automatically."}</p>
        <div className={styles.dialogActions}>
          <button type="button" className="lm-button lm-button--secondary"
            onClick={() => {
              if (blocker.state === "blocked" && !confirmation) blocker.reset();
              else setConfirmation(null);
            }}>Stay</button>
          {(confirmation?.kind === "delete" || confirmation?.kind === "maintenance-item-archive") && (
            <button type="button" className={`lm-button lm-button--danger ${styles.archiveAction}`}
              aria-label="Archive Maintenance Item" onClick={finishConfirmation}>
              {confirmation.kind === "delete" ? "Queue Delete" : "Archive Maintenance Item"}
            </button>
          )}
          {confirmation && confirmation.kind !== "delete" && !saveUncertain && !saving
            && !maintenanceItemSaving && !maintenanceItemRetryDraft
            && confirmation.kind !== "maintenance-item-archive" && <button type="button"
              className="lm-button lm-button--danger" onClick={finishConfirmation}>
              {["manage-items-close", "manage-items-switch", "manage-items-new"].includes(confirmation.kind)
                ? "Discard edits" : "Discard and continue"}
            </button>}
          {blocker.state === "blocked" && !confirmation && !saving && !saveUncertain
            && !maintenanceItemSaving && !maintenanceItemRetryDraft
            && <button type="button" className="lm-button lm-button--danger" onClick={handleRouteDiscard}>
              Discard changes
            </button>}
        </div>
      </dialog>
    </main>
  );
}
