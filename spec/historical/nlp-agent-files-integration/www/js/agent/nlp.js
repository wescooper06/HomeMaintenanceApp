(function (global) {
  "use strict";

  const Syn = global.NLPSynonyms;
  const Grammar = global.NLPGrammar;

  function pickMatch(pattern, input) {
    const match = pattern.exec(input);
    if (!match) {
      return null;
    }

    return {
      raw: match[0],
      groups: match.groups || {},
    };
  }

  function resolveDirection(value) {
    const direction = Grammar.canonicalDirection(value);
    if (direction === "ascending" || direction === "descending") {
      return direction;
    }
    return "";
  }

  function resolveSortField(value) {
    const field = Grammar.canonicalSortField(value);
    return field || "order";
  }

  function parseCommand(rawInput) {
    const raw = String(rawInput == null ? "" : rawInput).trim();
    const normalized = Syn.normalizeText(raw);

    if (!normalized) {
      return {
        raw,
        normalized,
        intent: "unknown",
        confidence: 0,
        slots: {},
        tokens: [],
      };
    }

    const lower = normalized.toLowerCase();
    if (Syn.matchAny(lower, ["help", "commands", "examples", "what can you do"])) {
      return { raw, normalized, intent: "help", confidence: 1, slots: {}, tokens: normalized.split(" ") };
    }
    if (Syn.matchAny(lower, ["clear", "reset", "clear filters", "reset filters", "empty"])) {
      return { raw, normalized, intent: "clear", confidence: 1, slots: {}, tokens: normalized.split(" ") };
    }

    for (let index = 0; index < Grammar.COMMAND_PATTERNS.length; index += 1) {
      const rule = Grammar.COMMAND_PATTERNS[index];
      const match = pickMatch(rule.pattern, raw);
      if (!match) {
        continue;
      }

      const slots = {};
      if (match.groups.screen) {
        slots.screen = Grammar.canonicalScreen(match.groups.screen);
      }
      if (match.groups.target) {
        slots.target = Grammar.canonicalTarget(match.groups.target);
      }
      if (match.groups.query) {
        slots.query = String(match.groups.query).trim();
      }
      if (match.groups.field) {
        slots.field = resolveSortField(match.groups.field);
      }
      if (match.groups.direction) {
        slots.direction = resolveDirection(match.groups.direction);
      }

      return {
        raw,
        normalized,
        intent: rule.intent,
        confidence: 1,
        slots,
        tokens: normalized.split(" "),
      };
    }

    if (normalized.startsWith("open ") || normalized.startsWith("show ")) {
      return {
        raw,
        normalized,
        intent: "navigate",
        confidence: 0.6,
        slots: { screen: Grammar.canonicalScreen(normalized.replace(/^(open|show)\s+/, "")) },
        tokens: normalized.split(" "),
      };
    }

    return {
      raw,
      normalized,
      intent: "unknown",
      confidence: 0.2,
      slots: {},
      tokens: normalized.split(" "),
    };
  }

  global.NLP = {
    parseCommand,
  };
})(window);
