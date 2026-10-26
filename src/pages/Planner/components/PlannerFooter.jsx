import { useEffect } from "react";
import { createPortal } from "react-dom";

import styles from "../PlannerPage.module.css";

import { AdhocChecklistModal } from "./Checklist.jsx";
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
  const checklist = task(snapshot.activeAdhocChecklist?.taskId);
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
      <div id="adhoc-checklist-modal" className={styles["adhoc-checklist-modal-host"]} hidden={!checklist}
        onClick={(event) => { if (event.target === event.currentTarget) actions.closeChecklist(); }}>
        {checklist && <AdhocChecklistModal task={checklist} day={snapshot.activeAdhocChecklist.day} slot={snapshot.activeAdhocChecklist.slot} />}
      </div>
      {move && createPortal(<PlannerMoveTaskModal key={move.id} task={move} />, document.body)}
      {snapshot.linkProject && createPortal(<MasterProjectTitleEditor />, document.body)}
      {snapshot.restoreProposal && createPortal(<RestoreOccurrenceDialog />, document.body)}
    </>
  );
}
