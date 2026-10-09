import { createContext, useContext, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { TIMELINE_MONTHS, timelineKey } from "../utils/timelineUtils.js";
import "./TimelineDragDrop.css";

const TimelineInteraction = createContext({ disabled: false });

function keepOverlayVisible({ transform, activeNodeRect, windowRect }) {
  if (!activeNodeRect || !windowRect) return transform;
  const width = Math.min(windowRect.width, document.documentElement.clientWidth);
  const overlayWidth = Math.min(240, width);
  return {
    ...transform,
    x: Math.max(-activeNodeRect.left, Math.min(transform.x, width - overlayWidth - activeNodeRect.left)),
    y: Math.max(-activeNodeRect.top, Math.min(transform.y, windowRect.height - 80 - activeNodeRect.top)),
  };
}

function collisionDetection(args) {
  if (!args.pointerCoordinates) {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((entry) => entry.data.current?.month) });
  }
  const hits = pointerWithin(args);
  const months = hits.filter((entry) => String(entry.id).startsWith("month:"));
  return months.length ? months : hits;
}

export function TimelineDragDrop({ children, onMove, disabled = false, onBusyChange }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const suppressClick = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const locked = disabled || saving || Boolean(pending);

  async function commitMove(plan) {
    setSaving(true);
    setPending(plan);
    setError("");
    onBusyChange?.(true);
    try {
      await onMove(plan.trip.tripId, plan.year, plan.month);
      setPending(null);
    } catch (moveError) {
      setError(`Move may be partially saved. Retry to finish syncing. ${moveError.message}`);
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  function finishDrag({ active, over }) {
    const source = active.data.current;
    const destination = over?.data.current;
    setActiveTrip(null);
    setTarget(null);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    if (!destination || locked) return;
    const month = destination.month || source.sourceMonth;
    if (timelineKey(source.year, source.sourceMonth) === timelineKey(destination.year, month)) return;
    void commitMove({ trip: source.trip, year: destination.year, month });
  }

  return <TimelineInteraction.Provider value={{ disabled: locked }}>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={({ active }) => {
      suppressClick.current = true;
      setActiveTrip(active.data.current);
    }} onDragOver={({ over }) => setTarget(over?.data.current || null)} onDragEnd={finishDrag} onDragCancel={() => {
      setActiveTrip(null);
      setTarget(null);
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }}>
      <div className="timeline-dnd" aria-busy={saving} onClickCapture={(event) => {
        if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); }
      }}>
        {saving && <p role="status" className="timeline-operation-status">Moving trip...</p>}
        {error && <div role="alert" className="timeline-move-error"><p>{error}</p><button type="button" disabled={saving} onClick={() => commitMove(pending)}>Retry move</button></div>}
        {children}
      </div>
      <DragOverlay dropAnimation={null} modifiers={[keepOverlayVisible]} style={{ width: Math.min(240, document.documentElement.clientWidth) }}>{activeTrip && <div className="timeline-drag-tooltip" role="status">
        <strong>{activeTrip.trip.destination}</strong>
        {target ? <span>Move to {TIMELINE_MONTHS[(target.month || activeTrip.sourceMonth) - 1]} {target.year}</span> : <span>{activeTrip.trip.destination}</span>}
      </div>}</DragOverlay>
    </DndContext>
  </TimelineInteraction.Provider>;
}

export function TimelineDropYear({ year, children, className = "", as: Element = "section", ...props }) {
  const { disabled } = useContext(TimelineInteraction);
  const { setNodeRef, isOver } = useDroppable({ id: `year:${year}`, data: { year }, disabled: disabled || year < 1 || year > 9999 });
  return <Element {...props} ref={setNodeRef} className={`${className} timeline-drop-year`} data-drag-over={isOver} data-drop-year={year}>{children}</Element>;
}

export function TimelineDropMonth({ year, month, children, className = "", onClick, ...props }) {
  const { disabled } = useContext(TimelineInteraction);
  const { setNodeRef, isOver } = useDroppable({ id: `month:${timelineKey(year, month)}`, data: { year, month }, disabled });
  return <section {...props} ref={setNodeRef} className={`${className} timeline-drop-month`} data-drag-over={isOver} data-drop-year={year} data-drop-month={month} onClick={(event) => { if (!disabled) onClick?.(event); }}>{children}</section>;
}

export function TimelineDragTrip({ trip, year, month, children, className = "", onClick, ...props }) {
  const { disabled } = useContext(TimelineInteraction);
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `trip:${timelineKey(year, month)}:${trip.tripId}`, data: { trip, year, sourceMonth: month }, disabled });
  return <button {...props} {...attributes} {...listeners} ref={setNodeRef} type="button" disabled={disabled} data-trip-id={trip.tripId} data-dragging={isDragging} className={`${className} timeline-draggable-trip`} onClick={(event) => { if (!disabled) onClick?.(event); }}>{children}</button>;
}