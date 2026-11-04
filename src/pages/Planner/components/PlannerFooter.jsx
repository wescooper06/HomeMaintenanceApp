import { useEffect } from "react";
import { createPortal } from "react-dom";

import { selectChecklistOwner } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import { ChecklistModal } from "./Checklist.jsx";
import MasterProjectTitleEditor from "./MasterProjectTitleEditor.jsx";
import PlannerMoveTaskModal from "./PlannerMoveTaskModal.jsx";
import ReminderModal from "./ReminderModal.jsx";
import RepeatableSeriesEditor from "./RepeatableSeriesEditor.jsx";
import ResourceLinks from "./ResourceLinks.jsx";
import RestoreOccurrenceDialog from "./RestoreOccurrenceDialog.jsx";
import { usePlanner } from "./usePlanner.js";
import WeatherModal from "./WeatherModal.jsx";


export default function PlannerFooter() {
  const { snapshot, actions } = usePlanner();
  const task = (id) => snapshot.planner.tasks.find((item) => item.id === id);
  const move = task(snapshot.moveTaskId);
  const reminder = task(snapshot.reminderTaskId);
  const series = task(snapshot.seriesTaskId);
  const checklist = selectChecklistOwner(snapshot);
  useEffect(() => {
    const escape = (event) => { if (event.key === "Escape") actions.closeDialogs(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [actions]);
  return (
    <>
      <div id="weather-modal" className={styles["weather-modal-host"]} hidden={!snapshot.modal}
        onClick={(event) => { if (event.target === event.currentTarget) actions.closeWeather(); }}>
        {snapshot.modal?.type === "weather" && <WeatherModal date={snapshot.modal.date} />}
        {snapshot.modal?.type === "links" && <ResourceLinks />}
      </div>
      <div id="reminder-modal" className={styles["reminder-modal-host"]} hidden={!reminder}
        onClick={(event) => { if (event.target === event.currentTarget) actions.closeReminder(); }}>
        {reminder && <ReminderModal key={reminder.id} task={reminder} />}
      </div>
      <div id="series-modal" className={styles["series-modal-host"]} hidden={!series?.parentRepeatableId}
        onClick={(event) => { if (event.target === event.currentTarget) actions.closeSeries(); }}>
        {series?.parentRepeatableId && <RepeatableSeriesEditor key={snapshot.seriesTaskId} taskId={snapshot.seriesTaskId} />}
      </div>
      {checklist && createPortal(<div className={styles["checklist-modal-host"]}
        onClick={(event) => { if (event.target === event.currentTarget) actions.closeChecklist(); }}>
        <ChecklistModal key={checklist.task.id} {...checklist} />
      </div>, document.body)}
      {move && createPortal(<PlannerMoveTaskModal key={move.id} task={move} />, document.body)}
      {snapshot.linkProject && createPortal(<MasterProjectTitleEditor />, document.body)}
      {snapshot.restoreProposal && createPortal(<RestoreOccurrenceDialog />, document.body)}
    </>
  );
}
