const USAGE_UNITS = ["miles", "hours", "none"];
const INTERVAL_UNITS = ["miles", "hours", "months"];
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertNonblankString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a nonblank string.`);
  }
}

function assertUsageUnit(value, label) {
  if (!USAGE_UNITS.includes(value)) {
    throw new TypeError(`${label} must be miles, hours, or none.`);
  }
}

function assertYearMonth(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999
    || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Date year or month is outside the supported range.");
  }
}

export function isLeapYear(year) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Year must be an integer from 1 to 9999.");
  }
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year, month) {
  assertYearMonth(year, month);
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDateOnly(value) {
  if (typeof value !== "string") {
    throw new TypeError("Date must be a valid canonical date in YYYY-MM-DD format.");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError("Date must be a valid canonical date in YYYY-MM-DD format.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1 || year > 9999
    || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Date must be a valid canonical date in YYYY-MM-DD format.");
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError("Date must be a valid canonical date in YYYY-MM-DD format.");
  }
  return { year, month, day };
}

export function addMonthsClampedToDate(date, months) {
  const { year, month, day } = parseDateOnly(date);
  if (typeof months !== "number" || !Number.isInteger(months) || months <= 0) {
    throw new TypeError("Month count must be a positive whole number.");
  }
  const targetMonthIndex = (year - 1) * 12 + month - 1 + months;
  if (!Number.isSafeInteger(targetMonthIndex) || targetMonthIndex >= 9999 * 12) {
    throw new RangeError("Month addition exceeds the supported date range.");
  }
  const targetYear = Math.floor(targetMonthIndex / 12) + 1;
  const targetMonth = (targetMonthIndex % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function validateRecord(record, assetId, recordIds, serviceDates) {
  assertObject(record, "Ongoing Maintenance record");
  if (hasOwn(record, "asset_id")) {
    assertNonblankString(record.asset_id, "Record asset ID");
    if (record.asset_id !== assetId) return false;
  }

  assertNonblankString(record.id, "Ongoing Maintenance record ID");
  if (recordIds.has(record.id)) {
    throw new RangeError(`Duplicate Ongoing Maintenance record ID: ${record.id}.`);
  }
  recordIds.add(record.id);

  parseDateOnly(record.service_date);
  if (serviceDates.has(record.service_date)) {
    throw new RangeError(`Ongoing Maintenance service dates must be unique per asset: ${record.service_date}.`);
  }
  serviceDates.add(record.service_date);

  assertUsageUnit(record.usage_reading_unit, "Record usage reading unit");
  if (record.usage_reading_value !== null
    && (typeof record.usage_reading_value !== "number"
      || !Number.isFinite(record.usage_reading_value)
      || record.usage_reading_value < 0)) {
    throw new TypeError("Record reading value must be null or a finite nonnegative number.");
  }
  if (!Array.isArray(record.items)) {
    throw new TypeError("Ongoing Maintenance record items must be an array.");
  }
  const itemIds = new Set();
  for (const item of record.items) {
    assertObject(item, "Captured Maintenance Item state");
    assertNonblankString(item.maintenance_item_id, "Captured Maintenance Item ID");
    if (itemIds.has(item.maintenance_item_id)) {
      throw new RangeError(`Duplicate captured Maintenance Item ID: ${item.maintenance_item_id}.`);
    }
    itemIds.add(item.maintenance_item_id);
    if (typeof item.is_performed !== "boolean") {
      throw new TypeError("Captured Maintenance Item is_performed must be a Boolean.");
    }
  }
  return true;
}

function validateCalculationInput(input) {
  assertObject(input, "Calculation input");
  assertObject(input.asset, "Asset");
  assertNonblankString(input.asset.id, "Asset ID");
  if (hasOwn(input.asset, "usage_unit")) {
    assertUsageUnit(input.asset.usage_unit, "Asset usage unit");
  }

  assertObject(input.maintenanceItem, "Maintenance Item");
  assertNonblankString(input.maintenanceItem.id, "Maintenance Item ID");
  assertObject(input.interval, "Maintenance Interval");
  assertNonblankString(input.interval.maintenance_item_id, "Interval Maintenance Item ID");
  if (input.maintenanceItem.id !== input.interval.maintenance_item_id) {
    throw new TypeError("Maintenance Item ID must match interval.maintenance_item_id.");
  }
  if (!INTERVAL_UNITS.includes(input.interval.interval_unit)) {
    throw new TypeError("Interval unit must be miles, hours, or months.");
  }
  if (input.interval.interval_unit === "months") {
    if (typeof input.interval.interval_value !== "number"
      || !Number.isFinite(input.interval.interval_value)
      || !Number.isInteger(input.interval.interval_value)
      || input.interval.interval_value <= 0) {
      throw new TypeError("Months interval value must be a positive whole number.");
    }
  } else if (typeof input.interval.interval_value !== "number"
    || !Number.isFinite(input.interval.interval_value)
    || input.interval.interval_value <= 0) {
    throw new TypeError("Interval value must be a positive finite number.");
  }
  if (!Array.isArray(input.ongoingRecords)) {
    throw new TypeError("Ongoing Maintenance records must be an array.");
  }

  const records = [];
  const recordIds = new Set();
  const serviceDates = new Set();
  for (const record of input.ongoingRecords) {
    if (validateRecord(record, input.asset.id, recordIds, serviceDates)) records.push(record);
  }
  return { asset: input.asset, maintenanceItemId: input.maintenanceItem.id, interval: input.interval, records };
}

function recordQualifiesForItem(record, maintenanceItemId) {
  return record.items.some((item) =>
    item.maintenance_item_id === maintenanceItemId && item.is_performed === true);
}

function selectLatestQualifyingRecord(records, maintenanceItemId) {
  let latest = null;
  for (const record of records) {
    if (recordQualifiesForItem(record, maintenanceItemId)
      && (latest === null || record.service_date > latest.service_date)) {
      latest = record;
    }
  }
  return latest;
}

function lastServiceFrom(record) {
  if (!record) return null;
  return {
    recordId: record.id,
    serviceDate: record.service_date,
    usageReadingValue: record.usage_reading_value,
    usageReadingUnit: record.usage_reading_unit,
  };
}

/**
 * Records with asset_id are scoped to this asset; records without it must already be asset-scoped.
 */
export function calculateMaintenanceInterval(input) {
  const { maintenanceItemId, interval, records } = validateCalculationInput(input);
  const latest = selectLatestQualifyingRecord(records, maintenanceItemId);
  if (!latest) {
    return {
      lastService: null,
      nextService: null,
      notCalculatedReason: "no_qualifying_service",
    };
  }

  const lastService = lastServiceFrom(latest);
  if (interval.interval_unit === "months") {
    return {
      lastService,
      nextService: {
        kind: "date",
        serviceDate: addMonthsClampedToDate(latest.service_date, interval.interval_value),
      },
      notCalculatedReason: null,
    };
  }

  if (latest.usage_reading_unit !== interval.interval_unit) {
    return { lastService, nextService: null, notCalculatedReason: "usage_unit_mismatch" };
  }
  if (latest.usage_reading_value === null) {
    return { lastService, nextService: null, notCalculatedReason: "usage_reading_missing" };
  }

  const nextValue = latest.usage_reading_value + interval.interval_value;
  if (!Number.isFinite(nextValue)) {
    throw new RangeError("Calculated next service value must be finite.");
  }
  return {
    lastService,
    nextService: { kind: "usage", value: nextValue, unit: interval.interval_unit },
    notCalculatedReason: null,
  };
}
