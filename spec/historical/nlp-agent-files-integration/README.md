# Experimental NLP Workbench archive

**Historical, experimental, non-runtime reference only.**
This prototype was intentionally NOT merged into the modern application.
Do not serve, execute, import, or activate these files. Archival preservation
does not authorize restoring legacy routing, persistence or project operations.

## Provenance and fidelity

- Source branch: `agents/nlp-agent-files-integration`.
- Source worktree:
  `C:\Users\wcoop\Documents\HomeMaintenanceApp.worktrees\nlp-agent-files-integration`.
- Base commit: `739a89c` (full:
  `739a89c6f400917f9ac3b7e163f4a090f8ef25eb`).
- Archived against modern checkpoint `d681f1a` on 2026-10-25.
- The source branch has no unique committed history outside the existing
  main/dev/origin history. Its four modified and eight untracked files were
  uncommitted experimental work, not preserved by that branch's base commit.
- All twelve source files are copied byte-for-byte with their original relative
  paths. They deliberately retain experimental defects, legacy references and
  formatting; this is not a corrected implementation.
- [tracked-integration.patch](tracked-integration.patch) records all four tracked
  changes relative to the base using full-index/binary Git diff output.
  It does **not** include the eight untracked files; their full snapshots below
  are essential. Do not apply this patch to the modern application.

## Inventory

| Snapshot | Original state | Purpose |
| --- | --- | --- |
| [www/index.html](www/index.html) | Modified tracked | Legacy entry; asset-version changes |
| [www/js/router.js](www/js/router.js) | Modified tracked | Legacy screen loader; build-version change |
| [www/screens/workbench/workbench.html](www/screens/workbench/workbench.html) | Modified tracked | Original Workbench template plus command bar/loader references |
| [www/screens/workbench/workbench.js](www/screens/workbench/workbench.js) | Modified tracked | Original controller plus command-bar bootstrap |
| [www/js/agent/agent.js](www/js/agent/agent.js) | Untracked | Parse/plan/execute facade and in-memory history |
| [www/js/agent/grammar.js](www/js/agent/grammar.js) | Untracked | Regex command grammar |
| [www/js/agent/nlp.js](www/js/agent/nlp.js) | Untracked | Intent/slot/token extraction |
| [www/js/agent/planner.js](www/js/agent/planner.js) | Untracked | Command plans and legacy DOM execution |
| [www/js/agent/synonyms.js](www/js/agent/synonyms.js) | Untracked | Alias dictionaries and text normalization |
| [www/workbench/agent-ui.js](www/workbench/agent-ui.js) | Untracked | Command input, examples and response loader |
| [www/workbench/workbench.css](www/workbench/workbench.css) | Untracked | Command UI styles |
| [www/workbench/workbench.html](www/workbench/workbench.html) | Untracked | Alternate template with TEST BANNER |

The patch, this README and twelve snapshots constitute the archived evidence.
The archive-local `.gitattributes` disables text normalization for the snapshots
and patch so their original bytes survive Git staging and future checkouts.
It also exempts only those preserved snapshots and patch from Git whitespace
checks: original CRLF, spacing and patch context are historical evidence, not
modern source formatting. This README and all content outside those archive
paths retain the repository's ordinary whitespace checks.
Nothing in
this directory is a runtime entry, deployment asset or database recovery source.
The original source worktree was left unchanged during archival.

## Architecture and capabilities explored

`text -> synonyms/grammar -> parsed intent -> action plan -> legacy DOM interaction`

This is a deterministic regex/rule-based command prototype, not an AI model.
It explored:

- Navigation commands and screen aliases.
- Project search and sorting commands.
- Add Project navigation (clicking a button, not directly creating a project).
- Task navigation (not task creation).
- Help/examples and filter/reset commands.
- Parse/plan structures, slots, tokens and confidence values.
- Timestamped in-memory history and a programmatic clear-history method.
- Enter-to-submit, focus examples and response presentation.

The command planner is not a weekly scheduling engine. Ordinary Workbench
filtering, editing, Task Manager and Planner staging have modern equivalents;
the command facade does not exist in the current modern runtime.

## Known incomplete or incorrect behavior

- Task-search commands parse, but execution changes project search.
- Project sort direction parses, but is not applied.
- Title/name sorting maps to order rather than title.
- Task sorting toggles order direction and ignores the requested field.
- Some dictionary aliases (for example importance/high-to-low sort phrasing)
  are not accepted by the grammar.
- Add Task only navigates to the old Tasks screen.
- There are no delete-project, send-to-Planner or date-scheduling commands.
- Filter reset is not command-input or history clearing; history clearing is
  only exposed programmatically.
- UI response summaries do not check whether DOM execution actually succeeded.
- Permissive substring matching can misclassify text.
- Loader paths, DOM IDs and several navigation destinations assume the old
  application. The alternate template is not the inspected router's template,
  contains a TEST BANNER, and lacks the command input.
- The original controller loads Sheets/local-mode services and includes old
  identity conventions. Its Delete action is a legacy handoff, not the modern
  confirmed atomic Supabase deletion workflow.

## Boundary for any future implementation

Preserve concepts as requirements material, not as approved production behavior.
Any future command interface must use modern React state/navigation and service
APIs, Supabase-backed storage, explicit identities, current project lifecycle
and security policy, confirmation requirements, double-submit protection and
verified error reporting. It must not restore legacy DOM manipulation,
Sheets/localStorage persistence, loaders/navigation, or old project create/delete
paths. Porting or activating anything requires a separate owner-approved task.

The modern Workbench and its behavior are unchanged by this archive. Before
removing the original linked worktree, verify and commit this archive; Git does
not protect untracked source content merely because its branch exists.
