import { appConfig } from "./appConfig.js";
import { calendarReminders } from "./calendarReminderService.js";
import { plannerStorage } from "./plannerSupabaseStorage.js";
import { assertProjectWriteAllowed } from "./projectPolicy.js";

export const DAY_ORDER = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export const SLOT_ORDER = ["morning", "afternoon", "evening"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REPEATABLE_PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanText(value, fallback) {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
}

export function parseNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = cleanText(value, "");
  if (!text) {
    return fallback;
  }

  const num = Number(String(text).replace(/[$,]/g, ""));
  return Number.isFinite(num) ? num : fallback;
}

export function parseResourceLinks(value) {
  return parseResourceLinkEntries(value).map((entry) => entry.url);
}

export function parseResourceLinkEntries(value) {
  const toUrlString = (entry) => {
    if (entry && typeof entry === "object") {
      return cleanText(entry.url || entry.href || entry.link, "");
    }

    return cleanText(entry, "");
  };

  const toTitleString = (entry) => {
    if (!entry || typeof entry !== "object") {
      return "";
    }

    return cleanText(entry.title || entry.name || entry.label, "");
  };

  const toEntry = (entry) => {
    const url = toUrlString(entry);
    if (!url) {
      return null;
    }

    return {
      url,
      title: toTitleString(entry),
    };
  };

  if (Array.isArray(value)) {
    return value.map((entry) => toEntry(entry)).filter(Boolean);
  }

  const text = cleanText(value, "");
  if (!text) {
    return [];
  }

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const parsedLinks = list.map((entry) => toEntry(entry)).filter(Boolean);
      if (parsedLinks.length) {
        return parsedLinks;
      }
    } catch (error) {
      throw new Error(`Invalid resource links JSON: ${error.message}`, { cause: error });
    }
  }

  return text
    .split(/[\n,]+/g)
    .map((entry) => toEntry(entry.trim()))
    .filter(Boolean);
}

export function toDateKey(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = cleanText(dateKey, "").split("-").map((part) => parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDaysToDateKey(dateKey, days) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "";
  }

  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function toMonthStartDateKey(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "";
  }

  date.setDate(1);
  return toDateKey(date);
}

export function addMonthsToDateKey(dateKey, months) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "";
  }

  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return toDateKey(date);
}

export function formatMonthYearLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "";
  }

  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getDaysInMonth(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return 30;
  }

  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function cleanSource(source) {
  return cleanText(source, "unknown").toLowerCase();
}

export function firstDefined(obj, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }

  return null;
}

export function normalizeSource(source) {
  return cleanSource(source);
}

export function getWeekStartISO(dateValue) {
  const d = dateValue instanceof Date
    ? new Date(dateValue.getTime())
    : parseDateKey(dateValue);
  if (!d) {
    return toDateKey(new Date());
  }
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateKey(d);
}

export function getWeekDateKey(weekStartDate, dayIndex) {
  return addDaysToDateKey(weekStartDate, dayIndex);
}

export function getVisibleWeekDateRange(weekStartDate) {
  return DAY_ORDER.map((day, index) => ({
    key: day.key,
    label: day.label,
    date: getWeekDateKey(weekStartDate, index),
  }));
}

export function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatWeekDayLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "";
  }

  const day = DAY_ORDER[(date.getDay() + 6) % 7];
  return `${day.label} (${formatDateLabel(dateKey)})`;
}

export function buildWeeklyTaskId(taskType, sourceId, dateKey) {
  const safeSource = cleanText(sourceId, "");
  const safeDate = cleanText(dateKey, "");
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  if (taskType === "adhoc") {
    return `adhoc-${safeDate}-${stamp}`;
  }

  return `${taskType}-${safeSource}-${safeDate}-${stamp}`;
}

export function parseWeeklySourceId(task) {
  return cleanText(task?.metadata?.sourceTaskId || task?.projectId, "");
}

export function buildEmptyPlanner(weekStartDate) {
  return {
    weekStartDate,
    tasks: [],
  };
}

export function normalizeWeeklyTask(task, fallbackDate, fallbackTimeSlot) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const taskType = cleanText(task.taskType || task.type, "curated");
  const date = cleanText(task.date, fallbackDate);
  const timeSlot = cleanText(task.timeSlot || task.slot, fallbackTimeSlot);
  const id = cleanText(task.id || task.taskId, buildWeeklyTaskId(taskType, task.projectId || task.taskId || task.id || "task", date));
  const parentRepeatableId = taskType === "repeatable"
    ? cleanText(task.parentRepeatableId || task.projectId || parseWeeklySourceId(task), "")
    : cleanText(task.parentRepeatableId, "");

  if (!date || !SLOT_ORDER.includes(timeSlot) || !id) {
    return null;
  }

  const reminderSendAt = cleanText(task.reminder && task.reminder.sendAt, "");

  return {
    id,
    taskId: id,
    date,
    timeSlot,
    bucket: timeSlot,
    taskType,
    type: taskType,
    title: cleanText(task.title, "Untitled Task"),
    checklist: Array.isArray(task.checklist) ? structuredClone(task.checklist) : [],
    checklistOpen: Boolean(task.checklistOpen),
    completed: Boolean(task.completed),
    source: cleanText(task.source, "unknown"),
    recurrence: cleanText(task.recurrence, ""),
    projectId: cleanText(task.projectId, ""),
    priority: parseNumber(task.priority, null),
    parentRepeatableId,
    occurrenceDate: cleanText(task.occurrenceDate, date),
    overridden: Boolean(task.overridden),
    deletedInstance: Boolean(task.deletedInstance),
    deleted: Boolean(task.deleted),
    updatedAt: task.updatedAt,
    metadata: task.metadata && typeof task.metadata === "object" ? { ...task.metadata } : {},
    reminder: {
      ...(task.reminder || {}),
      active: Boolean(task.reminder && task.reminder.active && reminderSendAt),
      ...(reminderSendAt ? { sendAt: reminderSendAt } : {}),
    },
  };
}

export function toProjectView(project) {
  const metadata = project.metadata || {};
  const resourceLinkEntries = parseResourceLinkEntries(project.resourceLinks || metadata.resourceLinks);
  return {
    projectId: cleanText(project.id, "unknown"),
    externalId: cleanText(project.externalId || project.external_id, ""),
    title: cleanText(project.title, "Untitled Project"),
    source: normalizeSource(project.source),
    category: cleanText(project.category, "uncategorized"),
    state: cleanText(project.state, "unknown"),
    priority: parseNumber(firstDefined(metadata, ["priority", "rank", "urgency"]), 3),
    order: parseNumber(firstDefined(metadata, ["order", "sortorder", "sequence", "displayorder"]), 999),
    recurrence: cleanText(firstDefined(metadata, ["recurrence", "frequency", "interval"]), ""),
    asset: cleanText(firstDefined(metadata, ["asset", "vehicle", "equipment", "assetname"]), ""),
    mileage: cleanText(firstDefined(metadata, ["mileage", "odometer"]), ""),
    resourceLinks: resourceLinkEntries.map((entry) => entry.url),
    resourceLinkEntries,
  };
}

export function normalizeRecurrence(value) {
  const normalized = cleanText(value, "weekly").toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "biweekly" || normalized === "every2weeks" || normalized === "everyotherweek") return "biweekly";
  if (normalized === "monthly" || normalized === "month") return "monthly";
  if (normalized === "quarterly" || normalized === "quarter" || normalized === "every3months") return "quarterly";
  if (normalized === "yearly" || normalized === "annual" || normalized === "annually") return "yearly";
  return "weekly";
}

export function getDayName(dateKey) {
  const date = parseDateKey(dateKey);
  return date ? FULL_DAY_NAMES[date.getDay()] : "Monday";
}

export function getMonthWeekValue(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "1";
  }

  const dayOfMonth = date.getDate();
  const occurrence = Math.floor((dayOfMonth - 1) / 7) + 1;
  const nextSameWeekday = new Date(date.getFullYear(), date.getMonth(), dayOfMonth + 7);
  if (nextSameWeekday.getMonth() !== date.getMonth()) {
    return occurrence >= 5 ? "last" : String(occurrence);
  }

  return String(occurrence);
}

export function normalizeMonthWeek(value, fallbackDate) {
  const normalized = cleanText(value, "").toLowerCase();
  if (normalized === "last") {
    return "last";
  }
  if (["1", "2", "3", "4"].includes(normalized)) {
    return normalized;
  }
  return getMonthWeekValue(fallbackDate);
}

export function getMonthWeekLabel(value) {
  const normalized = normalizeMonthWeek(value);
  if (normalized === "1") return "1st";
  if (normalized === "2") return "2nd";
  if (normalized === "3") return "3rd";
  if (normalized === "4") return "4th";
  return "Last";
}

export function getNthWeekdayOfMonth(year, monthIndex, weekdayIndex, monthWeek) {
  const normalizedWeek = normalizeMonthWeek(monthWeek);
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWeekdayOffset = (weekdayIndex - firstOfMonth.getDay() + 7) % 7;
  const firstOccurrence = 1 + firstWeekdayOffset;

  if (normalizedWeek === "last") {
    const lastOfMonth = new Date(year, monthIndex + 1, 0);
    const lastWeekdayOffset = (lastOfMonth.getDay() - weekdayIndex + 7) % 7;
    return toDateKey(new Date(year, monthIndex, lastOfMonth.getDate() - lastWeekdayOffset));
  }

  const weekIndex = Math.max(1, parseInt(normalizedWeek, 10) || 1);
  const dayOfMonth = firstOccurrence + ((weekIndex - 1) * 7);
  const candidate = new Date(year, monthIndex, dayOfMonth);
  if (candidate.getMonth() !== monthIndex) {
    return "";
  }

  return toDateKey(candidate);
}

export function alignDateToSeriesPattern(dateKey, recurrence, baseDay, monthWeek) {
  const normalizedRecurrence = normalizeRecurrence(recurrence);
  if (normalizedRecurrence === "weekly" || normalizedRecurrence === "biweekly") {
    return alignDateToSeriesDay(dateKey, baseDay);
  }

  const date = parseDateKey(dateKey);
  const weekdayIndex = FULL_DAY_NAMES.findIndex((day) => day.toLowerCase() === cleanText(baseDay, "Monday").toLowerCase());
  if (!date || weekdayIndex < 0) {
    return cleanText(dateKey, "");
  }

  return getNthWeekdayOfMonth(date.getFullYear(), date.getMonth(), weekdayIndex, monthWeek);
}

export function alignDateToSeriesDay(dateKey, dayName) {
  const weekStart = getWeekStartISO(parseDateKey(dateKey) || dateKey);
  const targetIndex = Math.max(0, DAY_ORDER.findIndex((day) => day.label.toLowerCase() === cleanText(dayName, "Monday").slice(0, 3).toLowerCase()));
  return addDaysToDateKey(weekStart, targetIndex);
}

export function addRecurrenceInterval(startDateKey, recurrence, count, seriesRule) {
  const start = parseDateKey(startDateKey);
  if (!start) {
    return "";
  }

  if (recurrence === "weekly" || recurrence === "biweekly") {
    return addDaysToDateKey(startDateKey, count * (recurrence === "biweekly" ? 14 : 7));
  }

  const monthStep = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  const target = new Date(start.getFullYear(), start.getMonth() + (count * monthStep), 1);
  const weekdayIndex = FULL_DAY_NAMES.findIndex((day) => day.toLowerCase() === cleanText(seriesRule && seriesRule.baseDay, getDayName(startDateKey)).toLowerCase());
  if (weekdayIndex < 0) {
    return "";
  }

  return getNthWeekdayOfMonth(target.getFullYear(), target.getMonth(), weekdayIndex, seriesRule && seriesRule.monthWeek);
}

export function getOccurrenceDatesInRange(master, rangeStart, rangeEnd) {
  const startDate = cleanText(master && master.startDate, "");
  if (!startDate || !parseDateKey(startDate)) {
    return [];
  }

  const recurrence = normalizeRecurrence(master.recurrence);
  const interval = master.interval ?? 1;
  if (!Number.isSafeInteger(interval) || interval < 1) {
    throw new Error("Recurrence interval must be a positive integer.");
  }
  if (["weekly", "biweekly"].includes(recurrence) && master.weekdays?.length) {
    const dates = new Set();
    for (const weekday of master.weekdays) {
      const day = FULL_DAY_NAMES.find((name) => name.slice(0, 3).toLowerCase() === String(weekday).toLowerCase().slice(0, 3));
      if (!day) throw new Error(`Unknown recurrence weekday ${weekday}.`);
      let anchor = alignDateToSeriesDay(startDate, day);
      // Weekday rules are anchored to the start week, not to each day's first
      // appearance after startDate (which would shift interval > 1 patterns).
      const candidates = getOccurrenceDatesInRange({
        ...master, startDate: anchor, baseDay: day, weekdays: [],
      }, startDate > rangeStart ? startDate : rangeStart, rangeEnd);
      candidates.forEach((date) => dates.add(date));
    }
    return [...dates].sort();
  }
  const occurrences = [];
  for (let index = 0; index < 10000; index += 1) {
    const occurrenceDate = addRecurrenceInterval(startDate, recurrence, index * interval, master);
    if (!occurrenceDate || occurrenceDate > rangeEnd) {
      break;
    }
    if (occurrenceDate >= rangeStart) {
      occurrences.push(occurrenceDate);
    }
  }
  return occurrences;
}

export function normalizeChecklist(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const text = cleanText(item.text, "");
      if (!text) {
        return null;
      }

      return {
        id: cleanText(item.id, `check-${index + 1}`),
        text,
        completed: Boolean(item.completed),
      };
    })
    .filter((item) => item && item.id);
}

export function readProjectChecklistTemplate(task) {
  const metadata = task.metadataJson ? JSON.parse(task.metadataJson) : task.metadata || {};
  const template = metadata.checklistTemplate;
  if (template == null) return null;
  if (template.version !== 1 || !Array.isArray(template.items)
    || template.items.some((item) => !item || typeof item.id !== "string" || !item.id.trim()
      || typeof item.text !== "string" || !item.text.trim()
      || Object.keys(item).some((key) => !["id", "text"].includes(key)))
    || new Set(template.items.map((item) => item.id)).size !== template.items.length) {
    throw new Error(`Project task ${task.taskId || task.id} has an invalid checklist template. Review its definition before assigning it.`);
  }
  return template.items.map((item) => ({ ...item, completed: false }));
}

export function getSlotItemId(item) {
  return cleanText(item && (item.id || item.taskId), "");
}

export function toPlannerSlotItem(taskLike) {
  return normalizeWeeklyTask(taskLike, cleanText(taskLike && taskLike.date, ""), cleanText(taskLike && (taskLike.timeSlot || taskLike.slot), "morning"));
}

export function getWeeklyTaskType(task) {
  return cleanText(task && (task.taskType || task.type), "curated");
}

export function formatReminderTime(sendAt) {
  const date = sendAt instanceof Date ? sendAt : new Date(sendAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ensurePlannerAdapters() {
  return Promise.resolve();
}

const CURATED_TASK_LIMIT = 8;
const WEATHER_LOCATION = { name: "Mirrormont, WA", latitude: "47.4810", longitude: "-121.9960" };
const WEATHER_FALLBACK_ICON = "\u26c5";
const WEATHER_FALLBACK_VALUE = "\u2014";

export function buildWeatherApiUrl() {
    const apiKey = cleanText(appConfig.WEATHERAPI_KEY, "");
    const base = `https://api.weatherapi.com/v1/forecast.json?q=${WEATHER_LOCATION.latitude},${WEATHER_LOCATION.longitude}&days=7&aqi=no&alerts=no`;
    return apiKey ? `${base}&key=${encodeURIComponent(apiKey)}` : base;
  }

export function mapWeatherApiConditionToIcon(conditionText) {
    const text = cleanText(conditionText, "").toLowerCase();
    if (!text) {
      return WEATHER_FALLBACK_ICON;
    }

    if (text.includes("thunderstorm") || text.includes("thunder")) return "⛈";
    if (text.includes("snow")) return "❄";
    if (text.includes("drizzle")) return "🌦";
    if (text.includes("rain")) return "🌧";
    if (text.includes("fog") || text.includes("mist") || text.includes("haze")) return "🌫";
    if (text.includes("partly cloudy")) return "⛅";
    if (text.includes("cloudy") || text.includes("overcast")) return "☁";
    if (text.includes("sunny") || text.includes("clear")) return "☀";
    return WEATHER_FALLBACK_ICON;
  }

export function toWeekWeatherFallback(dateKey) {
    return {
      date: dateKey,
      icon: WEATHER_FALLBACK_ICON,
      condition: "Unavailable",
      high: WEATHER_FALLBACK_VALUE,
      low: WEATHER_FALLBACK_VALUE,
      precipitation: WEATHER_FALLBACK_VALUE,
      wind: WEATHER_FALLBACK_VALUE,
      humidity: WEATHER_FALLBACK_VALUE,
    };
  }

export function normalizeWeatherForecast(payload) {
    const normalizedByDate = {};
    if (!payload || typeof payload !== "object") {
      return normalizedByDate;
    }

    const forecastDays = Array.isArray(payload.forecast && payload.forecast.forecastday)
      ? payload.forecast.forecastday
      : [];

    forecastDays.slice(0, 7).forEach((entry) => {
      const dateKey = cleanText(entry && entry.date, "");
      if (!dateKey) {
        return;
      }

      const day = entry && typeof entry.day === "object" ? entry.day : {};
      const conditionText = cleanText(day.condition && day.condition.text, "Unavailable");
      const maxTempRaw = Number(day.maxtemp_f);
      const minTempRaw = Number(day.mintemp_f);
      const precipRaw = Number(day.daily_chance_of_rain);
      const windRaw = Number(day.maxwind_mph);
      const humidityRaw = Number(day.avghumidity);

      const high = Number.isFinite(maxTempRaw) ? `${Math.round(maxTempRaw)}°F` : WEATHER_FALLBACK_VALUE;
      const low = Number.isFinite(minTempRaw) ? `${Math.round(minTempRaw)}°F` : WEATHER_FALLBACK_VALUE;
      const precipitation = Number.isFinite(precipRaw) ? `${Math.round(precipRaw)}%` : WEATHER_FALLBACK_VALUE;
      const wind = Number.isFinite(windRaw) ? `${Math.round(windRaw)} mph` : WEATHER_FALLBACK_VALUE;
      const humidity = Number.isFinite(humidityRaw) ? `${Math.round(humidityRaw)}%` : WEATHER_FALLBACK_VALUE;

      normalizedByDate[dateKey] = {
        date: dateKey,
        icon: mapWeatherApiConditionToIcon(conditionText),
        condition: conditionText || "Unavailable",
        high,
        low,
        precipitation,
        wind,
        humidity,
      };
    });

    return normalizedByDate;
  }

export function formatFullDayLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "Unknown date";
    }

    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

export function getYouTubeVideoId(url) {
    const safeUrl = cleanText(url, "");
    if (!safeUrl) {
      return "";
    }

    try {
      const parsed = new URL(safeUrl);
      const host = cleanText(parsed.hostname, "").toLowerCase();
      const pathname = cleanText(parsed.pathname, "");

      if (host.includes("youtu.be")) {
        const firstSegment = pathname.split("/").filter(Boolean)[0] || "";
        return cleanText(firstSegment, "");
      }

      if (host.includes("youtube.com")) {
        const fromQuery = cleanText(parsed.searchParams.get("v"), "");
        if (fromQuery) {
          return fromQuery;
        }

        const segments = pathname.split("/").filter(Boolean);
        const shortsIndex = segments.findIndex((segment) => segment === "shorts");
        if (shortsIndex >= 0 && segments[shortsIndex + 1]) {
          return cleanText(segments[shortsIndex + 1], "");
        }

        const embedIndex = segments.findIndex((segment) => segment === "embed");
        if (embedIndex >= 0 && segments[embedIndex + 1]) {
          return cleanText(segments[embedIndex + 1], "");
        }
      }
    } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
      return "";
    }

    return "";
  }

export function getYouTubeCanonicalUrl(url) {
    const safeUrl = cleanText(url, "");
    const videoId = getYouTubeVideoId(safeUrl);
    if (!videoId) {
      return safeUrl;
    }

    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

export function fetchJsonp(url, timeoutMs) {
    const timeout = parseNumber(timeoutMs, 5000);
    return new Promise((resolve, reject) => {
      const callbackName = `hmJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement("script");
      const separator = url.includes("?") ? "&" : "?";
      let timeoutHandle = null;

      const cleanup = () => {
        if (timeoutHandle) {
          window.clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }

        try {
          delete window[callbackName];
        } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
          window[callbackName] = undefined;
        }
      };

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload || {});
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP request failed"));
      };

      timeoutHandle = window.setTimeout(() => {
        cleanup();
        reject(new Error("JSONP request timed out"));
      }, timeout);

      script.src = `${url}${separator}callback=${encodeURIComponent(callbackName)}`;
      document.body.appendChild(script);
    });
  }

export async function fetchTitleFromOembed(oembedEndpoint, targetUrl) {
    const endpoint = `${oembedEndpoint}?url=${encodeURIComponent(targetUrl)}&format=json`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return cleanText(payload && payload.title, "");
  }

export async function fetchTitleFromNoembed(targetUrl) {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return cleanText(payload && payload.title, "");
  }

export async function fetchTitleFromOembedViaProxy(targetUrl) {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
    const proxyUrl = `https://r.jina.ai/http://${oembedUrl.replace(/^https?:\/\//i, "")}`;
    const response = await fetch(proxyUrl, { method: "GET" });
    if (!response.ok) {
      return "";
    }

    const payloadText = await response.text();
    const match = payloadText.match(/"title"\s*:\s*"([^"]+)"/i);
    return cleanText(match && match[1], "");
  }

export async function resolveLinkTitle(url) {
    const safeUrl = cleanText(url, "");
    if (!safeUrl) {
      return "";
    }

    const canonicalUrl = getYouTubeCanonicalUrl(safeUrl);
    const isYouTube = Boolean(getYouTubeVideoId(canonicalUrl));

    if (isYouTube) {
      try {
        const noembedTitle = await fetchTitleFromNoembed(canonicalUrl);
        if (noembedTitle) {
          return noembedTitle;
        }
      } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
        // Continue to other resolvers.
      }

      try {
        const payload = await fetchJsonp(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`, 6000);
        const jsonpTitle = cleanText(payload && payload.title, "");
        if (jsonpTitle) {
          return jsonpTitle;
        }
      } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
        // Continue to other resolvers.
      }
    }

    const oembedEndpoints = [
      "https://www.youtube.com/oembed",
      "https://www.youtube-nocookie.com/oembed",
      "https://noembed.com/embed",
    ];

    for (let i = 0; i < oembedEndpoints.length; i += 1) {
      try {
        const title = await fetchTitleFromOembed(oembedEndpoints[i], canonicalUrl);
        if (title) {
          return title;
        }
      } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
        // Try next endpoint.
      }
    }

    if (isYouTube) {
      try {
        const proxyTitle = await fetchTitleFromOembedViaProxy(canonicalUrl);
        if (proxyTitle) {
          return proxyTitle;
        }
      } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
        // Continue to direct fetch.
      }
    }

    try {
      const response = await fetch(canonicalUrl, { method: "GET" });
      if (!response.ok) {
        return safeUrl;
      }

      const html = await response.text();
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const resolved = cleanText(match && match[1], "").replace(/\s*-\s*YouTube\s*$/i, "");
      return resolved || safeUrl;
    } catch (error) {
      console.debug("Planner link-title resolver fallback", error);
      const youtubeId = getYouTubeVideoId(canonicalUrl);
      if (youtubeId) {
        return `YouTube Video ${youtubeId}`;
      }

      return safeUrl;
    }
  }

export function getReminderSendAt(task, selection, customTime) {
  if (!selection) throw new Error("Choose a reminder time.");
  if (selection === "custom" && !customTime) throw new Error("Choose a custom time.");
  const bucketTimes = { morning: "08:00", afternoon: "13:00", evening: "18:00", "all day": "09:00", allday: "09:00" };
  const time = selection === "custom" ? customTime : bucketTimes[cleanText(task.timeSlot, "morning").toLowerCase()] || "09:00";
  const date = new Date(`${task.date}T${time}:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid reminder date and time.");
  if (selection !== "custom") date.setMinutes(date.getMinutes() - Number(selection));
  return date;
}

export function getCalendarMonth(monthDate, selectedDate, weekStartDate) {
  const first = parseDateKey(toMonthStartDateKey(monthDate));
  if (!first) throw new Error("A valid calendar month is required.");
  const start = new Date(first);
  start.setDate(first.getDate() - (first.getDay() + 6) % 7);
  const visible = new Set(getVisibleWeekDateRange(weekStartDate).map((day) => day.date));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    return { date: key, day: date.getDate(), label: `Jump to week of ${date.toDateString()}`,
      outside: date.getMonth() !== first.getMonth(), visible: visible.has(key),
      today: key === toDateKey(new Date()), selected: key === selectedDate };
  });
}

export function getMoveCalendar(monthDate, selectedDate) {
  const first = parseDateKey(toMonthStartDateKey(monthDate));
  if (!first) throw new Error("A valid calendar month is required.");
  return {
    blanks: Array.from({ length: first.getDay() }, (_, index) => index),
    days: Array.from({ length: getDaysInMonth(monthDate) }, (_, index) => {
      const date = new Date(first.getFullYear(), first.getMonth(), index + 1);
      const key = toDateKey(date);
      return { date: key, day: index + 1, today: key === toDateKey(new Date()), selected: key === selectedDate,
        label: date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) };
    }),
  };
}

export function getMoveTaskInitialDate(dateKey) {
  const [year, month, day] = cleanText(dateKey, "").split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return toDateKey(Number.isNaN(date.getTime()) ? new Date() : date);
}

export function sortWeeklyTasks(tasks) {
  const position = (task) => Number.isSafeInteger(task.metadata?.weeklyPosition)
    && task.metadata.weeklyPosition >= 0 ? task.metadata.weeklyPosition : Infinity;
  return [...tasks].sort((left, right) => {
    const a = position(left), b = position(right);
    if (a !== b) return a < b ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export function selectWeeklyView(snapshot) {
  const range = getVisibleWeekDateRange(snapshot.planner.weekStartDate);
  const first = range[0] ? formatDateLabel(range[0].date) : "";
  const last = range[6] ? formatDateLabel(range[6].date) : "";
  const year = range[0] ? parseDateKey(range[0].date)?.getFullYear() : "";
  return {
    label: first && last ? `${first} - ${last}${year ? ` (${year})` : ""}` : "",
    days: range.map((day) => ({
      ...day, heading: formatWeekDayLabel(day.date), today: day.date === toDateKey(new Date()),
      weather: snapshot.weatherByDate[day.date] || toWeekWeatherFallback(day.date),
      slots: SLOT_ORDER.map((slot) => ({
        slot, label: slot.charAt(0).toUpperCase() + slot.slice(1),
        tasks: sortWeeklyTasks(snapshot.planner.tasks.filter((item) => !item.deletedInstance && cleanText(item.date, "") === day.date && cleanText(item.timeSlot, "") === slot)),
      })),
    })),
  };
}

export function getSeriesEditorValues(master, current) {
  const bucket = cleanText(master.baseBucket, current.timeSlot || "Morning").toLowerCase();
  return {
    recurrence: normalizeRecurrence(master.recurrence),
    baseDay: cleanText(master.baseDay, getDayName(current.occurrenceDate || current.date)),
    monthWeek: normalizeMonthWeek(master.monthWeek, current.date || current.occurrenceDate),
    baseBucket: bucket.charAt(0).toUpperCase() + bucket.slice(1),
  };
}

export function createPlannerController({ reminderService = calendarReminders } = {}) {
  const state = {
    curatedTasks: [], repeatableTasks: [], repeatableOverrideMap: new Map(),
    planner: buildEmptyPlanner(getWeekStartISO(new Date())), allProjects: [],
    selectedCalendarDate: "", calendarMonthDate: "", weatherByDate: {},
    status: "Loading planner...", mode: "Local mode", loading: true,
    warning: "", drag: null, dropTarget: "", modal: null, moveTaskId: "",
    reminderTaskId: "", seriesTaskId: "", activeAdhocChecklist: null,
    linkProject: null, confirmations: {}, error: "",
    gridRevision: 0,
    backupBusy: false,
    reminderBusy: false,
    restoreProposal: null,
    restoreBusy: false,
    restoreError: "",
    backupReloadRequired: false,
  };
  const listeners = new Set();
  const timers = new Set();
  let destroyed = false;
  let generation = 0;
  let unsubscribe;
  let warningTimer;
  let linkResolve;
  let weatherLastFetchedAt = 0;
  let weatherRequest;
  let linksRequest = 0;
  let persistence = Promise.resolve();
  let persistenceError = null;
  let pendingWrites = 0;
  let refreshRequest = 0;

  function snapshot() {
    return structuredClone(state);
  }
  function notify() {
    if (!destroyed) listeners.forEach((listener) => listener(snapshot()));
  }
  function setStatus(message) {
    state.status = message;
    notify();
  }
  function report(error) {
    console.error("Planner operation failed", error);
    state.loading = false;
    state.error = cleanText(error?.message, "Unable to update Planner.");
    setStatus(state.error);
  }
  function later(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!destroyed) { callback(); notify(); }
    }, delay);
    timers.add(timer);
    return timer;
  }
  function trackWrite(write) {
    pendingWrites += 1;
    const handled = Promise.resolve(write).catch((error) => {
      persistenceError = error;
      report(error);
    }).finally(() => { pendingWrites -= 1; });
    persistence = Promise.all([persistence, handled]).then(() => undefined);
    return write;
  }
  const pendingWeeklyDeletions = new Set();
  const removedWeeklyRows = new Map();
  function removeWeeklyRows(predicate) {
    state.planner.tasks = state.planner.tasks.filter((task) => {
      if (!predicate(task)) return true;
      pendingWeeklyDeletions.add(task.id);
      removedWeeklyRows.set(task.id, task);
      return false;
    });
  }
  function savePlanner({ materializeOnly = false } = {}) {
    state.gridRevision += 1;
    const deletedTaskIds = [...pendingWeeklyDeletions].filter((id) =>
      !state.planner.tasks.some((task) => task.id === id && !task.deletedInstance && !task.deleted));
    pendingWeeklyDeletions.clear();
    removedWeeklyRows.clear();
    return trackWrite(plannerStorage.saveWeeklyPlannerState(state.planner, { deletedTaskIds, materializeOnly }));
  }
  function hideCuratedWarning() {
    if (warningTimer) { clearTimeout(warningTimer); timers.delete(warningTimer); }
    warningTimer = null;
    state.warning = "";
  }
  function showCuratedWarning(message) {
    hideCuratedWarning();
    state.warning = cleanText(message, "");
    warningTimer = later(hideCuratedWarning, 5000);
  }
  function showReminderConfirmation(taskId, message) {
    state.confirmations[taskId] = cleanText(message, "");
    later(() => { delete state.confirmations[taskId]; }, 3000);
  }
  function selectTaskMasterProject(task, projects) {
    const source = normalizeSource(task.source);
    const candidates = projects.filter((project) => !["home", "vehicle", "repeating", "misc"].includes(source)
      || normalizeSource(project.source) === source).sort((a, b) => a.title.localeCompare(b.title));
    if (linkResolve) linkResolve(null);
    state.linkProject = { taskTitle: task.title, projects: candidates };
    notify();
    return new Promise((resolve) => { linkResolve = resolve; });
  }
  function refreshChecklist() {
    const context = state.activeAdhocChecklist;
    if (context && !findSlotTask(context.day, context.slot, context.taskId)) state.activeAdhocChecklist = null;
  }

  function displayPlannerWeek(weekStartDate, selectedDate) {
    const previousWeek = state.planner.weekStartDate;
    state.planner.weekStartDate = weekStartDate;
    try { generateVisibleRecurringInstances(false); }
    catch (error) { state.planner.weekStartDate = previousWeek; throw error; }
    state.selectedCalendarDate = selectedDate;
    state.calendarMonthDate = toMonthStartDateKey(selectedDate);
    savePlanner({ materializeOnly: true });
    setStatus(`Planning week of ${weekStartDate}.`);
    return true;
  }

  function shiftPlannerWeek(offsetDays) {
    if (!state.planner) {
      return false;
    }

    const days = parseNumber(offsetDays, 0);
    if (!days) {
      return false;
    }

    const weekStartDate = addDaysToDateKey(state.planner.weekStartDate, days);
    return displayPlannerWeek(weekStartDate, weekStartDate);
  }

  function goToCurrentWeek() {
    if (!state.planner) {
      return false;
    }

    const todayKey = toDateKey(new Date());
    const currentWeekStart = getWeekStartISO(todayKey);
    if (!currentWeekStart) {
      return false;
    }

    return displayPlannerWeek(currentWeekStart, todayKey);
  }

  function jumpPlannerToDate(dateKey, selectedDateKey) {
    const clickedDate = cleanText(dateKey, "");
    const weekStartDate = getWeekStartISO(parseDateKey(clickedDate) || clickedDate);
    if (!clickedDate || !weekStartDate) {
      return false;
    }

    return displayPlannerWeek(weekStartDate, cleanText(selectedDateKey, clickedDate));
  }

  function getProjectById(projectId) {
    const targetId = cleanText(projectId, "");
    if (!targetId) {
      return null;
    }

    return findExplicitProject(state.allProjects, targetId);
  }

  function getTaskProject(task) {
    return getProjectById(task?.projectId || task?.external_id || task?.externalId);
  }

  function getProjectFromTaskId(taskId) {
    const normalizedTaskId = cleanText(taskId, "");
    if (!normalizedTaskId) {
      return null;
    }

    const scheduledTask = state.planner.tasks.find((item) => getSlotItemId(item) === normalizedTaskId);
    if (scheduledTask) {
      const projectFromSchedule = getTaskProject(scheduledTask);
      if (projectFromSchedule) {
        return projectFromSchedule;
      }
    }

    const curatedTask = state.curatedTasks.find((item) => cleanText(item.taskId, "") === normalizedTaskId);
    if (curatedTask) {
      const curatedProjectId = cleanText(curatedTask.projectId, "");
      if (curatedProjectId) {
        const byCuratedId = getProjectById(curatedProjectId);
        if (byCuratedId) {
          return byCuratedId;
        }
      }

    }

    return getProjectById(normalizedTaskId);
  }

  function loadRepeatableOverrides() {
    return plannerStorage.getRepeatableOverrides();
  }

  function saveRepeatableOverrides(items) {
    return trackWrite(plannerStorage.saveRepeatableOverrides(items));
  }

  function persistRepeatableMaster(master) {
    const projectId = cleanText(master && (master.id || master.projectId), "");
    if (!REPEATABLE_PROJECT_ID.test(projectId) || master.projectId !== projectId) {
      throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
    }

    const existing = state.repeatableOverrideMap.get(projectId) || {};
    const record = {
      ...existing,
      projectId,
      id: projectId,
      taskId: REPEATABLE_PROJECT_ID.test(master.taskId) ? master.taskId : existing.taskId,
      title: cleanText(master.title, existing.title || "Untitled Task"),
      recurrence: normalizeRecurrence(master.recurrence),
      baseDay: cleanText(master.baseDay, existing.baseDay || "Monday"),
      monthWeek: normalizeMonthWeek(master.monthWeek, master.startDate || existing.startDate || existing.originalStartDate || ""),
      baseBucket: cleanText(master.baseBucket, existing.baseBucket || "Morning"),
      startDate: cleanText(master.startDate, existing.startDate || ""),
      originalStartDate: cleanText(master.originalStartDate, existing.originalStartDate || master.startDate || ""),
      interval: master.interval ?? existing.interval ?? 1,
      weekdays: master.weekdays || existing.weekdays || [],
      active: master.active !== false,
      removedFromPlanner: master.active === false,
    };
    state.repeatableOverrideMap.set(projectId, record);
    return saveRepeatableOverrides([record]);
  }

  function makeRecurringInstance(master, occurrenceDate) {
    const parentRepeatableId = cleanText(master.id || master.projectId, "");
    const id = `repeatable-${parentRepeatableId}-${occurrenceDate}`;
    const previous = removedWeeklyRows.get(id);
    const template = master.checklistTemplate;
    if (!previous && template == null && state.planner.tasks.some((item) =>
      (item.parentRepeatableId === parentRepeatableId || item.metadata?.sourceTaskId === master.taskId)
      && item.checklist?.length)) {
      throw new Error("This Repeatable has no approved checklist template. Review its checklist and save an authoritative template before generating new work.");
    }
    return toPlannerSlotItem({
      ...previous,
      id,
      taskId: id,
      parentRepeatableId,
      occurrenceDate,
      date: occurrenceDate,
      timeSlot: cleanText(master.baseBucket, "Morning").toLowerCase(),
      bucket: cleanText(master.baseBucket, "Morning").toLowerCase(),
      projectId: parentRepeatableId,
      title: cleanText(master.title, "Untitled Task"),
      type: "repeatable",
      taskType: "repeatable",
      source: "repeating",
      recurrence: normalizeRecurrence(master.recurrence),
      checklist: previous?.checklist ?? (template || []).map((item) => ({ id: item.id, text: item.text, completed: false })),
      overridden: false,
      deleted: false,
      deletedInstance: false,
      metadata: { ...previous?.metadata, generated: true,
        ...(REPEATABLE_PROJECT_ID.test(master.taskId) ? { sourceTaskId: master.taskId } : {}) },
    });
  }

  function generateVisibleRecurringInstances(persist = true) {
    if (!state.planner || !Array.isArray(state.planner.tasks)) {
      return false;
    }

    const visible = getVisibleWeekDateRange(state.planner.weekStartDate);
    const rangeStart = visible[0] && visible[0].date;
    const rangeEnd = visible[6] && visible[6].date;
    if (!rangeStart || !rangeEnd) {
      return false;
    }

    const additions = [];
    state.repeatableTasks.filter((master) => master.active !== false && master.startDate).forEach((master) => {
      getOccurrenceDatesInRange(master, rangeStart, rangeEnd).forEach((occurrenceDate) => {
        const parentId = cleanText(master.id || master.projectId, "");
        const matches = state.planner.tasks.filter((item) =>
          item.id === `repeatable-${parentId}-${occurrenceDate}`
          || ((item.parentRepeatableId === parentId || item.metadata?.sourceTaskId === master.taskId)
            && cleanText(item.occurrenceDate, item.date) === occurrenceDate));
        if (matches.length > 1 || matches.some((item) =>
          item.parentRepeatableId !== parentId || item.projectId !== parentId
          || item.source !== "repeating" || item.taskType !== "repeatable"
          || cleanText(item.occurrenceDate, item.date) !== occurrenceDate
          || (item.metadata?.sourceTaskId && item.metadata.sourceTaskId !== master.taskId))) {
          throw new Error("Repeatable occurrence ownership is ambiguous. Reload before generating.");
        }
        if (!matches.length) additions.push(makeRecurringInstance(master, occurrenceDate));
      });
    });

    if (additions.length) {
      state.planner.tasks.push(...additions);
      if (persist) savePlanner({ materializeOnly: true });
    }
    return additions.length > 0;
  }

  function loadCuratedTasks() {
    return plannerStorage.getCuratedTasks().then((items) =>
      items.map((task, index) => ({
        taskId: cleanText(task.taskId, `task-${index + 1}`),
        projectId: cleanText(task.projectId, ""),
        title: cleanText(task.title, "Untitled Task"),
        source: cleanText(task.source, "unknown"),
        category: cleanText(task.category, "uncategorized"),
        recurrence: cleanText(task.recurrence, ""),
        priority: parseNumber(task.priority, 3),
        order: parseNumber(task.order, index + 1),
        checklistTemplate: readProjectChecklistTemplate(task),
      })));
  }

  async function loadPlanner() {
    const weekStartDate = getWeekStartISO(new Date());
    const loaded = await plannerStorage.loadPlannerState();
    const storedPlanner = { weekStartDate: loaded.weekStartDate, tasks: loaded.weeklyTasks };
    const safePlanner = buildEmptyPlanner(cleanText(storedPlanner && storedPlanner.weekStartDate, weekStartDate));
    safePlanner.tasks = (storedPlanner && Array.isArray(storedPlanner.tasks) ? storedPlanner.tasks : [])
      .map((item) => normalizeWeeklyTask(item, cleanText(item.date, safePlanner.weekStartDate), cleanText(item.timeSlot || item.slot, "morning")))
      .filter(Boolean);
    return safePlanner;
  }

  function saveCuratedTasks() {
    return trackWrite(plannerStorage.saveCuratedTasks(state.curatedTasks));
  }

  function getVisibleDateForDay(dayKey) {
    const dayIndex = DAY_ORDER.findIndex((item) => item.key === dayKey);
    if (dayIndex < 0) {
      return "";
    }

    return getWeekDateKey(state.planner.weekStartDate, dayIndex);
  }

  function assignTask(taskId, day, slot, { fresh = false } = {}) {
    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const task = state.curatedTasks.find((item) => item.taskId === taskId);
    if (!task) {
      return false;
    }

    assignProjectOccurrence({
      ...task,
      taskType: "curated",
      type: "curated",
      checklist: task.checklist || [],
      completed: false,
    }, date, slot, fresh);

    savePlanner();
    setStatus(`${fresh ? "Started fresh work for" : "Assigned"} "${task.title}" on ${day.toUpperCase()} ${slot}.`);
    return true;
  }

  function addAdHocTask(title, day, slot) {
    const normalizedTitle = cleanText(title, "");
    if (!normalizedTitle) {
      setStatus("Ad-hoc task title is required.");
      return false;
    }

    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      setStatus("Please select a valid day and time for the ad-hoc task.");
      return false;
    }

    const adHocItem = toPlannerSlotItem({
      id: buildWeeklyTaskId("adhoc", "adhoc", date),
      taskId: buildWeeklyTaskId("adhoc", "adhoc", date),
      date,
      timeSlot: slot,
      title: normalizedTitle,
      type: "adhoc",
      taskType: "adhoc",
      source: "adhoc",
      recurrence: "",
      priority: null,
      checklist: [],
      checklistOpen: false,
      completed: false,
    });

    state.planner.tasks.push(adHocItem);
    savePlanner();
    setStatus(`Added ad-hoc task "${normalizedTitle}" to ${day.toUpperCase()} ${slot}.`);
    return true;
  }

  function assignEntryToSlot(entry, day, slot) {
    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const normalizedTaskId = cleanText(entry.taskId, "") || cleanText(entry.projectId, "") || cleanText(entry.id, "");
    if (!normalizedTaskId) {
      return false;
    }

    assignProjectOccurrence({
      id: normalizedTaskId,
      taskId: normalizedTaskId,
      title: cleanText(entry.title, "Untitled Task"),
      type: "curated",
      taskType: "curated",
      priority: parseNumber(entry.priority, 3),
      source: cleanText(entry.source, "unknown"),
      recurrence: cleanText(entry.recurrence, ""),
      checklist: normalizeChecklist(entry.checklist),
      checklistOpen: Boolean(entry.checklistOpen),
      completed: Boolean(entry.completed),
      projectId: cleanText(entry.projectId, ""),
      checklistTemplate: entry.checklistTemplate ?? null,
    }, date, slot);

    return true;
  }

  function moveTask(taskId, toDate, toSlot, placement) {
    const targetDate = cleanText(toDate, "");
    if (!targetDate || !SLOT_ORDER.includes(toSlot)) {
      return false;
    }

    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    const sameContainer = existing.item.date === targetDate && existing.item.timeSlot === toSlot;
    if (sameContainer && !placement) return true;
    const destination = sortWeeklyTasks(state.planner.tasks.filter((item) =>
      !item.deletedInstance && item.date === targetDate && item.timeSlot === toSlot));
    if (placement?.targetId === taskId) return true;
    const next = destination.filter((item) => item.id !== taskId);
    let index = next.length;
    if (placement?.targetId) {
      index = next.findIndex((item) => item.id === placement.targetId);
      if (index < 0 || !["before", "after"].includes(placement.side)) {
        throw new Error("Unable to locate that weekly insertion target. Please try again.");
      }
      if (placement.side === "after") index += 1;
    }
    next.splice(index, 0, existing.item);
    if (sameContainer && next.every((item, i) => item.id === destination[i]?.id)) return true;

    existing.item.date = targetDate;
    existing.item.timeSlot = toSlot;
    existing.item.bucket = toSlot;
    if (!sameContainer && cleanText(existing.item.parentRepeatableId, "")) {
      existing.item.overridden = true;
    }
    next.forEach((item, weeklyPosition) => {
      item.metadata = { ...item.metadata, weeklyPosition };
    });
    savePlanner();
    setStatus(sameContainer ? `Reordered "${existing.item.title}".` : `Moved "${existing.item.title}" to ${targetDate} ${toSlot}.`);
    return true;
  }

  function reorderWeeklyTask(taskId, placement = {}) {
    const existing = findWeeklyTaskById(taskId);
    if (!existing) throw new Error("Unable to locate that weekly task. Please try again.");
    return moveTask(taskId, existing.item.date, existing.item.timeSlot, placement);
  }

  function moveTaskToDate(taskId, targetDate, toSlot) {
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
      return false;
    }

    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    return moveTask(taskId, toDateKey(targetDate), toSlot ?? existing.item.timeSlot);
  }

  function requireCancelledReminders(tasks) {
    if (tasks.some((task) => task.reminder?.active)) {
      throw new Error("Cancel active Google Calendar notifications before removing these tasks.");
    }
  }

  function removeTask(taskId) {
    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    requireCancelledReminders([existing.item]);
    pendingWeeklyDeletions.add(existing.item.id);
    if (cleanText(existing.item.parentRepeatableId, "")) {
      existing.item.deletedInstance = true;
      existing.item.deleted = true;
    } else {
      state.planner.tasks.splice(existing.index, 1);
    }
    savePlanner();
    setStatus("Task removed from planner slot.");
    return true;
  }

  function removeTaskFromPlanner(taskId) {
    requireCancelledReminders(state.planner.tasks.filter((item) =>
      cleanText(item.taskType || item.type, "curated") === "curated"
      && parseWeeklySourceId(item) === cleanText(taskId, "")));
    const beforeCurated = state.curatedTasks.length;
    state.curatedTasks = state.curatedTasks.filter((task) => task.taskId !== taskId);
    const removedFromCurated = state.curatedTasks.length !== beforeCurated;

    const beforeSchedule = state.planner.tasks.length;
    removeWeeklyRows((item) => cleanText(item.taskType || item.type, "curated") === "curated" && parseWeeklySourceId(item) === cleanText(taskId, ""));
    const removedFromSchedule = state.planner.tasks.length !== beforeSchedule;

    if (!removedFromCurated && !removedFromSchedule) {
      return false;
    }

    saveCuratedTasks();
    savePlanner();
    hideCuratedWarning();
    setStatus("Task removed from Planner and schedule.");
    return true;
  }

  function removeTaskFromCurated(taskId) {
    const beforeCurated = state.curatedTasks.length;
    state.curatedTasks = state.curatedTasks.filter((task) => task.taskId !== taskId);
    if (state.curatedTasks.length === beforeCurated) {
      return false;
    }

    saveCuratedTasks();
    hideCuratedWarning();
    setStatus("Task removed from Curated Tasks.");
    return true;
  }

  function removeWeeklyCopiesForRepeatable(projectId) {
    requireCancelledReminders(state.planner.tasks.filter((item) =>
      cleanText(item.taskType || item.type, "curated") === "repeatable"
      && (cleanText(item.parentRepeatableId, "") === cleanText(projectId, "")
        || parseWeeklySourceId(item) === cleanText(projectId, ""))));
    const before = state.planner.tasks.length;
    removeWeeklyRows((item) => cleanText(item.taskType || item.type, "curated") === "repeatable"
      && (cleanText(item.parentRepeatableId, "") === cleanText(projectId, "")
        || parseWeeklySourceId(item) === cleanText(projectId, "")));
    return state.planner.tasks.length !== before;
  }

  function removeRepeatableMaster(projectId) {
    const override = state.repeatableOverrideMap.get(projectId) || {};
    state.repeatableOverrideMap.set(projectId, {
      ...override,
      projectId,
      removedFromPlanner: true,
    });

    state.repeatableTasks = state.repeatableTasks.filter((task) => task.projectId !== projectId);

    saveRepeatableOverrides([state.repeatableOverrideMap.get(projectId)]);
    savePlanner();
    setStatus("Repeatable task removed from the task container. Weekly planner entries remain scheduled.");
  }

  const pendingRepeatablePlacements = new Set();
  async function createWeeklyRepeatableCopy(masterTask, date, slot) {
    if (!date || !SLOT_ORDER.includes(slot)) {
      throw new Error("Please select a valid task date and time slot.");
    }

    const projectId = cleanText(masterTask.projectId, "");
    const parentId = cleanText(masterTask.id, projectId);
    const taskId = `repeatable-${parentId}-${date}`;
    if (!REPEATABLE_PROJECT_ID.test(projectId) || parentId !== projectId
      || masterTask.source !== "repeating"
      || state.repeatableTasks.filter((task) => task.projectId === projectId).length !== 1) {
      throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
    }
    if (pendingRepeatablePlacements.has(projectId)) {
      throw new Error("A placement for this repeatable task is still saving. Wait before assigning.");
    }
    const matches = state.planner.tasks.filter((item) => item.id === taskId
      || (cleanText(item.parentRepeatableId, "") === parentId
        && cleanText(item.occurrenceDate, item.date) === date));
    const existing = matches[0];
    if (matches.length > 1 || (existing
      && (existing.parentRepeatableId !== parentId || existing.projectId !== projectId
        || cleanText(existing.occurrenceDate, existing.date) !== date))) {
      throw new Error("Repeatable occurrence ownership is ambiguous. Reload before assigning.");
    }
    const outcome = (status, task) => ({
      status, taskId: task.id, projectId, occurrenceDate: date,
      date: task.date, timeSlot: task.timeSlot,
    });
    if (existing) {
      if (existing.deleted || existing.deletedInstance) {
        const validDate = parseDateKey(existing.date);
        if (existing.id === taskId && validDate && toDateKey(validDate) === existing.date
          && SLOT_ORDER.includes(existing.timeSlot)
          && existing.occurrenceDate === date && existing.taskType === "repeatable" && existing.source === "repeating"
          && masterTask.active !== false) {
          state.restoreProposal = {
            taskId, projectId, occurrenceDate: date, expectedUpdatedAt: existing.updatedAt ?? null,
            date: existing.date, timeSlot: existing.timeSlot, title: masterTask.title,
            requestedDate: date, requestedTimeSlot: slot,
          };
          state.restoreError = "";
        }
        setStatus(`A previously deleted occurrence of "${masterTask.title}" exists for ${date}. It was not restored or added.`);
        return outcome("previously-deleted", existing);
      }
      if (existing.date !== date) {
        setStatus(`"${masterTask.title}" is already scheduled on ${existing.date} in ${existing.timeSlot}. It was not moved or added.`);
        return outcome("moved", existing);
      }
      if (existing.timeSlot !== slot) {
        setStatus(`"${masterTask.title}" is already scheduled on ${existing.date} in ${existing.timeSlot}. It was not moved or added.`);
        return outcome("existing-bucket", existing);
      }
      setStatus(`"${masterTask.title}" is already scheduled on ${date} in ${slot}.`);
      return outcome("already-scheduled", existing);
    }

    const nextMaster = {
      ...masterTask, id: parentId, recurrence: normalizeRecurrence(masterTask.recurrence),
      baseDay: getDayName(date), monthWeek: getMonthWeekValue(date),
      baseBucket: slot.charAt(0).toUpperCase() + slot.slice(1),
      startDate: date, originalStartDate: cleanText(masterTask.originalStartDate, date),
      active: true,
    };
    pendingRepeatablePlacements.add(projectId);
    setStatus(`Saving repeatable task "${masterTask.title}" to ${date}...`);
    try {
      await persistRepeatableMaster(nextMaster);
      Object.assign(masterTask, nextMaster);
      if (state.planner.tasks.some((item) => item.id === taskId
        || (item.parentRepeatableId === parentId && cleanText(item.occurrenceDate, item.date) === date))) {
        throw new Error("The occurrence changed while saving. Reload before assigning.");
      }
      state.planner.tasks.push(makeRecurringInstance(nextMaster, date));
      await savePlanner();
      const saved = state.planner.tasks.filter((item) => item.id === taskId);
      const task = saved[0];
      if (saved.length !== 1 || task.parentRepeatableId !== parentId || task.projectId !== projectId
        || task.occurrenceDate !== date || task.date !== date || task.timeSlot !== slot
        || task.deleted || task.deletedInstance) {
        throw new Error("The saved occurrence is not active at the requested destination.");
      }
      setStatus(`Added repeatable task "${masterTask.title}" to ${date} in ${slot}.`);
      return outcome("created", task);
    } catch (error) {
      throw new Error(`Repeatable placement was not confirmed. Series settings or an occurrence may have been saved. Reload before editing. ${error.message}`, { cause: error });
    } finally {
      pendingRepeatablePlacements.delete(projectId);
    }
  }

  async function restoreRepeatableOccurrence() {
    const proposal = state.restoreProposal;
    if (!proposal || state.restoreBusy) throw new Error("No restoration is available.");
    state.restoreBusy = true;
    state.restoreError = "";
    setStatus("Restoring occurrence\u2026");
    try {
      const masters = state.repeatableTasks.filter((task) => task.projectId === proposal.projectId);
      if (masters.length !== 1 || masters[0].active === false) {
        throw new Error("Another occurrence conflicts with this series and date. Restoration was blocked. Reload Planner and review the occurrences.");
      }
      await persistence;
      if (persistenceError) throw persistenceError;
      const saved = await trackWrite(plannerStorage.restoreRepeatableOccurrence(proposal));
      state.planner.tasks = state.planner.tasks.map((task) => task.id === saved.id ? saved : task);
      state.gridRevision += 1;
      state.restoreProposal = null;
      setStatus(`Restored "${proposal.title}" at ${saved.date}, ${saved.timeSlot}.`);
      return { status: "restored", taskId: saved.id, projectId: saved.projectId,
        occurrenceDate: saved.occurrenceDate, date: saved.date, timeSlot: saved.timeSlot };
    } catch (error) {
      state.restoreError = error.message;
      throw error;
    } finally {
      state.restoreBusy = false;
      notify();
    }
  }

  function findWeeklyTaskById(taskId) {
    const targetId = cleanText(taskId, "");
    if (!targetId) {
      return null;
    }

    const index = Array.isArray(state.planner.tasks)
      ? state.planner.tasks.findIndex((item) => getSlotItemId(item) === targetId)
      : -1;

    if (index < 0) {
      return null;
    }

    return {
      item: state.planner.tasks[index],
      index,
    };
  }

  function findVisibleWeeklySourceTask(taskType, sourceId) {
    const visibleDates = new Set(getVisibleWeekDateRange(state.planner.weekStartDate).map((item) => item.date));
    const targetSourceId = cleanText(sourceId, "");

    return state.planner.tasks.find((item) => {
      if (cleanText(item.taskType || item.type, "curated") !== taskType) {
        return false;
      }

      if (!visibleDates.has(cleanText(item.date, ""))) {
        return false;
      }

      return parseWeeklySourceId(item) === targetSourceId;
    }) || null;
  }

  function upsertWeeklyTaskFromSource(taskLike, date, timeSlot, taskType) {
    const normalizedDate = cleanText(date, "");
    const normalizedSlot = cleanText(timeSlot, "");
    if (!normalizedDate || !SLOT_ORDER.includes(normalizedSlot)) {
      return null;
    }

    const sourceId = cleanText(taskLike.taskId || taskLike.projectId || taskLike.id, "");
    const existingIndex = state.planner.tasks.findIndex((item) => {
      return cleanText(item.taskType || item.type, "curated") === taskType
        && parseWeeklySourceId(item) === sourceId
        && cleanText(item.date, "") === normalizedDate;
    });

    const weeklyTask = toPlannerSlotItem({
      id: existingIndex >= 0 ? state.planner.tasks[existingIndex].id : buildWeeklyTaskId(taskType, sourceId, normalizedDate),
      taskId: existingIndex >= 0 ? state.planner.tasks[existingIndex].taskId : buildWeeklyTaskId(taskType, sourceId, normalizedDate),
      date: normalizedDate,
      timeSlot: normalizedSlot,
      taskType,
      type: taskType,
      title: cleanText(taskLike.title, "Untitled Task"),
      checklist: taskType === "curated" ? normalizeChecklist(taskLike.checklist) : [],
      checklistOpen: Boolean(taskLike.checklistOpen),
      completed: Boolean(taskLike.completed),
      source: cleanText(taskLike.source, taskType === "adhoc" ? "adhoc" : taskType === "repeatable" ? "repeating" : taskType === "project" ? "home" : "unknown"),
      recurrence: cleanText(taskLike.recurrence, ""),
      projectId: cleanText(taskLike.projectId, ""),
      priority: parseNumber(taskLike.priority, null),
      metadata: { ...(taskLike.metadata || {}), sourceTaskId: sourceId },
    });

    if (existingIndex >= 0) {
      throw new Error("That occurrence already exists. Move or continue it instead of replacing its checklist.");
    } else {
      state.planner.tasks.push(weeklyTask);
    }

    return weeklyTask;
  }

  function projectOccurrences(task) {
    const masterId = cleanText(task.taskId || task.id, "");
    const sameReference = state.curatedTasks.filter((master) =>
      master.projectId && master.projectId === task.projectId && master.source === task.source);
    if (sameReference.length > 1) {
      throw new Error("Multiple Project masters use this reference. Review their identities before assigning.");
    }
    return state.planner.tasks.filter((item) => {
      if (!["curated", "project"].includes(item.taskType || item.type)) return false;
      const linkedId = cleanText(item.metadata?.sourceTaskId, "");
      const sameProject = Boolean(task.projectId) && item.projectId === task.projectId && item.source === task.source;
      const conflictingProject = (item.projectId && task.projectId && item.projectId !== task.projectId)
        || (item.source && task.source && item.source !== task.source);
      if (linkedId && ((linkedId === masterId && conflictingProject) || (linkedId !== masterId && sameProject))) {
        throw new Error("Project occurrence ownership conflicts with its source task. Review its identities before assigning.");
      }
      return linkedId ? linkedId === masterId : sameProject;
    });
  }

  function assignProjectOccurrence(task, date, slot, fresh = false) {
    const occurrences = projectOccurrences(task);
    const unfinished = occurrences.filter((item) => !item.deleted && !item.deletedInstance && !item.completed);
    if (!fresh && unfinished.length > 1) {
      throw new Error("This Project has multiple unfinished scheduled tasks. Review them before continuing; none was selected.");
    }
    if (!fresh && unfinished.length === 1) {
      moveTask(unfinished[0].id, date, slot);
      return unfinished[0];
    }
    const template = task.checklistTemplate;
    if (template == null && (fresh || occurrences.some((item) => item.checklist?.length))) {
      throw new Error("This Project has no approved checklist template. Review its historical checklist and save an authoritative template before starting new work.");
    }
    if (occurrences.some((item) => !item.deleted && !item.deletedInstance && item.date === date)) {
      throw new Error("This Project already has a task on that date. Move or review that task instead of creating a duplicate.");
    }
    return upsertWeeklyTaskFromSource({
      ...task, checklist: (template || []).map((item) => ({ id: item.id, text: item.text, completed: false })),
      completed: false,
    }, date, slot, "curated");
  }

  async function saveChecklistTemplate(taskId) {
    await persistence;
    if (persistenceError) throw persistenceError;
    const occurrence = findWeeklyTaskById(taskId)?.item;
    const masters = occurrence?.taskType === "repeatable"
      ? state.repeatableTasks.filter((task) => task.projectId === occurrence.parentRepeatableId
        && task.projectId === occurrence.projectId
        && (!occurrence.metadata?.sourceTaskId || occurrence.metadata.sourceTaskId === task.taskId))
      : state.curatedTasks.filter((task) => projectOccurrences(task).some((item) => item.id === taskId));
    if (!occurrence || masters.length !== 1) {
      throw new Error("This task has no unique Planner master. Review its identity before saving a checklist template.");
    }
    const items = normalizeChecklist(occurrence.checklist).map(({ id, text }) => ({ id, text }));
    await trackWrite(plannerStorage.saveProjectChecklistTemplate(masters[0].taskId, occurrence.id, items));
    masters[0].checklistTemplate = items.map((item) => ({ ...item, completed: false }));
    setStatus("Checklist saved for future tasks. Existing task progress was not changed.");
    return true;
  }

  async function loadRepeatableTasks() {
    const token = generation;
    try {
      await ensurePlannerAdapters();
      const projects = await plannerStorage.getProjects();
      if (destroyed || token !== generation) return;
      state.allProjects = (projects || []).map(toProjectView);
      plannerStorage.setCachedProjects(projects || []);
      const taskManagerTasks = await plannerStorage.getTaskManager();
      if (destroyed || token !== generation) return;

      const overrides = await loadRepeatableOverrides();
      if (destroyed || token !== generation) return;
      const overrideMap = new Map(overrides.map((item) => [item.projectId, item]));
      state.repeatableOverrideMap = overrideMap;

      const masters = new Map();
      for (const task of taskManagerTasks.filter((item) => normalizeSource(item.source) === "repeating" && !item.deleted)) {
        let series;
        try { series = JSON.parse(cleanText(task.metadataJson, "{}")).series; }
        catch (error) { throw new Error(`Invalid Planner task metadata: ${error.message}`, { cause: error }); }
        if (series == null) continue;
        if (typeof series !== "object" || Array.isArray(series)) {
          throw new Error("Invalid Repeatable series metadata. Reload before assigning.");
        }
        if (series.removedFromPlanner === true) continue;
        const projectId = cleanText(task.projectId, "");
        if (!REPEATABLE_PROJECT_ID.test(projectId) || !REPEATABLE_PROJECT_ID.test(task.id) || masters.has(projectId)) {
          throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
        }
        masters.set(projectId, task);
      }
      const seen = new Set();
      const repeatableTasks = [];
      const addRepeatable = (project, master, index) => {
        const override = overrideMap.get(project.projectId) || {};
        if (override.removedFromPlanner === true) return;
        if (!REPEATABLE_PROJECT_ID.test(project.projectId) || seen.has(project.projectId)
          || (override.taskId && override.taskId !== master?.id)) {
          throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
        }
        seen.add(project.projectId);

        repeatableTasks.push({
          id: project.projectId,
          taskId: master?.id || `repeatable-${project.projectId}`,
          projectId: project.projectId,
          title: cleanText(project.title, "Untitled Task"),
          source: "repeating",
          state: cleanText(project.state, "unknown"),
          recurrence: normalizeRecurrence(override.recurrence || project.recurrence),
          baseDay: cleanText(override.baseDay, ""),
          monthWeek: normalizeMonthWeek(override.monthWeek, override.startDate || override.originalStartDate || ""),
          baseBucket: cleanText(override.baseBucket, ""),
          startDate: cleanText(override.startDate, ""),
          originalStartDate: cleanText(override.originalStartDate, override.startDate || ""),
          interval: override.interval ?? 1,
          weekdays: override.weekdays || [],
          active: override.active !== false && override.removedFromPlanner !== true,
          priority: parseNumber(override.priority, parseNumber(project.priority, 3)),
          order: parseNumber(override.order, parseNumber(project.order, index + 1)),
          category: cleanText(project.category, "uncategorized"),
          asset: cleanText(project.asset, ""),
          mileage: cleanText(project.mileage, ""),
          checklistTemplate: master ? readProjectChecklistTemplate(master) : null,
        });
      };
      state.allProjects.filter((project) => normalizeSource(project.source) === "repeating")
        .forEach((project, index) => {
          if (overrideMap.get(project.projectId)?.removedFromPlanner === true) return;
          let master = masters.get(project.projectId);
          if (!master) {
            const unconfigured = taskManagerTasks.filter((task) => !task.deleted
              && normalizeSource(task.source) === "repeating" && task.projectId === project.projectId
              && JSON.parse(cleanText(task.metadataJson, "{}")).series == null);
            if (unconfigured.length > 1 || (unconfigured[0] && !REPEATABLE_PROJECT_ID.test(unconfigured[0].id))) {
              throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
            }
            master = unconfigured[0];
          }
          addRepeatable(project, master, index);
        });
      for (const [projectId, master] of masters) {
        if (seen.has(projectId)) continue;
        let metadata;
        try { metadata = JSON.parse(cleanText(master.metadataJson, "{}")); }
        catch (error) { throw new Error(`Invalid Planner task metadata: ${error.message}`, { cause: error }); }
        if (metadata.series == null) continue;
        if (typeof metadata.series !== "object" || Array.isArray(metadata.series)) {
          throw new Error("Invalid Repeatable series metadata. Reload before assigning.");
        }
        addRepeatable({ ...master, projectId }, master, repeatableTasks.length);
      }

      state.repeatableTasks = repeatableTasks;
      state.repeatableTasks.sort((left, right) => {
        const orderDifference = parseNumber(left.order, Number.MAX_SAFE_INTEGER) - parseNumber(right.order, Number.MAX_SAFE_INTEGER);
        return orderDifference || cleanText(left.title, "").localeCompare(cleanText(right.title, ""));
      });
    } catch (error) {
      if (destroyed || token !== generation) return;
      console.warn("Failed to load repeatable tasks", error);
      setStatus(`Unable to load repeatable tasks. ${error.message}`);
      throw error;
    }
  }

  function findSlotTask(day, slot, taskId) {
    const dayIndex = DAY_ORDER.findIndex((item) => item.key === day);
    if (dayIndex < 0 || !SLOT_ORDER.includes(slot)) {
      return null;
    }

    const date = getWeekDateKey(state.planner.weekStartDate, dayIndex);
    const index = state.planner.tasks.findIndex((item) => getSlotItemId(item) === taskId && cleanText(item.date, "") === date && cleanText(item.timeSlot, "") === slot);
    if (index < 0) {
      return null;
    }

    return {
      item: state.planner.tasks[index],
      index,
    };
  }

  async function saveTaskTitleEdit(taskId, newTitle) {
    const match = findWeeklyTaskById(taskId);
    if (!match) {
      return false;
    }
    const taskType = getWeeklyTaskType(match.item);
    const isProject = taskType === "project" || taskType === "curated" || match.item.source === "project";
    const projectId = cleanText(match.item.projectId || match.item.externalId || match.item.external_id, "");
    const title = cleanText(newTitle, "");
    if (!title) {
      return false;
    }
    if (isProject) {
      setStatus("Saving master project title...");
      try {
        const resolvedId = await resolveTaskMasterProjectId(match.item);
        if (!resolvedId) {
          setStatus("Project title edit canceled.");
          return false;
        }
        await updateProjectMasterTitle(resolvedId, title);
        if (resolvedId !== projectId) {
          match.item.projectId = resolvedId;
          if (match.item.title === title) {
            savePlanner();
          }
        }
      } catch (error) {
        setStatus(`Title was not saved. ${error.message} Double-click the title to retry.`);
        console.warn("Master project title update failed", error);
        return false;
      }
    }
    const saved = updateTaskTitle(taskId, title);
    if (saved && isProject) {
      setStatus("Project title saved to Planner and master project.");
    }
    return saved;
  }

  function updateTaskTitle(taskId, newTitle) {
    const match = findWeeklyTaskById(taskId);
    const title = cleanText(newTitle, "");
    if (!match || !title) {
      return false;
    }

    if (match.item.title === title) {
      return true;
    }
    match.item.title = title;
    savePlanner();
    refreshChecklist();
    return true;
  }

  async function resolveTaskMasterProjectId(task) {
    const id = cleanText(task.projectId || task.externalId || task.external_id, "");
    let projects = plannerStorage.getCachedProjects();
    let project = findExplicitProject(projects, id);
    if (!project) {
      projects = await plannerStorage.getProjects();
      plannerStorage.setCachedProjects(projects);
      project = findExplicitProject(projects, id);
    }
    if (project) {
      return project.id;
    }
    return selectTaskMasterProject(task, projects);
  }

  async function updateProjectMasterTitle(projectId, newTitle) {
    const id = cleanText(projectId, "");
    const title = cleanText(newTitle, "");
    if (!id || !title) {
      throw new Error("A project ID and title are required to update the master project.");
    }
    let projects = plannerStorage.getCachedProjects();
    if (!Array.isArray(projects)) projects = [];
    let project = projects.find(entry => cleanText(entry.id, "") === id);
    if (!project) {
      projects = await plannerStorage.getProjects();
      project = projects.find(entry => cleanText(entry.id, "") === id);
    }
    if (!project) {
      throw new Error(`Unable to locate master project ${id}. Refresh Planner and retry.`);
    }

    const updated = {
      ...project,
      title,
      metadata: {
        ...(project.metadata || {}),
      },
    };
    const result = await plannerStorage.updateProject(updated);
    if (result && result.ok === false) {
      throw new Error(cleanText(result.error, "Unable to save the master project title."));
    }

    const cachedProjects = plannerStorage.getCachedProjects();
    const lists = [projects, cachedProjects];
    lists.filter(Array.isArray).forEach(list => {
      list.forEach(entry => {
        if (cleanText(entry.id, "") === id) {
          entry.title = title;
        }
      });
    });
    plannerStorage.setCachedProjects(Array.isArray(cachedProjects) ? cachedProjects : projects);
    const view = getProjectById(id);
    if (view) {
      view.title = title;
    }
    if (window.location.hash.replace("#", "") === "workbench" && typeof window.loadWorkbench === "function") {
      await window.loadWorkbench();
    }
    return true;
  }

  function updateChecklistItem(taskId, itemId, newText) {
    const match = findWeeklyTaskById(taskId);
    const text = cleanText(newText, "");
    const checklist = match && Array.isArray(match.item.checklist) ? match.item.checklist : [];
    const item = checklist.find(entry => cleanText(entry.id, "") === cleanText(itemId, ""));
    if (!item || !text) {
      return false;
    }

    if (item.text === text) {
      return true;
    }
    item.text = text;
    savePlanner();
    refreshChecklist();
    return true;
  }

  function toggleChecklistOpen(taskId, day, slot) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project" && taskType !== "adhoc")) {
      return false;
    }

    match.item.checklistOpen = !match.item.checklistOpen;
    savePlanner();
    setStatus(`Checklist ${match.item.checklistOpen ? "expanded" : "collapsed"} for "${match.item.title}".`);
    return true;
  }

  function toggleChecklistItem(taskId, day, slot, checklistId, completed) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project" && taskType !== "adhoc")) {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const item = checklist.find((entry) => cleanText(entry.id, "") === cleanText(checklistId, ""));
    if (!item) {
      return false;
    }

    item.completed = Boolean(completed);
    match.item.checklist = checklist;
    savePlanner();
    setStatus(`Checklist updated for "${match.item.title}".`);
    return true;
  }

  function addChecklistItem(taskId, day, slot, text) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project" && taskType !== "adhoc")) {
      return false;
    }

    const normalizedText = cleanText(text, "");
    if (!normalizedText) {
      setStatus("Sub-task text is required.");
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    checklist.push({
      id: `check-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      text: normalizedText,
      completed: false,
    });

    match.item.checklist = checklist;
    match.item.checklistOpen = true;
    savePlanner();
    setStatus(`Added sub-task to "${match.item.title}".`);
    return true;
  }

  function removeChecklistItem(taskId, day, slot, checklistId) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project" && taskType !== "adhoc")) {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const before = checklist.length;
    match.item.checklist = checklist.filter((entry) => cleanText(entry.id, "") !== cleanText(checklistId, ""));

    if (before === match.item.checklist.length) {
      return false;
    }

    savePlanner();
    setStatus(`Removed sub-task from "${match.item.title}".`);
    return true;
  }

  function reorderChecklistItem(taskId, day, slot, fromChecklistId, toChecklistId) {
    const match = findSlotTask(day, slot, taskId);
    if (!match || cleanText(match.item.type, "curated") !== "curated") {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const fromId = cleanText(fromChecklistId, "");
    const toId = cleanText(toChecklistId, "");
    const fromIndex = checklist.findIndex((entry) => cleanText(entry.id, "") === fromId);
    const toIndex = checklist.findIndex((entry) => cleanText(entry.id, "") === toId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return false;
    }

    const [moved] = checklist.splice(fromIndex, 1);
    checklist.splice(toIndex, 0, moved);

    match.item.checklist = checklist;
    savePlanner();
    return true;
  }

  function setTaskCompleted(taskId, day, slot, completed) {
    const match = findSlotTask(day, slot, taskId);
    if (!match) {
      return false;
    }

    match.item.completed = Boolean(completed);
    savePlanner();
    return true;
  }

  function buildAssignmentMap() {
    const map = new Map();

    const visibleDates = new Set(getVisibleWeekDateRange(state.planner.weekStartDate).map((item) => item.date));
    state.planner.tasks.forEach((item) => {
      const taskType = cleanText(item.taskType || item.type, "curated");
      const sourceId = parseWeeklySourceId(item);
      if (taskType !== "curated" || !sourceId || !visibleDates.has(cleanText(item.date, ""))) {
        return;
      }

      if (!map.has(sourceId)) {
        map.set(sourceId, {
          date: cleanText(item.date, ""),
          slot: cleanText(item.timeSlot, ""),
        });
      }
    });

    return map;
  }

  async function sendReminder(task, sendAt) {
    await persistence;
    if (persistenceError) throw persistenceError;
    task.reminder = await reminderService.schedule(structuredClone(task), sendAt);
    showReminderConfirmation(task.id, `Google Calendar notification set for ${formatReminderTime(sendAt)}`);
  }

  async function resetReminder(task, newSendAt) {
    await sendReminder(task, newSendAt);
  }

  async function deleteReminder(task) {
    await persistence;
    if (persistenceError) throw persistenceError;
    task.reminder = await reminderService.cancel(structuredClone(task));
    showReminderConfirmation(task.id, "Google Calendar notification disabled.");
  }

  function findRepeatableMaster(parentRepeatableId) {
    const parentId = cleanText(parentRepeatableId, "");
    const matches = state.repeatableTasks.filter((master) => master.projectId === parentId);
    if (matches.length > 1) throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
    return matches[0] || null;
  }

  function updateGeneratedSeriesInstances(master, fromDate) {
    const parentId = cleanText(master.id || master.projectId, "");
    const threshold = cleanText(fromDate, "");
    const removedIds = new Set();
    for (const item of state.planner.tasks) {
      const occurrenceDate = cleanText(item.occurrenceDate, item.date);
      if (cleanText(item.parentRepeatableId, "") !== parentId || item.overridden
        || item.deleted || item.deletedInstance || (threshold && occurrenceDate < threshold)) continue;
      if (!getOccurrenceDatesInRange(master, occurrenceDate, occurrenceDate).includes(occurrenceDate)) {
        removedIds.add(item.id);
        continue;
      }
      item.timeSlot = cleanText(master.baseBucket, "Morning").toLowerCase();
      item.bucket = item.timeSlot;
      item.recurrence = master.recurrence;
    }
    removeWeeklyRows((item) => removedIds.has(item.id));
  }

  function saveSeriesChanges(master, currentInstance, values) {
    const parentId = cleanText(master.id || master.projectId, "");
    requireCancelledReminders(state.planner.tasks.filter((item) =>
      cleanText(item.parentRepeatableId, "") === parentId || parseWeeklySourceId(item) === parentId));
    const currentDate = cleanText(currentInstance.date, currentInstance.occurrenceDate);
    let threshold;

    const recurrence = normalizeRecurrence(values.recurrence);
    const baseDay = cleanText(values.baseDay, master.baseDay || "Monday");
    if (baseDay !== master.baseDay) master.weekdays = [baseDay.slice(0, 3)];
    if (recurrence !== master.recurrence) master.interval = 1;
    master.recurrence = recurrence;
    master.baseDay = baseDay;
    master.monthWeek = normalizeMonthWeek(values.monthWeek, currentDate);
    master.baseBucket = cleanText(values.baseBucket, master.baseBucket || "Morning");
    master.active = true;

    if (values.applyScope === "this-future") {
      master.startDate = alignDateToSeriesPattern(currentDate, master.recurrence, master.baseDay, master.monthWeek);
      threshold = master.startDate;
    } else if (values.applyScope === "entire") {
      threshold = "";
      const originalStart = cleanText(master.originalStartDate, master.startDate || currentDate);
      master.startDate = alignDateToSeriesPattern(originalStart, master.recurrence, master.baseDay, master.monthWeek);
      master.originalStartDate = master.startDate;
    } else {
      const currentAnchor = alignDateToSeriesPattern(currentDate, master.recurrence, master.baseDay, master.monthWeek);
      master.startDate = addRecurrenceInterval(currentAnchor, master.recurrence, 1, master);
      threshold = master.startDate;
    }

    updateGeneratedSeriesInstances(master, threshold);
    persistRepeatableMaster(master);
    generateVisibleRecurringInstances();
    savePlanner();
    setStatus(`Updated recurrence series for "${master.title}".`);
  }

  function deleteRepeatableSeries(master) {
    const parentId = cleanText(master.id || master.projectId, "");
    requireCancelledReminders(state.planner.tasks.filter((item) =>
      cleanText(item.parentRepeatableId, "") === parentId || parseWeeklySourceId(item) === parentId));
    const override = state.repeatableOverrideMap.get(parentId) || {};
    state.repeatableOverrideMap.set(parentId, {
      ...override,
      projectId: parentId,
      id: parentId,
      title: cleanText(master.title, "Untitled Task"),
      recurrence: normalizeRecurrence(master.recurrence || override.recurrence),
      baseDay: "",
      monthWeek: "",
      baseBucket: cleanText(master.baseBucket, override.baseBucket || "Morning"),
      startDate: "",
      originalStartDate: "",
      active: false,
      removedFromPlanner: false,
    });
    const masterIndex = state.repeatableTasks.findIndex((item) => cleanText(item.id || item.projectId, "") === parentId);
    if (masterIndex >= 0) {
      state.repeatableTasks[masterIndex] = {
        ...state.repeatableTasks[masterIndex],
        recurrence: normalizeRecurrence(master.recurrence || state.repeatableTasks[masterIndex].recurrence),
        baseDay: "",
        monthWeek: "",
        startDate: "",
        originalStartDate: "",
        active: false,
      };
    }
    removeWeeklyRows((item) => cleanText(item.parentRepeatableId, "") === parentId);
    saveRepeatableOverrides([state.repeatableOverrideMap.get(parentId)]);
    savePlanner();
    setStatus(`Deleted recurrence series "${master.title}" and kept it in Repeatable Tasks.`);
  }

  function reorderCuratedTasks(fromTaskId, toTaskId, targetSide) {
    const fromId = cleanText(fromTaskId, "");
    const toId = cleanText(toTaskId, "");
    const fromIndex = state.curatedTasks.findIndex((task) => cleanText(task.taskId, "") === fromId);
    if (fromIndex < 0) {
      return false;
    }

    const [moved] = state.curatedTasks.splice(fromIndex, 1);

    if (toId) {
      const toIndex = state.curatedTasks.findIndex((task) => cleanText(task.taskId, "") === toId);
      if (toIndex < 0) {
        state.curatedTasks.splice(fromIndex, 0, moved);
        return false;
      }

      state.curatedTasks.splice(toIndex, 0, moved);
    } else {
      const insertIndex = targetSide === "left"
        ? 0
        : state.curatedTasks.length;
      state.curatedTasks.splice(insertIndex, 0, moved);
    }

    saveCuratedTasks();
    return true;
  }

  async function consumeStagedQueue() {
    const token = generation;
    const records = await plannerStorage.getStagedTasks();
    if (destroyed || token !== generation) return;
    const staged = records.map((record) => record.item);
    let changed = false;

    if (!Array.isArray(staged) || !staged.length) {
      return;
    }

    staged.forEach((entry) => {
      const normalizedSource = normalizeSource(cleanText(entry.source, "unknown"));
      const normalizedTaskId = cleanText(entry.taskId, "") || cleanText(entry.projectId, "") || cleanText(entry.id, "");
      if (!normalizedTaskId) {
        return;
      }

      const normalizedProjectId = cleanText(entry.projectId, normalizedTaskId);

      if (normalizedSource === "repeating") {
        if (!REPEATABLE_PROJECT_ID.test(normalizedProjectId)) {
          throw new Error("Repeatable task ownership is ambiguous. Reload before assigning.");
        }
        const repeatableIndex = state.repeatableTasks.findIndex((item) => item.projectId === normalizedProjectId);
        const existingTaskId = state.repeatableTasks[repeatableIndex]?.taskId;
        const repeatableRecord = {
          id: normalizedProjectId,
          taskId: state.repeatableOverrideMap.get(normalizedProjectId)?.taskId
            || (REPEATABLE_PROJECT_ID.test(existingTaskId) ? existingTaskId
              : REPEATABLE_PROJECT_ID.test(normalizedTaskId) && normalizedTaskId !== normalizedProjectId
                ? normalizedTaskId : `repeatable-${normalizedProjectId}`),
          projectId: normalizedProjectId,
          title: cleanText(entry.title, "Untitled Repeatable Task"),
          source: "repeating",
          state: cleanText(entry.state, "unknown"),
          recurrence: normalizeRecurrence(cleanText(entry.recurrence, "")),
          interval: entry.interval ?? 1,
          weekdays: entry.weekdays || [],
          baseDay: cleanText(entry.baseDay, ""),
          monthWeek: normalizeMonthWeek(cleanText(entry.monthWeek, ""), cleanText(entry.startDate || entry.originalStartDate, "")),
          active: true,
          priority: parseNumber(entry.priority, 3),
          order: parseNumber(entry.order, state.repeatableTasks.length + 1),
          category: cleanText(entry.category, "uncategorized"),
          asset: cleanText(entry.asset, ""),
          mileage: cleanText(entry.mileage, ""),
          checklistTemplate: readProjectChecklistTemplate(entry),
        };

        if (repeatableIndex >= 0) {
          state.repeatableTasks[repeatableIndex] = {
            ...state.repeatableTasks[repeatableIndex],
            ...repeatableRecord,
          };
        } else {
          state.repeatableTasks.push(repeatableRecord);
        }

        const override = state.repeatableOverrideMap.get(normalizedProjectId) || {};
        state.repeatableOverrideMap.set(normalizedProjectId, {
          ...override,
          projectId: normalizedProjectId,
          id: normalizedProjectId,
          taskId: REPEATABLE_PROJECT_ID.test(repeatableRecord.taskId) ? repeatableRecord.taskId : override.taskId,
          title: repeatableRecord.title,
          state: repeatableRecord.state,
          category: repeatableRecord.category,
          recurrence: repeatableRecord.recurrence,
          interval: repeatableRecord.interval,
          weekdays: repeatableRecord.weekdays,
          baseDay: cleanText(repeatableRecord.baseDay, override.baseDay || "Monday"),
          monthWeek: normalizeMonthWeek(cleanText(repeatableRecord.monthWeek, ""), cleanText(entry.startDate || entry.originalStartDate, "")),
          baseBucket: cleanText(entry.baseBucket, override.baseBucket || "Morning"),
          startDate: cleanText(entry.startDate, override.startDate || ""),
          originalStartDate: cleanText(entry.originalStartDate, override.originalStartDate || entry.startDate || ""),
          active: true,
          removedFromPlanner: false,
          priority: repeatableRecord.priority,
          order: repeatableRecord.order,
          asset: repeatableRecord.asset,
          mileage: repeatableRecord.mileage,
        });

        saveRepeatableOverrides([state.repeatableOverrideMap.get(normalizedProjectId)]);

        if (state.planner && Array.isArray(state.planner.tasks)) {
          const weekStart = cleanText(state.planner.weekStartDate, getWeekStartISO(new Date()));
          const currentWeekDate = cleanText(weekStart, "");
          const isAlreadyScheduled = state.planner.tasks.some((item) => {
            const parentId = cleanText(item.parentRepeatableId, "") || cleanText(item.projectId, "");
            return cleanText(parentId, "") === normalizedProjectId && cleanText(item.date, "") === currentWeekDate;
          });

          if (!isAlreadyScheduled) {
            const newMaster = {
              ...repeatableRecord,
              id: normalizedProjectId,
              projectId: normalizedProjectId,
              baseDay: cleanText(repeatableRecord.baseDay, getDayName(currentWeekDate)),
              monthWeek: normalizeMonthWeek(cleanText(repeatableRecord.monthWeek, ""), currentWeekDate),
              baseBucket: cleanText(entry.baseBucket, "Morning"),
              startDate: cleanText(entry.startDate, currentWeekDate),
              originalStartDate: cleanText(entry.originalStartDate, entry.startDate || currentWeekDate),
              active: true,
            };

            const scheduled = makeRecurringInstance(newMaster, currentWeekDate);
            state.planner.tasks.push(scheduled);
            savePlanner();
          }
        }

        changed = true;
        return;
      }

      const existingIndex = state.curatedTasks.findIndex((item) => item.taskId === normalizedTaskId || item.projectId === normalizedProjectId);

      const upsertRecord = {
        taskId: normalizedTaskId,
        projectId: normalizedProjectId,
        title: cleanText(entry.title, "Untitled Task"),
        source: cleanText(entry.source, "unknown"),
        category: cleanText(entry.category, "uncategorized"),
        recurrence: cleanText(entry.recurrence, ""),
        priority: parseNumber(entry.priority, 3),
        order: parseNumber(entry.order, state.curatedTasks.length + 1),
        checklistTemplate: readProjectChecklistTemplate(entry),
      };

      if (existingIndex >= 0) {
        state.curatedTasks[existingIndex] = {
          ...state.curatedTasks[existingIndex],
          ...upsertRecord,
        };
      } else {
        if (state.curatedTasks.length >= CURATED_TASK_LIMIT) {
          showCuratedWarning("You already have 8 curated tasks. Remove one or convert this task to an ad-hoc task.");
          return;
        }

        state.curatedTasks.push(upsertRecord);
      }

      changed = true;
    });

    if (changed) {
      saveCuratedTasks();
      hideCuratedWarning();
      setStatus("Staged tasks were added to the planner queue. Review the list and schedule them as needed.");
    }
    await persistence;
    if (persistenceError) throw persistenceError;
    await plannerStorage.deleteStagedTasks(records.map((record) => record.id));
  }

  async function refreshWeather() {
    if (weatherRequest || Date.now() - weatherLastFetchedAt < 20 * 60 * 1000) return weatherRequest;
    weatherRequest = fetch(buildWeatherApiUrl())
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather forecast request failed with ${response.status}`);
        const weather = normalizeWeatherForecast(await response.json());
        if (!destroyed) {
          state.weatherByDate = { ...state.weatherByDate, ...weather };
          state.gridRevision += 1;
        }
      })
      .catch((error) => { console.debug("Weather forecast unavailable", error); })
      .finally(() => { weatherLastFetchedAt = Date.now(); weatherRequest = null; notify(); });
    return weatherRequest;
  }
  async function refreshParking() {
    await persistence;
    const request = ++refreshRequest;
    const [planner, curatedTasks] = await Promise.all([loadPlanner(), loadCuratedTasks()]);
    if (destroyed || request !== refreshRequest || pendingWrites) return;
    state.planner = planner;
    state.curatedTasks = curatedTasks;
    state.gridRevision += 1;
    notify();
  }
  async function initialize() {
    destroyed = false;
    const token = ++generation;
    state.loading = true;
    state.error = "";
    persistenceError = null;
    notify();
    await ensurePlannerAdapters();
    if (destroyed || token !== generation) return;
    state.mode = "Supabase mode";
    const [planner, curatedTasks] = await Promise.all([loadPlanner(), loadCuratedTasks()]);
    if (destroyed || token !== generation) return;
    state.planner = planner;
    state.curatedTasks = curatedTasks;
    state.selectedCalendarDate = planner.weekStartDate;
    state.calendarMonthDate = toMonthStartDateKey(state.selectedCalendarDate);
    notify();
    await loadRepeatableTasks();
    if (destroyed || token !== generation) return;
    await consumeStagedQueue();
    if (destroyed || token !== generation) return;
    state.loading = false;
    state.backupReloadRequired = false;
    if (!state.error && !state.status.startsWith("Unable")) setStatus(`Planning week of ${state.planner.weekStartDate}.`);
    unsubscribe?.();
    unsubscribe = plannerStorage.onChange((detail) => {
      if (detail?.type === "weekly-task-sync-error") {
        persistenceError = new Error(cleanText(detail.error, "Unable to synchronize Weekly Planner."));
        report(persistenceError);
        return;
      }
      if (detail?.type !== "weekly-snapshot-saved" && !pendingWrites && !state.backupBusy) void refreshParking().catch(report);
    });
    void refreshWeather();
    notify();
  }
  function reorderCuratedByPlacement(fromIndex, targetGlobalIndex, side) {
    if (fromIndex < 0 || fromIndex >= state.curatedTasks.length) return false;
    const next = [...state.curatedTasks];
    const [moved] = next.splice(fromIndex, 1);
    let insertIndex = targetGlobalIndex == null ? (side === "left" ? 0 : Math.min(4, next.length)) : targetGlobalIndex;
    if (targetGlobalIndex != null && targetGlobalIndex > fromIndex) insertIndex -= 1;
    insertIndex = Math.max(0, Math.min(insertIndex, next.length));
    next.splice(insertIndex, 0, moved);
    state.curatedTasks = next;
    saveCuratedTasks();
    return true;
  }
  function dropOnSlot(payload, day, date, slot, placement = {}) {
    if (!payload || !SLOT_ORDER.includes(slot)) throw new Error("Please select a valid task and time slot.");
    if (payload.kind === "curated-reorder") return assignTask(payload.taskId, day, slot);
    if (payload.kind === "weekly-move") {
      const existing = findWeeklyTaskById(payload.taskId);
      if (existing?.item.date === date && existing.item.timeSlot === slot) {
        return reorderWeeklyTask(payload.taskId, placement);
      }
      return moveTask(payload.taskId, date, slot, placement);
    }
    if (payload.kind === "repeatable-copy") {
      const master = state.repeatableTasks.find((task) => task.projectId === payload.projectId);
      if (!master) throw new Error("Unable to locate that repeatable task.");
      return createWeeklyRepeatableCopy(master, date, slot);
    }
    if (payload.kind === "parking-item" && payload.item) {
      const item = payload.item;
      const convertedType = cleanText(item.convertedTo?.type, "project");
      const taskType = convertedType === "task-manager" ? "adhoc" : convertedType === "repeatable" ? "repeatable" : "project";
      const sourceId = cleanText(item.convertedTo?.id, cleanText(item.id, ""));
      const projectId = cleanText(item.projectId,
        ["project", "repeatable"].includes(convertedType) ? sourceId : "");
      const id = buildWeeklyTaskId(taskType, sourceId, date);
      const task = toPlannerSlotItem({
        id, taskId: id, date, timeSlot: slot, taskType, type: taskType,
        title: cleanText(item.title, "Untitled Task"),
        source: taskType === "adhoc" ? "adhoc" : taskType === "repeatable" ? "repeating" : "home",
        recurrence: "", projectId, priority: 3, checklist: [], checklistOpen: false, completed: false,
        metadata: { parkingLotSourceId: cleanText(item.id, ""), parkingLotConvertedType: convertedType },
      });
      state.planner.tasks.push(task);
      savePlanner();
      setStatus(`Placed parking item "${task.title}" on ${date} ${slot}.`);
      return true;
    }
    throw new Error("This item cannot be placed in the weekly planner.");
  }
  function getSeries(taskId) {
    const current = findWeeklyTaskById(taskId)?.item;
    if (!current?.parentRepeatableId) throw new Error("Unable to locate that recurrence series.");
    const master = findRepeatableMaster(current.parentRepeatableId) || {
      id: cleanText(current.parentRepeatableId, ""), projectId: cleanText(current.projectId, ""),
      title: cleanText(current.title, "Untitled Task"), recurrence: cleanText(current.recurrence, "weekly"),
      baseDay: getDayName(cleanText(current.occurrenceDate, current.date)),
      baseBucket: cleanText(current.timeSlot, "morning").replace(/^./, (character) => character.toUpperCase()),
      startDate: cleanText(current.occurrenceDate, current.date),
      originalStartDate: cleanText(current.occurrenceDate, current.date), active: true,
    };
    return { master, current };
  }
  async function openLinks(taskId) {
    const project = getProjectFromTaskId(taskId);
    if (!project) throw new Error("Unable to locate project resource links.");
    const entries = parseResourceLinkEntries(project.resourceLinkEntries || project.resourceLinks);
    if (!entries.length) { setStatus("No resource links available for this project."); return; }
    const request = ++linksRequest;
    state.modal = { type: "links", title: project.title, loading: true, entries: [] };
    notify();
    const titles = await Promise.all(entries.map((entry) => entry.title || resolveLinkTitle(entry.url)));
    if (request !== linksRequest || destroyed) return;
    state.modal = { type: "links", title: project.title, loading: false,
      entries: entries.map((entry, index) => ({ ...entry, title: cleanText(titles[index], entry.url) })) };
  }
  function closeDialogs() {
    if (!state.restoreBusy) {
      state.restoreProposal = null;
      state.restoreError = "";
    }
    linksRequest += 1;
    state.modal = null;
    state.reminderTaskId = "";
    state.seriesTaskId = "";
    state.moveTaskId = "";
    state.activeAdhocChecklist = null;
    if (linkResolve) { const resolve = linkResolve; linkResolve = null; resolve(null); }
    state.linkProject = null;
  }
  const operations = {
    restoreRepeatableOccurrence,
    cancelRestore() {
      if (state.restoreBusy) return;
      state.restoreProposal = null;
      state.restoreError = "";
    },
    async backupOperation(operation) {
      if (state.loading) throw new Error("Wait for Planner to finish loading before using backups.");
      if (state.reminderBusy) throw new Error("Wait for the Calendar notification operation before using backups.");
      state.backupBusy = true;
      notify();
      let operationError;
      let result;
      try {
        await persistence;
        if (persistenceError) throw persistenceError;
        result = await operation();
      } catch (error) {
        operationError = error;
      }
      const wasReloadRequired = state.backupReloadRequired;
      state.backupReloadRequired = true;
      let reloadError;
      try {
        await refreshParking();
        await loadRepeatableTasks();
        state.backupReloadRequired = false;
        if (wasReloadRequired) {
          state.error = "";
          state.status = "Planner reloaded after backup.";
        }
      } catch (error) { reloadError = error; }
      finally { state.backupBusy = false; notify(); }
      if (reloadError) throw new Error(`${operationError ? `${operationError.message} ` : ""}Planner reload failed: ${reloadError.message}. Editing is blocked; retry a backup operation or reload Planner.`, { cause: reloadError });
      if (operationError) throw operationError;
      return result;
    },
    initialize, refreshParking, shiftPlannerWeek, goToCurrentWeek, jumpPlannerToDate,
    assignTask, saveChecklistTemplate, addAdHocTask, removeTask, removeTaskFromPlanner, removeTaskFromCurated,
    removeRepeatableMaster, saveTaskTitleEdit, updateTaskTitle, updateProjectMasterTitle,
    updateChecklistItem, toggleChecklistOpen, toggleChecklistItem, addChecklistItem,
    removeChecklistItem, reorderChecklistItem, setTaskCompleted, reorderCuratedByPlacement,
    consumeStagedQueue, generateVisibleRecurringInstances, getTaskProject, getSeries,
    assignEntryToSlot, findVisibleWeeklySourceTask, removeWeeklyCopiesForRepeatable,
    buildAssignmentMap, reorderCuratedTasks,
    moveTaskToDate, moveTask, reorderWeeklyTask, openLinks, closeDialogs, setStatus,
    setDrag(payload) { state.drag = payload; state.dropTarget = ""; },
    setDropTarget(target) { state.dropTarget = target; },
    changeMonth(offset) { state.calendarMonthDate = addMonthsToDateKey(state.calendarMonthDate, offset); },
    openWeather(date) { linksRequest += 1; state.modal = { type: "weather", date }; },
    openMove(taskId) { state.moveTaskId = taskId; },
    closeMove() { state.moveTaskId = ""; },
    openReminder(taskId) { state.reminderTaskId = taskId; },
    connectReminders: () => reminderService.connect(),
    closeReminder() { state.reminderTaskId = ""; },
    openSeries(taskId) { getSeries(taskId); state.seriesTaskId = taskId; },
    closeSeries() { state.seriesTaskId = ""; },
    openChecklist(taskId, day, slot) {
      if (!findSlotTask(day, slot, taskId)) { setStatus("Unable to locate that task."); return false; }
      state.activeAdhocChecklist = { taskId, day, slot };
    },
    refreshChecklist,
    closeChecklist() { state.activeAdhocChecklist = null; },
    closeWeather() { linksRequest += 1; state.modal = null; },
    selectMaster(id) {
      const resolve = linkResolve;
      linkResolve = null;
      state.linkProject = null;
      resolve?.(id || null);
    },
    saveSeries(taskId, values) { const { master, current } = getSeries(taskId); saveSeriesChanges(master, current, values); state.seriesTaskId = ""; },
    deleteSeries(taskId) { deleteRepeatableSeries(getSeries(taskId).master); state.seriesTaskId = ""; },
    async reminder(taskId, action, selection, time) {
      const task = findWeeklyTaskById(taskId)?.item;
      if (!task) throw new Error("Unable to locate that Planner task.");
      state.reminderBusy = true;
      try {
        if (action === "delete") await deleteReminder(task);
        else if (action === "reset") await resetReminder(task, getReminderSendAt(task, selection, time));
        else await sendReminder(task, getReminderSendAt(task, selection, time));
        state.reminderTaskId = "";
      } finally { state.reminderBusy = false; }
    },
    dropOnSlot,
  };
  const actions = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, (...args) => {
    if (destroyed && name !== "initialize") return undefined;
    try {
      if (name === "getTaskProject" || name === "getSeries") return operation(...args);
      if (name === "cancelRestore") { const result = operation(...args); notify(); return result; }
      if (state.restoreProposal && !["restoreRepeatableOccurrence", "setDrag", "setDropTarget", "closeDialogs"].includes(name)) {
        throw new Error("Finish or cancel the restoration decision before editing.");
      }
      if (state.restoreBusy && !["setDrag", "setDropTarget", "closeDialogs"].includes(name)) {
        throw new Error("Wait for occurrence restoration to finish before editing.");
      }
      if (state.backupReloadRequired && name !== "backupOperation" && name !== "initialize") {
        throw new Error("Planner must reload after a backup operation before editing. Retry a backup operation or reload Planner.");
      }
      if (state.backupBusy) throw new Error("Planner backup is in progress. Wait before editing.");
      if (persistenceError && !["initialize", "backupOperation", "closeMove", "closeReminder", "closeChecklist", "closeSeries", "closeWeather"].includes(name)) {
        throw new Error(`Planner has an unsaved change. Reload before editing. ${persistenceError.message}`);
      }
      if (state.reminderBusy) throw new Error("A Calendar notification operation is in progress. Wait before editing.");
      const result = operation(...args);
      if (!state.loading && [
        "shiftPlannerWeek", "goToCurrentWeek", "jumpPlannerToDate", "assignTask", "addAdHocTask",
        "moveTask", "moveTaskToDate", "reorderWeeklyTask", "removeTask", "saveTaskTitleEdit", "updateTaskTitle",
        "updateChecklistItem", "toggleChecklistOpen", "toggleChecklistItem", "addChecklistItem",
        "removeChecklistItem", "reorderChecklistItem", "setTaskCompleted", "saveSeries", "deleteSeries",
        "dropOnSlot", "reminder", "refreshParking",
      ].includes(name)) void refreshWeather();
      notify();
      if (result && typeof result.then === "function") return result.then((value) => { notify(); return value; }, (error) => { report(error); throw error; });
      return result;
    } catch (error) { report(error); throw error; }
  }]));
  return {
    actions, getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    destroy() {
      destroyed = true;
      generation += 1;
      refreshRequest += 1;
      closeDialogs();
      unsubscribe?.();
      unsubscribe = null;
      timers.forEach(clearTimeout);
      timers.clear();
      listeners.clear();
    },
    async flush() { await persistence; if (persistenceError) throw persistenceError; },
  };
}


// Append to src/services/plannerService.js; shared helpers/adapters are supplied by that module.

const PARKING_COLORS = { parking: "#d1d5db", project: "#7c3aed", adHoc: "#0f766e", repeatable: "#7c3aed" };
const PARKING_FALLBACK_OPTIONS = {
  category: ["Repair", "Maintenance", "Build", "Organize", "Install", "Clean", "SAR", "Travel", "Family", "Miscellaneous"],
  state: ["Not Started", "In Progress", "Recommended", "Completed"],
  priority: ["Low", "Medium", "High"],
};

function parkingJson(value, fallback) {
  const text = cleanText(value, fallback);
  try {
    JSON.parse(text);
    return text;
  } catch {
    return fallback;
  }
}

export function parseParkingItem(item = {}) {
  return {
    ...(Object.hasOwn(item, "projectId") ? { projectId: cleanText(item.projectId, "") } : {}),
    id: cleanText(item.id, ""),
    title: cleanText(item.title, "Untitled Idea"),
    notes: cleanText(item.notes, ""),
    createdAt: cleanText(item.createdAt, ""),
    updatedAt: cleanText(item.updatedAt, ""),
    source: cleanText(item.source, "parking-lot"),
    tags: cleanText(item.tags, ""),
    priority: cleanText(item.priority, "low"),
    convertedTo: item.convertedTo && typeof item.convertedTo === "object" ? { ...item.convertedTo } : null,
    color: cleanText(item.color, ""),
    checklistJson: parkingJson(item.checklistJson, "[]"),
    reminderJson: parkingJson(item.reminderJson, "{}"),
    metadataJson: parkingJson(item.metadataJson, "{}"),
    deleted: Boolean(item.deleted),
    convertedFromParking: cleanText(item.convertedFromParking, ""),
  };
}

export function getParkingItemColor(item) {
  const type = item.convertedTo?.type;
  if (type === "project") return cleanText(item.color, PARKING_COLORS.project);
  if (type === "repeatable") return PARKING_COLORS.repeatable;
  if (type === "ad-hoc" || type === "task-manager") return PARKING_COLORS.adHoc;
  return cleanText(item.color, PARKING_COLORS.parking);
}

export async function loadParkingItems() {
  await ensurePlannerAdapters();
  const items = await plannerStorage.getParkingLot();
  return (Array.isArray(items) ? items : []).map(parseParkingItem).filter((item) => !item.deleted);
}

export function subscribeParkingChanges(listener) {
  return plannerStorage.onChange((detail) => {
    if (detail?.type?.startsWith("parking-lot-")) listener(detail);
  });
}

function invalidateParkingProjects() {
  plannerStorage.invalidateCachedProjects();
}

export function getParkingDropdownValues(dropdowns, field) {
  const values = Array.isArray(dropdowns?.[field]) ? dropdowns[field] : [];
  return values.length ? values : (PARKING_FALLBACK_OPTIONS[field] || []);
}

async function loadParkingDropdowns() {
  const projects = await plannerStorage.getProjects();
  return Object.fromEntries(["home", "vehicle", "repeating", "misc"].map((source) => {
    const matching = projects.filter((project) => normalizeSource(project.source) === source);
    return [source, Object.fromEntries(["category", "state", "priority", "area", "property"].map((field) =>
      [field, [...new Set(matching.map((project) => cleanText(
        project.metadata?.[field] ?? project[field], ""
      )).filter(Boolean))]]
    ))];
  }));
}

function parkingProjectSource(source) {
  const value = cleanSource(source);
  return ["home", "vehicle", "repeating", "misc"].includes(value) ? value : "";
}

function findExplicitProject(projects, id, source = "") {
  if (!Array.isArray(projects) || !cleanText(id, "")) return null;
  const matches = projects.filter((project) =>
    (!source || parkingProjectSource(project.source) === source)
    && [project.id, project.projectId, project.externalId, project.external_id]
      .some((value) => cleanText(value, "") === cleanText(id, "")));
  if (matches.length > 1) throw new Error(`Project identity ${id} is ambiguous. An explicit unique UUID is required.`);
  return matches[0] || null;
}

async function removeParkingConversion(conversion, targetType) {
  if (!conversion?.type || conversion.type === targetType) return;
  if (conversion.type === "task-manager" || conversion.type === "ad-hoc") {
    await plannerStorage.deleteTaskManagerTask(conversion.id);
  } else if (conversion.type === "project" || conversion.type === "repeatable") {
    assertProjectWriteAllowed("delete");
  } else if (conversion.type === "weekly") {
    await plannerStorage.deleteWeeklyTask(conversion.id, { hardDelete: false });
  }
}

async function createParkingConversion(item, convertTo) {
  if (convertTo === "task-manager" || convertTo === "ad-hoc") {
    const converted = await plannerStorage.upsertTaskManagerTask({
      ...(["task-manager", "ad-hoc"].includes(item.convertedTo?.type) ? { id: item.convertedTo.id } : {}),
      taskId: item.id, projectId: "", title: item.title,
      source: "parking-lot", category: "uncategorized", state: "unknown",
      asset: "", mileage: "", recurrence: "", priority: 3, order: undefined,
    });
    return { ...item, convertedTo: { type: "task-manager", id: converted.id || converted.taskId }, color: PARKING_COLORS.adHoc };
  }
  if (convertTo === "project" || convertTo === "repeatable") {
    throw new Error("Only edits to existing projects are authorized here; Parking project and repeatable conversions are not authorized.");
  }
  return item;
}

export async function convertParkingItem(item, convertTo) {
  const previous = parseParkingItem(item);
  const next = await createParkingConversion(previous, convertTo);
  try {
    await removeParkingConversion(previous.convertedTo, convertTo);
  } catch (error) {
    // Keep the original conversion usable if its removal cannot be verified.
    try {
      await removeParkingConversion(next.convertedTo, "");
    } catch (rollbackError) {
      invalidateParkingProjects();
      throw new Error(`${error.message} The replacement could not be removed: ${rollbackError.message}`, { cause: rollbackError });
    }
    throw error;
  }
  const saved = await plannerStorage.upsertParkingItem(next);
  invalidateParkingProjects();
  return parseParkingItem(saved);
}

export async function saveParkingItem(existing, values) {
  const next = parseParkingItem({
    id: existing.id, createdAt: existing.createdAt, convertedTo: existing.convertedTo,
    color: existing.color, checklistJson: existing.checklistJson,
    reminderJson: existing.reminderJson, metadataJson: existing.metadataJson,
    deleted: existing.deleted, convertedFromParking: existing.convertedFromParking,
    title: values.title, notes: values.notes,
  });
  const converted = await createParkingConversion(next, values.convertTo);
  const saved = await plannerStorage.upsertParkingItem(converted);
  invalidateParkingProjects();
  return parseParkingItem(saved);
}

export function deleteParkingItem(id) {
  return plannerStorage.deleteParkingItem(id, { hardDelete: true });
}

export async function removeParkingProject(item) {
  if (!["project", "repeatable"].includes(item.convertedTo?.type)) return item;
  await removeParkingConversion(item.convertedTo, "");
  const saved = await plannerStorage.upsertParkingItem({ ...parseParkingItem(item), convertedTo: null, color: "" });
  invalidateParkingProjects();
  return parseParkingItem(saved);
}

export async function parkPlannerPayload(payload) {
  if (!payload || !["weekly-move", "parking-item"].includes(payload.kind)) return null;
  const source = payload.weeklyTask || payload.item || payload;
  if (!source.id) return null;
  const item = parseParkingItem({
    title: source.title, notes: source.notes, tags: source.tags, color: source.color,
    checklistJson: JSON.stringify(source.checklist || []),
    reminderJson: JSON.stringify(source.reminder || {}),
    metadataJson: JSON.stringify(source.metadata || {}),
    convertedTo: { type: "weekly", id: source.id }, convertedFromParking: source.id,
  });
  const saved = await plannerStorage.upsertParkingItem(item);
  await plannerStorage.deleteWeeklyTask(source.id, { hardDelete: false });
  return parseParkingItem(saved);
}

export async function loadParkingProjectEditor(item) {
  const conversion = item.convertedTo || {};
  const id = cleanText(conversion.id, "");
  let project = findExplicitProject(plannerStorage.getCachedProjects(), id);
  if (!project) {
    try {
      const projects = await plannerStorage.getProjects();
      project = findExplicitProject(projects, id);
    } catch (error) {
      throw new Error("Unable to load projects for in-place edit.", { cause: error });
    }
  }
  if (!project) throw new Error(`Project ${id} was not found. Supply an explicit UUID or external_id; title/row matching is disabled.`);
  const source = parkingProjectSource(project.source);
  const nextItem = parseParkingItem({
    ...item,
    convertedTo: { type: conversion.type, id: project.id },
  });
  const metadata = { ...project.metadata };
  const dropdowns = await loadParkingDropdowns();
  const sourceDropdowns = dropdowns[source] || {};
  return {
    item: nextItem, source,
    project: { ...project, metadata },
    dropdowns,
    values: {
      title: cleanText(item.title, cleanText(project.title, "Untitled Project")), source,
      category: cleanText(project.category, "uncategorized"),
      state: cleanText(project.state, "unknown"),
      priority: cleanText(metadata.priority, getParkingDropdownValues(sourceDropdowns, "priority")[0] || ""), order: cleanText(metadata.order, ""),
      area: cleanText(metadata.area, (sourceDropdowns.area || [])[0] || ""), property: cleanText(metadata.property, ""),
      dateCompleted: cleanText(metadata.dateCompleted, ""),
    },
  };
}

export async function saveParkingProjectEditor(editor, values, onStatus = () => {}) {
  const { project, source, item } = editor;
  const metadata = project.metadata || {};
  const title = cleanText(values.title, cleanText(project.title, "Untitled Project"));
  const property = String(values.property ?? "").trim();
  const fields = {
    category: cleanText(values.category, cleanText(project.category, "uncategorized")),
    state: cleanText(values.state, cleanText(project.state, "unknown")),
    priority: cleanText(values.priority, cleanText(metadata.priority, "")),
    order: cleanText(values.order, cleanText(metadata.order, "")),
    area: cleanText(values.area, cleanText(metadata.area, "")),
    dateCompleted: cleanText(values.dateCompleted, cleanText(metadata.dateCompleted, "")),
  };
  if (values.source !== source) {
    assertProjectWriteAllowed("move");
  }
  const nextProject = {
    ...project, title, category: fields.category, state: fields.state,
    metadata: {
      ...metadata, priority: fields.priority, order: fields.order, area: fields.area,
      property, _clearProperty: property === "", dateCompleted: fields.dateCompleted,
    },
  };
  const nextItem = { ...item, title };
  onStatus("Saving...");
  await plannerStorage.updateProject(nextProject);
  const saved = await plannerStorage.upsertParkingItem(nextItem);
  invalidateParkingProjects();
  return parseParkingItem(saved);
}

export async function saveParkingAdHocTitle(item, title) {
  const nextTitle = cleanText(title, cleanText(item.title, "Untitled Idea"));
  return parseParkingItem(await plannerStorage.upsertParkingItem({ ...item, title: nextTitle }));
}
