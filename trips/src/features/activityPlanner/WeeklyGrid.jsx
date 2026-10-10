import { useMemo } from "react";
import styles from "./WeeklyGrid.module.css";
import {
  DAYS, DAY_LABELS, SLOT_COUNT, buildActivityBlocks, formatTimeLabel, normalizeSelection, slotToMinutes,
} from "./plannerUtils.js";

const SLOT_INDEXES = Array.from({ length: SLOT_COUNT }, (_, index) => index);

/** Picks black or white text for legibility on a hex background. */
function readableTextColor(hexColor) {
  const hex = String(hexColor).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#201f1e";
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "#201f1e" : "#ffffff";
}

/**
 * Outlook-style week view. Pure presentation: selection state lives in the parent,
 * which receives start/extend events here and finishes the drag on window mouseup.
 */
export default function WeeklyGrid({
  weeklyGrid, activityTypesById, selection, isSelecting, disabled, onSelectStart, onSelectExtend, onBlockClick,
}) {
  const blocks = useMemo(() => buildActivityBlocks(weeklyGrid), [weeklyGrid]);
  const selectedRange = normalizeSelection(selection);

  function handleCellMouseDown(event, dayIndex, slot) {
    if (disabled || event.button !== 0) return;
    // Stop the browser from starting a text selection while dragging.
    event.preventDefault();
    onSelectStart({ day: dayIndex, slot });
  }

  function handleCellMouseEnter(dayIndex, slot) {
    if (isSelecting) onSelectExtend({ day: dayIndex, slot });
  }

  function handleBlockClick(event, block) {
    if (disabled) return;
    const span = block.endSlot - block.startSlot + 1;
    let slotOffset = 0;
    // Mouse clicks resolve the exact slot (merged blocks may span several rules); keyboard uses the first.
    if (event.detail > 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      slotOffset = Math.min(span - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * span)));
    }
    onBlockClick({ ruleId: block.ruleIds[slotOffset], clickedDay: DAYS[block.dayIndex], editingSingleDay: true });
  }

  return (
    <div className={`${styles.calendar} ${isSelecting ? styles.selecting : ""}`} role="grid" aria-label="Weekly activity grid">
      <div className={styles.headerRow} role="row">
        <div className={styles.cornerCell} />
        {DAY_LABELS.map((label, dayIndex) => (
          <div key={label} className={styles.dayHeader} role="columnheader">
            <span className={styles.dayShort}>{DAYS[dayIndex]}</span>
            <span className={styles.dayLong}>{label}</span>
          </div>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.timeGutter} aria-hidden="true">
          {SLOT_INDEXES.map((slot) => (
            <div key={slot} className={styles.timeLabel}>
              {slotToMinutes(slot) % 60 === 0 ? formatTimeLabel(slotToMinutes(slot)) : ""}
            </div>
          ))}
        </div>

        {DAYS.map((day, dayIndex) => {
          const dayHasSelection = selectedRange && dayIndex >= selectedRange.startDay && dayIndex <= selectedRange.endDay;
          return (
            <div key={day} className={styles.dayColumn} role="gridcell" aria-label={DAY_LABELS[dayIndex]}>
              {SLOT_INDEXES.map((slot) => (
                <div
                  key={slot}
                  className={`${styles.slot} ${slotToMinutes(slot) % 60 === 0 ? styles.hourStart : ""}`}
                  onMouseDown={(event) => handleCellMouseDown(event, dayIndex, slot)}
                  onMouseEnter={() => handleCellMouseEnter(dayIndex, slot)}
                />
              ))}

              {blocks.filter((block) => block.dayIndex === dayIndex).map((block) => {
                const type = activityTypesById[block.activityTypeId];
                const color = type?.color || "#8a8886";
                const span = block.endSlot - block.startSlot + 1;
                const timeRange = `${formatTimeLabel(slotToMinutes(block.startSlot))} – ${formatTimeLabel(slotToMinutes(block.endSlot + 1))}`;
                return (
                  <button
                    key={block.key}
                    type="button"
                    className={styles.block}
                    style={{ "--start": block.startSlot, "--span": span, "--block-color": color, color: readableTextColor(color) }}
                    onClick={(event) => handleBlockClick(event, block)}
                    disabled={disabled}
                    title={`${type?.name || block.activityTypeId}\n${timeRange}`}
                  >
                    <span className={styles.blockTitle}>{type?.name || block.activityTypeId}</span>
                    {span > 1 && <span className={styles.blockTime}>{timeRange}</span>}
                  </button>
                );
              })}

              {dayHasSelection && (
                <div
                  className={styles.selection}
                  style={{ "--start": selectedRange.startSlot, "--span": selectedRange.endSlot - selectedRange.startSlot + 1 }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
