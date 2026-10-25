import { DAYS, formatDays, minutesToTime, parseDays, timeToMinutes } from "../utils/plannerUtils.js";

import { getSupabaseClient } from "./supabaseClient.js";

async function result(query, operation) {
  const { data, error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`, { cause: error });
  return data;
}

function ruleId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ""))) {
    throw new Error("Activity rule ID must be a UUID.");
  }
  return id;
}

function normalizeTime(value) {
  if (value == null) return "";
  const minutes = timeToMinutes(value);
  if (!Number.isFinite(minutes)) throw new Error(`Invalid activity time: ${value}`);
  return minutesToTime(minutes);
}

function fromRule(row) {
  return { ...row, days: parseDays(row.days), start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time), allow_override: row.allow_override === true,
    priority: row.priority ?? 0, notes: row.notes ?? "" };
}

function ruleValues(rule) {
  const allowed = ["days", "start_time", "end_time", "activity_type_id", "recurrence", "allow_override", "priority", "notes"];
  const values = {};
  for (const [field, value] of Object.entries(rule)) {
    if (field === "id") continue;
    if (!allowed.includes(field)) throw new Error(`Unsupported activity rule field: ${field}`);
    values[field] = value;
  }
  if (Object.hasOwn(values, "days")) {
    const days = Array.isArray(values.days) ? values.days : parseDays(values.days);
    if (!days.length || days.some((day) => !DAYS.includes(day))) throw new Error("Select valid activity days.");
    values.days = formatDays(days);
  }
  for (const field of ["start_time", "end_time"]) {
    if (Object.hasOwn(values, field)) {
      values[field] = normalizeTime(values[field]);
      if (!values[field]) throw new Error(`${field} is required.`);
    }
  }
  if (Object.hasOwn(values, "priority")) {
    const number = Number(values.priority);
    if (!Number.isInteger(number) || number < -32768 || number > 32767) throw new Error("Priority must be a smallint integer.");
    values.priority = number;
  }
  if (Object.hasOwn(values, "allow_override") && typeof values.allow_override !== "boolean") {
    throw new Error("Allow override must be a boolean.");
  }
  return values;
}

function validateRule(rule) {
  const start = timeToMinutes(rule.start_time), end = timeToMinutes(rule.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`Invalid time range for activity rule ${rule.id}.`);
  if (!parseDays(rule.days).length) throw new Error(`Missing days for activity rule ${rule.id}.`);
  if (!rule.activity_type_id) throw new Error(`Missing activity type for rule ${rule.id}.`);
}

export function expandActivityRules(rules) {
  const slots = new Map();
  for (const rule of rules) {
    ruleId(rule.id);
    validateRule(rule);
    for (const day of parseDays(rule.days)) {
      for (let minute = Math.floor(timeToMinutes(rule.start_time) / 30) * 30;
        minute < timeToMinutes(rule.end_time); minute += 30) {
        const key = `${day}-${minute}`;
        if (!slots.has(key)) slots.set(key, []);
        slots.get(key).push(rule);
      }
    }
  }
  return DAYS.flatMap((day) => Array.from({ length: 48 }, (_, slot) => {
    const matches = (slots.get(`${day}-${slot * 30}`) || [])
      .slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
    return matches.length ? matches.map((rule) => ({
      day, time: minutesToTime(slot * 30), activity_type_id: rule.activity_type_id, rule_id: rule.id,
    })) : [{ day, time: minutesToTime(slot * 30), activity_type_id: null, rule_id: null }];
  }).flat());
}

export function createActivityDataAccess(getClient = getSupabaseClient) {
  let writes = Promise.resolve();
  function serialize(work) {
    const operation = writes.then(work);
    writes = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async function read(table, columns) {
    const rows = [];
    for (;;) {
      let query = getClient().from(table).select("*");
      for (const column of columns) query = query.order(column);
      const page = await result(query.range(rows.length, rows.length + 499), `Load ${table}`);
      if (!page.length) return rows;
      rows.push(...page);
    }
  }

  async function rawRules() {
    const rows = await read("activity_rules", ["id"]);
    const ids = new Set();
    for (const row of rows) {
      ruleId(row.id);
      if (ids.has(row.id)) throw new Error(`Duplicate activity rule ID: ${row.id}. Resolve duplicates before editing.`);
      ids.add(row.id);
    }
    return rows;
  }
  async function getActivityTypes() {
    return (await read("activity_types", ["id"])).map((row) => ({
      ...row, color: row.color || "#8a8886", category: row.category ?? "", notes: row.notes ?? "",
    }));
  }
  async function getActivityRules() { return (await rawRules()).map(fromRule); }
  async function getWeeklyGrid() {
    return (await read("activity_weekly_grid", ["day", "time", "rule_id", "activity_type_id"]))
      .map((row) => ({ ...row, time: normalizeTime(row.time) }));
  }

  async function findRule(id) {
    const row = (await rawRules()).find((rule) => rule.id === ruleId(id));
    if (!row) throw new Error(`Activity rule not found: ${id}. Refresh and try again.`);
    return row;
  }
  async function checkType(id) {
    if (!(await getActivityTypes()).some((type) => type.id === id)) throw new Error(`Unknown activity type: ${id}`);
  }
  async function insertRule(rule) {
    const id = ruleId(rule.id ?? crypto.randomUUID());
    if ((await rawRules()).some((row) => row.id === id)) throw new Error(`Activity rule already exists: ${id}`);
    const values = { ...ruleValues(rule), id };
    validateRule(values);
    await checkType(values.activity_type_id);
    return fromRule(await result(getClient().from("activity_rules").insert(values).select("*").single(), "Create activity rule"));
  }
  async function editRule(id, updates) {
    const old = await findRule(id);
    if (updates.id != null && updates.id !== id) throw new Error("Activity rule identity cannot change.");
    const values = ruleValues(updates);
    const merged = { ...old, ...values };
    validateRule(merged);
    await checkType(merged.activity_type_id);
    return fromRule(await result(getClient().from("activity_rules").update(values).eq("id", id)
      .select("*").single(), "Update activity rule"));
  }
  async function removeRule(id) {
    await findRule(id);
    const rows = await result(getClient().from("activity_rules").delete().eq("id", id).select("id"), "Delete activity rule");
    if (rows.length !== 1) throw new Error("Activity rule deletion was not confirmed.");
  }

  function splitRule(rule, clickedDay) {
    return serialize(async () => {
      const old = await findRule(rule.id);
      const days = parseDays(old.days);
      if (!days.includes(clickedDay)) throw new Error("Activity rule changed. Refresh before editing.");
      if (days.length === 1) return editRule(rule.id, { ...rule, days: [clickedDay] });
      const id = crypto.randomUUID();
      await insertRule({ ...fromRule(old), ...rule, id, days: [clickedDay] });
      try {
        await editRule(old.id, { days: days.filter((day) => day !== clickedDay) });
      } catch (error) {
        throw new Error(`Split rule ${id} was created, but the original rule could not be updated. Refresh and resolve both rules before retrying. ${error.message}`, { cause: error });
      }
      return id;
    });
  }

  function regenerateWeeklyGrid() {
    return serialize(async () => {
      const rules = await rawRules();
      const types = await getActivityTypes();
      const rows = expandActivityRules(rules);
      for (const rule of rules) {
        if (!types.some((type) => type.id === rule.activity_type_id)) throw new Error(`Unknown activity type for rule ${rule.id}.`);
      }
      // The supplied table has no key or RPC: replacement requires two requests.
      await result(getClient().from("activity_weekly_grid").delete().not("day", "is", null), "Clear weekly activity grid");
      try {
        await result(getClient().from("activity_weekly_grid").insert(rows), "Write weekly activity grid");
      } catch (error) {
        throw new Error(`Weekly grid was cleared but replacement failed. Rules are unchanged; retry regeneration. ${error.message}`, { cause: error });
      }
      const saved = await getWeeklyGrid();
      const signature = (row) => JSON.stringify([row.day, row.time, row.activity_type_id, row.rule_id]);
      if (JSON.stringify(saved.map(signature).sort()) !== JSON.stringify(rows.map(signature).sort())) {
        throw new Error("Weekly grid replacement could not be verified. Check policies or concurrent regenerations, then retry.");
      }
      return { rulesRead: rules.length, rulesUsed: rules.length, slotsWritten: rows.length };
    });
  }

  return { getActivityTypes, getActivityRules, getWeeklyGrid,
    createActivityRule: (rule) => serialize(() => insertRule(rule)),
    updateActivityRule: (id, updates) => serialize(() => editRule(id, updates)),
    deleteActivityRule: (id) => serialize(() => removeRule(id)),
    splitRule, regenerateWeeklyGrid };
}

const activity = createActivityDataAccess();
export const getActivityTypes = (...args) => activity.getActivityTypes(...args);
export const getActivityRules = (...args) => activity.getActivityRules(...args);
export const getWeeklyGrid = (...args) => activity.getWeeklyGrid(...args);
export const createActivityRule = (...args) => activity.createActivityRule(...args);
export const updateActivityRule = (...args) => activity.updateActivityRule(...args);
export const deleteActivityRule = (...args) => activity.deleteActivityRule(...args);
export const splitRule = (...args) => activity.splitRule(...args);
export const regenerateWeeklyGrid = (...args) => activity.regenerateWeeklyGrid(...args);
