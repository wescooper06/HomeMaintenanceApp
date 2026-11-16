import { Bold, List } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

import PageHeader from "../../components/layout/PageHeader.jsx";
import { calculateMaintenanceInterval } from "../../services/vehiclesMaintenanceIntervalEngine.js";
import {
  buildRecordDeleteOperation,
  createVehicleChangesDraft,
  vehiclesService,
} from "../../services/vehiclesService.js";
import { resolveLinkTitle } from "../../utils/resolveLinkTitle.js";

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

function recommendedValue(record) {
  return JSON.stringify([record.serviceDate, record.usageReadingValue,
    record.usageReadingUnit, record.mechanic, record.description]);
}

function completedValue(record) {
  return JSON.stringify([record.serviceDate, record.usageReadingValue,
    record.usageReadingUnit, record.mechanic, record.serviceDescription]);
}

function toggleDescriptionBullets(text, selectionStart, selectionEnd) {
  const start = selectionStart === 0 ? 0 : text.lastIndexOf("\n", selectionStart - 1) + 1;
  const lastSelected = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  const nextBreak = text.indexOf("\n", lastSelected);
  const end = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(start, end).split("\n");
  const nonblank = lines.filter((line) => line.trim());
  const remove = nonblank.length > 0 && nonblank.every((line) => line.startsWith("\u2022 "));
  const changes = [];
  let offset = start;
  const replacement = lines.map((line) => {
    let updated = line;
    if (lines.length === 1 || line.trim()) {
      if (remove && line.startsWith("\u2022 ")) {
        updated = line.slice(2);
        changes.push({ offset, removed: 2, added: 0 });
      } else if (!remove && !line.startsWith("\u2022 ")) {
        updated = `\u2022 ${line}`;
        changes.push({ offset, removed: 0, added: 2 });
      }
    }
    offset += line.length + 1;
    return updated;
  }).join("\n");
  const positionAfter = (position) => changes.reduce((result, change) => (
    position < change.offset ? result
      : result + change.added - Math.min(change.removed, position - change.offset)
  ), position);
  return {
    text: text.slice(0, start) + replacement + text.slice(end), start, end, replacement,
    selectionStart: positionAfter(selectionStart), selectionEnd: positionAfter(selectionEnd),
  };
}

function keyDocumentLength(value) {
  return value.blocks.reduce((total, block) => total + (block.type === "paragraph" ? [block.runs] : block.items)
    .reduce((sum, runs) => sum + runs.reduce((length, run) => length + run.text.length, 0), 0), 0);
}

function keyBlockSignature(block) {
  const normalize = (runs) => runs.reduce((result, run) => {
    if (!run.text) return result;
    const bold = Boolean(run.bold);
    if (result.length && result[result.length - 1].bold === bold) result[result.length - 1].text += run.text;
    else result.push({ text: run.text, bold });
    return result;
  }, []);
  return JSON.stringify(block.type === "paragraph" ? ["paragraph", normalize(block.runs)]
    : ["bullet_list", block.items.map(normalize)]);
}

function readKeyDocument(root, previous) {
  const runsFrom = (parent) => {
    const runs = [];
    const visit = (node, inheritedBold = false) => {
      if (node.nodeType === 3) {
        if (node.textContent) runs.push(inheritedBold ? { text: node.textContent, bold: true } : { text: node.textContent });
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.nodeName === "BR") {
        if (node.parentNode.childNodes.length > 1) runs.push({ text: "\n" });
        return;
      }
      const weight = node.style?.fontWeight;
      const bold = weight === "normal" || weight === "400" ? false
        : inheritedBold || node.nodeName === "B" || node.nodeName === "STRONG" || weight === "bold" || Number(weight) >= 600;
      node.childNodes.forEach((child) => visit(child, bold));
    };
    parent.childNodes.forEach((child) => visit(child));
    return runs;
  };
  const blocks = [];
  const visitBlock = (node) => {
    if (node.nodeType === 3) {
      if (node.textContent) blocks.push({ type: "paragraph", runs: [{ text: node.textContent }] });
    } else if (node.nodeType === 1 && node.nodeName === "UL") {
      blocks.push({ type: "bullet_list", items: [...node.children]
        .filter((child) => child.nodeName === "LI").map(runsFrom) });
    } else if (node.nodeType === 1) {
      if ([...node.children].some((child) => ["P", "DIV", "UL"].includes(child.nodeName))) {
        node.childNodes.forEach(visitBlock);
      } else blocks.push({ type: "paragraph", runs: runsFrom(node) });
    }
  };
  root.childNodes.forEach(visitBlock);
  const value = { schemaVersion: 1, blocks: blocks.map((block, index) => {
    const original = previous.blocks[index];
    return original && keyBlockSignature(original) === keyBlockSignature(block) ? original : block;
  }) };
  if (value.blocks.length === previous.blocks.length
    && value.blocks.every((block, index) => keyBlockSignature(block) === keyBlockSignature(previous.blocks[index]))) return previous;
  return value.blocks.some((block) => (block.type === "paragraph" ? [block.runs] : block.items)
    .some((runs) => runs.some((run) => run.text.trim()))) ? value : { schemaVersion: 1, blocks: [] };
}

function KeyDocumentContent({ value }) {
  const renderRuns = (runs) => runs.map((run, index) => run.bold
    ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>);
  return value.blocks.length ? value.blocks.map((block, index) => block.type === "paragraph"
    ? <p key={index}>{block.runs.length ? renderRuns(block.runs) : <br />}</p>
    : <ul key={index}>{block.items.map((runs, itemIndex) => <li key={itemIndex}>{renderRuns(runs)}</li>)}</ul>)
    : <p><br /></p>;
}

function KeyDocumentEditor({ value, onChange, onError, disabled }) {
  const [initial, setInitial] = useState(value);
  const current = useRef(value);
  const editor = useRef(null);
  const selection = useRef(null);
  const restoring = useRef(false);
  const [revision, setRevision] = useState(0);
  const [format, setFormat] = useState({ bold: false, bullets: false });
  const rememberSelection = () => {
    const selected = document.getSelection();
    if (selected?.rangeCount && editor.current?.contains(selected.anchorNode)) selection.current = selected.getRangeAt(0).cloneRange();
    setFormat({ bold: Boolean(document.queryCommandState?.("bold")), bullets: Boolean(document.queryCommandState?.("insertUnorderedList")) });
  };
  const commit = () => {
    if (restoring.current) return;
    const next = readKeyDocument(editor.current, current.current);
    const invalid = keyDocumentLength(next) > 50000 || next.blocks.some((block) => (
      block.type === "paragraph" ? [block.runs] : block.items
    ).some((runs) => runs.some((run) => /<[/!?]?[A-Za-z][^>]*>|<\s*script/i.test(run.text))));
    if (invalid) {
      restoring.current = true;
      document.execCommand?.("undo");
      restoring.current = false;
      if (JSON.stringify(readKeyDocument(editor.current, current.current)) !== JSON.stringify(current.current)) {
        setInitial(current.current);
        selection.current = null;
        setRevision((number) => number + 1);
      }
      onError("Key Maintenance Information allows at most 50,000 text units and no HTML markup. The edit was not applied.");
      return;
    }
    if (JSON.stringify(next) !== JSON.stringify(current.current)) {
      current.current = next;
      onChange(next);
    }
    rememberSelection();
  };
  const command = (name, text) => {
    if (disabled) return;
    editor.current.focus({ preventScroll: true });
    if (selection.current && editor.current.contains(selection.current.commonAncestorContainer)) {
      const selected = document.getSelection();
      selected.removeAllRanges();
      selected.addRange(selection.current);
    }
    document.execCommand(name, false, text);
    commit();
  };
  const pasteText = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || event.dataTransfer?.getData("text/plain") || "";
    const selectedLength = document.getSelection()?.toString().length || 0;
    if (keyDocumentLength(current.current) - selectedLength + text.length > 50000) {
      onError("Key Maintenance Information exceeds its 50,000-text-unit limit. No text was inserted.");
      return;
    }
    command("insertText", text);
  };
  return <div className={styles.keyEditor}>
    <div className={styles.keyFormatting} role="group" aria-label="Key Maintenance Information formatting">
      <button type="button" className={`lm-button lm-button--secondary ${styles.descriptionBullets}`}
        aria-label="Bold" aria-pressed={format.bold} title="Bold" disabled={disabled}
        onMouseDown={(event) => event.preventDefault()} onClick={() => command("bold")}><Bold size={16} aria-hidden="true" />Bold</button>
      <button type="button" className={`lm-button lm-button--secondary ${styles.descriptionBullets}`}
        aria-label="Toggle bullets" aria-pressed={format.bullets} title="Toggle bullets" disabled={disabled}
        onMouseDown={(event) => event.preventDefault()} onClick={() => command("insertUnorderedList")}>
        <List size={16} aria-hidden="true" />Bullets</button>
    </div>
    <div key={revision} ref={editor} className={styles.keyDocument} contentEditable={!disabled}
      suppressContentEditableWarning role="textbox" aria-label="Key Maintenance Information" aria-multiline="true"
      aria-disabled={disabled} onInput={commit} onMouseUp={rememberSelection} onKeyUp={rememberSelection}
      onBlur={rememberSelection} onPaste={pasteText} onDrop={pasteText}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && (["i", "u"].includes(event.key.toLowerCase())
          || (event.shiftKey && event.key === "7"))) event.preventDefault();
      }}
      onBeforeInput={(event) => {
        const type = event.nativeEvent.inputType || "";
        if ((type.startsWith("format") && type !== "formatBold") || type === "insertOrderedList") event.preventDefault();
      }}>
      <KeyDocumentContent value={initial} />
    </div>
  </div>;
}

function keyLinksValue(links) {
  return JSON.stringify(links.map(({ id, url, displayTitle, sortOrder }) => ({ id, url, displayTitle, sortOrder })));
}

function validKeyLink(link) {
  try {
    const url = new URL(link.url);
    const hasControl = [...link.url].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    return link.url === link.url.trim() && /^https:\/\/[^\s/?#]+([/?#].*)?$/i.test(link.url)
      && !/^https:\/\/[^/?#]*@/i.test(link.url) && !hasControl && link.url.length <= 2048
      && url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password
      && (link.displayTitle === null || (typeof link.displayTitle === "string" && link.displayTitle.length <= 300))
      && Number.isInteger(link.sortOrder) && link.sortOrder >= 0 && link.sortOrder <= 2147483647;
  } catch { return false; }
}

function keyLinkLabel(link) {
  return link.displayTitle?.trim() || new URL(link.url).hostname.replace(/^www\./iu, "");
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

function formatServiceDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

function intervalProjection(workspace, maintenanceItemId, intervalValue, intervalUnit) {
  const value = Number(intervalValue);
  if (!workspace || !maintenanceItemId || !Number.isFinite(value) || value <= 0
    || !["miles", "hours", "months"].includes(intervalUnit)
    || (intervalUnit === "months" && !Number.isInteger(value))) return null;
  return calculateMaintenanceInterval({
    asset: { id: workspace.asset.id, usage_unit: workspace.asset.usageUnit },
    maintenanceItem: { id: maintenanceItemId },
    interval: { maintenance_item_id: maintenanceItemId, interval_value: value, interval_unit: intervalUnit },
    ongoingRecords: workspace.ongoingMaintenanceRecords.map((record) => ({
      id: record.id,
      asset_id: workspace.asset.id,
      service_date: record.serviceDate,
      usage_reading_value: record.usageReadingValue,
      usage_reading_unit: record.usageReadingUnit,
      items: record.capturedItems.map((item) => ({
        maintenance_item_id: item.maintenanceItemId,
        is_performed: item.isPerformed,
      })),
    })),
  });
}

function lastServiceLabel(lastService) {
  if (!lastService) return { value: "Not calculated", detail: "No qualifying service yet" };
  const reading = lastService.usageReadingValue === null || lastService.usageReadingUnit === "none"
    ? "" : `${lastService.usageReadingValue.toLocaleString()} ${lastService.usageReadingUnit === "miles" ? "mi" : "hours"} · `;
  return { value: `${reading}${formatServiceDate(lastService.serviceDate)}`, detail: "" };
}

function nextServiceLabel(interval) {
  if (interval.nextService?.kind === "usage") {
    const unit = interval.nextService.unit === "miles" ? "mi" : "hours";
    return { value: `${interval.nextService.value.toLocaleString()} ${unit}`, detail: "" };
  }
  if (interval.nextService?.kind === "date") {
    return { value: formatServiceDate(interval.nextService.serviceDate), detail: "" };
  }
  if (interval.notCalculatedReason === "usage_unit_mismatch") {
    return { value: "Not calculated", detail: "Latest reading uses a different unit" };
  }
  if (interval.notCalculatedReason === "usage_reading_missing") {
    return { value: "Not calculated", detail: "Latest service has no usage reading" };
  }
  return { value: "Not calculated", detail: "No qualifying service yet" };
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
  const [recommendedBaseline, setRecommendedBaseline] = useState([]);
  const [recommendedRecords, setRecommendedRecords] = useState([]);
  const [recommendedDeleted, setRecommendedDeleted] = useState([]);
  const [recommendedRecordId, setRecommendedRecordId] = useState("");
  const [recommendedEditing, setRecommendedEditing] = useState(false);
  const [completedBaseline, setCompletedBaseline] = useState([]);
  const [completedRecords, setCompletedRecords] = useState([]);
  const [completedDeleted, setCompletedDeleted] = useState([]);
  const [completedRecordId, setCompletedRecordId] = useState("");
  const [completedEditing, setCompletedEditing] = useState(false);
  const [keyBaseline, setKeyBaseline] = useState({ notes: null, links: [] });
  const [keyDocument, setKeyDocument] = useState({ schemaVersion: 1, blocks: [] });
  const [keyLinks, setKeyLinks] = useState([]);
  const [keyNoteId, setKeyNoteId] = useState("");
  const [keyEditing, setKeyEditing] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [ongoingEditing, setOngoingEditing] = useState(false);
  const [activeSection, setActiveSection] = useState("ongoing");
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
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
  const [maintenanceIntervalOperations, setMaintenanceIntervalOperations] = useState([]);
  const [maintenanceIntervalEditing, setMaintenanceIntervalEditing] = useState(false);
  const [maintenanceIntervalError, setMaintenanceIntervalError] = useState("");
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
  const manageDetailsRef = useRef(null);
  const recommendedDescriptionRef = useRef(null);
  const completedDescriptionRef = useRef(null);
  const keySession = useRef(0);

  const baselineById = new Map(baselineRecords.map((record) => [record.id, record]));
  const selectedMaintenanceItem = maintenanceItems?.find((item) => item.id === selectedMaintenanceItemId);
  const maintenanceItemBaseline = maintenanceItems?.find((item) => item.id === maintenanceItemDraft?.id);
  const maintenanceIntervals = workspace?.maintenanceIntervals || [];
  const maintenanceIntervalDirty = maintenanceIntervalOperations.length > 0;
  const intervalOperationById = new Map(maintenanceIntervalOperations.map((operation) => [operation.id, operation]));
  const intervalRows = [
    ...maintenanceIntervals.filter((interval) => intervalOperationById.get(interval.id)?.action !== "delete")
      .map((interval) => {
        const operation = intervalOperationById.get(interval.id);
        const maintenanceItemId = operation?.maintenanceItemId ?? interval.maintenanceItemId;
        const intervalValue = operation?.intervalValue ?? String(interval.recommendedInterval.value);
        const intervalUnit = operation?.intervalUnit ?? interval.recommendedInterval.unit;
        const projection = intervalProjection(workspace, maintenanceItemId, intervalValue, intervalUnit);
        const catalogItem = workspace?.maintenanceItemCatalog?.find((item) => item.id === maintenanceItemId);
        return {
          ...interval,
          action: operation?.action || "saved",
          maintenanceItemName: catalogItem?.displayName || interval.maintenanceItemName,
          maintenanceItemId,
          intervalValue,
          intervalUnit,
          comments: operation?.comments ?? interval.comments ?? "",
          lastService: projection ? projection.lastService : interval.lastService,
          nextService: projection ? projection.nextService : interval.nextService,
          notCalculatedReason: projection ? projection.notCalculatedReason : interval.notCalculatedReason,
        };
      }),
    ...maintenanceIntervalOperations.filter((operation) => operation.action === "create").map((operation) => {
      const projection = intervalProjection(workspace, operation.maintenanceItemId,
        operation.intervalValue, operation.intervalUnit);
      const item = workspace?.maintenanceItemCatalog?.find((entry) => entry.id === operation.maintenanceItemId);
      return {
        ...operation,
        action: "create",
        maintenanceItemName: item?.displayName || "Choose a Maintenance Item",
        recommendedInterval: { value: Number(operation.intervalValue) || 0, unit: operation.intervalUnit },
        lastService: projection?.lastService || null,
        nextService: projection?.nextService || null,
        notCalculatedReason: projection?.notCalculatedReason || "no_qualifying_service",
      };
    }),
  ];
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
  const recommendedDirty = recommendedDeleted.length > 0 || recommendedRecords.some((record) => (
    record.isNew || recommendedValue(record) !== recommendedValue(
      recommendedBaseline.find((entry) => entry.id === record.id) || record)
  ));
  const ongoingDirty = deletedRecords.length > 0 || workingRecords.some((record) => (
    record.isNew || recordValue(record) !== recordValue(baselineById.get(record.id) || record)
  ));
  const completedDirty = completedDeleted.length > 0 || completedRecords.some((record) => (
    record.isNew || completedValue(record) !== completedValue(
      completedBaseline.find((entry) => entry.id === record.id) || record)
  ));
  const keyDirty = JSON.stringify(keyDocument) !== JSON.stringify(keyBaseline.notes?.document || { schemaVersion: 1, blocks: [] })
    || keyLinksValue(keyLinks) !== keyLinksValue(keyBaseline.links);
  const dirty = ongoingDirty || recommendedDirty || completedDirty || keyDirty || maintenanceIntervalDirty;
  const sessionEditing = ongoingEditing || recommendedEditing || completedEditing || keyEditing
    || maintenanceIntervalEditing;
  const saveUncertain = retryDraft !== null;
  const manageAssetDraftDirty = manageDraftIsDirty();
  const hasMaintenanceItemDraft = Boolean(maintenanceItemDraft);
  const blocker = useBlocker(() => dirty || saving || saveUncertain
    || maintenanceItemDirty || maintenanceItemSaving || maintenanceItemRetryDraft !== null
    || (manageAssetsOpen && manageAssetDraftDirty) || manageSaving || manageRetryDraft !== null);

  useEffect(() => {
    if (!manageMenuOpen) return undefined;

    function dismissManageOnOutsidePointer(event) {
      if (!manageDetailsRef.current?.contains(event.target)) setManageMenuOpen(false);
    }

    function dismissManageOnEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setManageMenuOpen(false);
      manageButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", dismissManageOnOutsidePointer);
    document.addEventListener("keydown", dismissManageOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissManageOnOutsidePointer);
      document.removeEventListener("keydown", dismissManageOnEscape);
    };
  }, [manageMenuOpen]);

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
      loadRecommendedState(result);
      loadCompletedState(result);
      loadKeyState(result);
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
    setOngoingEditing(false);
    setRecommendedRecords(recommendedBaseline.map((record) => ({ ...record })));
    setRecommendedDeleted([]);
    setRecommendedRecordId(vehiclesService.newestRecord(recommendedBaseline)?.id || "");
    setRecommendedEditing(false);
    setRetryDraft(null);
    setCompletedRecords(completedBaseline.map((record) => ({ ...record })));
    setCompletedDeleted([]);
    setCompletedRecordId(vehiclesService.newestRecord(completedBaseline)?.id || "");
    setCompletedEditing(false);
    keySession.current += 1;
    setKeyDocument(JSON.parse(JSON.stringify(keyBaseline.notes?.document || { schemaVersion: 1, blocks: [] })));
    setKeyLinks(keyBaseline.links.map((link) => ({ ...link })));
    setKeyNoteId(keyBaseline.notes?.id || "");
    setKeyEditing(false);
    setMaintenanceIntervalOperations([]);
    setMaintenanceIntervalEditing(false);
    setMaintenanceIntervalError("");
    setSaveError("");
    setStatus("Changes canceled. The last saved records are restored.");
  }

  function loadRecommendedState(source) {
    const records = (source.recommendedServiceRecords || []).map((record) => ({ ...record }));
    setRecommendedBaseline(records);
    setRecommendedRecords(records.map((record) => ({ ...record })));
    setRecommendedDeleted([]);
    setRecommendedRecordId(vehiclesService.newestRecord(records)?.id || "");
    setRecommendedEditing(false);
  }

  function updateRecommended(update) {
    setRecommendedRecords((records) => records.map((record) => record.id === recommendedRecordId
      ? { ...record, ...update } : record));
    setSaveError("");
    setStatus("");
  }

  function loadCompletedState(source) {
    const records = (source.completedServiceRecords || []).map((record) => ({ ...record }));
    setCompletedBaseline(records);
    setCompletedRecords(records.map((record) => ({ ...record })));
    setCompletedDeleted([]);
    setCompletedRecordId(vehiclesService.newestRecord(records)?.id || "");
    setCompletedEditing(false);
  }

  function loadKeyState(source) {
    keySession.current += 1;
    const notes = source.keyInformation ? JSON.parse(JSON.stringify(source.keyInformation)) : null;
    const links = (source.links || []).map((link) => ({ ...link }));
    setKeyBaseline({ notes, links });
    setKeyDocument(notes ? JSON.parse(JSON.stringify(notes.document)) : { schemaVersion: 1, blocks: [] });
    setKeyLinks(links.map((link) => ({ ...link })));
    setKeyNoteId(notes?.id || "");
    setKeyEditing(false);
  }

  function beginKeyEdit() {
    if (saving || saveUncertain) return;
    keySession.current += 1;
    if (!keyNoteId) setKeyNoteId(crypto.randomUUID());
    setKeyEditing(true);
    setSaveError("");
    setStatus("");
  }

  function updateKeyDocument(value) {
    setKeyDocument(value);
    setSaveError("");
    setStatus("");
  }

  function updateKeyLink(id, update) {
    setKeyLinks((links) => links.map((link) => link.id === id ? { ...link, ...update } : link));
    setSaveError("");
    setStatus("");
  }

  function addKeyLink() {
    const order = Math.max(-1, ...keyLinks.map((link) => link.sortOrder)) + 1;
    if (order > 2147483647) {
      setSaveError("The link ordering limit has been reached.");
      return;
    }
    setKeyLinks((links) => [...links, { id: crypto.randomUUID(), url: "", displayTitle: null,
      sortOrder: order, version: 1, isNew: true }]);
    setSaveError("");
  }

  async function lookupKeyLinkTitle(link) {
    if (link.displayTitle?.trim() || !validKeyLink(link)) return;
    const session = keySession.current;
    try {
      const result = await resolveLinkTitle(link.url);
      if (keySession.current !== session || !result.title || result.title === link.url || result.title.length > 300) return;
      setKeyLinks((links) => links.map((current) => current.id === link.id && current.url === link.url
        && !current.displayTitle?.trim() ? { ...current, displayTitle: result.title } : current));
    } catch { return; }
  }

  function updateCompleted(update) {
    setCompletedRecords((records) => records.map((record) => record.id === completedRecordId
      ? { ...record, ...update } : record));
    setSaveError("");
    setStatus("");
  }

  function addCompleted() {
    if (!workspace || saving || saveUncertain) return;
    const record = {
      id: crypto.randomUUID(), serviceDate: createDateToday(), usageReadingValue: null,
      usageReadingUnit: workspace.asset.usageUnit, mechanic: null, serviceDescription: "", version: 1, isNew: true,
    };
    setCompletedRecords((records) => [...records, record]);
    setCompletedRecordId(record.id);
    setCompletedEditing(true);
    setSaveError("");
    setStatus("");
  }

  function toggleEditorBullets(textarea, updateDescription) {
    if (!textarea || textarea.disabled) return;
    const { selectionStart, selectionEnd, selectionDirection, scrollTop } = textarea;
    const updated = toggleDescriptionBullets(textarea.value, selectionStart, selectionEnd);
    textarea.focus({ preventScroll: true });
    if (updated.text.length > 10000) {
      setSaveError("Bullets would exceed the 10,000-character Description limit. No text was changed.");
      return;
    }
    if (updated.text === textarea.value) return;
    textarea.setSelectionRange(updated.start, updated.end);
    const inserted = document.execCommand?.("insertText", false, updated.replacement);
    if (!inserted) {
      textarea.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
      setSaveError("The browser could not apply bullets. No text was changed.");
      return;
    }
    updateDescription(textarea.value);
    textarea.setSelectionRange(updated.selectionStart, updated.selectionEnd, selectionDirection);
    textarea.scrollTop = scrollTop;
  }

  function addRecommended() {
    if (!workspace || saving || saveUncertain) return;
    const record = {
      id: crypto.randomUUID(), serviceDate: createDateToday(), usageReadingValue: null,
      usageReadingUnit: workspace.asset.usageUnit, mechanic: null, description: "", version: 1, isNew: true,
    };
    setRecommendedRecords((records) => [...records, record]);
    setRecommendedRecordId(record.id);
    setRecommendedEditing(true);
    setSaveError("");
    setStatus("");
  }

  function selectRecommended(recordId) {
    if (saving || saveUncertain) return;
    setRecommendedRecordId(recordId);
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

  function beginMaintenanceIntervalEdit() {
    if (saving || saveUncertain) return;
    setMaintenanceIntervalEditing(true);
    setMaintenanceIntervalError("");
  }

  function addMaintenanceInterval() {
    if (!workspace || saving || saveUncertain) return;
    setMaintenanceIntervalEditing(true);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalOperations((operations) => [...operations, {
      action: "create",
      id: crypto.randomUUID(),
      maintenanceItemId: "",
      intervalValue: "",
      intervalUnit: workspace.asset.usageUnit === "none" ? "months" : workspace.asset.usageUnit,
      comments: "",
    }]);
  }

  function updateMaintenanceIntervalRow(row, update) {
    if (saving || saveUncertain || row.action === "delete") return;
    setMaintenanceIntervalEditing(true);
    setMaintenanceIntervalError("");
    setMaintenanceIntervalOperations((operations) => {
      const current = operations.find((operation) => operation.id === row.id);
      if (current?.action === "delete") return operations;
      const baseline = maintenanceIntervals.find((interval) => interval.id === row.id);
      const next = {
        ...(current || (baseline ? {
          action: "update",
          id: baseline.id,
          expectedVersion: baseline.version,
          maintenanceItemId: baseline.maintenanceItemId,
          intervalValue: String(baseline.recommendedInterval.value),
          intervalUnit: baseline.recommendedInterval.unit,
          comments: baseline.comments || "",
        } : {})),
        ...update,
      };
      if (next.action === "create") {
        return operations.map((operation) => operation.id === row.id ? next : operation);
      }
      const unchanged = next.maintenanceItemId === baseline.maintenanceItemId
        && Number(next.intervalValue) === baseline.recommendedInterval.value
        && next.intervalUnit === baseline.recommendedInterval.unit
        && (next.comments.trim() || null) === (baseline.comments || null);
      if (unchanged) return operations.filter((operation) => operation.id !== row.id);
      return current
        ? operations.map((operation) => operation.id === row.id ? next : operation)
        : [...operations, next];
    });
  }

  function removeMaintenanceInterval(row) {
    if (saving || saveUncertain || row.action === "delete") return;
    setMaintenanceIntervalEditing(true);
    setMaintenanceIntervalError("");
    if (row.action === "create") {
      setMaintenanceIntervalOperations((operations) => operations.filter((operation) => operation.id !== row.id));
      return;
    }
    const baseline = maintenanceIntervals.find((interval) => interval.id === row.id);
    if (!baseline) return;
    setMaintenanceIntervalOperations((operations) => [
      ...operations.filter((operation) => operation.id !== row.id),
      { action: "delete", id: baseline.id, expectedVersion: baseline.version },
    ]);
  }

  function validateMaintenanceIntervals() {
    const seenItems = new Set();
    for (const row of intervalRows.filter((interval) => interval.action !== "saved")) {
      const value = Number(row.intervalValue);
      const available = workspace?.maintenanceItems?.some((item) =>
        item.id === row.maintenanceItemId && !item.archivedAt);
      if (!available) {
        setMaintenanceIntervalError("Choose an active Maintenance Item enabled for this asset in every interval row.");
        return false;
      }
      const duplicate = intervalRows.some((other) => other.id !== row.id
        && other.maintenanceItemId === row.maintenanceItemId);
      if (seenItems.has(row.maintenanceItemId) || duplicate) {
        setMaintenanceIntervalError("An asset can have only one interval for each Maintenance Item.");
        return false;
      }
      seenItems.add(row.maintenanceItemId);
      if (!Number.isFinite(value) || value <= 0 || value > 9999999999.99
        || !/^\d+(?:\.\d{1,2})?$/.test(row.intervalValue)
        || !["miles", "hours", "months"].includes(row.intervalUnit)
        || (row.intervalUnit === "months" && !Number.isInteger(value))) {
        setMaintenanceIntervalError("Enter a positive interval value supported by the selected unit.");
        return false;
      }
      if (typeof row.comments !== "string" || row.comments.length > 2000) {
        setMaintenanceIntervalError("Comments must be 2,000 characters or fewer.");
        return false;
      }
    }
    setMaintenanceIntervalError("");
    return true;
  }

  function buildMaintenanceIntervalOperations() {
    const operations = maintenanceIntervalOperations.map((operation) => {
      if (operation.action === "delete") return { ...operation };
      if (operation.action === "create") return {
        action: "create",
        id: operation.id,
        maintenanceItemId: operation.maintenanceItemId,
        intervalValue: Number(operation.intervalValue),
        intervalUnit: operation.intervalUnit,
        comments: operation.comments.trim() || null,
      };
      const baseline = maintenanceIntervals.find((interval) => interval.id === operation.id);
      if (!baseline) return null;
      const result = { action: "update", id: baseline.id, expectedVersion: baseline.version };
      if (operation.maintenanceItemId !== baseline.maintenanceItemId) result.maintenanceItemId = operation.maintenanceItemId;
      if (Number(operation.intervalValue) !== baseline.recommendedInterval.value) {
        result.intervalValue = Number(operation.intervalValue);
      }
      if (operation.intervalUnit !== baseline.recommendedInterval.unit) result.intervalUnit = operation.intervalUnit;
      if ((operation.comments.trim() || null) !== (baseline.comments || null)) {
        result.comments = operation.comments.trim() || null;
      }
      return result;
    }).filter(Boolean);
    return [
      ...operations.filter((operation) => operation.action === "delete"),
      ...operations.filter((operation) => operation.action === "update"),
      ...operations.filter((operation) => operation.action === "create"),
    ];
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
    if (action.kind === "completed-delete") {
      const remaining = completedRecords.filter((record) => record.id !== action.record.id);
      setCompletedRecords(remaining);
      setCompletedDeleted((records) => [...records, action.record]);
      setCompletedRecordId(vehiclesService.newestRecord(remaining)?.id || "");
      setCompletedEditing(true);
      setStatus("Record deletion queued. It will take effect only after Save Changes.");
    } else if (action.kind === "recommended-delete") {
      setRecommendedRecords((records) => records.filter((record) => record.id !== action.record.id));
      setRecommendedDeleted((records) => [...records, action.record]);
      setRecommendedRecordId(vehiclesService.newestRecord(
        recommendedRecords.filter((record) => record.id !== action.record.id))?.id || "");
      setRecommendedEditing(true);
      setStatus("Record deletion queued. It will take effect only after Save Changes.");
    } else if (action.kind === "manage-assets-open") {
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
    for (const record of recommendedRecords) {
      const original = recommendedBaseline.find((entry) => entry.id === record.id);
      if (!record.isNew && (!original || recommendedValue(record) === recommendedValue(original))) continue;
      const operation = { action: record.isNew ? "create" : "update", id: record.id };
      if (!record.isNew) operation.expectedVersion = original.version;
      for (const field of ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "description"]) {
        if (record.isNew || record[field] !== original[field]) operation[field] = record[field];
      }
      draft.recommendedOperations.push(operation);
    }
    draft.recommendedOperations.push(...recommendedDeleted.map((record) => (
      buildRecordDeleteOperation("recommended", record, workspace.asset.id).operation
    )));
    for (const record of completedRecords) {
      const original = completedBaseline.find((entry) => entry.id === record.id);
      if (!record.isNew && (!original || completedValue(record) === completedValue(original))) continue;
      const operation = { action: record.isNew ? "create" : "update", id: record.id };
      if (!record.isNew) operation.expectedVersion = original.version;
      for (const field of ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "serviceDescription"]) {
        if (record.isNew || record[field] !== original[field]) operation[field] = record[field];
      }
      draft.completedOperations.push(operation);
    }
    draft.completedOperations.push(...completedDeleted.map((record) => (
      buildRecordDeleteOperation("completed", record, workspace.asset.id).operation
    )));
    if (JSON.stringify(keyDocument) !== JSON.stringify(keyBaseline.notes?.document || { schemaVersion: 1, blocks: [] })) {
      draft.keyInformationOperation = keyBaseline.notes
        ? { action: "update", id: keyBaseline.notes.id, expectedVersion: keyBaseline.notes.version, document: keyDocument }
        : { action: "create", id: keyNoteId, document: keyDocument };
    }
    for (const link of keyLinks) {
      const original = keyBaseline.links.find((entry) => entry.id === link.id);
      if (!original) draft.linkOperations.push({ action: "create", id: link.id, url: link.url,
        displayTitle: link.displayTitle, sortOrder: link.sortOrder });
      else {
        const operation = { action: "update", id: link.id, expectedVersion: original.version };
        for (const field of ["url", "displayTitle", "sortOrder"]) {
          if (link[field] !== original[field]) operation[field] = link[field];
        }
        if (Object.keys(operation).length > 3) draft.linkOperations.push(operation);
      }
    }
    draft.linkOperations.push(...keyBaseline.links.filter((link) => !keyLinks.some((entry) => entry.id === link.id))
      .map((link) => ({ action: "delete", id: link.id, expectedVersion: link.version })));
    draft.intervalOperations.push(...buildMaintenanceIntervalOperations());
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
      loadRecommendedState(fresh);
      loadCompletedState(fresh);
      loadKeyState(fresh);
      setMaintenanceIntervalOperations([]);
      setMaintenanceIntervalEditing(false);
      setMaintenanceIntervalError("");
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
        maintenanceIntervals: buildMaintenanceIntervalOperations().reduce((intervals, operation) => {
          const existing = intervals.find((interval) => interval.id === operation.id);
          if (operation.action === "delete") return intervals.filter((interval) => interval.id !== operation.id);
          const itemId = operation.maintenanceItemId || existing?.maintenanceItemId;
          const item = current.maintenanceItemCatalog.find((entry) => entry.id === itemId);
          const value = operation.intervalValue ?? existing?.recommendedInterval.value;
          const unit = operation.intervalUnit || existing?.recommendedInterval.unit;
          const projected = intervalProjection(current, itemId, String(value), unit);
          const saved = {
            ...(existing || {}),
            id: operation.id,
            maintenanceItemId: itemId,
            maintenanceItemName: item?.displayName || existing?.maintenanceItemName || "Maintenance Item",
            recommendedInterval: { value, unit },
            comments: Object.hasOwn(operation, "comments") ? operation.comments : existing?.comments || null,
            version: result.entityVersions?.intervals?.[operation.id] || existing?.version || 1,
            ...projected,
          };
          return existing
            ? intervals.map((interval) => interval.id === saved.id ? saved : interval)
            : [...intervals, saved];
        }, current.maintenanceIntervals || []),
      }));
      setBaselineRecords(copyRecords(records));
      setWorkingRecords(copyRecords(records));
      setDeletedRecords([]);
      setOngoingEditing(false);
      const recommended = recommendedRecords.map((record) => ({
        ...record, isNew: false, version: result.entityVersions?.recommended?.[record.id] || record.version,
      }));
      setRecommendedBaseline(recommended);
      setRecommendedRecords(recommended.map((record) => ({ ...record })));
      setRecommendedDeleted([]);
      setRecommendedEditing(false);
      const completed = completedRecords.map((record) => ({
        ...record, isNew: false, version: result.entityVersions?.completed?.[record.id] || record.version,
      }));
      setCompletedBaseline(completed);
      setCompletedRecords(completed.map((record) => ({ ...record })));
      setCompletedDeleted([]);
      setCompletedEditing(false);
      setMaintenanceIntervalOperations([]);
      setMaintenanceIntervalEditing(false);
      setMaintenanceIntervalError("");
      loadKeyState({
        keyInformation: keyDocument.blocks.length ? { id: keyNoteId, document: keyDocument,
          version: result.entityVersions?.key_information?.[keyNoteId] || keyBaseline.notes?.version || 1 } : null,
        links: keyLinks.map((link) => ({ ...link, isNew: false,
          version: result.entityVersions?.links?.[link.id] || link.version })),
      });
      setStatus("Changes were saved, but the latest workspace could not be reloaded. Retry loading before further edits.");
    }
  }

  async function saveChanges(event) {
    event?.preventDefault();
    if (!workspace || saveLock.current || !dirty || saving || workspaceLoading || saveUncertain) return;
    const invalidRecommended = recommendedRecords.some((record) => {
      const original = recommendedBaseline.find((entry) => entry.id === record.id);
      if (!record.isNew && original && recommendedValue(record) === recommendedValue(original)) return false;
      const reading = record.usageReadingValue;
      return !/^\d{4}-\d{2}-\d{2}$/.test(record.serviceDate)
        || Number.isNaN(Date.parse(`${record.serviceDate}T00:00:00Z`))
        || new Date(`${record.serviceDate}T00:00:00Z`).toISOString().slice(0, 10) !== record.serviceDate
        || !record.description.trim() || record.description !== record.description.trim()
        || record.description.length > 10000 || (record.mechanic || "").length > 160
        || (reading !== null && (!Number.isFinite(reading) || reading < 0 || reading > 9999999999.99
          || Math.abs(reading * 100 - Math.round(reading * 100)) > 0.0001))
        || (record.usageReadingUnit === "none" && reading !== null)
        || recommendedRecords.some((entry) => entry.id !== record.id && entry.serviceDate === record.serviceDate);
    });
    if (invalidRecommended) {
      setSaveError("Review Recommended Service: use a unique valid date, a nonnegative reading with at most two decimals, and a trimmed Description (1-10,000 characters).");
      return;
    }
    const invalidCompleted = completedRecords.some((record) => {
      const original = completedBaseline.find((entry) => entry.id === record.id);
      if (!record.isNew && original && completedValue(record) === completedValue(original)) return false;
      const reading = record.usageReadingValue;
      return !/^\d{4}-\d{2}-\d{2}$/.test(record.serviceDate)
        || Number.isNaN(Date.parse(`${record.serviceDate}T00:00:00Z`))
        || new Date(`${record.serviceDate}T00:00:00Z`).toISOString().slice(0, 10) !== record.serviceDate
        || !record.serviceDescription.trim() || record.serviceDescription !== record.serviceDescription.trim()
        || record.serviceDescription.length > 10000 || (record.mechanic || "").length > 160
        || (reading !== null && (!Number.isFinite(reading) || reading < 0 || reading > 9999999999.99
          || Math.abs(reading * 100 - Math.round(reading * 100)) > 0.0001))
        || (record.usageReadingUnit === "none" && reading !== null)
        || completedRecords.some((entry) => entry.id !== record.id && entry.serviceDate === record.serviceDate);
    });
    if (invalidCompleted) {
      setSaveError("Review Completed Service: use a unique valid date, a nonnegative reading with at most two decimals, and a trimmed Service Description (1-10,000 characters).");
      return;
    }
    if (maintenanceIntervalDirty && !validateMaintenanceIntervals()) return;
    if (keyDocumentLength(keyDocument) > 50000 || keyLinks.some((link) => !validKeyLink(link))) {
      setSaveError("Review Key Information: notes allow 50,000 text units; links need an HTTPS URL (up to 2,048 characters), an optional title up to 300 characters, and valid ordering.");
      return;
    }
    keySession.current += 1;
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
        setRecommendedBaseline(recommendedRecords.map((record) => ({ ...record })));
        setRecommendedDeleted([]);
        setCompletedBaseline(completedRecords.map((record) => ({ ...record })));
        setCompletedDeleted([]);
        loadKeyState({ keyInformation: keyBaseline.notes, links: keyLinks });
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
  const recommendedRecord = recommendedRecords.find((record) => record.id === recommendedRecordId);
  const completedRecord = completedRecords.find((record) => record.id === completedRecordId);
  const recommendedActive = activeSection === "recommended";
  const completedActive = activeSection === "completed";
  const ongoingActive = activeSection === "ongoing";
  const intervalsActive = activeSection === "intervals";
  const keyActive = activeSection === "key-information";
  const activeRecord = completedActive ? completedRecord
    : recommendedActive ? recommendedRecord : ongoingActive ? selectedRecord : null;
  const activeEditing = completedActive ? completedEditing : recommendedActive ? recommendedEditing : ongoingEditing;
  const sectionDirty = (sectionId) => sectionId === "ongoing" ? ongoingDirty
    : sectionId === "recommended" ? recommendedDirty : sectionId === "completed" ? completedDirty
      : sectionId === "intervals" ? maintenanceIntervalDirty
        : sectionId === "key-information" ? keyDirty : false;
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
  const intervalOptionsFor = (row) => {
    const assigned = new Set(intervalRows.filter((interval) => interval.id !== row.id)
      .map((interval) => interval.maintenanceItemId).filter(Boolean));
    const options = (workspace?.maintenanceItems || []).filter((item) =>
      !item.archivedAt && (!assigned.has(item.id) || item.id === row.maintenanceItemId));
    if (row.maintenanceItemId && !options.some((item) => item.id === row.maintenanceItemId)) {
      const currentItem = workspace?.maintenanceItemCatalog?.find((item) => item.id === row.maintenanceItemId);
      if (currentItem) options.push({ ...currentItem, unavailable: true });
    }
    return options.sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
  };
  const confirmationTitle = confirmation?.kind === "completed-delete"
    ? "Queue deletion of this Completed Service record?"
    : confirmation?.kind === "recommended-delete"
    ? "Queue deletion of this Recommended Service record?"
    : confirmation?.kind === "delete"
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
    <main className={`${styles.page} ${sessionEditing ? styles.pageEditing : ""}`}>
      <PageHeader id="vehicles-page-title" title="Vehicles" />
      <div className={styles.vehicleContextRow}>
        <div className={styles.assetRow}>
          <label className={`lm-form-field ${styles.assetLabel}`} htmlFor="vehicles-asset-select">
            <span className="lm-form-label">Vehicle</span>
            <select id="vehicles-asset-select" className={`lm-form-control ${styles.assetSelectorControl}`}
              value={selectedAssetId}
              disabled={!assets?.length || saving || saveUncertain || dirty}
              onChange={(event) => selectAsset(event.target.value)}>
              {assets?.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.pageActions}>
          <details ref={manageDetailsRef} className={`${styles.pageMoreActions} ${styles.pageManageActions}`}
            open={manageMenuOpen}>
            <summary ref={manageButtonRef} className="lm-button lm-button--secondary"
              aria-label="Manage" aria-expanded={manageMenuOpen} title="Manage"
              onClick={(event) => {
                event.preventDefault();
                setManageMenuOpen((open) => !open);
              }}>Manage</summary>
            <div className={`${styles.pageMoreActionsMenu} ${styles.pageManageActionsMenu}`}>
              <button type="button" className="lm-button lm-button--secondary"
                onClick={() => {
                  setManageMenuOpen(false);
                  openManageAssets();
                }} disabled={saving || saveUncertain || manageSaving
                  || maintenanceItemSaving || manageMaintenanceItemsOpen}>
                Assets
              </button>
              <button ref={manageMaintenanceItemsButtonRef} type="button" className="lm-button lm-button--secondary"
                onClick={() => {
                  setManageMenuOpen(false);
                  openManageMaintenanceItems();
                }} disabled={saving || saveUncertain || manageSaving
                  || manageRetryDraft || maintenanceItemSaving}>
                Maintenance Items
              </button>
              <button type="button" className="lm-button lm-button--secondary"
                onClick={() => {
                  setManageMenuOpen(false);
                  setActiveSection("intervals");
                }} disabled={!workspace || saving || saveUncertain}>
                Maintenance Intervals
              </button>
            </div>
          </details>
          {workspace && keyActive && !keyEditing && <button type="button"
            className={`lm-button ${keyBaseline.notes || keyBaseline.links.length ? "lm-button--secondary" : "lm-button--primary"}`}
            onClick={beginKeyEdit} disabled={saving || saveUncertain}>
            {keyBaseline.notes || keyBaseline.links.length ? "Edit" : "Add Key Information"}
          </button>}
          {activeRecord && !activeRecord.isNew && !activeEditing && (
            <button type="button" className="lm-button lm-button--secondary"
              onClick={completedActive ? () => setCompletedEditing(true)
                : recommendedActive ? () => setRecommendedEditing(true) : editSelectedRecord}
              disabled={saving || saveUncertain}>Edit</button>
          )}
          {workspace && intervalsActive && !sessionEditing && <button type="button"
            className="lm-button lm-button--secondary" onClick={beginMaintenanceIntervalEdit}
            disabled={saving || saveUncertain}>Edit</button>}
          {workspace && (ongoingActive || recommendedActive || completedActive) && !activeEditing && <button type="button" className="lm-button lm-button--primary"
            onClick={completedActive ? addCompleted : recommendedActive ? addRecommended : addRecord} disabled={saving || saveUncertain}>
            {completedActive ? "Add Completed Service" : recommendedActive ? "Add Recommended Service" : "Add Ongoing Record"}</button>}
          {activeRecord && !activeRecord.isNew && !sessionEditing && (
            <button type="button" className={`lm-button lm-button--danger ${styles.recordDeleteAction}`}
              onClick={completedActive ? () => setConfirmation({ kind: "completed-delete", record: activeRecord })
                : recommendedActive ? () => setConfirmation({ kind: "recommended-delete", record: activeRecord }) : queueDelete}
              disabled={saving || saveUncertain}>Delete Record</button>
          )}
          {sessionEditing && <button type="button"
            className={`lm-button lm-button--secondary ${styles.desktopSessionAction}`}
            onClick={resetDraft} disabled={saving || saveUncertain}>Cancel Changes</button>}
          {sessionEditing && <button type="button" className={`lm-button lm-button--primary ${styles.desktopSessionAction}`}
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
                aria-label={sectionDirty(section.id)
                  ? `${section.label}, unsaved changes` : section.label}
                tabIndex={activeSection === section.id ? 0 : -1}
                className={`${styles.sectionTab} ${activeSection === section.id ? styles.sectionTabActive : ""}`}
                onClick={() => setActiveSection(section.id)}
                onKeyDown={handleVehicleSectionKeyDown}>
                <span>{section.label}</span>
                {sectionDirty(section.id) && (
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
                <option key={section.id} value={section.id}>
                  {section.label}{sectionDirty(section.id) ? " *" : ""}
                </option>
              ))}
            </select>
          </label>

          {(completedEditing || keyEditing) && !ongoingActive && !recommendedActive && !completedActive && !keyActive && saveError && (
            <div className="lm-feedback lm-feedback--error" role="alert">
              <p>{saveError}</p>
              {saveUncertain && <button type="button" className="lm-button lm-button--secondary"
                onClick={retryUnknownSave} disabled={saving}>Retry same save</button>}
            </div>
          )}
          {(completedEditing || keyEditing) && !ongoingActive && !recommendedActive && !completedActive && !keyActive && status && (
            <p role="status" aria-live="polite">{status}</p>
          )}

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

            {recommendedActive && (
              <section className={styles.recommendedSection} aria-labelledby="vehicles-recommended-title">
                <h2 id="vehicles-recommended-title" className={styles.visuallyHidden}>Recommended Service</h2>
                {saveError && <div className="lm-feedback lm-feedback--error" role="alert">
                  <p>{saveError}</p>
                  {saveUncertain && <button type="button" className="lm-button lm-button--secondary"
                    onClick={retryUnknownSave} disabled={saving}>Retry same save</button>}
                </div>}
                {status && <p role="status" aria-live="polite">{status}</p>}
                {recommendedRecord ? <form id="vehicles-recommended-form" className={styles.recommendedForm}
                  onSubmit={saveChanges} noValidate>
                  {recommendedEditing ? <label className={`lm-form-field ${styles.recommendedDate}`} htmlFor="vehicles-recommended-date">
                    <span className="lm-form-label">Date</span>
                    <input id="vehicles-recommended-date" className="lm-form-control" type="date" required
                      value={recommendedRecord.serviceDate} disabled={saving || saveUncertain}
                      onChange={(event) => updateRecommended({ serviceDate: event.target.value })} />
                  </label> : <label className={`lm-form-field ${styles.recommendedDate}`} htmlFor="vehicles-recommended-record">
                    <span className="lm-form-label">Date</span>
                    <select id="vehicles-recommended-record" className="lm-form-control" value={recommendedRecordId}
                      disabled={saving || saveUncertain} onChange={(event) => selectRecommended(event.target.value)}>
                      {[...recommendedRecords].sort((left, right) => right.serviceDate.localeCompare(left.serviceDate)
                        || left.id.localeCompare(right.id)).map((record) => (
                        <option key={record.id} value={record.id}>{record.serviceDate}</option>
                      ))}
                    </select>
                  </label>}
                  <div className={styles.recommendedFields}>
                    {workspace.asset.usageUnit !== "none" && (recommendedEditing
                      ? <label className="lm-form-field" htmlFor="vehicles-recommended-usage">
                        <span className="lm-form-label">{workspace.asset.usageUnit === "hours" ? "Hours" : "Mileage"}</span>
                        <input id="vehicles-recommended-usage" className="lm-form-control" type="number" min="0" step="0.01"
                          value={recommendedRecord.usageReadingValue ?? ""} disabled={saving || saveUncertain}
                          onChange={(event) => updateRecommended({
                            usageReadingValue: event.target.value === "" ? null : Number(event.target.value),
                            usageReadingUnit: workspace.asset.usageUnit,
                          })} />
                      </label>
                      : <dl><dt>{workspace.asset.usageUnit === "hours" ? "Hours" : "Mileage"}</dt>
                        <dd>{recommendedRecord.usageReadingValue?.toLocaleString() ?? "Not recorded"}</dd></dl>)}
                    {recommendedEditing ? <label className="lm-form-field" htmlFor="vehicles-recommended-mechanic">
                      <span className="lm-form-label">Mechanic</span>
                      <input id="vehicles-recommended-mechanic" className="lm-form-control" maxLength="160"
                        value={recommendedRecord.mechanic || ""} disabled={saving || saveUncertain}
                        onChange={(event) => updateRecommended({ mechanic: event.target.value || null })} />
                    </label> : <dl><dt>Mechanic</dt><dd>{recommendedRecord.mechanic || "Not recorded"}</dd></dl>}
                  </div>
                  <div className={styles.recommendedDescription}>
                    <div className={styles.descriptionLabelRow}>
                      <label className="lm-form-label" htmlFor={recommendedEditing ? "vehicles-recommended-description" : undefined}>Description</label>
                      {recommendedEditing && <button type="button"
                        className={`lm-button lm-button--secondary ${styles.descriptionBullets}`}
                        aria-label="Toggle bullets" title="Toggle bullets on selected lines"
                        disabled={saving || saveUncertain} onMouseDown={(event) => event.preventDefault()}
                        onClick={() => toggleEditorBullets(recommendedDescriptionRef.current,
                          (description) => updateRecommended({ description }))}>
                        <List size={16} aria-hidden="true" />Bullets
                      </button>}
                    </div>
                    {recommendedEditing ? <textarea ref={recommendedDescriptionRef}
                      id="vehicles-recommended-description" className="lm-form-control"
                      required maxLength="10000" value={recommendedRecord.description} disabled={saving || saveUncertain}
                      onChange={(event) => updateRecommended({ description: event.target.value })} />
                      : <div className={styles.recommendedText} tabIndex={0} role="region" aria-label="Recommended Service Description">
                        {recommendedRecord.description}
                      </div>}
                  </div>
                </form> : <div className={styles.recommendedEmpty}>
                  <p>{recommendedDeleted.length ? "All Recommended Service records are queued for deletion."
                    : "No recommended service recorded for this asset."}</p>
                </div>}
              </section>
            )}

            {completedActive && (
              <section className={styles.completedSection} aria-labelledby="vehicles-completed-title">
                <h2 id="vehicles-completed-title" className={styles.visuallyHidden}>Completed Service</h2>
                {saveError && <div className="lm-feedback lm-feedback--error" role="alert">
                  <p>{saveError}</p>
                  {saveUncertain && <button type="button" className="lm-button lm-button--secondary"
                    onClick={retryUnknownSave} disabled={saving}>Retry same save</button>}
                </div>}
                {status && <p role="status" aria-live="polite">{status}</p>}
                {completedRecord ? <form id="vehicles-completed-form" className={styles.recommendedForm}
                  onSubmit={saveChanges} noValidate>
                  {completedEditing ? <label className={`lm-form-field ${styles.recommendedDate}`} htmlFor="vehicles-completed-date">
                    <span className="lm-form-label">Date of Service</span>
                    <input id="vehicles-completed-date" className="lm-form-control" type="date" required
                      value={completedRecord.serviceDate} disabled={saving || saveUncertain}
                      onChange={(event) => updateCompleted({ serviceDate: event.target.value })} />
                  </label> : <label className={`lm-form-field ${styles.recommendedDate}`} htmlFor="vehicles-completed-record">
                    <span className="lm-form-label">Date of Service</span>
                    <select id="vehicles-completed-record" className="lm-form-control" value={completedRecordId}
                      disabled={saving || saveUncertain} onChange={(event) => setCompletedRecordId(event.target.value)}>
                      {[...completedRecords].sort((left, right) => right.serviceDate.localeCompare(left.serviceDate)
                        || left.id.localeCompare(right.id)).map((record) => (
                        <option key={record.id} value={record.id}>{record.serviceDate}</option>
                      ))}
                    </select>
                  </label>}
                  <div className={styles.recommendedFields}>
                    {workspace.asset.usageUnit !== "none" && (completedEditing
                      ? <label className="lm-form-field" htmlFor="vehicles-completed-usage">
                        <span className="lm-form-label">{workspace.asset.usageUnit === "hours" ? "Hours" : "Mileage"}</span>
                        <input id="vehicles-completed-usage" className="lm-form-control" type="number" min="0" step="0.01"
                          value={completedRecord.usageReadingValue ?? ""} disabled={saving || saveUncertain}
                          onChange={(event) => updateCompleted({
                            usageReadingValue: event.target.value === "" ? null : Number(event.target.value),
                            usageReadingUnit: workspace.asset.usageUnit,
                          })} />
                      </label>
                      : <dl><dt>{workspace.asset.usageUnit === "hours" ? "Hours" : "Mileage"}</dt>
                        <dd>{completedRecord.usageReadingValue?.toLocaleString() ?? "Not recorded"}</dd></dl>)}
                    {completedEditing ? <label className="lm-form-field" htmlFor="vehicles-completed-mechanic">
                      <span className="lm-form-label">Mechanic</span>
                      <input id="vehicles-completed-mechanic" className="lm-form-control" maxLength="160"
                        value={completedRecord.mechanic || ""} disabled={saving || saveUncertain}
                        onChange={(event) => updateCompleted({ mechanic: event.target.value || null })} />
                    </label> : <dl><dt>Mechanic</dt><dd>{completedRecord.mechanic || "Not recorded"}</dd></dl>}
                  </div>
                  <div className={styles.recommendedDescription}>
                    <div className={styles.descriptionLabelRow}>
                      <label className="lm-form-label" htmlFor={completedEditing ? "vehicles-completed-description" : undefined}>Service Description</label>
                      {completedEditing && <button type="button"
                        className={`lm-button lm-button--secondary ${styles.descriptionBullets}`}
                        aria-label="Toggle bullets" title="Toggle bullets on selected lines"
                        disabled={saving || saveUncertain} onMouseDown={(event) => event.preventDefault()}
                        onClick={() => toggleEditorBullets(completedDescriptionRef.current,
                          (serviceDescription) => updateCompleted({ serviceDescription }))}>
                        <List size={16} aria-hidden="true" />Bullets
                      </button>}
                    </div>
                    {completedEditing ? <textarea ref={completedDescriptionRef}
                      id="vehicles-completed-description" className="lm-form-control"
                      required maxLength="10000" value={completedRecord.serviceDescription} disabled={saving || saveUncertain}
                      onChange={(event) => updateCompleted({ serviceDescription: event.target.value })} />
                      : <div className={styles.recommendedText} tabIndex={0} role="region" aria-label="Completed Service Description">
                        {completedRecord.serviceDescription}
                      </div>}
                  </div>
                </form> : <div className={styles.recommendedEmpty}>
                  <p>{completedDeleted.length ? "All Completed Service records are queued for deletion."
                    : "No completed service recorded for this asset."}</p>
                </div>}
              </section>
            )}

            {intervalsActive && (
              <section className={`${styles.sectionContent} ${styles.intervalSection}`}
                aria-labelledby="vehicles-intervals-section-title">
                <div className={styles.sectionHeading}>
                  <div><h2 id="vehicles-intervals-section-title">Maintenance Intervals</h2></div>
                  <button type="button" className="lm-button lm-button--secondary"
                    onClick={addMaintenanceInterval} disabled={saving || saveUncertain}>
                    + New Service
                  </button>
                </div>
                {saveError && <div className="lm-feedback lm-feedback--error" role="alert">
                  <p>{saveError}</p>
                  {saveUncertain && <button type="button" className="lm-button lm-button--secondary"
                    onClick={retryUnknownSave} disabled={saving}>Retry same save</button>}
                </div>}
                {maintenanceIntervalError && <p className="lm-feedback lm-feedback--error" role="alert">
                  {maintenanceIntervalError}
                </p>}
                {status && <p className="lm-feedback" role="status" aria-live="polite">{status}</p>}
                {intervalRows.length === 0
                  ? <p className="lm-empty-state">No Maintenance Intervals are set for this asset.</p>
                  : <div role="table" aria-label={`Maintenance Intervals for ${workspace.asset.name}`}
                    className={styles.intervalTable}>
                    <div role="rowgroup" className={styles.intervalTableHeader}>
                      <div role="row">
                        <span role="columnheader">Maintenance Item</span>
                        <span role="columnheader">Last Service</span>
                        <span role="columnheader">Recommended Interval</span>
                        <span role="columnheader">Next Service</span>
                        <span role="columnheader">Comments</span>
                        <span role="columnheader" className={styles.intervalActionHeading}>Actions</span>
                      </div>
                    </div>
                    <div role="rowgroup" className={styles.intervalTableBody}>
                      {[...intervalRows].sort((left, right) => left.maintenanceItemName.localeCompare(right.maintenanceItemName)
                        || left.id.localeCompare(right.id)).map((interval) => {
                        const last = lastServiceLabel(interval.lastService);
                        const next = nextServiceLabel(interval);
                        const editable = sessionEditing;
                        return <div key={interval.id} role="row"
                          className={`${styles.intervalRow} ${interval.action !== "saved" ? styles.intervalRowPending : ""}`}>
                          <div role="cell" className={styles.intervalItemCell}>
                            <span className={styles.intervalMobileLabel}>Maintenance Item</span>
                            {editable ? <select id={`vehicles-maintenance-interval-item-${interval.id}`}
                              className="lm-form-control" aria-label={`Maintenance Item ${interval.id}`}
                              value={interval.maintenanceItemId} disabled={saving || saveUncertain}
                              onChange={(event) => updateMaintenanceIntervalRow(interval,
                                { maintenanceItemId: event.target.value })}>
                              <option value="">Choose a Maintenance Item</option>
                              {intervalOptionsFor(interval).map((item) => <option key={item.id} value={item.id}
                                disabled={item.unavailable}>{item.displayName}{item.unavailable ? " (unavailable)" : ""}</option>)}
                            </select> : <strong>{interval.maintenanceItemName}</strong>}
                          </div>
                          <div role="cell" className={styles.intervalServiceCell}>
                            <span className={styles.intervalMobileLabel}>Last Service</span>
                            <span>{last.value}</span>
                            {last.detail && <small>{last.detail}</small>}
                          </div>
                          <div role="cell" className={styles.intervalRecommendedCell}>
                            <span className={styles.intervalMobileLabel}>Recommended Interval</span>
                            {editable ? <div className={styles.intervalRecommendedControls}>
                              <input id={`vehicles-maintenance-interval-value-${interval.id}`}
                                className="lm-form-control" type="number" min="0.01" max="9999999999.99"
                                step={interval.intervalUnit === "months" ? "1" : "0.01"}
                                aria-label={`Interval value ${interval.maintenanceItemName}`}
                                aria-invalid={Boolean(maintenanceIntervalError)} value={interval.intervalValue}
                                disabled={saving || saveUncertain}
                                onChange={(event) => updateMaintenanceIntervalRow(interval,
                                  { intervalValue: event.target.value })} />
                              <select id={`vehicles-maintenance-interval-unit-${interval.id}`}
                                className="lm-form-control" aria-label={`Interval unit ${interval.maintenanceItemName}`}
                                value={interval.intervalUnit} disabled={saving || saveUncertain}
                                onChange={(event) => updateMaintenanceIntervalRow(interval,
                                  { intervalUnit: event.target.value })}>
                                <option value="miles">Miles</option>
                                <option value="hours">Hours</option>
                                <option value="months">Months</option>
                              </select>
                            </div> : <span>{interval.recommendedInterval.value.toLocaleString()} {interval.recommendedInterval.unit}</span>}
                          </div>
                          <div role="cell" className={styles.intervalServiceCell}>
                            <span className={styles.intervalMobileLabel}>Next Service</span>
                            <span>{next.value}</span>
                            {next.detail && <small>{next.detail}</small>}
                          </div>
                          <div role="cell" className={styles.intervalCommentsCell}>
                            <span className={styles.intervalMobileLabel}>Comments</span>
                            {editable ? <textarea id={`vehicles-maintenance-interval-comments-${interval.id}`}
                              className="lm-form-control" aria-label={`Comments ${interval.maintenanceItemName}`}
                              rows="2" maxLength="2000" value={interval.comments}
                              disabled={saving || saveUncertain}
                              onChange={(event) => updateMaintenanceIntervalRow(interval,
                                { comments: event.target.value })} />
                              : <span>{interval.comments || "—"}</span>}
                          </div>
                          <div role="cell" className={styles.intervalActionCell}>
                            {editable && <button type="button" className="lm-button lm-button--secondary"
                              aria-label={`Remove Service ${interval.maintenanceItemName}`}
                              disabled={saving || saveUncertain} onClick={() => removeMaintenanceInterval(interval)}>
                              Remove
                            </button>}
                          </div>
                        </div>;
                      })}
                    </div>
                  </div>}
              </section>
            )}

            {keyActive && (
              <section aria-labelledby="vehicles-key-title">
                <h2 id="vehicles-key-title" className={styles.visuallyHidden}>Key Information</h2>
                {saveError && <div className="lm-feedback lm-feedback--error" role="alert">
                  <p>{saveError}</p>
                  {saveUncertain && <button type="button" className="lm-button lm-button--secondary"
                    onClick={retryUnknownSave} disabled={saving}>Retry same save</button>}
                </div>}
                {status && <p role="status" aria-live="polite">{status}</p>}
                <div className={styles.keyRegions}>
                  <section className={styles.keyPanel} aria-labelledby="vehicles-key-notes-title">
                    <h3 id="vehicles-key-notes-title">Key Maintenance Information</h3>
                    {keyEditing ? <KeyDocumentEditor key={`${selectedAssetId}-${keyNoteId}`} value={keyDocument}
                      onChange={updateKeyDocument} onError={setSaveError} disabled={saving || saveUncertain} />
                      : keyDocument.blocks.length ? <div className={`${styles.keyDocument} ${styles.keyReadOnly}`}>
                        <KeyDocumentContent value={keyDocument} />
                      </div> : <p className="lm-empty-state">No key maintenance information recorded for this asset.</p>}
                  </section>
                  <section className={styles.keyPanel} aria-labelledby="vehicles-key-links-title">
                    <div className={styles.keyLinksHeading}>
                      <h3 id="vehicles-key-links-title">Links &amp; References</h3>
                      {keyEditing && <button type="button" className="lm-button lm-button--secondary"
                        onClick={addKeyLink} disabled={saving || saveUncertain}>Add Link</button>}
                    </div>
                    <div className={styles.keyScroll}>
                      {keyLinks.length === 0 && <p className="lm-empty-state">No links recorded for this asset.</p>}
                      {[...keyLinks].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
                        .map((link, index) => keyEditing ? <div key={link.id} className={styles.keyLinkEditor}>
                          <label className="lm-form-field" htmlFor={`vehicles-key-url-${link.id}`}>
                            <span className="lm-form-label">URL</span>
                            <input id={`vehicles-key-url-${link.id}`} className="lm-form-control" type="url" maxLength="2048"
                              value={link.url} disabled={saving || saveUncertain}
                              onChange={(event) => updateKeyLink(link.id, { url: event.target.value })}
                              onBlur={() => lookupKeyLinkTitle(link)} />
                          </label>
                          <label className="lm-form-field" htmlFor={`vehicles-key-title-${link.id}`}>
                            <span className="lm-form-label">Display Title</span>
                            <input id={`vehicles-key-title-${link.id}`} className="lm-form-control" maxLength="300"
                              value={link.displayTitle || ""} disabled={saving || saveUncertain}
                              onChange={(event) => updateKeyLink(link.id, { displayTitle: event.target.value || null })} />
                          </label>
                          <button type="button" className="lm-button lm-button--secondary"
                            aria-label={`Remove link ${link.displayTitle || index + 1}`} disabled={saving || saveUncertain}
                            onClick={() => { setKeyLinks((links) => links.filter((entry) => entry.id !== link.id)); setStatus("Link removal queued."); }}>
                            Remove
                          </button>
                        </div> : <p key={link.id} className={styles.keyLink}>
                          <a href={link.url} target="_blank" rel="noopener noreferrer">{keyLinkLabel(link)}</a>
                        </p>)}
                    </div>
                  </section>
                </div>
              </section>
            )}
          </div>
          {sessionEditing && <div className={styles.mobileSessionActions} aria-label="Vehicle editing actions">
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

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="vehicles-confirm-title"
        onCancel={(event) => {
          event.preventDefault();
          if (blocker.state === "blocked" && !confirmation) blocker.reset();
          else setConfirmation(null);
        }}>
        <h2 id="vehicles-confirm-title">{confirmationTitle}</h2>
        <p>{["delete", "recommended-delete", "completed-delete"].includes(confirmation?.kind)
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
          {(["delete", "recommended-delete", "completed-delete"].includes(confirmation?.kind)
            || confirmation?.kind === "maintenance-item-archive") && (
            <button type="button" className={`lm-button lm-button--danger ${styles.archiveAction}`}
              aria-label={["delete", "recommended-delete", "completed-delete"].includes(confirmation.kind) ? "Queue Delete"
                : "Archive Maintenance Item"}
              onClick={finishConfirmation}>
              {["delete", "recommended-delete", "completed-delete"].includes(confirmation.kind) ? "Queue Delete"
                : "Archive Maintenance Item"}
            </button>
          )}
          {confirmation && !["delete", "recommended-delete", "completed-delete", "maintenance-item-archive"].includes(confirmation.kind)
            && !saveUncertain && !saving
            && !maintenanceItemSaving && !maintenanceItemRetryDraft
            && <button type="button"
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
