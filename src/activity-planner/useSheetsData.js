import { useCallback, useEffect, useState } from "react";
import { SPREADSHEET_ID, columnName, sheetRange, sheetsApiRequest } from "../services/googleSheetsClient.js";
import { createRuleId, formatDays, minutesToTime, parseDays, timeToMinutes } from "./plannerUtils.js";

const ACTIVITY_SPREADSHEET_ID = import.meta.env.VITE_ACTIVITY_SPREADSHEET_ID || SPREADSHEET_ID;

const SHEETS = {
  types: "ActivityTypes",
  rules: "ActivityRules",
  grid: "WeeklyGrid",
};

const RULE_COLUMNS = ["id", "days", "start_time", "end_time", "activity_type_id", "allow_override", "priority", "notes"];

export function getActivitySpreadsheetId() {
  return ACTIVITY_SPREADSHEET_ID;
}

// ---------------------------------------------------------------------------
// Low-level sheet access
// ---------------------------------------------------------------------------

function request(path, options) {
  return sheetsApiRequest(ACTIVITY_SPREADSHEET_ID, path, options);
}

function jsonRequest(path, method, body) {
  return request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** "Activity Type ID" / "activityTypeId" / "activity_type_id" -> "activity_type_id". */
function normalizeHeader(header) {
  return String(header ?? "").trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Reads a sheet as display strings, keyed by normalized header names. */
async function readTable(sheetName) {
  const range = encodeURIComponent(sheetRange(sheetName, "A:ZZ"));
  const payload = await request(`/values/${range}`);
  const [headerRow = [], ...rows] = payload.values || [];
  const headers = headerRow.map(normalizeHeader);
  const records = rows
    .map((row, index) => ({ row, sheetRow: index + 2 }))
    .filter(({ row }) => row.some((value) => String(value ?? "").trim() !== ""))
    .map(({ row, sheetRow }) => ({
      sheetRow,
      record: Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])),
    }));
  return { headers, records };
}

async function getSheetNumericId(sheetName) {
  const metadata = await request("?fields=sheets(properties(sheetId,title))");
  const sheet = metadata.sheets?.find((item) => item.properties.title === sheetName);
  if (!sheet) throw new Error(`${sheetName} sheet not found.`);
  return sheet.properties.sheetId;
}

async function readRulesTable() {
  const table = await readTable(SHEETS.rules);
  const missing = RULE_COLUMNS.filter((column) => !table.headers.includes(column));
  if (missing.length) throw new Error(`ActivityRules is missing columns: ${missing.join(", ")}.`);
  return table;
}

function findRuleRow(records, ruleId) {
  const matches = records.filter(({ record }) => record.id === String(ruleId));
  if (matches.length > 1) throw new Error(`Duplicate ActivityRules id: ${ruleId}.`);
  if (!matches.length) throw new Error(`Rule not found: ${ruleId}. Refresh and try again.`);
  return matches[0];
}

function normalizeTime(value) {
  const minutes = timeToMinutes(value);
  return Number.isNaN(minutes) ? value : minutesToTime(minutes);
}

/** Converts a UI rule into sheet cell values (RAW keeps "HH:MM" as text for Apps Script). */
function ruleToCells(rule) {
  return {
    id: rule.id,
    days: formatDays(rule.days),
    start_time: rule.start_time,
    end_time: rule.end_time,
    activity_type_id: rule.activity_type_id,
    allow_override: Boolean(rule.allow_override),
    priority: Number(rule.priority) || 0,
    notes: rule.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getActivityTypes() {
  const { headers, records } = await readTable(SHEETS.types);
  if (!headers.includes("id")) {
    throw new Error(`ActivityTypes needs an "id" header in row 1 (found: ${headers.filter(Boolean).join(", ") || "no headers"}).`);
  }
  return records.map(({ record }) => ({
    id: record.id,
    name: record.name || record.id,
    color: record.color || "#8a8886",
    category: record.category || "",
    notes: record.notes || "",
  })).filter((type) => type.id);
}

export async function getActivityRules() {
  const { records } = await readRulesTable();
  return records.map(({ record }) => ({
    id: record.id,
    days: parseDays(record.days),
    start_time: normalizeTime(record.start_time),
    end_time: normalizeTime(record.end_time),
    activity_type_id: record.activity_type_id,
    allow_override: record.allow_override.toUpperCase() === "TRUE",
    priority: Number(record.priority) || 0,
    notes: record.notes || "",
  })).filter((rule) => rule.id);
}

export async function getWeeklyGrid() {
  const { records } = await readTable(SHEETS.grid);
  return records.map(({ record }) => ({
    day: record.day,
    time: record.time,
    activity_type_id: record.activity_type_id,
    rule_id: record.rule_id,
  }));
}

export async function addRule(rule) {
  const { headers, records } = await readRulesTable();
  if (records.some(({ record }) => record.id === rule.id)) throw new Error(`Rule id already exists: ${rule.id}.`);
  const cells = ruleToCells(rule);
  const range = encodeURIComponent(sheetRange(SHEETS.rules, "A:ZZ"));
  await jsonRequest(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
    values: [headers.map((header) => cells[header] ?? "")],
  });
}

export async function updateRule(rule) {
  const { headers, records } = await readRulesTable();
  const { sheetRow, record } = findRuleRow(records, rule.id);
  const cells = { ...record, ...ruleToCells(rule) };
  const range = sheetRange(SHEETS.rules, `A${sheetRow}:${columnName(headers.length)}${sheetRow}`);
  await jsonRequest(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, "PUT", {
    values: [headers.map((header) => cells[header] ?? "")],
  });
}

export async function splitRule(rule, clickedDay) {
  const [{ headers, records }, sheetId] = await Promise.all([readRulesTable(), getSheetNumericId(SHEETS.rules)]);
  const { sheetRow, record } = findRuleRow(records, rule.id);
  const originalDays = parseDays(record.days);
  if (!originalDays.includes(clickedDay)) throw new Error("Rule changed. Refresh before editing.");

  const newRule = ruleToCells({ ...rule, id: createRuleId(), days: [clickedDay] });
  const remainingDays = formatDays(originalDays.filter((day) => day !== clickedDay));
  const values = headers.map((header) => ({
    userEnteredValue: { stringValue: String(newRule[header] ?? "") },
  }));
  await jsonRequest(":batchUpdate", "POST", {
    requests: [
      {
        updateCells: {
          start: { sheetId, rowIndex: sheetRow - 1, columnIndex: headers.indexOf("days") },
          rows: [{ values: [{ userEnteredValue: { stringValue: remainingDays } }] }],
          fields: "userEnteredValue",
        },
      },
      { appendCells: { sheetId, rows: [{ values }], fields: "userEnteredValue" } },
    ],
  });
}

export async function deleteRule(ruleId) {
  const [{ records }, sheetId] = await Promise.all([readRulesTable(), getSheetNumericId(SHEETS.rules)]);
  const { sheetRow } = findRuleRow(records, ruleId);
  await jsonRequest(":batchUpdate", "POST", {
    requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow } } }],
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

async function loadPlannerData() {
  const [types, rules, grid] = await Promise.allSettled([getActivityTypes(), getActivityRules(), getWeeklyGrid()]);
  // Load each sheet independently so one broken sheet doesn't hide the others.
  const errors = [["ActivityTypes", types], ["ActivityRules", rules], ["WeeklyGrid", grid]]
    .filter(([, result]) => result.status === "rejected")
    .map(([name, result]) => `${name}: ${result.reason?.message || result.reason}`);
  return {
    data: {
      activityTypes: types.value ?? [],
      rules: rules.value ?? [],
      weeklyGrid: grid.value ?? [],
    },
    error: errors.join(" • "),
  };
}

/**
 * Loads ActivityTypes, ActivityRules and WeeklyGrid and exposes rule mutations.
 * Mutations only write ActivityRules; callers regenerate + reload afterwards.
 */
export function useSheetsData() {
  const [data, setData] = useState({ activityTypes: [], rules: [], weeklyGrid: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const applyLoad = useCallback((promise) => promise
    .then((loaded) => { setData(loaded.data); setError(loaded.error); })
    .catch((loadError) => { setError(loadError.message); })
    .finally(() => { setLoading(false); }), []);

  useEffect(() => {
    applyLoad(loadPlannerData());
  }, [applyLoad]);

  const reload = useCallback(() => {
    setLoading(true);
    return applyLoad(loadPlannerData());
  }, [applyLoad]);

  return { ...data, loading, error, reload, addRule, updateRule, splitRule, deleteRule };
}
