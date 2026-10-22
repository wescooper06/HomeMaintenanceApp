// Legacy Calendar helpers and React transitions; adapters load only when requested.

import { cleanText, toDateKey } from "./plannerService.js";

export { cleanText, toDateKey };

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // eslint-disable-next-line no-useless-escape -- Keep the legacy expression unchanged.
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildMonthRange(monthDate) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
  return { monthStart, monthEnd };
}

export function formatEventDate(event) {
  const dateValue = cleanText(
    event && event.start && (event.start.dateTime || event.start.date),
    ""
  );
  if (!dateValue) {
    return "Unknown date";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function normalizeDateKey(value) {
  const text = cleanText(value, "");
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : toDateKey(parsed);
}

export function toDateTimeInputValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function toRfc3339LocalString(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMinutes = date.getTimezoneOffset();
  const offsetSign = offsetMinutes <= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteMinutes % 60).padStart(2, "0");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetRemainder}`;
}

export function toLocalDateTimeString(dateInput, timeInput) {
  const dateText = cleanText(dateInput, "");
  const timeText = cleanText(timeInput, "00:00");
  if (!dateText) {
    return "";
  }

  const parsed = new Date(`${dateText}T${timeText}`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offsetMinutes = parsed.getTimezoneOffset();
  const offsetSign = offsetMinutes <= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteMinutes % 60).padStart(2, "0");
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetRemainder}`;
}

export function getPlannerWeekStart(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return toDateKey(new Date());
  }

  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
}

export function mapEventTimeToBucket(dateTimeValue, allDayFallback) {
  if (!dateTimeValue) {
    return allDayFallback ? "All Day" : "Morning";
  }

  const date = new Date(dateTimeValue);
  if (Number.isNaN(date.getTime())) {
    return allDayFallback ? "All Day" : "Morning";
  }

  const hours = date.getHours();
  if (hours < 12) {
    return "Morning";
  }
  if (hours < 17) {
    return "Afternoon";
  }
  return "Evening";
}

export function startOfDay(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + days);
  return date;
}

export function parseEventDateTime(event) {
  const dateTime = cleanText(event && event.start && event.start.dateTime, "");
  const dateOnly = cleanText(event && event.start && event.start.date, "");

  if (dateTime) {
    const parsed = new Date(dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (dateOnly) {
    const parsed = new Date(`${dateOnly}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function parseEventSpan(event) {
  const startInfo = event && event.start ? event.start : {};
  const endInfo = event && event.end ? event.end : {};

  const startDate = parseEventDateTime(event);
  if (!startDate) {
    return null;
  }

  const isAllDay = Boolean(cleanText(startInfo.date, "") && !cleanText(startInfo.dateTime, ""));
  let endDate = null;

  if (cleanText(endInfo.dateTime, "")) {
    endDate = new Date(endInfo.dateTime);
    if (!Number.isNaN(endDate.getTime())
      && endDate.getHours() === 0
      && endDate.getMinutes() === 0
      && endDate.getSeconds() === 0
      && endDate.getMilliseconds() === 0) {
      endDate = new Date(endDate.getTime() - 1);
    }
  } else if (cleanText(endInfo.date, "")) {
    const exclusiveEndDate = new Date(`${endInfo.date}T00:00:00`);
    if (!Number.isNaN(exclusiveEndDate.getTime())) {
      endDate = new Date(exclusiveEndDate.getTime() - 1);
    }
  }

  if (!endDate || Number.isNaN(endDate.getTime())) {
    endDate = new Date(startDate.getTime());
  }

  if (endDate.getTime() < startDate.getTime()) {
    endDate = new Date(startDate.getTime());
  }

  const startDay = startOfDay(startDate);
  const endDay = startOfDay(endDate);
  if (!startDay || !endDay) {
    return null;
  }

  return {
    startDate,
    startDay,
    endDay,
    isAllDay,
  };
}

export function getEventIdentity(event) {
  return cleanText(event && event.id, "");
}

export function formatEventTime(event) {
  const dateTime = cleanText(event && event.start && event.start.dateTime, "");
  if (!dateTime) {
    return "All day";
  }

  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTimeDisplay(value, isAllDay) {
  const text = cleanText(value, "");
  if (!text) {
    return "-";
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  const options = isAllDay
    ? { weekday: "long", month: "short", day: "numeric" }
    : { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

  return parsed.toLocaleString(undefined, options);
}

export function normalizeCalendarEvents(items) {
  return (items || [])
    .flatMap((event) => {
      const span = parseEventSpan(event);
      if (!span) {
        return [];
      }

      const eventTitle = cleanText(event && event.summary, "Untitled event");
      const eventDescription = cleanText(event && event.description, "");
      const eventTime = formatEventTime(event);
      const entries = [];

      for (let cursor = new Date(span.startDay.getTime()); cursor.getTime() <= span.endDay.getTime(); cursor = addDays(cursor, 1)) {
        const dateKey = toDateKey(cursor);
        if (!dateKey) {
          continue;
        }

        entries.push({
          date: new Date(cursor.getTime()),
          dateKey,
          dateLabel: formatEventDate(event),
          title: eventTitle,
          description: eventDescription,
          time: cursor.getTime() === span.startDay.getTime() ? eventTime : (span.isAllDay ? "All day" : "Continues"),
          spanStart: span.startDay.getTime(),
          spanEnd: span.endDay.getTime(),
          raw: event,
        });
      }

      return entries;
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.date.getTime() !== b.date.getTime()) {
        return a.date.getTime() - b.date.getTime();
      }

      if (a.spanStart !== b.spanStart) {
        return a.spanStart - b.spanStart;
      }

      return a.title.localeCompare(b.title);
    });
}

export function getMonthGridStart(monthStart) {
  const date = new Date(monthStart.getTime());
  const dayOfWeek = date.getDay();
  const offset = dayOfWeek;
  date.setDate(date.getDate() - offset);
  return date;
}

export function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function formatModalDateLabel(event) {
  const start = event && event.start ? event.start : {};
  const value = cleanText(start.dateTime || start.date, "");
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function getEventSpanForInputs(event) {
  const start = event && event.start ? event.start : {};
  const end = event && event.end ? event.end : {};
  const startValue = cleanText(start.dateTime || start.date, "");
  const endValue = cleanText(end.dateTime || end.date, "");
  const startDateOnly = cleanText(start.date, "");
  const endDateOnly = cleanText(end.date, "");

  const parsedStart = startValue ? new Date(startValue) : null;
  const parsedEnd = endValue ? new Date(endValue) : null;

  if (startDateOnly && !cleanText(start.dateTime, "")) {
    const exclusiveEnd = endDateOnly ? new Date(`${endDateOnly}T00:00:00`) : null;
    const inclusiveEnd = exclusiveEnd && !Number.isNaN(exclusiveEnd.getTime())
      ? addDays(exclusiveEnd, -1)
      : null;
    return {
      startDateValue: startDateOnly,
      endDateValue: inclusiveEnd ? toDateKey(inclusiveEnd) : startDateOnly,
      startTimeValue: "00:00",
      endTimeValue: "23:59",
      startDateStartTimeValue: "00:00",
      startDateEndTimeValue: "23:59",
      endDateStartTimeValue: "00:00",
      endDateEndTimeValue: "23:59",
    };
  }

  const startDateKey = start.date || (parsedStart && !Number.isNaN(parsedStart.getTime()) ? toDateKey(parsedStart) : "");
  const endDateKey = end.date || (parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? toDateKey(parsedEnd) : startDateKey);
  const startTimeText = parsedStart && !Number.isNaN(parsedStart.getTime()) ? toDateTimeInputValue(parsedStart).split("T")[1] : "";
  const endTimeText = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? toDateTimeInputValue(parsedEnd).split("T")[1] : "";

  return {
    startDateValue: startDateKey,
    endDateValue: endDateKey,
    startTimeValue: startTimeText,
    endTimeValue: endTimeText,
    startDateStartTimeValue: startTimeText,
    startDateEndTimeValue: endDateKey === startDateKey ? endTimeText : "23:59",
    endDateStartTimeValue: endDateKey === startDateKey ? startTimeText : "00:00",
    endDateEndTimeValue: endTimeText,
  };
}

export function getCreateDefaults() {
  const now = new Date();
  const start = new Date(now.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(0);
  if (start.getHours() < 8) {
    start.setHours(9);
  }
  const end = new Date(start.getTime() + (60 * 60 * 1000));

  return {
    title: "",
    dateValue: toDateKey(start),
    startTime: toDateTimeInputValue(start).split("T")[1],
    endTime: toDateTimeInputValue(end).split("T")[1],
    startDateStartTime: toDateTimeInputValue(start).split("T")[1],
    startDateEndTime: toDateTimeInputValue(end).split("T")[1],
    endDateStartTime: toDateTimeInputValue(start).split("T")[1],
    endDateEndTime: toDateTimeInputValue(end).split("T")[1],
    location: "",
    description: "",
  };
}

export function buildStartEndForSubmit(startDate, startTime, endDate, endTime) {
  const safeStartDate = cleanText(startDate, "");
  const safeEndDate = cleanText(endDate, safeStartDate);
  const safeStartTime = cleanText(startTime, "00:00");
  const safeEndTime = cleanText(endTime, "23:59");

  if (!safeStartDate) {
    return {
      startDateTime: "",
      endDateTime: "",
    };
  }

  let effectiveEndDate = safeEndDate || safeStartDate;
  if (effectiveEndDate === safeStartDate && safeEndTime <= safeStartTime) {
    const endBase = addDays(new Date(`${safeStartDate}T00:00:00`), 1);
    effectiveEndDate = endBase ? toDateKey(endBase) : safeStartDate;
  }

  return {
    startDateTime: toLocalDateTimeString(safeStartDate, safeStartTime),
    endDateTime: toLocalDateTimeString(effectiveEndDate, safeEndTime),
  };
}

export function formatAttendees(attendees) {
  if (!Array.isArray(attendees) || !attendees.length) {
    return "-";
  }

  return attendees
    .map((attendee) => cleanText(attendee && (attendee.displayName || attendee.email), "Attendee"))
    .join(", ");
}

export function getUniqueEventCount(events) {
  const ids = new Set();

  events.forEach((event) => {
    const id = cleanText(getEventIdentity(event.raw), `${event.title}-${event.dateKey}`);
    ids.add(id);
  });

  return ids.size;
}

export function getCalendarEventById(events, eventId, dateKey) {
  const targetId = cleanText(eventId, "");
  if (!targetId) {
    return null;
  }

  const targetDateKey = normalizeDateKey(dateKey);
  if (targetDateKey) {
    const exact = events.find((event) => getEventIdentity(event.raw) === targetId && normalizeDateKey(event.dateKey) === targetDateKey);
    if (exact) {
      return exact;
    }
  }

  return events.find((event) => getEventIdentity(event.raw) === targetId) || null;
}

export function getPlannerEventIdSet(planner) {
  const ids = new Set();

  (planner.tasks || []).forEach((task) => {
    if (cleanText(task && task.source, "") !== "google-calendar") {
      return;
    }

    const projectId = cleanText(task && task.projectId, "");
    const taskDateKey = normalizeDateKey(task && task.date);
    if (projectId && taskDateKey) {
      ids.add(`${projectId}|${taskDateKey}`);
    }
  });

  return ids;
}

export function getCalendarMonth(monthDate, offset) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
}

export function getCurrentCalendarMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function buildCalendarEventsQuery(monthDate) {
  const { monthStart, monthEnd } = buildMonthRange(monthDate);
  return new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    timeMin: monthStart.toISOString(),
    timeMax: monthEnd.toISOString(),
    showDeleted: "false",
  });
}

export function renderMonthGrid(state, plannerEventIds) {
  const monthLabel = state.currentMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const updatedAtLabel = state.lastUpdatedAt
      ? `Updated at ${state.lastUpdatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : "";

  const eventsByDate = new Map();
  state.events.forEach((event) => {
    if (!eventsByDate.has(event.dateKey)) {
      eventsByDate.set(event.dateKey, []);
    }
    eventsByDate.get(event.dateKey).push(event);
  });

  const today = new Date();
  const monthStart = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
  const monthEnd = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 0);
  const gridStart = getMonthGridStart(monthStart);

  const weekdayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((label) => `<div class="calendar-weekday">${label}</div>`)
    .join("");

  const dayCells = Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart.getTime());
    cellDate.setDate(gridStart.getDate() + index);
    const key = toDateKey(cellDate);
    const events = eventsByDate.get(key) || [];
    const isOutsideMonth = cellDate < monthStart || cellDate > monthEnd;
    const classNames = ["calendar-day-cell"];
    if (isOutsideMonth) {
      classNames.push("is-outside");
    }
    if (isSameDay(cellDate, today)) {
      classNames.push("is-today");
    }

    const chips = events.map((event) => {
      const eventId = getEventIdentity(event.raw);
      const occurrenceKey = `${eventId}|${normalizeDateKey(event.dateKey)}`;
      const inPlanner = plannerEventIds.has(occurrenceKey);
      return `
          <div class="calendar-event-item" draggable="true" data-action="drag-event" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(event.dateKey)}">
            <div class="calendar-event-card" data-event-id="${escapeHtml(eventId)}" title="${escapeHtml(event.title)}">
              ${inPlanner ? '<span class="calendar-planner-indicator" aria-label="In Planner" title="Added to Planner">P</span>' : ""}
              <button type="button" class="calendar-event-open" data-action="open-event" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(event.dateKey)}" aria-label="Open event ${escapeHtml(event.title)}">
                <span class="calendar-event-chip">
                ${event.time ? `<span class="calendar-event-chip-time">${escapeHtml(event.time)}</span>` : ""}
                <span>${escapeHtml(event.title)}</span>
                ${event.description ? `<span class="calendar-event-chip-description">${escapeHtml(event.description)}</span>` : ""}
                </span>
              </button>
              <div class="calendar-event-actions">
                <button type="button" class="calendar-edit-pill" data-action="toggle-edit" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(event.dateKey)}">Edit</button>
                <button type="button" class="calendar-add-planner" data-action="add-to-planner" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(event.dateKey)}">Add to Planner</button>
              </div>
            </div>
          </div>
        `;
    }).join("");

    return `
        <article class="${classNames.join(" ")}" data-date-key="${key}">
          <div class="calendar-day-number">${cellDate.getDate()}</div>
          <div class="calendar-day-events">${chips}</div>
        </article>
      `;
  }).join("");

  const html = `
      <section class="calendar-month-grid" aria-label="Monthly calendar">
        <div class="calendar-weekday-row">${weekdayHeaders}</div>
        <div class="calendar-days-grid">${dayCells}</div>
      </section>
    `;
  return { monthLabel, updatedAtLabel, html };
}

export function renderCreateEventDialog() {
  const defaults = getCreateDefaults();
  return `
        <div class="weather-modal-card" role="dialog" aria-modal="true" aria-label="Add calendar event">
          <header class="weather-modal-header">
            <div>
              <h3 class="weather-modal-title">Add Event</h3>
              <p class="weather-modal-location">Google Calendar</p>
            </div>
            <button type="button" class="weather-modal-close" data-action="modal-close" aria-label="Close event modal">X</button>
          </header>
          <div class="weather-modal-body">
            <div class="weather-modal-form">
              <div class="weather-modal-field field-full">
                <label for="eventEditTitle">Title</label>
                <input id="eventEditTitle" type="text" value="${escapeHtml(defaults.title)}" />
              </div>
              <div class="weather-modal-time-column">
                <h4 class="weather-modal-column-title">Start Date</h4>
                <div class="weather-modal-field">
                  <label for="eventEditStartDate">Date</label>
                  <input id="eventEditStartDate" type="date" value="${escapeHtml(defaults.dateValue)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditStartDateStartTime">Start time</label>
                  <input id="eventEditStartDateStartTime" type="time" value="${escapeHtml(defaults.startDateStartTime)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditStartDateEndTime">End time</label>
                  <input id="eventEditStartDateEndTime" type="time" value="${escapeHtml(defaults.startDateEndTime)}" />
                </div>
              </div>
              <div class="weather-modal-time-column">
                <h4 class="weather-modal-column-title">End Date</h4>
                <div class="weather-modal-field">
                  <label for="eventEditEndDate">Date</label>
                  <input id="eventEditEndDate" type="date" value="${escapeHtml(defaults.dateValue)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditEndDateStartTime">Start time</label>
                  <input id="eventEditEndDateStartTime" type="time" value="${escapeHtml(defaults.endDateStartTime)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditEndDateEndTime">End time</label>
                  <input id="eventEditEndDateEndTime" type="time" value="${escapeHtml(defaults.endDateEndTime)}" />
                </div>
              </div>
              <div class="weather-modal-field field-full">
                <label for="eventEditLocation">Location</label>
                <input id="eventEditLocation" type="text" value="${escapeHtml(defaults.location)}" />
              </div>
              <div class="weather-modal-field field-full">
                <label for="eventEditDescription">Description</label>
                <textarea id="eventEditDescription">${escapeHtml(defaults.description)}</textarea>
              </div>
            </div>
            <div class="weather-modal-actions">
              <button type="button" class="primary" data-action="create-event">Create Event</button>
              <button type="button" data-action="modal-close">Cancel</button>
            </div>
          </div>
        </div>
      `;
}

export function renderEditEventDialog(event) {
  const rawEvent = event && event.raw ? event.raw : event;
  const eventId = getEventIdentity(rawEvent);
  const occurrenceDateKey = normalizeDateKey(event && event.dateKey) || normalizeDateKey(rawEvent.start && (rawEvent.start.date || rawEvent.start.dateTime));
  const defaults = getEventSpanForInputs(rawEvent);
  return `
        <div class="weather-modal-card" role="dialog" aria-modal="true" aria-label="Edit calendar event">
          <header class="weather-modal-header">
            <div>
              <h3 class="weather-modal-title">Edit Event</h3>
              <p class="weather-modal-location">Google Calendar</p>
            </div>
            <button type="button" class="weather-modal-close" data-action="modal-close" aria-label="Close event modal">X</button>
          </header>
          <div class="weather-modal-body">
            <div class="weather-modal-form">
              <div class="weather-modal-field field-full">
                <label for="eventEditTitle">Title</label>
                <input id="eventEditTitle" type="text" value="${escapeHtml(cleanText(rawEvent.summary, ""))}" />
              </div>
              <div class="weather-modal-time-column">
                <h4 class="weather-modal-column-title">Start Date</h4>
                <div class="weather-modal-field">
                  <label for="eventEditStartDate">Date</label>
                  <input id="eventEditStartDate" type="date" value="${escapeHtml(defaults.startDateValue)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditStartDateStartTime">Start time</label>
                  <input id="eventEditStartDateStartTime" type="time" value="${escapeHtml(defaults.startDateStartTimeValue)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditStartDateEndTime">End time</label>
                  <input id="eventEditStartDateEndTime" type="time" value="${escapeHtml(defaults.startDateEndTimeValue)}" />
                </div>
              </div>
              <div class="weather-modal-time-column">
                <h4 class="weather-modal-column-title">End Date</h4>
                <div class="weather-modal-field">
                  <label for="eventEditEndDate">Date</label>
                  <input id="eventEditEndDate" type="date" value="${escapeHtml(defaults.endDateValue)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditEndDateStartTime">Start time</label>
                  <input id="eventEditEndDateStartTime" type="time" value="${escapeHtml(defaults.endDateStartTimeValue)}" />
                </div>
                <div class="weather-modal-field">
                  <label for="eventEditEndDateEndTime">End time</label>
                  <input id="eventEditEndDateEndTime" type="time" value="${escapeHtml(defaults.endDateEndTimeValue)}" />
                </div>
              </div>
              <div class="weather-modal-field field-full">
                <label for="eventEditLocation">Location</label>
                <input id="eventEditLocation" type="text" value="${escapeHtml(cleanText(rawEvent.location, ""))}" />
              </div>
              <div class="weather-modal-field field-full">
                <label for="eventEditDescription">Description</label>
                <textarea id="eventEditDescription">${escapeHtml(cleanText(rawEvent.description, ""))}</textarea>
              </div>
            </div>
            <div class="weather-modal-actions">
              <button type="button" class="primary" data-action="save-event" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(occurrenceDateKey)}">Save Changes</button>
              <button type="button" class="danger" data-action="delete-event" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(occurrenceDateKey)}">Delete Event</button>
              <button type="button" data-action="cancel-edit">Cancel</button>
            </div>
          </div>
        </div>
      `;
}

export function renderEventDetailsDialog(event) {
  const rawEvent = event && event.raw ? event.raw : event;
  const eventId = getEventIdentity(rawEvent);
  const occurrenceDateKey = normalizeDateKey(event && event.dateKey) || normalizeDateKey(rawEvent.start && (rawEvent.start.date || rawEvent.start.dateTime));
  const start = rawEvent.start || {};
  const end = rawEvent.end || {};
  const recurrence = Array.isArray(rawEvent.recurrence) ? rawEvent.recurrence.join("\n") : cleanText(rawEvent.recurrence, "-");
  const isAllDay = Boolean(cleanText(start.date, "") && !cleanText(start.dateTime, ""));

  return `
      <div class="weather-modal-card" role="dialog" aria-modal="true" aria-label="Calendar event details">
        <header class="weather-modal-header">
          <div>
            <h3 class="weather-modal-title">${escapeHtml(cleanText(rawEvent.summary, "Untitled event"))}</h3>
            <p class="weather-modal-location">Google Calendar</p>
          </div>
          <button type="button" class="weather-modal-close" data-action="modal-close" aria-label="Close event modal">X</button>
        </header>
        <div class="weather-modal-body">
          <div class="weather-modal-grid">
            <div class="weather-modal-item"><strong>Date:</strong> ${escapeHtml(formatModalDateLabel(rawEvent) || "-")}</div>
            <div class="weather-modal-item"><strong>Start:</strong> ${escapeHtml(formatDateTimeDisplay(start.dateTime || start.date, isAllDay))}</div>
            <div class="weather-modal-item"><strong>End:</strong> ${escapeHtml(formatDateTimeDisplay(end.dateTime || end.date, isAllDay))}</div>
            <div class="weather-modal-item"><strong>Location:</strong> ${escapeHtml(cleanText(rawEvent.location, "-"))}</div>
          </div>
          <div class="weather-modal-item"><strong>Description:</strong><br>${escapeHtml(cleanText(rawEvent.description, "-"))}</div>
          <div class="weather-modal-item"><strong>Recurrence:</strong><br>${recurrence ? escapeHtml(recurrence).replace(/\n/g, "<br>") : "-"}</div>
          <div class="weather-modal-item"><strong>Attendees:</strong><br>${escapeHtml(formatAttendees(rawEvent.attendees))}</div>
          <div class="weather-modal-actions">
            <button type="button" class="primary" data-action="toggle-edit" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(occurrenceDateKey)}">Edit Event</button>
            <button type="button" class="primary" data-action="add-to-planner" data-event-id="${escapeHtml(eventId)}" data-date-key="${escapeHtml(occurrenceDateKey)}">Add to Planner</button>
            <button type="button" data-action="modal-close">Close</button>
          </div>
        </div>
      </div>
    `;
}

export function buildEventUpdatePayloads(selected, updatedData) {
  if (!selected) throw new Error("Event not found.");
  const baseEvent = selected.raw || selected;
  const timezone = cleanText(baseEvent.start && baseEvent.start.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles");
  const patchPayload = {};

  if (Object.prototype.hasOwnProperty.call(updatedData, "summary")) {
    patchPayload.summary = cleanText(updatedData.summary, cleanText(baseEvent.summary, "Untitled event"));
  }
  if (Object.prototype.hasOwnProperty.call(updatedData, "description")) {
    patchPayload.description = cleanText(updatedData.description, cleanText(baseEvent.description, ""));
  }
  if (Object.prototype.hasOwnProperty.call(updatedData, "location")) {
    patchPayload.location = cleanText(updatedData.location, cleanText(baseEvent.location, ""));
  }

  const allDayStartDate = cleanText(updatedData.allDayStartDate, "");
  const allDayEndDate = cleanText(updatedData.allDayEndDate, "");
  if (allDayStartDate && allDayEndDate) {
    patchPayload.start = { date: allDayStartDate };
    patchPayload.end = { date: allDayEndDate };
  } else {
    const startDateTime = cleanText(updatedData.startDateTime, cleanText(baseEvent.start && baseEvent.start.dateTime, ""));
    const endDateTime = cleanText(updatedData.endDateTime, cleanText(baseEvent.end && baseEvent.end.dateTime, ""));
    if (startDateTime && endDateTime) {
      patchPayload.start = {
        dateTime: startDateTime,
        timeZone: timezone,
      };
      patchPayload.end = {
        dateTime: endDateTime,
        timeZone: timezone,
      };
    }
  }

  const putPayload = {
    ...baseEvent,
    summary: Object.prototype.hasOwnProperty.call(updatedData, "summary")
      ? cleanText(updatedData.summary, cleanText(baseEvent.summary, "Untitled event"))
      : cleanText(baseEvent.summary, "Untitled event"),
    description: Object.prototype.hasOwnProperty.call(updatedData, "description")
      ? cleanText(updatedData.description, cleanText(baseEvent.description, ""))
      : cleanText(baseEvent.description, ""),
    location: Object.prototype.hasOwnProperty.call(updatedData, "location")
      ? cleanText(updatedData.location, cleanText(baseEvent.location, ""))
      : cleanText(baseEvent.location, ""),
  };
  if (patchPayload.start && patchPayload.end) {
    putPayload.start = patchPayload.start;
    putPayload.end = patchPayload.end;
  }

  return { patchPayload, putPayload };
}

export function buildEventMoveData(selected, targetDateKey, sourceDateKey) {
  if (!selected) {
    throw new Error("Event not found.");
  }

  const baseEvent = selected.raw || selected;
  const span = parseEventSpan(baseEvent);
  if (!span) {
    throw new Error("Unable to determine event span.");
  }

  const targetDay = startOfDay(`${cleanText(targetDateKey, "")}T00:00:00`);
  if (!targetDay) {
    throw new Error("Invalid target day.");
  }

  const sourceDay = startOfDay(`${normalizeDateKey(sourceDateKey) || toDateKey(span.startDay)}T00:00:00`) || span.startDay;
  const dayDelta = Math.round((targetDay.getTime() - sourceDay.getTime()) / (24 * 60 * 60 * 1000));
  if (!dayDelta) {
    return;
  }

  if (span.isAllDay) {
    const newStartDay = addDays(span.startDay, dayDelta);
    const newEndDay = addDays(span.endDay, dayDelta);
    const exclusiveEndDay = addDays(newEndDay, 1);
    return {
      allDayStartDate: toDateKey(newStartDay),
      allDayEndDate: toDateKey(exclusiveEndDay),
    };
  }

  const startDateTime = cleanText(baseEvent.start && baseEvent.start.dateTime, "");
  const endDateTime = cleanText(baseEvent.end && baseEvent.end.dateTime, "");
  const parsedStart = new Date(startDateTime);
  const parsedEnd = endDateTime ? new Date(endDateTime) : new Date(parsedStart.getTime() + (60 * 60 * 1000));
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    throw new Error("Event has invalid start/end times.");
  }

  const durationMs = Math.max(60 * 1000, parsedEnd.getTime() - parsedStart.getTime());
  const shiftedStart = new Date(targetDay.getTime());
  shiftedStart.setHours(parsedStart.getHours(), parsedStart.getMinutes(), parsedStart.getSeconds(), parsedStart.getMilliseconds());
  const shiftedEnd = new Date(shiftedStart.getTime() + durationMs);

  return {
    startDateTime: toRfc3339LocalString(shiftedStart),
    endDateTime: toRfc3339LocalString(shiftedEnd),
  };
}

export function buildEventCreatePayload(newData) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  const payload = {
    summary: cleanText(newData.summary, "Untitled event"),
    description: cleanText(newData.description, ""),
    location: cleanText(newData.location, ""),
    start: {
      dateTime: cleanText(newData.startDateTime, ""),
      timeZone: timezone,
    },
    end: {
      dateTime: cleanText(newData.endDateTime, ""),
      timeZone: timezone,
    },
  };

  return payload;
}

export function buildPlannerEventAdditions(event, occurrenceDateKey, planner) {
  const rawEvent = event && event.raw ? event.raw : event;
  if (!rawEvent) {
    throw new Error("Unable to add event to Planner.");
  }

  const rawStart = rawEvent.start || {};
  const isAllDay = Boolean(cleanText(rawEvent.start && rawEvent.start.date, "") && !cleanText(rawEvent.start && rawEvent.start.dateTime, ""));
  const bucket = isAllDay
    ? "All Day"
    : mapEventTimeToBucket(rawEvent.start && rawEvent.start.dateTime, false);
  const timeSlot = bucket === "Morning" ? "morning" : bucket === "Afternoon" ? "afternoon" : bucket === "Evening" ? "evening" : "morning";
  const sourceDate = normalizeDateKey(occurrenceDateKey) || cleanText(rawStart.date || (rawStart.dateTime ? toDateKey(new Date(rawStart.dateTime)) : ""), "");
  const span = parseEventSpan(rawEvent);
  const dateKeysToAdd = [];

  if (span && span.startDay && span.endDay) {
    for (let cursor = new Date(span.startDay.getTime()); cursor.getTime() <= span.endDay.getTime(); cursor = addDays(cursor, 1)) {
      const key = toDateKey(cursor);
      if (key) {
        dateKeysToAdd.push(key);
      }
    }
  }

  if (!dateKeysToAdd.length && sourceDate) {
    dateKeysToAdd.push(sourceDate);
  }

  const eventProjectId = cleanText(rawEvent.id, "");
  // Shape the legacy snapshot without mutating the caller's task collection.
  const existingTasks = Array.isArray(planner.tasks) ? [...planner.tasks] : [];
  const additions = [];

  dateKeysToAdd.forEach((dateKey) => {
    const duplicate = existingTasks.find((task) => {
      return cleanText(task && task.source, "") === "google-calendar"
        && cleanText(task && task.projectId, "") === eventProjectId
        && normalizeDateKey(task && task.date) === dateKey;
    });

    if (duplicate) {
      return;
    }

    const plannerId = `google-${eventProjectId || dateKey}-${dateKey}`;
    const record = {
      id: plannerId,
      taskId: plannerId,
      title: cleanText(rawEvent.summary, "Untitled event"),
      notes: cleanText(rawEvent.description, ""),
      date: dateKey,
      bucket,
      timeSlot,
      type: "adhoc",
      taskType: "adhoc",
      source: "google-calendar",
      checklist: [],
      checklistOpen: false,
      completed: false,
      projectId: eventProjectId,
      recurrence: "",
      priority: null,
      metadata: { notes: cleanText(rawEvent.description, ""), allDay: isAllDay },
    };

    existingTasks.push(record);
    additions.push(record);
  });

  const updatedPlanner = { ...planner, tasks: existingTasks };

  return { planner: updatedPlanner, additions, dateKeysToAdd, sourceDate };
}

export function syncDateTimeFields(values) {
  const isSingleDay = cleanText(values.startDate, "") === cleanText(values.endDate, "");
  return {
    ...values,
    endDateStartTime: isSingleDay ? values.startDateStartTime : values.endDateStartTime,
    endDateEndTime: isSingleDay ? values.startDateEndTime : values.endDateEndTime,
    disabled: isSingleDay,
    ariaDisabled: isSingleDay ? "true" : "false",
  };
}

export function buildEventSubmitData(values) {
  const startDate = cleanText(values.startDate, "");
  const endDate = cleanText(values.endDate, startDate);
  const startTime = cleanText(values.startDateStartTime, "00:00");
  const sameDayEndFallback = cleanText(values.startDateEndTime, "23:59");
  const multiDayEndTime = cleanText(values.endDateEndTime, sameDayEndFallback);
  const endTime = startDate === endDate ? sameDayEndFallback : multiDayEndTime;
  const submitSpan = buildStartEndForSubmit(startDate, startTime, endDate, endTime);
  return {
    summary: cleanText(values.title, "Untitled event"),
    description: cleanText(values.description, ""),
    location: cleanText(values.location, ""),
    startDateTime: submitSpan.startDateTime,
    endDateTime: submitSpan.endDateTime,
  };
}

export function buildCalendarGrid(monthDate, events, plannerEventIds, today = new Date()) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const gridStart = getMonthGridStart(monthStart);
  const eventsByDate = new Map();
  events.forEach((event) => {
    if (!eventsByDate.has(event.dateKey)) eventsByDate.set(event.dateKey, []);
    eventsByDate.get(event.dateKey).push(event);
  });
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime());
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateKey(date);
    return {
      dateKey,
      dayNumber: date.getDate(),
      outside: date < monthStart || date > monthEnd,
      today: isSameDay(date, today),
      events: (eventsByDate.get(dateKey) || []).map((event) => ({
        ...event,
        eventId: getEventIdentity(event.raw),
        inPlanner: plannerEventIds.has(`${getEventIdentity(event.raw)}|${normalizeDateKey(event.dateKey)}`),
      })),
    };
  });
}

export function getCalendarLabels(snapshot) {
  return {
    month: snapshot.currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    updatedAt: snapshot.lastUpdatedAt
      ? `Updated at ${snapshot.lastUpdatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "",
  };
}

export function getCalendarEventDetails(event) {
  const raw = event && event.raw ? event.raw : event;
  if (!raw) throw new Error("Event not found.");
  const start = raw.start || {};
  const end = raw.end || {};
  const isAllDay = Boolean(cleanText(start.date, "") && !cleanText(start.dateTime, ""));
  return {
    title: cleanText(raw.summary, "Untitled event"),
    date: formatModalDateLabel(raw) || "-",
    start: formatDateTimeDisplay(start.dateTime || start.date, isAllDay),
    end: formatDateTimeDisplay(end.dateTime || end.date, isAllDay),
    location: cleanText(raw.location, "-"),
    description: cleanText(raw.description, "-"),
    recurrence: Array.isArray(raw.recurrence) ? raw.recurrence.join("\n") : cleanText(raw.recurrence, "-"),
    attendees: formatAttendees(raw.attendees),
    reminders: raw.reminders,
    recurringEventId: raw.recurringEventId,
    originalStartTime: raw.originalStartTime,
    continuation: event.time,
  };
}

export function getCalendarFormValues(mode, event) {
  if (mode === "create") {
    const defaults = getCreateDefaults();
    return syncDateTimeFields({
      ...defaults,
      startDate: defaults.dateValue,
      endDate: defaults.dateValue,
    });
  }
  const raw = event && event.raw ? event.raw : event;
  if (!raw) throw new Error("Event not found.");
  const defaults = getEventSpanForInputs(raw);
  return syncDateTimeFields({
    title: cleanText(raw.summary, ""),
    description: cleanText(raw.description, ""),
    location: cleanText(raw.location, ""),
    startDate: defaults.startDateValue,
    endDate: defaults.endDateValue,
    startDateStartTime: defaults.startDateStartTimeValue,
    startDateEndTime: defaults.startDateEndTimeValue,
    endDateStartTime: defaults.endDateStartTimeValue,
    endDateEndTime: defaults.endDateEndTimeValue,
  });
}

let calendarAuthPromise;
let calendarPlannerPromise;

async function getCalendarAuth() {
  if (!window.Auth) {
    if (!calendarAuthPromise) {
      calendarAuthPromise = (async () => {
        await import("../../www/js/app-config.js");
        await import("../../www/auth.js");
      })().catch((error) => {
        calendarAuthPromise = null;
        throw new Error("Unable to load Google authentication.", { cause: error });
      });
    }
    await calendarAuthPromise;
  }
  if (!window.Auth) throw new Error("Google authentication is unavailable.");
  return window.Auth;
}

async function getCalendarPlannerStorage() {
  if (!window.PlannerStorage) {
    if (!calendarPlannerPromise) {
      calendarPlannerPromise = (async () => {
        await import("../../www/js/app-config.js");
        await import("../../www/js/utils/uuid.js");
        await import("../../www/js/services/sheets.service.js");
        await import("../../www/js/services/planner-storage.service.js");
      })().catch((error) => {
        calendarPlannerPromise = null;
        throw error;
      });
    }
    await calendarPlannerPromise;
  }
  if (!window.PlannerStorage) throw new Error("PlannerStorage is unavailable.");
  return window.PlannerStorage;
}

export function readCalendarPlanner(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem("hm_weekly_planner") || "null");
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) return parsed;
  } catch (error) {
    console.debug("Planner storage read failed", error);
  }
  return { weekStartDate: getPlannerWeekStart(new Date()), tasks: [] };
}

export function createCalendarApi({
  getAuth = getCalendarAuth,
  request = (...args) => fetch(...args),
} = {}) {
  const scopes = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
  const baseUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  async function accessToken() {
    const auth = await getAuth();
    try {
      return await auth.ensureAuthenticated(scopes);
    } catch {
      return auth.signIn(scopes);
    }
  }
  async function send(method, eventId, payload) {
    const token = await accessToken();
    const response = await request(eventId == null ? baseUrl : `${baseUrl}/${encodeURIComponent(cleanText(eventId, ""))}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (response.status === 401) {
      void (await getAuth()).signOut();
      throw new Error("TOKEN_EXPIRED");
    }
    if (!response.ok) {
      if (method === "PATCH" || method === "PUT") {
        let message;
        try {
          const body = await response.json();
          message = cleanText(body && body.error && body.error.message, "");
        } catch {
          // Google can return a non-JSON error response.
        }
        throw new Error(message || `Google Calendar update failed with ${response.status}`);
      }
      throw new Error(`Google Calendar ${method === "POST" ? "create" : "delete"} failed with ${response.status}`);
    }
    if (method !== "DELETE") return response.json();
  }
  async function signIn() {
    return (await getAuth()).signIn(scopes);
  }
  async function retryExpired(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error.message !== "TOKEN_EXPIRED") throw error;
      await signIn();
      return operation();
    }
  }
  return {
    async list(monthDate) {
      const token = await accessToken();
      const response = await request(`${baseUrl}?${buildCalendarEventsQuery(monthDate)}`, {
        method: "GET", headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        void (await getAuth()).signOut();
        throw new Error("Google Calendar token expired. Please sign in again.");
      }
      if (!response.ok) throw new Error(`Google Calendar request failed with ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload.items) ? payload.items : [];
    },
    async update(eventId, selected, data) {
      const { patchPayload, putPayload } = buildEventUpdatePayloads(selected, data);
      const patch = () => send("PATCH", eventId, patchPayload);
      const put = () => send("PUT", eventId, putPayload);
      try {
        return await patch();
      } catch (error) {
        if (error.message === "TOKEN_EXPIRED") {
          await signIn();
          return patch();
        }
        const primaryFailure = cleanText(error && error.message, "");
        try {
          return await put();
        } catch (putError) {
          if (putError.message === "TOKEN_EXPIRED") {
            await signIn();
            return put();
          }
          const fallbackFailure = cleanText(putError && putError.message, "Unknown update failure");
          throw new Error(primaryFailure ? `${primaryFailure} | PUT fallback: ${fallbackFailure}` : fallbackFailure, { cause: putError });
        }
      }
    },
    create: (data) => retryExpired(() => send("POST", null, buildEventCreatePayload(data))),
    remove: (eventId) => retryExpired(() => send("DELETE", eventId)),
  };
}

export function createCalendarController({
  api = createCalendarApi(),
  getPlannerStorage = getCalendarPlannerStorage,
  localStorage = window.localStorage,
  confirm = (message) => window.confirm(message),
} = {}) {
  let snapshot = {
    currentMonth: getCurrentCalendarMonth(), events: [], status: "Ready.",
    lastUpdatedAt: null, loading: false, loadError: "",
    modalMode: "", selectedEventId: "", selectedEventDateKey: "", dialogVersion: 0,
    isSavingEvent: false, draggingEventId: "", draggingEventDateKey: "", dropDateKey: "",
    planner: readCalendarPlanner(localStorage),
  };
  const listeners = new Set();
  let active = false;
  let generation = 0;
  let loadId = 0;
  function publish(patch) {
    snapshot = { ...snapshot, ...patch };
    if (active) listeners.forEach((listener) => listener(snapshot));
  }
  function selected() {
    return getCalendarEventById(snapshot.events, snapshot.selectedEventId, snapshot.selectedEventDateKey);
  }
  function closeDialog() {
    publish({ modalMode: "", selectedEventId: "", selectedEventDateKey: "" });
  }
  async function refresh() {
    const id = ++loadId;
    const lifecycle = generation;
    const month = snapshot.currentMonth;
    publish({ loading: true, loadError: "", status: "Loading calendar events..." });
    try {
      const rawEvents = await api.list(month);
      if (!active || id !== loadId || lifecycle !== generation) return false;
      const events = normalizeCalendarEvents(rawEvents);
      publish({
        events, loading: false, lastUpdatedAt: new Date(),
        planner: readCalendarPlanner(localStorage),
        status: `Loaded ${getUniqueEventCount(events)} events for ${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}.`,
      });
      return true;
    } catch (error) {
      if (!active || id !== loadId || lifecycle !== generation) return false;
      console.warn("Unable to load Google Calendar events", error);
      publish({
        loading: false, loadError: "Unable to load Google Calendar events right now.",
        status: `Unable to load Google Calendar events (${cleanText(error && error.message, "Unknown error")}).`,
      });
      return false;
    }
  }
  async function mutate(operation, failure) {
    if (snapshot.isSavingEvent) return false;
    const lifecycle = generation;
    publish({ isSavingEvent: true });
    try {
      await operation(() => active && lifecycle === generation);
      return true;
    } catch (error) {
      console.warn(failure, error);
      if (active && lifecycle === generation) publish({ status: `${failure} (${cleanText(error && error.message, "Unknown error")}).` });
      return false;
    } finally {
      if (active && lifecycle === generation) publish({ isSavingEvent: false });
    }
  }
  const actions = {
    initialize() {
      active = true;
      generation += 1;
      publish({ isSavingEvent: false });
      return refresh();
    },
    refresh,
    navigate(offset) {
      publish({ currentMonth: offset === "today" ? getCurrentCalendarMonth() : getCalendarMonth(snapshot.currentMonth, offset) });
      return refresh();
    },
    openCreate() {
      publish({ modalMode: "create", selectedEventId: "", selectedEventDateKey: "", dialogVersion: snapshot.dialogVersion + 1 });
    },
    openEvent(eventId, dateKey, mode = "edit") {
      const event = getCalendarEventById(snapshot.events, eventId, dateKey);
      if (!event) { publish({ status: "Event is no longer available." }); return; }
      publish({
        modalMode: mode, selectedEventId: getEventIdentity(event.raw),
        selectedEventDateKey: normalizeDateKey(event.dateKey), dialogVersion: snapshot.dialogVersion + 1,
      });
    },
    closeDialog,
    submit(values, mode) {
      const event = selected();
      if (mode !== "create" && !event) {
        publish({ status: "Event is no longer available." });
        return Promise.resolve(false);
      }
      const data = buildEventSubmitData(values);
      return mutate(async (isCurrent) => {
        if (mode === "create") await api.create(data);
        else await api.update(getEventIdentity(event.raw), getCalendarEventById(snapshot.events, getEventIdentity(event.raw)), data);
        if (!isCurrent()) return;
        closeDialog();
        const loaded = await refresh();
        if (loaded && isCurrent()) publish({ status: `${mode === "create" ? "Created" : "Saved"} "${data.summary}" ${mode === "create" ? "in" : "to"} Google Calendar.` });
      }, mode === "create" ? "Unable to create calendar event" : "Unable to save calendar event");
    },
    remove() {
      const event = selected();
      if (!event || snapshot.isSavingEvent) return Promise.resolve(false);
      const title = cleanText(event.title || (event.raw && event.raw.summary), "Untitled event");
      if (!confirm(`Delete "${title}" from Google Calendar?`)) {
        publish({ status: "Delete canceled." });
        return Promise.resolve(false);
      }
      return mutate(async (isCurrent) => {
        await api.remove(getEventIdentity(event.raw));
        if (!isCurrent()) return;
        closeDialog();
        const loaded = await refresh();
        if (loaded && isCurrent()) publish({ status: `Deleted "${title}" from Google Calendar.` });
      }, "Unable to delete calendar event");
    },
    addToPlanner(eventId = snapshot.selectedEventId, dateKey = snapshot.selectedEventDateKey) {
      const event = getCalendarEventById(snapshot.events, eventId, dateKey);
      if (!event) {
        publish({ status: "Event is no longer available." });
        return Promise.resolve(false);
      }
      return mutate(async (isCurrent) => {
        let storage;
        let localOnly = false;
        try { storage = await getPlannerStorage(); } catch (error) {
          console.warn("PlannerStorage is unavailable; falling back to local planner storage.", error);
          localOnly = true;
        }
        const planner = storage ? await storage.getWeeklyPlanner() : readCalendarPlanner(localStorage);
        const result = buildPlannerEventAdditions(event, dateKey, planner);
        let syncError = "";
        const unsubscribe = storage?.onChange?.((change) => {
          if (change.type === "weekly-task-sync-error") syncError = cleanText(change.error, "Planner sync failed.");
        });
        try {
          if (storage) {
            for (const record of result.additions) await storage.upsertWeeklyTask(record);
          } else if (result.additions.length) {
            localStorage.setItem("hm_weekly_planner", JSON.stringify(result.planner));
          }
        } finally { unsubscribe?.(); }
        if (!isCurrent()) return;
        closeDialog();
        const label = cleanText(event.raw.summary, "Untitled event");
        let status;
        if (!result.additions.length) {
          status = result.dateKeysToAdd.length > 1
            ? `"${label}" is already in Planner for all days in its range.`
            : `"${label}" is already in Planner for ${result.sourceDate}.`;
        } else {
          status = result.dateKeysToAdd.length > 1
            ? `Added "${label}" to Planner for ${result.additions.length} day(s) in the event range.`
            : `Added "${label}" to Planner.`;
        }
        if (localOnly) status += " Saved locally only; Planner sync is unavailable.";
        if (syncError) status += ` Saved locally; Planner sync failed (${syncError}).`;
        publish({ planner: readCalendarPlanner(localStorage), lastUpdatedAt: result.additions.length ? new Date() : snapshot.lastUpdatedAt, status });
      }, "Unable to add event to Planner");
    },
    startDrag(eventId, dateKey) {
      if (!cleanText(eventId, "")) return;
      publish({ draggingEventId: eventId, draggingEventDateKey: normalizeDateKey(dateKey), status: "Drag event to another day to reschedule." });
    },
    setDropTarget(dateKey) { publish({ dropDateKey: dateKey }); },
    endDrag() { publish({ draggingEventId: "", draggingEventDateKey: "", dropDateKey: "" }); },
    async drop(dateKey) {
      const eventId = snapshot.draggingEventId;
      const fromDate = snapshot.draggingEventDateKey;
      if (!eventId || !dateKey) return false;
      try {
        return await mutate(async (isCurrent) => {
          const event = getCalendarEventById(snapshot.events, eventId, fromDate);
          const data = buildEventMoveData(event, dateKey, fromDate);
          if (data) await api.update(eventId, getCalendarEventById(snapshot.events, eventId), data);
          if (!isCurrent()) return;
          const loaded = await refresh();
          if (loaded && isCurrent()) publish({ status: "Event moved and synced to Google Calendar." });
        }, "Unable to move event");
      } finally { actions.endDrag(); }
    },
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    actions,
    destroy() { active = false; generation += 1; loadId += 1; listeners.clear(); },
  };
}
