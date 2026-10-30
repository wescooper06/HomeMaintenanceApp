import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { createMealPlannerService, mealPeriods } from "../../services/mealPlannerService.js";
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

function MealOccurrence({ entry, title }) {
  const { setState, setMessage } = useContext(MealContext);
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.display_text), [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function mutate(remove) {
    if (lock.current || (!remove && !/\S/u.test(text))) return;
    lock.current = true; setPending(true); setError(""); setMessage("");
    try {
      const saved = remove ? await meals.remove(entry) : await meals.edit(entry, text);
      setState((old) => ({ ...old, entries: remove ? old.entries.filter((e) => e.id !== entry.id)
        : old.entries.map((e) => e.id === entry.id ? saved : e) }));
      setMessage(remove ? "Meal occurrence removed. Recipe unchanged." : "Meal text saved.");
      setEditing(false);
    } catch (failure) { setError(`${failure.message} Displayed meal is kept. Retry the same action or reload Planner.`); }
    finally { lock.current = false; setPending(false); }
  }
  return <li>
    <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={pending}>
      {title}{entry.recipe_id && " \u2197 (Recipe)"}
    </button>
    {open && <div>
      {editing ? <div className={styles.edit}>
        <label>Meal text<textarea value={text} disabled={pending} onChange={(e) => setText(e.target.value)} /></label>
        <div className={styles.actions}>
          <button type="button" disabled={pending || !/\S/u.test(text)} onClick={() => mutate(false)}>Save meal text</button>
          <button type="button" disabled={pending} onClick={() => { setEditing(false); setText(entry.display_text); setError(""); }}>Cancel edit</button>
        </div>
      </div> : <div className={styles.actions}>
        {entry.recipe_id ? <Link to={`/meals/recipes/${entry.recipe_id}`}>View Recipe</Link>
          : <button type="button" disabled={pending} onClick={() => { setText(entry.display_text); setEditing(true); }}>Edit meal</button>}
        <button type="button" disabled={pending} onClick={() => mutate(true)}>{pending ? "Saving..." : "Remove meal"}</button>
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </li>;
}

export function MealRow({ date, slot }) {
  const state = useContext(MealContext);
  const meal = mealPeriods[slot], label = meal[0].toUpperCase() + meal.slice(1);
  const entries = state.entries.filter((e) => e.meal_date === date && e.meal_type === meal);
  return <section className={styles.row} aria-label={`${label} ${date}`}>
    <h5>{label}</h5>
    <ul>{entries.map((entry) => <MealOccurrence key={entry.id} entry={entry}
      title={entry.recipe_id ? state.recipes.find((r) => r.id === entry.recipe_id)?.title || entry.display_text : entry.display_text} />)}</ul>
    {state.loaded && !entries.length && <p>No meals planned</p>}
    <button type="button" disabled={!state.loaded || Boolean(state.error)}
      onClick={() => state.setAdding({ date, meal })}>Add meal</button>
  </section>;
}
