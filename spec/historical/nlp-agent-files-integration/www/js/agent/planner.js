(function (global) {
  "use strict";

  const SCREEN_HASHES = {
    dashboard: "#dashboard",
    workbench: "#workbench",
    tasks: "#tasks",
    planner: "#planner",
    projects: "#projects",
    calendar: "#calendar",
    settings: "#settings",
  };

  const SORT_VALUES = {
    order: "order",
    priority: "priority",
    category: "category",
    state: "state",
    title: "order",
  };

  function getDocument(context) {
    return context && context.document ? context.document : document;
  }

  function getWindow(context) {
    return context && context.window ? context.window : window;
  }

  function setValue(element, value, eventName) {
    if (!element) {
      return false;
    }

    element.value = value;
    element.dispatchEvent(new Event(eventName || "input", { bubbles: true }));
    return true;
  }

  function click(element) {
    if (!element) {
      return false;
    }

    element.click();
    return true;
  }

  function resetWorkbenchFilters(doc) {
    const search = doc.getElementById("workbenchProjectSearch");
    if (search) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const containers = [
      doc.getElementById("workbenchProjectSource"),
      doc.getElementById("workbenchProjectCategory"),
      doc.getElementById("workbenchProjectState"),
    ];
    containers.forEach((container) => {
      if (!container) {
        return;
      }

      const boxes = container.querySelectorAll("input[type='checkbox']");
      boxes.forEach((box) => {
        if (!box.checked) {
          box.checked = true;
        }
      });
      container.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const sort = doc.getElementById("workbenchProjectSort");
    if (sort) {
      sort.value = "order";
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function buildPlan(parsed) {
    const plan = {
      raw: parsed.raw,
      normalized: parsed.normalized,
      intent: parsed.intent,
      confidence: parsed.confidence,
      slots: parsed.slots || {},
      steps: [],
      summary: "",
    };

    switch (parsed.intent) {
      case "navigate":
        plan.summary = "Navigate to a screen.";
        plan.steps.push({ type: "navigate", screen: parsed.slots.screen || "dashboard" });
        break;
      case "search":
        plan.summary = "Apply a project search.";
        plan.steps.push({ type: "search", target: parsed.slots.target || "projects", query: parsed.slots.query || "" });
        break;
      case "sort":
        plan.summary = "Change the active sort.";
        plan.steps.push({
          type: "sort",
          target: parsed.slots.target || "projects",
          field: parsed.slots.field || "order",
          direction: parsed.slots.direction || "ascending",
        });
        break;
      case "add-project":
        plan.summary = "Open the add project dialog.";
        plan.steps.push({ type: "click", selector: "#workbenchAddProject" });
        break;
      case "add-task":
        plan.summary = "Open the task workflow.";
        plan.steps.push({ type: "navigate", screen: "tasks" });
        break;
      case "clear":
        plan.summary = "Reset the workbench filters.";
        plan.steps.push({ type: "reset-filters" });
        break;
      case "help":
        plan.summary = "Show example commands.";
        plan.steps.push({ type: "help" });
        break;
      default:
        plan.summary = "I did not understand that command.";
        break;
    }

    return plan;
  }

  function executePlan(plan, context) {
    const doc = getDocument(context);
    const win = getWindow(context);
    const results = [];

    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      if (step.type === "navigate") {
        win.location.hash = SCREEN_HASHES[step.screen] || "#dashboard";
        results.push({ type: step.type, ok: true });
        continue;
      }

      if (step.type === "search") {
        const search = doc.getElementById("workbenchProjectSearch");
        results.push({ type: step.type, ok: setValue(search, step.query, "input") });
        continue;
      }

      if (step.type === "sort") {
        if (step.target === "tasks") {
          const sortButton = doc.getElementById("workbenchTaskSort");
          if (sortButton && step.direction === "descending" && !String(sortButton.textContent || "").includes("Descending")) {
            click(sortButton);
          } else if (sortButton && step.direction === "ascending" && !String(sortButton.textContent || "").includes("Ascending")) {
            click(sortButton);
          }
          results.push({ type: step.type, ok: Boolean(sortButton) });
          continue;
        }

        const sortSelect = doc.getElementById("workbenchProjectSort");
        const value = SORT_VALUES[step.field] || "order";
        results.push({ type: step.type, ok: setValue(sortSelect, value, "change") });
        continue;
      }

      if (step.type === "click") {
        results.push({ type: step.type, ok: click(doc.querySelector(step.selector)) });
        continue;
      }

      if (step.type === "reset-filters") {
        resetWorkbenchFilters(doc);
        results.push({ type: step.type, ok: true });
        continue;
      }

      if (step.type === "help") {
        results.push({ type: step.type, ok: true });
      }
    }

    return {
      ok: results.every((result) => result.ok !== false),
      results,
    };
  }

  function planCommand(parsed, context) {
    const plan = buildPlan(parsed, context);
    plan.execute = function execute(runtimeContext) {
      return executePlan(plan, runtimeContext || context);
    };
    return plan;
  }

  global.NLPPlanner = {
    buildPlan,
    executePlan,
    planCommand,
  };
})(window);
