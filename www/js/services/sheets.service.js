(function () {
  const SPREADSHEET_ID = "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k";
  const APP_CONFIG = window.APP_CONFIG || {};
  const GOOGLE_SHEETS_API_KEY = (APP_CONFIG.GOOGLE_SHEETS_API_KEY || "").trim();

  const TABS = {
    home: "Project List_A (Home Maintenance)",
    vehicle: "Project List_B (Vehicle/Small Engine)",
    repeating: "Project List_C (Repeating Household)",
  };

  function sanitizeHeader(value, index) {
    const text = String(value == null ? "" : value).trim();
    return text || `Column_${index + 1}`;
  }

  function cleanCell(value) {
    if (value == null) {
      return "";
    }

    return String(value).replace(/^\uFEFF/, "").trim();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i += 1;
        }

        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) {
      return {
        headers: [],
        records: [],
      };
    }

    const headerRow = rows[0];
    const headers = headerRow.map((header, index) => sanitizeHeader(cleanCell(header), index));
    const records = [];

    for (let i = 1; i < rows.length; i += 1) {
      const rawRow = rows[i];

      if (!rawRow || rawRow.every((cell) => cleanCell(cell) === "")) {
        continue;
      }

      const rowObject = {};

      for (let j = 0; j < headers.length; j += 1) {
        rowObject[headers[j]] = cleanCell(rawRow[j]);
      }

      records.push(rowObject);
    }

    return {
      headers,
      records,
    };
  }

  function rowsToObjectsWithHeaders(rows, headers) {
    const cleanedHeaders = headers.map((header, index) => sanitizeHeader(header, index));
    const records = [];

    for (let i = 0; i < rows.length; i += 1) {
      const rawRow = rows[i];

      if (!rawRow || rawRow.every((cell) => cleanCell(cell) === "")) {
        continue;
      }

      const rowObject = {};

      for (let j = 0; j < cleanedHeaders.length; j += 1) {
        rowObject[cleanedHeaders[j]] = cleanCell(rawRow[j]);
      }

      records.push(rowObject);
    }

    return {
      headers: cleanedHeaders,
      records,
    };
  }

  async function fetchWithDiagnostics(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const shortBody = cleanCell(bodyText).slice(0, 160);

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Google Sheet access denied (401/403). Make the sheet readable by your app (publish/share) or use an authenticated server proxy."
        );
      }

      throw new Error(`Google Sheet request failed (${response.status}). ${shortBody}`);
    }

    return response;
  }

  function valuesToObjects(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return {
        headers: [],
        records: [],
      };
    }

    const headers = (values[0] || []).map((header, index) => sanitizeHeader(cleanCell(header), index));
    const records = [];

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i] || [];
      if (row.every((cell) => cleanCell(cell) === "")) {
        continue;
      }

      const record = {};
      for (let j = 0; j < headers.length; j += 1) {
        record[headers[j]] = cleanCell(row[j]);
      }

      records.push(record);
    }

    return {
      headers,
      records,
    };
  }

  async function fetchTabViaCsv(tabName) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
    url.searchParams.set("sheet", tabName);
    url.searchParams.set("tqx", "out:csv");

    const response = await fetchWithDiagnostics(url.toString());
    const csvText = await response.text();
    return rowsToObjects(parseCsv(csvText));
  }

  async function fetchTabViaCsvWithFixedSchema(tabName, headers) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
    url.searchParams.set("sheet", tabName);
    url.searchParams.set("tqx", "out:csv");

    const response = await fetchWithDiagnostics(url.toString());
    const csvText = await response.text();
    const rows = parseCsv(csvText);

    return rowsToObjectsWithHeaders(rows.slice(1), headers);
  }

  async function fetchTabViaApi(tabName) {
    const range = `'${tabName.replace(/'/g, "''")}'!A:ZZ`;
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`);
    url.searchParams.set("key", GOOGLE_SHEETS_API_KEY);

    const response = await fetchWithDiagnostics(url.toString());
    const payload = await response.json();
    return valuesToObjects(payload.values || []);
  }

  async function fetchTab(tabName) {
    let parsed;

    try {
      if (tabName === TABS.home || tabName === TABS.repeating) {
        const fixedHeaders = [
          "ID",
          "Property",
          "Area",
          "Category",
          "Task Description",
          "Priority",
          "Order",
          "ResourceLinks",
          "Cost ($)",
          "State",
          "Date Completed",
        ];

        parsed = await fetchTabViaCsvWithFixedSchema(tabName, fixedHeaders);
      } else {
        parsed = GOOGLE_SHEETS_API_KEY ? await fetchTabViaApi(tabName) : await fetchTabViaCsv(tabName);
      }
    } catch (error) {
      throw new Error(`Failed to load \"${tabName}\": ${error.message}`);
    }

    return {
      spreadsheetId: SPREADSHEET_ID,
      tabName,
      headers: parsed.headers,
      rows: parsed.records,
    };
  }

  function fetchHomeSheet() {
    return fetchTab(TABS.home);
  }

  function fetchVehicleSheet() {
    return fetchTab(TABS.vehicle);
  }

  function fetchRepeatingSheet() {
    return fetchTab(TABS.repeating);
  }

  async function fetchAllSheets() {
    const [home, vehicle, repeating] = await Promise.all([
      fetchHomeSheet(),
      fetchVehicleSheet(),
      fetchRepeatingSheet(),
    ]);

    return {
      home,
      vehicle,
      repeating,
    };
  }

  window.SheetsService = {
    SPREADSHEET_ID,
    TABS,
    fetchTab,
    fetchHomeSheet,
    fetchVehicleSheet,
    fetchRepeatingSheet,
    fetchAllSheets,
  };
})();
