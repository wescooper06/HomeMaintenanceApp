export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const SLOT_MINUTES = 30;
export const GRID_START_MINUTES = 6 * 60;
export const GRID_END_MINUTES = 24 * 60;
export const SLOT_COUNT = (GRID_END_MINUTES - GRID_START_MINUTES) / SLOT_MINUTES;

/** Accepts "09:30", "9:30", "9:30:00", "9:30 AM", "24:00". Returns NaN when invalid. */
export function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(String(value ?? "").trim());
  if (!match) return NaN;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return NaN;
    hours = (hours % 12) + (meridiem === "PM" ? 12 : 0);
  }
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return NaN;
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 570 -> "9:30 AM", 1440 -> "12:00 AM". */
export function formatTimeLabel(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${hours24 < 12 ? "AM" : "PM"}`;
}

export function slotToMinutes(slotIndex) {
  return GRID_START_MINUTES + slotIndex * SLOT_MINUTES;
}

export function minutesToSlot(totalMinutes) {
  return Math.floor((totalMinutes - GRID_START_MINUTES) / SLOT_MINUTES);
}

/** Every selectable boundary time, 06:00 through 24:00. */
export const TIME_OPTIONS = Array.from({ length: SLOT_COUNT + 1 }, (_, index) => minutesToTime(slotToMinutes(index)));

/** "Mon,Tue,Fri" / "Mon–Sun" / "Mon-Wed,Sat" -> ordered unique short day names. */
export function parseDays(daysText) {
  const selected = new Set();
  const dayIndex = (token) => DAYS.findIndex((day) => day.toLowerCase() === token.trim().slice(0, 3).toLowerCase());

  String(daysText ?? "").split(",").map((token) => token.trim()).filter(Boolean).forEach((token) => {
    const parts = token.split(/\s*[\u2013\u2014-]\s*/);
    if (parts.length === 2) {
      const start = dayIndex(parts[0]);
      const end = dayIndex(parts[1]);
      if (start < 0 || end < 0) return;
      for (let offset = 0; offset < DAYS.length; offset += 1) {
        const index = (start + offset) % DAYS.length;
        selected.add(DAYS[index]);
        if (index === end) break;
      }
      return;
    }
    const index = dayIndex(token);
    if (index >= 0) selected.add(DAYS[index]);
  });

  return DAYS.filter((day) => selected.has(day));
}

export function formatDays(days) {
  return DAYS.filter((day) => days.includes(day)).join(",");
}

/** Normalizes a drag selection (anchor/focus cells) into a rectangular day/slot range. */
export function normalizeSelection(selection) {
  if (!selection) return null;
  const { anchor, focus } = selection;
  return {
    startDay: Math.min(anchor.day, focus.day),
    endDay: Math.max(anchor.day, focus.day),
    startSlot: Math.min(anchor.slot, focus.slot),
    endSlot: Math.max(anchor.slot, focus.slot),
  };
}

/** Converts a finished selection into the modal's rule draft fields. */
export function selectionToRuleDraft(selection) {
  const range = normalizeSelection(selection);
  return {
    days: DAYS.slice(range.startDay, range.endDay + 1),
    start_time: minutesToTime(slotToMinutes(range.startSlot)),
    end_time: minutesToTime(slotToMinutes(range.endSlot + 1)),
  };
}

/**
 * Groups WeeklyGrid rows into visual blocks: consecutive slots on the same day with
 * the same activity_type_id become one block. Each block keeps its per-slot rule ids
 * so a click can resolve the exact rule underneath the pointer.
 */
export function buildActivityBlocks(gridRows) {
  const slotsByDay = DAYS.map(() => new Array(SLOT_COUNT).fill(null));

  gridRows.forEach((row) => {
    const dayIndex = DAYS.indexOf(row.day);
    const slot = minutesToSlot(timeToMinutes(row.time));
    if (dayIndex < 0 || !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return;
    slotsByDay[dayIndex][slot] = row;
  });

  const blocks = [];
  slotsByDay.forEach((slots, dayIndex) => {
    let current = null;
    slots.forEach((row, slot) => {
      if (row && current && current.activityTypeId === row.activity_type_id && current.endSlot === slot - 1) {
        current.endSlot = slot;
        current.ruleIds.push(row.rule_id);
        return;
      }
      current = row
        ? { key: `${dayIndex}-${slot}`, dayIndex, startSlot: slot, endSlot: slot, activityTypeId: row.activity_type_id, ruleIds: [row.rule_id] }
        : null;
      if (current) blocks.push(current);
    });
  });

  return blocks;
}

export function createRuleId() {
  return crypto.randomUUID();
}
