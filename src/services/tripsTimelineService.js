import { getSupabaseClient } from "./supabaseClient.js";
import { TIMELINE_MONTHS, timelineKey, timelineMonthNumber } from "../utils/timelineUtils.js";
import { tripFields, tripResult, tripRows } from "./tripsSupabase.js";

const fields = { color: "color", notes: "notes", blocks: "blocks" };

export function validateTimelineMonth(year, month) {
  if (!Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 9999 ||
      !Number.isInteger(timelineMonthNumber(month))) {
    throw new Error("Timeline requires a year from 1 to 9999 and a month from 1 to 12.");
  }
}

function timelineValues(data) {
  const values = tripFields(data, fields);
  if (Object.hasOwn(values, "color")) {
    values.color = String(values.color ?? "").trim().toUpperCase();
    if (values.color && !["IDEAL", "CAUTION", "CONFLICT"].includes(values.color)) {
      throw new Error("Invalid Timeline color.");
    }
  }
  for (const field of ["notes", "blocks"]) {
    if (Object.hasOwn(values, field)) values[field] = String(values[field] ?? "");
  }
  return values;
}

export function createTripsTimelineService(getClient = getSupabaseClient) {
  async function rawEntries() {
    const rows = await tripRows(getClient(), "trips_timeline", ["year", "month"]);
    const seen = new Set();
    for (const row of rows) {
      validateTimelineMonth(row.year, row.month);
      const key = timelineKey(row.year, row.month);
      if (seen.has(key)) throw new Error(`Duplicate Timeline month ${key}; resolve the duplicate labels before editing.`);
      seen.add(key);
    }
    return rows;
  }

  async function getTimelineEntries() {
    return (await rawEntries()).map((row) => ({
      ...row, year: Number(row.year), month: timelineMonthNumber(row.month),
      color: row.color ?? "", notes: row.notes ?? "", blocks: row.blocks ?? "",
    }));
  }

  async function createTimelineEntry(year, month, data = {}) {
    validateTimelineMonth(year, month);
    const values = timelineValues(data);
    const key = timelineKey(year, month);
    const existing = (await rawEntries()).find((row) => timelineKey(row.year, row.month) === key);
    if (!existing) {
      const label = TIMELINE_MONTHS[timelineMonthNumber(month) - 1];
      await tripResult(getClient().from("trips_timeline").upsert({
        year: Number(year), month: label[0] + label.slice(1).toLowerCase(),
        color: "", notes: "", blocks: "", ...values,
      }, { onConflict: "year,month", ignoreDuplicates: true }), "Create Timeline month");
    }
    return (await getTimelineEntries()).find((row) => timelineKey(row.year, row.month) === key);
  }

  async function updateTimelineEntry(year, month, updates) {
    validateTimelineMonth(year, month);
    const values = timelineValues(updates);
    let existing = (await rawEntries()).find((row) => timelineKey(row.year, row.month) === timelineKey(year, month));
    if (!existing) {
      await createTimelineEntry(year, month);
      existing = (await rawEntries()).find((row) => timelineKey(row.year, row.month) === timelineKey(year, month));
      if (!existing) throw new Error("Created Timeline month is not readable; check Supabase policies.");
    }
    const row = await tripResult(getClient().from("trips_timeline").update(values)
      .eq("year", existing.year).eq("month", existing.month).select("*").single(), "Save Timeline month");
    return { ...row, month: timelineMonthNumber(row.month) };
  }

  async function getTimeline() {
    const [entries, trips] = await Promise.all([
      getTimelineEntries(), tripRows(getClient(), "trips", ["id"]),
    ]);
    const months = new Map(entries.map((entry) => [timelineKey(entry.year, entry.month), { ...entry, tripIds: [] }]));
    for (const trip of trips) {
      if (trip.timeline_year == null || trip.timeline_month == null) continue;
      validateTimelineMonth(trip.timeline_year, trip.timeline_month);
      const key = timelineKey(trip.timeline_year, trip.timeline_month);
      if (!months.has(key)) months.set(key, {
        year: Number(trip.timeline_year), month: Number(trip.timeline_month),
        color: "", notes: "", blocks: "", tripIds: [],
      });
      months.get(key).tripIds.push(trip.id);
    }
    return [...months.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  }

  async function getTimelineMonth(year, month) {
    validateTimelineMonth(year, month);
    return (await getTimeline()).find((row) => timelineKey(row.year, row.month) === timelineKey(year, month))
      ?? { year: Number(year), month: timelineMonthNumber(month), color: "", notes: "", blocks: "", tripIds: [] };
  }

  async function initializeTimelineYear(year) {
    validateTimelineMonth(year, 1);
    for (let month = 1; month <= 12; month++) await createTimelineEntry(year, month);
  }

  async function propagateTimelineYear(fromYear, toYear) {
    validateTimelineMonth(fromYear, 1);
    validateTimelineMonth(toYear, 1);
    if (Number(fromYear) === Number(toYear)) throw new Error("Choose a different target year.");
    const source = (await getTimelineEntries()).filter((entry) => entry.year === Number(fromYear));
    await initializeTimelineYear(toYear);
    for (const entry of source) {
      await updateTimelineEntry(toYear, entry.month, { color: entry.color, notes: entry.notes });
    }
  }

  return { createTimelineEntry, updateTimelineEntry, getTimelineEntries, getTimeline,
    getTimelineMonth, initializeTimelineYear, propagateTimelineYear };
}

const timeline = createTripsTimelineService();
export const createTimelineEntry = (...args) => timeline.createTimelineEntry(...args);
export const updateTimelineEntry = (...args) => timeline.updateTimelineEntry(...args);
export const getTimelineEntries = (...args) => timeline.getTimelineEntries(...args);
export const getTimeline = (...args) => timeline.getTimeline(...args);
export const getTimelineMonth = (...args) => timeline.getTimelineMonth(...args);
export const updateTimelineMonth = updateTimelineEntry;
export const initializeTimelineYear = (...args) => timeline.initializeTimelineYear(...args);
export const propagateTimelineYear = (...args) => timeline.propagateTimelineYear(...args);
