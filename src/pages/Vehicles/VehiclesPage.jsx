import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

import PageHeader from "../../components/layout/PageHeader.jsx";
import {
  buildRecordDeleteOperation,
  createVehicleChangesDraft,
  vehiclesService,
} from "../../services/vehiclesService.js";

import styles from "./VehiclesPage.module.css";

const ongoingItemGroups = [
  { group: "routine", title: "Routine" },
  { group: "fluids_drivetrain", title: "Fluids & Drivetrain" },
  { group: "components_other", title: "Components & Other" },
];

const vehicleSections = [
  { id: "ongoing", label: "Ongoing Maintenance" },
  { id: "recommended", label: "Recommended Service" },
  { id: "completed", label: "Completed Service" },
  { id: "intervals", label: "Maintenance Intervals" },
  { id: "key-information", label: "Key Information" },
];

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

function makeMaintenanceIntervalDraft(interval = null) {
  if (!interval) {
    return {
      operation: "create",
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      expectedVersion: null,
      maintenanceItemId: "",
      intervalValue: "",
      intervalUnit: "miles",
      comments: "",
    };
  }
  return {
    operation: "update",
    id: interval.id,
    requestId: crypto.randomUUID(),
    expectedVersion: interval.version,
    maintenanceItemId: interval.maintenanceItemId,
    intervalValue: String(interval.recommendedInterval.value),
    intervalUnit: interval.recommendedInterval.unit,
    comments: interval.comments || "",
  };
}

function maintenanceIntervalSummary(interval) {
  if (interval.nextService?.kind === "usage") {
    return `Next at ${interval.nextService.value} ${interval.nextService.unit}`;
  }
  if (interval.nextService?.kind === "date") {
    return `Next on ${interval.nextService.serviceDate}`;
  }
  if (interval.notCalculatedReason === "usage_unit_mismatch") return "Latest reading uses a different unit";
  if (interval.notCalculatedReason === "usage_reading_missing") return "Latest service has no usage reading";
  return "No qualifying service yet";
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

function maintenanceIntervalErrorMessage(error) {
  if (error?.code === "validation_error") return "Review the highlighted interval details and try again.";
  if (error?.code === "version_conflict") return "This interval changed elsewhere. Reload it before trying again.";
  if (error?.code === "authorization_error") return "Your session cannot save this interval. Sign in again.";
  if (error?.code === "not_found") return "The asset, Maintenance Item, or interval is no longer available. Reload the workspace.";
  if (error?.code === "item_archived_or_unavailable") {
    return "This Maintenance Item is no longer active and applicable to this asset. No changes were saved; reload the workspace.";
  }
  if (error?.code === "duplicate_interval") return "An interval already exists for this Maintenance Item and asset.";
  if (error?.code === "request_id_payload_mismatch") {
    return "This request ID was used for different interval values. Reload the workspace before continuing.";
  }
  if (error?.code === "retryable_transport") {
    return "The save could not be confirmed because of a connection issue. Retry the same request.";
  }
  if (error?.code === "unknown_outcome") {
    return "The save outcome is unknown. Retry the exact request before making more changes.";
  }
  return "Maintenance Interval changes could not be confirmed. Your draft is preserved.";
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
  const [ongoingEditing, setOngoingEditing] = useState(false);
  const [activeSection, setActiveSection] = useState("ongoing");
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
  const [manageMaintenanceIntervalsOpen, setManageMaintenanceIntervalsOpen] = useState(false);
  const [selectedMaintenanceIntervalId, setSelectedMaintenanceIntervalId] = useState("");
  const [maintenanceIntervalDraft, setMaintenanceIntervalDraft] = useState(null);
  const [maintenanceIntervalRetryDraft, setMaintenanceIntervalRetryDraft] = useState(null);
  const [maintenanceIntervalNeedsReload, setMaintenanceIntervalNeedsReload] = useState(false);
  const [maintenanceIntervalsLoading, setMaintenanceIntervalsLoading] = useState(false);
  const [maintenanceIntervalSaving, setMaintenanceIntervalSaving] = useState(false);
  const [maintenanceIntervalError, setMaintenanceIntervalError] = useState("");
  const [maintenanceIntervalStatus, setMaintenanceIntervalStatus] = useState("");
  const saveLock = useRef(false);
  const dialogRef = useRef(null);
  const assetsDialogRef = useRef(null);
  const assetsNameRef = useRef(null);
  const manageButtonRef = useRef(null);
  const manageMaintenanceItemsButtonRef = useRef(null);
  const maintenanceItemsDialogRef = useRef(null);
  const maintenanceItemNameRef = useRef(null);
  const maintenanceItemsAddButtonRef = useRef(null);
  const maintenanceIntervalsDialogRef = useRef(null);
  const maintenanceIntervalItemRef = useRef(null);
  const maintenanceIntervalsAddButtonRef = useRef(null);
  const manageMaintenanceIntervalsButtonRef = useRef(null);
  const manageSaveLock = useRef(false);
  const maintenanceItemSaveLock = useRef(false);
  const maintenanceIntervalSaveLock = useRef(false);

  const baselineById = new Map(baselineRecords.map((record) => [record.id, record]));
  const selectedMaintenanceItem = maintenanceItems?.find((item) => item.id === selectedMaintenanceItemId);
  const maintenanceItemBaseline = maintenanceItems?.find((item) => item.id === maintenanceItemDraft?.id);
  const maintenanceIntervals = workspace?.maintenanceIntervals || [];
  const selectedMaintenanceInterval = maintenanceIntervals.find((interval) =>
    interval.id === selectedMaintenanceIntervalId);
  const maintenanceIntervalBaseline = maintenanceIntervals.find((interval) =>
    interval.id === maintenanceIntervalDraft?.id);
  const hasMaintenanceIntervalDraft = Boolean(maintenanceIntervalDraft);
  const maintenanceIntervalDirty = Boolean(maintenanceIntervalDraft && (
    maintenanceIntervalDraft.operation === "create"
    || !maintenanceIntervalBaseline
    || maintenanceIntervalDraft.maintenanceItemId !== maintenanceIntervalBaseline.maintenanceItemId
    || maintenanceIntervalDraft.intervalValue !== String(maintenanceIntervalBaseline.recommendedInterval.value)
    || maintenanceIntervalDraft.intervalUnit !== maintenanceIntervalBaseline.recommendedInterval.unit
    || maintenanceIntervalDraft.comments !== (maintenanceIntervalBaseline.comments || "")
  ));
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
    || maintenanceIntervalDirty || maintenanceIntervalSaving || maintenanceIntervalRetryDraft !== null
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
    const dialog = maintenanceIntervalsDialogRef.current;
    if (manageMaintenanceIntervalsOpen) {
      if (dialog && !dialog.open) dialog.showModal();
      if (hasMaintenanceIntervalDraft) maintenanceIntervalItemRef.current?.focus();
      else maintenanceIntervalsAddButtonRef.current?.focus();
    } else if (dialog?.open) {
      dialog.close();
    }
  }, [manageMaintenanceIntervalsOpen, hasMaintenanceIntervalDraft, maintenanceIntervalDraft?.id]);

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
      && !maintenanceItemSaving && !maintenanceItemRetryDraft && !maintenanceIntervalDirty
      && !maintenanceIntervalSaving && !maintenanceIntervalRetryDraft
      && !(manageAssetsOpen && manageAssetDraftDirty) && !manageSaving && !manageRetryDraft) return undefined;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving, saveUncertain, maintenanceItemDirty, maintenanceItemSaving, maintenanceItemRetryDraft,
    maintenanceIntervalDirty, maintenanceIntervalSaving, maintenanceIntervalRetryDraft,
    manageAssetsOpen, manageAssetDraftDirty, manageSaving, manageRetryDraft]);

  function resetDraft() {
    setWorkingRecords(copyRecords(baselineRecords));
    setDeletedRecords([]);
    setSelectedRecordId(vehiclesService.newestRecord(baselineRecords)?.id || "");
    setOngoingEditing(false);
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
    setOngoingEditing(false);
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

  function beginManageMaintenanceIntervals() {
    setSelectedMaintenanceIntervalId("");
    setMaintenanceIntervalDraft(null);
    setMaintenanceIntervalRetryDraft(null);
    setMaintenanceIntervalNeedsReload(false);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("");
    setManageMaintenanceIntervalsOpen(true);
  }

  function openManageMaintenanceIntervals() {
    if (manageMaintenanceIntervalsOpen) return;
    if (!workspace || workspaceLoading || saving || saveUncertain || manageSaving || manageRetryDraft
      || maintenanceItemSaving || maintenanceItemRetryDraft || maintenanceIntervalSaving
      || maintenanceIntervalRetryDraft) return;
    if (manageAssetsOpen) {
      if (manageDraftIsDirty()) {
        setConfirmation({ kind: "manage-intervals-open-assets" });
        return;
      }
      closeManageAssets();
    }
    if (manageMaintenanceItemsOpen) {
      if (maintenanceItemDirty) {
        setConfirmation({ kind: "manage-intervals-open-items" });
        return;
      }
      closeManageMaintenanceItems();
    }
    if (dirty) {
      setConfirmation({ kind: "manage-intervals-open" });
      return;
    }
    beginManageMaintenanceIntervals();
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

  function closeManageMaintenanceIntervals() {
    if (maintenanceIntervalsDialogRef.current?.open) maintenanceIntervalsDialogRef.current.close();
    setManageMaintenanceIntervalsOpen(false);
    setSelectedMaintenanceIntervalId("");
    setMaintenanceIntervalDraft(null);
    setMaintenanceIntervalRetryDraft(null);
    setMaintenanceIntervalNeedsReload(false);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("");
    manageMaintenanceIntervalsButtonRef.current?.focus();
  }

  function requestCloseManageMaintenanceIntervals() {
    if (maintenanceIntervalSaving) return;
    if (maintenanceIntervalRetryDraft) {
      setMaintenanceIntervalError("Resolve the pending save by retrying the same request before closing.");
      return;
    }
    if (maintenanceIntervalDirty) {
      setConfirmation({ kind: "manage-intervals-close" });
      return;
    }
    closeManageMaintenanceIntervals();
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

  function requestReloadMaintenanceIntervals() {
    if (maintenanceIntervalDirty) {
      setConfirmation({ kind: "manage-intervals-reload" });
      return;
    }
    reloadMaintenanceIntervals();
  }

  function discardIntervalDraftAndReload() {
    setMaintenanceIntervalDraft(null);
    setSelectedMaintenanceIntervalId("");
    setMaintenanceIntervalRetryDraft(null);
    setMaintenanceIntervalNeedsReload(false);
    setConfirmation(null);
    reloadMaintenanceIntervals();
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

  function selectMaintenanceInterval(intervalId) {
    if (maintenanceIntervalSaving || maintenanceIntervalRetryDraft || maintenanceIntervalNeedsReload) return;
    if (maintenanceIntervalDirty) {
      setConfirmation({ kind: "manage-intervals-switch", value: intervalId });
      return;
    }
    const interval = maintenanceIntervals.find((entry) => entry.id === intervalId);
    setSelectedMaintenanceIntervalId(interval?.id || "");
    setMaintenanceIntervalDraft(interval ? makeMaintenanceIntervalDraft(interval) : null);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("");
  }

  function startNewMaintenanceInterval() {
    if (maintenanceIntervalSaving || maintenanceIntervalRetryDraft || maintenanceIntervalNeedsReload) return;
    if (maintenanceIntervalDirty) {
      setConfirmation({ kind: "manage-intervals-new" });
      return;
    }
    setSelectedMaintenanceIntervalId("");
    setMaintenanceIntervalDraft({
      ...makeMaintenanceIntervalDraft(),
      intervalUnit: workspace.asset.usageUnit === "none" ? "months" : workspace.asset.usageUnit,
    });
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("");
  }

  function updateMaintenanceIntervalDraft(update) {
    if (maintenanceIntervalNeedsReload || maintenanceIntervalRetryDraft || maintenanceIntervalSaving) return;
    setMaintenanceIntervalDraft((current) => current ? { ...current, ...update } : current);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("");
  }

  function cancelMaintenanceIntervalDraft() {
    if (!maintenanceIntervalDraft || maintenanceIntervalSaving || maintenanceIntervalRetryDraft) return;
    if (maintenanceIntervalDraft.operation === "create") {
      setMaintenanceIntervalDraft(null);
      setSelectedMaintenanceIntervalId("");
    } else {
      const original = maintenanceIntervals.find((interval) => interval.id === maintenanceIntervalDraft.id);
      setMaintenanceIntervalDraft(original ? makeMaintenanceIntervalDraft(original) : null);
      setSelectedMaintenanceIntervalId(original?.id || "");
    }
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("Changes canceled. Saved Maintenance Interval values are restored.");
  }

  function validateMaintenanceIntervalDraft(draft) {
    const intervalValue = Number(draft.intervalValue);
    const item = workspace?.maintenanceItems?.find((entry) =>
      entry.id === draft.maintenanceItemId && !entry.archivedAt);
    const duplicate = maintenanceIntervals.some((interval) =>
      interval.maintenanceItemId === draft.maintenanceItemId && interval.id !== draft.id);
    if (!item || duplicate) {
      setMaintenanceIntervalError(duplicate
        ? "This asset already has an interval for the selected Maintenance Item."
        : "Choose an active Maintenance Item applicable to this asset.");
      return false;
    }
    if (!Number.isFinite(intervalValue) || intervalValue <= 0 || intervalValue > 9999999999.99
      || !/^\d+(?:\.\d{1,2})?$/.test(draft.intervalValue)
      || !["miles", "hours", "months"].includes(draft.intervalUnit)
      || (draft.intervalUnit === "months" && !Number.isInteger(intervalValue))) {
      setMaintenanceIntervalError("Enter a positive interval value supported by the selected unit.");
      return false;
    }
    if (typeof draft.comments !== "string" || draft.comments.length > 2000) {
      setMaintenanceIntervalError("Comments must be 2,000 characters or fewer.");
      return false;
    }
    return true;
  }

  async function reloadMaintenanceIntervals() {
    if (!workspace || maintenanceIntervalsLoading) return;
    setMaintenanceIntervalsLoading(true);
    setMaintenanceIntervalError("");
    try {
      const fresh = await vehiclesService.loadVehicleWorkspace(workspace.asset.id);
      setWorkspace(fresh);
      setMaintenanceIntervalNeedsReload(false);
      setMaintenanceIntervalStatus("Vehicles workspace reloaded.");
    } catch (error) {
      setMaintenanceIntervalError(maintenanceIntervalErrorMessage(error));
      setMaintenanceIntervalStatus("");
    } finally {
      setMaintenanceIntervalsLoading(false);
    }
  }

  async function persistMaintenanceInterval(request) {
    if (maintenanceIntervalSaveLock.current || maintenanceIntervalSaving) return;
    maintenanceIntervalSaveLock.current = true;
    setMaintenanceIntervalSaving(true);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalStatus("Saving Maintenance Interval...");
    try {
      const result = await vehiclesService.saveVehicleChanges(request);
      if (result?.status !== "saved") {
        throw { code: "unknown_outcome", retryDraft: request };
      }
      const operation = request.intervalOperations[0];
      const deleting = operation.action === "delete";
      try {
        const fresh = await vehiclesService.loadVehicleWorkspace(workspace.asset.id);
        const savedInterval = fresh.maintenanceIntervals.find((interval) => interval.id === operation.id);
        setWorkspace(fresh);
        setMaintenanceIntervalRetryDraft(null);
        if (!deleting && !savedInterval) {
          setSelectedMaintenanceIntervalId(operation.id);
          setMaintenanceIntervalDraft(null);
          setMaintenanceIntervalNeedsReload(true);
          setMaintenanceIntervalStatus("Interval save succeeded, but the saved interval was not returned by the refreshed workspace.");
          setMaintenanceIntervalError("Reload the workspace before making further interval changes.");
        } else {
          setSelectedMaintenanceIntervalId(deleting ? "" : operation.id);
          setMaintenanceIntervalDraft(deleting ? null : makeMaintenanceIntervalDraft(savedInterval));
          setMaintenanceIntervalNeedsReload(false);
          setMaintenanceIntervalStatus(deleting ? "Maintenance Interval deleted." : "Maintenance Interval saved.");
        }
      } catch {
        setMaintenanceIntervalDraft(null);
        setSelectedMaintenanceIntervalId(deleting ? "" : operation.id);
        setMaintenanceIntervalNeedsReload(true);
        setMaintenanceIntervalRetryDraft(null);
        setMaintenanceIntervalStatus(deleting
          ? "Interval deletion succeeded, but the latest workspace could not be reloaded."
          : "Interval save succeeded, but the latest workspace could not be reloaded.");
        setMaintenanceIntervalError("Reload the workspace before making further interval changes.");
      }
    } catch (error) {
      if (error?.retryDraft) setMaintenanceIntervalRetryDraft(error.retryDraft);
      if (["version_conflict", "not_found", "item_archived_or_unavailable",
        "duplicate_interval", "request_id_payload_mismatch"].includes(error?.code)) {
        setMaintenanceIntervalNeedsReload(true);
      }
      setMaintenanceIntervalError(maintenanceIntervalErrorMessage(error));
      setMaintenanceIntervalStatus("");
    } finally {
      maintenanceIntervalSaveLock.current = false;
      setMaintenanceIntervalSaving(false);
    }
  }

  async function saveMaintenanceInterval(event) {
    event?.preventDefault();
    const draft = maintenanceIntervalDraft;
    if (!draft || maintenanceIntervalSaveLock.current || maintenanceIntervalSaving
      || maintenanceIntervalRetryDraft || maintenanceIntervalNeedsReload || !maintenanceIntervalDirty) return;
    if (!validateMaintenanceIntervalDraft(draft)) return;
    const request = createVehicleChangesDraft(workspace);
    request.requestId = draft.requestId;
    request.intervalOperations = [{
      action: draft.operation,
      id: draft.id,
      ...(draft.operation === "update" ? { expectedVersion: draft.expectedVersion } : {}),
      maintenanceItemId: draft.maintenanceItemId,
      intervalValue: Number(draft.intervalValue),
      intervalUnit: draft.intervalUnit,
      comments: draft.comments.trim() || null,
    }];
    await persistMaintenanceInterval(request);
  }

  function requestDeleteMaintenanceInterval(interval) {
    if (!interval || maintenanceIntervalDirty || maintenanceIntervalSaving
      || maintenanceIntervalRetryDraft || maintenanceIntervalNeedsReload) return;
    setConfirmation({ kind: "maintenance-interval-delete", value: interval });
  }

  function deleteMaintenanceInterval(interval) {
    if (!interval || maintenanceIntervalSaveLock.current || maintenanceIntervalSaving) return;
    const request = createVehicleChangesDraft(workspace);
    request.requestId = crypto.randomUUID();
    request.intervalOperations = [{
      action: "delete",
      id: interval.id,
      expectedVersion: interval.version,
    }];
    persistMaintenanceInterval(request);
  }

  function retryMaintenanceIntervalSave() {
    if (!maintenanceIntervalRetryDraft || maintenanceIntervalSaveLock.current) return;
    persistMaintenanceInterval(maintenanceIntervalRetryDraft);
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
      setOngoingEditing(true);
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

  function editSelectedRecord() {
    if (!selectedRecord || selectedRecord.isNew || saving || saveUncertain) return;
    setOngoingEditing(true);
  }

  function handleVehicleSectionKeyDown(event) {
    const currentIndex = vehicleSections.findIndex((section) => section.id === activeSection);
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % vehicleSections.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + vehicleSections.length) % vehicleSections.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = vehicleSections.length - 1;
    else return;

    event.preventDefault();
    const nextSection = vehicleSections[nextIndex];
    setActiveSection(nextSection.id);
    event.currentTarget?.parentElement?.querySelector(
      `[data-vehicles-section="${nextSection.id}"]`,
    )?.focus();
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
    } else if (action.kind === "manage-intervals-open") {
      resetDraft();
      beginManageMaintenanceIntervals();
    } else if (action.kind === "manage-intervals-open-assets") {
      closeManageAssets();
      beginManageMaintenanceIntervals();
    } else if (action.kind === "manage-intervals-open-items") {
      closeManageMaintenanceItems();
      beginManageMaintenanceIntervals();
    } else if (action.kind === "manage-items-open-assets") {
      closeManageAssets();
      beginManageMaintenanceItems();
    } else if (action.kind === "manage-items-close") {
      closeManageMaintenanceItems();
    } else if (action.kind === "manage-intervals-close") {
      closeManageMaintenanceIntervals();
    } else if (action.kind === "manage-intervals-reload") {
      discardIntervalDraftAndReload();
    } else if (action.kind === "manage-intervals-switch") {
      const interval = maintenanceIntervals.find((entry) => entry.id === action.value);
      setSelectedMaintenanceIntervalId(interval?.id || "");
      setMaintenanceIntervalDraft(interval ? makeMaintenanceIntervalDraft(interval) : null);
      setMaintenanceIntervalNeedsReload(false);
      setMaintenanceIntervalError("");
      setMaintenanceIntervalStatus("");
    } else if (action.kind === "manage-intervals-new") {
      setSelectedMaintenanceIntervalId("");
      setMaintenanceIntervalDraft({
        ...makeMaintenanceIntervalDraft(),
        intervalUnit: workspace.asset.usageUnit === "none" ? "months" : workspace.asset.usageUnit,
      });
      setMaintenanceIntervalNeedsReload(false);
      setMaintenanceIntervalError("");
      setMaintenanceIntervalStatus("");
    } else if (action.kind === "maintenance-interval-delete") {
      deleteMaintenanceInterval(action.value);
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
      setOngoingEditing(true);
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
      setOngoingEditing(false);
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
      setOngoingEditing(false);
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
    if (saveUncertain || saving || maintenanceItemSaving || maintenanceItemRetryDraft
      || maintenanceIntervalSaving || maintenanceIntervalRetryDraft) return;
    resetDraft();
    if (maintenanceItemDirty) closeManageMaintenanceItems();
    if (maintenanceIntervalDirty) closeManageMaintenanceIntervals();
    if (manageAssetsOpen && manageDraftIsDirty()) closeManageAssets();
    blocker.proceed();
  }

  const selectedRecord = workingRecords.find((record) => record.id === selectedRecordId);
  const showUsageField = workspace?.asset?.usageUnit !== "none";
  const usageLabelUnit = selectedRecord?.usageReadingUnit === "none"
    ? workspace?.asset?.usageUnit : selectedRecord?.usageReadingUnit;
  const usageLabel = usageLabelUnit === "hours" ? "Hours" : "Mileage";
  const showUsageSummary = Boolean(selectedRecord && showUsageField
    && selectedRecord.usageReadingUnit !== "none" && selectedRecord.usageReadingValue !== null);
  const selectedRecordGroups = ongoingItemGroups.map(({ group, title }) => ({
    group,
    title,
    items: [...(selectedRecord?.capturedItems || [])]
      .filter((item) => item.groupSnapshot === group)
      .sort((left, right) => left.displayNameSnapshot.localeCompare(right.displayNameSnapshot)
        || left.maintenanceItemId.localeCompare(right.maintenanceItemId)),
  }));
  const selectableMaintenanceItems = (workspace?.maintenanceItems || [])
    .filter((item) => !item.archivedAt && !maintenanceIntervals.some((interval) =>
      interval.maintenanceItemId === item.id && interval.id !== maintenanceIntervalDraft?.id))
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
  const intervalDraftItemAvailable = Boolean(workspace?.maintenanceItems?.some((item) =>
    item.id === maintenanceIntervalDraft?.maintenanceItemId && !item.archivedAt));
  const confirmationTitle = confirmation?.kind === "delete"
    ? "Queue deletion of this Ongoing record?"
    : confirmation?.kind === "maintenance-interval-delete"
      ? "Delete this Maintenance Interval?"
    : confirmation?.kind === "maintenance-item-archive"
      ? "Archive this Maintenance Item?"
      : confirmation?.kind === "manage-intervals-close"
        ? "Discard Maintenance Interval edits?"
        : confirmation?.kind === "manage-intervals-switch"
          ? "Discard Maintenance Interval edits and switch?"
          : confirmation?.kind === "manage-intervals-new"
            ? "Discard Maintenance Interval edits and start a new interval?"
            : confirmation?.kind === "manage-intervals-open"
              ? "Discard Ongoing Maintenance edits and manage Maintenance Intervals?"
              : confirmation?.kind === "manage-intervals-open-assets"
                ? "Discard Asset edits and manage Maintenance Intervals?"
                : confirmation?.kind === "manage-intervals-open-items"
                  ? "Discard Maintenance Item edits and manage Maintenance Intervals?"
                  : confirmation?.kind === "manage-intervals-reload"
                    ? "Discard interval edits and reload the workspace?"
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
        : maintenanceIntervalRetryDraft
          ? "Maintenance Interval save outcome needs confirmation"
          : maintenanceIntervalSaving
            ? "Maintenance Interval save is in progress"
          : maintenanceItemRetryDraft
          ? "Maintenance Item save outcome needs confirmation"
          : maintenanceItemSaving
            ? "Maintenance Item save is in progress"
          : saveUncertain
          ? "Save outcome needs confirmation"
          : saving ? "Save is in progress" : "Discard unsaved Vehicles changes?";

  return (
    <main className={`${styles.page} ${ongoingEditing ? styles.pageEditing : ""}`}>
      <PageHeader id="vehicles-page-title" title="Vehicles" />
      <div className={styles.vehicleContextRow}>
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
        <div className={styles.pageActions}>
          <details className={`${styles.pageMoreActions} ${styles.pageManageActions}`}>
            <summary ref={manageButtonRef} aria-label="Manage" title="Manage">Manage</summary>
            <div className={styles.pageMoreActionsMenu}>
              <button type="button" className="lm-button lm-button--secondary"
                onClick={(event) => {
                  event?.currentTarget?.closest("details")?.removeAttribute("open");
                  openManageAssets();
                }} disabled={saving || saveUncertain || manageSaving
                  || maintenanceItemSaving || manageMaintenanceItemsOpen || manageMaintenanceIntervalsOpen}>
                Manage Assets
              </button>
              <button ref={manageMaintenanceItemsButtonRef} type="button" className="lm-button lm-button--secondary"
                onClick={(event) => {
                  event?.currentTarget?.closest("details")?.removeAttribute("open");
                  openManageMaintenanceItems();
                }} disabled={saving || saveUncertain || manageSaving
                  || manageRetryDraft || maintenanceItemSaving || manageMaintenanceIntervalsOpen}>
                Manage Maintenance Items
              </button>
              <button ref={manageMaintenanceIntervalsButtonRef} type="button" className="lm-button lm-button--secondary"
                onClick={(event) => {
                  event?.currentTarget?.closest("details")?.removeAttribute("open");
                  openManageMaintenanceIntervals();
                }} disabled={!workspace || workspaceLoading || saving || saveUncertain || manageSaving || manageRetryDraft
                  || maintenanceItemSaving || maintenanceItemRetryDraft || maintenanceIntervalSaving
                  || manageMaintenanceIntervalsOpen}>
                Manage Maintenance Intervals
              </button>
            </div>
          </details>
          {selectedRecord && !selectedRecord.isNew && !ongoingEditing && (
            <button type="button" className="lm-button lm-button--secondary"
              onClick={editSelectedRecord} disabled={saving || saveUncertain}>Edit</button>
          )}
          {workspace && !ongoingEditing && <button type="button" className="lm-button lm-button--primary"
            onClick={addRecord} disabled={saving || saveUncertain}>Add Ongoing Record</button>}
          {selectedRecord && !selectedRecord.isNew && !ongoingEditing && (
            <details className={styles.pageMoreActions}>
              <summary aria-label="More actions" title="More actions">
                <MoreHorizontal aria-hidden="true" size={18} />
              </summary>
              <div className={styles.pageMoreActionsMenu}>
                <button type="button" className="lm-button lm-button--danger"
                  onClick={(event) => {
                    event?.currentTarget?.closest("details")?.removeAttribute("open");
                    queueDelete();
                  }} disabled={saving || saveUncertain}>Delete Record</button>
              </div>
            </details>
          )}
          {ongoingEditing && <button type="button"
            className={`lm-button lm-button--secondary ${styles.desktopSessionAction}`}
            onClick={resetDraft} disabled={saving || saveUncertain}>Cancel Changes</button>}
          {ongoingEditing && <button type="button" className={`lm-button lm-button--primary ${styles.desktopSessionAction}`}
            onClick={() => saveChanges({ preventDefault() {} })}
            disabled={!dirty || saving || workspaceLoading || saveUncertain}>Save Changes</button>}
        </div>
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
          <nav className={styles.sectionTabs} role="tablist" aria-label="Vehicles sections">
            {vehicleSections.map((section) => (
              <button key={section.id} type="button" role="tab"
                id={`vehicles-section-tab-${section.id}`}
                data-vehicles-section={section.id}
                aria-controls="vehicles-section-panel"
                aria-selected={activeSection === section.id}
                aria-label={dirty && section.id === "ongoing"
                  ? `${section.label}, unsaved changes` : section.label}
                tabIndex={activeSection === section.id ? 0 : -1}
                className={`${styles.sectionTab} ${activeSection === section.id ? styles.sectionTabActive : ""}`}
                onClick={() => setActiveSection(section.id)}
                onKeyDown={handleVehicleSectionKeyDown}>
                <span>{section.label}</span>
                {dirty && section.id === "ongoing" && (
                  <span className={styles.sectionDirtyIndicator} aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>
          <label className={styles.mobileSectionSelector} htmlFor="vehicles-section-select">
            <span className="lm-form-label">Section</span>
            <select id="vehicles-section-select" className="lm-form-control" value={activeSection}
              onChange={(event) => setActiveSection(event.target.value)}>
              {vehicleSections.map((section) => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </select>
          </label>

          <div id="vehicles-section-panel" className={styles.sectionPanel} role="tabpanel"
            aria-label={vehicleSections.find((section) => section.id === activeSection)?.label || "Vehicles section"}
            aria-labelledby={`vehicles-section-tab-${activeSection}`}>
            {activeSection === "ongoing" && (
              <>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>Ongoing Maintenance</h2>
                  </div>
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
                {status && <p className={`lm-feedback ${ongoingEditing && selectedRecord?.isNew ? styles.visuallyHidden : ""}`}
                  role="status" aria-live="polite">{status}</p>}

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
                    {ongoingEditing && <p>Edits remain a draft until Save Changes.</p>}
                  </div>
                </div>

                {ongoingEditing ? <div className={`${styles.fields} ${showUsageField ? "" : styles.fieldsWithoutUsage}`}>
                  <label className="lm-form-field" htmlFor="vehicles-service-date">
                    <span className="lm-form-label">Service date</span>
                    <input id="vehicles-service-date" className="lm-form-control" type="date" required
                      value={selectedRecord.serviceDate} disabled={saving || saveUncertain}
                      aria-invalid={!selectedRecord.serviceDate}
                      onChange={(event) => updateRecord(selectedRecord.id, { serviceDate: event.target.value })} />
                  </label>
                  {showUsageField && <div className={`lm-form-field ${styles.usageField}`}
                    role="group" aria-labelledby="vehicles-usage-field-label">
                    <span id="vehicles-usage-field-label" className="lm-form-label">{usageLabel}</span>
                    <div className={styles.usageControls}>
                      <label className={styles.usageControl} htmlFor="vehicles-usage-unit">
                        <span className={styles.visuallyHidden}>Historical usage unit</span>
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
                      <label className={styles.usageControl} htmlFor="vehicles-usage-value">
                        <span className={styles.visuallyHidden}>{usageLabel} value</span>
                        <input id="vehicles-usage-value" className="lm-form-control" type="number" min="0" step="any"
                          value={selectedRecord.usageReadingValue ?? ""}
                          disabled={saving || saveUncertain || selectedRecord.usageReadingUnit === "none"}
                          onChange={(event) => updateRecord(selectedRecord.id, {
                            usageReadingValue: event.target.value === "" ? null : Number(event.target.value),
                          })} />
                      </label>
                    </div>
                  </div>}
                  <label className="lm-form-field" htmlFor="vehicles-mechanic">
                    <span className="lm-form-label">Mechanic (optional)</span>
                    <input id="vehicles-mechanic" className="lm-form-control" type="text" maxLength="160"
                      value={selectedRecord.mechanic || ""} disabled={saving || saveUncertain}
                      onChange={(event) => updateRecord(selectedRecord.id, { mechanic: event.target.value || null })} />
                  </label>
                </div> : <dl className={`${styles.recordSummary} ${showUsageSummary ? "" : styles.recordSummaryWithoutUsage}`}>
                  <div><dt>Service date</dt><dd>{selectedRecord.serviceDate}</dd></div>
                  {showUsageSummary && (
                    <div>
                      <dt>{selectedRecord.usageReadingUnit === "miles" ? "Mileage" : "Hours"}</dt>
                      <dd>{selectedRecord.usageReadingValue.toLocaleString()} {selectedRecord.usageReadingUnit}</dd>
                    </div>
                  )}
                  {selectedRecord.mechanic && <div><dt>Mechanic</dt><dd>{selectedRecord.mechanic}</dd></div>}
                </dl>}

                <fieldset className={styles.items} disabled={!ongoingEditing || saving || saveUncertain}>
                  <legend>Maintenance Items for this record</legend>
                  {selectedRecord.capturedItems.length ? (
                    <div className={styles.itemGroups}>
                      {selectedRecordGroups.map(({ group, title, items }) => (
                        <section key={group} className={styles.itemGroup}
                          aria-labelledby={`vehicles-ongoing-group-${group}`}>
                          <h4 id={`vehicles-ongoing-group-${group}`} className={styles.itemGroupTitle}>{title}</h4>
                          {items.length ? (
                            <div className={styles.itemGroupList}>
                              {items.map((item) => (
                                <label key={item.maintenanceItemId} className={styles.itemToggle}>
                                  <input className="lm-checkbox" type="checkbox" role="switch" checked={item.isPerformed}
                                    aria-label={`Performed: ${item.displayNameSnapshot}`}
                                    onChange={(event) => updateItem(selectedRecord.id, item.maintenanceItemId,
                                      event.target.checked)} />
                                  <span className={styles.itemLabel}>{item.displayNameSnapshot}</span>
                                  <span className={styles.switchTrack} aria-hidden="true" />
                                </label>
                              ))}
                            </div>
                          ) : <p className={styles.emptyItemGroup}>No applicable items</p>}
                        </section>
                      ))}
                    </div>
                  ) : <p className="lm-empty-state">No Maintenance Items were captured for this record.</p>}
                </fieldset>
              </form>
            ) : <section className={`lm-surface ${styles.empty}`} aria-labelledby="ongoing-empty-title">
              <h3 id="ongoing-empty-title">Select or add an Ongoing record</h3>
              <p>This vehicle has no saved Ongoing records yet.</p>
            </section>}
                </div>
              </>
            )}

            {activeSection === "intervals" && (
              <section className={styles.sectionContent} aria-labelledby="vehicles-intervals-section-title">
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 id="vehicles-intervals-section-title">Maintenance Intervals</h2>
                    <p>Intervals are specific to {workspace.asset.name}.</p>
                  </div>
                  <button type="button" className="lm-button lm-button--secondary"
                    onClick={openManageMaintenanceIntervals}
                    disabled={workspaceLoading || saving || saveUncertain || manageSaving || manageRetryDraft
                      || maintenanceItemSaving || maintenanceItemRetryDraft || maintenanceIntervalSaving
                      || manageMaintenanceIntervalsOpen}>
                    Manage Maintenance Intervals
                  </button>
                </div>
                {maintenanceIntervals.length === 0
                  ? <p className="lm-empty-state">No Maintenance Intervals are set for this asset.</p>
                  : <ul className={styles.sectionIntervalList} aria-label="Maintenance Intervals for selected asset">
                    {[...maintenanceIntervals].sort((left, right) =>
                      left.maintenanceItemName.localeCompare(right.maintenanceItemName)
                        || left.id.localeCompare(right.id)).map((interval) => (
                      <li key={interval.id}>
                        <strong>{interval.maintenanceItemName}</strong>
                        <span>{interval.recommendedInterval.value} {interval.recommendedInterval.unit}</span>
                        <span>{maintenanceIntervalSummary(interval)}</span>
                      </li>
                    ))}
                  </ul>}
              </section>
            )}

            {activeSection !== "ongoing" && activeSection !== "intervals" && (
              <section className={styles.sectionContent} aria-labelledby="vehicles-unavailable-section-title">
                <h2 id="vehicles-unavailable-section-title">
                  {vehicleSections.find((section) => section.id === activeSection)?.label}
                </h2>
                <p>This section is not yet available in this Vehicles workspace.</p>
              </section>
            )}
          </div>
          {ongoingEditing && <div className={styles.mobileSessionActions} aria-label="Ongoing editing actions">
            <button type="button" className="lm-button lm-button--secondary"
              onClick={resetDraft} disabled={saving || saveUncertain}>Cancel Changes</button>
            <button type="button" className="lm-button lm-button--primary"
              onClick={() => saveChanges({ preventDefault() {} })}
              disabled={!dirty || saving || workspaceLoading || saveUncertain}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>}
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

      <dialog ref={maintenanceIntervalsDialogRef}
        className={`${styles.dialog} ${styles.maintenanceIntervalsDialog}`}
        aria-labelledby="vehicles-manage-intervals-title" onCancel={(event) => {
          event.preventDefault();
          requestCloseManageMaintenanceIntervals();
        }}>
        <div className={styles.detailHeading}>
          <div>
            <h2 id="vehicles-manage-intervals-title">Manage Maintenance Intervals</h2>
            <p>Intervals are specific to {workspace?.asset.name || "the selected asset"}.</p>
          </div>
          <button type="button" className="lm-button lm-button--secondary"
            onClick={requestCloseManageMaintenanceIntervals} disabled={maintenanceIntervalSaving}
            aria-label="Close Manage Maintenance Intervals">Close</button>
        </div>

        {maintenanceIntervalsLoading && <p className="lm-loading-state" role="status">Loading Maintenance Intervals...</p>}
        <div className={styles.maintenanceIntervalManager}>
          <section aria-label="Maintenance Interval list">
            <div className={styles.sectionHeading}>
              <h3>Intervals</h3>
              <button ref={maintenanceIntervalsAddButtonRef} type="button" className="lm-button lm-button--secondary"
                onClick={startNewMaintenanceInterval}
                disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)
                  || maintenanceIntervalNeedsReload || maintenanceIntervalsLoading}>
                Add Maintenance Interval
              </button>
            </div>
            {maintenanceIntervals.length === 0
              ? <p className="lm-empty-state">No Maintenance Intervals are set for this asset.</p>
              : <ul className={styles.maintenanceIntervalList} aria-label="Saved Maintenance Intervals">
                {[...maintenanceIntervals].sort((left, right) =>
                  left.maintenanceItemName.localeCompare(right.maintenanceItemName)
                    || left.id.localeCompare(right.id)).map((interval) => (
                  <li key={interval.id}>
                    <button type="button"
                      className={`${styles.managedAsset} ${selectedMaintenanceIntervalId === interval.id
                        ? styles.managedAssetSelected : ""}`}
                      aria-pressed={selectedMaintenanceIntervalId === interval.id}
                      onClick={() => selectMaintenanceInterval(interval.id)}
                      disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)
                        || maintenanceIntervalNeedsReload}>
                      <strong>{interval.maintenanceItemName}</strong>
                      <span>{interval.recommendedInterval.value} {interval.recommendedInterval.unit}
                        {" · "}{maintenanceIntervalSummary(interval)}</span>
                    </button>
                  </li>
                ))}
              </ul>}
          </section>

          {maintenanceIntervalDraft ? (
            <form className={styles.maintenanceIntervalForm} onSubmit={saveMaintenanceInterval} noValidate>
              <h3>{maintenanceIntervalDraft.operation === "create"
                ? "New Maintenance Interval" : "Edit Maintenance Interval"}</h3>
              <label className="lm-form-field" htmlFor="vehicles-maintenance-interval-item">
                <span className="lm-form-label">Maintenance Item</span>
                <select ref={maintenanceIntervalItemRef} id="vehicles-maintenance-interval-item"
                  className="lm-form-control" required value={maintenanceIntervalDraft.maintenanceItemId}
                  aria-invalid={Boolean(maintenanceIntervalError && !intervalDraftItemAvailable)}
                  aria-describedby={maintenanceIntervalError ? "vehicles-maintenance-interval-error" : undefined}
                  onChange={(event) => updateMaintenanceIntervalDraft({ maintenanceItemId: event.target.value })}
                  disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)
                    || maintenanceIntervalNeedsReload}>
                  <option value="">Choose an applicable Maintenance Item</option>
                  {selectableMaintenanceItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.displayName}</option>
                  ))}
                </select>
              </label>
              {maintenanceIntervalDraft.operation === "update" && !intervalDraftItemAvailable && (
                <p className="lm-feedback lm-feedback--error" role="alert">
                  The linked Maintenance Item is not currently active and applicable. Reload to resolve the conflict;
                  the interval has not been changed.
                </p>
              )}
              {selectableMaintenanceItems.length === 0 && (
                <p className="lm-empty-state">No active, applicable Maintenance Items are available without an existing interval.</p>
              )}
              <label className="lm-form-field" htmlFor="vehicles-maintenance-interval-value">
                <span className="lm-form-label">Interval value</span>
                <input id="vehicles-maintenance-interval-value" className="lm-form-control" type="number"
                  required min="0.01" max="9999999999.99"
                  step={maintenanceIntervalDraft.intervalUnit === "months" ? "1" : "0.01"}
                  value={maintenanceIntervalDraft.intervalValue}
                  aria-invalid={Boolean(maintenanceIntervalError
                    && (!Number.isFinite(Number(maintenanceIntervalDraft.intervalValue))
                      || Number(maintenanceIntervalDraft.intervalValue) <= 0
                      || (maintenanceIntervalDraft.intervalUnit === "months"
                        && !Number.isInteger(Number(maintenanceIntervalDraft.intervalValue)))))}
                  aria-describedby={maintenanceIntervalError ? "vehicles-maintenance-interval-error" : undefined}
                  onChange={(event) => updateMaintenanceIntervalDraft({ intervalValue: event.target.value })}
                  disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)
                    || maintenanceIntervalNeedsReload} />
              </label>
              <label className="lm-form-field" htmlFor="vehicles-maintenance-interval-unit">
                <span className="lm-form-label">Interval unit</span>
                <select id="vehicles-maintenance-interval-unit" className="lm-form-control"
                  value={maintenanceIntervalDraft.intervalUnit}
                  aria-describedby={maintenanceIntervalError ? "vehicles-maintenance-interval-error" : undefined}
                  onChange={(event) => updateMaintenanceIntervalDraft({
                    intervalUnit: event.target.value,
                  })}
                  disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)
                    || maintenanceIntervalNeedsReload}>
                  <option value="miles">Miles</option>
                  <option value="hours">Hours</option>
                  <option value="months">Months</option>
                </select>
              </label>
              <p className="lm-feedback" role="status">
                Asset Usage Unit: {workspace.asset.usageUnit}. Usage intervals are compared with the qualifying
                service reading; month intervals use service dates.
              </p>
              <label className="lm-form-field" htmlFor="vehicles-maintenance-interval-comments">
                <span className="lm-form-label">Comments</span>
                <textarea id="vehicles-maintenance-interval-comments" className="lm-form-control"
                  maxLength="2000" rows="4" value={maintenanceIntervalDraft.comments}
                  aria-describedby={maintenanceIntervalError ? "vehicles-maintenance-interval-error" : undefined}
                  onChange={(event) => updateMaintenanceIntervalDraft({ comments: event.target.value })}
                  disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)
                    || maintenanceIntervalNeedsReload} />
              </label>
              {maintenanceIntervalError && <p id="vehicles-maintenance-interval-error"
                className="lm-feedback lm-feedback--error" role="alert">{maintenanceIntervalError}</p>}
              {maintenanceIntervalStatus && <p className="lm-feedback" role="status" aria-live="polite">
                {maintenanceIntervalStatus}
              </p>}
              {maintenanceIntervalNeedsReload && <div className="lm-feedback" role="status" aria-live="polite">
                <p>Reload the workspace before resuming interval changes.</p>
                <button type="button" className="lm-button lm-button--secondary"
                  onClick={requestReloadMaintenanceIntervals} disabled={maintenanceIntervalsLoading}>
                  Reload workspace
                </button>
              </div>}
              <div className={styles.dialogActions}>
                <button type="button" className="lm-button lm-button--secondary"
                  onClick={cancelMaintenanceIntervalDraft}
                  disabled={maintenanceIntervalSaving || Boolean(maintenanceIntervalRetryDraft)}>
                  Cancel
                </button>
                {maintenanceIntervalRetryDraft && <button type="button" className="lm-button lm-button--secondary"
                  onClick={retryMaintenanceIntervalSave} disabled={maintenanceIntervalSaving}>
                  Retry same request
                </button>}
                {maintenanceIntervalDraft.operation === "update" && (
                  <button type="button" className="lm-button lm-button--danger"
                    onClick={() => requestDeleteMaintenanceInterval(maintenanceIntervalBaseline)}
                    disabled={maintenanceIntervalDirty || maintenanceIntervalSaving
                      || Boolean(maintenanceIntervalRetryDraft) || maintenanceIntervalNeedsReload}>
                    Delete Maintenance Interval
                  </button>
                )}
                <button type="submit" className="lm-button lm-button--primary"
                  disabled={!maintenanceIntervalDirty || maintenanceIntervalSaving
                    || Boolean(maintenanceIntervalRetryDraft) || maintenanceIntervalNeedsReload}>
                  {maintenanceIntervalSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <section className={`lm-surface ${styles.maintenanceItemReadOnly}`}>
              <h3>{selectedMaintenanceInterval ? selectedMaintenanceInterval.maintenanceItemName
                : "Select or add a Maintenance Interval"}</h3>
              {selectedMaintenanceInterval && (
                <>
                  <p>{selectedMaintenanceInterval.recommendedInterval.value}{" "}
                    {selectedMaintenanceInterval.recommendedInterval.unit}</p>
                  <p>{maintenanceIntervalSummary(selectedMaintenanceInterval)}</p>
                  {selectedMaintenanceInterval.comments && <p>{selectedMaintenanceInterval.comments}</p>}
                </>
              )}
              {!selectedMaintenanceInterval && (
                <p>Edits remain local until saved. Intervals do not modify service history or Maintenance Items.</p>
              )}
              {maintenanceIntervalError && <p className="lm-feedback lm-feedback--error" role="alert">
                {maintenanceIntervalError}
              </p>}
              {maintenanceIntervalStatus && <p className="lm-feedback" role="status" aria-live="polite">
                {maintenanceIntervalStatus}
              </p>}
              {maintenanceIntervalNeedsReload && <button type="button" className="lm-button lm-button--secondary"
                onClick={requestReloadMaintenanceIntervals} disabled={maintenanceIntervalsLoading}>
                Reload workspace
              </button>}
            </section>
          )}
        </div>
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
          : confirmation?.kind === "maintenance-interval-delete"
            ? "This interval will be permanently removed for the selected asset. No Maintenance Item or service history will be changed."
          : confirmation?.kind === "manage-intervals-reload"
            ? "The current interval draft will be discarded so the latest saved versions and item availability can be loaded."
          : confirmation?.kind?.startsWith("manage-intervals")
            ? "Unsaved Maintenance Interval values will be discarded only if you choose the discard action. No interval is saved automatically."
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
          {(confirmation?.kind === "delete" || confirmation?.kind === "maintenance-item-archive"
            || confirmation?.kind === "maintenance-interval-delete") && (
            <button type="button" className={`lm-button lm-button--danger ${styles.archiveAction}`}
              aria-label={confirmation.kind === "maintenance-interval-delete"
                ? "Delete Maintenance Interval" : "Archive Maintenance Item"}
              onClick={finishConfirmation}>
              {confirmation.kind === "delete" ? "Queue Delete"
                : confirmation.kind === "maintenance-interval-delete"
                  ? "Delete Maintenance Interval" : "Archive Maintenance Item"}
            </button>
          )}
          {confirmation && !["delete", "maintenance-item-archive", "maintenance-interval-delete"].includes(confirmation.kind)
            && !saveUncertain && !saving
            && !maintenanceItemSaving && !maintenanceItemRetryDraft
            && !maintenanceIntervalSaving && !maintenanceIntervalRetryDraft && <button type="button"
              className="lm-button lm-button--danger" onClick={finishConfirmation}>
              {["manage-items-close", "manage-items-switch", "manage-items-new",
                "manage-intervals-close", "manage-intervals-switch", "manage-intervals-new",
                "manage-intervals-reload"].includes(confirmation.kind)
                ? "Discard edits" : "Discard and continue"}
            </button>}
          {blocker.state === "blocked" && !confirmation && !saving && !saveUncertain
            && !maintenanceItemSaving && !maintenanceItemRetryDraft
            && !maintenanceIntervalSaving && !maintenanceIntervalRetryDraft
            && <button type="button" className="lm-button lm-button--danger" onClick={handleRouteDiscard}>
              Discard changes
            </button>}
        </div>
      </dialog>
    </main>
  );
}
