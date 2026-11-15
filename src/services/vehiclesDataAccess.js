const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABLES = {
  assets: ["vehicles_assets", "id,name,usage_unit,version,created_at,updated_at", "id"],
  maintenanceItems: ["maintenance_items", "id,display_name,item_group,availability_mode,current_asset_id,archived_at,version", "id"],
  availability: ["vehicle_maintenance_item_assets", "maintenance_item_id,asset_id", ["maintenance_item_id", "asset_id"]],
  ongoing: ["vehicle_ongoing_records", "id,asset_id,service_date,usage_reading_value,usage_reading_unit,mechanic,version", "id"],
  ongoingItems: ["vehicle_ongoing_items", "record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot", ["record_id", "maintenance_item_id"]],
  recommended: ["vehicle_recommended_records", "id,asset_id,service_date,usage_reading_value,usage_reading_unit,mechanic,description,version", "id"],
  completed: ["vehicle_completed_records", "id,asset_id,service_date,usage_reading_value,usage_reading_unit,mechanic,service_description,version", "id"],
  intervals: ["vehicle_maintenance_intervals", "id,asset_id,maintenance_item_id,interval_value,interval_unit,comments,version", "id"],
  keyInformation: ["vehicle_key_information", "id,asset_id,document,version", "id"],
  links: ["vehicle_links", "id,asset_id,url,display_title,sort_order,version", "id"],
};

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
  return value;
}

export class VehiclesDataAccessError extends Error {
  constructor(operation, cause) {
    super(`Vehicles ${operation} request failed.`);
    this.name = "VehiclesDataAccessError";
    this.operation = operation;
    this.code = typeof cause?.code === "string" ? cause.code : null;
    this.details = typeof cause?.details === "string" ? cause.details : null;
    this.cause = cause;
  }
}

function assertResponse(response, operation) {
  if (!response || response.error) {
    throw new VehiclesDataAccessError(operation, response?.error || new Error("Missing Supabase response."));
  }
  return response;
}

export function createVehiclesDataAccess(client) {
  if (!client || typeof client.from !== "function" || typeof client.rpc !== "function") {
    throw new TypeError("A Supabase-compatible Vehicles client is required.");
  }

  async function listRows(key, filters = [], inFilter = null) {
    const [table, columns, orderColumns] = TABLES[key];
    const rows = [];
    let offset = 0;
    let total = null;
    for (;;) {
      let query = client.from(table).select(columns, offset === 0 ? { count: "exact" } : undefined);
      for (const orderColumn of Array.isArray(orderColumns) ? orderColumns : [orderColumns]) {
        query = query.order(orderColumn, { ascending: true });
      }
      query = query.range(offset, offset + PAGE_SIZE - 1);
      for (const [column, value] of filters) query = query.eq(column, value);
      if (inFilter) query = query.in(inFilter.column, inFilter.values);

      let response;
      try {
        response = assertResponse(await query, `read ${table}`);
      } catch (error) {
        if (error instanceof VehiclesDataAccessError) throw error;
        throw new VehiclesDataAccessError(`read ${table}`, error);
      }

      if (!Array.isArray(response.data)) {
        throw new VehiclesDataAccessError(`read ${table}`, new Error("Invalid rows response."));
      }
      if (response.data.length > PAGE_SIZE) {
        throw new VehiclesDataAccessError(`read ${table}`, new Error("Page exceeded the requested size."));
      }
      if (total === null) {
        if (!Number.isSafeInteger(response.count) || response.count < 0) {
          throw new VehiclesDataAccessError(`read ${table}`, new Error("Exact row count unavailable."));
        }
        total = response.count;
      }
      rows.push(...response.data);
      offset += response.data.length;
      if (offset >= total) {
        if (offset !== total) {
          throw new VehiclesDataAccessError(`read ${table}`, new Error("Rows changed during pagination."));
        }
        return rows;
      }
      if (response.data.length === 0 || response.data.length > PAGE_SIZE) {
        throw new VehiclesDataAccessError(`read ${table}`, new Error("Incomplete page response."));
      }
    }
  }

  async function getRow(key, filters) {
    const [table, columns] = TABLES[key];
    let query = client.from(table).select(columns);
    for (const [column, value] of filters) query = query.eq(column, value);
    let response;
    try {
      response = assertResponse(await query.maybeSingle(), `read ${table}`);
    } catch (error) {
      if (error instanceof VehiclesDataAccessError) throw error;
      throw new VehiclesDataAccessError(`read ${table}`, error);
    }
    if (response.data !== null && (typeof response.data !== "object" || Array.isArray(response.data))) {
      throw new VehiclesDataAccessError(`read ${table}`, new Error("Invalid single-row response."));
    }
    return response.data;
  }

  return Object.freeze({
    listAssets() {
      return listRows("assets");
    },
    getAsset(assetId) {
      return getRow("assets", [["id", assertUuid(assetId, "Asset ID")]]);
    },
    listMaintenanceItems() {
      return listRows("maintenanceItems");
    },
    listAvailabilityAssociations() {
      return listRows("availability");
    },
    listOngoingRecords(assetId) {
      return listRows("ongoing", [["asset_id", assertUuid(assetId, "Asset ID")]]);
    },
    getOngoingRecord(assetId, recordId) {
      return getRow("ongoing", [
        ["asset_id", assertUuid(assetId, "Asset ID")],
        ["id", assertUuid(recordId, "Record ID")],
      ]);
    },
    listOngoingItems(recordIds) {
      if (!Array.isArray(recordIds) || recordIds.some((id) => !UUID_PATTERN.test(id))) {
        throw new TypeError("Ongoing record IDs must be UUIDs.");
      }
      const uniqueIds = [...new Set(recordIds)];
      const batches = [];
      for (let index = 0; index < uniqueIds.length; index += PAGE_SIZE) {
        batches.push(listRows("ongoingItems", [], {
          column: "record_id",
          values: uniqueIds.slice(index, index + PAGE_SIZE),
        }));
      }
      return Promise.all(batches).then((groups) => groups.flat());
    },
    listRecommendedRecords(assetId) {
      return listRows("recommended", [["asset_id", assertUuid(assetId, "Asset ID")]]);
    },
    getRecommendedRecord(assetId, recordId) {
      return getRow("recommended", [
        ["asset_id", assertUuid(assetId, "Asset ID")],
        ["id", assertUuid(recordId, "Record ID")],
      ]);
    },
    listCompletedRecords(assetId) {
      return listRows("completed", [["asset_id", assertUuid(assetId, "Asset ID")]]);
    },
    getCompletedRecord(assetId, recordId) {
      return getRow("completed", [
        ["asset_id", assertUuid(assetId, "Asset ID")],
        ["id", assertUuid(recordId, "Record ID")],
      ]);
    },
    listIntervals(assetId) {
      return listRows("intervals", [["asset_id", assertUuid(assetId, "Asset ID")]]);
    },
    getKeyInformation(assetId) {
      return getRow("keyInformation", [["asset_id", assertUuid(assetId, "Asset ID")]]);
    },
    listLinks(assetId) {
      return listRows("links", [["asset_id", assertUuid(assetId, "Asset ID")]]);
    },
    async saveChanges(request) {
      let response;
      try {
        response = assertResponse(await client.rpc("save_vehicles_changes", { p_request: request }), "save");
      } catch (error) {
        if (error instanceof VehiclesDataAccessError) throw error;
        throw new VehiclesDataAccessError("save", error);
      }
      return response.data;
    },
    async createAsset(request) {
      let response;
      try {
        response = assertResponse(
          await client.rpc("create_vehicle_asset", { p_request: request }),
          "create asset"
        );
      } catch (error) {
        if (error instanceof VehiclesDataAccessError) throw error;
        throw new VehiclesDataAccessError("create asset", error);
      }
      return response.data;
    },
    async saveMaintenanceItem(request) {
      let response;
      try {
        response = assertResponse(
          await client.rpc("save_maintenance_item", { p_request: request }),
          "save Maintenance Item"
        );
      } catch (error) {
        if (error instanceof VehiclesDataAccessError) throw error;
        throw new VehiclesDataAccessError("save Maintenance Item", error);
      }
      return response.data;
    },
  });
}
