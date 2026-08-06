function initCalendarScreen() {
  const SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");
  const TOKEN_STORAGE_KEY = "hm_google_access_token";
  const TOKEN_EXPIRY_STORAGE_KEY = "hm_google_access_token_expires_at";

  const container = document.getElementById("calendarEvents");
  const statusLabel = document.getElementById("calendarStatus");
  const monthLabel = document.getElementById("calendarMonthLabel");
  const updatedAtLabel = document.getElementById("calendarUpdatedAt");
  const addEventButton = document.getElementById("calendar-add-event-btn");
  const refreshButton = document.getElementById("calendar-refresh-btn");
  const prevButton = document.getElementById("calendarPrevMonth");
  const nextButton = document.getElementById("calendarNextMonth");
  const todayButton = document.getElementById("calendarToday");
  const modalHost = document.getElementById("calendar-modal");

  if (!container || !monthLabel || !updatedAtLabel || !addEventButton || !refreshButton || !prevButton || !nextButton || !todayButton || !modalHost) {
    return;
  }

  const state = {
    currentMonth: (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    })(),
    events: [],
    activeLoadId: 0,
    selectedEventId: "",
    selectedEventDateKey: "",
    modalMode: "details",
    isSavingEvent: false,
    lastUpdatedAt: null,
    draggingEventId: "",
    draggingEventDateKey: "",
  };

  function cleanText(value, fallback) {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message) {
    if (!statusLabel) {
      return;
    }

    statusLabel.textContent = cleanText(message, "Ready.");
  }

  function getUniqueEventCount() {
    const ids = new Set();

    state.events.forEach((event) => {
      const id = cleanText(getEventIdentity(event.raw), `${event.title}-${event.dateKey}`);
      ids.add(id);
    });

    return ids.size;
  }

  function restoreGoogleTokenFromStorage() {
    const token = cleanText(window.sessionStorage.getItem(TOKEN_STORAGE_KEY), "");
    const expiresAt = Number(window.sessionStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY));
    if (!token) {
      return;
    }

    if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
      return;
    }

    window.GOOGLE_ACCESS_TOKEN = token;
  }

  function persistGoogleToken(token, expiresInSeconds) {
    if (!token) {
      return;
    }

    const seconds = Number(expiresInSeconds);
    const expiresAt = Number.isFinite(seconds) ? Date.now() + (seconds * 1000) : Date.now() + (50 * 60 * 1000);
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    window.sessionStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, String(expiresAt));
  }

  async function ensureGoogleAccessToken() {
    const existing = cleanText(window.GOOGLE_ACCESS_TOKEN, "");
    if (existing) {
      return existing;
    }

    return signInWithGoogle();
  }

  function clearGoogleAccessToken() {
    window.GOOGLE_ACCESS_TOKEN = "";
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  }

  function waitForGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const check = () => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > 12000) {
          reject(new Error("Google Identity Services failed to load."));
          return;
        }

        window.setTimeout(check, 120);
      };

      check();
    });
  }

  async function signInWithGoogle() {
    const clientId = cleanText(window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID, "");
    if (!clientId) {
      throw new Error("Missing GOOGLE_CLIENT_ID in APP_CONFIG.");
    }

    await waitForGoogleIdentityServices();

    return new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (tokenResponse) => {
          if (!tokenResponse || tokenResponse.error) {
            reject(new Error(cleanText(tokenResponse && tokenResponse.error, "Google authentication failed.")));
            return;
          }

          const accessToken = cleanText(tokenResponse.access_token, "");
          if (!accessToken) {
            reject(new Error("Google authentication returned no access token."));
            return;
          }

          window.GOOGLE_ACCESS_TOKEN = accessToken;
          persistGoogleToken(accessToken, tokenResponse.expires_in);
          resolve(accessToken);
        },
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  function buildMonthRange(monthDate) {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      monthStart,
      monthEnd,
    };
  }

  async function getCalendarEvents(monthDate) {
    const token = cleanText(window.GOOGLE_ACCESS_TOKEN, "");
    if (!token) {
      throw new Error("Missing Google access token.");
    }

    const targetMonth = monthDate instanceof Date
      ? monthDate
      : state.currentMonth;
    const { monthStart, monthEnd } = buildMonthRange(targetMonth);
    const query = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      timeMin: monthStart.toISOString(),
      timeMax: monthEnd.toISOString(),
      showDeleted: "false",
    });

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      window.GOOGLE_ACCESS_TOKEN = "";
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
      throw new Error("Google Calendar token expired. Please sign in again.");
    }

    if (!response.ok) {
      throw new Error(`Google Calendar request failed with ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload.items) ? payload.items : [];
  }

  function formatEventDate(event) {
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

  function toDateKey(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeDateKey(value) {
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

  function toDateTimeInputValue(value) {
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

  function toRfc3339LocalString(value) {
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

  function toLocalDateTimeString(dateInput, timeInput) {
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

  function buildMonthRange(monthDate) {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { monthStart, monthEnd };
  }

  function getPlannerWeekStart(dateValue) {
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

  function readPlannerStorage() {
    try {
      const raw = window.localStorage.getItem("hm_weekly_planner");
      const parsed = JSON.parse(raw || "null");
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
        return parsed;
      }
    } catch (error) {
      console.debug("Planner storage read failed", error);
    }

    return {
      weekStartDate: getPlannerWeekStart(new Date()),
      tasks: [],
    };
  }

  function savePlannerStorage(planner) {
    window.localStorage.setItem("hm_weekly_planner", JSON.stringify(planner));
  }

  function getPlannerEventIdSet() {
    const planner = readPlannerStorage();
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

  function mapEventTimeToBucket(dateTimeValue, allDayFallback) {
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

  function startOfDay(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDays(value, days) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setDate(date.getDate() + days);
    return date;
  }

  function parseEventDateTime(event) {
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

  function parseEventSpan(event) {
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

  function getEventIdentity(event) {
    return cleanText(event && event.id, "");
  }

  function getCalendarEventById(eventId, dateKey) {
    const targetId = cleanText(eventId, "");
    if (!targetId) {
      return null;
    }

    const targetDateKey = normalizeDateKey(dateKey);
    if (targetDateKey) {
      const exact = state.events.find((event) => getEventIdentity(event.raw) === targetId && normalizeDateKey(event.dateKey) === targetDateKey);
      if (exact) {
        return exact;
      }
    }

    return state.events.find((event) => getEventIdentity(event.raw) === targetId) || null;
  }

  function formatEventTime(event) {
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

  function formatDateTimeDisplay(value, isAllDay) {
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

  function normalizeCalendarEvents(items) {
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

  function getMonthGridStart(monthStart) {
    const date = new Date(monthStart.getTime());
    const dayOfWeek = date.getDay();
    const offset = dayOfWeek;
    date.setDate(date.getDate() - offset);
    return date;
  }

  function isSameDay(left, right) {
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

  function renderMonthGrid() {
    monthLabel.textContent = state.currentMonth.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    if (updatedAtLabel) {
      updatedAtLabel.textContent = state.lastUpdatedAt
        ? `Updated at ${state.lastUpdatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
        : "";
    }

    const eventsByDate = new Map();
    const plannerEventIds = getPlannerEventIdSet();
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

    container.innerHTML = `
      <section class="calendar-month-grid" aria-label="Monthly calendar">
        <div class="calendar-weekday-row">${weekdayHeaders}</div>
        <div class="calendar-days-grid">${dayCells}</div>
      </section>
    `;
  }

  function renderCalendarPage(events) {
    state.events = normalizeCalendarEvents(Array.isArray(events) ? events : []);
    renderMonthGrid();
  }

  async function loadGoogleCalendarIntoPage() {
    container.innerHTML = '<div class="hm-muted">Loading Google Calendar events...</div>';
    setStatus("Loading calendar events...");
    const loadId = Date.now();
    state.activeLoadId = loadId;

    try {
      const events = await getCalendarEvents(state.currentMonth);
      if (state.activeLoadId !== loadId) {
        return;
      }
      renderCalendarPage(events);
    } catch (error) {
      if (state.activeLoadId !== loadId) {
        return;
      }
      console.warn("Unable to load Google Calendar events", error);
      container.innerHTML = '<div class="hm-muted">Unable to load Google Calendar events right now.</div>';
      setStatus("Unable to load Google Calendar events.");
    }
  }

  function formatModalDateLabel(event) {
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

  function getEventSpanForInputs(event) {
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

  function closeCalendarModal() {
    state.selectedEventId = "";
    state.selectedEventDateKey = "";
    state.modalMode = "details";
    state.isSavingEvent = false;
    modalHost.hidden = true;
    modalHost.innerHTML = "";
  }

  function getCreateDefaults() {
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

  function buildStartEndForSubmit(startDate, startTime, endDate, endTime) {
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

  function wireDateTimeFieldSync() {
    const startDateInput = document.getElementById("eventEditStartDate");
    const endDateInput = document.getElementById("eventEditEndDate");
    const startDateStartTimeInput = document.getElementById("eventEditStartDateStartTime");
    const startDateEndTimeInput = document.getElementById("eventEditStartDateEndTime");
    const endDateStartTimeInput = document.getElementById("eventEditEndDateStartTime");
    const endDateEndTimeInput = document.getElementById("eventEditEndDateEndTime");

    if (!startDateInput || !endDateInput || !startDateStartTimeInput || !startDateEndTimeInput || !endDateStartTimeInput || !endDateEndTimeInput) {
      return;
    }

    const syncMode = () => {
      const isSingleDay = cleanText(startDateInput.value, "") === cleanText(endDateInput.value, "");
      if (isSingleDay) {
        endDateStartTimeInput.value = startDateStartTimeInput.value;
        endDateEndTimeInput.value = startDateEndTimeInput.value;
      }

      endDateStartTimeInput.disabled = isSingleDay;
      endDateEndTimeInput.disabled = isSingleDay;
      endDateStartTimeInput.setAttribute("aria-disabled", isSingleDay ? "true" : "false");
      endDateEndTimeInput.setAttribute("aria-disabled", isSingleDay ? "true" : "false");
    };

    const onChange = () => syncMode();

    startDateInput.addEventListener("change", onChange);
    endDateInput.addEventListener("change", onChange);
    startDateStartTimeInput.addEventListener("change", onChange);
    startDateEndTimeInput.addEventListener("change", onChange);

    syncMode();
  }

  function formatAttendees(attendees) {
    if (!Array.isArray(attendees) || !attendees.length) {
      return "-";
    }

    return attendees
      .map((attendee) => cleanText(attendee && (attendee.displayName || attendee.email), "Attendee"))
      .join(", ");
  }

  function renderEventDetailsModal(event) {
    if (state.modalMode === "create") {
      const defaults = getCreateDefaults();
      modalHost.innerHTML = `
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
      modalHost.hidden = false;
      wireDateTimeFieldSync();
      return;
    }

    const rawEvent = event && event.raw ? event.raw : event;
    if (!rawEvent) {
      closeCalendarModal();
      return;
    }

    const eventId = getEventIdentity(rawEvent);
    const occurrenceDateKey = normalizeDateKey(event && event.dateKey) || normalizeDateKey(rawEvent.start && (rawEvent.start.date || rawEvent.start.dateTime));
    state.selectedEventId = eventId;
    state.selectedEventDateKey = occurrenceDateKey;

    if (state.modalMode === "edit") {
      const defaults = getEventSpanForInputs(rawEvent);
      modalHost.innerHTML = `
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
      modalHost.hidden = false;
      wireDateTimeFieldSync();
      return;
    }

    const start = rawEvent.start || {};
    const end = rawEvent.end || {};
    const recurrence = Array.isArray(rawEvent.recurrence) ? rawEvent.recurrence.join("\n") : cleanText(rawEvent.recurrence, "-");
    const isAllDay = Boolean(cleanText(start.date, "") && !cleanText(start.dateTime, ""));

    modalHost.innerHTML = `
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
    modalHost.hidden = false;
  }

  async function updateGoogleCalendarEvent(eventId, updatedData) {
    const selected = getCalendarEventById(eventId);
    if (!selected) {
      throw new Error("Event not found.");
    }

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

    const parseApiErrorMessage = async (response) => {
      try {
        const payload = await response.json();
        const apiMessage = cleanText(payload && payload.error && payload.error.message, "");
        return apiMessage || `Google Calendar update failed with ${response.status}`;
      } catch (_) {
        return `Google Calendar update failed with ${response.status}`;
      }
    };

    const requestPatch = async () => {
      const token = await ensureGoogleAccessToken();
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(cleanText(eventId, ""))}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchPayload),
      });

      if (response.status === 401) {
        clearGoogleAccessToken();
        throw new Error("TOKEN_EXPIRED");
      }

      if (!response.ok) {
        throw new Error(await parseApiErrorMessage(response));
      }

      return response.json();
    };

    const requestPut = async () => {
      const token = await ensureGoogleAccessToken();
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(cleanText(eventId, ""))}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(putPayload),
      });

      if (response.status === 401) {
        clearGoogleAccessToken();
        throw new Error("TOKEN_EXPIRED");
      }

      if (!response.ok) {
        throw new Error(await parseApiErrorMessage(response));
      }

      return response.json();
    };

    try {
      return await requestPatch();
    } catch (error) {
      if (cleanText(error && error.message, "") === "TOKEN_EXPIRED") {
        await signInWithGoogle();
        return requestPatch();
      }

      const primaryFailure = cleanText(error && error.message, "");
      try {
        return await requestPut();
      } catch (putError) {
        if (cleanText(putError && putError.message, "") === "TOKEN_EXPIRED") {
          await signInWithGoogle();
          return requestPut();
        }
        const fallbackFailure = cleanText(putError && putError.message, "Unknown update failure");
        throw new Error(primaryFailure ? `${primaryFailure} | PUT fallback: ${fallbackFailure}` : fallbackFailure);
      }
    }
  }

  async function moveGoogleCalendarEvent(eventId, targetDateKey, sourceDateKey) {
    const selected = getCalendarEventById(eventId, sourceDateKey);
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
      await updateGoogleCalendarEvent(eventId, {
        allDayStartDate: toDateKey(newStartDay),
        allDayEndDate: toDateKey(exclusiveEndDay),
      });
      return;
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

    await updateGoogleCalendarEvent(eventId, {
      startDateTime: toRfc3339LocalString(shiftedStart),
      endDateTime: toRfc3339LocalString(shiftedEnd),
    });
  }

  async function deleteGoogleCalendarEvent(eventId) {
    const requestDelete = async () => {
      const token = await ensureGoogleAccessToken();
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(cleanText(eventId, ""))}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        clearGoogleAccessToken();
        throw new Error("TOKEN_EXPIRED");
      }

      if (!response.ok) {
        throw new Error(`Google Calendar delete failed with ${response.status}`);
      }
    };

    try {
      await requestDelete();
    } catch (error) {
      if (cleanText(error && error.message, "") === "TOKEN_EXPIRED") {
        await signInWithGoogle();
        await requestDelete();
        return;
      }
      throw error;
    }
  }

  async function createGoogleCalendarEvent(newData) {
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

    const requestCreate = async () => {
      const token = await ensureGoogleAccessToken();
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        clearGoogleAccessToken();
        throw new Error("TOKEN_EXPIRED");
      }

      if (!response.ok) {
        throw new Error(`Google Calendar create failed with ${response.status}`);
      }

      return response.json();
    };

    try {
      return await requestCreate();
    } catch (error) {
      if (cleanText(error && error.message, "") === "TOKEN_EXPIRED") {
        await signInWithGoogle();
        return requestCreate();
      }
      throw error;
    }
  }

  function addEventToPlanner(event, occurrenceDateKey) {
    const rawEvent = event && event.raw ? event.raw : event;
    if (!rawEvent) {
      setStatus("Unable to add event to Planner.");
      return false;
    }

    const rawStart = rawEvent.start || {};
    const isAllDay = Boolean(cleanText(rawEvent.start && rawEvent.start.date, "") && !cleanText(rawEvent.start && rawEvent.start.dateTime, ""));
    const bucket = isAllDay
      ? "All Day"
      : mapEventTimeToBucket(rawEvent.start && rawEvent.start.dateTime, false);
    const timeSlot = bucket === "Morning" ? "morning" : bucket === "Afternoon" ? "afternoon" : bucket === "Evening" ? "evening" : "morning";
    const sourceDate = normalizeDateKey(occurrenceDateKey) || cleanText(rawStart.date || (rawStart.dateTime ? toDateKey(new Date(rawStart.dateTime)) : ""), "");
    const planner = readPlannerStorage();
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
    const existingTasks = Array.isArray(planner.tasks) ? planner.tasks : [];
    let addedCount = 0;

    dateKeysToAdd.forEach((dateKey) => {
      const duplicate = existingTasks.find((task) => {
        return cleanText(task && task.source, "") === "google-calendar"
          && cleanText(task && task.projectId, "") === eventProjectId
          && normalizeDateKey(task && task.date) === dateKey;
      });

      if (duplicate) {
        return;
      }

      const plannerId = `google-${eventProjectId || dateKey}-${dateKey}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      existingTasks.push({
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
      });
      addedCount += 1;
    });

    planner.tasks = existingTasks;

    if (!addedCount) {
      closeCalendarModal();
      const label = cleanText(rawEvent.summary, "Untitled event");
      if (dateKeysToAdd.length > 1) {
        setStatus(`"${label}" is already in Planner for all days in its range.`);
      } else {
        setStatus(`"${label}" is already in Planner for ${sourceDate}.`);
      }
      return true;
    }

    savePlannerStorage(planner);
    closeCalendarModal();
    state.lastUpdatedAt = new Date();
    renderMonthGrid();
    if (dateKeysToAdd.length > 1) {
      setStatus(`Added "${cleanText(rawEvent.summary, "Untitled event")}" to Planner for ${addedCount} day(s) in the event range.`);
    } else {
      setStatus(`Added "${cleanText(rawEvent.summary, "Untitled event")}" to Planner.`);
    }
    return true;
  }

  async function refreshCalendar() {
    if (!cleanText(window.GOOGLE_ACCESS_TOKEN, "")) {
      await signInWithGoogle();
    }

    await loadGoogleCalendarIntoPage();
    state.lastUpdatedAt = new Date();
    renderMonthGrid();
    setStatus(`Loaded ${getUniqueEventCount()} events for ${monthLabel.textContent}.`);
  }

  async function initializeCalendarPage() {
    restoreGoogleTokenFromStorage();

    if (!cleanText(window.GOOGLE_ACCESS_TOKEN, "")) {
      await signInWithGoogle();
    }

    await refreshCalendar();
  }

  window.signInWithGoogle = signInWithGoogle;
  window.getCalendarEvents = getCalendarEvents;
  window.renderCalendarPage = renderCalendarPage;
  window.renderEventDetailsModal = renderEventDetailsModal;
  window.updateGoogleCalendarEvent = updateGoogleCalendarEvent;
  window.deleteGoogleCalendarEvent = deleteGoogleCalendarEvent;
  window.createGoogleCalendarEvent = createGoogleCalendarEvent;
  window.moveGoogleCalendarEvent = moveGoogleCalendarEvent;
  window.addEventToPlanner = addEventToPlanner;
  window.refreshCalendar = refreshCalendar;
  window.loadGoogleCalendarIntoPage = loadGoogleCalendarIntoPage;

  addEventButton.addEventListener("click", () => {
    state.modalMode = "create";
    state.selectedEventId = "";
    state.selectedEventDateKey = "";
    renderEventDetailsModal(null);
  });

  refreshButton.addEventListener("click", () => {
    refreshCalendar().catch((error) => {
      console.warn("Refresh failed", error);
      setStatus("Refresh failed.");
    });
  });

  prevButton.addEventListener("click", () => {
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
    refreshCalendar().catch((error) => {
      console.warn("Month refresh failed", error);
      setStatus("Unable to load previous month.");
    });
  });

  nextButton.addEventListener("click", () => {
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
    refreshCalendar().catch((error) => {
      console.warn("Month refresh failed", error);
      setStatus("Unable to load next month.");
    });
  });

  todayButton.addEventListener("click", () => {
    const now = new Date();
    state.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    refreshCalendar().catch((error) => {
      console.warn("Month refresh failed", error);
      setStatus("Unable to load current month.");
    });
  });

  modalHost.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (event.target === modalHost || (actionButton && actionButton.dataset.action === "modal-close")) {
      closeCalendarModal();
      return;
    }

    if (!actionButton) {
      return;
    }

    const action = cleanText(actionButton.dataset.action, "");
    const eventId = cleanText(actionButton.dataset.eventId, state.selectedEventId);
    const eventDateKey = normalizeDateKey(actionButton.dataset.dateKey || state.selectedEventDateKey);
    const selected = getCalendarEventById(eventId, eventDateKey);

    if (action === "add-to-planner") {
      if (selected) {
        addEventToPlanner(selected, eventDateKey);
      } else {
        setStatus("Event is no longer available.");
      }
      return;
    }

    if (action === "toggle-edit") {
      state.modalMode = "edit";
      renderEventDetailsModal(selected);
      return;
    }

    if (action === "cancel-edit") {
      closeCalendarModal();
      return;
    }

    if (action === "save-event") {
      if (!selected || state.isSavingEvent) {
        return;
      }

      state.isSavingEvent = true;
      try {
        const editTitle = document.getElementById("eventEditTitle");
        const editStartDate = document.getElementById("eventEditStartDate");
        const editEndDate = document.getElementById("eventEditEndDate");
        const editStartDateStartTime = document.getElementById("eventEditStartDateStartTime");
        const editStartDateEndTime = document.getElementById("eventEditStartDateEndTime");
        const editEndDateStartTime = document.getElementById("eventEditEndDateStartTime");
        const editEndDateEndTime = document.getElementById("eventEditEndDateEndTime");
        const editDescription = document.getElementById("eventEditDescription");
        const editLocation = document.getElementById("eventEditLocation");

        const startDate = cleanText(editStartDate && editStartDate.value, "");
        const endDate = cleanText(editEndDate && editEndDate.value, startDate);
        const startTime = cleanText(editStartDateStartTime && editStartDateStartTime.value, "00:00");
        const sameDayEndFallback = cleanText(editStartDateEndTime && editStartDateEndTime.value, "23:59");
        const multiDayEndTime = cleanText(editEndDateEndTime && editEndDateEndTime.value, sameDayEndFallback);
        const endTime = startDate === endDate ? sameDayEndFallback : multiDayEndTime;
        const submitSpan = buildStartEndForSubmit(startDate, startTime, endDate, endTime);

        const updatedData = {
          summary: cleanText(editTitle && editTitle.value, "Untitled event"),
          description: cleanText(editDescription && editDescription.value, ""),
          location: cleanText(editLocation && editLocation.value, ""),
          startDateTime: submitSpan.startDateTime,
          endDateTime: submitSpan.endDateTime,
        };

        await updateGoogleCalendarEvent(eventId, updatedData);
        closeCalendarModal();
        await refreshCalendar();
        setStatus(`Saved "${updatedData.summary}" to Google Calendar.`);
      } catch (error) {
        console.warn("Unable to update Google Calendar event", error);
        const reason = cleanText(error && error.message, "Unknown error");
        setStatus(`Unable to save calendar event (${reason}).`);
      } finally {
        state.isSavingEvent = false;
      }
    }

    if (action === "create-event") {
      if (state.isSavingEvent) {
        return;
      }

      state.isSavingEvent = true;
      try {
        const editTitle = document.getElementById("eventEditTitle");
        const editStartDate = document.getElementById("eventEditStartDate");
        const editEndDate = document.getElementById("eventEditEndDate");
        const editStartDateStartTime = document.getElementById("eventEditStartDateStartTime");
        const editStartDateEndTime = document.getElementById("eventEditStartDateEndTime");
        const editEndDateStartTime = document.getElementById("eventEditEndDateStartTime");
        const editEndDateEndTime = document.getElementById("eventEditEndDateEndTime");
        const editDescription = document.getElementById("eventEditDescription");
        const editLocation = document.getElementById("eventEditLocation");

        const startDate = cleanText(editStartDate && editStartDate.value, "");
        const endDate = cleanText(editEndDate && editEndDate.value, startDate);
        const startTime = cleanText(editStartDateStartTime && editStartDateStartTime.value, "00:00");
        const sameDayEndFallback = cleanText(editStartDateEndTime && editStartDateEndTime.value, "23:59");
        const multiDayEndTime = cleanText(editEndDateEndTime && editEndDateEndTime.value, sameDayEndFallback);
        const endTime = startDate === endDate ? sameDayEndFallback : multiDayEndTime;
        const submitSpan = buildStartEndForSubmit(startDate, startTime, endDate, endTime);

        const createData = {
          summary: cleanText(editTitle && editTitle.value, "Untitled event"),
          description: cleanText(editDescription && editDescription.value, ""),
          location: cleanText(editLocation && editLocation.value, ""),
          startDateTime: submitSpan.startDateTime,
          endDateTime: submitSpan.endDateTime,
        };

        await createGoogleCalendarEvent(createData);
        closeCalendarModal();
        await refreshCalendar();
        setStatus(`Created "${createData.summary}" in Google Calendar.`);
      } catch (error) {
        console.warn("Unable to create Google Calendar event", error);
        setStatus("Unable to create calendar event.");
      } finally {
        state.isSavingEvent = false;
      }
      return;
    }

    if (action === "delete-event") {
      if (!selected || state.isSavingEvent) {
        return;
      }

      const eventTitle = cleanText(selected.title || (selected.raw && selected.raw.summary), "Untitled event");
      const confirmed = window.confirm(`Delete "${eventTitle}" from Google Calendar?`);
      if (!confirmed) {
        setStatus("Delete canceled.");
        return;
      }

      state.isSavingEvent = true;
      try {
        await deleteGoogleCalendarEvent(eventId);
        closeCalendarModal();
        await refreshCalendar();
        setStatus(`Deleted "${eventTitle}" from Google Calendar.`);
      } catch (error) {
        console.warn("Unable to delete Google Calendar event", error);
        setStatus("Unable to delete calendar event.");
      } finally {
        state.isSavingEvent = false;
      }
    }
  });

  container.addEventListener("click", (event) => {
    const addButton = event.target.closest("button[data-action='add-to-planner']");
    if (addButton) {
      const selected = getCalendarEventById(addButton.dataset.eventId, addButton.dataset.dateKey);
      if (selected) {
        addEventToPlanner(selected, addButton.dataset.dateKey);
      }
      event.stopPropagation();
      return;
    }

    const editButton = event.target.closest("button[data-action='toggle-edit']");
    if (editButton) {
      const selected = getCalendarEventById(editButton.dataset.eventId, editButton.dataset.dateKey);
      if (selected) {
        state.modalMode = "edit";
        renderEventDetailsModal(selected);
      }
      event.stopPropagation();
      return;
    }

    const card = event.target.closest("button.calendar-event-open[data-action='open-event']");
    if (!card) {
      return;
    }

    const selected = getCalendarEventById(card.dataset.eventId, card.dataset.dateKey);
    if (selected) {
      state.modalMode = "edit";
      renderEventDetailsModal(selected);
    }
  });

  container.addEventListener("keydown", (event) => {
    const card = event.target.closest("button.calendar-event-open[data-action='open-event']");
    if (!card || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    const selected = getCalendarEventById(card.dataset.eventId, card.dataset.dateKey);
    if (selected) {
      state.modalMode = "edit";
      renderEventDetailsModal(selected);
    }
  });

  container.addEventListener("dragstart", (event) => {
    const eventItem = event.target.closest(".calendar-event-item[data-action='drag-event']");
    if (!eventItem) {
      return;
    }

    const dragEventId = cleanText(eventItem.dataset.eventId, "");
    const dragEventDateKey = normalizeDateKey(eventItem.dataset.dateKey);
    if (!dragEventId) {
      return;
    }

    state.draggingEventId = dragEventId;
    state.draggingEventDateKey = dragEventDateKey;
    eventItem.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", dragEventId);
      event.dataTransfer.effectAllowed = "move";
    }
    setStatus("Drag event to another day to reschedule.");
  });

  container.addEventListener("dragend", (event) => {
    const eventItem = event.target.closest(".calendar-event-item[data-action='drag-event']");
    if (eventItem) {
      eventItem.classList.remove("is-dragging");
    }
    container.querySelectorAll(".calendar-day-cell.is-drop-target").forEach((cell) => {
      cell.classList.remove("is-drop-target");
    });
    state.draggingEventId = "";
    state.draggingEventDateKey = "";
  });

  container.addEventListener("dragover", (event) => {
    const dayCell = event.target.closest(".calendar-day-cell[data-date-key]");
    if (!dayCell || !state.draggingEventId) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    container.querySelectorAll(".calendar-day-cell.is-drop-target").forEach((cell) => {
      if (cell !== dayCell) {
        cell.classList.remove("is-drop-target");
      }
    });
    dayCell.classList.add("is-drop-target");
  });

  container.addEventListener("dragleave", (event) => {
    const dayCell = event.target.closest(".calendar-day-cell[data-date-key]");
    if (!dayCell) {
      return;
    }
    dayCell.classList.remove("is-drop-target");
  });

  container.addEventListener("drop", async (event) => {
    const dayCell = event.target.closest(".calendar-day-cell[data-date-key]");
    const dragEventId = cleanText(state.draggingEventId, "");
    const dragEventDateKey = normalizeDateKey(state.draggingEventDateKey);
    if (!dayCell || !dragEventId) {
      return;
    }

    event.preventDefault();
    const targetDateKey = cleanText(dayCell.dataset.dateKey, "");
    dayCell.classList.remove("is-drop-target");
    if (!targetDateKey) {
      return;
    }

    try {
      await moveGoogleCalendarEvent(dragEventId, targetDateKey, dragEventDateKey);
      await refreshCalendar();
      setStatus("Event moved and synced to Google Calendar.");
    } catch (error) {
      console.warn("Unable to move calendar event", error);
      const reason = cleanText(error && error.message, "Unknown error");
      setStatus(`Unable to move event (${reason}).`);
    } finally {
      state.draggingEventId = "";
      state.draggingEventDateKey = "";
      container.querySelectorAll(".calendar-event-item.is-dragging").forEach((item) => {
        item.classList.remove("is-dragging");
      });
    }
  });

  modalHost.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCalendarModal();
    }
  });

  initializeCalendarPage().catch((error) => {
    console.warn("Calendar page initialization failed", error);
    container.innerHTML = '<div class="hm-muted">Google authentication is required to load calendar events.</div>';
    setStatus("Google authentication is required to load calendar events.");
  });
}

window.initCalendarScreen = initCalendarScreen;
