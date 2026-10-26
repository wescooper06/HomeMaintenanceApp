(function (global) {
  "use strict";

  const SCREEN_ALIASES = {
    dashboard: ["dashboard", "home", "overview"],
    workbench: ["workbench", "operations", "operations view"],
    tasks: ["tasks", "task manager", "todo", "to do", "todos"],
    planner: ["planner", "weekly planner", "schedule"],
    projects: ["projects", "project list", "project manager"],
    calendar: ["calendar", "agenda"],
    settings: ["settings", "preferences"],
  };

  const INTENT_ALIASES = {
    navigate: ["go", "open", "show", "visit", "switch", "jump"],
    search: ["search", "find", "filter", "look up", "locate"],
    sort: ["sort", "order", "arrange"],
    add: ["add", "create", "new", "make"],
    help: ["help", "commands", "examples"],
    clear: ["clear", "reset", "empty"],
  };

  const DIRECTION_ALIASES = {
    ascending: ["ascending", "asc", "up", "low to high", "smallest first"],
    descending: ["descending", "desc", "down", "high to low", "largest first"],
  };

  const SORT_FIELD_ALIASES = {
    order: ["order", "position", "sequence"],
    priority: ["priority", "importance"],
    category: ["category", "type"],
    state: ["state", "status"],
    title: ["title", "name"],
  };

  const PROJECT_TARGET_ALIASES = {
    projects: ["project", "projects"],
    tasks: ["task", "tasks", "todo", "todos", "task manager"],
  };

  const STOP_WORDS = new Set(["the", "a", "an", "my", "please", "to", "for", "of", "on", "in", "at", "me"]);

  function normalizeSpacing(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeToken(value) {
    const token = normalizeSpacing(value);
    return token || "";
  }

  function normalizeText(value) {
    return normalizeSpacing(value)
      .split(" ")
      .filter((token) => token && !STOP_WORDS.has(token))
      .join(" ");
  }

  function canonicalFromAliases(value, aliasesByCanonical) {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }

    const entries = Object.entries(aliasesByCanonical);
    for (let index = 0; index < entries.length; index += 1) {
      const [canonical, aliases] = entries[index];
      for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
        const alias = normalizeText(aliases[aliasIndex]);
        if (text === alias || text.includes(` ${alias} `) || text.startsWith(`${alias} `) || text.endsWith(` ${alias}`) || text.includes(alias)) {
          return canonical;
        }
      }
    }

    return text;
  }

  function matchAny(value, aliases) {
    const text = normalizeText(value);
    return aliases.some((alias) => {
      const normalized = normalizeText(alias);
      return text === normalized || text.includes(` ${normalized} `) || text.startsWith(`${normalized} `) || text.endsWith(` ${normalized}`) || text.includes(normalized);
    });
  }

  global.NLPSynonyms = {
    SCREEN_ALIASES,
    INTENT_ALIASES,
    DIRECTION_ALIASES,
    SORT_FIELD_ALIASES,
    PROJECT_TARGET_ALIASES,
    STOP_WORDS,
    normalizeSpacing,
    normalizeToken,
    normalizeText,
    canonicalFromAliases,
    matchAny,
  };
})(window);
