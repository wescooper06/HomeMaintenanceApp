import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { createRecipeService } from "../../services/recipeService.js";
import { automaticShoppingCategory, createShoppingService, shoppingError } from "../../services/shoppingService.js";

import styles from "./RecipeShopping.module.css";

const recipes = createRecipeService();
const shopping = createShoppingService();

function ingredientCandidates(recipe) {
  return recipe.ingredient_sections.map((section) => ({
    name: section.name,
    rows: section.text.split(/\r\n|\r|\n/).filter((text) => /\S/u.test(text))
      .map((text) => ({ id: crypto.randomUUID(), text })),
  }));
}

export default function RecipeShopping({ recipeId, onClose, onAdded }) {
  const dialog = useRef(null);
  const locked = useRef(false);
  const submission = useRef(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([recipes.get(recipeId), shopping.categories()]).then(([recipe, categories]) => {
      if (!recipe) throw new Error("Recipe no longer exists. Close and reload Recipes.");
      if (active) {
        const groups = ingredientCandidates(recipe);
        setData({ title: recipe.title, groups, categories });
        setSelected(groups.flatMap((group) => group.rows.map((row) => row.id)));
        setError("");
      }
    }).catch((failure) => { if (active) setError(`Could not load ingredients. ${failure.message}`); });
    return () => { active = false; };
  }, [recipeId, attempt]);
  const rows = data?.groups.flatMap((group) => group.rows) || [];
  const frozen = pending || submitted;
  async function add() {
    if (locked.current || !selected.length) return;
    locked.current = true;
    setPending(true); setSubmitted(true); setError("");
    submission.current ??= rows.filter((row) => selected.includes(row.id)).map((row) => ({
      ...row, category_id: automaticShoppingCategory(row.text, data.categories),
    }));
    try {
      const count = await shopping.addSelected(submission.current);
      onAdded(count);
      onClose();
    } catch (failure) { setError(shoppingError(failure)); }
    finally { locked.current = false; setPending(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="recipe-shopping-title"
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!pending) onClose(); }
    }}>
    <h2 id="recipe-shopping-title">Add to Shopping List</h2>
    {!data ? <>
      {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry loading ingredients</button></p>
        : <p role="status">Loading ingredients...</p>}
    </> : <>
      <h3 className={styles.text}>{data.title}</h3>
      <div className={styles.actions}>
        <button type="button" disabled={frozen} onClick={() => setSelected(rows.map((row) => row.id))}>Select all</button>
        <button type="button" disabled={frozen} onClick={() => setSelected([])}>Clear all</button>
        <span role="status">{selected.length} selected</span>
      </div>
      {data.groups.map((group, index) => <fieldset key={index} disabled={frozen}>
        <legend className={styles.text}>{group.name}</legend>
        {group.rows.map((row) => <label key={row.id} className={styles.row}>
          <input type="checkbox" checked={selected.includes(row.id)} onChange={(event) =>
            setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
          <span className={styles.text}>{row.text}</span>
        </label>)}
      </fieldset>)}
      {!rows.length && <p>No nonblank ingredients are available.</p>}
      {error && <div role="alert">{error}
        <p>The attempted selection is kept for safe retry. Check <Link to="/meals/shopping">Shopping</Link> before starting a new addition if the response was uncertain.</p>
      </div>}
    </>}
    <div className={styles.actions}>
      <button type="button" disabled={pending} onClick={onClose}>Cancel</button>
      <button type="button" disabled={!data || !selected.length || pending} onClick={add}>
        {pending ? "Adding..." : submitted ? "Retry Add to List" : "Add to List"}
      </button>
    </div>
  </dialog>;
}
