import { useEffect, useId, useRef, useState } from "react";
import "./MonthBox.css";

export default function MonthBox({ month, year, abbreviation, monthNotes, selected = false }) {
  const wrapperRef = useRef(null);
  const monthBoxRef = useRef(null);
  const dismissedRef = useRef(false);
  const tooltipId = useId();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0, placement: "above" });
  const notes = String(monthNotes ?? "");
  const hasNotes = Boolean(notes.trim());
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2000, month - 1, 1));

  function updateTooltipPosition() {
    const bounds = monthBoxRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const placement = bounds.top > 88 ? "above" : "below";
    const center = bounds.left + bounds.width / 2;
    const left = Math.max(150, Math.min(center, window.innerWidth - 150));
    setTooltipPosition({ left, top: placement === "above" ? bounds.top - 8 : bounds.bottom + 8, placement });
  }

  function showTooltip() {
    if (!hasNotes || dismissedRef.current) return;
    updateTooltipPosition();
    setTooltipOpen(true);
  }

  function handleBlur(event) {
    if (!wrapperRef.current?.contains(event.relatedTarget)) {
      dismissedRef.current = false;
      setTooltipOpen(false);
    }
  }

  function dismissTooltip() {
    dismissedRef.current = true;
    setTooltipOpen(false);
    monthBoxRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && tooltipOpen) {
      event.preventDefault();
      event.stopPropagation();
      dismissTooltip();
      return;
    }
    if (event.currentTarget === monthBoxRef.current && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      monthBoxRef.current?.click();
    }
  }

  useEffect(() => {
    if (!tooltipOpen || !hasNotes) return undefined;
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [tooltipOpen, hasNotes]);

  return <div ref={wrapperRef} className="month-box-container" onMouseEnter={() => {
    dismissedRef.current = false;
    showTooltip();
  }} onMouseLeave={() => setTooltipOpen(false)} onFocus={showTooltip} onBlur={handleBlur}>
    <div
      ref={monthBoxRef}
      className="month-box"
      role="button"
      tabIndex={0}
      aria-label={`${monthName} ${year}${hasNotes ? `. Notes: ${notes}` : ""}`}
      aria-pressed={Boolean(selected)}
      aria-describedby={hasNotes ? tooltipId : undefined}
      onFocus={showTooltip}
      onKeyDown={handleKeyDown}
    >
      <div className="month-abbrev">{abbreviation}</div>
      {hasNotes && <div className="month-notes" aria-hidden={false}>{notes}</div>}
    </div>
    {hasNotes && <div
      id={tooltipId}
      className="month-notes-tooltip"
      role="tooltip"
      tabIndex={0}
      aria-hidden={!tooltipOpen}
      data-placement={tooltipPosition.placement}
      style={{ left: `${tooltipPosition.left}px`, top: `${tooltipPosition.top}px` }}
      hidden={!tooltipOpen}
      onKeyDown={handleKeyDown}
    >{notes}</div>}
  </div>;
}