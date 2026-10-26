(function (global) {
  "use strict";

  function now() {
    return new Date().toISOString();
  }

  function createAgent() {
    const history = [];

    function parse(command) {
      return global.NLP.parseCommand(command);
    }

    function plan(commandOrParsed, context) {
      const parsed = typeof commandOrParsed === "string" ? parse(commandOrParsed) : commandOrParsed;
      return global.NLPPlanner.planCommand(parsed, context);
    }

    function execute(commandOrPlan, context) {
      const currentPlan = commandOrPlan && commandOrPlan.steps ? commandOrPlan : plan(commandOrPlan, context);
      return currentPlan.execute(context);
    }

    function process(command, context) {
      const parsed = parse(command);
      const currentPlan = plan(parsed, context);
      const result = execute(currentPlan, context);
      const entry = {
        at: now(),
        command,
        parsed,
        plan: {
          intent: currentPlan.intent,
          summary: currentPlan.summary,
          slots: currentPlan.slots,
          steps: currentPlan.steps,
        },
        result,
      };
      history.push(entry);
      return entry;
    }

    return {
      parse,
      plan,
      execute,
      process,
      clearHistory() {
        history.length = 0;
      },
      getHistory() {
        return history.slice();
      },
      describe() {
        return [
          "Navigate: go to tasks / open planner",
          "Search: search projects for leaky faucet",
          "Sort: sort projects by priority descending",
          "Create: add project",
          "Reset: clear filters",
        ];
      },
    };
  }

  global.NLPAgent = createAgent();
})(window);
