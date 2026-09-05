// Lightweight, dependency-free tests for the Project List_D (Miscellaneous) sheet support.
// Run with: node tests/misc-sheet.test.js
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok   - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(`       ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Load Code.gs in a sandbox and pull out the pure functions we want to test.
// Code.gs only calls Google Apps Script globals (SpreadsheetApp, etc.) inside
// function bodies, never at top level, so it can be loaded without a real
// Apps Script runtime as long as we never invoke functions that touch those
// globals directly (SpreadsheetApp/ContentService/etc).
// ---------------------------------------------------------------------------
function loadCodeGs() {
  const source = fs.readFileSync(path.join(__dirname, "..", "google-apps-script", "Code.gs"), "utf8");
  const exportedNames = [
    "TAB_HOME", "TAB_VEHICLE", "TAB_REPEATING", "TAB_MISC",
    "FIXED_HOME_HEADERS", "FIXED_MISC_HEADERS", "SHEET_PREFIX",
    "text", "normalizeKey", "generateNextId",
    "sourceToTabName", "sheetTypeFromName",
    "updateMiscSchemaRow", "findMiscRowNumber", "mapProjectToMiscUpdates",
    "extractDropdownsForTab", "collectDropdownValuesFromColumn",
  ];
  const body = `${source}\nreturn { ${exportedNames.join(", ")} };`;
  // Stub the Apps Script globals referenced only inside function bodies we won't call.
  const stubGlobals = {
    SpreadsheetApp: { DataValidationCriteria: { VALUE_IN_LIST: "VALUE_IN_LIST", VALUE_IN_RANGE: "VALUE_IN_RANGE" } },
    ContentService: {},
    Utilities: {},
    PropertiesService: {},
    MailApp: {},
    ScriptApp: {},
    Logger: { log: () => {} },
    console,
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function(...Object.keys(stubGlobals), body);
  return factory(...Object.values(stubGlobals));
}

// A minimal fake "Sheet" object supporting only what updateMiscSchemaRow needs.
function makeFakeMiscSheet(rows) {
  const headerRow = ["ID", "Category", "Title", "Priority", "Order", "ResourceLinks", "State"];
  const dataRows = [headerRow, ...rows];
  const setValueCalls = [];

  return {
    getDataRange() {
      return { getValues: () => dataRows };
    },
    getRange(row, col) {
      return {
        setValue(value) {
          setValueCalls.push({ row, col, value });
        },
      };
    },
    _setValueCalls: setValueCalls,
  };
}

// A minimal fake "Sheet" object supporting generateNextId's getDataRange().getValues() usage.
function makeFakeIdSheet(headerRow, rows) {
  return {
    getDataRange() {
      return { getValues: () => [headerRow, ...rows] };
    },
  };
}

const gs = loadCodeGs();

// ---------------------------------------------------------------------------
// Front-end unified project model tests (projects.service.js + sheets.service.js).
// These files attach to `window`, so provide a minimal browser-like stub.
// ---------------------------------------------------------------------------
function loadFrontEndServices() {
  global.window = global.window || {};
  global.window.APP_CONFIG = { GOOGLE_SHEETS_WRITE_URL: "https://example.com/write" };

  const sheetsSrc = fs.readFileSync(path.join(__dirname, "..", "www", "js", "services", "sheets.service.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "fetch", `${sheetsSrc}\n//# sourceURL=sheets.service.js`)(global.window, {}, () => {});

  const projectsSrc = fs.readFileSync(path.join(__dirname, "..", "www", "js", "services", "projects.service.js"), "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", `${projectsSrc}\n//# sourceURL=projects.service.js`)(global.window);

  return { SheetsService: global.window.SheetsService, ProjectsService: global.window.ProjectsService };
}

const { SheetsService, ProjectsService } = loadFrontEndServices();

function withStubbedMiscFetch(rows, fn) {
  const original = SheetsService.fetchMiscSheet;
  const originalHome = SheetsService.fetchHomeSheet;
  const originalVehicle = SheetsService.fetchVehicleSheet;
  const originalRepeating = SheetsService.fetchRepeatingSheet;
  SheetsService.fetchMiscSheet = async () => ({ rows });
  SheetsService.fetchHomeSheet = async () => ({ rows: [] });
  SheetsService.fetchVehicleSheet = async () => ({ rows: [] });
  SheetsService.fetchRepeatingSheet = async () => ({ rows: [] });
  return fn().finally(() => {
    SheetsService.fetchMiscSheet = original;
    SheetsService.fetchHomeSheet = originalHome;
    SheetsService.fetchVehicleSheet = originalVehicle;
    SheetsService.fetchRepeatingSheet = originalRepeating;
  });
}

async function main() {
  // 1. Reading from TAB_MISC
  await test("sourceToTabName resolves misc/list_d sources to TAB_MISC", () => {
    assert.strictEqual(gs.sourceToTabName("misc"), gs.TAB_MISC);
    assert.strictEqual(gs.sourceToTabName("Project List_D"), gs.TAB_MISC);
  });

  await test("sheetTypeFromName resolves the misc sheet name to 'misc'", () => {
    assert.strictEqual(gs.sheetTypeFromName(gs.TAB_MISC), "misc");
  });

  // 2. Writing to TAB_MISC
  await test("mapProjectToMiscUpdates maps project fields onto FIXED_MISC_HEADERS columns", () => {
    const updates = gs.mapProjectToMiscUpdates({
      id: "7",
      title: "Renew passport",
      category: "Travel",
      state: "Not Started",
      metadata: { priority: "High", order: "2", resourceLinks: ["https://example.com"] },
    });

    assert.strictEqual(updates.ID, "7");
    assert.strictEqual(updates.Category, "Travel");
    assert.strictEqual(updates.Title, "Renew passport");
    assert.strictEqual(updates.Priority, "High");
    assert.strictEqual(updates.Order, "2");
    assert.strictEqual(updates.ResourceLinks, JSON.stringify(["https://example.com"]));
    assert.strictEqual(updates.State, "Not Started");
  });

  // Prefixed ID generation: PA/PB/PC/PD, no cross-sheet collisions, increments correctly
  await test("generateNextId assigns PA0001/PB0001/PC0001/PD0001 for empty sheets", () => {
    const headerRow = ["ID", "Title"];
    assert.strictEqual(gs.generateNextId(gs.TAB_HOME, makeFakeIdSheet(headerRow, [])), "PA0001");
    assert.strictEqual(gs.generateNextId(gs.TAB_VEHICLE, makeFakeIdSheet(headerRow, [])), "PB0001");
    assert.strictEqual(gs.generateNextId(gs.TAB_REPEATING, makeFakeIdSheet(headerRow, [])), "PC0001");
    assert.strictEqual(gs.generateNextId(gs.TAB_MISC, makeFakeIdSheet(headerRow, [])), "PD0001");
  });

  await test("generateNextId increments from the highest existing numeric suffix under its own prefix", () => {
    const headerRow = ["ID", "Title"];
    const rows = [["PD0001", "a"], ["PD0007", "b"], ["PD0003", "c"]];
    assert.strictEqual(gs.generateNextId(gs.TAB_MISC, makeFakeIdSheet(headerRow, rows)), "PD0008");
  });

  await test("generateNextId ignores other sheets' prefixes (no cross-sheet ID collisions)", () => {
    const headerRow = ["ID", "Title"];
    const rows = [["PA0099", "home row"], ["PD0002", "misc row"]];
    assert.strictEqual(gs.generateNextId(gs.TAB_MISC, makeFakeIdSheet(headerRow, rows)), "PD0003");
    assert.strictEqual(gs.generateNextId(gs.TAB_HOME, makeFakeIdSheet(headerRow, rows)), "PA0100");
  });

  await test("updateMiscSchemaRow locates the row by ID and writes updated columns", () => {
    const sheet = makeFakeMiscSheet([
      ["1", "Family", "Plan reunion", "Medium", "1", "", "In Progress"],
      ["2", "SAR", "Renew certification", "High", "2", "", "Not Started"],
    ]);

    const result = gs.updateMiscSchemaRow(sheet, {
      id: "2",
      title: "Renew certification",
      category: "SAR",
      state: "Completed",
      metadata: {},
    });

    assert.strictEqual(result.rowNumber, 3);
    const stateCall = sheet._setValueCalls.find((call) => call.row === 3 && call.value === "Completed");
    assert.ok(stateCall, "expected State column to be updated to Completed");
  });

  // 3. Category dropdown loading from sheet (reads data validation, not hard-coded values)
  await test("extractDropdownsForTab reads categories from column data validation", () => {
    const validationRule = {
      getCriteriaType: () => "VALUE_IN_LIST",
      getCriteriaValues: () => [["SAR", "Travel", "Family", "Miscellaneous"]],
    };

    const fakeSheet = {
      getLastColumn: () => 2,
      getLastRow: () => 3,
      getMaxRows: () => 3,
      getRange(row, col, numRows, numCols) {
        if (numCols > 1) {
          return { getDisplayValues: () => [["ID", "Category"]] };
        }
        return {
          getDisplayValues: () => Array.from({ length: numRows }, () => [""]),
          getDataValidations: () => Array.from({ length: numRows }, (_, index) => [index === 0 ? validationRule : null]),
        };
      },
    };

    const fakeSpreadsheet = { getSheetByName: () => fakeSheet, getSheets: () => [fakeSheet] };
    const result = gs.extractDropdownsForTab(fakeSpreadsheet, gs.TAB_MISC, { category: ["Category"] });
    assert.deepStrictEqual(result.category.sort(), ["Family", "Miscellaneous", "SAR", "Travel"]);
  });

  // 4. Unified project list includes misc projects / 6. ResourceLinks parsing works
  await test("loadAllProjects merges misc rows into the unified list with parsed resourceLinks", () => withStubbedMiscFetch(
    [{ ID: "9", Category: "Travel", Title: "Book flights", Priority: "High", Order: "1", ResourceLinks: "https://a.example.com, https://b.example.com", State: "Not Started", _rowNumber: 2 }],
    async () => {
      const projects = await ProjectsService.loadAllProjects();
      const miscProject = projects.find((project) => project.source === "Project List_D");
      assert.ok(miscProject, "expected unified project list to include a Project List_D entry");
      assert.strictEqual(miscProject.title, "Book flights");
      assert.strictEqual(miscProject.category, "Travel");
      assert.deepStrictEqual(miscProject.resourceLinks, ["https://a.example.com", "https://b.example.com"]);
    }
  ));

  // 5. Add Project modal routes correctly (explicit source, and category-based auto-routing)
  await test("createProject routes explicit + category-based misc submissions to TAB_MISC", async () => {
    const originalCreate = SheetsService.createProject;
    const originalNextId = SheetsService.getNextProjectId;
    const calls = [];
    SheetsService.createProject = async (payload) => {
      calls.push(payload);
      return { ok: true, id: payload.id, tabName: payload.tabName, rowNumber: 5 };
    };
    SheetsService.getNextProjectId = async () => 42;

    try {
      await ProjectsService.createProject({ title: "Plan trip", source: "misc", category: "Travel", state: "Not Started" });
      await ProjectsService.createProject({ title: "Family reunion", category: "Family" });

      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0].tabName, SheetsService.TABS.misc);
      assert.strictEqual(calls[0].fields.Category, "Travel");
      assert.strictEqual(calls[1].tabName, SheetsService.TABS.misc);
      assert.strictEqual(calls[1].fields.Category, "Family");
    } finally {
      SheetsService.createProject = originalCreate;
      SheetsService.getNextProjectId = originalNextId;
    }
  });

  // 7. Filters show misc projects (sourceKey drives the filter grouping counts)
  await test("sourceKey groups Project List_D under the 'misc' filter bucket", () => withStubbedMiscFetch(
    [{ ID: "1", Category: "SAR", Title: "Recert", Priority: "", Order: "", ResourceLinks: "", State: "Active", _rowNumber: 2 }],
    async () => {
      await ProjectsService.loadAllProjects();
      assert.strictEqual(ProjectsService.lastLoadStats.effective.misc, 1);
    }
  ));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
