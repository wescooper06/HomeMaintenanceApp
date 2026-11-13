import { getSupabaseClient } from "./supabaseClient.js";
import { createVehiclesDataAccess, VehiclesDataAccessError } from "./vehiclesDataAccess.js";
import { calculateMaintenanceInterval, parseDateOnly } from "./vehiclesMaintenanceIntervalEngine.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE_UNITS = new Set(["miles", "hours", "none"]);
const ITEM_GROUPS = new Set(["routine", "fluids_drivetrain", "components_other"]);
const AVAILABILITY_MODES = new Set(["all_assets", "current_asset_only", "selected_assets"]);
const INTERVAL_UNITS = new Set(["miles", "hours", "months"]);
const PAGE_ERROR = "Vehicles data is invalid. Reload the workspace before continuing.";
const READ_ERROR = "Vehicles data could not be loaded. Retry the request.";
const SAVE_ERROR = "Vehicles changes could not be confirmed.";

const saveCollections = [
  "maintenanceItemOperations",
  "availabilityOperations",
  "ongoingOperations",
  "recommendedOperations",
  "completedOperations",
  "intervalOperations",
  "keyInformationOperation",
  "linkOperations",
];

const collectionFields = {
  maintenanceItemOperations: {
    displayName: "display_name",
    group: "item_group",
    availabilityMode: "availability_mode",
    currentAssetId: "current_asset_id",
    selectedAssetIds: "selected_asset_ids",
    archived: "archived",
  },
  availabilityOperations: {
    maintenanceItemId: "maintenance_item_id",
    addAssetIds: "add_asset_ids",
    removeAssetIds: "remove_asset_ids",
  },
  ongoingOperations: {
    serviceDate: "service_date",
    usageReadingValue: "usage_reading_value",
    usageReadingUnit: "usage_reading_unit",
    mechanic: "mechanic",
    items: "items",
  },
  recommendedOperations: {
    serviceDate: "service_date",
    usageReadingValue: "usage_reading_value",
    usageReadingUnit: "usage_reading_unit",
    mechanic: "mechanic",
    description: "description",
  },
  completedOperations: {
    serviceDate: "service_date",
    usageReadingValue: "usage_reading_value",
    usageReadingUnit: "usage_reading_unit",
    mechanic: "mechanic",
    serviceDescription: "service_description",
  },
  intervalOperations: {
    assetId: "asset_id",
    maintenanceItemId: "maintenance_item_id",
    intervalValue: "interval_value",
    intervalUnit: "interval_unit",
    comments: "comments",
  },
  linkOperations: {
    url: "url",
    displayTitle: "display_title",
    sortOrder: "sort_order",
  },
};

const operationFieldPolicies = {
  maintenanceItemOperations: {
    create: ["displayName", "group", "availabilityMode", "currentAssetId", "selectedAssetIds"],
    update: ["displayName", "group", "availabilityMode", "currentAssetId", "archived"],
    delete: [],
  },
  ongoingOperations: {
    create: ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "items"],
    update: ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "items"],
    delete: [],
  },
  recommendedOperations: {
    create: ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "description"],
    update: ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "description"],
    delete: [],
  },
  completedOperations: {
    create: ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "serviceDescription"],
    update: ["serviceDate", "usageReadingValue", "usageReadingUnit", "mechanic", "serviceDescription"],
    delete: [],
  },
  intervalOperations: {
    create: ["maintenanceItemId", "intervalValue", "intervalUnit", "comments"],
    update: ["maintenanceItemId", "intervalValue", "intervalUnit", "comments"],
    delete: ["assetId", "expectedAssetVersion"],
  },
  linkOperations: {
    create: ["url", "displayTitle", "sortOrder"],
    update: ["url", "displayTitle", "sortOrder"],
    delete: [],
  },
};

export class VehiclesServiceError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = "VehiclesServiceError";
    this.code = code;
    if (metadata.requestId) this.requestId = metadata.requestId;
    if (metadata.retryDraft) this.retryDraft = metadata.retryDraft;
  }
}

function failData() {
  throw new VehiclesServiceError("data_error", PAGE_ERROR);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VehiclesServiceError("validation_error", `${label} must be an object.`);
  }
}

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new VehiclesServiceError("validation_error", `${label} must be a UUID.`);
  }
  return value;
}

function requiredText(value) {
  if (typeof value !== "string" || !value.trim()) failData();
  return value;
}

function optionalText(value) {
  if (value !== null && typeof value !== "string") failData();
  return value;
}

function version(value) {
  if (!Number.isSafeInteger(value) || value <= 0) failData();
  return value;
}

function persistedNumber(value, positive = false) {
  let number = value;
  if (typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    number = Number(value);
  }
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0
    || (positive && number <= 0)) failData();
  return number;
}

function serviceDate(value) {
  try {
    parseDateOnly(value);
  } catch {
    failData();
  }
  return value;
}

function timestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) failData();
  return value;
}

function optionalUsage(row) {
  const unit = row.usage_reading_unit;
  if (!USAGE_UNITS.has(unit)) failData();
  const reading = row.usage_reading_value === null ? null : persistedNumber(row.usage_reading_value);
  if ((unit === "none" && reading !== null) || (reading !== null && reading < 0)) failData();
  return { usageReadingValue: reading, usageReadingUnit: unit };
}

function mapAsset(row) {
  assertObject(row, "Asset");
  if (!USAGE_UNITS.has(row.usage_unit)) failData();
  return {
    id: assertUuid(row.id, "Asset ID"),
    name: requiredText(row.name),
    usageUnit: row.usage_unit,
    version: version(row.version),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapMaintenanceItem(row, selectedAssetIds) {
  assertObject(row, "Maintenance Item");
  if (!ITEM_GROUPS.has(row.item_group) || !AVAILABILITY_MODES.has(row.availability_mode)) failData();
  const currentAssetId = row.current_asset_id === null ? null : assertUuid(row.current_asset_id, "Current asset ID");
  if ((row.availability_mode === "current_asset_only") !== (currentAssetId !== null)) failData();
  return {
    id: assertUuid(row.id, "Maintenance Item ID"),
    displayName: requiredText(row.display_name),
    group: row.item_group,
    availabilityMode: row.availability_mode,
    currentAssetId,
    selectedAssetIds: [...(selectedAssetIds || [])].sort(),
    archivedAt: row.archived_at === null ? null : timestamp(row.archived_at),
    version: version(row.version),
  };
}

function mapHistoryRow(row, kind) {
  assertObject(row, `${kind} record`);
  const common = {
    id: assertUuid(row.id, "Record ID"),
    serviceDate: serviceDate(row.service_date),
    ...optionalUsage(row),
    mechanic: optionalText(row.mechanic),
    version: version(row.version),
  };
  if (kind === "ongoing") return common;
  if (kind === "recommended") return { ...common, description: requiredText(row.description) };
  return { ...common, serviceDescription: requiredText(row.service_description) };
}

function mapCapturedItem(row) {
  assertObject(row, "Captured Maintenance Item");
  if (typeof row.is_performed !== "boolean" || !ITEM_GROUPS.has(row.group_snapshot)) failData();
  return {
    maintenanceItemId: assertUuid(row.maintenance_item_id, "Captured Maintenance Item ID"),
    isPerformed: row.is_performed,
    displayNameSnapshot: requiredText(row.display_name_snapshot),
    groupSnapshot: row.group_snapshot,
  };
}

function mapInterval(row, item) {
  assertObject(row, "Maintenance Interval");
  if (!INTERVAL_UNITS.has(row.interval_unit)) failData();
  return {
    id: assertUuid(row.id, "Interval ID"),
    maintenanceItemId: assertUuid(row.maintenance_item_id, "Maintenance Item ID"),
    maintenanceItemName: item.displayName,
    recommendedInterval: {
      value: persistedNumber(row.interval_value, true),
      unit: row.interval_unit,
    },
    comments: optionalText(row.comments),
    version: version(row.version),
  };
}

function cloneKeyDocument(value) {
  assertObject(value, "Key Information document");
  if (Object.keys(value).some((key) => !["schemaVersion", "blocks"].includes(key))
    || value.schemaVersion !== 1 || !Array.isArray(value.blocks)) failData();

  let totalTextLength = 0;
  const mapRun = (run) => {
    assertObject(run, "Key Information text run");
    if (Object.keys(run).some((key) => !["text", "bold"].includes(key))
      || typeof run.text !== "string"
      || (Object.hasOwn(run, "bold") && typeof run.bold !== "boolean")
      || /<[/!?]?[A-Za-z][^>]*>|<\s*script/i.test(run.text)) failData();
    totalTextLength += run.text.length;
    return Object.hasOwn(run, "bold") ? { text: run.text, bold: run.bold } : { text: run.text };
  };

  const blocks = value.blocks.map((block) => {
    assertObject(block, "Key Information block");
    if (block.type === "paragraph" && Object.keys(block).every((key) => ["type", "runs"].includes(key))
      && Array.isArray(block.runs)) {
      return { type: "paragraph", runs: block.runs.map(mapRun) };
    }
    if (block.type === "bullet_list" && Object.keys(block).every((key) => ["type", "items"].includes(key))
      && Array.isArray(block.items)) {
      return { type: "bullet_list", items: block.items.map((item) => {
        if (!Array.isArray(item)) failData();
        return item.map(mapRun);
      }) };
    }
    failData();
  });
  if (totalTextLength > 50000) failData();
  return { schemaVersion: 1, blocks };
}

function mapKeyInformation(row) {
  assertObject(row, "Key Information");
  return {
    id: assertUuid(row.id, "Key Information ID"),
    document: cloneKeyDocument(row.document),
    version: version(row.version),
  };
}

function mapLink(row) {
  assertObject(row, "Vehicle link");
  const url = requiredText(row.url);
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    failData();
  }
  const hasControlCharacter = [...url].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (!/^https:\/\//i.test(url) || parsedUrl.protocol !== "https:" || !parsedUrl.hostname
    || parsedUrl.username || parsedUrl.password || hasControlCharacter || url.length > 2048) failData();
  if (row.sort_order !== null && (!Number.isSafeInteger(row.sort_order) || row.sort_order < 0)) failData();
  return {
    id: assertUuid(row.id, "Link ID"),
    url,
    displayTitle: optionalText(row.display_title),
    sortOrder: row.sort_order ?? 0,
    version: version(row.version),
  };
}

function compareId(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function newestFirst(left, right) {
  return compareId(right.serviceDate, left.serviceDate) || compareId(left.id, right.id);
}

function sortAssets(assets) {
  return [...assets].sort((left, right) => compareId(left.name.toLowerCase(), right.name.toLowerCase())
    || compareId(left.name, right.name) || compareId(left.id, right.id));
}

function sortLinks(links) {
  return [...links].sort((left, right) => left.sortOrder - right.sortOrder || compareId(left.id, right.id));
}

function isApplicable(item, assetId) {
  if (item.availabilityMode === "all_assets") return true;
  if (item.availabilityMode === "current_asset_only") return item.currentAssetId === assetId;
  return item.selectedAssetIds.includes(assetId);
}

function hasChanges(draft) {
  if (draft.assetPatch && Object.keys(draft.assetPatch).length) return true;
  return saveCollections.some((key) => {
    const value = draft[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

function assertAllowedKeys(value, allowed, label) {
  assertObject(value, label);
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new VehiclesServiceError("validation_error", `${label} contains an unsupported field.`);
}

function mapOperation(operation, fieldMap, label) {
  assertObject(operation, label);
  if (!["create", "update", "delete"].includes(operation.action)) {
    throw new VehiclesServiceError("validation_error", `${label} action must be create, update, or delete.`);
  }
  const actionFields = operationFieldPolicies[label]?.[operation.action];
  if (!actionFields) throw new VehiclesServiceError("validation_error", `${label} operation is unsupported.`);
  const allowed = ["action", "id", ...actionFields];
  if (operation.action !== "create") allowed.push("expectedVersion");
  assertAllowedKeys(operation, allowed, label);
  const result = { action: operation.action };
  if (operation.id !== undefined) result.id = assertUuid(operation.id, `${label} ID`);
  if (operation.action === "create" && !result.id) {
    throw new VehiclesServiceError("validation_error", `${label} create operations require a client-generated ID.`);
  }
  if (operation.action !== "create") {
    if (operation.id === undefined || !Number.isSafeInteger(operation.expectedVersion) || operation.expectedVersion <= 0) {
      throw new VehiclesServiceError("validation_error", `${label} updates and deletes require an ID and expected version.`);
    }
    result.expected_version = operation.expectedVersion;
  } else if (operation.expectedVersion !== undefined) {
    throw new VehiclesServiceError("validation_error", `${label} create operations cannot include an expected version.`);
  }
  if (operation.action !== "delete" && !actionFields.some((field) => Object.hasOwn(operation, field))) {
    throw new VehiclesServiceError("validation_error", `${label} ${operation.action} operations require changed fields.`);
  }
  if (Object.hasOwn(operation, "expectedAssetVersion")) {
    if (operation.action !== "delete" || label !== "intervalOperations"
      || !Number.isSafeInteger(operation.expectedAssetVersion) || operation.expectedAssetVersion <= 0) {
      throw new VehiclesServiceError("validation_error", `${label} has an invalid related asset version.`);
    }
    result.expected_asset_version = operation.expectedAssetVersion;
  }
  for (const domainField of actionFields) {
    const databaseField = fieldMap[domainField];
    if (domainField !== "items" && domainField !== "expectedAssetVersion"
      && Object.hasOwn(operation, domainField)) result[databaseField] = operation[domainField];
  }
  if (Object.hasOwn(operation, "items")) {
    if (!Array.isArray(operation.items)) throw new VehiclesServiceError("validation_error", `${label} items must be an array.`);
    result.items = operation.items.map((item) => {
      const itemFields = operation.action === "create"
        ? ["maintenanceItemId", "isPerformed", "displayNameSnapshot", "groupSnapshot"]
        : ["maintenanceItemId", "isPerformed"];
      assertAllowedKeys(item, itemFields, `${label} captured item`);
      const mapped = {};
      if (Object.hasOwn(item, "maintenanceItemId")) mapped.maintenance_item_id = assertUuid(item.maintenanceItemId, "Captured item ID");
      if (Object.hasOwn(item, "isPerformed")) mapped.is_performed = item.isPerformed;
      if (Object.hasOwn(item, "displayNameSnapshot")) mapped.display_name_snapshot = item.displayNameSnapshot;
      if (Object.hasOwn(item, "groupSnapshot")) mapped.group_snapshot = item.groupSnapshot;
      return mapped;
    });
  }
  return result;
}

function mapAvailabilityOperation(operation) {
  assertAllowedKeys(operation, [
    "maintenanceItemId", "expectedVersion", "addAssetIds", "removeAssetIds",
  ], "Availability operation");
  if (!Number.isSafeInteger(operation.expectedVersion) || operation.expectedVersion <= 0) {
    throw new VehiclesServiceError("validation_error", "Availability changes require an expected version.");
  }
  const result = {
    maintenance_item_id: assertUuid(operation.maintenanceItemId, "Maintenance Item ID"),
    expected_version: operation.expectedVersion,
  };
  const mappedIds = {};
  for (const [domainField, databaseField] of [
    ["addAssetIds", "add_asset_ids"],
    ["removeAssetIds", "remove_asset_ids"],
  ]) {
    if (Object.hasOwn(operation, domainField)) {
      if (!Array.isArray(operation[domainField])) {
        throw new VehiclesServiceError("validation_error", "Availability asset IDs must be arrays.");
      }
      mappedIds[databaseField] = operation[domainField].map((id) => assertUuid(id, "Selected asset ID"));
    }
  }
  const addIds = new Set(mappedIds.add_asset_ids || []);
  const removeIds = new Set(mappedIds.remove_asset_ids || []);
  if ((mappedIds.add_asset_ids && addIds.size !== mappedIds.add_asset_ids.length)
    || (mappedIds.remove_asset_ids && removeIds.size !== mappedIds.remove_asset_ids.length)
    || addIds.size + removeIds.size === 0 || [...addIds].some((id) => removeIds.has(id))) {
    throw new VehiclesServiceError("validation_error", "Availability changes must add or remove distinct asset IDs.");
  }
  Object.assign(result, mappedIds);
  return result;
}

function mapKeyInformationOperation(operation) {
  assertObject(operation, "Key Information operation");
  if (!["create", "update", "delete"].includes(operation.action)) {
    throw new VehiclesServiceError("validation_error", "Key Information action must be create, update, or delete.");
  }
  const allowed = operation.action === "create"
    ? ["action", "id", "document"]
    : operation.action === "update"
      ? ["action", "id", "expectedVersion", "document"]
      : ["action", "id", "expectedVersion"];
  assertAllowedKeys(operation, allowed, "Key Information operation");
  const result = { action: operation.action };
  result.id = assertUuid(operation.id, "Key Information ID");
  if (operation.action !== "create") {
    if (!Number.isSafeInteger(operation.expectedVersion) || operation.expectedVersion <= 0) {
      throw new VehiclesServiceError("validation_error", "Key Information changes require an expected version.");
    }
    result.expected_version = operation.expectedVersion;
  } else if (operation.expectedVersion !== undefined) {
    throw new VehiclesServiceError("validation_error", "Key Information creation cannot include an expected version.");
  }
  if (operation.action !== "delete" && !Object.hasOwn(operation, "document")) {
    throw new VehiclesServiceError("validation_error", "Key Information create and update operations require a document.");
  }
  if (Object.hasOwn(operation, "document")) result.document = cloneKeyDocument(operation.document);
  return result;
}

function mapSaveRequest(draft, requestId) {
  assertAllowedKeys(draft, [
    "assetId", "expectedAssetVersion", "requestId", "assetPatch", ...saveCollections,
  ], "Vehicles draft");
  const request = {
    request_id: assertUuid(requestId, "Request ID"),
    asset_id: assertUuid(draft.assetId, "Asset ID"),
    expected_asset_version: draft.expectedAssetVersion,
  };
  if (!Number.isSafeInteger(request.expected_asset_version) || request.expected_asset_version <= 0) {
    throw new VehiclesServiceError("validation_error", "Expected asset version must be a positive integer.");
  }
  if (Object.hasOwn(draft, "assetPatch")) {
    assertAllowedKeys(draft.assetPatch, ["name", "usageUnit"], "Asset patch");
    const patch = {};
    if (Object.hasOwn(draft.assetPatch, "name")) {
      if (typeof draft.assetPatch.name !== "string" || !draft.assetPatch.name.trim()) {
        throw new VehiclesServiceError("validation_error", "Asset name must be nonblank.");
      }
      patch.name = draft.assetPatch.name;
    }
    if (Object.hasOwn(draft.assetPatch, "usageUnit")) {
      if (!USAGE_UNITS.has(draft.assetPatch.usageUnit)) {
        throw new VehiclesServiceError("validation_error", "Asset usage unit is invalid.");
      }
      patch.usage_unit = draft.assetPatch.usageUnit;
    }
    request.asset_patch = patch;
  }
  for (const key of saveCollections) {
    const value = draft[key];
    if (value === undefined || value === null) continue;
    if (key === "keyInformationOperation") {
      request.key_information_operation = mapKeyInformationOperation(value);
      continue;
    }
    if (!Array.isArray(value)) throw new VehiclesServiceError("validation_error", `${key} must be an array.`);
    if (!value.length) continue;
    if (key === "availabilityOperations") {
      request.availability_operations = value.map(mapAvailabilityOperation);
      continue;
    }
    const fieldMap = collectionFields[key];
    request[{
      maintenanceItemOperations: "maintenance_item_operations",
      availabilityOperations: "availability_operations",
      ongoingOperations: "ongoing_operations",
      recommendedOperations: "recommended_operations",
      completedOperations: "completed_operations",
      intervalOperations: "interval_operations",
      linkOperations: "link_operations",
    }[key]] = value.map((operation) => mapOperation(
      operation,
      fieldMap,
      key,
    ));
  }
  return request;
}

function parseRpcCode(error) {
  if (!error || error.code !== "P0001" || typeof error.details !== "string") return null;
  try {
    const parsed = JSON.parse(error.details);
    return typeof parsed?.code === "string" ? parsed.code : null;
  } catch {
    return null;
  }
}

const SAVE_ERROR_MESSAGES = {
  authorization_error: "Sign in again before saving Vehicles changes.",
  not_found: "The asset or record is no longer available. Reload the workspace.",
  version_conflict: "Vehicles data changed elsewhere. Reload before saving again.",
  validation_error: "Some Vehicles changes are invalid. Review the affected fields.",
  duplicate_service_date: "A record already exists for that service date.",
  duplicate_active_item_name: "An active Maintenance Item already uses that name.",
  duplicate_interval: "An interval already exists for that Maintenance Item.",
  item_archived_or_unavailable: "A Maintenance Item is no longer available for this asset.",
  request_id_payload_mismatch: "This save request ID was already used for different changes. Reload before saving.",
};

function validResult(data, request) {
  const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
  const validIdMap = (value) => isObject(value)
    && Object.values(value).every((ids) => Array.isArray(ids) && ids.every((id) => UUID_PATTERN.test(id)));
  const validEntityVersions = (value) => isObject(value)
    && Object.values(value).every((versions) => isObject(versions)
      && Object.entries(versions).every(([id, entityVersion]) => UUID_PATTERN.test(id)
        && Number.isSafeInteger(entityVersion) && entityVersion > 0));
  const validAssetVersions = (value) => isObject(value)
    && Object.entries(value).every(([id, assetVersion]) => UUID_PATTERN.test(id)
      && Number.isSafeInteger(assetVersion) && assetVersion > 0);
  if (!data || typeof data !== "object" || Array.isArray(data)
    || data.ok !== true || data.request_id !== request.request_id
    || data.asset_id !== request.asset_id || typeof data.replayed !== "boolean"
    || !Number.isSafeInteger(data.asset_version) || data.asset_version <= 0
    || !validEntityVersions(data.entity_versions)
    || !validIdMap(data.created_ids)
    || !validIdMap(data.deleted_ids)
    || !validAssetVersions(data.affected_asset_versions)) return false;
  return true;
}

function mapSaveResult(data, request) {
  if (!validResult(data, request)) return null;
  return {
    status: "saved",
    requestId: data.request_id,
    replayed: data.replayed,
    assetId: data.asset_id,
    assetVersion: data.asset_version,
    entityVersions: data.entity_versions,
    createdIds: data.created_ids,
    deletedIds: data.deleted_ids,
    affectedAssetVersions: data.affected_asset_versions,
  };
}

function newRequestId() {
  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    throw new VehiclesServiceError("configuration_error", "A secure request ID generator is unavailable.");
  }
  return globalThis.crypto.randomUUID();
}

function translateReadError(error) {
  if (error instanceof VehiclesServiceError) return error;
  return new VehiclesServiceError("read_failed", READ_ERROR);
}

function translateSaveError(error, retryDraft, requestId) {
  if (error instanceof VehiclesServiceError && error.code === "validation_error") return error;
  const rpcCode = parseRpcCode(error);
  if (rpcCode && SAVE_ERROR_MESSAGES[rpcCode]) {
    return new VehiclesServiceError(rpcCode, SAVE_ERROR_MESSAGES[rpcCode], { requestId });
  }
  const dataAccessError = error instanceof VehiclesDataAccessError ? error.cause : error;
  const transportCode = typeof dataAccessError?.code === "string" ? dataAccessError.code : "";
  const knownRejected = /^(PGRST|22|23|42501)/.test(transportCode);
  if (knownRejected) {
    return new VehiclesServiceError("save_rejected", SAVE_ERROR, { requestId });
  }
  return new VehiclesServiceError("unknown_outcome", "Save outcome is unknown. Reconcile or retry this exact draft.", {
    requestId,
    retryDraft,
  });
}

function deepCopyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function newestRecord(records) {
  if (!Array.isArray(records)) throw new VehiclesServiceError("validation_error", "Records must be an array.");
  if (!records.length) return null;
  return [...records].sort(newestFirst)[0];
}

export function createVehicleChangesDraft(workspace) {
  assertObject(workspace, "Vehicles workspace");
  const asset = workspace.asset;
  assertObject(asset, "Asset");
  return {
    assetId: assertUuid(asset.id, "Asset ID"),
    expectedAssetVersion: version(asset.version),
    assetPatch: {},
    maintenanceItemOperations: [],
    availabilityOperations: [],
    ongoingOperations: [],
    recommendedOperations: [],
    completedOperations: [],
    intervalOperations: [],
    keyInformationOperation: null,
    linkOperations: [],
  };
}

// UI editing state and entity diffing stay in the later editing phase; this is a changed-only save envelope.
export function buildRecordDeleteOperation(collection, record, assetId) {
  const collectionByType = {
    ongoing: "ongoingOperations",
    recommended: "recommendedOperations",
    completed: "completedOperations",
  };
  if (!Object.hasOwn(collectionByType, collection)) {
    throw new VehiclesServiceError("validation_error", "Only Ongoing, Recommended, and Completed records can be deleted.");
  }
  assertObject(record, "Record");
  return {
    assetId: assertUuid(assetId, "Asset ID"),
    collection: collectionByType[collection],
    operation: {
      action: "delete",
      id: assertUuid(record.id, "Record ID"),
      expectedVersion: version(record.version),
    },
  };
}

export function buildMaintenanceItemCreateOperation(item) {
  assertAllowedKeys(item, [
    "id", "displayName", "group", "availabilityMode", "currentAssetId", "selectedAssetIds",
  ], "Maintenance Item");
  const operation = {
    action: "create",
    id: assertUuid(item.id, "Maintenance Item ID"),
    displayName: requiredText(item.displayName),
    group: item.group,
    availabilityMode: item.availabilityMode,
  };
  if (!ITEM_GROUPS.has(item.group) || !AVAILABILITY_MODES.has(item.availabilityMode)) {
    throw new VehiclesServiceError("validation_error", "Maintenance Item group or availability is invalid.");
  }
  if (item.availabilityMode === "current_asset_only") {
    operation.currentAssetId = assertUuid(item.currentAssetId, "Current asset ID");
  } else if (item.currentAssetId !== undefined && item.currentAssetId !== null) {
    throw new VehiclesServiceError("validation_error", "Only current-asset items may specify a current asset.");
  }
  if (item.availabilityMode === "selected_assets") {
    if (!Array.isArray(item.selectedAssetIds) || !item.selectedAssetIds.length) {
      throw new VehiclesServiceError("validation_error", "Selected-asset items require one or more asset IDs.");
    }
    operation.selectedAssetIds = [...new Set(item.selectedAssetIds.map((id) => assertUuid(id, "Selected asset ID")))].sort();
  } else if (item.selectedAssetIds !== undefined && item.selectedAssetIds.length) {
    throw new VehiclesServiceError("validation_error", "Only selected-asset items may specify selected asset IDs.");
  }
  return operation;
}

export function buildMaintenanceItemUpdateOperation(item, changes) {
  assertObject(item, "Maintenance Item");
  assertAllowedKeys(changes, [
    "displayName", "group", "availabilityMode", "currentAssetId", "archived",
  ], "Maintenance Item changes");
  if (!Object.keys(changes).length) {
    throw new VehiclesServiceError("validation_error", "Maintenance Item updates require changed fields.");
  }
  const operation = {
    action: "update",
    id: assertUuid(item.id, "Maintenance Item ID"),
    expectedVersion: version(item.version),
    ...changes,
  };
  if (Object.hasOwn(changes, "group") && !ITEM_GROUPS.has(changes.group)) {
    throw new VehiclesServiceError("validation_error", "Maintenance Item group is invalid.");
  }
  if (Object.hasOwn(changes, "availabilityMode") && !AVAILABILITY_MODES.has(changes.availabilityMode)) {
    throw new VehiclesServiceError("validation_error", "Maintenance Item availability is invalid.");
  }
  if (Object.hasOwn(changes, "archived") && typeof changes.archived !== "boolean") {
    throw new VehiclesServiceError("validation_error", "Maintenance Item archive state must be Boolean.");
  }
  return operation;
}

export function buildAvailabilityOperation(item, changes) {
  assertObject(item, "Maintenance Item");
  if (item.availabilityMode !== "selected_assets") {
    throw new VehiclesServiceError("validation_error", "Only selected-asset items have editable asset associations.");
  }
  assertAllowedKeys(changes, ["addAssetIds", "removeAssetIds"], "Availability changes");
  const addAssetIds = changes.addAssetIds || [];
  const removeAssetIds = changes.removeAssetIds || [];
  if (!Array.isArray(addAssetIds) || !Array.isArray(removeAssetIds)) {
    throw new VehiclesServiceError("validation_error", "Availability changes must be arrays of asset IDs.");
  }
  const uniqueAddIds = [...new Set(addAssetIds.map((id) => assertUuid(id, "Selected asset ID")))].sort();
  const uniqueRemoveIds = [...new Set(removeAssetIds.map((id) => assertUuid(id, "Selected asset ID")))].sort();
  if (uniqueAddIds.length + uniqueRemoveIds.length === 0
    || uniqueAddIds.some((id) => uniqueRemoveIds.includes(id))) {
    throw new VehiclesServiceError("validation_error", "Availability changes must add or remove distinct asset IDs.");
  }
  return {
    maintenanceItemId: assertUuid(item.id, "Maintenance Item ID"),
    expectedVersion: version(item.version),
    addAssetIds: uniqueAddIds,
    removeAssetIds: uniqueRemoveIds,
  };
}

// Asset deletion is intentionally omitted because no approved persistence operation exists.
export function createVehiclesService(clientProvider = getSupabaseClient) {
  if (typeof clientProvider !== "function") {
    throw new TypeError("Vehicles service requires a Supabase client provider.");
  }
  const getAccess = () => createVehiclesDataAccess(clientProvider());

  async function read(operation) {
    try {
      return await operation(getAccess());
    } catch (error) {
      throw translateReadError(error);
    }
  }

  async function readCatalog(access) {
    const [rows, associations] = await Promise.all([
      access.listMaintenanceItems(),
      access.listAvailabilityAssociations(),
    ]);
    const selectedAssets = new Map();
    for (const association of associations) {
      assertObject(association, "Maintenance Item availability");
      const itemId = assertUuid(association.maintenance_item_id, "Maintenance Item ID");
      const assetId = assertUuid(association.asset_id, "Selected asset ID");
      if (!selectedAssets.has(itemId)) selectedAssets.set(itemId, []);
      selectedAssets.get(itemId).push(assetId);
    }
    return rows.map((row) => mapMaintenanceItem(row, selectedAssets.get(row.id)));
  }

  async function readAsset(access, assetId) {
    const row = await access.getAsset(assetId);
    if (!row) throw new VehiclesServiceError("not_found", "The requested asset was not found.");
    return mapAsset(row);
  }

  async function readHistoryDetails(access, records) {
    const itemRows = await access.listOngoingItems(records.map((record) => record.id));
    const byRecord = new Map(records.map((record) => [record.id, []]));
    for (const row of itemRows) {
      assertObject(row, "Ongoing Maintenance item");
      const recordId = assertUuid(row.record_id, "Ongoing record ID");
      if (!byRecord.has(recordId)) failData();
      byRecord.get(recordId).push(mapCapturedItem(row));
    }
    return records.map((record) => ({ ...record, capturedItems: byRecord.get(record.id) }));
  }

  function calculateIntervals(asset, catalog, intervalRows, detailedOngoing) {
    const catalogById = new Map(catalog.map((item) => [item.id, item]));
    return intervalRows.map((row) => {
      const itemId = assertUuid(row.maintenance_item_id, "Interval Maintenance Item ID");
      const item = catalogById.get(itemId);
      if (!item) failData();
      const mapped = mapInterval(row, item);
      const result = calculateMaintenanceInterval({
        asset: { id: asset.id, usage_unit: asset.usageUnit },
        maintenanceItem: { id: item.id },
        interval: {
          maintenance_item_id: itemId,
          interval_value: mapped.recommendedInterval.value,
          interval_unit: mapped.recommendedInterval.unit,
        },
        ongoingRecords: detailedOngoing.map((record) => ({
          id: record.id,
          asset_id: asset.id,
          service_date: record.serviceDate,
          usage_reading_value: record.usageReadingValue,
          usage_reading_unit: record.usageReadingUnit,
          items: record.capturedItems.map((captured) => ({
            maintenance_item_id: captured.maintenanceItemId,
            is_performed: captured.isPerformed,
          })),
        })),
      });
      return { ...mapped, ...result };
    });
  }

  async function readWorkspace(assetId) {
    return read(async (access) => {
      const [asset, catalog, ongoingRows, recommendedRows, completedRows, intervalRows, keyRow, linkRows] =
        await Promise.all([
          readAsset(access, assetId),
          readCatalog(access),
          access.listOngoingRecords(assetId),
          access.listRecommendedRecords(assetId),
          access.listCompletedRecords(assetId),
          access.listIntervals(assetId),
          access.getKeyInformation(assetId),
          access.listLinks(assetId),
        ]);
      const ongoing = ongoingRows.map((row) => mapHistoryRow(row, "ongoing")).sort(newestFirst);
      const detailedOngoing = await readHistoryDetails(access, ongoing);
      const intervals = calculateIntervals(asset, catalog, intervalRows, detailedOngoing);
      return {
        asset,
        maintenanceItemCatalog: catalog,
        maintenanceItems: catalog.filter((item) => item.archivedAt === null && isApplicable(item, asset.id)),
        ongoingMaintenanceRecords: detailedOngoing,
        recommendedServiceRecords: recommendedRows.map((row) => mapHistoryRow(row, "recommended")).sort(newestFirst),
        completedServiceRecords: completedRows.map((row) => mapHistoryRow(row, "completed")).sort(newestFirst),
        maintenanceIntervals: intervals,
        keyInformation: keyRow ? mapKeyInformation(keyRow) : null,
        links: sortLinks(linkRows.map(mapLink)),
      };
    });
  }

  async function listHistory(assetId, kind) {
    const accessMethod = {
      ongoing: "listOngoingRecords",
      recommended: "listRecommendedRecords",
      completed: "listCompletedRecords",
    }[kind];
    return read(async (access) => {
      await readAsset(access, assetId);
      return (await access[accessMethod](assetId)).map((row) => mapHistoryRow(row, kind)).sort(newestFirst);
    });
  }

  async function getHistory(assetId, recordId, kind) {
    const accessMethod = {
      ongoing: "getOngoingRecord",
      recommended: "getRecommendedRecord",
      completed: "getCompletedRecord",
    }[kind];
    return read(async (access) => {
      await readAsset(access, assetId);
      const row = await access[accessMethod](assetId, recordId);
      if (!row) throw new VehiclesServiceError("not_found", "The requested service record was not found.");
      const mapped = mapHistoryRow(row, kind);
      if (kind !== "ongoing") return mapped;
      return (await readHistoryDetails(access, [mapped]))[0];
    });
  }

  async function createOngoingMaintenanceDraftTemplate(assetId) {
    return read(async (access) => {
      const [asset, catalog] = await Promise.all([readAsset(access, assetId), readCatalog(access)]);
      return {
        assetId: asset.id,
        usageReadingUnit: asset.usageUnit,
        items: catalog
          .filter((item) => item.archivedAt === null && isApplicable(item, asset.id))
          .map((item) => ({
            maintenanceItemId: item.id,
            isPerformed: false,
            displayNameSnapshot: item.displayName,
            groupSnapshot: item.group,
          })),
      };
    });
  }

  async function listMaintenanceIntervals(assetId) {
    return read(async (access) => {
      const [asset, catalog, intervalRows, ongoingRows] = await Promise.all([
        readAsset(access, assetId),
        readCatalog(access),
        access.listIntervals(assetId),
        access.listOngoingRecords(assetId),
      ]);
      const ongoing = ongoingRows.map((row) => mapHistoryRow(row, "ongoing")).sort(newestFirst);
      const detailedOngoing = await readHistoryDetails(access, ongoing);
      return calculateIntervals(asset, catalog, intervalRows, detailedOngoing);
    });
  }

  async function saveVehicleChanges(draft) {
    assertObject(draft, "Vehicles draft");
    assertAllowedKeys(draft, [
      "assetId", "expectedAssetVersion", "requestId", "assetPatch", ...saveCollections,
    ], "Vehicles draft");
    assertUuid(draft.assetId, "Asset ID");
    if (!Number.isSafeInteger(draft.expectedAssetVersion) || draft.expectedAssetVersion <= 0) {
      throw new VehiclesServiceError("validation_error", "Expected asset version must be a positive integer.");
    }
    if (draft.requestId !== undefined) assertUuid(draft.requestId, "Request ID");
    if (!hasChanges(draft)) {
      return { status: "no_changes", assetVersion: draft.expectedAssetVersion };
    }
    const requestId = draft.requestId ? assertUuid(draft.requestId, "Request ID") : newRequestId();
    const retryDraft = { ...deepCopyJson(draft), requestId };
    const request = mapSaveRequest(retryDraft, requestId);
    try {
      const data = await getAccess().saveChanges(request);
      const result = mapSaveResult(data, request);
      if (!result) {
        throw new VehiclesServiceError("unknown_outcome", "Save outcome is unknown. Reconcile or retry this exact draft.", {
          requestId,
          retryDraft,
        });
      }
      return result;
    } catch (error) {
      if (error instanceof VehiclesServiceError && error.code === "unknown_outcome") throw error;
      throw translateSaveError(error, retryDraft, requestId);
    }
  }

  return Object.freeze({
    listAssets: () => read(async (access) => sortAssets((await access.listAssets()).map(mapAsset))),
    getAsset: (assetId) => read((access) => readAsset(access, assetId)),
    loadVehicleWorkspace: readWorkspace,
    listMaintenanceItems: () => read(readCatalog),
    listMaintenanceItemsForAsset: (assetId, options = {}) => read(async (access) => {
      const asset = await readAsset(access, assetId);
      const catalog = await readCatalog(access);
      return options.includeArchived
        ? catalog
        : catalog.filter((item) => item.archivedAt === null && isApplicable(item, asset.id));
    }),
    listOngoingMaintenanceRecords: (assetId) => listHistory(assetId, "ongoing"),
    getOngoingMaintenanceRecord: (assetId, recordId) => getHistory(assetId, recordId, "ongoing"),
    createOngoingMaintenanceDraftTemplate,
    listRecommendedServiceRecords: (assetId) => listHistory(assetId, "recommended"),
    getRecommendedServiceRecord: (assetId, recordId) => getHistory(assetId, recordId, "recommended"),
    listCompletedServiceRecords: (assetId) => listHistory(assetId, "completed"),
    getCompletedServiceRecord: (assetId, recordId) => getHistory(assetId, recordId, "completed"),
    newestRecord,
    listMaintenanceIntervals,
    getKeyInformation: (assetId) => read(async (access) => {
      await readAsset(access, assetId);
      const row = await access.getKeyInformation(assetId);
      return row ? mapKeyInformation(row) : null;
    }),
    listVehicleLinks: (assetId) => read(async (access) => {
      await readAsset(access, assetId);
      return sortLinks((await access.listLinks(assetId)).map(mapLink));
    }),
    createVehicleChangesDraft,
    saveVehicleChanges,
    buildRecordDeleteOperation,
    buildMaintenanceItemCreateOperation,
    buildMaintenanceItemUpdateOperation,
    buildAvailabilityOperation,
  });
}

export const vehiclesService = createVehiclesService();
