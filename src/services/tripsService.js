import { getSupabaseClient } from "./supabaseClient.js";
import { createTripsWorkflowService } from "./tripsWorkflowService.js";
import { createTripsTimelineService, validateTimelineMonth } from "./tripsTimelineService.js";
import { tripFields, tripResult, tripRows, tripUuid } from "./tripsSupabase.js";
import { timelineMonthNumber } from "../utils/timelineUtils.js";

const fields = {
  destination: "destination", startDate: "start_date", endDate: "end_date",
  tripType: "trip_type", status: "status", timelineMonth: "timeline_month",
  timelineYear: "timeline_year", notes: "notes", duration: "duration",
  seasonality: "seasonality", costRange: "cost_range", considerations: "considerations",
  tags: "tags", links: "links", priority: "priority", purpose: "purpose", location: "location",
};

function toRow(data) {
  const row = tripFields(data, fields);
  for (const column of ["start_date", "end_date"]) {
    if (!Object.hasOwn(row, column)) continue;
    row[column] = row[column] || null;
    if (row[column] !== null) {
      const value = String(row[column]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
        throw new Error(`${column} must be a valid YYYY-MM-DD date.`);
      }
    }
  }
  for (const column of ["duration", "timeline_year", "timeline_month"]) {
    if (!Object.hasOwn(row, column)) continue;
    const value = row[column];
    row[column] = value == null || String(value).trim() === "" ? null
      : column === "timeline_month" ? timelineMonthNumber(value) : Number(value);
    if (row[column] !== null && (!Number.isInteger(row[column]) ||
        row[column] < (column === "duration" ? 0 : 1) ||
        row[column] > (column === "timeline_month" ? 12 : column === "timeline_year" ? 9999 : 32767))) {
      throw new Error(`Invalid ${column}.`);
    }
  }
  if (Object.hasOwn(row, "links")) {
    if (typeof row.links === "string") {
      const value = row.links.trim();
      row.links = value === "" ? null
        : /^[{["]/.test(value) || /^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(value)
          ? JSON.parse(value) : value;
    }
  }
  for (const column of Object.values(fields)) {
    if (!["duration", "timeline_year", "timeline_month", "links", "start_date", "end_date"].includes(column) &&
        Object.hasOwn(row, column)) row[column] = row[column] == null ? null : String(row[column]);
  }
  return row;
}

function fromRow(row) {
  return {
    tripId: row.id,
    ...Object.fromEntries(Object.entries(fields).map(([field, column]) => [
      field, column === "links" && row.links != null && typeof row.links !== "string"
        ? JSON.stringify(row.links) : row[column] ?? "",
    ])),
  };
}

function tripValues(data, id) {
  const { tripId, id: suppliedId, ...values } = data;
  if ((tripId != null && tripId !== id) || (suppliedId != null && suppliedId !== id)) {
    throw new Error("Trip identity cannot be changed.");
  }
  return toRow(values);
}

function comparable(value) {
  return JSON.stringify(value, (_, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry);
}

export function createTripsService(getClient = getSupabaseClient) {
  const workflow = createTripsWorkflowService(getClient);
  const timeline = createTripsTimelineService(getClient);

  async function getTrips() {
    return (await tripRows(getClient(), "trips", ["created_at", "id"])).map(fromRow);
  }

  async function getTripById(tripId) {
    const row = await tripResult(getClient().from("trips").select("*")
      .eq("id", tripUuid(tripId)).maybeSingle(), "Load trip");
    return row ? fromRow(row) : null;
  }

  async function ensureTimeline(row) {
    if (row.timeline_year != null && row.timeline_month != null) {
      validateTimelineMonth(row.timeline_year, row.timeline_month);
      await timeline.createTimelineEntry(row.timeline_year, row.timeline_month);
    }
  }

  async function createTrip(data) {
    const id = tripUuid(data.tripId ?? data.id ?? crypto.randomUUID());
    const row = tripValues(data, id);
    const month = row.timeline_month != null, year = row.timeline_year != null;
    if (month !== year) throw new Error("Provide both Timeline month and year, or leave both empty.");
    await tripResult(getClient().from("trips").upsert({ ...row, id }, {
      onConflict: "id", ignoreDuplicates: true,
    }), "Create trip");
    try {
      const saved = await getTripById(id);
      if (!saved) throw new Error("Created trip is not readable; check Supabase policies.");
      const existing = tripValues(saved, id);
      if (Object.keys(row).some((column) => comparable(row[column] ?? "") !== comparable(existing[column] ?? ""))) {
        throw new Error("This ID already belongs to a trip with different values. Use Edit to change it instead of creating it again.");
      }
      await workflow.createWorkflowMetadata(id, saved.status);
      await ensureTimeline(existing);
      return saved;
    } catch (error) {
      throw new Error(`Trip ${id} was saved, but related setup failed. Retry creation with the same ID to finish without duplicates. ${error.message}`, { cause: error });
    }
  }

  async function updateTrip(tripId, updates) {
    const id = tripUuid(tripId);
    const values = tripValues(updates, id);
    const old = await getTripById(id);
    if (!old) throw new Error(`Trip not found: ${id}`);
    const merged = {
      timeline_month: old.timelineMonth === "" ? null : old.timelineMonth,
      timeline_year: old.timelineYear === "" ? null : old.timelineYear,
      ...values,
    };
    // Create shared settings first so a failed setup cannot move a trip halfway.
    if (Object.hasOwn(values, "timeline_month") || Object.hasOwn(values, "timeline_year")) {
      if ((merged.timeline_month != null) !== (merged.timeline_year != null)) {
        throw new Error("Provide both Timeline month and year, or clear both.");
      }
      await ensureTimeline(merged);
    }
    const row = await tripResult(getClient().from("trips")
      .update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
      .select("*").single(), "Save trip");
    return fromRow(row);
  }

  async function deleteTrip(tripId) {
    const id = tripUuid(tripId);
    const exists = await getTripById(id);
    const deleted = await tripResult(getClient().from("trips").delete().eq("id", id).select("id"), "Delete trip");
    if (exists && deleted.length !== 1) throw new Error("Trip deletion was not confirmed; check Supabase delete policies.");
    try {
      const metadata = await tripResult(getClient().from("trips_workflow_metadata").select("trip_id").eq("trip_id", id)
        .maybeSingle(), "Check trip workflow cleanup");
      const removed = await tripResult(getClient().from("trips_workflow_metadata").delete().eq("trip_id", id)
        .select("trip_id"), "Delete trip workflow");
      if (metadata && removed.length !== 1) throw new Error("Workflow deletion was not confirmed; check Supabase delete policies.");
    } catch (error) {
      throw new Error(`Trip deleted, but workflow cleanup failed. Retry deletion for ${id}. ${error.message}`, { cause: error });
    }
    // Timeline settings are shared by other trips and must not be deleted.
    return { ok: true, tripId: id };
  }

  async function assignTripToMonth(tripId, year, month) {
    validateTimelineMonth(year, month);
    return updateTrip(tripId, { timelineYear: Number(year), timelineMonth: timelineMonthNumber(month) });
  }

  async function removeTripFromMonth(tripId, year, month) {
    validateTimelineMonth(year, month);
    const trip = await getTripById(tripId);
    if (!trip) throw new Error(`Trip not found: ${tripId}`);
    if (Number(trip.timelineYear) === Number(year) && Number(trip.timelineMonth) === timelineMonthNumber(month)) {
      return updateTrip(tripId, { timelineYear: null, timelineMonth: null });
    }
    return trip;
  }

  return { getTrips, getTripById, createTrip, updateTrip, deleteTrip, assignTripToMonth, removeTripFromMonth };
}

const trips = createTripsService();
export const getTrips = (...args) => trips.getTrips(...args);
export const getTripById = (...args) => trips.getTripById(...args);
export const createTrip = (...args) => trips.createTrip(...args);
export const updateTrip = (...args) => trips.updateTrip(...args);
export const deleteTrip = (...args) => trips.deleteTrip(...args);
export const assignTripToMonth = (...args) => trips.assignTripToMonth(...args);
export const removeTripFromMonth = (...args) => trips.removeTripFromMonth(...args);
