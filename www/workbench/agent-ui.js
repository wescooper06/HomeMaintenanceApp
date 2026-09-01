(function (global) {
  "use strict";

  const BUILD_VERSION = "20260822-8";

  function ensureStylesheet() {
    if (document.querySelector('link[data-nlp-agent-style="true"]')) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/www/workbench/workbench.css?v=${BUILD_VERSION}`;
    link.dataset.nlpAgentStyle = "true";
    document.head.appendChild(link);
  }

  function ensureResponse() {
    const input = document.getElementById("agent-input");
    const response = document.getElementById("agent-response");
    if (!input || !response) {
      return null;
    }
    return { input, response };
  }

  function renderExamples(response) {
    response.innerHTML = '<div class="agent-response-text">Try: create a new project under the Home category called "Test Project"</div>';
  }

  function clean(value, fallback) {
    const text = value == null ? "" : String(value).trim();
    return text || fallback || "";
  }

  function capitalize(value) {
    const text = clean(value, "");
    if (!text) {
      return "";
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function extractQuotedTitle(text) {
    const quoted = String(text || "").match(/["“”']([^"“”']+)["“”']/);
    return quoted && quoted[1] ? quoted[1].trim() : "";
  }

  function normalizeTitle(text) {
    const cleaned = clean(text, "");
    if (!cleaned) {
      return "";
    }

    return cleaned
      .replace(/^(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?project(?:\s+under\s+the\s+(?:home|vehicle|repeating))?(?:\s+category)?(?:\s+called\s+|\s+named\s+|\s+titled\s+|\s+as\s+)?/i, "")
      .replace(/^[\s:,-]+/, "")
      .replace(/^["“”']|["“”']$/g, "")
      .trim();
  }

  function parseCommand(command) {
    const text = clean(command, "");
    const lower = text.toLowerCase();
    if (!text) {
      return { intent: "unknown" };
    }

    if (lower === "help" || lower === "commands") {
      return { intent: "help" };
    }

    if (lower.includes("clear")) {
      return { intent: "clear" };
    }

    const createMatch = text.match(/(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?project(?:\s+under\s+the\s+(?<source>home|vehicle|repeating))?/i);
    if (createMatch) {
      const source = clean(createMatch.groups && createMatch.groups.source, "home").toLowerCase();
      let title = extractQuotedTitle(text) || normalizeTitle(text);
      if (!title) {
        title = "Test Project";
      }
      return {
        intent: "create-project",
        source,
        title,
        category: "Repair",
        state: "Not Started",
        order: "0",
      };
    }

    return { intent: "unknown" };
  }

  async function bootstrap() {
    const shell = ensureResponse();
    if (!shell || shell.input.dataset.nlpAgentMounted === "true") {
      return;
    }

    ensureStylesheet();
    if (!shell.response.textContent) {
      renderExamples(shell.response);
    }

    shell.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runCommand(shell.input.value, shell);
      }
    });

    shell.input.dataset.nlpAgentMounted = "true";
  }

  async function runCommand(command, shell) {
    const parsed = parseCommand(command);
    if (parsed.intent === "help") {
      renderExamples(shell.response);
      return;
    }

    if (parsed.intent === "clear") {
      shell.input.value = "";
      renderExamples(shell.response);
      return;
    }

    if (parsed.intent === "create-project") {
      if (!window.ProjectsService || typeof window.ProjectsService.createProject !== "function") {
        shell.response.innerHTML = '<div class="agent-response-text">Project service unavailable.</div>';
        return;
      }

      shell.response.innerHTML = '<div class="agent-response-text">Creating project...</div>';
      try {
        const result = await window.ProjectsService.createProject({
          source: parsed.source,
          title: parsed.title,
          category: parsed.category,
          state: parsed.state,
          order: parsed.order,
        });
        shell.response.innerHTML = `<div class="agent-response-text">Created project ${result.id} in ${result.tabName}.</div>`;
        shell.input.value = "";
        if (typeof window.loadAllProjects === "function" && window.PlannerStorage && typeof window.PlannerStorage.setCachedProjects === "function") {
          const refreshed = await window.loadAllProjects();
          window.PlannerStorage.setCachedProjects(refreshed);
        }
        if (typeof window.loadWorkbench === "function") {
          await window.loadWorkbench();
        }
      } catch (error) {
        const cached = window.PlannerStorage && typeof window.PlannerStorage.getCachedProjects === "function"
          ? window.PlannerStorage.getCachedProjects()
          : null;
        const projects = Array.isArray(cached) ? cached.slice() : [];
        const nextId = projects.reduce((max, project) => {
          const numeric = Number(String(project && project.id ? project.id : "").replace(/[^0-9]/g, ""));
          return Number.isFinite(numeric) && numeric > max ? numeric : max;
        }, 0) + 1;
        const localProject = {
          id: String(nextId),
          title: parsed.title,
          source: parsed.source,
          category: parsed.category,
          state: parsed.state,
          priority: "Medium",
          order: projects.length + 1,
          metadata: {
            sources: [parsed.source],
          },
        };
        projects.push(localProject);
        if (window.PlannerStorage && typeof window.PlannerStorage.setCachedProjects === "function") {
          window.PlannerStorage.setCachedProjects(projects);
        }
        shell.response.innerHTML = '<div class="agent-response-text">Created project locally. Sheets sync was unavailable.</div>';
        shell.input.value = "";
        if (typeof window.loadWorkbench === "function") {
          await window.loadWorkbench();
        }
      }
      return;
    }

    shell.response.innerHTML = '<div class="agent-response-text">I did not understand that command.</div>';
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

  global.WorkbenchAgentUI = { bootstrap };
})(window);
