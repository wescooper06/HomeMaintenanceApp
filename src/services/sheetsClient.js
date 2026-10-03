// Google Sheets API client (Option B + Hybrid updates)
// Tabs: Trips, Workflow Metadata, Resources, Checklists, Itinerary, Month Constraints

// TODO: Replace with your actual API key
const API_KEY = "AIzaSyBAP6wmXzMCOwiuhPk3heN4_dFDjzubhAg";

// Your confirmed Sheet ID
const SHEET_ID = "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k";

const SHEETS_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const VALUES_BASE = `${SHEETS_BASE}/values`;
const BATCH_UPDATE_URL = `${SHEETS_BASE}:batchUpdate`;

// ---------- Helpers ----------

async function fetchSheetValues(sheetName) {
  const response = await fetch(`${VALUES_BASE}/${encodeURIComponent(sheetName)}?key=${API_KEY}`);
  const data = await response.json();
  const rows = data.values || [];
  const headers = rows.shift() || [];
  return { headers, rows };
}

function findRowIndexByKey(rows, headers, keyName, keyValue) {
  const keyIndex = headers.indexOf(keyName);
  if (keyIndex === -1) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][keyIndex] === keyValue) {
      // +2 because rows[0] is data row 2 in the sheet (row 1 is headers)
      return i + 2;
    }
  }
  return null;
}

function buildRowFromObject(headers, obj) {
  return headers.map(h => obj[h] ?? "");
}

async function batchUpdateRow(range, values) {
  const body = {
    valueInputOption: "RAW",
    data: [
      {
        range,
        majorDimension: "ROWS",
        values: [values]
      }
    ]
  };

  const response = await fetch(`${BATCH_UPDATE_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return response.json();
}

// ---------- Trips ----------

export async function getTrips() {
  const { headers, rows } = await fetchSheetValues("Trips");
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// Auto-generate tripId for new trips (Option C)
export async function addTrip(trip) {
  const tripId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const fullTrip = { ...trip, tripId };

  // Column order: tripId, destination, startDate, endDate, tripType,
  // status, priorityRank, timelineMonth, timelineYear, notes
  const values = [
    fullTrip.tripId,
    fullTrip.destination,
    fullTrip.startDate,
    fullTrip.endDate,
    fullTrip.tripType,
    fullTrip.status,
    fullTrip.priorityRank,
    fullTrip.timelineMonth,
    fullTrip.timelineYear,
    fullTrip.notes
  ];

  const body = {
    values: [values]
  };

  const response = await fetch(
    `${VALUES_BASE}/Trips:append?valueInputOption=RAW&key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();
  return { tripId, result };
}

export async function updateTrip(tripId, updates) {
  const { headers, rows } = await fetchSheetValues("Trips");
  const rowNumber = findRowIndexByKey(rows, headers, "tripId", tripId);
  if (!rowNumber) {
    throw new Error(`Trip with tripId=${tripId} not found`);
  }

  // Build existing object
  const existingRow = rows[rowNumber - 2]; // -2 to map back into rows[]
  const existingObj = {};
  headers.forEach((header, index) => {
    existingObj[header] = existingRow[index];
  });

  const updatedObj = { ...existingObj, ...updates };
  const values = buildRowFromObject(headers, updatedObj);

  const range = `Trips!A${rowNumber}:J${rowNumber}`;
  return batchUpdateRow(range, values);
}

// ---------- Workflow Metadata ----------

export async function getWorkflow(tripId) {
  const { headers, rows } = await fetchSheetValues("Workflow Metadata");
  const rowNumber = findRowIndexByKey(rows, headers, "tripId", tripId);
  if (!rowNumber) return null;

  const row = rows[rowNumber - 2];
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index];
  });
  return obj;
}

export async function updateWorkflow(tripId, updates) {
  const { headers, rows } = await fetchSheetValues("Workflow Metadata");
  const rowNumber = findRowIndexByKey(rows, headers, "tripId", tripId);
  if (!rowNumber) {
    throw new Error(`Workflow row for tripId=${tripId} not found`);
  }

  const existingRow = rows[rowNumber - 2];
  const existingObj = {};
  headers.forEach((header, index) => {
    existingObj[header] = existingRow[index];
  });

  const updatedObj = { ...existingObj, ...updates };
  const values = buildRowFromObject(headers, updatedObj);

  const range = `Workflow Metadata!A${rowNumber}:E${rowNumber}`;
  return batchUpdateRow(range, values);
}

// ---------- Resources ----------

export async function getResources(tripId) {
  const { headers, rows } = await fetchSheetValues("Resources");
  const tripIdIndex = headers.indexOf("tripId");
  if (tripIdIndex === -1) return [];

  return rows
    .filter(row => row[tripIdIndex] === tripId)
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
}

export async function addResource(resource) {
  // Column order: tripId, url, title, type, notes
  const values = [
    resource.tripId,
    resource.url,
    resource.title,
    resource.type,
    resource.notes
  ];

  const body = { values: [values] };

  const response = await fetch(
    `${VALUES_BASE}/Resources:append?valueInputOption=RAW&key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  return response.json();
}

// ---------- Checklists ----------

export async function getChecklists(tripId) {
  const { headers, rows } = await fetchSheetValues("Checklists");
  const tripIdIndex = headers.indexOf("tripId");
  if (tripIdIndex === -1) return [];

  return rows
    .filter(row => row[tripIdIndex] === tripId)
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
}

export async function updateChecklist(tripId, updates) {
  const { headers, rows } = await fetchSheetValues("Checklists");
  const rowNumber = findRowIndexByKey(rows, headers, "tripId", tripId);
  if (!rowNumber) {
    throw new Error(`Checklist row for tripId=${tripId} not found`);
  }

  const existingRow = rows[rowNumber - 2];
  const existingObj = {};
  headers.forEach((header, index) => {
    existingObj[header] = existingRow[index];
  });

  const updatedObj = { ...existingObj, ...updates };
  const values = buildRowFromObject(headers, updatedObj);

  const range = `Checklists!A${rowNumber}:D${rowNumber}`;
  return batchUpdateRow(range, values);
}

// ---------- Itinerary ----------

export async function getItinerary(tripId) {
  const { headers, rows } = await fetchSheetValues("Itinerary");
  const tripIdIndex = headers.indexOf("tripId");
  if (tripIdIndex === -1) return [];

  return rows
    .filter(row => row[tripIdIndex] === tripId)
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
}

export async function addItineraryItem(item) {
  // Column order: tripId, date, startTime, endTime, activity,
  // location, confirmation, notes
  const values = [
    item.tripId,
    item.date,
    item.startTime,
    item.endTime,
    item.activity,
    item.location,
    item.confirmation,
    item.notes
  ];

  const body = { values: [values] };

  const response = await fetch(
    `${VALUES_BASE}/Itinerary:append?valueInputOption=RAW&key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  return response.json();
}

// ---------- Month Constraints ----------

export async function getMonthConstraints() {
  const { headers, rows } = await fetchSheetValues("Month Constraints");
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}
