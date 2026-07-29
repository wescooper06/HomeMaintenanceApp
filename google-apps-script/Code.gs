const TAB_HOME = 'Project List_A (Home Maintenance)';
const TAB_VEHICLE = 'Project List_B (Vehicle/Small Engine)';
const TAB_REPEATING = 'Project List_C (Repeating Household)';
const SCRIPT_VERSION = '20260728-4';

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

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'home-maintenance-sheet-writer',
    version: SCRIPT_VERSION,
    methods: ['POST'],
  });
}

function doPost(e) {
  const requestId = makeRequestId();

  try {
    const bodyText = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(bodyText);

    const spreadsheetId = text(body.spreadsheetId);
    const tabName = text(body.tabName);
    const project = body.project || {};

    logEvent('info', 'save_request_received', {
      requestId: requestId,
      spreadsheetId: spreadsheetId,
      tabName: tabName,
      projectId: text(project.id),
      source: text(project.source),
    });

    if (!spreadsheetId) {
      throw new Error('Missing spreadsheetId');
    }

    if (!tabName) {
      throw new Error('Missing tabName');
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(tabName);

    if (!sheet) {
      throw new Error('Tab not found: ' + tabName);
    }

    if (tabName === TAB_HOME || tabName === TAB_REPEATING) {
      const result = updateFixedSchemaRow(sheet, project);
      logEvent('info', 'save_request_success', {
        requestId: requestId,
        mode: 'fixed-schema',
        rowNumber: result.rowNumber,
        updatedColumns: result.updatedColumns,
      });
      return jsonResponse({ ok: true, requestId: requestId, version: SCRIPT_VERSION, mode: 'fixed-schema', ...result });
    }

    if (tabName === TAB_VEHICLE) {
      const result = updateHeaderSchemaRow(sheet, project);
      logEvent('info', 'save_request_success', {
        requestId: requestId,
        mode: 'header-schema',
        rowNumber: result.rowNumber,
        updatedColumns: result.updatedColumns,
      });
      return jsonResponse({ ok: true, requestId: requestId, version: SCRIPT_VERSION, mode: 'header-schema', ...result });
    }

    throw new Error('Unsupported tab: ' + tabName);
  } catch (error) {
    logEvent('error', 'save_request_failed', {
      requestId: requestId,
      error: String(error && error.message ? error.message : error),
      stack: String(error && error.stack ? error.stack : ''),
    });
    return jsonResponse({ ok: false, requestId: requestId, version: SCRIPT_VERSION, error: String(error && error.message ? error.message : error) });
  }
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

  const originalTitle = text(metadata._originalTitle || project.title);
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
    throw new Error('Refusing to overwrite an empty row. Refresh Projects and retry.');
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

function rowValuesToObject(values) {
  const row = {};

  for (var i = 0; i < FIXED_HOME_HEADERS.length; i += 1) {
    row[FIXED_HOME_HEADERS[i]] = text(values && values[i]);
  }

  return row;
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
    'Property': text(metadata.property),
    'Area': text(metadata.area),
    'Category': text(project.category),
    'Task Description': text(project.title),
    'Priority': text(metadata.priority),
    'Order': text(metadata.order),
    'ResourceLinks': linksValue,
    'Cost ($)': costValue,
    'State': text(project.state),
    'Date Completed': text(metadata.dateCompleted || metadata.lastCompleted),
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
