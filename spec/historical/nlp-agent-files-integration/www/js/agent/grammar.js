(function (global) {
  "use strict";

  const Syn = global.NLPSynonyms;

  const COMMAND_PATTERNS = [
    {
      intent: "help",
      pattern: /^(?:help|commands|what can you do|show commands|examples)$/i,
    },
    {
      intent: "clear",
      pattern: /^(?:clear|reset|clear filters|reset filters|empty)$/i,
    },
    {
      intent: "navigate",
      pattern: /^(?:go to|open|show|visit|switch to|jump to)\s+(?<screen>.+)$/i,
    },
    {
      intent: "search",
      pattern: /^(?:search|find|filter|look up|locate)(?:\s+(?<target>projects?|tasks?|todos?|project list|task manager))?(?:\s+(?:for|with|named|containing)\s+)?(?<query>.+)$/i,
    },
    {
      intent: "sort",
      pattern: /^(?:sort|order|arrange)\s+(?<target>projects?|tasks?)(?:\s+(?:by\s+)?)?(?<field>priority|order|category|state|status|title|name)?(?:\s+(?<direction>ascending|descending|asc|desc|up|down))?$/i,
    },
    {
      intent: "add-project",
      pattern: /^(?:add|create|new|make)\s+(?:a\s+)?project$/i,
    },
    {
      intent: "add-task",
      pattern: /^(?:add|create|new|make)\s+(?:a\s+)?task$/i,
    },
  ];

  function canonicalScreen(value) {
    return Syn.canonicalFromAliases(value, Syn.SCREEN_ALIASES);
  }

  function canonicalTarget(value) {
    return Syn.canonicalFromAliases(value, Syn.PROJECT_TARGET_ALIASES);
  }

  function canonicalDirection(value) {
    return Syn.canonicalFromAliases(value, Syn.DIRECTION_ALIASES);
  }

  function canonicalSortField(value) {
    return Syn.canonicalFromAliases(value, Syn.SORT_FIELD_ALIASES);
  }

  global.NLPGrammar = {
    COMMAND_PATTERNS,
    canonicalScreen,
    canonicalTarget,
    canonicalDirection,
    canonicalSortField,
  };
})(window);
