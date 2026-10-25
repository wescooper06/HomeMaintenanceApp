import { useRef, useState } from "react";

import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";
import usePlannerDialog from "./usePlannerDialog.js";

export default function MasterProjectTitleEditor() {
  const { snapshot, actions } = usePlanner();
  const [projectId, setProjectId] = useState("");
  const ref = useRef(null);
  usePlannerDialog(ref, actions.selectMaster, "select");
  return (
    <div className={styles["planner-move-overlay"]} onClick={(event) => { if (event.target === event.currentTarget) actions.selectMaster(null); }}>
      <section ref={ref} className={styles["planner-move-modal"]} role="dialog" aria-modal="true" aria-labelledby="planner-link-project-title">
        <header className={styles["planner-move-header"]}>
          <h2 id="planner-link-project-title">Link Project</h2>
          <button type="button" className={styles["planner-move-close"]} data-action="cancel" aria-label="Cancel" title="Cancel" onClick={() => actions.selectMaster(null)}>{"\u00d7"}</button>
        </header>
        <p className={styles["planner-link-task-title"]}>{snapshot.linkProject.taskTitle}</p>
        <label htmlFor="planner-link-project">Master Project</label>
        <select id="planner-link-project" className={styles["planner-link-project-select"]} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">Select a project</option>
          {snapshot.linkProject.projects.map((project) => <option key={project.id} value={project.id}>{project.title} (ID: {project.id})</option>)}
        </select>
        <div className={styles["planner-link-project-actions"]}>
          <button type="button" data-action="cancel" onClick={() => actions.selectMaster(null)}>Cancel</button>
          <button type="button" data-action="link" disabled={!projectId} onClick={() => actions.selectMaster(projectId)}>Link and Save</button>
        </div>
      </section>
    </div>
  );
}
