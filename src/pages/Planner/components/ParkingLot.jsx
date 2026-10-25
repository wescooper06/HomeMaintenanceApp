import { useCallback, useEffect, useRef, useState } from "react";

import {
  convertParkingItem, deleteParkingItem, getParkingItemColor, loadParkingItems,
  loadParkingProjectEditor, parkPlannerPayload, removeParkingProject, subscribeParkingChanges,
} from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import ParkingLotDialogs from "./ParkingLotDialogs.jsx";
import { usePlanner } from "./usePlanner.js";

const css = (...names) => names.filter(Boolean).map((name) => styles[name]).filter(Boolean).join(" ");
const convertedLabels = { "task-manager": "Ad-Hoc", "ad-hoc": "Ad-Hoc", project: "Project", repeatable: "Repeatable" };

export default function ParkingLot({ onRefresh, onDragStart, onDragEnd, onCreatedFromWeekly } = {}) {
  const { actions } = usePlanner();
  const [items, setItems] = useState([]);
  const [menuId, setMenuId] = useState("");
  const [dialog, setDialog] = useState(null);
  const [dragId, setDragId] = useState("");
  const [dropTarget, setDropTarget] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const dialogGeneration = useRef(0);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await loadParkingItems();
      if (mounted.current && request === generation.current) setItems(next);
    } catch (reason) {
      if (mounted.current && request === generation.current) setError(reason.message);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeParkingChanges(load);
    // Subscribe before the initial read so intervening writes cannot be missed.
    void Promise.resolve().then(load);
    return () => {
      mounted.current = false;
      generation.current += 1;
      dialogGeneration.current += 1;
      unsubscribe();
    };
  }, [load]);

  const refresh = async () => {
    await load();
    await (onRefresh ? onRefresh() : actions.refreshParking());
  };

  const run = async (operation) => {
    setError("");
    setPending(true);
    try {
      await operation();
      await refresh();
    } catch (reason) {
      if (mounted.current) setError(reason.message || "Unable to update Parking Lot.");
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const closeDialog = () => {
    dialogGeneration.current += 1;
    setDialog(null);
  };

  const edit = (item) => run(async () => {
    const request = ++dialogGeneration.current;
    const type = item.convertedTo?.type;
    if (type === "task-manager" || type === "ad-hoc") {
      setDialog({ kind: "adhoc", item });
    } else if (type === "project" || type === "repeatable") {
      const editor = await loadParkingProjectEditor(item);
      if (mounted.current && request === dialogGeneration.current) {
        setDialog(editor ? { kind: "project", item: editor.item, editor } : { kind: "parking", item });
      }
    } else {
      setDialog({ kind: "parking", item });
    }
  });

  const convert = (item, type) => {
    setMenuId("");
    void run(() => convertParkingItem(item, type));
  };

  const dragStart = (event, item) => {
    const payload = { kind: "parking-item", item };
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    setDragId(item.id);
    if (onDragStart) onDragStart(payload);
    else actions.setDrag(payload);
  };

  const dragEnd = () => {
    setDragId("");
    if (onDragEnd) onDragEnd();
    else actions.setDrag(null);
  };

  const drop = (event) => {
    setDropTarget(false);
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!["weekly-move", "parking-item"].includes(payload?.kind)) return;
    event.preventDefault();
    void run(async () => {
      const item = await parkPlannerPayload(payload);
      if (item && onCreatedFromWeekly) {
        onCreatedFromWeekly(item, { weeklyTask: payload.weeklyTask || payload.item || payload, archive: true });
      }
    });
  };

  return (
    <section className={css("parking-lot-panel", "planner-pool")} aria-label="Task parking lot panel" onKeyDown={(event) => {
      if (event.key === "Escape") setMenuId("");
    }}>
      <div className={styles["parking-lot-shell"]}>
        <div className={styles["parking-lot-header"]}>
          <div className={styles["parking-lot-header-title-wrap"]}>
            <div className={styles["parking-lot-title-row-inline"]}>
              <h2>Task Parking Lot</h2>
              <button type="button" className={styles["parking-lot-help"]} data-tooltip="Ideas, notes, and next step tasks before they become scheduled work." aria-label="Parking lot help" title="Ideas, notes, and next step tasks before they become scheduled work.">?</button>
            </div>
          </div>
          <button type="button" className={styles["parking-lot-add-button"]} data-action="parking-add" aria-label="Add parking lot item" title="Add parking lot item" disabled={pending} onClick={() => setDialog({ kind: "parking", item: null })}>+</button>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className={css("parking-lot-dropzone", dropTarget && "is-drop-target")} data-role="parking-dropzone" aria-label="Parking lot drop zone"
          onDragOver={(event) => {
            if (!event.dataTransfer.getData("text/plain") && !Array.from(event.dataTransfer.types).includes("text/plain")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropTarget(true);
          }}
          onDragLeave={(event) => {
            if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setDropTarget(false);
          }}
          onDrop={drop}>
          <div className={styles["parking-lot-empty"]} data-role="parking-empty" hidden={items.length > 0}>No parking lot items yet.</div>
          <div className={styles["parking-lot-list"]} data-role="parking-list" aria-live="polite">
            {items.map((item) => {
              const convertedType = item.convertedTo?.type || "";
              const tags = item.tags.split(/[,\n]/g).map((tag) => tag.trim()).filter(Boolean);
              return (
                <article key={item.id} className={css("parking-lot-card", dragId === item.id && "is-dragging")} data-parking-id={item.id} tabIndex={0} aria-label={`Parking lot item ${item.title}`}>
                  <div className={styles["parking-lot-card-header"]}>
                    <span className={styles["parking-lot-color-stripe"]} style={{ background: getParkingItemColor(item) }} />
                    <div className={styles["parking-lot-card-main"]}>
                      <div className={styles["parking-lot-title-row"]}>
                        <div className={styles["parking-lot-title"]}>{item.title}</div>
                        <div className={styles["parking-lot-menu"]}>
                          <button type="button" className={styles["parking-lot-menu-btn"]} data-action="menu-toggle" aria-label="Convert parking item" title="Convert" aria-expanded={menuId === item.id} onClick={() => setMenuId(menuId === item.id ? "" : item.id)}>Convert</button>
                          <div className={styles["parking-lot-menu-panel"]} data-role="convert-menu" hidden={menuId !== item.id}>
                            <button type="button" data-action="convert-project" disabled={pending} onClick={() => convert(item, "project")}>Project</button>
                            <button type="button" data-action="convert-adhoc" disabled={pending} onClick={() => convert(item, "task-manager")}>Ad-Hoc</button>
                            <button type="button" data-action="convert-repeatable" disabled={pending} onClick={() => convert(item, "repeatable")}>Repeatable</button>
                          </div>
                        </div>
                      </div>
                      {item.notes && <div className={styles["parking-lot-notes"]}>{item.notes}</div>}
                      {tags.length > 0 && <div className={styles["parking-lot-tags"]}>{tags.map((tag, index) => <span key={`${index}-${tag}`} className={styles["parking-lot-tag-chip"]}>{tag}</span>)}</div>}
                      <div className={styles["parking-lot-notes"]}>{convertedType ? `Converted to ${convertedLabels[convertedType] || convertedType}` : "Not converted"}</div>
                      <div className={styles["parking-lot-actions"]}>
                        <button type="button" className={styles["parking-lot-drag-handle"]} data-action="drag-handle" draggable aria-label="Drag parking lot item" title="Drag" onDragStart={(event) => dragStart(event, item)} onDragEnd={dragEnd}>⋮⋮</button>
                        <button type="button" className={styles["parking-lot-action-btn"]} data-action="edit" aria-label="Edit parking lot item" title="Edit" disabled={pending} onClick={() => void edit(item)}>✎</button>
                        {["project", "repeatable"].includes(convertedType) && <button type="button" className={css("parking-lot-action-btn", "pool-icon-btn", "curated-only")} data-action="remove-from-projects" aria-label="Remove from Projects" title="Remove from Projects" disabled={pending} onClick={() => void run(() => removeParkingProject(item))}>🗂️</button>}
                        <button type="button" className={css("parking-lot-action-btn", "parking-lot-delete-btn")} data-action="delete" aria-label="Remove from Parking Lot" title="Remove from Parking Lot" disabled={pending} onClick={() => void run(() => deleteParkingItem(item.id))}>🗑️</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles["parking-lot-modal-host"]} data-role="parking-modal-host" hidden={!dialog}>
        {dialog && <ParkingLotDialogs key={`${dialog.kind}-${dialog.item?.id || "new"}`} dialog={dialog} onClose={closeDialog} onSaved={async (item, options) => {
          if (options.localOnly) {
            setItems((previous) => previous.map((entry) => entry.id === item.id ? item : entry));
          } else {
            await refresh();
          }
        }} />}
      </div>
    </section>
  );
}
