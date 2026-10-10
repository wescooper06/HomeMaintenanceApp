import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./DailyActivityPlanner.module.css";
import WeeklyGrid from "./WeeklyGrid.jsx";
import ActivityRuleModal from "./ActivityRuleModal.jsx";
import { useSheetsData } from "./useSheetsData.js";
import { regenerateWeeklyGrid } from "./fetchHelpers.js";
import { createRuleId, selectionToRuleDraft } from "./plannerUtils.js";

const NEW_RULE_DEFAULTS = { activity_type_id: "", allow_override: false, priority: 1, notes: "" };

export default function DailyActivityPlanner() {
  const { activityTypes, rules, weeklyGrid, loading, error: loadError, reload, addRule, updateRule, splitRule, deleteRule } = useSheetsData();

  // Drag-select: anchor is where the mouse went down, focus is the cell currently hovered.
  const [selection, setSelection] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Modal: { key, isEditing, rule } while open.
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pageError, setPageError] = useState("");

  const activityTypesById = useMemo(
    () => Object.fromEntries(activityTypes.map((type) => [type.id, type])),
    [activityTypes],
  );

  // Finish the drag on mouseup anywhere, so releasing outside the grid still completes it.
  useEffect(() => {
    if (!isSelecting) return undefined;
    function handleMouseUp() {
      setIsSelecting(false);
      setSaveError("");
      setModal({
        key: Date.now(),
        isEditing: false,
        rule: { id: createRuleId(), ...NEW_RULE_DEFAULTS, ...selectionToRuleDraft(selection) },
      });
    }
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isSelecting, selection]);

  function handleSelectStart(cell) {
    setPageError("");
    setSelection({ anchor: cell, focus: cell });
    setIsSelecting(true);
  }

  function handleSelectExtend(cell) {
    setSelection((current) => (current ? { ...current, focus: cell } : current));
  }

  function handleBlockClick({ ruleId, clickedDay, editingSingleDay }) {
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) {
      setPageError(`Rule "${ruleId}" was not found in ActivityRules. Refresh to sync the grid.`);
      return;
    }
    if (!rule.days.includes(clickedDay)) {
      setPageError("This block is out of date. Refresh the grid before editing.");
      return;
    }
    setSelection(null);
    setSaveError("");
    setModal({ key: Date.now(), isEditing: true, editingSingleDay, clickedDay, rule: { ...rule, days: [clickedDay] } });
  }

  const closeModal = useCallback(() => {
    setModal(null);
    setSelection(null);
    setSaveError("");
  }, []);

  /** Write to ActivityRules, then regenerate WeeklyGrid and reload everything. */
  async function persist(writeRule) {
    setSaving(true);
    setSaveError("");
    try {
      await writeRule();
    } catch (writeError) {
      setSaveError(writeError.message);
      setSaving(false);
      return;
    }

    try {
      await regenerateWeeklyGrid();
    } catch (regenerateError) {
      setPageError(`Rule saved, but the grid could not be regenerated: ${regenerateError.message}`);
    }

    closeModal();
    setSaving(false);
    await reload();
  }

  const handleSave = (rule) => persist(() => modal.editingSingleDay
    ? splitRule(rule, modal.clickedDay)
    : modal.isEditing ? updateRule(rule) : addRule(rule));
  const handleDelete = (ruleId) => persist(() => deleteRule(ruleId));

  async function handleRefresh() {
    setPageError("");
    await reload();
  }

  const busy = loading || saving;
  const bannerError = pageError || loadError;

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <div>
          <h1 className={styles.title}>Daily Activity Planner</h1>
          <p className={styles.subtitle}>Drag across the grid to create a rule. Click a block to edit it.</p>
        </div>
        <div className={styles.toolbarActions}>
          {busy && <span className={styles.status} role="status">{saving ? "Saving…" : "Loading…"}</span>}
          <button type="button" className={styles.refreshButton} onClick={handleRefresh} disabled={busy}>Refresh</button>
        </div>
      </header>

      {activityTypes.length > 0 && (
        <ul className={styles.legend} aria-label="Activity types">
          {activityTypes.map((type) => (
            <li key={type.id} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: type.color }} />
              {type.name}
            </li>
          ))}
        </ul>
      )}

      {bannerError && <p className={styles.error} role="alert">{bannerError}</p>}

      <section className={styles.gridArea}>
        <WeeklyGrid
          weeklyGrid={weeklyGrid}
          activityTypesById={activityTypesById}
          selection={selection}
          isSelecting={isSelecting}
          disabled={busy || Boolean(modal)}
          onSelectStart={handleSelectStart}
          onSelectExtend={handleSelectExtend}
          onBlockClick={handleBlockClick}
        />
      </section>

      {modal && (
        <ActivityRuleModal
          key={modal.key}
          isEditing={modal.isEditing}
          editingSingleDay={modal.editingSingleDay}
          initialRule={modal.rule}
          activityTypes={activityTypes}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onDelete={handleDelete}
          onCancel={closeModal}
        />
      )}
    </main>
  );
}
