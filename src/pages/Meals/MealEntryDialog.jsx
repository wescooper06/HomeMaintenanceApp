import { useEffect, useRef, useState } from "react";

import { createMealPlannerService, validMealDate } from "../../services/mealPlannerService.js";
import { toDateKey } from "../../services/plannerService.js";
import { createRecipeService } from "../../services/recipeService.js";

import styles from "./MealPlanner.module.css";

const recipes = createRecipeService();
const meals = createMealPlannerService();

export default function MealEntryDialog({ recipeId = null, date, meal = "dinner", onClose, onAdded }) {
  const dialog = useRef(null), lock = useRef(false), submission = useRef(null);
  const [values, setValues] = useState([]);
  const [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState("recipe"), [selected, setSelected] = useState(recipeId || "");
  const [search, setSearch] = useState(""), [text, setText] = useState("");
  const [mealDate, setMealDate] = useState(() => date || toDateKey(new Date()));
  const [mealType, setMealType] = useState(meal);
  const [pending, setPending] = useState(false), [submitted, setSubmitted] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    const request = recipeId ? recipes.get(recipeId).then((recipe) => {
      if (!recipe) throw new Error("Recipe no longer exists. Close and reload.");
      return [recipe];
    }) : recipes.list();
    request.then((data) => {
      if (active) { setValues(data.toSorted((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))); setLoaded(true); setError(""); }
    }, (failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [recipeId, attempt]);
  const frozen = pending || submitted;
  const valid = validMealDate(mealDate) && (kind === "text" ? /\S/u.test(text) : values.some((r) => r.id === selected));
  async function add(event) {
    event.preventDefault();
    if (lock.current || !valid) return;
    lock.current = true; setPending(true); setSubmitted(true); setError("");
    submission.current ??= { id: crypto.randomUUID(), meal_date: mealDate, meal_type: mealType,
      recipe_id: kind === "recipe" ? selected : null, display_text: text };
    try { const saved = await meals.create(submission.current); onAdded(saved); onClose(); }
    catch (failure) { setError(`${failure.message} Your attempted meal is kept. Retry this same addition; do not start a new one if the response was uncertain.`); }
    finally { lock.current = false; setPending(false); }
  }
  const close = () => { if (!pending) onClose(); };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="plan-meal-title"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <h2 id="plan-meal-title">{recipeId ? "Plan Meal" : "Add meal"}</h2>
    {!loaded ? error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt((n) => n + 1)}>Retry loading Recipes</button></p>
      : <p role="status">Loading Recipes...</p> : <form onSubmit={add}>
      <fieldset disabled={frozen}>
        <legend>Meal details</legend>
        <label>Date<input type="date" min="0001-01-01" max="9999-12-31" required value={mealDate} onChange={(e) => setMealDate(e.target.value)} /></label>
        <label>Meal<select value={mealType} onChange={(e) => setMealType(e.target.value)}>
          <option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option>
        </select></label>
        {recipeId ? <p className={styles.text}>{values[0].title}</p> : <>
          <div className={styles.actions}>
            <label><input type="radio" name="meal-kind" checked={kind === "recipe"} onChange={() => setKind("recipe")} />Recipe</label>
            <label><input type="radio" name="meal-kind" checked={kind === "text"} onChange={() => setKind("text")} />Free text</label>
          </div>
          {kind === "recipe" ? <>
            <label>Search Recipe titles<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
            <fieldset><legend>Choose Recipe</legend>
              {values.filter((r) => r.title.toLowerCase().includes(search.toLowerCase())).map((r) => <label key={r.id} className={styles.text}>
                <input type="radio" name="meal-recipe" checked={selected === r.id} onChange={() => setSelected(r.id)} />
                {r.favorite && <span aria-label="Favorite">{"\u2605"} </span>}{r.title}
              </label>)}
              {!values.length ? <p>No Recipes yet. Choose Free text or create a Recipe first.</p>
                : !values.some((r) => r.title.toLowerCase().includes(search.toLowerCase())) && <p>No matching Recipe titles. Clear the search to see all Recipes.</p>}
            </fieldset>
          </> : <label>Meal text<textarea required value={text} onChange={(e) => setText(e.target.value)} /></label>}
        </>}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={close}>Cancel</button>
        <button type="submit" disabled={!valid || pending}>{pending ? "Adding..." : submitted ? "Retry Add to Planner" : "Add to Planner"}</button>
      </div>
    </form>}
    {!loaded && <button type="button" onClick={close}>Cancel</button>}
  </dialog>;
}
