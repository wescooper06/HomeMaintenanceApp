function initPlannerScreen() {
  if (window.location.hash.replace("#", "") !== "planner") {
    return;
  }

  const SERVICE_VERSION = "20260811-7";

  const STORAGE_KEYS = {
    curatedTasks: "hm_planner_curated_tasks",
    planner: "hm_weekly_planner",
    staged: "hm_weekly_planner_queue",
    repeatable: "hm_repeatable_tasks",
  };

  const DAY_ORDER = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
  ];

  const SLOT_ORDER = ["morning", "afternoon", "evening"];
  const RECURRENCE_TYPES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"];
  const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_WEEK_OPTIONS = ["1", "2", "3", "4", "last"];

  const WEATHER_LOCATION = {
    name: "Mirrormont, WA",
    latitude: "47.4810",
    longitude: "-121.9960",
  };
  const WEATHER_FALLBACK_ICON = "⛅";
  const WEATHER_FALLBACK_VALUE = "—";
  const WEATHER_REFRESH_WINDOW_MS = 20 * 60 * 1000;

  const elements = {
    status: document.getElementById("plannerStatus"),
    mode: document.getElementById("plannerMode"),
    curatedLeftColumn: document.getElementById("curated-left"),
    curatedMiddleColumn: document.getElementById("curated-middle"),
    taskPoolLeft: document.getElementById("plannerTaskPoolLeft"),
    taskPoolMiddle: document.getElementById("plannerTaskPoolMiddle"),
    repeatablePanel: document.getElementById("repeatable-tasks-panel"),
    parkingLotHost: document.getElementById("parking-lot-host"),
    miniCalendar: document.getElementById("mini-calendar"),
    curatedWarning: document.getElementById("curated-warning"),
    weekPrev: document.getElementById("week-prev"),
    weekToday: document.getElementById("week-today"),
    weekNext: document.getElementById("week-next"),
    weekRangeLabel: document.getElementById("weekly-week-label"),
    weekScrollContainer: document.getElementById("weekly-scroll-container"),
    weekGrid: document.getElementById("plannerWeekGrid"),
    weatherModal: document.getElementById("weather-modal"),
    reminderModal: document.getElementById("reminder-modal"),
    seriesModal: document.getElementById("series-modal"),
    adhocTitle: document.getElementById("adhocTaskTitle"),
    adhocDay: document.getElementById("adhocTaskDay"),
    adhocSlot: document.getElementById("adhocTaskSlot"),
    adhocAddBtn: document.getElementById("adhocTaskAddBtn"),
  };

  if (!elements.status || !elements.mode || !elements.curatedLeftColumn || !elements.curatedMiddleColumn || !elements.taskPoolLeft || !elements.taskPoolMiddle || !elements.repeatablePanel || !elements.parkingLotHost || !elements.miniCalendar || !elements.curatedWarning || !elements.weekPrev || !elements.weekToday || !elements.weekNext || !elements.weekRangeLabel || !elements.weekScrollContainer || !elements.weekGrid || !elements.weatherModal || !elements.reminderModal || !elements.seriesModal || !elements.adhocTitle || !elements.adhocDay || !elements.adhocSlot || !elements.adhocAddBtn) {
    return;
  }

  const controller = new AbortController();
  const state = {
    curatedTasks: [],
    repeatableTasks: [],
    repeatableOverrideMap: new Map(),
    planner: null,
    curatedWarningTimer: null,
    activeCuratedDragTaskId: "",
    activeCuratedDragIndex: -1,
    activeWeeklyDrag: null,
    allProjects: [],
    calendarMonthDate: "",
    selectedCalendarDate: "",
    weatherByDate: {},
    weatherLastFetchedAt: 0,
    weatherFetchPromise: null,
    weatherModalOpenDate: "",
    linksModalRequestId: 0,
    weekScrollLocked: false,
    parkingLotController: null,
    parkingStorageUnsubscribe: null,
  };

  const CURATED_TASK_LIMIT = 8;

  function shiftPlannerWeek(offsetDays) {
    if (!state.planner) {
      return false;
    }

    const days = parseNumber(offsetDays, 0);
    if (!days) {
      return false;
    }

    state.planner.weekStartDate = addDaysToDateKey(state.planner.weekStartDate, days);
  state.selectedCalendarDate = state.planner.weekStartDate;
  state.calendarMonthDate = toMonthStartDateKey(state.selectedCalendarDate);
  generateVisibleRecurringInstances();
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Planning week of ${state.planner.weekStartDate}.`;
    return true;
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

    state.planner.weekStartDate = currentWeekStart;
    state.selectedCalendarDate = todayKey;
    state.calendarMonthDate = toMonthStartDateKey(todayKey);
    generateVisibleRecurringInstances();
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Planning week of ${state.planner.weekStartDate}.`;
    return true;
  }

  function cleanText(value, fallback) {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function parseNumber(value, fallback) {
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

  function parseResourceLinks(value) {
    return parseResourceLinkEntries(value).map((entry) => entry.url);
  }

  function parseResourceLinkEntries(value) {
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
        // Fall through to comma-separated parsing.
      }
    }

    return text
      .split(/[\n,]+/g)
      .map((entry) => toEntry(entry.trim()))
      .filter(Boolean);
  }

  function toDateKey(dateValue) {
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey) {
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

  function addDaysToDateKey(dateKey, days) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    date.setDate(date.getDate() + days);
    return toDateKey(date);
  }

  function toMonthStartDateKey(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    date.setDate(1);
    return toDateKey(date);
  }

  function addMonthsToDateKey(dateKey, months) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    return toDateKey(date);
  }

  function formatMonthYearLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function getDaysInMonth(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return 30;
    }

    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function jumpPlannerToDate(dateKey, selectedDateKey) {
    const clickedDate = cleanText(dateKey, "");
    const weekStartDate = getWeekStartISO(parseDateKey(clickedDate) || clickedDate);
    if (!clickedDate || !weekStartDate) {
      return false;
    }

    state.planner.weekStartDate = weekStartDate;
    state.selectedCalendarDate = cleanText(selectedDateKey, clickedDate);
    state.calendarMonthDate = toMonthStartDateKey(clickedDate);
    generateVisibleRecurringInstances();
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    if (elements.weekScrollContainer && typeof elements.weekScrollContainer.scrollTo === "function") {
      elements.weekScrollContainer.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      elements.weekScrollContainer.scrollLeft = 0;
    }
    elements.status.textContent = `Planning week of ${state.planner.weekStartDate}.`;
    return true;
  }

  function cleanSource(source) {
    return cleanText(source, "unknown").toLowerCase();
  }

  function firstDefined(obj, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== "") {
        return obj[key];
      }
    }

    return null;
  }

  function normalizeSource(source) {
    const text = cleanSource(source);
    if (text.includes("list_a") || text.includes("home")) return "home";
    if (text.includes("list_b") || text.includes("vehicle")) return "vehicle";
    if (text.includes("list_c") || text.includes("repeating")) return "repeating";
    return text;
  }

  function getWeekStartISO(dateValue) {
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

  function getWeekDateKey(weekStartDate, dayIndex) {
    return addDaysToDateKey(weekStartDate, dayIndex);
  }

  function getVisibleWeekDateRange(weekStartDate) {
    return DAY_ORDER.map((day, index) => ({
      key: day.key,
      label: day.label,
      date: getWeekDateKey(weekStartDate, index),
    }));
  }

  function formatDateLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatWeekDayLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) {
      return "";
    }

    const day = DAY_ORDER[(date.getDay() + 6) % 7];
    return `${day.label} (${formatDateLabel(dateKey)})`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildWeatherApiUrl() {
    const apiKey = cleanText(window.APP_CONFIG && window.APP_CONFIG.WEATHERAPI_KEY, "");
    const base = `https://api.weatherapi.com/v1/forecast.json?q=${WEATHER_LOCATION.latitude},${WEATHER_LOCATION.longitude}&days=7&aqi=no&alerts=no`;
    return apiKey ? `${base}&key=${encodeURIComponent(apiKey)}` : base;
  }

  function mapWeatherApiConditionToIcon(conditionText) {
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

  function toWeekWeatherFallback(dateKey) {
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

  function normalizeWeatherForecast(payload) {
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

  async function refreshWeekWeather(weekDates) {
    const now = Date.now();
    const needsRefresh = now - state.weatherLastFetchedAt > WEATHER_REFRESH_WINDOW_MS;

    if (!needsRefresh || state.weatherFetchPromise) {
      return;
    }

    let didUpdateWeather = false;

    state.weatherFetchPromise = fetch(buildWeatherApiUrl())
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Weather forecast request failed with ${response.status}`);
        }

        return response.json();
      })
      .then((payload) => {
        const normalized = normalizeWeatherForecast(payload);
        state.weatherByDate = {
          ...state.weatherByDate,
          ...normalized,
        };
        didUpdateWeather = true;
      })
      .catch((error) => {
        console.debug("Weather forecast unavailable", error);
      })
      .finally(() => {
        state.weatherLastFetchedAt = Date.now();
        state.weatherFetchPromise = null;
        if (didUpdateWeather) {
          renderWeekGrid();
        }
        if (state.weatherModalOpenDate) {
          renderWeatherModal(state.weatherModalOpenDate);
        }
      });
  }

  function getWeatherForDate(dateKey) {
    return state.weatherByDate[dateKey] || toWeekWeatherFallback(dateKey);
  }

  function formatFullDayLabel(dateKey) {
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

  function closeWeatherModal() {
    state.weatherModalOpenDate = "";
    state.linksModalRequestId = 0;
    elements.weatherModal.hidden = true;
    elements.weatherModal.innerHTML = "";
  }

  function renderWeatherModal(dateKey) {
    const weather = getWeatherForDate(dateKey);
    const title = formatFullDayLabel(dateKey);
    const conditionSummary = cleanText(weather.condition, "Unavailable");
    const high = cleanText(weather.high, WEATHER_FALLBACK_VALUE);
    const low = cleanText(weather.low, WEATHER_FALLBACK_VALUE);
    const precip = cleanText(weather.precipitation, WEATHER_FALLBACK_VALUE);
    const wind = cleanText(weather.wind, WEATHER_FALLBACK_VALUE);
    const humidity = cleanText(weather.humidity, WEATHER_FALLBACK_VALUE);

    elements.weatherModal.innerHTML = `
      <div class="weather-modal-card" role="dialog" aria-modal="true" aria-label="Daily weather forecast">
        <header class="weather-modal-header">
          <div>
            <h3 class="weather-modal-title">${escapeHtml(title)}</h3>
            <p class="weather-modal-location">${escapeHtml(WEATHER_LOCATION.name)}</p>
          </div>
          <button type="button" class="weather-modal-close" data-action="weather-close" aria-label="Close weather modal">X</button>
        </header>
        <div class="weather-modal-body">
          <div class="weather-modal-summary">
            <span class="weather-modal-summary-icon" aria-hidden="true">${weather.icon}</span>
            <span>${escapeHtml(conditionSummary)}</span>
          </div>
          <div class="weather-modal-grid">
            <div class="weather-modal-item"><strong>High:</strong> ${escapeHtml(high)}</div>
            <div class="weather-modal-item"><strong>Low:</strong> ${escapeHtml(low)}</div>
            <div class="weather-modal-item"><strong>Precipitation:</strong> ${escapeHtml(precip)}</div>
            <div class="weather-modal-item"><strong>Wind:</strong> ${escapeHtml(wind)}</div>
            <div class="weather-modal-item"><strong>Humidity:</strong> ${escapeHtml(humidity)}</div>
          </div>
        </div>
      </div>
    `;
    elements.weatherModal.hidden = false;
  }

  function openWeatherModal(dateKey) {
    const targetDate = cleanText(dateKey, "");
    if (!targetDate) {
      return;
    }

    state.weatherModalOpenDate = targetDate;
    renderWeatherModal(targetDate);
  }

  function getYouTubeVideoId(url) {
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
      return "";
    }

    return "";
  }

  function getYouTubeCanonicalUrl(url) {
    const safeUrl = cleanText(url, "");
    const videoId = getYouTubeVideoId(safeUrl);
    if (!videoId) {
      return safeUrl;
    }

    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  function fetchJsonp(url, timeoutMs) {
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

  async function fetchTitleFromOembed(oembedEndpoint, targetUrl) {
    const endpoint = `${oembedEndpoint}?url=${encodeURIComponent(targetUrl)}&format=json`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return cleanText(payload && payload.title, "");
  }

  async function fetchTitleFromNoembed(targetUrl) {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    return cleanText(payload && payload.title, "");
  }

  async function fetchTitleFromOembedViaProxy(targetUrl) {
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

  async function resolveLinkTitle(url) {
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
        // Continue to other resolvers.
      }

      try {
        const payload = await fetchJsonp(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`, 6000);
        const jsonpTitle = cleanText(payload && payload.title, "");
        if (jsonpTitle) {
          return jsonpTitle;
        }
      } catch (error) {
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
      const youtubeId = getYouTubeVideoId(canonicalUrl);
      if (youtubeId) {
        return `YouTube Video ${youtubeId}`;
      }

      return safeUrl;
    }
  }

  function getProjectById(projectId) {
    const targetId = cleanText(projectId, "");
    if (!targetId) {
      return null;
    }

    return state.allProjects.find((project) => cleanText(project.projectId, "") === targetId) || null;
  }

  function getProjectByTitle(title, sourceHint) {
    const targetTitle = cleanText(title, "").toLowerCase();
    if (!targetTitle) {
      return null;
    }

    const normalizedSourceHint = cleanText(sourceHint, "");
    const titleMatches = state.allProjects.filter((project) => cleanText(project.title, "").toLowerCase() === targetTitle);
    if (!titleMatches.length) {
      return null;
    }

    if (!normalizedSourceHint) {
      return titleMatches[0] || null;
    }

    return titleMatches.find((project) => cleanText(project.source, "") === normalizedSourceHint) || titleMatches[0] || null;
  }

  function getTaskProject(task) {
    const sourceId = parseWeeklySourceId(task)
      || cleanText(task && task.projectId, "")
      || cleanText(task && task.taskId, "");
    const byId = getProjectById(sourceId);
    if (byId) {
      return byId;
    }

    const title = cleanText(task && task.title, "");
    const sourceHint = normalizeSource(cleanText(task && task.source, ""));
    return getProjectByTitle(title, sourceHint);
  }

  function getProjectFromTaskId(taskId, fallbackTitle, fallbackSource) {
    const normalizedTaskId = cleanText(taskId, "");
    if (!normalizedTaskId) {
      return getProjectByTitle(fallbackTitle, normalizeSource(cleanText(fallbackSource, "")));
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

      const byCuratedTitle = getProjectByTitle(curatedTask.title, normalizeSource(cleanText(curatedTask.source, "")));
      if (byCuratedTitle) {
        return byCuratedTitle;
      }
    }

    return getProjectByTitle(fallbackTitle, normalizeSource(cleanText(fallbackSource, "")));
  }

  async function openResourceLinksModal(project) {
    const resourceLinkEntries = parseResourceLinkEntries((project && project.resourceLinkEntries) || (project && project.resourceLinks));
    if (!resourceLinkEntries.length) {
      elements.status.textContent = "No resource links available for this project.";
      return;
    }

    state.weatherModalOpenDate = "";
    const requestId = Date.now();
    state.linksModalRequestId = requestId;

    elements.weatherModal.innerHTML = `
      <div class="weather-modal-card" role="dialog" aria-modal="true" aria-label="Resource Links">
        <header class="weather-modal-header">
          <div>
            <h3 class="weather-modal-title">Resource Links</h3>
            <p class="weather-modal-location">${escapeHtml(cleanText(project && project.title, "Project"))}</p>
          </div>
          <button type="button" class="weather-modal-close" data-action="links-close" aria-label="Close resource links modal">X</button>
        </header>
        <div class="weather-modal-body">
          <div class="weather-modal-item">Loading links...</div>
          <div class="weather-modal-actions">
            <button type="button" data-action="links-close">Close</button>
          </div>
        </div>
      </div>
    `;
    elements.weatherModal.hidden = false;

    const resolvedTitles = await Promise.all(resourceLinkEntries.map((entry) => {
      const staticTitle = cleanText(entry && entry.title, "");
      if (staticTitle) {
        return Promise.resolve(staticTitle);
      }

      return resolveLinkTitle(entry.url);
    }));
    if (state.linksModalRequestId !== requestId) {
      return;
    }

    const linksHtml = resourceLinkEntries
      .map((entry, index) => {
        const link = cleanText(entry && entry.url, "");
        const title = cleanText(resolvedTitles[index], link);
        return `<div class="weather-modal-item"><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></div>`;
      })
      .join("");

    elements.weatherModal.innerHTML = `
      <div class="weather-modal-card" role="dialog" aria-modal="true" aria-label="Resource Links">
        <header class="weather-modal-header">
          <div>
            <h3 class="weather-modal-title">Resource Links</h3>
            <p class="weather-modal-location">${escapeHtml(cleanText(project && project.title, "Project"))}</p>
          </div>
          <button type="button" class="weather-modal-close" data-action="links-close" aria-label="Close resource links modal">X</button>
        </header>
        <div class="weather-modal-body">
          ${linksHtml}
          <div class="weather-modal-actions">
            <button type="button" data-action="links-close">Close</button>
          </div>
        </div>
      </div>
    `;
    elements.weatherModal.hidden = false;
  }

  function buildWeeklyTaskId(taskType, sourceId, dateKey) {
    const safeSource = cleanText(sourceId, "");
    const safeDate = cleanText(dateKey, "");
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    if (taskType === "adhoc") {
      return `adhoc-${safeDate}-${stamp}`;
    }

    return `${taskType}-${safeSource}-${safeDate}-${stamp}`;
  }

  function parseWeeklySourceId(task) {
    const id = cleanText(task && (task.id || task.taskId), "");
    if (!id) {
      return "";
    }

    const taskType = cleanText(task && (task.taskType || task.type), "curated");
    if (taskType === "adhoc") {
      return "";
    }

    const match = id.match(/^(curated|repeatable)-(.+)-(\d{4}-\d{2}-\d{2})-\d+(?:-\d+)?$/);
    if (!match) {
      return cleanText(task.projectId, "");
    }

    return cleanText(match[2], "");
  }

  function buildEmptyPlanner(weekStartDate) {
    return {
      weekStartDate,
      tasks: [],
    };
  }

  function normalizeWeeklyTask(task, fallbackDate, fallbackTimeSlot) {
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
      checklist: normalizeChecklist(task.checklist),
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
      metadata: task.metadata && typeof task.metadata === "object" ? { ...task.metadata } : {},
      reminder: {
        active: Boolean(task.reminder && task.reminder.active && reminderSendAt),
        ...(reminderSendAt ? { sendAt: reminderSendAt } : {}),
      },
    };
  }

  function migrateLegacyPlanner(parsed, weekStartDate) {
    const legacyWeekStart = cleanText(parsed.weekStartDate || parsed.weekStart, weekStartDate);
    const tasks = [];

    DAY_ORDER.forEach((day, dayIndex) => {
      const existingDay = parsed.days && parsed.days[day.key] ? parsed.days[day.key] : {};
      SLOT_ORDER.forEach((slot) => {
        const slotItems = Array.isArray(existingDay[slot]) ? existingDay[slot] : [];
        const date = getWeekDateKey(legacyWeekStart, dayIndex);
        slotItems.forEach((item, index) => {
          const normalized = normalizeWeeklyTask({
            ...item,
            id: cleanText(item.id || item.taskId, `legacy-${day.key}-${slot}-${index + 1}`),
            taskId: cleanText(item.taskId || item.id, `legacy-${day.key}-${slot}-${index + 1}`),
            date,
            timeSlot: slot,
          }, date, slot);
          if (normalized) {
            tasks.push(normalized);
          }
        });
      });
    });

    return {
      weekStartDate: legacyWeekStart,
      tasks,
    };
  }

  function ensureProjectServicesLoaded() {
    return loadScriptFresh("js/services/sheets.service.js")
      .then(() => loadScriptFresh("js/services/projects.service.js"));
  }

  function ensurePlannerStorageLoaded() {
    return loadScriptFresh("js/utils/uuid.js")
      .then(() => loadScriptFresh("js/services/planner-storage.service.js"))
      .then(() => loadStyleFresh("components/parking-lot/parking-lot.css"))
      .then(() => loadScriptFresh("components/parking-lot/parking-lot.js"));
  }

  function loadScriptFresh(src) {
    const versionedSrc = `${src}?v=${SERVICE_VERSION}`;

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-module-src="${src}"]`);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement("script");
      script.src = versionedSrc;
      script.dataset.moduleSrc = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  function loadStyleFresh(href) {
    const versionedHref = `${href}?v=${SERVICE_VERSION}`;

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`link[data-module-href="${href}"]`);
      if (existing) {
        existing.remove();
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = versionedHref;
      link.dataset.moduleHref = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
      document.head.appendChild(link);
    });
  }

  async function mountParkingLotPanel() {
    if (!window.ParkingLotComponent || !elements.parkingLotHost) {
      return null;
    }

    const template = await window.ParkingLotComponent.loadTemplate();
    elements.parkingLotHost.innerHTML = template;
    const parkingRoot = elements.parkingLotHost.querySelector(".parking-lot-panel");
    if (!parkingRoot) {
      return null;
    }

    if (state.parkingLotController && typeof state.parkingLotController.destroy === "function") {
      state.parkingLotController.destroy();
    }

    state.parkingLotController = window.ParkingLotComponent.mount(parkingRoot, {
      storage: window.PlannerStorage,
      onParkingRefresh: () => {
        renderTaskPool();
        renderWeekGrid();
      },
      onParkingDragStart: (payload) => {
        state.activeWeeklyDrag = payload || null;
      },
      onParkingDragEnd: () => {
        state.activeWeeklyDrag = null;
      },
    });

    return state.parkingLotController;
  }

  function toProjectView(project) {
    const metadata = project.metadata || {};
    const resourceLinkEntries = parseResourceLinkEntries(project.resourceLinks || metadata.resourceLinks);
    return {
      projectId: cleanText(project.id, "unknown"),
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

  function loadRepeatableOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.repeatable);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Failed to read repeatable task overrides", error);
      return [];
    }
  }

  function saveRepeatableOverrides(items) {
    localStorage.setItem(STORAGE_KEYS.repeatable, JSON.stringify(items));
  }

  function normalizeRecurrence(value) {
    const normalized = cleanText(value, "weekly").toLowerCase().replace(/[\s_-]+/g, "");
    if (normalized === "biweekly" || normalized === "every2weeks" || normalized === "everyotherweek") return "biweekly";
    if (normalized === "monthly" || normalized === "month") return "monthly";
    if (normalized === "quarterly" || normalized === "quarter" || normalized === "every3months") return "quarterly";
    if (normalized === "yearly" || normalized === "annual" || normalized === "annually") return "yearly";
    return "weekly";
  }

  function getDayName(dateKey) {
    const date = parseDateKey(dateKey);
    return date ? FULL_DAY_NAMES[date.getDay()] : "Monday";
  }

  function getMonthWeekValue(dateKey) {
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

  function normalizeMonthWeek(value, fallbackDate) {
    const normalized = cleanText(value, "").toLowerCase();
    if (normalized === "last") {
      return "last";
    }
    if (["1", "2", "3", "4"].includes(normalized)) {
      return normalized;
    }
    return getMonthWeekValue(fallbackDate);
  }

  function getMonthWeekLabel(value) {
    const normalized = normalizeMonthWeek(value);
    if (normalized === "1") return "1st";
    if (normalized === "2") return "2nd";
    if (normalized === "3") return "3rd";
    if (normalized === "4") return "4th";
    return "Last";
  }

  function getNthWeekdayOfMonth(year, monthIndex, weekdayIndex, monthWeek) {
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

  function alignDateToSeriesPattern(dateKey, recurrence, baseDay, monthWeek) {
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

  function alignDateToSeriesDay(dateKey, dayName) {
    const weekStart = getWeekStartISO(parseDateKey(dateKey) || dateKey);
    const targetIndex = Math.max(0, DAY_ORDER.findIndex((day) => day.label.toLowerCase() === cleanText(dayName, "Monday").slice(0, 3).toLowerCase()));
    return addDaysToDateKey(weekStart, targetIndex);
  }

  function addRecurrenceInterval(startDateKey, recurrence, count, seriesRule) {
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

  function getOccurrenceDatesInRange(master, rangeStart, rangeEnd) {
    const startDate = cleanText(master && master.startDate, "");
    if (!startDate || !parseDateKey(startDate)) {
      return [];
    }

    const recurrence = normalizeRecurrence(master.recurrence);
    const occurrences = [];
    for (let index = 0; index < 10000; index += 1) {
      const occurrenceDate = addRecurrenceInterval(startDate, recurrence, index, master);
      if (!occurrenceDate || occurrenceDate > rangeEnd) {
        break;
      }
      if (occurrenceDate >= rangeStart) {
        occurrences.push(occurrenceDate);
      }
    }
    return occurrences;
  }

  function persistRepeatableMaster(master) {
    const projectId = cleanText(master && (master.id || master.projectId), "");
    if (!projectId) {
      return;
    }

    const existing = state.repeatableOverrideMap.get(projectId) || {};
    const record = {
      ...existing,
      projectId,
      id: projectId,
      title: cleanText(master.title, existing.title || "Untitled Task"),
      recurrence: normalizeRecurrence(master.recurrence),
      baseDay: cleanText(master.baseDay, existing.baseDay || "Monday"),
      monthWeek: normalizeMonthWeek(master.monthWeek, master.startDate || existing.startDate || existing.originalStartDate || ""),
      baseBucket: cleanText(master.baseBucket, existing.baseBucket || "Morning"),
      startDate: cleanText(master.startDate, existing.startDate || ""),
      originalStartDate: cleanText(master.originalStartDate, existing.originalStartDate || master.startDate || ""),
      active: master.active !== false,
      removedFromPlanner: master.active === false,
    };
    state.repeatableOverrideMap.set(projectId, record);
    saveRepeatableOverrides(Array.from(state.repeatableOverrideMap.values()));
  }

  function makeRecurringInstance(master, occurrenceDate) {
    const parentRepeatableId = cleanText(master.id || master.projectId, "");
    const id = `repeatable-${parentRepeatableId}-${occurrenceDate}`;
    return toPlannerSlotItem({
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
      overridden: false,
      deletedInstance: false,
      metadata: { generated: true },
    });
  }

  function generateVisibleRecurringInstances() {
    if (!state.planner || !Array.isArray(state.planner.tasks)) {
      return false;
    }

    const visible = getVisibleWeekDateRange(state.planner.weekStartDate);
    const rangeStart = visible[0] && visible[0].date;
    const rangeEnd = visible[6] && visible[6].date;
    if (!rangeStart || !rangeEnd) {
      return false;
    }

    let changed = false;
    state.repeatableTasks.filter((master) => master.active !== false && master.startDate).forEach((master) => {
      getOccurrenceDatesInRange(master, rangeStart, rangeEnd).forEach((occurrenceDate) => {
        const parentId = cleanText(master.id || master.projectId, "");
        const existing = state.planner.tasks.find((item) => cleanText(item.parentRepeatableId, "") === parentId && cleanText(item.occurrenceDate, item.date) === occurrenceDate);
        if (!existing) {
          state.planner.tasks.push(makeRecurringInstance(master, occurrenceDate));
          changed = true;
        }
      });
    });

    if (changed) {
      savePlanner();
    }
    return changed;
  }

  function normalizeChecklist(items) {
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

  function getSlotItemId(item) {
    return cleanText(item && (item.id || item.taskId), "");
  }

  function getWeekStartISO(dateValue) {
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

  function loadCuratedTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.curatedTasks);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((task, index) => ({
        taskId: cleanText(task.taskId, `task-${index + 1}`),
        projectId: cleanText(task.projectId, ""),
        title: cleanText(task.title, "Untitled Task"),
        source: cleanText(task.source, "unknown"),
        category: cleanText(task.category, "uncategorized"),
        recurrence: cleanText(task.recurrence, ""),
        priority: parseNumber(task.priority, 3),
        order: parseNumber(task.order, index + 1),
      }));
    } catch (error) {
      console.warn("Failed to read curated tasks", error);
      return [];
    }
  }

  async function loadPlanner() {
    const weekStartDate = getWeekStartISO(new Date());
    const storedPlanner = await window.PlannerStorage.getWeeklyPlanner();
    const safePlanner = buildEmptyPlanner(cleanText(storedPlanner && storedPlanner.weekStartDate, weekStartDate));
    safePlanner.tasks = (storedPlanner && Array.isArray(storedPlanner.tasks) ? storedPlanner.tasks : [])
      .map((item) => normalizeWeeklyTask(item, cleanText(item.date, safePlanner.weekStartDate), cleanText(item.timeSlot || item.slot, "morning")))
      .filter(Boolean);
    return safePlanner;
  }

  function savePlanner() {
    if (!state.planner) {
      return;
    }
    return window.PlannerStorage.saveWeeklyPlannerState(state.planner);
  }

  function saveCuratedTasks() {
    localStorage.setItem(STORAGE_KEYS.curatedTasks, JSON.stringify(state.curatedTasks));
  }

  function hideCuratedWarning() {
    if (state.curatedWarningTimer) {
      clearTimeout(state.curatedWarningTimer);
      state.curatedWarningTimer = null;
    }

    elements.curatedWarning.style.display = "none";
    elements.curatedWarning.textContent = "";
  }

  function showCuratedWarning(message) {
    if (state.curatedWarningTimer) {
      clearTimeout(state.curatedWarningTimer);
      state.curatedWarningTimer = null;
    }

    elements.curatedWarning.textContent = cleanText(message, "");
    elements.curatedWarning.style.display = "block";
    state.curatedWarningTimer = window.setTimeout(() => {
      hideCuratedWarning();
    }, 5000);
  }

  function getVisibleDateForDay(dayKey) {
    const dayIndex = DAY_ORDER.findIndex((item) => item.key === dayKey);
    if (dayIndex < 0) {
      return "";
    }

    return getWeekDateKey(state.planner.weekStartDate, dayIndex);
  }

  function assignTask(taskId, day, slot) {
    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    const task = state.curatedTasks.find((item) => item.taskId === taskId);
    if (!task) {
      return false;
    }

    upsertWeeklyTaskFromSource({
      ...task,
      taskType: "curated",
      type: "curated",
      checklist: task.checklist || [],
      completed: false,
    }, date, slot, "curated");

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Assigned "${task.title}" to ${day.toUpperCase()} ${slot}.`;
    return true;
  }

  function addAdHocTask(title, day, slot) {
    const normalizedTitle = cleanText(title, "");
    if (!normalizedTitle) {
      elements.status.textContent = "Ad-hoc task title is required.";
      return false;
    }

    const date = getVisibleDateForDay(day);
    if (!date || !SLOT_ORDER.includes(slot)) {
      elements.status.textContent = "Please select a valid day and time for the ad-hoc task.";
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
    renderWeekGrid();

    elements.adhocTitle.value = "";
    elements.adhocDay.value = "mon";
    elements.adhocSlot.value = "morning";
    elements.status.textContent = `Added ad-hoc task "${normalizedTitle}" to ${day.toUpperCase()} ${slot}.`;
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

    upsertWeeklyTaskFromSource({
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
    }, date, slot, "curated");

    return true;
  }

  function moveTask(taskId, toDate, toSlot) {
    const targetDate = cleanText(toDate, "");
    if (!targetDate || !SLOT_ORDER.includes(toSlot)) {
      return false;
    }

    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    existing.item.date = targetDate;
    existing.item.timeSlot = toSlot;
    existing.item.bucket = toSlot;
    if (cleanText(existing.item.parentRepeatableId, "")) {
      existing.item.overridden = true;
    } else {
      const taskType = cleanText(existing.item.taskType || existing.item.type, "curated");
      const sourceId = parseWeeklySourceId(existing.item) || cleanText(existing.item.projectId, "") || cleanText(existing.item.taskId, "");
      existing.item.id = buildWeeklyTaskId(taskType, sourceId, targetDate);
      existing.item.taskId = existing.item.id;
    }
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Moved "${existing.item.title}" to ${targetDate} ${toSlot}.`;
    return true;
  }

  function shiftTaskWeek(taskId, offsetWeeks) {
    const existing = findWeeklyTaskById(taskId);
    const weekOffset = parseNumber(offsetWeeks, 0);
    if (!existing) {
      return false;
    }

    if (!weekOffset) {
      renderWeekGrid();
      return true;
    }

    const newDate = addDaysToDateKey(existing.item.date, weekOffset * 7);
    const newWeekStartDate = getWeekStartISO(parseDateKey(newDate) || newDate);

    existing.item.date = newDate;
    if (cleanText(existing.item.parentRepeatableId, "")) {
      existing.item.overridden = true;
    } else {
      const taskType = cleanText(existing.item.taskType || existing.item.type, "curated");
      const sourceId = parseWeeklySourceId(existing.item) || cleanText(existing.item.projectId, "") || cleanText(existing.item.taskId, "");
      existing.item.id = buildWeeklyTaskId(taskType, sourceId, newDate);
      existing.item.taskId = existing.item.id;
    }
    state.planner.weekStartDate = newWeekStartDate;
    state.selectedCalendarDate = newDate;
    state.calendarMonthDate = toMonthStartDateKey(newDate);

    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = `Moved "${existing.item.title}" ${weekOffset > 0 ? "forward" : "back"} one week.`;
    return true;
  }

  function closeWeekMenus(exceptPicker) {
    elements.weekGrid.querySelectorAll(".slot-task-week-picker.is-open").forEach((picker) => {
      if (exceptPicker && picker === exceptPicker) {
        return;
      }

      picker.classList.remove("is-open");
      const menu = picker.querySelector("[data-role='task-week-menu']");
      if (menu) {
        menu.hidden = true;
      }
    });
  }

  function removeTask(taskId) {
    const existing = findWeeklyTaskById(taskId);
    if (!existing) {
      return false;
    }

    if (cleanText(existing.item.parentRepeatableId, "")) {
      existing.item.deletedInstance = true;
    } else {
      state.planner.tasks.splice(existing.index, 1);
    }
    savePlanner();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = "Task removed from planner slot.";
    return true;
  }

  function removeTaskFromPlanner(taskId) {
    const beforeCurated = state.curatedTasks.length;
    state.curatedTasks = state.curatedTasks.filter((task) => task.taskId !== taskId);
    const removedFromCurated = state.curatedTasks.length !== beforeCurated;

    const beforeSchedule = state.planner.tasks.length;
    state.planner.tasks = state.planner.tasks.filter((item) => cleanText(item.taskType || item.type, "curated") !== "curated" || parseWeeklySourceId(item) !== cleanText(taskId, ""));
    const removedFromSchedule = state.planner.tasks.length !== beforeSchedule;

    if (!removedFromCurated && !removedFromSchedule) {
      return false;
    }

    saveCuratedTasks();
    savePlanner();
    hideCuratedWarning();
    renderTaskPool();
    renderWeekGrid();
    elements.status.textContent = "Task removed from Planner and schedule.";
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
    renderTaskPool();
    elements.status.textContent = "Task removed from Curated Tasks.";
    return true;
  }

  function removeWeeklyCopiesForRepeatable(projectId) {
    const before = state.planner.tasks.length;
    state.planner.tasks = state.planner.tasks.filter((item) => {
      if (cleanText(item.taskType || item.type, "curated") !== "repeatable") {
        return true;
      }
      return cleanText(item.parentRepeatableId, "") !== cleanText(projectId, "")
        && parseWeeklySourceId(item) !== cleanText(projectId, "");
    });
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

    saveRepeatableOverrides(Array.from(state.repeatableOverrideMap.values()));
    savePlanner();
    renderRepeatablePanel();
    renderWeekGrid();
    elements.status.textContent = "Repeatable task removed from the task container. Weekly planner entries remain scheduled.";
  }

  function createWeeklyRepeatableCopy(masterTask, date, slot) {
    if (!date || !SLOT_ORDER.includes(slot)) {
      return false;
    }

    masterTask.id = cleanText(masterTask.id || masterTask.projectId, "");
    masterTask.recurrence = normalizeRecurrence(masterTask.recurrence);
    masterTask.baseDay = getDayName(date);
    masterTask.monthWeek = getMonthWeekValue(date);
    masterTask.baseBucket = slot.charAt(0).toUpperCase() + slot.slice(1);
    masterTask.startDate = date;
    masterTask.originalStartDate = cleanText(masterTask.originalStartDate, date);
    masterTask.active = true;
    persistRepeatableMaster(masterTask);

    const existing = state.planner.tasks.find((item) => cleanText(item.parentRepeatableId, "") === masterTask.id && cleanText(item.occurrenceDate, item.date) === date);
    if (!existing) {
      state.planner.tasks.push(makeRecurringInstance(masterTask, date));
    }
    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Added repeatable task "${masterTask.title}" to ${date}.`;
    return true;
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

  function toPlannerSlotItem(taskLike) {
    return normalizeWeeklyTask(taskLike, cleanText(taskLike && taskLike.date, ""), cleanText(taskLike && (taskLike.timeSlot || taskLike.slot), "morning"));
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
    });

    if (existingIndex >= 0) {
      state.planner.tasks[existingIndex] = {
        ...state.planner.tasks[existingIndex],
        ...weeklyTask,
      };
    } else {
      state.planner.tasks.push(weeklyTask);
    }

    return weeklyTask;
  }

  function renderRepeatablePanel() {
    if (!state.repeatableTasks.length) {
      elements.repeatablePanel.innerHTML = '<div class="pool-empty">No repeatable tasks found.</div>';
      return;
    }

    elements.repeatablePanel.innerHTML = state.repeatableTasks
      .map((task) => `
        <article class="repeatable-task-card" data-repeatable-project-id="${task.projectId}">
          <span class="repeatable-task-handle" data-action="repeatable-drag-handle" draggable="true" title="Drag to weekly planner" aria-label="Drag repeatable task">⋮⋮</span>
          <div class="repeatable-task-title">${task.title}</div>
          <button type="button" class="repeatable-task-remove" data-action="remove-repeatable-master" title="Remove repeatable task" aria-label="Remove repeatable task">X</button>
        </article>
      `)
      .join("");
  }

  async function loadRepeatableTasks() {
    try {
      await ensureProjectServicesLoaded();
      const projects = await window.loadAllProjects();
      state.allProjects = (projects || []).map(toProjectView);
      const taskManagerTasks = window.PlannerStorage && typeof window.PlannerStorage.getTaskManager === "function"
        ? await window.PlannerStorage.getTaskManager()
        : [];

      const overrides = loadRepeatableOverrides();
      const overrideMap = new Map(overrides.map((item) => [item.projectId, item]));
      state.repeatableOverrideMap = overrideMap;

      state.repeatableTasks = [...state.allProjects]
        .filter((project) => normalizeSource(project.source) === "repeating")
        .map((project, index) => {
          const override = overrideMap.get(project.projectId) || {};
          if (override.removedFromPlanner === true) {
            return null;
          }

          return {
            id: project.projectId,
            taskId: `repeatable-${project.projectId}`,
            projectId: project.projectId,
            title: project.title,
            source: "repeating",
            state: cleanText(project.state, "unknown"),
            recurrence: normalizeRecurrence(override.recurrence || project.recurrence),
            baseDay: cleanText(override.baseDay, ""),
            monthWeek: normalizeMonthWeek(override.monthWeek, override.startDate || override.originalStartDate || ""),
            baseBucket: cleanText(override.baseBucket, ""),
            startDate: cleanText(override.startDate, ""),
            originalStartDate: cleanText(override.originalStartDate, override.startDate || ""),
            active: override.active !== false && override.removedFromPlanner !== true,
            priority: parseNumber(override.priority, parseNumber(project.priority, 3)),
            order: parseNumber(override.order, parseNumber(project.order, index + 1)),
            category: project.category,
            asset: cleanText(project.asset, ""),
            mileage: cleanText(project.mileage, ""),
          };
        })
        .filter(Boolean);

      const repeatableProjectIds = new Set(state.repeatableTasks.map((task) => cleanText(task.projectId, "")));
      taskManagerTasks
        .filter((task) => normalizeSource(task.source) === "repeating")
        .filter((task) => {
          try {
            const metadata = JSON.parse(cleanText(task.metadataJson, "{}"));
            return metadata && metadata.plannerRepeatable === true;
          } catch (error) {
            return false;
          }
        })
        .filter((task) => !repeatableProjectIds.has(cleanText(task.projectId, "")))
        .forEach((task, index) => {
          state.repeatableTasks.push({
            id: cleanText(task.id, cleanText(task.projectId, `repeatable-task-${index + 1}`)),
            taskId: `repeatable-${cleanText(task.projectId, task.id)}`,
            projectId: cleanText(task.projectId, ""),
            title: cleanText(task.title, "Untitled Task"),
            source: "repeating",
            state: cleanText(task.state, "unknown"),
            recurrence: normalizeRecurrence(task.recurrence),
            baseDay: "",
            monthWeek: "",
            baseBucket: "",
            startDate: cleanText(task.startDate, ""),
            originalStartDate: cleanText(task.startDate, ""),
            active: true,
            priority: parseNumber(task.priority, 3),
            order: parseNumber(task.order, state.repeatableTasks.length + 1),
            category: cleanText(task.category, "uncategorized"),
            asset: "",
            mileage: "",
          });
        });

      state.repeatableTasks.sort((left, right) => {
        const orderDifference = parseNumber(left.order, Number.MAX_SAFE_INTEGER) - parseNumber(right.order, Number.MAX_SAFE_INTEGER);
        return orderDifference || cleanText(left.title, "").localeCompare(cleanText(right.title, ""));
      });

      renderRepeatablePanel();
    } catch (error) {
      console.warn("Failed to load repeatable tasks", error);
      state.repeatableTasks = [];
      renderRepeatablePanel();
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

  function toggleChecklistOpen(taskId, day, slot) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project")) {
      return false;
    }

    match.item.checklistOpen = !Boolean(match.item.checklistOpen);
    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Checklist ${match.item.checklistOpen ? "expanded" : "collapsed"} for "${match.item.title}".`;
    return true;
  }

  function toggleChecklistItem(taskId, day, slot, checklistId, completed) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project")) {
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
    renderWeekGrid();
    elements.status.textContent = `Checklist updated for "${match.item.title}".`;
    return true;
  }

  function addChecklistItem(taskId, day, slot, text) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project")) {
      return false;
    }

    const normalizedText = cleanText(text, "");
    if (!normalizedText) {
      elements.status.textContent = "Sub-task text is required.";
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
    renderWeekGrid();
    elements.status.textContent = `Added sub-task to "${match.item.title}".`;
    return true;
  }

  function removeChecklistItem(taskId, day, slot, checklistId) {
    const match = findSlotTask(day, slot, taskId);
    const taskType = cleanText(match && match.item && (match.item.taskType || match.item.type), "curated");
    if (!match || (taskType !== "curated" && taskType !== "project")) {
      return false;
    }

    const checklist = normalizeChecklist(match.item.checklist);
    const before = checklist.length;
    match.item.checklist = checklist.filter((entry) => cleanText(entry.id, "") !== cleanText(checklistId, ""));

    if (before === match.item.checklist.length) {
      return false;
    }

    savePlanner();
    renderWeekGrid();
    elements.status.textContent = `Removed sub-task from "${match.item.title}".`;
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
    renderWeekGrid();
    return true;
  }

  function setTaskCompleted(taskId, day, slot, completed) {
    const match = findSlotTask(day, slot, taskId);
    if (!match) {
      return false;
    }

    match.item.completed = Boolean(completed);
    savePlanner();
    renderWeekGrid();
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

  function getWeeklyTaskType(task) {
    return cleanText(task && (task.taskType || task.type), "curated");
  }

  function formatReminderTime(sendAt) {
    const date = sendAt instanceof Date ? sendAt : new Date(sendAt);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function showReminderConfirmation(taskId, message) {
    const card = Array.from(elements.weekGrid.querySelectorAll(".slot-task[data-task-id]"))
      .find((item) => cleanText(item.dataset.taskId, "") === cleanText(taskId, ""));
    const confirmation = card && card.querySelector("[data-role='reminder-confirmation']");
    if (!confirmation) {
      return;
    }

    confirmation.textContent = cleanText(message, "");
    confirmation.hidden = false;
    window.setTimeout(() => {
      if (confirmation.isConnected) {
        confirmation.hidden = true;
        confirmation.textContent = "";
      }
    }, 3000);
  }

  function getReminderEndpoint(action) {
    const baseUrl = cleanText(window.APP_CONFIG && window.APP_CONFIG.GOOGLE_SHEETS_WRITE_URL, "");
    if (!baseUrl) {
      throw new Error("Google Apps Script reminder endpoint is not configured.");
    }

    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}action=${encodeURIComponent(action)}`;
  }

  async function postReminderAction(action, payload) {
    const response = await fetch(getReminderEndpoint(action), {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      throw new Error(`Reminder request failed (${response.status}).`);
    }

    const result = await response.json().catch(() => ({ ok: true }));
    if (result.ok === false) {
      throw new Error(cleanText(result.error, "Reminder request failed."));
    }

    return result;
  }

  async function sendReminder(task, sendAt) {
    const config = window.APP_CONFIG || {};
    const phoneNumber = cleanText(config.USER_PHONE_NUMBER, "");
    const smsGateway = cleanText(config.USER_SMS_GATEWAY, "");
    if (!phoneNumber || !smsGateway) {
      throw new Error("Set USER_PHONE_NUMBER and USER_SMS_GATEWAY in app-config.js first.");
    }

    const payload = {
      phoneNumber,
      smsGateway,
      message: `Reminder: ${task.title}`,
      sendAt: sendAt.toISOString(),
      taskId: task.id,
    };

    await postReminderAction("sendReminder", payload);
    task.reminder = { active: true, sendAt: payload.sendAt };
    savePlanner();
    renderWeekGrid();
    showReminderConfirmation(task.id, `Reminder set for ${formatReminderTime(sendAt)}`);
  }

  async function resetReminder(task, newSendAt) {
    const config = window.APP_CONFIG || {};
    const payload = {
      phoneNumber: cleanText(config.USER_PHONE_NUMBER, ""),
      smsGateway: cleanText(config.USER_SMS_GATEWAY, ""),
      message: `Reminder: ${task.title}`,
      taskId: task.id,
      newSendAt: newSendAt.toISOString(),
    };

    await postReminderAction("resetReminder", payload);
    task.reminder = { active: true, sendAt: payload.newSendAt };
    savePlanner();
    renderWeekGrid();
    showReminderConfirmation(task.id, `Reminder updated to ${formatReminderTime(newSendAt)}`);
  }

  async function deleteReminder(task) {
    await postReminderAction("deleteReminder", { taskId: task.id });
    task.reminder = { active: false };
    savePlanner();
    renderWeekGrid();
    showReminderConfirmation(task.id, "Reminder deleted");
  }

  function closeReminderModal() {
    elements.reminderModal.hidden = true;
    elements.reminderModal.innerHTML = "";
  }

  function openReminderModal(task) {
    const match = findWeeklyTaskById(task && task.id);
    const currentTask = match && match.item;
    if (!currentTask) {
      elements.status.textContent = "Unable to locate that Planner task.";
      return;
    }

    const hasReminder = Boolean(currentTask.reminder && currentTask.reminder.active && currentTask.reminder.sendAt);
    const currentTime = hasReminder ? new Date(currentTask.reminder.sendAt) : null;
    const defaultCustomTime = currentTime && !Number.isNaN(currentTime.getTime())
      ? `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`
      : "09:00";

    elements.reminderModal.innerHTML = `
      <div class="reminder-modal-card" role="dialog" aria-modal="true" aria-labelledby="reminder-modal-title">
        <div class="reminder-modal-header">
          <div>
            <h2 id="reminder-modal-title">Send Reminder</h2>
            <p>${escapeHtml(currentTask.title)} - ${escapeHtml(formatDateLabel(currentTask.date))}</p>
          </div>
          <button type="button" data-action="reminder-cancel" aria-label="Close reminder dialog" title="Close">X</button>
        </div>
        <form class="reminder-form">
          <label><input type="radio" name="reminder-time" value="10" checked /> 10 minutes before bucket time</label>
          <label><input type="radio" name="reminder-time" value="30" /> 30 minutes before bucket time</label>
          <label><input type="radio" name="reminder-time" value="60" /> 1 hour before bucket time</label>
          <label class="reminder-custom-option">
            <input type="radio" name="reminder-time" value="custom" />
            <span>Custom time:</span>
            <input type="time" name="custom-time" value="${defaultCustomTime}" />
          </label>
          <div class="reminder-error" role="alert" hidden></div>
          <div class="reminder-modal-actions">
            <button type="submit" class="primary" data-action="reminder-send">Send Reminder</button>
            ${hasReminder ? '<button type="button" data-action="reminder-reset">Reset Reminder</button><button type="button" class="danger" data-action="reminder-delete">Delete Reminder</button>' : ""}
            <button type="button" data-action="reminder-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;
    elements.reminderModal.hidden = false;

    const form = elements.reminderModal.querySelector(".reminder-form");
    const errorElement = elements.reminderModal.querySelector(".reminder-error");
    const customTimeInput = form.querySelector("input[name='custom-time']");
    const getSendAt = () => {
      const selected = form.querySelector("input[name='reminder-time']:checked");
      if (!selected) {
        throw new Error("Choose a reminder time.");
      }

      if (selected.value === "custom") {
        if (!customTimeInput.value) {
          throw new Error("Choose a custom time.");
        }
        return new Date(`${currentTask.date}T${customTimeInput.value}:00`);
      }

      const bucketTimes = { morning: "08:00", afternoon: "13:00", evening: "18:00", "all day": "09:00", allday: "09:00" };
      const bucketTime = bucketTimes[cleanText(currentTask.timeSlot, "morning").toLowerCase()] || "09:00";
      const sendAt = new Date(`${currentTask.date}T${bucketTime}:00`);
      sendAt.setMinutes(sendAt.getMinutes() - Number(selected.value));
      return sendAt;
    };
    const runAction = async (action) => {
      errorElement.hidden = true;
      form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      try {
        await action();
        closeReminderModal();
      } catch (error) {
        errorElement.textContent = cleanText(error && error.message, "Unable to update reminder.");
        errorElement.hidden = false;
        form.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      }
    };

    customTimeInput.addEventListener("focus", () => {
      form.querySelector("input[name='reminder-time'][value='custom']").checked = true;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runAction(() => sendReminder(currentTask, getSendAt()));
    });
    elements.reminderModal.querySelector("[data-action='reminder-reset']")?.addEventListener("click", () => {
      runAction(() => resetReminder(currentTask, getSendAt()));
    });
    elements.reminderModal.querySelector("[data-action='reminder-delete']")?.addEventListener("click", () => {
      runAction(() => deleteReminder(currentTask));
    });
    elements.reminderModal.querySelectorAll("[data-action='reminder-cancel']").forEach((button) => {
      button.addEventListener("click", closeReminderModal);
    });
  }

  function closeSeriesEditModal() {
    elements.seriesModal.hidden = true;
    elements.seriesModal.innerHTML = "";
  }

  function findRepeatableMaster(parentRepeatableId) {
    const parentId = cleanText(parentRepeatableId, "");
    return state.repeatableTasks.find((master) => cleanText(master.id || master.projectId, "") === parentId) || null;
  }

  function removeGeneratedSeriesInstances(parentRepeatableId, fromDate) {
    const parentId = cleanText(parentRepeatableId, "");
    const threshold = cleanText(fromDate, "");
    state.planner.tasks = state.planner.tasks.filter((item) => {
      if (cleanText(item.parentRepeatableId, "") !== parentId || item.overridden) {
        return true;
      }
      return threshold && cleanText(item.occurrenceDate, item.date) < threshold;
    });
  }

  function saveSeriesChanges(master, currentInstance, values) {
    const parentId = cleanText(master.id || master.projectId, "");
    const today = toDateKey(new Date());
    const currentDate = cleanText(currentInstance.date, currentInstance.occurrenceDate);
    let threshold = today;

    master.recurrence = normalizeRecurrence(values.recurrence);
    master.baseDay = cleanText(values.baseDay, master.baseDay || "Monday");
    master.monthWeek = normalizeMonthWeek(values.monthWeek, currentDate);
    master.baseBucket = cleanText(values.baseBucket, master.baseBucket || "Morning");
    master.active = true;

    if (values.applyScope === "this-future") {
      master.startDate = alignDateToSeriesPattern(currentDate, master.recurrence, master.baseDay, master.monthWeek);
      threshold = master.startDate;
      removeGeneratedSeriesInstances(parentId, threshold);
      currentInstance.occurrenceDate = master.startDate;
      currentInstance.date = master.startDate;
      currentInstance.timeSlot = master.baseBucket.toLowerCase();
      currentInstance.bucket = currentInstance.timeSlot;
      currentInstance.recurrence = master.recurrence;
      currentInstance.overridden = false;
      currentInstance.deletedInstance = false;
      if (!state.planner.tasks.includes(currentInstance)) {
        state.planner.tasks.push(currentInstance);
      }
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

    if (values.applyScope !== "this-future") {
      removeGeneratedSeriesInstances(parentId, threshold);
    }
    persistRepeatableMaster(master);
    generateVisibleRecurringInstances();
    savePlanner();
    renderRepeatablePanel();
    renderWeekGrid();
    elements.status.textContent = `Updated recurrence series for "${master.title}".`;
  }

  function deleteRepeatableSeries(master) {
    const parentId = cleanText(master.id || master.projectId, "");
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
    state.planner.tasks = state.planner.tasks.filter((item) => cleanText(item.parentRepeatableId, "") !== parentId);
    saveRepeatableOverrides(Array.from(state.repeatableOverrideMap.values()));
    savePlanner();
    renderRepeatablePanel();
    renderWeekGrid();
    elements.status.textContent = `Deleted recurrence series "${master.title}" and kept it in Repeatable Tasks.`;
  }

  function openSeriesEditModal(repeatableTask, currentInstance) {
    const master = findRepeatableMaster(repeatableTask && (repeatableTask.id || repeatableTask.projectId)) || repeatableTask;
    if (!master || !currentInstance) {
      elements.status.textContent = "Unable to locate that recurrence series.";
      return;
    }

    const recurrenceOptions = [
      ["weekly", "Weekly"],
      ["biweekly", "Bi-weekly"],
      ["monthly", "Monthly"],
      ["quarterly", "Quarterly"],
      ["yearly", "Yearly"],
    ].map(([value, label]) => `<option value="${value}" ${normalizeRecurrence(master.recurrence) === value ? "selected" : ""}>${label}</option>`).join("");
    const dayOptions = FULL_DAY_NAMES.slice(1).concat(FULL_DAY_NAMES[0])
      .map((day) => `<option value="${day}" ${cleanText(master.baseDay, getDayName(currentInstance.occurrenceDate || currentInstance.date)) === day ? "selected" : ""}>${day}</option>`)
      .join("");
    const monthWeekOptions = MONTH_WEEK_OPTIONS
      .map((value) => `<option value="${value}" ${normalizeMonthWeek(master.monthWeek, currentInstance.date || currentInstance.occurrenceDate) === value ? "selected" : ""}>${getMonthWeekLabel(value)}</option>`)
      .join("");
    const selectedBucket = cleanText(master.baseBucket, currentInstance.timeSlot || "Morning").toLowerCase();
    const bucketOptions = SLOT_ORDER.map((slot) => {
      const label = slot.charAt(0).toUpperCase() + slot.slice(1);
      return `<option value="${label}" ${selectedBucket === slot ? "selected" : ""}>${label}</option>`;
    }).join("");

    elements.seriesModal.innerHTML = `
      <div class="series-modal-card" role="dialog" aria-modal="true" aria-labelledby="series-modal-title">
        <div class="series-modal-header">
          <div>
            <h2 id="series-modal-title">Edit Recurrence Series</h2>
            <p>${escapeHtml(master.title)}</p>
          </div>
          <button type="button" data-action="series-cancel" aria-label="Close series editor" title="Close">X</button>
        </div>
        <form class="series-form">
          <label>Recurrence type<select name="recurrence">${recurrenceOptions}</select></label>
          <label>Week of month<select name="month-week">${monthWeekOptions}</select></label>
          <label>Series day<select name="base-day">${dayOptions}</select></label>
          <label>Series bucket<select name="base-bucket">${bucketOptions}</select></label>
          <fieldset>
            <legend>Apply changes</legend>
            <label><input type="radio" name="apply-scope" value="future" checked /> Apply to all future occurrences</label>
            <label><input type="radio" name="apply-scope" value="this-future" /> Apply to this and future occurrences</label>
            <label><input type="radio" name="apply-scope" value="entire" /> Apply to entire series (including past)</label>
          </fieldset>
          <div class="series-modal-actions">
            <button type="submit" class="primary">Save Series Changes</button>
            <button type="button" class="danger" data-action="series-delete">Delete Series</button>
            <button type="button" data-action="series-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;
    elements.seriesModal.hidden = false;

    const form = elements.seriesModal.querySelector(".series-form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSeriesChanges(master, currentInstance, {
        recurrence: form.elements.recurrence.value,
        monthWeek: form.elements["month-week"].value,
        baseDay: form.elements["base-day"].value,
        baseBucket: form.elements["base-bucket"].value,
        applyScope: form.elements["apply-scope"].value,
      });
      closeSeriesEditModal();
    });
    elements.seriesModal.querySelector("[data-action='series-delete']").addEventListener("click", () => {
      if (window.confirm(`Delete the entire recurrence series "${master.title}"?`)) {
        deleteRepeatableSeries(master);
        closeSeriesEditModal();
      }
    });
    elements.seriesModal.querySelectorAll("[data-action='series-cancel']").forEach((button) => {
      button.addEventListener("click", closeSeriesEditModal);
    });
  }

  function renderWeeklyTaskCard(task, dateKey, slot, project) {
    const taskType = getWeeklyTaskType(task);
    const taskId = getSlotItemId(task);
    const taskCompleted = Boolean(task.completed);
    const title = cleanText(task.title, "Untitled Task");
    const projectLinkEntries = parseResourceLinkEntries(project && (project.resourceLinkEntries || project.resourceLinks));
    const hasResourceLinks = projectLinkEntries.length > 0;
    const resourceProjectId = cleanText(project && project.projectId, "")
      || cleanText(task && task.projectId, "")
      || cleanText(parseWeeklySourceId(task), "");
    const resourceLinksButton = taskType !== "adhoc" && hasResourceLinks
      ? `
      <button
        type="button"
        class="slot-task-links-button"
        data-action="open-resource-links"
        data-task-id="${escapeHtml(taskId)}"
        data-project-id="${escapeHtml(resourceProjectId)}"
        aria-label="Open resource links"
        title="Resource Links"
      >🔗</button>
    `
      : "";
    const reminderActive = Boolean(task.reminder && task.reminder.active && task.reminder.sendAt);
    const reminderButton = `
      <button type="button" class="slot-task-reminder-button ${reminderActive ? "is-active" : ""}" data-action="reminder-open" aria-label="${reminderActive ? "Edit active reminder" : "Set reminder"}" title="${reminderActive ? "Reminder active" : "Send Reminder"}">${reminderActive ? "&#128276;" : "&#128277;"}</button>
    `;
    const reminderConfirmation = '<div class="slot-task-reminder-confirmation" data-role="reminder-confirmation" aria-live="polite" hidden></div>';
    const seriesButton = cleanText(task.parentRepeatableId, "")
      ? '<button type="button" class="slot-task-series-button" data-action="series-edit" aria-label="Edit recurrence series" title="Edit Series">&#8635;</button>'
      : "";
    const weekPickerMenu = `
      <div class="slot-task-week-picker">
        <button type="button" class="slot-task-week-button" data-action="task-week-picker" aria-label="Move task to week" title="Move task to week">
          <span class="slot-task-week-icon" aria-hidden="true"></span>
        </button>
        <div class="slot-task-week-menu" data-role="task-week-menu" hidden>
          <button type="button" class="slot-task-week-menu-item" data-action="task-week-shift" data-week-offset="-1">Last Week</button>
          <button type="button" class="slot-task-week-menu-item" data-action="task-week-shift" data-week-offset="0">This Week</button>
          <button type="button" class="slot-task-week-menu-item" data-action="task-week-shift" data-week-offset="1">Next Week</button>
        </div>
      </div>
    `;
    const cardClass = taskType === "repeatable"
      ? "slot-task slot-task-repeatable"
      : taskType === "adhoc"
        ? "slot-task slot-task-adhoc"
        : "slot-task slot-task-curated";

    if (taskType === "repeatable") {
      return `
        <div class="${cardClass} ${taskCompleted ? "is-complete" : ""} ${task.overridden ? "is-overridden" : ""}" data-date="${dateKey}" data-slot="${slot}" data-task-id="${taskId}" data-task-type="${taskType}">
          <div class="slot-task-layout">
            <span class="slot-task-handle" data-action="weekly-drag-handle" draggable="true" title="Drag to move" aria-label="Drag to move">⋮⋮</span>
            <div class="slot-task-main">
              <div class="slot-task-header">
                <div class="slot-task-title">${title}</div>
                <div class="slot-task-header-actions">
                  ${resourceLinksButton}
                  ${reminderButton}
                  ${seriesButton}
                  ${weekPickerMenu}
                  <input type="checkbox" class="slot-task-complete" data-action="task-complete-toggle" aria-label="Mark task complete" ${taskCompleted ? "checked" : ""} />
                  <button type="button" class="slot-task-remove" data-action="remove" aria-label="Remove task" title="Remove task">X</button>
                </div>
              </div>
              ${reminderConfirmation}
            </div>
          </div>
        </div>
      `;
    }

    const checklist = normalizeChecklist(task.checklist);
    const checklistOpen = Boolean(task.checklistOpen);
    const checklistToggleLabel = `Checklist ${checklistOpen ? "▲" : "▼"}`;
    const checklistHtml = taskType === "curated" || taskType === "project"
      ? `
        <div class="slot-checklist">
          <button type="button" class="slot-checklist-toggle" data-action="checklist-toggle">${checklistToggleLabel}</button>
          ${checklistOpen ? `
          <div class="slot-checklist-body">
            <div class="slot-checklist-list">
              ${checklist.length
                ? checklist.map((entry) => `
                <div class="slot-checklist-item ${entry.completed ? "is-complete" : ""}" data-checklist-id="${entry.id}">
                  <span class="slot-checklist-handle" data-action="checklist-drag-handle" draggable="true" aria-label="Drag sub-task" title="Drag to reorder">⋮⋮</span>
                  <input type="checkbox" data-action="checklist-item-toggle" data-checklist-id="${entry.id}" ${entry.completed ? "checked" : ""} />
                  <span class="slot-checklist-text">${entry.text}</span>
                  <button type="button" class="slot-checklist-remove" data-action="checklist-item-remove" data-checklist-id="${entry.id}">X</button>
                </div>
                `).join("")
                : '<div class="slot-checklist-empty">No sub-tasks yet.</div>'}
            </div>
            <div class="slot-checklist-add">
              <input type="text" data-action="checklist-add-input" placeholder="Add sub-task" aria-label="Add sub-task" />
              <button type="button" data-action="checklist-item-add">Add</button>
            </div>
          </div>
          ` : ""}
        </div>
      `
      : "";

    return `
      <div class="${cardClass} ${taskCompleted ? "is-complete" : ""}" data-date="${dateKey}" data-slot="${slot}" data-task-id="${taskId}" data-task-type="${taskType}">
        <div class="slot-task-layout">
          <span class="slot-task-handle" data-action="weekly-drag-handle" draggable="true" title="Drag to move" aria-label="Drag to move">⋮⋮</span>
          <div class="slot-task-main">
            <div class="slot-task-header">
              <div class="slot-task-title">${title}</div>
              <div class="slot-task-header-actions">
                ${resourceLinksButton}
                ${reminderButton}
                ${weekPickerMenu}
                <input type="checkbox" class="slot-task-complete" data-action="task-complete-toggle" aria-label="Mark task complete" ${taskCompleted ? "checked" : ""} />
                <button type="button" class="slot-task-remove" data-action="remove" aria-label="Remove task" title="Remove task">X</button>
              </div>
            </div>
            ${reminderConfirmation}
            ${checklistHtml}
          </div>
        </div>
      </div>
    `;
  }

  function renderTaskPool() {
    const renderPoolCards = (tasks, startIndex) => tasks
      .map((task, index) => {
        const orderValue = task.order == null || String(task.order).trim() === "" ? "-" : String(task.order);

        return `
          <article class="pool-task-card" data-curated-index="${index}" data-curated-global-index="${startIndex + index}" data-task-id="${task.taskId}">
            <div class="pool-task-layout">
              <span class="pool-card-drag-handle" data-action="curated-drag-handle" draggable="true" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span>
              <div class="pool-task-main">
                <div class="pool-task-head">
                  <div class="pool-task-title">${task.title}</div>
                  <div class="pool-task-head-actions">
                    <button type="button" class="pool-icon-btn curated-only" data-action="remove-curated" title="Remove from Projects" aria-label="Remove from Projects">🗂️</button>
                    <button type="button" class="pool-icon-btn danger" data-action="remove-planner" title="Remove from Planner" aria-label="Remove from Planner">🗑️</button>
                  </div>
                  <span class="pool-order-pill">Order: ${orderValue}</span>
                </div>
                <div class="pool-task-meta">ID: ${task.projectId || "-"} | Source: ${task.source}</div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    if (!state.curatedTasks.length) {
      elements.taskPoolLeft.innerHTML = '<div class="pool-empty">No curated tasks found. Add tasks in Task Manager first.</div>';
      elements.taskPoolMiddle.innerHTML = "";
      return;
    }

    const assignmentMap = buildAssignmentMap();
    const leftTasks = [];
    const middleTasks = [];

    state.curatedTasks.forEach((task, index) => {
      if (index % 2 === 0) {
        leftTasks.push(task);
      } else {
        middleTasks.push(task);
      }
    });

    const renderColumnCards = (tasks) => tasks
      .map((task) => {
        const globalIndex = state.curatedTasks.findIndex((item) => cleanText(item.taskId, "") === cleanText(task.taskId, ""));
        return renderPoolCards([task], globalIndex).trim();
      })
      .join("");

    elements.taskPoolLeft.innerHTML = renderColumnCards(leftTasks);
    elements.taskPoolMiddle.innerHTML = renderColumnCards(middleTasks);

    const cards = [
      ...elements.taskPoolLeft.querySelectorAll(".pool-task-card"),
      ...elements.taskPoolMiddle.querySelectorAll(".pool-task-card"),
    ];

    cards.forEach((card) => {
      const taskId = card.getAttribute("data-task-id");
      const assignment = assignmentMap.get(taskId);
      const daySelect = card.querySelector("select[data-role='day']");
      const slotSelect = card.querySelector("select[data-role='slot']");
      if (daySelect) {
        daySelect.value = assignment ? assignment.day : "";
      }
      if (slotSelect) {
        slotSelect.value = assignment ? assignment.slot : "";
      }
    });
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
    renderTaskPool();
    return true;
  }

  function renderWeekGrid() {
    const weekDates = getVisibleWeekDateRange(state.planner.weekStartDate);
    if (elements.weekRangeLabel) {
      const first = weekDates[0] ? formatDateLabel(weekDates[0].date) : "";
      const last = weekDates[6] ? formatDateLabel(weekDates[6].date) : "";
      const year = weekDates[0] ? parseDateKey(weekDates[0].date)?.getFullYear() : "";
      elements.weekRangeLabel.textContent = first && last ? `${first} - ${last}${year ? ` (${year})` : ""}` : "";
    }

    elements.weekScrollContainer.scrollLeft = 0;

    elements.weekGrid.innerHTML = weekDates
      .map((day) => {
        const dayHeading = formatWeekDayLabel(day.date);
        const weather = getWeatherForDate(day.date);
        const weatherSummary = cleanText(weather.condition, "Unavailable");
        const isToday = cleanText(day.date, "") === toDateKey(new Date());
        const slotHtml = SLOT_ORDER
          .map((slot) => {
            const tasks = state.planner.tasks.filter((item) => !item.deletedInstance && cleanText(item.date, "") === day.date && cleanText(item.timeSlot, "") === slot);
            const taskHtml = tasks.length
              ? tasks
                  .map((task) => renderWeeklyTaskCard(task, day.date, slot, getTaskProject(task)))
                  .join("")
              : '<div class="slot-empty">No tasks assigned</div>';
            const slotLabel = `${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;

            return `
              <section class="day-slot" data-day="${day.key}" data-date="${day.date}" data-slot="${slot}">
                <h4 class="day-slot-label">${slotLabel}</h4>
                <div class="slot-task-list">${taskHtml}</div>
              </section>
            `;
          })
          .join("");

        return `
          <article class="weekly-day-column" data-day="${day.key}" data-date="${day.date}">
            <h3 class="weekly-day-label${isToday ? " is-today" : ""}">
              <span class="weekly-day-label-text">${dayHeading}</span>
              <button
                type="button"
                class="weekly-weather-icon"
                data-action="weather-open"
                data-date="${day.date}"
                title="${escapeHtml(weatherSummary)}"
                aria-label="Open weather for ${dayHeading}: ${escapeHtml(weatherSummary)}"
              >${weather.icon}</button>
            </h3>
            ${slotHtml}
          </article>
        `;
      })
      .join("");

    renderMiniCalendar();
    refreshWeekWeather(weekDates);
  }

  function renderMiniCalendar() {
    const selectedDate = cleanText(state.selectedCalendarDate, state.planner && state.planner.weekStartDate);
    const monthDate = cleanText(state.calendarMonthDate, toMonthStartDateKey(selectedDate || (state.planner && state.planner.weekStartDate)));
    if (!monthDate) {
      elements.miniCalendar.innerHTML = "";
      return;
    }

    const visibleWeekDates = new Set(getVisibleWeekDateRange(state.planner.weekStartDate).map((item) => item.date));
    const firstOfMonth = parseDateKey(monthDate);
    if (!firstOfMonth) {
      elements.miniCalendar.innerHTML = "";
      return;
    }

    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth.getTime());
    gridStart.setDate(firstOfMonth.getDate() - startOffset);
    const monthKey = `${firstOfMonth.getFullYear()}-${firstOfMonth.getMonth()}`;
    const todayKey = toDateKey(new Date());

    const weekdayHeader = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
      .map((label) => `<div class="mini-calendar-weekday">${label}</div>`)
      .join("");

    const dayCells = Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(gridStart.getTime());
      cellDate.setDate(gridStart.getDate() + index);
      const cellDateKey = toDateKey(cellDate);
      const cellMonthKey = `${cellDate.getFullYear()}-${cellDate.getMonth()}`;
      const classNames = ["mini-calendar-day"];

      if (cellMonthKey !== monthKey) {
        classNames.push("is-outside-month");
      }
      if (visibleWeekDates.has(cellDateKey)) {
        classNames.push("is-in-visible-week");
      }
      if (cellDateKey === todayKey) {
        classNames.push("is-today");
      }
      if (cellDateKey === selectedDate) {
        classNames.push("is-selected");
      }

      return `
        <button type="button" class="${classNames.join(" ")}" data-action="mini-calendar-date" data-date="${cellDateKey}" aria-label="Jump to week of ${cellDate.toDateString()}">
          ${cellDate.getDate()}
        </button>
      `;
    }).join("");

    elements.miniCalendar.innerHTML = `
      <div class="mini-calendar-shell">
        <div class="mini-calendar-nav">
          <button type="button" data-action="mini-calendar-prev-month" aria-label="Previous month">◀</button>
          <div class="mini-calendar-month-label">${formatMonthYearLabel(monthDate)}</div>
          <button type="button" data-action="mini-calendar-next-month" aria-label="Next month">▶</button>
        </div>
        <div class="mini-calendar-weekdays">${weekdayHeader}</div>
        <div class="mini-calendar-grid">${dayCells}</div>
      </div>
    `;
  }

  function consumeStagedQueue() {
    let staged;
    let changed = false;
    try {
      staged = JSON.parse(localStorage.getItem(STORAGE_KEYS.staged) || "[]");
    } catch (error) {
      staged = [];
    }

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
        const repeatableIndex = state.repeatableTasks.findIndex((item) => cleanText(item.projectId, "") === normalizedProjectId || cleanText(item.id, "") === normalizedProjectId || cleanText(item.taskId, "") === normalizedTaskId);
        const repeatableRecord = {
          id: normalizedProjectId,
          taskId: normalizedTaskId.startsWith("repeatable-") ? normalizedTaskId : `repeatable-${normalizedProjectId}`,
          projectId: normalizedProjectId,
          title: cleanText(entry.title, "Untitled Repeatable Task"),
          source: "repeating",
          state: cleanText(entry.state, "unknown"),
          recurrence: normalizeRecurrence(cleanText(entry.recurrence, "")),
          baseDay: cleanText(entry.baseDay, ""),
          monthWeek: normalizeMonthWeek(cleanText(entry.monthWeek, ""), cleanText(entry.startDate || entry.originalStartDate, "")),
          active: true,
          priority: parseNumber(entry.priority, 3),
          order: parseNumber(entry.order, state.repeatableTasks.length + 1),
          category: cleanText(entry.category, "uncategorized"),
          asset: cleanText(entry.asset, ""),
          mileage: cleanText(entry.mileage, ""),
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
          title: repeatableRecord.title,
          state: repeatableRecord.state,
          category: repeatableRecord.category,
          recurrence: repeatableRecord.recurrence,
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

        saveRepeatableOverrides(Array.from(state.repeatableOverrideMap.values()));

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

    localStorage.removeItem(STORAGE_KEYS.staged);

    if (changed) {
      saveCuratedTasks();
      hideCuratedWarning();
      renderRepeatablePanel();
      renderTaskPool();
      renderWeekGrid();
      elements.status.textContent = "Staged tasks were added to the planner queue. Review the list and schedule them as needed.";
    }
  }

  function attachEvents() {
    elements.adhocAddBtn.addEventListener("click", () => {
      addAdHocTask(elements.adhocTitle.value, elements.adhocDay.value, elements.adhocSlot.value);
    }, { signal: controller.signal });

    elements.repeatablePanel.addEventListener("click", (event) => {
      const removeButton = event.target.closest("button[data-action='remove-repeatable-master']");
      if (!removeButton) {
        return;
      }

      const card = removeButton.closest(".repeatable-task-card");
      if (!card) {
        return;
      }

      removeRepeatableMaster(card.dataset.repeatableProjectId);
    }, { signal: controller.signal });

    elements.repeatablePanel.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-action='repeatable-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest(".repeatable-task-card");
      if (!card) {
        return;
      }

      const payload = {
        kind: "repeatable-copy",
        projectId: cleanText(card.dataset.repeatableProjectId, ""),
      };

      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    }, { signal: controller.signal });

    elements.repeatablePanel.addEventListener("dragend", () => {
      state.activeWeeklyDrag = null;
      elements.repeatablePanel.querySelectorAll(".repeatable-task-card.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    }, { signal: controller.signal });

    elements.miniCalendar.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) {
        return;
      }

      const action = cleanText(actionButton.dataset.action, "");
      if (action === "mini-calendar-prev-month") {
        state.calendarMonthDate = addMonthsToDateKey(state.calendarMonthDate, -1);
        renderMiniCalendar();
        return;
      }

      if (action === "mini-calendar-next-month") {
        state.calendarMonthDate = addMonthsToDateKey(state.calendarMonthDate, 1);
        renderMiniCalendar();
        return;
      }

      if (action === "mini-calendar-date") {
        jumpPlannerToDate(cleanText(actionButton.dataset.date, ""), cleanText(actionButton.dataset.date, ""));
      }
    }, { signal: controller.signal });

    const onTaskPoolClick = (event) => {
      const removeCuratedButton = event.target.closest("button[data-action='remove-curated']");
      if (removeCuratedButton) {
        const card = removeCuratedButton.closest(".pool-task-card");
        if (!card) {
          return;
        }

        removeTaskFromCurated(card.dataset.taskId);
        return;
      }

      const removeButton = event.target.closest("button[data-action='remove-planner']");
      if (!removeButton) {
        return;
      }

      const card = removeButton.closest(".pool-task-card");
      if (!card) {
        return;
      }

      removeTaskFromCurated(card.dataset.taskId);
      elements.status.textContent = "Project removed from the Planner container. Weekly schedule entries were preserved.";
    };

    elements.taskPoolLeft.addEventListener("click", onTaskPoolClick, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("click", onTaskPoolClick, { signal: controller.signal });

    const onTaskPoolChange = (event) => {
      const select = event.target.closest("select[data-role]");
      if (!select) {
        return;
      }

      const card = select.closest(".pool-task-card");
      if (!card) {
        return;
      }

      const taskId = card.dataset.taskId;
      const daySelect = card.querySelector("select[data-role='day']");
      const slotSelect = card.querySelector("select[data-role='slot']");
      const day = cleanText(daySelect && daySelect.value, "");
      const slot = cleanText(slotSelect && slotSelect.value, "");

      if (!day || !slot) {
        return;
      }

      assignTask(taskId, day, slot);
    };

    elements.taskPoolLeft.addEventListener("change", onTaskPoolChange, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("change", onTaskPoolChange, { signal: controller.signal });

    const clearCuratedDropTargets = () => {
      elements.curatedLeftColumn.classList.remove("drag-over");
      elements.curatedMiddleColumn.classList.remove("drag-over");
      [
        ...elements.taskPoolLeft.querySelectorAll(".pool-task-card.is-drop-target"),
        ...elements.taskPoolMiddle.querySelectorAll(".pool-task-card.is-drop-target"),
      ].forEach((card) => card.classList.remove("is-drop-target"));
    };

    const getCuratedColumnSide = (columnEl) => {
      if (columnEl === elements.curatedLeftColumn) {
        return "left";
      }
      if (columnEl === elements.curatedMiddleColumn) {
        return "middle";
      }
      return "";
    };

    const resolveCuratedColumn = (eventTarget, fallbackTarget) => {
      const fromEventTarget = eventTarget && eventTarget.closest
        ? eventTarget.closest("#curated-left, #curated-middle")
        : null;
      if (fromEventTarget) {
        return fromEventTarget;
      }

      const fromCurrentTarget = fallbackTarget && fallbackTarget.closest
        ? fallbackTarget.closest("#curated-left, #curated-middle")
        : null;
      return fromCurrentTarget || null;
    };

    const getCuratedDropPlacement = (columnEl, clientY) => {
      const cards = Array.from(columnEl.querySelectorAll(".pool-task-card"));
      const cardWithoutDragged = cards.filter((card) => parseNumber(card.dataset.curatedGlobalIndex, -1) !== state.activeCuratedDragIndex);

      if (!cardWithoutDragged.length) {
        return {
          targetGlobalIndex: null,
          highlightTaskId: "",
        };
      }

      for (let i = 0; i < cardWithoutDragged.length; i += 1) {
        const card = cardWithoutDragged[i];
        const rect = card.getBoundingClientRect();
        const midpoint = rect.top + (rect.height / 2);
        if (clientY <= midpoint) {
          const globalIndex = parseNumber(card.dataset.curatedGlobalIndex, null);
          return {
            targetGlobalIndex: globalIndex,
            highlightTaskId: cleanText(card.dataset.taskId, ""),
          };
        }
      }

      const lastCard = cardWithoutDragged[cardWithoutDragged.length - 1];
      const lastGlobalIndex = parseNumber(lastCard.dataset.curatedGlobalIndex, null);
      return {
        targetGlobalIndex: lastGlobalIndex == null ? null : (lastGlobalIndex + 1),
        highlightTaskId: cleanText(lastCard.dataset.taskId, ""),
      };
    };

    const reorderCuratedTasksByPlacement = (fromIndex, targetGlobalIndex, side) => {
      if (fromIndex < 0) {
        return false;
      }

      const next = [...state.curatedTasks];
      const [moved] = next.splice(fromIndex, 1);

      let insertIndex;
      if (targetGlobalIndex == null) {
        insertIndex = side === "left" ? 0 : Math.min(4, next.length);
      } else {
        insertIndex = targetGlobalIndex;
        if (targetGlobalIndex > fromIndex) {
          insertIndex -= 1;
        }
      }

      insertIndex = Math.max(0, Math.min(insertIndex, next.length));
      next.splice(insertIndex, 0, moved);
      state.curatedTasks = next;
      saveCuratedTasks();
      renderTaskPool();
      return true;
    };

    const onCuratedDragStart = (event) => {
      const handle = event.target.closest("[data-action='curated-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest(".pool-task-card");
      if (!card) {
        return;
      }

      const payload = {
        kind: "curated-reorder",
        taskId: cleanText(card.dataset.taskId, ""),
        index: parseNumber(card.dataset.curatedGlobalIndex, -1),
      };

      state.activeCuratedDragTaskId = payload.taskId;
      state.activeCuratedDragIndex = payload.index;
      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      card.classList.add("is-dragging");
      event.stopPropagation();
    };

    const onCuratedDragEnd = (event) => {
      const handle = event.target.closest("[data-action='curated-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest(".pool-task-card");
      if (card) {
        card.classList.remove("is-dragging");
      }
      state.activeCuratedDragTaskId = "";
      state.activeCuratedDragIndex = -1;
      state.activeWeeklyDrag = null;
      clearCuratedDropTargets();
    };

    const onCuratedDragOver = (event) => {
      if (!cleanText(state.activeCuratedDragTaskId, "")) {
        return;
      }

      const columnEl = resolveCuratedColumn(event.target, event.currentTarget);
      if (!columnEl) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      elements.curatedLeftColumn.classList.toggle("drag-over", columnEl === elements.curatedLeftColumn);
      elements.curatedMiddleColumn.classList.toggle("drag-over", columnEl === elements.curatedMiddleColumn);

      const placement = getCuratedDropPlacement(columnEl, event.clientY);
      clearCuratedDropTargets();
      elements.curatedLeftColumn.classList.toggle("drag-over", columnEl === elements.curatedLeftColumn);
      elements.curatedMiddleColumn.classList.toggle("drag-over", columnEl === elements.curatedMiddleColumn);

      const highlightTaskId = placement.highlightTaskId;
      const card = highlightTaskId
        ? columnEl.querySelector(`.pool-task-card[data-task-id="${highlightTaskId}"]`)
        : null;

      if (card) {
        card.classList.add("is-drop-target");
      }
    };

    const onCuratedDragLeave = (event) => {
      const columnEl = resolveCuratedColumn(event.target, event.currentTarget);
      if (!columnEl) {
        return;
      }

      if (event.relatedTarget && columnEl.contains(event.relatedTarget)) {
        return;
      }

      columnEl.classList.remove("drag-over");
      clearCuratedDropTargets();
    };

    const onCuratedDrop = (event) => {
      const fromTaskId = cleanText(state.activeCuratedDragTaskId, "");
      if (!fromTaskId) {
        return;
      }

      const columnEl = resolveCuratedColumn(event.target, event.currentTarget);
      const side = getCuratedColumnSide(columnEl);
      if (!columnEl || !side) {
        return;
      }

      event.preventDefault();

      let transferPayload = null;
      try {
        transferPayload = JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch (error) {
        transferPayload = null;
      }

      const draggedTaskId = cleanText(transferPayload && transferPayload.taskId, fromTaskId);
      const draggedIndexFromPayload = parseNumber(transferPayload && transferPayload.index, state.activeCuratedDragIndex);
      const resolvedFromIndex = Number.isInteger(draggedIndexFromPayload)
        && draggedIndexFromPayload >= 0
        && draggedIndexFromPayload < state.curatedTasks.length
        ? draggedIndexFromPayload
        : state.curatedTasks.findIndex((task) => cleanText(task.taskId, "") === draggedTaskId);
      const placement = getCuratedDropPlacement(columnEl, event.clientY);

      reorderCuratedTasksByPlacement(resolvedFromIndex, placement.targetGlobalIndex, side);
      clearCuratedDropTargets();
      state.activeCuratedDragTaskId = "";
      state.activeCuratedDragIndex = -1;
    };

    elements.curatedLeftColumn.addEventListener("dragstart", onCuratedDragStart, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragstart", onCuratedDragStart, { signal: controller.signal });
    elements.curatedLeftColumn.addEventListener("dragend", onCuratedDragEnd, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragend", onCuratedDragEnd, { signal: controller.signal });

    elements.curatedLeftColumn.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.curatedLeftColumn.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.curatedLeftColumn.addEventListener("drop", onCuratedDrop, { signal: controller.signal });
    elements.curatedMiddleColumn.addEventListener("drop", onCuratedDrop, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragover", onCuratedDragOver, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("dragleave", onCuratedDragLeave, { signal: controller.signal });
    elements.taskPoolLeft.addEventListener("drop", onCuratedDrop, { signal: controller.signal });
    elements.taskPoolMiddle.addEventListener("drop", onCuratedDrop, { signal: controller.signal });

    elements.weekPrev.addEventListener("click", () => {
      shiftPlannerWeek(-7);
    }, { signal: controller.signal });

    elements.weekToday.addEventListener("click", () => {
      goToCurrentWeek();
    }, { signal: controller.signal });

    elements.weekNext.addEventListener("click", () => {
      shiftPlannerWeek(7);
    }, { signal: controller.signal });

    elements.weekScrollContainer.addEventListener("wheel", (event) => {
      const dominantDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? event.deltaX
        : (event.shiftKey ? event.deltaY : 0);
      if (Math.abs(dominantDelta) < 16 || state.weekScrollLocked) {
        return;
      }

      event.preventDefault();
      state.weekScrollLocked = true;
      shiftPlannerWeek(dominantDelta > 0 ? 7 : -7);
      window.setTimeout(() => {
        state.weekScrollLocked = false;
      }, 220);
    }, { passive: false, signal: controller.signal });

    elements.weatherModal.addEventListener("click", (event) => {
      const closeButton = event.target.closest("button[data-action='weather-close'], button[data-action='links-close']");
      if (closeButton || event.target === elements.weatherModal) {
        closeWeatherModal();
      }
    }, { signal: controller.signal });

    elements.reminderModal.addEventListener("click", (event) => {
      if (event.target === elements.reminderModal) {
        closeReminderModal();
      }
    }, { signal: controller.signal });

    elements.seriesModal.addEventListener("click", (event) => {
      if (event.target === elements.seriesModal) {
        closeSeriesEditModal();
      }
    }, { signal: controller.signal });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.weatherModal.hidden) {
        closeWeatherModal();
      }
      if (event.key === "Escape" && !elements.reminderModal.hidden) {
        closeReminderModal();
      }
      if (event.key === "Escape" && !elements.seriesModal.hidden) {
        closeSeriesEditModal();
      }
    }, { signal: controller.signal });

    document.addEventListener("click", (event) => {
      closeWeekMenus(event.target.closest(".slot-task-week-picker"));
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("click", (event) => {
      const weatherButton = event.target.closest("button[data-action='weather-open']");
      if (weatherButton) {
        openWeatherModal(cleanText(weatherButton.dataset.date, ""));
        return;
      }

      const slotTask = event.target.closest(".slot-task[data-date][data-slot][data-task-id]");
      const actionButton = event.target.closest("button[data-action]");

      if (slotTask && actionButton) {
        const taskId = cleanText(slotTask.dataset.taskId, "");
        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");
        const day = cleanText(daySlot && daySlot.dataset.day, "");
        const slot = cleanText(slotTask.dataset.slot, "");
        const checklistId = cleanText(actionButton.dataset.checklistId, "");
        const action = cleanText(actionButton.dataset.action, "");

        if (action === "reminder-open") {
          closeWeekMenus();
          const match = findWeeklyTaskById(taskId);
          if (match) {
            openReminderModal(match.item);
          }
          return;
        }

        if (action === "series-edit") {
          closeWeekMenus();
          const match = findWeeklyTaskById(taskId);
          const master = match && (findRepeatableMaster(match.item.parentRepeatableId) || {
            id: cleanText(match.item.parentRepeatableId, ""),
            projectId: cleanText(match.item.projectId, ""),
            title: cleanText(match.item.title, "Untitled Task"),
            recurrence: cleanText(match.item.recurrence, "weekly"),
            baseDay: getDayName(cleanText(match.item.occurrenceDate, match.item.date)),
            baseBucket: cleanText(match.item.timeSlot, "morning").replace(/^./, (character) => character.toUpperCase()),
            startDate: cleanText(match.item.occurrenceDate, match.item.date),
            originalStartDate: cleanText(match.item.occurrenceDate, match.item.date),
            active: true,
          });
          if (match && master) {
            openSeriesEditModal(master, match.item);
          } else {
            elements.status.textContent = "Unable to locate that recurrence series.";
          }
          return;
        }

        if (action === "task-week-picker") {
          const picker = actionButton.closest(".slot-task-week-picker");
          const menu = picker && picker.querySelector("[data-role='task-week-menu']");
          if (!picker || !menu) {
            return;
          }

          const nextOpen = !picker.classList.contains("is-open");
          closeWeekMenus(nextOpen ? picker : null);
          picker.classList.toggle("is-open", nextOpen);
          menu.hidden = !nextOpen;
          return;
        }

        if (action === "task-week-shift") {
          closeWeekMenus();
          shiftTaskWeek(taskId, parseNumber(actionButton.dataset.weekOffset, 0));
          return;
        }

        if (action === "open-resource-links") {
          closeWeekMenus();
          const projectId = cleanText(actionButton.dataset.projectId, "");
          const taskIdForLinks = cleanText(actionButton.dataset.taskId, "") || taskId;
          const project = getProjectById(projectId)
            || getProjectFromTaskId(taskIdForLinks, cleanText(slotTask.querySelector(".slot-task-title") && slotTask.querySelector(".slot-task-title").textContent, ""), cleanText(slotTask.dataset.taskType, ""));
          if (project) {
            openResourceLinksModal(project);
          } else {
            elements.status.textContent = "Unable to locate project resource links.";
          }
          return;
        }

        if (action === "remove") {
          closeWeekMenus();
          removeTask(taskId);
          return;
        }

        if (action === "checklist-toggle") {
          toggleChecklistOpen(taskId, day, slot);
          return;
        }

        if (action === "checklist-item-remove") {
          removeChecklistItem(taskId, day, slot, checklistId);
          return;
        }

        if (action === "checklist-item-add") {
          const input = slotTask.querySelector("input[data-action='checklist-add-input']");
          if (!input) {
            return;
          }

          const added = addChecklistItem(taskId, day, slot, input.value);
          if (added) {
            input.value = "";
          }
          return;
        }
      }
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("change", (event) => {
      const taskCompleteCheckbox = event.target.closest("input[data-action='task-complete-toggle']");
      if (taskCompleteCheckbox) {
        const slotTask = taskCompleteCheckbox.closest(".slot-task[data-date][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

        setTaskCompleted(
          cleanText(slotTask.dataset.taskId, ""),
          cleanText(daySlot && daySlot.dataset.day, ""),
          cleanText(slotTask.dataset.slot, ""),
          taskCompleteCheckbox.checked
        );
        return;
      }

      const checkbox = event.target.closest("input[data-action='checklist-item-toggle']");
      if (!checkbox) {
        return;
      }

      const slotTask = checkbox.closest(".slot-task[data-date][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

      toggleChecklistItem(
        cleanText(slotTask.dataset.taskId, ""),
        cleanText(daySlot && daySlot.dataset.day, ""),
        cleanText(slotTask.dataset.slot, ""),
        cleanText(checkbox.dataset.checklistId, ""),
        checkbox.checked
      );
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("keydown", (event) => {
      const input = event.target.closest("input[data-action='checklist-add-input']");
      if (!input || event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      const slotTask = input.closest(".slot-task[data-date][data-slot][data-task-id]");
      if (!slotTask) {
        return;
      }

      const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

      addChecklistItem(
        cleanText(slotTask.dataset.taskId, ""),
        cleanText(daySlot && daySlot.dataset.day, ""),
        cleanText(slotTask.dataset.slot, ""),
        input.value
      );
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const slotTask = handle.closest(".slot-task[data-date][data-slot][data-task-id]");
      const checklistItem = handle.closest(".slot-checklist-item[data-checklist-id]");
      if (!slotTask || !checklistItem) {
        return;
      }

      const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

      const payload = {
        kind: "checklist-reorder",
        taskId: cleanText(slotTask.dataset.taskId, ""),
        day: cleanText(daySlot && daySlot.dataset.day, ""),
        slot: cleanText(slotTask.dataset.slot, ""),
        checklistId: cleanText(checklistItem.dataset.checklistId, ""),
      };

      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      checklistItem.classList.add("is-dragging");
      event.stopPropagation();
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragstart", (event) => {
      const checklistHandle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (checklistHandle) {
        return;
      }

      const handle = event.target.closest("[data-action='weekly-drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const taskCard = handle.closest(".slot-task[data-date][data-slot][data-task-id]");
      if (!taskCard) {
        return;
      }

      const daySlot = taskCard.closest(".day-slot[data-day][data-date][data-slot]");
      const match = findWeeklyTaskById(cleanText(taskCard.dataset.taskId, ""));

      const payload = {
        kind: "weekly-move",
        taskId: cleanText(taskCard.dataset.taskId, ""),
        day: cleanText(daySlot && daySlot.dataset.day, ""),
        date: cleanText(taskCard.dataset.date, ""),
        slot: cleanText(taskCard.dataset.slot, ""),
        weeklyTask: match ? {
          ...match.item,
          checklist: Array.isArray(match.item.checklist) ? match.item.checklist.map((entry) => ({ ...entry })) : [],
          reminder: match.item.reminder && typeof match.item.reminder === "object" ? { ...match.item.reminder } : {},
          metadata: match.item.metadata && typeof match.item.metadata === "object" ? { ...match.item.metadata } : {},
        } : null,
      };

      state.activeWeeklyDrag = payload;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragend", (event) => {
      const checklistHandle = event.target.closest("[data-action='checklist-drag-handle'][draggable='true']");
      if (checklistHandle) {
        state.activeWeeklyDrag = null;
        elements.weekGrid.querySelectorAll(".slot-checklist-item.is-dragging, .slot-checklist-item.is-drop-target").forEach((itemEl) => {
          itemEl.classList.remove("is-dragging", "is-drop-target");
        });
        return;
      }

      state.activeWeeklyDrag = null;
      elements.weekGrid.querySelectorAll(".day-slot.is-drop-target").forEach((slotEl) => {
        slotEl.classList.remove("is-drop-target");
      });
      elements.weekGrid.querySelectorAll(".slot-task.is-dragging").forEach((card) => {
        card.classList.remove("is-dragging");
      });
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragover", (event) => {
      const checklistTarget = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (checklistTarget && state.activeWeeklyDrag && state.activeWeeklyDrag.kind === "checklist-reorder") {
        const slotTask = checklistTarget.closest(".slot-task[data-date][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

        const sameTask = cleanText(slotTask.dataset.taskId, "") === cleanText(state.activeWeeklyDrag.taskId, "")
          && cleanText(daySlot && daySlot.dataset.day, "") === cleanText(state.activeWeeklyDrag.day, "")
          && cleanText(slotTask.dataset.slot, "") === cleanText(state.activeWeeklyDrag.slot, "");

        if (!sameTask) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        checklistTarget.classList.add("is-drop-target");
        return;
      }

      const slotEl = event.target.closest(".day-slot[data-day][data-date][data-slot]");
      if (!slotEl || !state.activeWeeklyDrag) {
        return;
      }

      if (state.activeWeeklyDrag.kind === "checklist-reorder") {
        return;
      }

      if (state.activeWeeklyDrag.kind === "curated-reorder") {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        slotEl.classList.add("is-drop-target");
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = state.activeWeeklyDrag.kind === "repeatable-copy" || state.activeWeeklyDrag.kind === "parking-item" ? "copy" : "move";
      slotEl.classList.add("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("dragleave", (event) => {
      const checklistTarget = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (checklistTarget) {
        if (event.relatedTarget && checklistTarget.contains(event.relatedTarget)) {
          return;
        }

        checklistTarget.classList.remove("is-drop-target");
        return;
      }

      const slotEl = event.target.closest(".day-slot[data-day][data-date][data-slot]");
      if (!slotEl) {
        return;
      }

      if (event.relatedTarget && slotEl.contains(event.relatedTarget)) {
        return;
      }

      slotEl.classList.remove("is-drop-target");
    }, { signal: controller.signal });

    elements.weekGrid.addEventListener("drop", (event) => {
      const checklistTarget = event.target.closest(".slot-checklist-item[data-checklist-id]");
      if (checklistTarget && state.activeWeeklyDrag && state.activeWeeklyDrag.kind === "checklist-reorder") {
        const slotTask = checklistTarget.closest(".slot-task[data-date][data-slot][data-task-id]");
        if (!slotTask) {
          return;
        }

        const daySlot = slotTask.closest(".day-slot[data-day][data-date][data-slot]");

        const sameTask = cleanText(slotTask.dataset.taskId, "") === cleanText(state.activeWeeklyDrag.taskId, "")
          && cleanText(daySlot && daySlot.dataset.day, "") === cleanText(state.activeWeeklyDrag.day, "")
          && cleanText(slotTask.dataset.slot, "") === cleanText(state.activeWeeklyDrag.slot, "");

        if (!sameTask) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const targetChecklistId = cleanText(checklistTarget.dataset.checklistId, "");
        reorderChecklistItem(state.activeWeeklyDrag.taskId, state.activeWeeklyDrag.day, state.activeWeeklyDrag.slot, state.activeWeeklyDrag.checklistId, targetChecklistId);
        state.activeWeeklyDrag = null;
        return;
      }

      const slotEl = event.target.closest(".day-slot[data-day][data-date][data-slot]");
      if (!slotEl || !state.activeWeeklyDrag) {
        return;
      }

      if (state.activeWeeklyDrag.kind === "checklist-reorder") {
        return;
      }

      event.preventDefault();
      slotEl.classList.remove("is-drop-target");

      const day = cleanText(slotEl.dataset.day, "");
      const date = cleanText(slotEl.dataset.date, "");
      const slot = cleanText(slotEl.dataset.slot, "");
      const payload = state.activeWeeklyDrag;

      if (payload.kind === "curated-reorder") {
        assignTask(payload.taskId, day, slot);
        state.activeWeeklyDrag = null;
        return;
      }

      if (payload.kind === "repeatable-copy") {
        const masterTask = state.repeatableTasks.find((task) => cleanText(task.projectId, "") === cleanText(payload.projectId, ""));
        if (masterTask) {
          createWeeklyRepeatableCopy(masterTask, date, slot);
        }
        state.activeWeeklyDrag = null;
        return;
      }

      if (payload.kind === "parking-item") {
        const parkingItem = payload.item || null;
        if (parkingItem) {
          const convertedType = cleanText(parkingItem.convertedTo && parkingItem.convertedTo.type, "project");
          const weeklyTaskType = convertedType === "task-manager"
            ? "adhoc"
            : convertedType === "repeatable"
              ? "repeatable"
              : "project";
          const weeklySource = weeklyTaskType === "adhoc"
            ? "adhoc"
            : weeklyTaskType === "repeatable"
              ? "repeating"
              : "home";
          const convertedProjectId = cleanText(parkingItem.convertedTo && parkingItem.convertedTo.id, cleanText(parkingItem.id, ""));
          const task = toPlannerSlotItem({
            id: buildWeeklyTaskId(weeklyTaskType, convertedProjectId, date),
            taskId: buildWeeklyTaskId(weeklyTaskType, convertedProjectId, date),
            date,
            timeSlot: slot,
            taskType: weeklyTaskType,
            type: weeklyTaskType,
            title: cleanText(parkingItem.title, "Untitled Task"),
            source: weeklySource,
            recurrence: "",
            projectId: convertedProjectId,
            priority: 3,
            checklist: [],
            checklistOpen: false,
            completed: false,
            metadata: { parkingLotSourceId: cleanText(parkingItem.id, ""), parkingLotConvertedType: convertedType },
          });

          state.planner.tasks.push(task);
          savePlanner();
          renderTaskPool();
          renderWeekGrid();
          elements.status.textContent = `Placed parking item "${task.title}" on ${date} ${slot}.`;
        }
        state.activeWeeklyDrag = null;
        return;
      }

      if (payload.kind === "weekly-move") {
        moveTask(payload.taskId, cleanText(slotEl.dataset.date, ""), slot);
      }

      state.activeWeeklyDrag = null;
    }, { signal: controller.signal });

    const teardownIfRouteChanges = () => {
      if (window.location.hash.replace("#", "") !== "planner") {
        if (state.parkingLotController && typeof state.parkingLotController.destroy === "function") {
          state.parkingLotController.destroy();
          state.parkingLotController = null;
        }
        if (typeof state.parkingStorageUnsubscribe === "function") {
          state.parkingStorageUnsubscribe();
          state.parkingStorageUnsubscribe = null;
        }
        controller.abort();
        window.removeEventListener("hashchange", teardownIfRouteChanges);
      }
    };

    window.addEventListener("hashchange", teardownIfRouteChanges);
  }

  async function initialize() {
    await ensurePlannerStorageLoaded();
    elements.mode.textContent = window.PlannerStorage.getUseSheets() ? "Sheets mode" : "Local mode";
    state.curatedTasks = loadCuratedTasks();
    state.planner = await loadPlanner();
    state.selectedCalendarDate = state.planner.weekStartDate;
    state.calendarMonthDate = toMonthStartDateKey(state.selectedCalendarDate);
    await loadRepeatableTasks();
    await mountParkingLotPanel();
    if (window.PlannerStorage && typeof window.PlannerStorage.onChange === "function") {
      state.parkingStorageUnsubscribe = window.PlannerStorage.onChange((detail) => {
        if (!state.planner) {
          return;
        }

        if (detail && detail.type === "weekly-snapshot-saved") {
          return;
        }

        loadPlanner().then((planner) => {
          state.planner = planner;
          renderTaskPool();
          renderRepeatablePanel();
          renderWeekGrid();
        }).catch((error) => console.warn("Weekly Planner refresh failed", error));
      });
    }
    generateVisibleRecurringInstances();
    renderTaskPool();
    renderWeekGrid();
    consumeStagedQueue();
    elements.status.textContent = `Planning week of ${state.planner.weekStartDate}.`;
  }

  window.loadPlanner = loadPlanner;
  window.savePlanner = savePlanner;
  window.assignTask = assignTask;
  window.removeTask = removeTask;
  window.shiftPlannerWeek = shiftPlannerWeek;
  window.openReminderModal = openReminderModal;
  window.sendReminder = sendReminder;
  window.resetReminder = resetReminder;
  window.deleteReminder = deleteReminder;
  window.openSeriesEditModal = openSeriesEditModal;

  attachEvents();
  initialize().catch((error) => {
    console.error(error);
    elements.status.textContent = "Unable to load Planner.";
  });
}

window.initPlannerScreen = initPlannerScreen;
