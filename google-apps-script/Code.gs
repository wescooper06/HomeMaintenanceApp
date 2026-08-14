// ADD PROJECT FEATURE — Copilot context anchor
// This file contains backend Apps Script logic, including doPost routing,
// createProject action handling, ID generation, sheet row insertion,
// and error reporting for validation dialog.
const TAB_HOME = 'Project List_A (Home Maintenance)';
const TAB_VEHICLE = 'Project List_B (Vehicle/Small Engine)';
const TAB_REPEATING = 'Project List_C (Repeating Household)';
const SCRIPT_VERSION = '20260811-2';
const PLANNER_TASK_MANAGER = 'Planner_TaskManager';
const PLANNER_TASK_MANAGER_HEADERS = [
  'id', 'projectId', 'title', 'source', 'category', 'state', 'priority',
  'order', 'recurrence', 'startDate', 'updatedAt', 'metadataJson',
];

const FIXED_HOME_HEADERS = [
  'ID',
  'Property',
  'Area',
  'Category',
  'Task Description',
  'Priority',
  'Order',
  'ResourceLinks',
  'Cost ($)',
  'State',
  'Date Completed',
];

function normalizeKey(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(callback, payload) {
  return ContentService
    .createTextOutput(String(callback) + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function makeRequestId() {
  return Utilities.getUuid();
}

function logEvent(level, eventName, details) {
  const payload = {
    ts: new Date().toISOString(),
    level: String(level || 'info'),
    event: String(eventName || 'event'),
    details: details || {},
  };

  try {
    console.log(JSON.stringify(payload));
  } catch (error) {
    Logger.log(JSON.stringify(payload));
  }
}

function doGet(e) {
  const action = text(e && e.parameter && e.parameter.action);
  const callback = text(e && e.parameter && e.parameter.callback);
  const canJsonp = /^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(callback);

  try {
    if (action === 'getTaskManagerState') {
      const spreadsheetId = text(e && e.parameter && e.parameter.spreadsheetId);
      const payload = getTaskManagerState(spreadsheetId);
      return canJsonp ? jsonpResponse(callback, payload) : jsonResponse(payload);
    }

    if (action === 'projectDropdownOptions') {
      const spreadsheetId = text(e && e.parameter && e.parameter.spreadsheetId);
      const payload = buildProjectDropdownOptionsPayload(spreadsheetId || '');
      return canJsonp ? jsonpResponse(callback, payload) : jsonResponse(payload);
    }

    if (action === 'projectExists') {
      const spreadsheetId = text(e && e.parameter && e.parameter.spreadsheetId);
      const tabName = text(e && e.parameter && e.parameter.tabName);
      const id = text(e && e.parameter && e.parameter.id);

      if (!spreadsheetId) {
        throw new Error('Missing spreadsheetId for projectExists.');
      }

      if (!tabName) {
        throw new Error('Missing tabName for projectExists.');
      }

      if (!id) {
        throw new Error('Missing id for projectExists.');
      }

      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = resolveSheetByTabName(spreadsheet, tabName);
      if (!sheet) {
        throw new Error('Tab not found for projectExists: ' + tabName);
      }

      const resolvedTabName = text(sheet.getName());

      const rowNumber = findProjectRowById(sheet, id);
      const payload = {
        ok: true,
        version: SCRIPT_VERSION,
        action: 'projectExists',
        tabName: resolvedTabName,
        id: id,
        exists: Number.isFinite(rowNumber) && rowNumber >= 2,
        rowNumber: Number.isFinite(rowNumber) && rowNumber >= 2 ? rowNumber : null,
      };

      return canJsonp ? jsonpResponse(callback, payload) : jsonResponse(payload);
    }

    const payload = {
      ok: true,
      service: 'home-maintenance-sheet-writer',
      version: SCRIPT_VERSION,
      methods: ['GET', 'POST'],
      actions: ['projectDropdownOptions', 'getTaskManagerState', 'batchTaskManagerMutations', 'batchApplyPlannerChanges', 'createProject', 'projectExists', 'repairProjectTitle'],
    };

    return canJsonp ? jsonpResponse(callback, payload) : jsonResponse(payload);
  } catch (error) {
    const failure = {
      ok: false,
      version: SCRIPT_VERSION,
      action: action || 'status',
      error: String(error && error.message ? error.message : error),
    };

    return canJsonp ? jsonpResponse(callback, failure) : jsonResponse(failure);
  }
}

function taskManagerDate(value) {
  const date = new Date(text(value));
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function ensureTaskManagerSheet(spreadsheet) {
  const sheet = resolveSheetByTabName(spreadsheet, PLANNER_TASK_MANAGER);
  if (!sheet) {
    throw new Error('Tab not found: ' + PLANNER_TASK_MANAGER);
  }

  const headerRange = sheet.getRange(1, 1, 1, PLANNER_TASK_MANAGER_HEADERS.length);
  const headers = headerRange.getDisplayValues()[0].map(function (value) { return text(value); });
  const matches = PLANNER_TASK_MANAGER_HEADERS.every(function (header, index) {
    return headers[index] === header;
  });
  if (!matches) {
    const oldLastRow = sheet.getLastRow();
    const oldLastColumn = sheet.getLastColumn();
    const oldValues = oldLastRow > 1 && oldLastColumn > 0
      ? sheet.getRange(2, 1, oldLastRow - 1, oldLastColumn).getDisplayValues()
      : [];
    const oldHeaderMap = {};
    headers.forEach(function (header, index) {
      oldHeaderMap[normalizeKey(header)] = index;
    });
    const oldValue = function (row, names) {
      for (var i = 0; i < names.length; i += 1) {
        const column = oldHeaderMap[normalizeKey(names[i])];
        if (column != null && text(row[column])) {
          return text(row[column]);
        }
      }
      return '';
    };
    const migratedRows = oldValues.filter(function (row) {
      return row.some(function (value) { return text(value) !== ''; });
    }).map(function (row) {
      const metadata = {};
      const asset = oldValue(row, ['asset']);
      const mileage = oldValue(row, ['mileage']);
      const deleted = oldValue(row, ['deleted']);
      if (asset) metadata.asset = asset;
      if (mileage) metadata.mileage = mileage;
      if (deleted) metadata.deleted = deleted;
      return [
        oldValue(row, ['id', 'taskId']),
        oldValue(row, ['projectId']),
        oldValue(row, ['title']),
        oldValue(row, ['source']),
        oldValue(row, ['category']),
        oldValue(row, ['state']),
        oldValue(row, ['priority']),
        oldValue(row, ['order']),
        oldValue(row, ['recurrence']),
        oldValue(row, ['startDate']),
        oldValue(row, ['updatedAt']) || new Date().toISOString(),
        JSON.stringify(metadata),
      ];
    });
    headerRange.setValues([PLANNER_TASK_MANAGER_HEADERS]);
    if (migratedRows.length) {
      sheet.getRange(2, 1, migratedRows.length, PLANNER_TASK_MANAGER_HEADERS.length).setValues(migratedRows);
    }
  }
  return sheet;
}

function taskManagerRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, PLANNER_TASK_MANAGER_HEADERS.length).getDisplayValues();
  return values.map(function (row, index) {
    const item = {};
    PLANNER_TASK_MANAGER_HEADERS.forEach(function (header, column) {
      item[header] = text(row[column]);
    });
    item._rowNumber = index + 2;
    return item;
  }).filter(function (item) { return text(item.id); });
}

function getTaskManagerState(spreadsheetId) {
  if (!text(spreadsheetId)) {
    throw new Error('Missing spreadsheetId for getTaskManagerState.');
  }
  const spreadsheet = SpreadsheetApp.openById(text(spreadsheetId));
  const sheet = ensureTaskManagerSheet(spreadsheet);
  return {
    ok: true,
    action: 'getTaskManagerState',
    version: SCRIPT_VERSION,
    rows: taskManagerRows(sheet),
  };
}

function batchTaskManagerMutations(mutations, clientTxnId, spreadsheetId) {
  if (!text(spreadsheetId)) {
    throw new Error('Missing spreadsheetId for batchTaskManagerMutations.');
  }

  const txnId = text(clientTxnId);
  const properties = PropertiesService.getScriptProperties();
  const txnKey = 'planner_task_manager_txn_' + txnId;
  if (txnId && properties.getProperty(txnKey)) {
    return JSON.parse(properties.getProperty(txnKey));
  }

  const spreadsheet = SpreadsheetApp.openById(text(spreadsheetId));
  const sheet = ensureTaskManagerSheet(spreadsheet);
  const existing = taskManagerRows(sheet);
  const byId = {};
  existing.forEach(function (row) { byId[text(row.id)] = row; });
  const results = [];
  (Array.isArray(mutations) ? mutations : []).forEach(function (mutation) {
    const row = mutation && mutation.row ? mutation.row : {};
    const id = text((mutation && mutation.id) || row.id);
    if (!id) {
      results.push({ ok: false, error: 'Mutation is missing id.' });
      return;
    }

    const current = byId[id];
    if (mutation.op === 'delete') {
      if (!current || taskManagerDate(row.updatedAt) >= taskManagerDate(current.updatedAt)) {
        if (current) {
          sheet.deleteRow(current._rowNumber);
          existing.splice(existing.indexOf(current), 1);
          existing.forEach(function (item, index) { item._rowNumber = index + 2; });
          delete byId[id];
        }
        results.push({ ok: true, op: 'delete', id: id, applied: true });
      } else {
        results.push({ ok: true, op: 'delete', id: id, applied: false, conflict: true });
      }
      return;
    }

    const normalized = {};
    PLANNER_TASK_MANAGER_HEADERS.forEach(function (header) {
      normalized[header] = text(row[header]);
    });
    normalized.id = id;
    normalized.updatedAt = normalized.updatedAt || new Date().toISOString();
    if (current && taskManagerDate(normalized.updatedAt) < taskManagerDate(current.updatedAt)) {
      results.push({ ok: true, op: 'upsert', id: id, applied: false, conflict: true });
      return;
    }

    if (current) {
      sheet.getRange(current._rowNumber, 1, 1, PLANNER_TASK_MANAGER_HEADERS.length).setValues([PLANNER_TASK_MANAGER_HEADERS.map(function (header) { return normalized[header]; })]);
      byId[id] = Object.assign({}, normalized, { _rowNumber: current._rowNumber });
    } else {
      sheet.appendRow(PLANNER_TASK_MANAGER_HEADERS.map(function (header) { return normalized[header]; }));
      byId[id] = Object.assign({}, normalized, { _rowNumber: sheet.getLastRow() });
    }
    results.push({ ok: true, op: 'upsert', id: id, applied: true });
  });

  const response = { ok: true, action: 'batchTaskManagerMutations', version: SCRIPT_VERSION, clientTxnId: txnId, results: results };
  if (txnId) {
    properties.setProperty(txnKey, JSON.stringify(response));
  }
  return response;
}

function batchApplyPlannerChanges(mutations, clientTxnId, spreadsheetId) {
  const list = Array.isArray(mutations) ? mutations : [];
  const taskManagerMutations = list.filter(function (mutation) {
    return mutation && mutation.sheet === PLANNER_TASK_MANAGER;
  });
  if (taskManagerMutations.length !== list.length) {
    throw new Error('Unsupported planner sheet in batchApplyPlannerChanges.');
  }
  return batchTaskManagerMutations(taskManagerMutations, clientTxnId, spreadsheetId);
}

function buildProjectDropdownOptionsPayload(spreadsheetId) {
  const targetSpreadsheetId = text(spreadsheetId);
  if (!targetSpreadsheetId) {
    throw new Error('Missing spreadsheetId for project dropdown options.');
  }

  const spreadsheet = SpreadsheetApp.openById(targetSpreadsheetId);
  const perTabConfig = {
    home: {
      tabName: TAB_HOME,
      fields: {
        category: ['Category'],
        state: ['State'],
        priority: ['Priority'],
        recurrence: ['Recurrence', 'Frequency', 'Repeat'],
        area: ['Area'],
      },
    },
    vehicle: {
      tabName: TAB_VEHICLE,
      fields: {
        category: ['Category'],
        state: ['State'],
        priority: ['Priority'],
        recurrence: ['Recurrence', 'Frequency', 'Interval'],
        vehicle: ['Vehicle/Small Engine', 'Vehicle'],
        area: ['Area'],
      },
    },
    repeating: {
      tabName: TAB_REPEATING,
      fields: {
        category: ['Category'],
        state: ['State'],
        priority: ['Priority'],
        recurrance: ['Recurrance', 'Recurrence', 'Frequency', 'Repeat', 'Interval'],
        recurrence: ['Recurrence', 'Frequency', 'Repeat', 'Interval'],
        area: ['Area'],
      },
    },
  };

  const options = {
    home: {},
    vehicle: {},
    repeating: {},
  };

  Object.keys(perTabConfig).forEach(function (sourceKey) {
    const sourceConfig = perTabConfig[sourceKey];
    options[sourceKey] = extractDropdownsForTab(spreadsheet, sourceConfig.tabName, sourceConfig.fields);
  });

  return {
    ok: true,
    version: SCRIPT_VERSION,
    action: 'projectDropdownOptions',
    options: options,
  };
}

function extractDropdownsForTab(spreadsheet, tabName, fieldHeaderAliases) {
  const sheet = resolveSheetByTabName(spreadsheet, tabName);
  const result = {};

  Object.keys(fieldHeaderAliases).forEach(function (fieldKey) {
    result[fieldKey] = [];
  });

  if (!sheet) {
    return result;
  }

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (!lastColumn || !lastRow) {
    return result;
  }

  const headerInfo = detectHeaderRow(sheet, fieldHeaderAliases, lastColumn);
  const headerRow = headerInfo.headerRow;
  const headers = headerInfo.headers;

  Object.keys(fieldHeaderAliases).forEach(function (fieldKey) {
    const aliases = fieldHeaderAliases[fieldKey] || [];
    let locations = findFieldColumnLocations(sheet, aliases, lastColumn, lastRow, headerRow, headers);
    if (!locations.length) {
      locations = findFieldColumnLocations(sheet, aliases, lastColumn, lastRow);
    }
    if (!locations.length) {
      result[fieldKey] = [];
      return;
    }

    const fieldValuesMap = {};
    for (var i = 0; i < locations.length; i += 1) {
      const location = locations[i];
      const values = collectDropdownValuesFromColumn(sheet, location.col, location.headerRow, lastRow);
      for (var v = 0; v < values.length; v += 1) {
        fieldValuesMap[values[v]] = true;
      }
    }

    result[fieldKey] = Object.keys(fieldValuesMap).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
  });

  return result;
}

function findFieldColumnLocations(sheet, aliases, lastColumn, lastRow, preferredHeaderRow, preferredHeaders) {
  if (!aliases || !aliases.length || !lastColumn || !lastRow) {
    return [];
  }

  const aliasMap = {};
  aliases.forEach(function (alias) {
    aliasMap[normalizeKey(alias)] = true;
  });

  if (Number.isFinite(preferredHeaderRow) && preferredHeaderRow > 0) {
    const headers = Array.isArray(preferredHeaders)
      ? preferredHeaders
      : sheet.getRange(preferredHeaderRow, 1, 1, lastColumn).getDisplayValues()[0];

    const preferredLocations = [];
    for (var p = 0; p < headers.length; p += 1) {
      const normalizedPreferred = normalizeKey(headers[p]);
      if (normalizedPreferred && aliasMap[normalizedPreferred]) {
        preferredLocations.push({
          col: p + 1,
          headerRow: preferredHeaderRow,
        });
      }
    }

    if (preferredLocations.length) {
      return preferredLocations;
    }
  }

  const scanRows = Math.min(Math.max(lastRow, 1), 200);
  const rows = sheet.getRange(1, 1, scanRows, lastColumn).getDisplayValues();

  var bestRowIndex = -1;
  var bestScore = -1;

  for (var r = 0; r < rows.length; r += 1) {
    var score = 0;
    for (var c = 0; c < rows[r].length; c += 1) {
      const normalizedCell = normalizeKey(rows[r][c]);
      if (normalizedCell && aliasMap[normalizedCell]) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = r;
    }
  }

  if (bestRowIndex < 0 || bestScore <= 0) {
    return [];
  }

  const locations = [];
  for (var col = 0; col < rows[bestRowIndex].length; col += 1) {
    const normalized = normalizeKey(rows[bestRowIndex][col]);
    if (normalized && aliasMap[normalized]) {
      locations.push({
        col: col + 1,
        headerRow: bestRowIndex + 1,
      });
    }
  }

  return locations;
}

function detectHeaderRow(sheet, fieldHeaderAliases, lastColumn) {
  const scanRows = Math.min(Math.max(sheet.getLastRow(), 1), 30);
  const rows = sheet.getRange(1, 1, scanRows, lastColumn).getDisplayValues();
  const keys = Object.keys(fieldHeaderAliases || {});

  var bestRow = 1;
  var bestScore = -1;

  for (var r = 0; r < rows.length; r += 1) {
    const headers = rows[r].map(function (cell) {
      return text(cell);
    });

    var score = 0;
    for (var k = 0; k < keys.length; k += 1) {
      const aliases = fieldHeaderAliases[keys[k]] || [];
      if (findHeaderColumnIndex(headers, aliases)) {
        score += 1;
      }
    }

    if (findHeaderColumnIndex(headers, ['ID'])) {
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = r + 1;
    }
  }

  const bestHeaders = rows[bestRow - 1].map(function (cell) {
    return text(cell);
  });

  return {
    headerRow: bestRow,
    headers: bestHeaders,
  };
}

function findHeaderColumnIndex(headers, aliases) {
  if (!headers || !headers.length || !aliases || !aliases.length) {
    return 0;
  }

  const normalizedAliasMap = {};
  aliases.forEach(function (alias) {
    normalizedAliasMap[normalizeKey(alias)] = true;
  });

  for (var i = 0; i < headers.length; i += 1) {
    if (normalizedAliasMap[normalizeKey(headers[i])]) {
      return i + 1;
    }
  }

  return 0;
}

function collectDropdownValuesFromColumn(sheet, col, headerRow, lastRow) {
  const valuesMap = {};
  const startRow = Number(headerRow) + 1;
  if (!Number.isFinite(startRow) || startRow < 2) {
    return [];
  }

  var foundValidationOptions = false;

  function addValuesFromValidation(validation) {
    if (!validation) {
      return;
    }

    const criteriaType = validation.getCriteriaType();
    const criteriaValues = validation.getCriteriaValues() || [];

    if (criteriaType === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      const explicitList = criteriaValues[0] || [];
      if (explicitList.length) {
        foundValidationOptions = true;
      }
      explicitList.forEach(function (entry) {
        const normalized = text(entry);
        if (normalized) {
          valuesMap[normalized] = true;
        }
      });
    }

    if (criteriaType === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
      const sourceRange = criteriaValues[0];
      if (sourceRange) {
        foundValidationOptions = true;
        const rangeValues = sourceRange.getDisplayValues();
        for (var i = 0; i < rangeValues.length; i += 1) {
          for (var j = 0; j < rangeValues[i].length; j += 1) {
            const normalizedValue = text(rangeValues[i][j]);
            if (normalizedValue) {
              valuesMap[normalizedValue] = true;
            }
          }
        }
      }
    }
  }

  // Always scan validations from row 1 down so header-row misdetection cannot hide list rules.
  const validationScanEndRow = Math.max(lastRow, sheet.getMaxRows());
  const validationRowsCount = Math.max(0, validationScanEndRow);
  if (validationRowsCount > 0) {
    const validationRange = sheet.getRange(1, col, validationRowsCount, 1);
    const allValidations = validationRange.getDataValidations();
    for (var v = 0; v < validationRowsCount; v += 1) {
      addValuesFromValidation(allValidations[v] && allValidations[v][0]);
    }
  }

  // Keep existing entered values as fallback/supplemental options for sheets without validation rules.
  const valueRowsCount = Math.max(0, lastRow - startRow + 1);
  if (valueRowsCount > 0) {
    const valueRange = sheet.getRange(startRow, col, valueRowsCount, 1);
    const valueRows = valueRange.getDisplayValues();
    for (var r = 0; r < valueRowsCount; r += 1) {
      const existingValue = text(valueRows[r] && valueRows[r][0]);
      if (existingValue) {
        valuesMap[existingValue] = true;
      }
    }
  }

  if (!foundValidationOptions) {
    // No-op: caller still receives unique existing values collected above.
  }

  return Object.keys(valuesMap).sort(function (a, b) {
    return String(a).localeCompare(String(b));
  });
}

function findProjectRowById(sheet, id) {
  const targetId = text(id);
  if (!targetId) {
    return NaN;
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastRow || lastRow < 2 || !lastColumn) {
    return NaN;
  }

  const idLocation = findIdColumnLocation(sheet, lastColumn, lastRow);
  if (!idLocation || !idLocation.col || !idLocation.headerRow) {
    return NaN;
  }

  const startRow = idLocation.headerRow + 1;
  if (startRow > lastRow) {
    return NaN;
  }

  const values = sheet.getRange(startRow, idLocation.col, lastRow - startRow + 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i += 1) {
    if (text(values[i][0]) === targetId) {
      return startRow + i;
    }
  }

  return NaN;
}

function resolveSheetByTabName(spreadsheet, tabName) {
  if (!spreadsheet) {
    return null;
  }

  const requested = text(tabName);
  if (!requested) {
    return null;
  }

  const exact = spreadsheet.getSheetByName(requested);
  if (exact) {
    return exact;
  }

  const requestedNormalized = normalizeKey(requested);
  const sheets = spreadsheet.getSheets();
  var best = null;
  var bestScore = -1;

  for (var i = 0; i < sheets.length; i += 1) {
    const candidate = sheets[i];
    const name = text(candidate && candidate.getName && candidate.getName());
    const normalized = normalizeKey(name);
    if (!normalized) {
      continue;
    }

    var score = 0;

    if (normalized === requestedNormalized) {
      score += 1000;
    }

    if (requestedNormalized && normalized.indexOf(requestedNormalized) >= 0) {
      score += 200;
    }

    if (requestedNormalized && requestedNormalized.indexOf(normalized) >= 0) {
      score += 150;
    }

    const hasListA = requestedNormalized.indexOf('projectlista') >= 0 || requestedNormalized.indexOf('lista') >= 0 || requestedNormalized.indexOf('home') >= 0;
    const hasListB = requestedNormalized.indexOf('projectlistb') >= 0 || requestedNormalized.indexOf('listb') >= 0 || requestedNormalized.indexOf('vehicle') >= 0;
    const hasListC = requestedNormalized.indexOf('projectlistc') >= 0 || requestedNormalized.indexOf('listc') >= 0 || requestedNormalized.indexOf('repeating') >= 0;

    if (hasListA && (normalized.indexOf('projectlista') >= 0 || normalized.indexOf('lista') >= 0 || normalized.indexOf('home') >= 0)) {
      score += 300;
    }

    if (hasListB && (normalized.indexOf('projectlistb') >= 0 || normalized.indexOf('listb') >= 0 || normalized.indexOf('vehicle') >= 0)) {
      score += 300;
    }

    if (hasListC && (normalized.indexOf('projectlistc') >= 0 || normalized.indexOf('listc') >= 0 || normalized.indexOf('repeating') >= 0)) {
      score += 300;
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore > 0 ? best : null;
}

function findIdColumnLocation(sheet, lastColumn, lastRow) {
  const scanRows = Math.min(Math.max(lastRow, 1), 200);
  const rows = sheet.getRange(1, 1, scanRows, lastColumn).getDisplayValues();

  for (var r = 0; r < rows.length; r += 1) {
    for (var c = 0; c < rows[r].length; c += 1) {
      if (normalizeKey(rows[r][c]) === 'id') {
        return {
          headerRow: r + 1,
          col: c + 1,
        };
      }
    }
  }

  return {
    headerRow: 1,
    col: 1,
  };
}

function doPost(e) {
  const requestId = makeRequestId();

  try {
    const bodyText = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(bodyText);
    const action = text(body.action || (e && e.parameter && e.parameter.action) || 'updateProject');

    if (action === 'batchTaskManagerMutations' || action === 'batchApplyPlannerChanges') {
      const result = action === 'batchTaskManagerMutations'
        ? batchTaskManagerMutations(body.mutations, body.clientTxnId, body.spreadsheetId)
        : batchApplyPlannerChanges(body.mutations, body.clientTxnId, body.spreadsheetId);
      return jsonResponse(result);
    }

    if (action === 'sendReminder' || action === 'resetReminder' || action === 'deleteReminder') {
      const reminderResult = handleReminderAction(action, body);
      return jsonResponse({
        ok: true,
        requestId: requestId,
        version: SCRIPT_VERSION,
        action: action,
        taskId: reminderResult.taskId,
        sendAt: reminderResult.sendAt || '',
      });
    }

    const spreadsheetId = text(body.spreadsheetId);
    const tabName = text(body.tabName);
    const project = body.project || {};
    const id = text(body.id || project.id);

    logEvent('info', 'write_request_received', {
      requestId: requestId,
      action: action,
      spreadsheetId: spreadsheetId,
      tabName: tabName,
      projectId: id,
      source: text(project.source),
    });

    if (!spreadsheetId) {
      throw new Error('Missing spreadsheetId');
    }

    if (action === 'deleteProject') {
      if (!id) {
        throw new Error('Missing id for deleteProject action.');
      }

      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const deleteResult = deleteProjectByIdentity(spreadsheet, {
        id: id,
        source: text(body.source || project.source),
        tabName: tabName,
        sheetRowNumber: Number(body.sheetRowNumber || (project.metadata && project.metadata.sheetRowNumber) || 0),
        title: text(body.title || project.title),
      });

      logEvent('info', 'delete_request_success', {
        requestId: requestId,
        id: deleteResult.id,
        tabName: deleteResult.tabName,
        rowNumber: deleteResult.rowNumber,
      });

      return jsonResponse({
        ok: true,
        requestId: requestId,
        version: SCRIPT_VERSION,
        action: 'deleteProject',
        id: deleteResult.id,
        tabName: deleteResult.tabName,
        rowNumber: deleteResult.rowNumber,
      });
    }

    if (action === 'createProject') {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const createResult = createProject(spreadsheet, body);

      logEvent('info', 'create_request_success', {
        requestId: requestId,
        id: createResult.id,
        tabName: createResult.tabName,
        rowNumber: createResult.rowNumber,
      });

      return jsonResponse({
        ok: true,
        requestId: requestId,
        version: SCRIPT_VERSION,
        action: 'createProject',
        id: createResult.id,
        tabName: createResult.tabName,
        rowNumber: createResult.rowNumber,
      });
    }

    if (action === 'repairProjectTitle') {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const repairResult = repairProjectTitle(spreadsheet, body);

      logEvent('info', 'repair_request_success', {
        requestId: requestId,
        id: repairResult.id,
        tabName: repairResult.tabName,
        rowNumber: repairResult.rowNumber,
      });

      return jsonResponse({
        ok: true,
        requestId: requestId,
        version: SCRIPT_VERSION,
        action: 'repairProjectTitle',
        id: repairResult.id,
        tabName: repairResult.tabName,
        rowNumber: repairResult.rowNumber,
      });
    }

    if (!tabName) {
      throw new Error('Missing tabName');
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = resolveSheetByTabName(spreadsheet, tabName);

    if (!sheet) {
      throw new Error('Tab not found: ' + tabName);
    }

    const resolvedTabName = text(sheet.getName());

    if (resolvedTabName === TAB_HOME || resolvedTabName === TAB_REPEATING || normalizeKey(resolvedTabName).indexOf('projectlista') >= 0 || normalizeKey(resolvedTabName).indexOf('projectlistc') >= 0) {
      const result = updateFixedSchemaRow(sheet, project);
      logEvent('info', 'save_request_success', {
        requestId: requestId,
        mode: 'fixed-schema',
        rowNumber: result.rowNumber,
        updatedColumns: result.updatedColumns,
      });
      return jsonResponse({ ok: true, requestId: requestId, version: SCRIPT_VERSION, mode: 'fixed-schema', ...result });
    }

    if (resolvedTabName === TAB_VEHICLE || normalizeKey(resolvedTabName).indexOf('projectlistb') >= 0) {
      const result = updateHeaderSchemaRow(sheet, project);
      logEvent('info', 'save_request_success', {
        requestId: requestId,
        mode: 'header-schema',
        rowNumber: result.rowNumber,
        updatedColumns: result.updatedColumns,
      });
      return jsonResponse({ ok: true, requestId: requestId, version: SCRIPT_VERSION, mode: 'header-schema', ...result });
    }

    throw new Error('Unsupported tab: ' + resolvedTabName);
  } catch (error) {
    logEvent('error', 'write_request_failed', {
      requestId: requestId,
      error: String(error && error.message ? error.message : error),
      stack: String(error && error.stack ? error.stack : ''),
    });
    return jsonResponse({ ok: false, requestId: requestId, version: SCRIPT_VERSION, error: String(error && error.message ? error.message : error) });
  }
}

function reminderPropertyKey(taskId, suffix) {
  return 'reminder_' + text(taskId) + '_' + suffix;
}

function clearReminderMetadata(taskId) {
  const props = PropertiesService.getScriptProperties();
  ['phone', 'gateway', 'message', 'sendAt', 'triggerId'].forEach(function (suffix) {
    props.deleteProperty(reminderPropertyKey(taskId, suffix));
  });
}

function handleReminderAction(action, body) {
  const taskId = text(body && body.taskId);
  if (!taskId) {
    throw new Error('Missing taskId for ' + action + ' action.');
  }

  if (action === 'deleteReminder') {
    deleteReminderTriggerForTask(taskId);
    clearReminderMetadata(taskId);
    return { taskId: taskId };
  }

  const props = PropertiesService.getScriptProperties();
  const sendAt = text(action === 'resetReminder' ? (body.newSendAt || body.sendAt) : body.sendAt);
  const phoneNumber = text(body.phoneNumber || props.getProperty(reminderPropertyKey(taskId, 'phone')));
  const smsGateway = text(body.smsGateway || props.getProperty(reminderPropertyKey(taskId, 'gateway')));
  const message = text(body.message || props.getProperty(reminderPropertyKey(taskId, 'message')));
  const sendDate = new Date(sendAt);

  if (!phoneNumber || !smsGateway || !message || !sendAt) {
    throw new Error('Reminder requires phoneNumber, smsGateway, message, and sendAt.');
  }

  if (isNaN(sendDate.getTime())) {
    throw new Error('Invalid reminder sendAt timestamp.');
  }

  deleteReminderTriggerForTask(taskId);
  props.setProperty(reminderPropertyKey(taskId, 'phone'), phoneNumber);
  props.setProperty(reminderPropertyKey(taskId, 'gateway'), smsGateway);
  props.setProperty(reminderPropertyKey(taskId, 'message'), message);
  props.setProperty(reminderPropertyKey(taskId, 'sendAt'), sendAt);
  createReminderTrigger(taskId, sendAt);

  return { taskId: taskId, sendAt: sendAt };
}

function createReminderTrigger(taskId, sendAt) {
  const trigger = ScriptApp.newTrigger('sendSms')
    .timeBased()
    .at(new Date(sendAt))
    .create();
  const props = PropertiesService.getScriptProperties();
  const triggerId = trigger.getUniqueId();
  props.setProperty(reminderPropertyKey(taskId, 'triggerId'), triggerId);
  props.setProperty('reminder_trigger_' + triggerId, text(taskId));
  return trigger;
}

function deleteReminderTriggerForTask(taskId) {
  const props = PropertiesService.getScriptProperties();
  const triggerId = text(props.getProperty(reminderPropertyKey(taskId, 'triggerId')));
  if (triggerId) {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === 'sendSms' && trigger.getUniqueId() === triggerId) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    props.deleteProperty('reminder_trigger_' + triggerId);
    props.deleteProperty(reminderPropertyKey(taskId, 'triggerId'));
  }
}

function deleteReminderTrigger() {
  const props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'sendSms') {
      props.deleteProperty('reminder_trigger_' + trigger.getUniqueId());
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function authorizeReminderServices() {
  return {
    triggerCount: ScriptApp.getProjectTriggers().length,
    remainingMailQuota: MailApp.getRemainingDailyQuota(),
  };
}

function sendSms(e) {
  const props = PropertiesService.getScriptProperties();
  const triggerId = text(e && e.triggerUid);
  let taskId = triggerId ? text(props.getProperty('reminder_trigger_' + triggerId)) : '';

  if (!taskId) {
    const phoneKey = props.getKeys().find(function (key) {
      return key.indexOf('reminder_') === 0 && /_phone$/.test(key);
    });
    taskId = phoneKey ? phoneKey.substring('reminder_'.length, phoneKey.length - '_phone'.length) : '';
  }

  if (!taskId) {
    return;
  }

  const phone = text(props.getProperty(reminderPropertyKey(taskId, 'phone')));
  const gateway = text(props.getProperty(reminderPropertyKey(taskId, 'gateway')));
  const message = text(props.getProperty(reminderPropertyKey(taskId, 'message')));
  if (!phone || !gateway || !message) {
    clearReminderMetadata(taskId);
    return;
  }

  MailApp.sendEmail(phone + gateway, '', message);
  if (triggerId) {
    props.deleteProperty('reminder_trigger_' + triggerId);
  }
  clearReminderMetadata(taskId);
}

function createProject(spreadsheet, body) {
  const source = text(body && body.source);
  const tabName = text(body && body.tabName) || sourceToTabName(source);
  const fields = body && body.fields ? body.fields : {};

  if (!tabName) {
    throw new Error('Unable to resolve tabName for createProject action.');
  }

  const sheet = resolveSheetByTabName(spreadsheet, tabName);
  if (!sheet) {
    throw new Error('Tab not found for createProject: ' + tabName);
  }

  const resolvedTabName = text(sheet.getName());

  let id = text(body && body.id);
  if (!id) {
    id = String(getNextProjectId(spreadsheet, resolvedTabName));
  }

  let rowNumber = 0;
  if (resolvedTabName === TAB_HOME || normalizeKey(resolvedTabName).indexOf('projectlista') >= 0) {
    const homeBounds = getFixedHomeTableBounds(sheet);
    rowNumber = appendFixedSchemaCreateRow(sheet, id, fields, homeBounds);
  } else {
    rowNumber = appendHeaderSchemaCreateRow(sheet, id, fields);
  }

  return {
    ok: true,
    id: id,
    tabName: resolvedTabName,
    rowNumber: rowNumber,
  };
}

function getNextProjectId(spreadsheet, tabName) {
  const sheet = resolveSheetByTabName(spreadsheet, tabName);
  if (!sheet) {
    throw new Error('Tab not found for ID generation: ' + tabName);
  }

  const resolvedTabName = text(sheet.getName());

  var idCol = 1;
  var startRow = 2;
  var rowCount = 0;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 1;
  }

  if (resolvedTabName === TAB_HOME || normalizeKey(resolvedTabName).indexOf('projectlista') >= 0) {
    const homeBounds = getFixedHomeTableBounds(sheet);
    idCol = homeBounds.startCol;
    startRow = homeBounds.headerRow + 1;
    rowCount = Math.max(0, homeBounds.tableLastRow - homeBounds.headerRow);
  }

  if (!(resolvedTabName === TAB_HOME || normalizeKey(resolvedTabName).indexOf('projectlista') >= 0)) {
    const lastCol = sheet.getLastColumn();
    const idLocation = findIdColumnLocation(sheet, lastCol, lastRow);
    const headerMap = {};

    idCol = idLocation && idLocation.col ? idLocation.col : 1;
    startRow = idLocation && idLocation.headerRow ? idLocation.headerRow + 1 : 2;
    rowCount = Math.max(0, lastRow - startRow + 1);
  }

  if (rowCount <= 0) {
    return 1;
  }

  const idValues = sheet.getRange(startRow, idCol, rowCount, 1).getDisplayValues();
  var maxId = 0;

  for (var i = 0; i < idValues.length; i += 1) {
    const value = Number(text(idValues[i][0]));
    if (Number.isFinite(value) && value > maxId) {
      maxId = value;
    }
  }

  return maxId + 1;
}

function appendFixedSchemaCreateRow(sheet, id, fields, bounds) {
  const rowObject = {
    'ID': text(id),
    'Property': text(fields.Property),
    'Area': text(fields.Area),
    'Category': text(fields.Category),
    'Task Description': text(fields['Task Description']),
    'Priority': text(fields.Priority),
    'Order': text(fields.Order),
    'ResourceLinks': text(fields.ResourceLinks || fields['Resource Links']),
    'Cost ($)': text(fields['Cost ($)'] || fields.Cost),
    'State': text(fields.State),
    'Date Completed': text(fields['Date Completed']),
  };

  const values = FIXED_HOME_HEADERS.map(function (header) {
    const value = rowObject[header];
    return value == null ? '' : value;
  });

  const tableBounds = bounds || getFixedHomeTableBounds(sheet);
  const insertAfterRow = tableBounds.tableLastRow;
  sheet.insertRowAfter(insertAfterRow);
  const insertRow = insertAfterRow + 1;
  sheet.getRange(insertRow, tableBounds.startCol, 1, values.length).setValues([values]);
  return insertRow;
}

function getFixedHomeTableBounds(sheet) {
  const startCol = 1;
  const width = FIXED_HOME_HEADERS.length;
  const headerRow = findFixedHomeHeaderRow(sheet, startCol, width);
  const maxRows = sheet.getMaxRows();
  const rowCount = Math.max(0, maxRows - headerRow);

  if (rowCount <= 0) {
    return {
      headerRow: headerRow,
      tableLastRow: headerRow,
      startCol: startCol,
      width: width,
    };
  }

  const rows = sheet.getRange(headerRow + 1, startCol, rowCount, width).getDisplayValues();
  var tableLastRow = headerRow;

  for (var i = 0; i < rows.length; i += 1) {
    const hasValues = rows[i].some(function (cell) {
      return text(cell) !== '';
    });

    if (!hasValues) {
      break;
    }

    tableLastRow = headerRow + 1 + i;
  }

  return {
    headerRow: headerRow,
    tableLastRow: tableLastRow,
    startCol: startCol,
    width: width,
  };
}

function findFixedHomeHeaderRow(sheet, startCol, width) {
  const maxScanRows = Math.min(Math.max(sheet.getLastRow(), 1), 30);
  const rows = sheet.getRange(1, startCol, maxScanRows, width).getDisplayValues();
  const normalizedFixedHeaders = FIXED_HOME_HEADERS.map(function (header) {
    return normalizeKey(header);
  });

  for (var r = 0; r < rows.length; r += 1) {
    const normalizedRow = rows[r].map(function (cell) {
      return normalizeKey(cell);
    });

    var matches = true;
    for (var c = 0; c < normalizedFixedHeaders.length; c += 1) {
      if (normalizedRow[c] !== normalizedFixedHeaders[c]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return r + 1;
    }
  }

  return 1;
}

function appendHeaderSchemaCreateRow(sheet, id, fields) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return text(h);
  });
  const headerMap = {};

  for (var i = 0; i < headers.length; i += 1) {
    headerMap[normalizeKey(headers[i])] = i;
  }

  const row = new Array(lastCol).fill('');
  row[headerMap[normalizeKey('ID')] != null ? headerMap[normalizeKey('ID')] : 0] = text(id);

  Object.keys(fields || {}).forEach(function (fieldKey) {
    const normalized = normalizeKey(fieldKey);
    const index = headerMap[normalized];
    if (index == null) {
      return;
    }

    row[index] = text(fields[fieldKey]);
  });

  // Keep compatibility with sheets using either Recurrence or Recurrance header.
  const recurrenceValue = text(fields.Recurrence || fields.Recurrance);
  if (recurrenceValue) {
    const recurrenceIndex = headerMap[normalizeKey('Recurrence')];
    const recurranceIndex = headerMap[normalizeKey('Recurrance')];
    if (recurrenceIndex != null) {
      row[recurrenceIndex] = recurrenceValue;
    }

    if (recurranceIndex != null) {
      row[recurranceIndex] = recurrenceValue;
    }
  }

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function sourceToTabName(source) {
  const normalized = text(source).toLowerCase();

  if (normalized.indexOf('list_a') >= 0 || normalized.indexOf('home') >= 0) {
    return TAB_HOME;
  }

  if (normalized.indexOf('list_b') >= 0 || normalized.indexOf('vehicle') >= 0) {
    return TAB_VEHICLE;
  }

  if (normalized.indexOf('list_c') >= 0 || normalized.indexOf('repeating') >= 0) {
    return TAB_REPEATING;
  }

  return '';
}

function sheetTypeFromName(tabName) {
  const normalized = normalizeKey(tabName);

  if (normalized.indexOf('projectlista') >= 0 || normalized.indexOf('lista') >= 0 || normalized.indexOf('home') >= 0) {
    return 'home';
  }

  if (normalized.indexOf('projectlistb') >= 0 || normalized.indexOf('listb') >= 0 || normalized.indexOf('vehicle') >= 0) {
    return 'vehicle';
  }

  if (normalized.indexOf('projectlistc') >= 0 || normalized.indexOf('listc') >= 0 || normalized.indexOf('repeating') >= 0) {
    return 'repeating';
  }

  return '';
}

function deleteProjectByIdentity(spreadsheet, payload) {
  const id = text(payload && payload.id);
  const source = text(payload && payload.source);
  const explicitTab = text(payload && payload.tabName);
  const rowHint = Number(payload && payload.sheetRowNumber);
  const titleHint = text(payload && payload.title);

  if (!id) {
    throw new Error('Missing id for project deletion.');
  }

  const fastDelete = tryDeleteProjectByRowHint(spreadsheet, {
    id: id,
    source: source,
    tabName: explicitTab,
    sheetRowNumber: rowHint,
    title: titleHint,
  });

  if (fastDelete) {
    return fastDelete;
  }

  const candidates = [];
  if (explicitTab) {
    candidates.push(explicitTab);
  }

  const sourceTab = sourceToTabName(source);
  if (sourceTab && candidates.indexOf(sourceTab) === -1) {
    candidates.push(sourceTab);
  }

  [TAB_HOME, TAB_VEHICLE, TAB_REPEATING].forEach(function (tab) {
    if (candidates.indexOf(tab) === -1) {
      candidates.push(tab);
    }
  });

  for (var i = 0; i < candidates.length; i += 1) {
    const requestedTab = candidates[i];
    const sheet = resolveSheetByTabName(spreadsheet, requestedTab);
    if (!sheet) {
      continue;
    }

    const tabName = text(sheet.getName());

    const rowNumber = findDeleteRowInTab(sheet, tabName, id, rowHint, titleHint);
    if (Number.isFinite(rowNumber) && rowNumber >= 2) {
      sheet.deleteRow(rowNumber);
      return {
        ok: true,
        id: id,
        tabName: tabName,
        rowNumber: rowNumber,
      };
    }
  }

  throw new Error('Project not found for deletion: ' + id);
}

function tryDeleteProjectByRowHint(spreadsheet, payload) {
  const id = text(payload && payload.id);
  const explicitTab = text(payload && payload.tabName);
  const source = text(payload && payload.source);
  const rowHint = Number(payload && payload.sheetRowNumber);
  const titleHint = text(payload && payload.title);

  if (!id || !Number.isFinite(rowHint) || rowHint < 2) {
    return null;
  }

  const candidateTabs = [];
  if (explicitTab) {
    candidateTabs.push(explicitTab);
  }

  const sourceTab = sourceToTabName(source);
  if (sourceTab && candidateTabs.indexOf(sourceTab) === -1) {
    candidateTabs.push(sourceTab);
  }

  for (var i = 0; i < candidateTabs.length; i += 1) {
    const requestedTab = candidateTabs[i];
    const sheet = resolveSheetByTabName(spreadsheet, requestedTab);
    if (!sheet) {
      continue;
    }

    const tabName = text(sheet.getName());

    const matched = isDeleteRowHintMatch(sheet, tabName, id, rowHint, titleHint);
    if (matched) {
      sheet.deleteRow(rowHint);
      return {
        ok: true,
        id: id,
        tabName: tabName,
        rowNumber: rowHint,
      };
    }
  }

  return null;
}

function isDeleteRowHintMatch(sheet, tabName, id, rowHint, titleHint) {
  const lastRow = sheet.getLastRow();
  if (!Number.isFinite(rowHint) || rowHint < 2 || rowHint > lastRow) {
    return false;
  }

  const sheetType = sheetTypeFromName(tabName);

  if (sheetType === 'home' || sheetType === 'repeating') {
    const rowId = text(sheet.getRange(rowHint, 1).getDisplayValue());
    if (rowId !== id) {
      return false;
    }

    if (!titleHint) {
      return true;
    }

    const rowTitle = text(sheet.getRange(rowHint, 5).getDisplayValue());
    return !rowTitle || rowTitle === titleHint;
  }

  if (sheetType === 'vehicle') {
    const lastCol = sheet.getLastColumn();
    if (!lastCol || lastCol < 1) {
      return false;
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const headerMap = {};
    for (var h = 0; h < headers.length; h += 1) {
      headerMap[normalizeKey(headers[h])] = h + 1;
    }

    const idCol = headerMap[normalizeKey('ID')] || 1;
    const rowId = text(sheet.getRange(rowHint, idCol).getDisplayValue());
    if (rowId !== id) {
      return false;
    }

    if (!titleHint) {
      return true;
    }

    const titleCol = headerMap[normalizeKey('Service Description')] || 0;
    if (!titleCol) {
      return true;
    }

    const rowTitle = text(sheet.getRange(rowHint, titleCol).getDisplayValue());
    return !rowTitle || rowTitle === titleHint;
  }

  return false;
}

function findDeleteRowInTab(sheet, tabName, id, rowHint, titleHint) {
  const lastRow = sheet.getLastRow();
  if (!lastRow || lastRow < 2) {
    return NaN;
  }

  const sheetType = sheetTypeFromName(tabName);

  if (sheetType === 'home' || sheetType === 'repeating') {
    return findDeleteRowInFixedSheet(sheet, id, rowHint, titleHint);
  }

  if (sheetType === 'vehicle') {
    return findDeleteRowInVehicleSheet(sheet, id, rowHint, titleHint);
  }

  return NaN;
}

function findDeleteRowInFixedSheet(sheet, id, rowHint, titleHint) {
  const lastRow = sheet.getLastRow();
  if (Number.isFinite(rowHint) && rowHint >= 2 && rowHint <= lastRow) {
    const hintedId = text(sheet.getRange(rowHint, 1).getDisplayValue());
    if (hintedId && hintedId === id) {
      return rowHint;
    }
  }

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const normalizedTitleHint = text(titleHint);
  const titleValues = normalizedTitleHint
    ? sheet.getRange(2, 5, lastRow - 1, 1).getDisplayValues()
    : [];

  for (var i = 0; i < ids.length; i += 1) {
    const rowId = text(ids[i][0]);
    if (rowId !== id) {
      continue;
    }

    if (!normalizedTitleHint) {
      return i + 2;
    }

    const rowTitle = text(titleValues[i] && titleValues[i][0]);
    if (!rowTitle || rowTitle === normalizedTitleHint) {
      return i + 2;
    }
  }

  return NaN;
}

function findDeleteRowInVehicleSheet(sheet, id, rowHint, titleHint) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return NaN;
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerMap = {};
  for (var h = 0; h < headers.length; h += 1) {
    headerMap[normalizeKey(headers[h])] = h + 1;
  }

  const idCol = headerMap[normalizeKey('ID')] || 1;
  const titleCol = headerMap[normalizeKey('Service Description')] || 0;

  if (Number.isFinite(rowHint) && rowHint >= 2 && rowHint <= lastRow) {
    const hintedId = text(sheet.getRange(rowHint, idCol).getDisplayValue());
    if (hintedId && hintedId === id) {
      return rowHint;
    }
  }

  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getDisplayValues();
  const normalizedTitleHint = text(titleHint);
  const titleValues = (normalizedTitleHint && titleCol)
    ? sheet.getRange(2, titleCol, lastRow - 1, 1).getDisplayValues()
    : [];

  for (var i = 0; i < ids.length; i += 1) {
    const rowId = text(ids[i][0]);
    if (rowId !== id) {
      continue;
    }

    if (!normalizedTitleHint || !titleCol) {
      return i + 2;
    }

    const rowTitle = text(titleValues[i] && titleValues[i][0]);
    if (!rowTitle || rowTitle === normalizedTitleHint) {
      return i + 2;
    }
  }

  return NaN;
}

function updateFixedSchemaRow(sheet, project) {
  const metadata = project.metadata || {};
  var rowNumber = Number(metadata.sheetRowNumber);

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    rowNumber = Number(metadata.rownumber);
  }

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    rowNumber = Number(metadata._rowNumber);
  }

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    throw new Error('Missing or invalid metadata.sheetRowNumber for fixed-schema tab update.');
  }

  const originalTitle = text(metadata._originalTitle);
  const originalId = text(metadata._originalId || project.id);

  var existingValues = sheet.getRange(rowNumber, 1, 1, FIXED_HOME_HEADERS.length).getValues()[0] || [];
  var existingRow = rowValuesToObject(existingValues);

  if (!isFixedRowMatch(existingRow, originalTitle, originalId)) {
    const resolvedRow = findFixedSchemaRowNumber(sheet, project, originalTitle, originalId);
    if (!Number.isFinite(resolvedRow) || resolvedRow < 2) {
      throw new Error('Unable to verify target row for fixed-schema update. Refresh Projects and retry.');
    }

    rowNumber = resolvedRow;
    existingValues = sheet.getRange(rowNumber, 1, 1, FIXED_HOME_HEADERS.length).getValues()[0] || [];
    existingRow = rowValuesToObject(existingValues);
  }

  if (!isFixedRowMatch(existingRow, originalTitle, originalId)) {
    throw new Error('Target row fingerprint mismatch. Aborting update to prevent accidental duplicate writes.');
  }

  if (!text(existingRow['Task Description'])) {
    const existingRowId = text(existingRow['ID']);
    if (!(originalId && existingRowId && existingRowId === originalId)) {
      throw new Error('Refusing to overwrite an empty row without ID confirmation. Refresh Projects and retry.');
    }
  }

  logEvent('info', 'fixed_row_resolved', {
    sheetName: sheet.getName(),
    rowNumber: rowNumber,
    originalTitle: originalTitle,
    originalId: originalId,
  });

  const values = mapProjectToFixedSchema(project, existingRow);
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);

  return {
    rowNumber: rowNumber,
    updatedColumns: values.length,
  };
}

function repairProjectTitle(spreadsheet, body) {
  const source = text(body && body.source);
  const tabName = text(body && body.tabName) || sourceToTabName(source) || TAB_HOME;
  const sheet = resolveSheetByTabName(spreadsheet, tabName);
  if (!sheet) {
    throw new Error('Tab not found for repairProjectTitle: ' + tabName);
  }

  const resolvedTabName = text(sheet.getName());
  if (!(resolvedTabName === TAB_HOME || resolvedTabName === TAB_REPEATING || normalizeKey(resolvedTabName).indexOf('projectlista') >= 0 || normalizeKey(resolvedTabName).indexOf('projectlistc') >= 0)) {
    throw new Error('repairProjectTitle only supports fixed-schema tabs.');
  }

  const project = body && body.project ? body.project : {};
  const metadata = project.metadata || {};
  var rowNumber = Number(body && body.sheetRowNumber);
  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    rowNumber = Number(metadata.sheetRowNumber || metadata.rownumber || metadata._rownumber || 0);
  }

  const fallbackId = text(body && body.id || project.id || metadata._originalId);
  const fallbackTitle = text(body && body.title || project.title || metadata._originalTitle || metadata.property);
  const forceTitle = Boolean(body && body.forceTitle);

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    if (!fallbackId) {
      throw new Error('repairProjectTitle requires sheetRowNumber or id.');
    }

    rowNumber = findProjectRowById(sheet, fallbackId);
  }

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    throw new Error('Unable to locate row for repairProjectTitle.');
  }

  const existingValues = sheet.getRange(rowNumber, 1, 1, FIXED_HOME_HEADERS.length).getValues()[0] || [];
  const existingRow = rowValuesToObject(existingValues);
  const rowId = text(existingRow['ID']);
  if (fallbackId && rowId && rowId !== fallbackId) {
    throw new Error('repairProjectTitle row identity mismatch.');
  }

  const existingTitle = text(existingRow['Task Description']);
  if (existingTitle && existingTitle === fallbackTitle) {
    return {
      id: rowId || fallbackId,
      tabName: resolvedTabName,
      rowNumber: rowNumber,
    };
  }

  if (existingTitle && !forceTitle) {
    throw new Error('repairProjectTitle only repairs blank Task Description rows unless forceTitle=true.');
  }

  const updates = {
    1: rowId || fallbackId,
    2: text(body && body.clearProperty ? '' : chooseIncomingValue((project.property || metadata.property), existingRow['Property'])),
    3: chooseIncomingValue((project.area || metadata.area), existingRow['Area']),
    4: chooseValidatedValue(project.category, existingRow['Category']),
    5: fallbackTitle,
    6: chooseValidatedValue((project.priority || metadata.priority), existingRow['Priority']),
    7: chooseIncomingValue((project.order || metadata.order), existingRow['Order']),
    8: chooseIncomingValue((project.resourceLinks || metadata.resourceLinks), existingRow['ResourceLinks']),
    9: chooseIncomingValue((project.cost || metadata.actualCost || metadata.estimatedCost), existingRow['Cost ($)']),
    10: chooseValidatedValue(project.state, existingRow['State']),
    11: chooseIncomingValue((project.dateCompleted || metadata.dateCompleted), existingRow['Date Completed']),
  };

  Object.keys(updates).forEach(function (key) {
    const col = Number(key);
    if (!Number.isFinite(col) || col < 1) {
      return;
    }

    sheet.getRange(rowNumber, col).setValue(updates[key]);
  });

  return {
    id: rowId || fallbackId,
    tabName: resolvedTabName,
    rowNumber: rowNumber,
  };
}

function rowValuesToObject(values) {
  const row = {};

  for (var i = 0; i < FIXED_HOME_HEADERS.length; i += 1) {
    row[FIXED_HOME_HEADERS[i]] = text(values && values[i]);
  }

  return row;
}

function isPlaceholderValue(value) {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return true;
  }

  return normalized === 'unknown'
    || normalized === 'uncategorized'
    || normalized === 'none'
    || normalized === 'na'
    || normalized === 'null'
    || normalized === 'undefined';
}

function chooseIncomingValue(incomingValue, existingValue) {
  const incoming = text(incomingValue);
  if (!incoming) {
    return text(existingValue);
  }

  return incoming;
}

function chooseValidatedValue(incomingValue, existingValue) {
  const incoming = text(incomingValue);
  if (!incoming || isPlaceholderValue(incoming)) {
    return text(existingValue);
  }

  return incoming;
}

function isFixedRowMatch(existingRow, originalTitle, originalId) {
  const rowTitle = text(existingRow && existingRow['Task Description']);
  const rowId = text(existingRow && existingRow['ID']);

  // If we have a title fingerprint, require title equality. ID-only checks are too weak when duplicate IDs exist.
  if (originalTitle) {
    return rowTitle && rowTitle === originalTitle;
  }

  if (originalId && rowId && rowId === originalId) {
    return true;
  }

  return false;
}

function findFixedSchemaRowNumber(sheet, project, originalTitle, originalId) {
  const metadata = project.metadata || {};
  const targetProperty = text(metadata.property);
  const targetArea = text(metadata.area);
  const targetCategory = text(project.category);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return NaN;
  }

  const allRows = sheet.getRange(2, 1, lastRow - 1, FIXED_HOME_HEADERS.length).getValues();
  const matches = [];

  for (var i = 0; i < allRows.length; i += 1) {
    const rowNumber = i + 2;
    const row = rowValuesToObject(allRows[i]);
    const rowTitle = text(row['Task Description']);
    const rowId = text(row['ID']);

    if (!rowTitle && !rowId) {
      continue;
    }

    if (originalTitle && rowTitle !== originalTitle) {
      continue;
    }

    var score = 0;
    if (originalTitle && rowTitle === originalTitle) {
      score += 10;
    }

    if (originalId && rowId === originalId) {
      score += 4;
    }

    if (targetCategory && text(row['Category']) === targetCategory) {
      score += 2;
    }

    if (targetProperty && text(row['Property']) === targetProperty) {
      score += 2;
    }

    if (targetArea && text(row['Area']) === targetArea) {
      score += 2;
    }

    if (score > 0) {
      matches.push({ rowNumber: rowNumber, score: score, row: row });
    }
  }

  if (!matches.length) {
    return NaN;
  }

  matches.sort(function (a, b) {
    return b.score - a.score;
  });

  const best = matches[0];
  const second = matches.length > 1 ? matches[1] : null;

  // If top candidates tie, avoid guessing.
  if (second && second.score === best.score) {
    return NaN;
  }

  // Require at least a title match or a strong composite signal.
  if (best.score < 8) {
    return NaN;
  }

  return best.rowNumber;
}

function mapProjectToFixedSchema(project, existingRow) {
  const metadata = project.metadata || {};
  const shouldClearProperty = Boolean(metadata._clearProperty || metadata.clearProperty || project._clearProperty || project.clearProperty);

  const linksValue = Array.isArray(metadata.resourceLinks)
    ? JSON.stringify(metadata.resourceLinks)
    : text(metadata.resourceLinks);

  const costValue = metadata.actualCost != null
    ? metadata.actualCost
    : (metadata.estimatedCost != null ? metadata.estimatedCost : '');

  // Keep the sheet's existing ID stable to avoid accidental ID corruption on wrong-target writes.
  const idValue = text(existingRow && existingRow['ID']) || text(project.id);

  const rowObject = {
    'ID': idValue,
    'Property': shouldClearProperty ? '' : chooseIncomingValue(metadata.property, existingRow && existingRow['Property']),
    'Area': chooseIncomingValue(metadata.area, existingRow && existingRow['Area']),
    'Category': chooseValidatedValue(project.category, existingRow && existingRow['Category']),
    'Task Description': text(project.title),
    'Priority': chooseValidatedValue(metadata.priority, existingRow && existingRow['Priority']),
    'Order': chooseIncomingValue(metadata.order, existingRow && existingRow['Order']),
    'ResourceLinks': chooseIncomingValue(linksValue, existingRow && existingRow['ResourceLinks']),
    'Cost ($)': chooseIncomingValue(costValue, existingRow && existingRow['Cost ($)']),
    'State': chooseValidatedValue(project.state, existingRow && existingRow['State']),
    'Date Completed': chooseIncomingValue((metadata.dateCompleted || metadata.lastCompleted), existingRow && existingRow['Date Completed']),
  };

  return FIXED_HOME_HEADERS.map(function (header) {
    const value = rowObject[header];
    return value == null ? '' : value;
  });
}

function updateHeaderSchemaRow(sheet, project) {
  const metadata = project.metadata || {};
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (!values || values.length < 2) {
    throw new Error('Vehicle tab has no data rows.');
  }

  const headerRow = values[0].map(function (h) { return text(h); });
  const headerMap = {};

  for (var i = 0; i < headerRow.length; i += 1) {
    headerMap[normalizeKey(headerRow[i])] = i + 1;
  }

  var rowNumber = Number(metadata.sheetRowNumber);
  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    rowNumber = findVehicleRowNumber(values, project, headerMap);
  }

  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    throw new Error('Could not locate target row for vehicle tab update.');
  }

  const updates = mapProjectToHeaderUpdates(project);
  const keys = Object.keys(updates);

  keys.forEach(function (key) {
    const col = headerMap[normalizeKey(key)];
    if (!col) {
      return;
    }

    const value = updates[key];
    sheet.getRange(rowNumber, col).setValue(value == null ? '' : value);
  });

  return {
    rowNumber: rowNumber,
    updatedColumns: keys.length,
  };
}

function findVehicleRowNumber(values, project, headerMap) {
  const idCol = headerMap[normalizeKey('ID')];
  const serviceCol = headerMap[normalizeKey('Service Description')];
  const categoryCol = headerMap[normalizeKey('Category')];

  const projectId = text(project.id);
  const title = text(project.title);
  const category = text(project.category);

  for (var r = 1; r < values.length; r += 1) {
    const row = values[r];

    const rowId = idCol ? text(row[idCol - 1]) : '';
    const rowService = serviceCol ? text(row[serviceCol - 1]) : '';
    const rowCategory = categoryCol ? text(row[categoryCol - 1]) : '';

    if (projectId && rowId && rowId === projectId) {
      return r + 1;
    }

    if (title && rowService && title === rowService) {
      if (!category || !rowCategory || rowCategory === category) {
        return r + 1;
      }
    }
  }

  return NaN;
}

function mapProjectToHeaderUpdates(project) {
  const metadata = project.metadata || {};

  const linksValue = Array.isArray(metadata.resourceLinks)
    ? JSON.stringify(metadata.resourceLinks)
    : text(metadata.resourceLinks);

  return {
    'ID': text(project.id),
    'Vehicle/Small Engine': text(metadata.vehicle || metadata.asset),
    'State': text(project.state),
    'Category': text(project.category),
    'Date Completed': text(metadata.dateCompleted || metadata.lastCompleted),
    'Mileage': text(metadata.mileage),
    'Mechanic': text(metadata.mechanic),
    'Service Description': text(project.title),
    'Resource Links': linksValue,
    'Order': text(metadata.order),
    'Oil Change': text(metadata.oilChange),
    'Oil Filter': text(metadata.oilFilter),
    'Tire Rotation': text(metadata.tireRotation),
    'Wiper Blades': text(metadata.wiperBlades),
    'Battery': text(metadata.battery),
    'Spark Plugs': text(metadata.sparkPlugs),
    'ATF Fluid & Filter': text(metadata.atfFluidFilter),
    'P/S Fluid': text(metadata.psFluid),
    'Coolant': text(metadata.coolant),
    'Brake Fluid': text(metadata.brakeFluid),
    'Brake Pads': text(metadata.brakePads),
    'Front Diff': text(metadata.frontDiff),
    'Rear Diff': text(metadata.rearDiff),
    'Transfer Case': text(metadata.transferCase),
    'Fuel Filter': text(metadata.fuelFilter),
    'Air Filter': text(metadata.airFilter),
    'Cabin Filter': text(metadata.cabinFilter),
    'A/C Refrigerant': text(metadata.acRefrigerant),
    'MAF': text(metadata.maf),
    'Throttle Body': text(metadata.throttleBody),
  };
}
