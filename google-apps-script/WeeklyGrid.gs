/**
 * WeeklyGrid generator.
 *
 * Reads ActivityRules, expands each rule into 30-minute slots,
 * preserves overlapping activities as separate rows, and rewrites WeeklyGrid.
 */

const WEEKLY_GRID_CONFIG = {
  RULES_SHEET: 'ActivityRules',
  GRID_SHEET: 'WeeklyGrid',
  GRID_HEADERS: ['day', 'time', 'activity_type_id', 'rule_id'],
  SLOT_MINUTES: 30,
  DAY_ORDER: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/**
 * Main entry point: rebuilds WeeklyGrid from ActivityRules.
 * @param {string=} spreadsheetId Optional; falls back to the bound/active spreadsheet.
 * @return {{rulesRead: number, rulesUsed: number, slotsWritten: number}}
 */
function regenerateWeeklyGrid(spreadsheetId) {
  // Serialize regenerations so two quick saves from the app can't interleave writes.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = spreadsheetId
      ? SpreadsheetApp.openById(spreadsheetId)
      : SpreadsheetApp.getActiveSpreadsheet();

    const rulesSheet = getRequiredSheet_(spreadsheet, WEEKLY_GRID_CONFIG.RULES_SHEET);
    const gridSheet = getRequiredSheet_(spreadsheet, WEEKLY_GRID_CONFIG.GRID_SHEET);

    // Step 1: read all rules.
    const rules = readActivityRules_(rulesSheet);

    // Step 2: expand rules into per-slot candidates.
    const weeklyRules = rules.filter(function (rule) {
      return parseDays(rule.days).length > 0;
    });
    const candidates = buildCandidates_(weeklyRules);

    // Step 3: order all activity slots, preserving overlaps.
    const resolvedSlots = resolveConflicts_(candidates);

    // Step 4: write WeeklyGrid.
    writeWeeklyGrid_(gridSheet, resolvedSlots);

    const result = {
      rulesRead: rules.length,
      rulesUsed: weeklyRules.length,
      slotsWritten: resolvedSlots.length,
    };
    console.log(JSON.stringify({
      event: 'regenerateWeeklyGrid',
      spreadsheetId: spreadsheet.getId(),
      ...result,
    }));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Web endpoint called by the React app after saving a rule.
 * NOTE: Apps Script allows only one doPost per project. If this file lives in the
 * same project as Code.gs, route to handleRegenerateWeeklyGridPost_ from the existing
 * doPost instead (see the 'regenerateWeeklyGrid' action there) and delete this function.
 */
// function doPost(e) {
//   return handleRegenerateWeeklyGridPost_(e);
// }

/**
 * Shared POST handler: regenerates the grid and returns JSON { status: "ok" }.
 */
function handleRegenerateWeeklyGridPost_(e) {
  try {
    const body = parsePostBody_(e);
    const spreadsheetId = String(body.spreadsheetId || (e && e.parameter && e.parameter.spreadsheetId) || '').trim();
    const result = regenerateWeeklyGrid(spreadsheetId || undefined);
    return weeklyGridJson_({ status: 'ok', result: result });
  } catch (error) {
    console.error('regenerateWeeklyGrid failed', error);
    return weeklyGridJson_({ status: 'error', message: String(error && error.message || error) });
  }
}

// ---------------------------------------------------------------------------
// Helpers (public)
// ---------------------------------------------------------------------------

/**
 * Parses a days string into canonical short day names.
 *   parseDays("Mon,Tue,Fri") -> ["Mon","Tue","Fri"]
 *   parseDays("Mon–Sun")     -> ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
 * Supports comma lists, ranges (en dash, em dash, or hyphen), mixes of both
 * ("Mon-Wed,Fri"), wrap-around ranges ("Fri-Mon"), and full day names.
 * Unknown tokens are ignored. Result is de-duplicated and in Mon–Sun order.
 */
function parseDays(daysText) {
  const dayOrder = WEEKLY_GRID_CONFIG.DAY_ORDER;
  const selected = {};

  String(daysText || '')
    .split(',')
    .map(function (token) { return token.trim(); })
    .filter(Boolean)
    .forEach(function (token) {
      const rangeParts = token.split(/\s*[\u2013\u2014-]\s*/);

      if (rangeParts.length === 2) {
        const startIndex = dayIndex_(rangeParts[0]);
        const endIndex = dayIndex_(rangeParts[1]);
        if (startIndex < 0 || endIndex < 0) return;

        // Walk forward from start to end, wrapping past Sun if needed.
        for (let offset = 0; offset < dayOrder.length; offset++) {
          const index = (startIndex + offset) % dayOrder.length;
          selected[dayOrder[index]] = true;
          if (index === endIndex) break;
        }
        return;
      }

      const singleIndex = dayIndex_(token);
      if (singleIndex >= 0) selected[dayOrder[singleIndex]] = true;
    });

  return dayOrder.filter(function (day) { return selected[day]; });
}

/**
 * "09:30" -> 570. Returns NaN for invalid input. Accepts "24:00" as end-of-day.
 */
function timeToMinutes(timeText) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeText || '').trim());
  if (!match) return NaN;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return NaN;

  return hours * 60 + minutes;
}

/**
 * 570 -> "09:30".
 */
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return pad2_(hours) + ':' + pad2_(minutes);
}

// ---------------------------------------------------------------------------
// Internal steps
// ---------------------------------------------------------------------------

/**
 * Reads ActivityRules into normalized rule objects, locating columns by header name.
 */
function readActivityRules_(rulesSheet) {
  // Display values keep "HH:MM" as typed even when the cell is time-formatted.
  const values = rulesSheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const columnIndex = headerIndexMap_(values[0]);
  const requiredColumns = ['id', 'days', 'start_time', 'end_time', 'activity_type_id', 'allow_override', 'priority', 'notes'];
  requiredColumns.forEach(function (name) {
    if (!(name in columnIndex)) {
      throw new Error('ActivityRules is missing required column: ' + name);
    }
  });

  const cell = function (row, name) {
    return String(row[columnIndex[name]] || '').trim();
  };

  return values.slice(1)
    .map(function (row, rowOffset) {
      return {
        sourceRow: rowOffset + 2,
        id: cell(row, 'id'),
        days: cell(row, 'days'),
        startTime: cell(row, 'start_time'),
        endTime: cell(row, 'end_time'),
        activityTypeId: cell(row, 'activity_type_id'),
        allowOverride: cell(row, 'allow_override').toUpperCase() === 'TRUE',
        priority: Number(cell(row, 'priority')) || 0,
        notes: cell(row, 'notes'),
      };
    })
    // Skip blank rows.
    .filter(function (rule) { return rule.id || rule.days || rule.activityTypeId; });
}

/**
 * Expands each rule into one candidate per (day, 30-minute slot).
 * The end time is exclusive: 09:00–10:00 yields 09:00 and 09:30.
 */
function buildCandidates_(rules) {
  const slotMinutes = WEEKLY_GRID_CONFIG.SLOT_MINUTES;
  const candidates = [];

  rules.forEach(function (rule, ruleOrder) {
    const days = parseDays(rule.days);
    const startMinutes = timeToMinutes(rule.startTime);
    const endMinutes = timeToMinutes(rule.endTime);

    if (!days.length || isNaN(startMinutes) || isNaN(endMinutes) || endMinutes <= startMinutes || !rule.activityTypeId) {
      console.warn('Skipping invalid ActivityRules row ' + rule.sourceRow + ' (id=' + rule.id + ')');
      return;
    }

    // Snap the start down to a slot boundary so off-grid times (e.g. 09:15) still align.
    const firstSlot = Math.floor(startMinutes / slotMinutes) * slotMinutes;

    days.forEach(function (day) {
      for (let minutes = firstSlot; minutes < endMinutes; minutes += slotMinutes) {
        candidates.push({
          day: day,
          time: minutesToTime(minutes),
          activity_type_id: rule.activityTypeId,
          rule_id: rule.id,
          priority: rule.priority,
          allow_override: rule.allowOverride,
          ruleOrder: ruleOrder,
        });
      }
    });
  });

  return candidates;
}

/**
 * Orders activity slots without discarding overlapping rules.
 * Priority and sheet order determine ordering within the same day/time slot.
 */
function resolveConflicts_(candidates) {
  const dayOrder = WEEKLY_GRID_CONFIG.DAY_ORDER;
  return candidates.slice().sort(function (a, b) {
    return (dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day))
      || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)
      || (b.priority - a.priority)
      || (a.ruleOrder - b.ruleOrder);
  });
}

/**
 * Clears WeeklyGrid and writes the header plus resolved rows in one batch.
 */
function writeWeeklyGrid_(gridSheet, resolvedSlots) {
  const headers = WEEKLY_GRID_CONFIG.GRID_HEADERS;
  const rows = [headers].concat(resolvedSlots.map(function (slot) {
    return [slot.day, slot.time, slot.activity_type_id, slot.rule_id];
  }));

  gridSheet.clearContents();

  // Force plain text so Sheets doesn't convert "09:30" into a time/date value.
  gridSheet.getRange(1, 1, rows.length, headers.length)
    .setNumberFormat('@')
    .setValues(rows);

  SpreadsheetApp.flush();
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  return sheet;
}

function headerIndexMap_(headerRow) {
  const map = {};
  headerRow.forEach(function (header, index) {
    const key = String(header || '').trim().toLowerCase();
    if (key && !(key in map)) map[key] = index;
  });
  return map;
}

function dayIndex_(dayText) {
  const prefix = String(dayText || '').trim().slice(0, 3).toLowerCase();
  return WEEKLY_GRID_CONFIG.DAY_ORDER.findIndex(function (day) {
    return day.toLowerCase() === prefix;
  });
}

function pad2_(value) {
  return (value < 10 ? '0' : '') + value;
}

function parsePostBody_(e) {
  const contents = e && e.postData && e.postData.contents;
  if (!contents) return {};
  try {
    return JSON.parse(contents);
  } catch (error) {
    return {};
  }
}

function weeklyGridJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
