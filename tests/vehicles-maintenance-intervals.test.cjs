const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "services", "vehiclesMaintenanceIntervalEngine.js");
const loadEngine = () => {
  const source = fs.readFileSync(sourcePath, "utf8").replace(/^export /gm, "");
  return vm.runInNewContext(`(() => { ${source}
    return { addMonthsClampedToDate, calculateMaintenanceInterval, parseDateOnly };
  })()`);
};
const engine = loadEngine();
const plain = (value) => JSON.parse(JSON.stringify(value));
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

const assetId = "synthetic-asset-00000000000000000000000000000001";
const maintenanceItemId = "synthetic-item-00000000000000000000000000000001";
const record = (id, service_date, usage_reading_unit, usage_reading_value, items, other = {}) => ({
  id,
  service_date,
  usage_reading_unit,
  usage_reading_value,
  items,
  ...other,
});
const captured = (id = maintenanceItemId, is_performed = true, other = {}) => ({
  maintenance_item_id: id,
  is_performed,
  ...other,
});
const request = (ongoingRecords = [], interval_unit = "miles", interval_value = 5000, other = {}) => ({
  asset: { id: assetId, usage_unit: "miles" },
  maintenanceItem: { id: maintenanceItemId, display_name: "Synthetic Oil Change" },
  interval: { maintenance_item_id: maintenanceItemId, interval_unit, interval_value },
  ongoingRecords,
  ...other,
});
const usageSuccess = (source, value, unit) => ({
  lastService: {
    recordId: source.id,
    serviceDate: source.service_date,
    usageReadingValue: source.usage_reading_value,
    usageReadingUnit: source.usage_reading_unit,
  },
  nextService: { kind: "usage", value, unit },
  notCalculatedReason: null,
});
const notCalculated = (reason) => ({
  lastService: null,
  nextService: null,
  notCalculatedReason: reason,
});

test("date-only Gregorian month addition handles standard, leap, month-end, and multi-year dates", () => {
  const cases = [
    ["2025-05-10", 1, "2025-06-10"],
    ["2025-01-31", 1, "2025-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2025-03-31", 1, "2025-04-30"],
    ["2025-12-31", 2, "2026-02-28"],
    ["2023-12-31", 2, "2024-02-29"],
    ["2025-01-31", 36, "2028-01-31"],
    ["2025-01-30", 1, "2025-02-28"],
  ];
  for (const [date, months, expected] of cases) {
    assert.equal(engine.addMonthsClampedToDate(date, months), expected, `${date} + ${months}`);
  }
  assert.deepEqual(plain(engine.parseDateOnly("2024-02-29")), { year: 2024, month: 2, day: 29 });
  assert.throws(() => engine.parseDateOnly("2025-02-30"), /valid canonical date/);
  assert.throws(() => engine.parseDateOnly("2025-2-03"), /valid canonical date/);
  assert.throws(() => engine.parseDateOnly("0000-01-01"), /valid canonical date/);
});

test("date-only month results are timezone-independent and remain ISO strings", () => {
  const code = `const fs = require("node:fs");
    const vm = require("node:vm");
    const source = fs.readFileSync(${JSON.stringify(sourcePath)}, "utf8").replace(/^export /gm, "");
    const { addMonthsClampedToDate } = vm.runInNewContext(
      "(() => { " + source + "; return { addMonthsClampedToDate }; })()"
    );
    process.stdout.write(addMonthsClampedToDate("2025-12-31", 2));`;
  for (const timezone of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
    const child = spawnSync(process.execPath, ["-e", code], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, TZ: timezone },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "2026-02-28");
  }
  assert.equal(typeof engine.addMonthsClampedToDate("2025-12-31", 2), "string");
});

test("month arithmetic rejects non-positive, fractional, non-finite, and coerced month counts", () => {
  for (const months of [0, -1, 1.5, NaN, Infinity, -Infinity, "1"]) {
    assert.throws(() => engine.addMonthsClampedToDate("2025-01-01", months), /positive whole number/);
  }
});

test("latest qualifying snapshot wins independent of array order and stable ID only", () => {
  const older = record("synthetic-record-old", "2024-01-01", "miles", 100, [
    captured(maintenanceItemId, true, { displayNameSnapshot: "Old label", groupSnapshot: "Old group" }),
  ]);
  const newer = record("synthetic-record-new", "2025-02-03", "miles", 200, [
    captured("synthetic-item-different-id", true, { displayNameSnapshot: "Synthetic Oil Change" }),
    captured(maintenanceItemId, true, { displayNameSnapshot: "Renamed item", groupSnapshot: "New group" }),
  ]);
  const expected = usageSuccess(newer, 5200, "miles");
  const first = request([older, newer]);
  const reversed = request([newer, older]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(first)), expected);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(reversed)), expected);
});

test("false, absent, and different-ID snapshots do not qualify; empty history has a stable reason", () => {
  const candidates = [
    record("synthetic-record-false", "2025-03-01", "miles", 300, [captured(maintenanceItemId, false)]),
    record("synthetic-record-absent", "2025-04-01", "miles", 400, [captured("synthetic-other-id", true)]),
    record("synthetic-record-empty", "2025-05-01", "miles", 500, []),
  ];
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request(candidates))),
    notCalculated("no_qualifying_service"));
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([]))),
    notCalculated("no_qualifying_service"));
});

test("archived or unavailable current catalog state does not invalidate a captured true state", () => {
  const source = record("synthetic-record-archived", "2025-06-01", "miles", 20, [
    captured(maintenanceItemId, true, { displayNameSnapshot: "Historical Oil Change", groupSnapshot: "Engine" }),
  ]);
  const input = request([source]);
  input.maintenanceItem = { id: maintenanceItemId, archived: true, available_for_asset: false };
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(input)), usageSuccess(source, 5020, "miles"));
});

test("Miles calculations use the latest qualifying stored reading, including decimals and zero", () => {
  const latest = record("synthetic-miles", "2025-11-02", "miles", 99955, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([latest], "miles", 5000))),
    usageSuccess(latest, 104955, "miles"));

  const decimal = record("synthetic-miles-decimal", "2025-11-03", "miles", 123.45, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([decimal], "miles", 5.25))),
    usageSuccess(decimal, 128.7, "miles"));

  const zero = record("synthetic-miles-zero", "2025-11-04", "miles", 0, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([zero], "miles", 10))),
    usageSuccess(zero, 10, "miles"));
});

test("Miles use an authoritative mismatched or missing latest reading without fallback", () => {
  const older = record("synthetic-old-miles", "2025-01-01", "miles", 100, [captured()]);
  const latestMismatch = record("synthetic-new-hours", "2025-02-01", "hours", 20, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([latestMismatch, older], "miles", 500))),
    {
      lastService: {
        recordId: latestMismatch.id,
        serviceDate: latestMismatch.service_date,
        usageReadingValue: latestMismatch.usage_reading_value,
        usageReadingUnit: latestMismatch.usage_reading_unit,
      },
      nextService: null,
      notCalculatedReason: "usage_unit_mismatch",
    });

  const latestMissing = record("synthetic-new-missing-miles", "2025-03-01", "miles", null, [captured()]);
  const result = plain(engine.calculateMaintenanceInterval(request([older, latestMissing], "miles", 500)));
  assert.equal(result.lastService.recordId, latestMissing.id);
  assert.equal(result.nextService, null);
  assert.equal(result.notCalculatedReason, "usage_reading_missing");
});

test("Hours calculations use the latest qualifying stored reading, including decimals and zero", () => {
  const latest = record("synthetic-hours", "2026-05-10", "hours", 220, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([latest], "hours", 50))),
    usageSuccess(latest, 270, "hours"));

  const decimal = record("synthetic-hours-decimal", "2026-05-11", "hours", 10.25, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([decimal], "hours", 0.5))),
    usageSuccess(decimal, 10.75, "hours"));

  const zero = record("synthetic-hours-zero", "2026-05-12", "hours", 0, [captured()]);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([zero], "hours", 2))),
    usageSuccess(zero, 2, "hours"));
});

test("Hours use an authoritative mismatched or missing latest reading without fallback", () => {
  const older = record("synthetic-old-hours", "2025-01-01", "hours", 50, [captured()]);
  const latestMismatch = record("synthetic-new-miles", "2025-02-01", "miles", 500, [captured()]);
  const mismatch = plain(engine.calculateMaintenanceInterval(request([older, latestMismatch], "hours", 5)));
  assert.equal(mismatch.lastService.recordId, latestMismatch.id);
  assert.equal(mismatch.nextService, null);
  assert.equal(mismatch.notCalculatedReason, "usage_unit_mismatch");

  const latestMissing = record("synthetic-new-missing-hours", "2025-03-01", "hours", null, [captured()]);
  const missing = plain(engine.calculateMaintenanceInterval(request([latestMissing, older], "hours", 5)));
  assert.equal(missing.lastService.recordId, latestMissing.id);
  assert.equal(missing.notCalculatedReason, "usage_reading_missing");
});

test("Hours reject invalid source readings and interval values", () => {
  for (const value of [-1, NaN, Infinity, -Infinity, "220"]) {
    const invalid = record(`synthetic-invalid-hours-${String(value)}`, "2025-01-01", "hours", value, [captured()]);
    assert.throws(() => engine.calculateMaintenanceInterval(request([invalid], "hours", 5)), /reading value/);
  }
  const valid = record("synthetic-valid-hours", "2025-01-01", "hours", 220, [captured()]);
  for (const interval of [-1, 0, NaN, Infinity, -Infinity, "50"]) {
    assert.throws(() => engine.calculateMaintenanceInterval(request([valid], "hours", interval)),
      /positive finite number/);
  }
});

test("Months calculations ignore historical usage units and optional readings", () => {
  const cases = [
    ["miles", 1200],
    ["hours", 20],
    ["none", null],
  ];
  for (const [unit, value] of cases) {
    const source = record(`synthetic-months-${unit}`, "2025-01-31", unit, value, [captured()]);
    assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([source], "months", 1))), {
      lastService: {
        recordId: source.id,
        serviceDate: source.service_date,
        usageReadingValue: value,
        usageReadingUnit: unit,
      },
      nextService: { kind: "date", serviceDate: "2025-02-28" },
      notCalculatedReason: null,
    });
  }
});

test("Months intervals use the latest qualifying service date and shared leap-date arithmetic", () => {
  const older = record("synthetic-month-old", "2024-01-31", "none", null, [captured()]);
  const latest = record("synthetic-month-latest", "2024-02-29", "none", null, [captured()]);
  const result = plain(engine.calculateMaintenanceInterval(request([older, latest], "months", 12)));
  assert.equal(result.lastService.recordId, latest.id);
  assert.deepEqual(result.nextService, { kind: "date", serviceDate: "2025-02-28" });
});

test("invalid source readings and invalid interval values are rejected, not converted to Not Calculated", () => {
  const valid = record("synthetic-valid", "2025-01-01", "miles", 10, [captured()]);
  for (const value of [-1, NaN, Infinity, -Infinity, "10", undefined]) {
    const invalid = { ...valid, id: `synthetic-invalid-${String(value)}`, usage_reading_value: value };
    assert.throws(() => engine.calculateMaintenanceInterval(request([invalid])), /reading value/);
  }
  for (const value of [-1, 0, NaN, Infinity, -Infinity, "5000"]) {
    assert.throws(() => engine.calculateMaintenanceInterval(request([valid], "miles", value)), /positive finite number/);
  }
  for (const value of [0, -1, 1.5, NaN, Infinity, "1"]) {
    assert.throws(() => engine.calculateMaintenanceInterval(request([valid], "months", value)), /positive whole number/);
  }
  const overflow = record("synthetic-overflow", "2025-01-02", "miles", Number.MAX_VALUE, [captured()]);
  assert.throws(() => engine.calculateMaintenanceInterval(request([overflow], "miles", Number.MAX_VALUE)), /finite/);
});

test("calculation validates required identity, units, canonical dates, record shape, and booleans", () => {
  const valid = record("synthetic-valid", "2025-01-01", "miles", 10, [captured()]);
  assert.throws(() => engine.calculateMaintenanceInterval(null), /input must be an object/);
  assert.throws(() => engine.calculateMaintenanceInterval({ ...request([valid]), asset: null }), /asset must be an object/i);
  assert.throws(() => engine.calculateMaintenanceInterval({ ...request([valid]), asset: { usage_unit: "miles" } }), /asset ID/i);
  assert.throws(() => engine.calculateMaintenanceInterval({
    ...request([valid]), asset: { id: assetId, usage_unit: "kilometers" },
  }), /asset usage unit/i);
  assert.throws(() => engine.calculateMaintenanceInterval({
    ...request([valid]), maintenanceItem: { id: " " },
  }), /Maintenance Item ID/);
  assert.throws(() => engine.calculateMaintenanceInterval({
    ...request([valid]), interval: { ...request([valid]).interval, maintenance_item_id: "synthetic-other" },
  }), /must match/);
  assert.throws(() => engine.calculateMaintenanceInterval({
    ...request([valid]), interval: { ...request([valid]).interval, interval_unit: "days" },
  }), /interval unit/i);
  assert.throws(() => engine.calculateMaintenanceInterval({ ...request([valid]), ongoingRecords: null }), /array/);
  assert.throws(() => engine.calculateMaintenanceInterval(request([
    { ...valid, service_date: "2025-02-30" },
  ])), /valid canonical date/);
  assert.throws(() => engine.calculateMaintenanceInterval(request([
    { ...valid, usage_reading_unit: "kilometers" },
  ])), /usage reading unit/i);
  assert.throws(() => engine.calculateMaintenanceInterval(request([
    { ...valid, items: [{ maintenance_item_id: maintenanceItemId, is_performed: 1 }] },
  ])), /Boolean/);
  assert.throws(() => engine.calculateMaintenanceInterval(request([
    { ...valid, items: [{ maintenance_item_id: " ", is_performed: true }] },
  ])), /Maintenance Item ID/);
  assert.throws(() => engine.calculateMaintenanceInterval(request([
    { ...valid, items: null },
  ])), /items must be an array/);
  assert.throws(() => engine.calculateMaintenanceInterval(request([
    valid, { ...valid, id: "synthetic-duplicate-date" },
  ])), /service dates must be unique/i);
});

test("asset scoping, linked item identity, and collection boundaries isolate calculations", () => {
  const target = record("synthetic-target", "2025-01-01", "miles", 100, [captured()], { asset_id: assetId });
  const otherAsset = record("synthetic-other-asset", "2026-01-01", "miles", 9000, [captured()], {
    asset_id: "synthetic-asset-other",
  });
  const otherItem = record("synthetic-other-item", "2026-02-01", "miles", 8000, [
    captured("synthetic-item-other"),
  ], { asset_id: assetId });
  const result = plain(engine.calculateMaintenanceInterval(request([otherAsset, otherItem, target])));
  assert.deepEqual(result, usageSuccess(target, 5100, "miles"));

  const maintenanceLabelChanged = request([record("synthetic-renamed-label", "2025-02-01", "miles", 200, [
    captured(maintenanceItemId, true, { displayNameSnapshot: "New display name", groupSnapshot: "New group" }),
  ])]);
  maintenanceLabelChanged.maintenanceItem = { id: maintenanceItemId, display_name: "Renamed catalog item" };
  assert.equal(plain(engine.calculateMaintenanceInterval(maintenanceLabelChanged)).lastService.recordId,
    "synthetic-renamed-label");

  const source = record("synthetic-only-ongoing", "2025-03-01", "miles", 300, [captured()]);
  const ignoredOtherCollections = request([source], "miles", 10, {
    recommendedServiceRecords: [record("synthetic-recommended", "2026-01-01", "miles", 9000, [captured()])],
    completedServiceRecords: [record("synthetic-completed", "2026-02-01", "miles", 8000, [captured()])],
  });
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(ignoredOtherCollections)),
    usageSuccess(source, 310, "miles"));
});

test("asset Usage Unit changes do not reinterpret historical readings", () => {
  const source = record("synthetic-historical-miles", "2025-04-01", "miles", 220, [captured()]);
  const input = request([source], "miles", 50);
  input.asset.usage_unit = "hours";
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(input)), usageSuccess(source, 270, "miles"));
});

test("history state transitions select current qualifying snapshots without mutating prior states", () => {
  const older = record("synthetic-transition-old", "2025-01-01", "miles", 100, [captured()]);
  const newer = record("synthetic-transition-new", "2025-02-01", "miles", 200, [captured()]);
  const initial = freeze([older]);
  const withNewer = freeze([...initial, newer]);
  assert.equal(plain(engine.calculateMaintenanceInterval(request(initial))).lastService.recordId, older.id);
  assert.equal(plain(engine.calculateMaintenanceInterval(request(withNewer))).lastService.recordId, newer.id);

  const editedOlder = freeze([{ ...older, usage_reading_value: 150 }, newer]);
  assert.equal(plain(engine.calculateMaintenanceInterval(request(editedOlder))).lastService.recordId, newer.id);
  const toggledOff = freeze([older, { ...newer, items: [captured(maintenanceItemId, false)] }]);
  assert.equal(plain(engine.calculateMaintenanceInterval(request(toggledOff))).lastService.recordId, older.id);
  const deletedNewer = freeze([older]);
  assert.equal(plain(engine.calculateMaintenanceInterval(request(deletedNewer))).lastService.recordId, older.id);
  assert.deepEqual(plain(engine.calculateMaintenanceInterval(request([]))), notCalculated("no_qualifying_service"));

  const renamed = request([newer]);
  renamed.maintenanceItem.display_name = "Synthetic renamed maintenance item";
  assert.equal(plain(engine.calculateMaintenanceInterval(renamed)).lastService.recordId, newer.id);
});

test("inputs remain immutable and identical or reordered inputs produce deterministic serializable results", () => {
  const records = freeze([
    record("synthetic-immutable-old", "2025-01-01", "miles", 10, [
      captured("synthetic-item-other", false),
      captured(maintenanceItemId, true),
    ]),
    record("synthetic-immutable-new", "2025-02-01", "miles", 20, [
      captured(maintenanceItemId, false),
      captured("synthetic-item-third", true),
    ]),
  ]);
  const input = freeze(request(records));
  const before = JSON.stringify(input);
  const first = plain(engine.calculateMaintenanceInterval(input));
  const second = plain(engine.calculateMaintenanceInterval(input));
  const reversed = plain(engine.calculateMaintenanceInterval(freeze(request([...records].reverse()))));
  assert.deepEqual(first, usageSuccess(records[0], 5010, "miles"));
  assert.deepEqual(second, first);
  assert.deepEqual(reversed, first);
  assert.equal(JSON.stringify(input), before);
  assert.equal(typeof first.lastService.serviceDate, "string");
  assert.equal(Object.values(first).some((value) => value instanceof Date), false);
  assert.doesNotThrow(() => JSON.stringify(first));
});
