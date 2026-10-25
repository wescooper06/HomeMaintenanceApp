import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import * as service from "../../services/workbenchService.js";

import ProjectEditor from "./ProjectEditor.jsx";
import styles from "./WorkbenchPage.module.css";

const EMPTY_OPTIONS = { source: [], category: [], projectState: [] };
const INITIAL_FILTERS = { search: "", source: [], category: [], projectState: [], projectSort: "order" };

function MultiSelect({ label, allLabel, options, selected, onChange }) {
  const summary = selected.length === options.length ? allLabel
    : selected.length <= 2 ? selected.join(", ") : `${selected.length} selected`;
  return (
    <div className={styles.filterField}>
      <span>{label}</span>
      <details className={styles.multiSelect}>
        <summary>{summary || allLabel}</summary>
        <div className={styles.multiSelectOptions} role="group" aria-label={`Filter projects by ${label.toLowerCase()}`}>
          {options.map((value) => (
            <label key={value}>
              <input type="checkbox" value={value} checked={selected.includes(value)} onChange={(event) =>
                onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))
              } />
              {value}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ projects: [], tasks: [] });
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const known = useRef(EMPTY_OPTIONS);
  const mounted = useRef(false);
  const operation = useRef(false);
  const [taskSort, setTaskSort] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Loading Workbench...");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);

  function applyData(next) {
    const nextOptions = service.getFilterOptions(next.projects);
    const previousKnown = known.current;
    setFilters((current) => service.reconcileFilters(current, previousKnown, nextOptions));
    known.current = Object.fromEntries(Object.keys(nextOptions).map((key) =>
      [key, [...new Set([...previousKnown[key], ...nextOptions[key]])]]
    ));
    setOptions(nextOptions);
    setData({ projects: next.projects, tasks: next.tasks });
    setStatus(next.mode);
  }

  useEffect(() => {
    let active = true;
    mounted.current = true;
    service.loadWorkbench().then((next) => {
      if (active) applyData(next);
    }).catch((loadError) => {
      console.error("Workbench loading failed", loadError);
      if (active) setError(loadError.message || "Unable to load Workbench.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  async function run(message, action) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setStatus(message);
    try {
      await action();
    } catch (actionError) {
      console.error("Workbench action failed", actionError);
      if (mounted.current) setError(actionError.message || "Unable to complete Workbench action.");
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function replaceTasks(saved) {
    setData((current) => ({
      ...current,
      tasks: [...current.tasks.filter((task) => !saved.some((item) => item.id === task.id)), ...saved],
    }));
  }

  async function projectAction(project, action) {
    if (action === "edit") {
      setError("");
      setModal({ project });
      return;
    }
    await run("Adding task...", async () => {
      const saved = await service.addProjectTask(project, data.tasks);
      if (mounted.current) {
        replaceTasks([saved]);
        setStatus(`Added "${project.title}" to Task Manager.`);
      }
    });
  }

  async function taskAction(task, action) {
    await run("Updating task...", async () => {
      if (action === "remove") {
        await service.removeTask(task);
        if (mounted.current) {
          setData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
          setStatus(`Removed "${task.title}" from Task Manager.`);
        }
      } else if (action === "send-weekly") {
        const result = await service.sendWeekly(task, data.tasks.length);
        if (mounted.current) {
          if (result.task) replaceTasks([result.task]);
          setStatus(result.message);
        }
      } else {
        const saved = await service.moveTask(task, data.tasks, action);
        if (mounted.current) {
          replaceTasks(saved);
          setStatus("Task order updated.");
        }
      }
    });
  }

  async function submitProject(values) {
    await run("Saving project...", async () => {
        const updated = await service.updateProject(modal.project, values);
        const projects = data.projects.map((project) => project === modal.project ? updated : project);
        service.cacheProjects(projects);
        if (mounted.current) {
          setData((current) => ({ ...current, projects }));
          setModal(null);
          setStatus(`Saved project ${updated.id}.`);
        }
    });
  }

  function changeFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const projects = service.filterProjects(data.projects, filters);
  const groups = service.groupTasks(data.tasks, taskSort);
  const disabled = loading || busy;

  return (
    <section className={styles.screen} aria-busy={disabled}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Operations view</p>
          <h1>Workbench</h1>
          <p className={styles.muted}>Review projects, curate tasks, and stage the next move.</p>
        </div>
        <div className={styles.status} role="status">{error ? "Workbench needs attention." : status}</div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className={styles.container}>
        <section className={styles.panel} aria-labelledby="workbench-projects-title">
          <div className={styles.panelHeader}>
            <div>
              <h2 id="workbench-projects-title">Projects</h2>
              <span className={styles.count}>{projects.length} of {data.projects.length}</span>
            </div>
            <button type="button" className={styles.primary} disabled={disabled}
              onClick={() => navigate("/projects/new")}>Add Project</button>
          </div>
          <div className={styles.filterBar}>
            <label>Search<input type="search" placeholder="Search projects" aria-label="Search projects" value={filters.search} onChange={(event) => changeFilter("search", event.target.value)} /></label>
            {[["source", "Source", "All sources"], ["category", "Category", "All categories"], ["projectState", "State", "All states"]].map(([key, label, allLabel]) => (
              <MultiSelect key={key} label={label} allLabel={allLabel} options={options[key]} selected={filters[key]} onChange={(value) => changeFilter(key, value)} />
            ))}
            <label>Sort By<select aria-label="Sort projects" value={filters.projectSort} onChange={(event) => changeFilter("projectSort", event.target.value)}>
              <option value="order">Order</option><option value="priority">Priority</option><option value="category">Category</option>
            </select></label>
          </div>
          <div className={styles.list} aria-live="polite">
            {loading ? Array.from({ length: 4 }, (_, index) => <div key={index} className={styles.skeleton} />) : projects.length ? projects.map((project, index) => {
              const metadata = project.metadata || {};
              const order = service.number(project.order ?? metadata.order, Number.MAX_SAFE_INTEGER);
              const vehicle = service.clean(project.vehicle, service.clean(metadata.vehicle, service.clean(metadata.asset)));
              return (
                <article className={styles.card} key={`${project.source}-${project.id}-${index}`}>
                  <div className={styles.cardTitle}>
                    <h3>{project.title || "Untitled Project"} <strong className={styles.projectId}>(ID: {project.id || "-"})</strong></h3>
                    {order !== Number.MAX_SAFE_INTEGER && <span className={styles.orderPill}>Order: {order}</span>}
                  </div>
                  <div className={styles.meta}>
                    <span>Source: {service.sourceTag(project.source)}</span>
                    {vehicle && <span>{vehicle}</span>}
                    <span>Category: {project.category || "-"}</span><span>State: {project.state || "-"}</span><span>Priority: {service.clean(project.priority, "-")}</span>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={styles.action} disabled={disabled} onClick={() => projectAction(project, "edit")}>Edit Details</button>
                    <button type="button" className={styles.action} disabled={disabled} onClick={() => projectAction(project, "add-task")}>Add to Task Manager</button>
                  </div>
                </article>
              );
            }) : <div className={styles.card}>No projects match.</div>}
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="workbench-tasks-title">
          <div className={styles.panelHeader}>
            <div>
              <h2 id="workbench-tasks-title">Task Manager</h2>
              <span className={styles.count}>{groups[0].tasks.length} project-based and {groups[1].tasks.length} repeatable tasks</span>
            </div>
            <button type="button" className={styles.quiet} onClick={() => setTaskSort((current) => current === "asc" ? "desc" : "asc")}>Order: {taskSort === "asc" ? "Ascending" : "Descending"}</button>
          </div>
          <div className={styles.list} aria-live="polite">
            {loading ? Array.from({ length: 3 }, (_, index) => <div key={index} className={styles.skeleton} />) : groups.map((group) => (
              <section key={group.title} className={styles.taskSection} aria-label={group.title}>
                <h3>{group.title}</h3>
                <div className={styles.list}>
                  {group.tasks.length ? group.tasks.map((task, index) => (
                    <article key={task.id} className={styles.card}>
                      <div className={styles.cardTitle}>
                        <h4>{task.title} <strong className={styles.projectId}>(ID: {task.projectId || "-"})</strong></h4>
                        <strong>Order {task.order || "-"}</strong>
                      </div>
                      <div className={styles.meta}>
                        <span>Source: {task.source}</span><span>Category: {task.category}</span><span>State: {task.state}</span><span>Priority: {task.priority}</span><span>Metadata: {task.metadataJson ? "available" : "-"}</span>
                      </div>
                      <div className={styles.actions}>
                        <button type="button" className={styles.action} disabled={disabled || index === 0} onClick={() => taskAction(task, "up")}>Move up</button>
                        <button type="button" className={styles.action} disabled={disabled || index === group.tasks.length - 1} onClick={() => taskAction(task, "down")}>Move down</button>
                        <button type="button" className={styles.action} disabled={disabled} onClick={() => taskAction(task, "send-weekly")}>Send to Weekly Planner</button>
                        <button type="button" className={`${styles.action} ${styles.danger}`} disabled={disabled} onClick={() => taskAction(task, "remove")}>Remove from Task Manager</button>
                      </div>
                    </article>
                  )) : <div className={styles.card}>{group.empty}</div>}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
      {modal && <ProjectEditor mode="edit" project={modal.project} busy={busy} error={error}
        onClose={() => setModal(null)} onSubmit={submitProject} />}
    </section>
  );
}
