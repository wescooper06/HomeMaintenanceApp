export const TIMELINE_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function timelineMonthNumber(value) {
  const label = String(value ?? "").trim().toUpperCase();
  const number = Number(label);
  if (Number.isInteger(number) && number >= 1 && number <= 12) return number;
  const fullNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const index = TIMELINE_MONTHS.findIndex((month, position) => month === label || fullNames[position] === label);
  return index < 0 ? NaN : index + 1;
}

export function timelineTripIds(value) {
  if (value == null || value === "") return [];
  let values = value;
  if (!Array.isArray(values)) {
    try {
      const parsed = JSON.parse(String(values));
      values = Array.isArray(parsed) ? parsed : String(values).split(",");
    } catch {
      values = String(values).split(",");
    }
  }
  return [...new Set(values.map((id) => String(id).trim()).filter(Boolean))];
}

export function timelineKey(year, month) {
  return `${Number(year)}-${timelineMonthNumber(month)}`;
}

export function timelineColor(value) {
  const color = String(value || "").trim().toUpperCase();
  return ["IDEAL", "CAUTION", "CONFLICT"].includes(color) ? color : "";
}