(function (global) {
  "use strict";

  const BUILD_VERSION = "20260822-2";
  const CORE_SCRIPTS = [
    "js/agent/synonyms.js",
    "js/agent/grammar.js",
    "js/agent/nlp.js",
    "js/agent/planner.js",
    "js/agent/agent.js",
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const selector = `script[data-nlp-agent-src="${src}"]`;
      if (document.querySelector(selector)) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = `${src}?v=${BUILD_VERSION}`;
      script.dataset.nlpAgentSrc = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  }

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

  function examples() {
    return global.NLPAgent && typeof global.NLPAgent.describe === "function"
      ? global.NLPAgent.describe()
      : ["search projects for leak", "sort projects by priority descending", "add project", "clear filters"];
  }

  function ensureResponseShell() {
    const input = document.getElementById("agent-input");
    const response = document.getElementById("agent-response");
    if (!input || !response) {
      return null;
    }

    return { input, response };
  }

  function writeResponse(response, text, kind) {
    response.innerHTML = `<p class="${kind === "error" ? "agent-response-error" : "agent-response-text"}">${text}</p>`;
  }

  function renderExamples(response) {
    const items = examples().map((text) => `<li>${text}</li>`).join("");
    response.innerHTML = `<ul class="agent-response-examples">${items}</ul>`;
  }

  function runCommand(command, shell) {
    const trimmed = String(command == null ? "" : command).trim();
    if (!trimmed) {
      writeResponse(shell.response, "Enter a command first.", "error");
      return;
    }

    const entry = global.NLPAgent.process(trimmed, { document: document, window: global });
    if (entry.plan.intent === "help") {
      renderExamples(shell.response);
      return;
    }

    if (entry.plan.intent === "unknown") {
      writeResponse(shell.response, "I did not understand that command.", "error");
      return;
    }

    writeResponse(shell.response, entry.plan.summary || "Command executed.");
  }

  async function bootstrap() {
    const shell = ensureResponseShell();
    if (!shell || shell.input.dataset.nlpAgentMounted === "true") {
      return;
    }

    ensureStylesheet();

    for (let index = 0; index < CORE_SCRIPTS.length; index += 1) {
      await loadScript(CORE_SCRIPTS[index]);
    }

    shell.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      runCommand(shell.input.value, shell);
    });

    shell.input.addEventListener("focus", () => {
      if (!shell.response.textContent) {
        renderExamples(shell.response);
      }
    });

    if (!shell.response.textContent) {
      renderExamples(shell.response);
    }

    shell.input.dataset.nlpAgentMounted = "true";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

  global.WorkbenchAgentUI = {
    bootstrap,
  };
})(window);
