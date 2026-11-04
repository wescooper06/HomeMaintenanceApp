import { useCallback, useEffect, useRef, useState } from "react";

import { usePlanner } from "./usePlanner.js";

export default function useChecklistReorder({ task, day, slot, listRef }) {
  const { actions, snapshot } = usePlanner();
  const [drag, setDrag] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const gesture = useRef(null);
  const frame = useRef(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ task, day, slot });
  useEffect(() => { latest.current = { task, day, slot }; }, [task, day, slot]);

  const cancel = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = null;
    if (active?.handle.hasPointerCapture(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
    if (mounted.current) setDrag(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);
  useEffect(() => {
    const active = gesture.current;
    if (active && (snapshot.error || active.taskId !== task.id || active.day !== day || active.slot !== slot
      || !task.checklist.some((item) => item.id === active.fromId))) cancel();
  }, [task, day, slot, snapshot.error, cancel]);

  const move = async (fromId, toId, placement = "before") => {
    if (pending.current || fromId === toId) return;
    if (listRef.current?.querySelector("[data-planner-inline-edit]")) {
      setStatus("Finish or cancel editing before reordering.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setStatus("");
    const focused = document.activeElement;
    try {
      const current = latest.current;
      const saved = await actions.reorderChecklistItem(current.task.id, current.day, current.slot, fromId, toId, placement);
      if (mounted.current) setStatus(saved ? "Sub-task order saved." : "Reorder canceled.");
    } catch (error) {
      if (mounted.current) setStatus(`Order was not saved. ${error.message}`);
      console.warn("Checklist reorder failed", error);
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        const row = [...(listRef.current?.querySelectorAll("[data-checklist-id]") || [])]
          .find((element) => element.dataset.checklistId === fromId);
        if (focused?.isConnected && !focused.disabled) focused.focus();
        else row?.querySelector("[data-action='checklist-drag-handle']")?.focus();
      }
    }
  };

  const targetAt = (active) => {
    const list = listRef.current;
    const viewport = list?.closest("[data-checklist-scroll]");
    if (!list || !viewport) return null;
    const bounds = viewport.getBoundingClientRect();
    if (active.x < bounds.left || active.x > bounds.right || active.y < bounds.top || active.y > bounds.bottom) return null;
    const rows = [...list.querySelectorAll("[data-checklist-id]")];
    const row = rows.find((element) => {
      const rect = element.getBoundingClientRect();
      return active.y >= rect.top && active.y <= rect.bottom;
    });
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { id: row.dataset.checklistId, placement: active.y > rect.top + rect.height / 2 ? "after" : "before" };
  };
  const tick = () => {
    const active = gesture.current;
    if (!active?.started) return;
    const viewport = listRef.current?.closest("[data-checklist-scroll]");
    const bounds = viewport?.getBoundingClientRect();
    if (bounds && active.x >= bounds.left && active.x <= bounds.right
      && active.y >= bounds.top && active.y <= bounds.bottom) {
      const delta = active.y < bounds.top + 36 ? -8 : active.y > bounds.bottom - 36 ? 8 : 0;
      if (delta) viewport.scrollTop += delta;
    }
    const target = targetAt(active);
    setDrag({ fromId: active.fromId, toId: target?.id || "", placement: target?.placement || "" });
    frame.current = requestAnimationFrame(tick);
  };
  const start = (event, fromId) => {
    if (event.button !== 0 || pending.current || busy || snapshot.error || task.checklist.length < 2
      || listRef.current.querySelector("[data-planner-inline-edit]")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    cancel();
    gesture.current = { fromId, taskId: task.id, day, slot,
      pointerId: event.pointerId, handle: event.currentTarget,
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, started: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.x = event.clientX;
    active.y = event.clientY;
    if (!active.started && Math.hypot(active.x - active.startX, active.y - active.startY) >= 6) {
      active.started = true;
      tick();
    }
  };
  const finish = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.x = event.clientX;
    active.y = event.clientY;
    const target = active.started ? targetAt(active) : null;
    const fromId = active.fromId;
    cancel();
    if (target && target.id !== fromId) void move(fromId, target.id, target.placement);
    else setStatus("Reorder canceled.");
  };
  const handleKey = (event, index) => {
    if (event.key === "Escape" && gesture.current) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      setStatus("Reorder canceled.");
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      const to = index + (event.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < task.checklist.length) {
        void move(task.checklist[index].id, task.checklist[to].id, to > index ? "after" : "before");
      }
    }
  };
  return { drag, busy, status, move, start, pointerMove, finish, cancel, handleKey };
}
