import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { createMealPlannerService, mealPeriods } from "../../services/mealPlannerService.js";
import { formatDateLabel } from "../../services/plannerService.js";
import { createRecipeService } from "../../services/recipeService.js";

import MealEntryDialog from "./MealEntryDialog.jsx";
import styles from "./MealPlanner.module.css";

const meals = createMealPlannerService(), recipes = createRecipeService();
const MealContext = createContext(null);

export function MealPlannerProvider({ week, children }) {
  const [state, setState] = useState({ entries: [], recipes: [], loaded: false, error: "" });
  const [attempt, setAttempt] = useState(0), [adding, setAdding] = useState(null), [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([meals.list(), recipes.list()]).then(([entries, values]) => {
      if (entries.some((e) => e.recipe_id && !values.some((r) => r.id === e.recipe_id))) {
        throw new Error("A linked Recipe changed during loading. Retry meals.");
      }
      if (active) setState({ entries, recipes: values, loaded: true, error: "" });
    }).catch((failure) => { if (active) setState((old) => ({ ...old, error: failure.message })); });
    return () => { active = false; };
  }, [week, attempt]);
  const refresh = () => setAttempt((n) => n + 1);
  return <MealContext.Provider value={{ ...state, refresh, setState, setAdding, setMessage }}>
    <div className={styles.status}>
      {!state.loaded && !state.error && <p role="status">Loading planned meals...</p>}
      {state.error && <p role="alert">{state.error} Existing displayed meals are retained.
        <button type="button" onClick={refresh}>Retry meals</button></p>}
      {message && <p role="status">{message}</p>}
    </div>
    {children}
    {adding && <MealEntryDialog date={adding.date} meal={adding.meal} onClose={() => setAdding(null)}
      onAdded={(saved) => { setMessage(`Meal added for ${saved.meal_date}, ${saved.meal_type}.`); refresh(); }} />}
  </MealContext.Provider>;
}

export function MealTextEditDialog({ entry, title, onSave, onClose, onSaved }) {
  const dialog = useRef(null), lock = useRef(false);
  const [text, setText] = useState(entry.display_text);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    return () => {
      if (element.open) element.close();
      previous?.focus();
    };
  }, []);
  async function save(event) {
    event.preventDefault();
    if (lock.current || !/\S/u.test(text)) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await onSave(text);
      onSaved(saved);
      onClose();
    } catch (failure) {
      setError(`${failure.message} Displayed meal is kept. Retry the same action or reload Planner.`);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const close = () => { if (!pending) onClose(); };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`edit-meal-title-${entry.id}`}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <h2 id={`edit-meal-title-${entry.id}`}>Edit {title}</h2>
    <form onSubmit={save}>
      <label htmlFor={`edit-meal-text-${entry.id}`}>Meal text</label>
      <textarea id={`edit-meal-text-${entry.id}`} value={text} disabled={pending} onChange={(event) => setText(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={close}>Cancel</button>
        <button type="submit" disabled={pending || !/\S/u.test(text)}>{pending ? "Saving..." : "Save"}</button>
      </div>
    </form>
  </dialog>;
}

function MealOccurrence({ entry, title }) {
  const { setState, setMessage } = useContext(MealContext);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function remove() {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(""); setMessage("");
    try {
      await meals.remove(entry);
      setState((old) => ({ ...old, entries: old.entries.filter((e) => e.id !== entry.id) }));
      setMessage("Meal occurrence removed. Recipe unchanged.");
    } catch (failure) { setError(`${failure.message} Displayed meal is kept. Retry the same action or reload Planner.`); }
    finally { lock.current = false; setPending(false); }
  }
  return <>
    <li className={styles.occurrence}>
      {entry.recipe_id
        ? <Link className={styles.recipeLink} to={`/meals/recipes/${entry.recipe_id}`}>{title}</Link>
        : <span className={styles.text}>{title}</span>}
      <div className={styles.occurrenceActions}>
        {!entry.recipe_id && <button type="button" disabled={pending} aria-label={`Edit ${title}`} title={`Edit ${title}`}
          onClick={() => setEditing(true)}>{"\u270e"}</button>}
        <button type="button" disabled={pending} aria-label={`Remove ${title}`} title={`Remove ${title}`} onClick={remove}>{"\u00d7"}</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </li>
    {editing && <MealTextEditDialog entry={entry} title={title} onClose={() => setEditing(false)}
      onSave={(text) => meals.edit(entry, text)}
      onSaved={(saved) => {
        setState((old) => ({ ...old, entries: old.entries.map((e) => e.id === entry.id ? saved : e) }));
        setMessage("Meal text saved.");
      }} />}
  </>;
}

export function MealRow({ date, slot }) {
  const state = useContext(MealContext);
  const meal = mealPeriods[slot], label = meal[0].toUpperCase() + meal.slice(1);
  const dateLabel = formatDateLabel(date);
  const entries = state.entries.filter((e) => e.meal_date === date && e.meal_type === meal);
  return <section className={styles.row} aria-label={`${label} ${date}`}>
    <div className={styles.rowHeader}>
      <h5>{label}</h5>
      <button type="button" className={styles.addButton} aria-label={`Add ${label.toLowerCase()} for ${dateLabel}`}
        title={`Add ${label.toLowerCase()} for ${dateLabel}`} disabled={!state.loaded || Boolean(state.error)}
        onClick={() => state.setAdding({ date, meal })}><span aria-hidden="true">+</span></button>
    </div>
    <ul aria-label={`${label} meals`}>{entries.map((entry) => <MealOccurrence key={entry.id} entry={entry}
      title={entry.recipe_id ? state.recipes.find((r) => r.id === entry.recipe_id)?.title || entry.display_text : entry.display_text} />)}</ul>
    {state.loaded && !entries.length && <p>No meals planned</p>}
  </section>;
}
