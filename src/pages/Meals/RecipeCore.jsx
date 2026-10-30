import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";

import { createRecipeService, newRecipe, newRecipeFilters, recipeMatches, recipeSourceUrl, sortRecipes } from "../../services/recipeService.js";

import styles from "./MealsPage.module.css";
import RecipeShopping from "./RecipeShopping.jsx";

const service = createRecipeService();

function instructionLines(text) {
  return text.split(/\r\n|\r|\n/).filter((line) => /\S/u.test(line));
}

function ingredientPasteText(text) {
  return instructionLines(text).join("\n");
}

function ErrorMessage({ error, retry, retryLabel = "Retry" }) {
  return error ? <div role="alert" className={styles.error}>{error} {retry && <button type="button" onClick={retry}>{retryLabel}</button>}</div> : null;
}

function useRecipeLoad(load, dependencies) {
  const [state, setState] = useState({ key: null, loading: true, data: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...dependencies, attempt]);
  useEffect(() => {
    let active = true;
    load().then((data) => {
      if (active) setState({ key, loading: false, data, error: "" });
    }, (error) => {
      if (active) setState({ key, loading: false, data: null, error: error.message });
    });
    return () => { active = false; };
    // Callers supply only the stable identity dependencies of their loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ...(state.key === key ? state : { loading: true, data: null, error: "" }),
    retry: () => setAttempt((n) => n + 1), setState };
}

function Favorite({ recipe, onChange, pending }) {
  return <button type="button" disabled={pending} aria-label={`Favorite ${recipe.title}`}
    aria-pressed={recipe.favorite} onClick={(event) => { event.stopPropagation(); onChange(recipe); }}>
    <span aria-hidden="true">{recipe.favorite ? "\u2605" : "\u2606"}</span>{" "}
    {recipe.favorite ? "Unfavorite" : "Favorite"}
  </button>;
}

function Source({ source }) {
  const url = recipeSourceUrl(source);
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{source}</a>
    : <span className={styles.preserved}>{source}</span>;
}

function Modal({ titleId, onCancel, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={styles.confirm}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>{children}</dialog>;
}

function DeleteConfirmation({ count, pending, onCancel, onDelete, error }) {
  return <Modal titleId="delete-recipes-title" onCancel={() => { if (!pending) onCancel(); }}>
    <h3 id="delete-recipes-title">Delete {count === 1 ? "Recipe" : `${count} Recipes`}?</h3>
    <p>This permanently deletes the selected Recipes. Category and Cuisine values are kept.</p>
    <ErrorMessage error={error} />
    <button type="button" disabled={pending} onClick={onCancel}>Cancel deletion</button>
    <button type="button" disabled={pending} onClick={onDelete}>{pending ? "Deleting..." : "Confirm delete"}</button>
  </Modal>;
}

function ClassificationFilter({ label, values, selected, onChange }) {
  const names = values.filter((value) => selected.includes(value.id)).map((value) => value.name);
  return <details className={styles.multiSelect}>
    <summary>{label}: {names.length ? `${names.length} selected - ${names.join(", ")}` : "All"}</summary>
    <div role="group" aria-label={`Filter Recipes by ${label}`}>
      {values.length ? values.map((value) => <label key={value.id}>
        <input type="checkbox" checked={selected.includes(value.id)} onChange={(event) =>
          onChange(event.target.checked ? [...selected, value.id] : selected.filter((id) => id !== value.id))} />
        {value.name}
      </label>) : <p>No {label === "Category" ? "Categories" : "Cuisines"} available.</p>}
    </div>
  </details>;
}

export function RecipeLibrary({ filters, setFilters }) {
  const navigate = useNavigate();
  const loaded = useRecipeLoad(async () => {
    const [recipes, categories, cuisines] = await Promise.all([service.list(), service.categories.list(), service.cuisines.list()]);
    return { recipes, categories, cuisines };
  }, []);
  useEffect(() => {
    if (!loaded.data) return;
    setFilters((current) => {
      const categoryIds = current.categoryIds.filter((id) => loaded.data.categories.some((value) => value.id === id));
      const cuisineIds = current.cuisineIds.filter((id) => loaded.data.cuisines.some((value) => value.id === id));
      return categoryIds.length === current.categoryIds.length && cuisineIds.length === current.cuisineIds.length
        ? current : { ...current, categoryIds, cuisineIds };
    });
  }, [loaded.data, setFilters]);
  const [sort, setSort] = useState({ key: "title", direction: 1 });
  const [selected, setSelected] = useState([]);
  const [shoppingRecipe, setShoppingRecipe] = useState(null);
  const [shoppingMessage, setShoppingMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  function changeFilter(key, value) { setFilters((old) => ({ ...old, [key]: value })); setSelected([]); }
  async function mutate(action) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try { await action(); } catch (failure) { setError(`${failure.message} The change was not confirmed. You can retry.`); }
    finally { lock.current = false; setBusy(false); }
  }
  function favorite(recipe) {
    mutate(async () => {
      const updated = await service.favorite(recipe.id, !recipe.favorite);
      loaded.setState((old) => ({ ...old, data: { ...old.data, recipes: old.data.recipes.map((r) => r.id === recipe.id ? updated : r) } }));
    });
  }
  function remove() {
    mutate(async () => {
      const deleted = await service.remove(selected);
      loaded.setState((old) => ({ ...old, data: { ...old.data, recipes: old.data.recipes.filter((r) => !deleted.includes(r.id)) } }));
      setSelected([]); setConfirm(false);
    });
  }
  const data = loaded.data;
  const visible = data ? sortRecipes(data.recipes.filter((r) => recipeMatches(r, filters)),
    sort.key, sort.direction, data.categories, data.cuisines) : [];
  function toggle(id) { setSelected((old) => old.includes(id) ? old.filter((v) => v !== id) : [...old, id]); }
  function heading(key, label) {
    return <th scope="col" aria-sort={sort.key === key ? sort.direction === 1 ? "ascending" : "descending" : "none"}>
      <button type="button" onClick={() => setSort((old) => ({ key, direction: old.key === key ? -old.direction : 1 }))}>{label}</button>
    </th>;
  }
  return <section className={styles.panel} aria-labelledby="recipes-title">
    <div className={styles.actions}><h2 id="recipes-title">Recipes</h2>
      <Link className={styles.desktopOnly} to="/meals/recipes/new">Add Recipe</Link>
      <details className={styles.mobileOnly}><summary>+ Add</summary><Link to="/meals/recipes/new">Create manually</Link></details>
    </div>
    {loaded.loading ? <p role="status">Loading Recipes...</p> : loaded.error
      ? <ErrorMessage error={loaded.error} retry={loaded.retry} /> : <>
        <div className={styles.filters}>
          <label>Search Recipes<input type="search" value={filters.search} onChange={(e) => changeFilter("search", e.target.value)} /></label>
          <ClassificationFilter label="Category" values={data.categories} selected={filters.categoryIds}
            onChange={(ids) => changeFilter("categoryIds", ids)} />
          <ClassificationFilter label="Cuisine" values={data.cuisines} selected={filters.cuisineIds}
            onChange={(ids) => changeFilter("cuisineIds", ids)} />
          <label><input type="checkbox" checked={filters.favorites} onChange={(e) => changeFilter("favorites", e.target.checked)} />Favorites only</label>
          <button type="button" onClick={() => { setFilters(newRecipeFilters()); setSelected([]); }}>Clear search and filters</button>
        </div>
        <div className={styles.actions}><span>{selected.length} selected</span>
          <button type="button" disabled={!selected.length || busy} onClick={() => setConfirm(true)}>Delete selected</button>
          <button type="button" disabled={selected.length !== 1 || busy} onClick={() => {
            setShoppingMessage(""); setShoppingRecipe(selected[0]);
          }}>Add to Shopping List</button>
        </div>
        {shoppingMessage && <p role="status">{shoppingMessage} <Link to="/meals/shopping">View Shopping List</Link></p>}
        {shoppingRecipe && <RecipeShopping recipeId={shoppingRecipe} onClose={() => setShoppingRecipe(null)}
          onAdded={(count) => setShoppingMessage(`${count} ingredients added to Shopping List.`)} />}
        {!confirm && <ErrorMessage error={error} retryLabel="Reload Recipes" retry={() => {
          setSelected([]); setError(""); loaded.retry();
        }} />}
        {!data.recipes.length ? <p>No Recipes yet. <Link to="/meals/recipes/new">Add Recipe</Link></p>
          : !visible.length ? <p>No Recipes match the current criteria. Clear search and filters to see more.</p> : <>
            <table className={styles.recipeTable}><thead><tr><th scope="col">Select</th><th scope="col">Favorite</th>
              {heading("title", "Name")}{heading("category", "Category")}{heading("cuisine", "Cuisine")}{heading("source", "Source")}
            </tr></thead><tbody>{visible.map((recipe) => <tr key={recipe.id} onClick={() => { if (!busy) navigate(`/meals/recipes/${recipe.id}`); }}>
              <td><input aria-label={`Select ${recipe.title}`} type="checkbox" disabled={busy} checked={selected.includes(recipe.id)}
                onClick={(e) => e.stopPropagation()} onChange={() => toggle(recipe.id)} /></td>
              <td><Favorite recipe={recipe} onChange={favorite} pending={busy} /></td>
              <td><Link className={styles.preserved} to={`/meals/recipes/${recipe.id}`} onClick={(e) => e.stopPropagation()}>{recipe.title}</Link></td>
              <td>{data.categories.find((v) => v.id === recipe.category_id)?.name}</td>
              <td>{data.cuisines.find((v) => v.id === recipe.cuisine_id)?.name}</td>
              <td className={styles.preserved}>{recipe.source}</td>
            </tr>)}</tbody></table>
            <ul className={styles.mobileList}>{visible.map((recipe) => <li key={recipe.id}
              onClick={() => { if (!busy) navigate(`/meals/recipes/${recipe.id}`); }}>
              <input aria-label={`Select ${recipe.title}`} type="checkbox" disabled={busy} checked={selected.includes(recipe.id)}
                onClick={(event) => event.stopPropagation()} onChange={() => toggle(recipe.id)} />
              <div><Link className={styles.preserved} to={`/meals/recipes/${recipe.id}`} onClick={(event) => event.stopPropagation()}>{recipe.title}</Link>
                <small>{[data.categories.find((v) => v.id === recipe.category_id)?.name,
                  data.cuisines.find((v) => v.id === recipe.cuisine_id)?.name].filter(Boolean).join(" / ")}</small></div>
              <Favorite recipe={recipe} onChange={favorite} pending={busy} />
            </li>)}</ul>
          </>}
        {confirm && <DeleteConfirmation count={selected.length} pending={busy} error={error} onCancel={() => setConfirm(false)} onDelete={remove} />}
      </>}
  </section>;
}

function Classification({ kind, label, values, value, onSelect, onChange, onBusy }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  async function act(operation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    try {
      if (operation === "create") {
        const created = await service[kind].create(name);
        onChange([...values, created]); onSelect(created.id);
      } else if (operation === "rename") {
        const updated = await service[kind].rename(value, name);
        onChange(values.map((v) => v.id === value ? updated : v));
      } else {
        await service[kind].remove(value);
        onChange(values.filter((v) => v.id !== value)); onSelect(null);
      }
      setName("");
    } catch (failure) {
      setError(operation === "remove" && failure.code === "23503"
        ? `Cannot delete this ${label} because it is used by a Recipe. Reassign Recipes using it, then try again.`
        : `${failure.message} No classification change was confirmed; retry when ready.`);
    }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <fieldset className={styles.classification} disabled={busy}><legend>{label}</legend>
    <label>Select {label}<select value={value || ""} onChange={(e) => { setError(""); onSelect(e.target.value || null); }}>
      <option value="">None</option>{values.map((v) => <option value={v.id} key={v.id}>{v.name}</option>)}
    </select></label>
    <label>{label} name<input value={name} onChange={(e) => { setError(""); setName(e.target.value); }} /></label>
    <div className={styles.actions}>
      <button type="button" disabled={!name.trim()} onClick={() => act("create")}>Create {label}</button>
      <button type="button" disabled={!value || !name.trim()} onClick={() => act("rename")}>Rename {label}</button>
      <button type="button" disabled={!value} onClick={() => act("remove")}>Delete unused {label}</button>
    </div>
    <ErrorMessage error={error} />
    <small>Classification changes save immediately. Referenced values cannot be deleted.</small>
  </fieldset>;
}

function EditorForm({ initial, categories: initialCategories, cuisines: initialCuisines, edit }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => ({ ...initial,
    ingredient_sections: initial.ingredient_sections.map((s) => ({ ...s })) }));
  const [categories, setCategories] = useState(initialCategories);
  const [cuisines, setCuisines] = useState(initialCuisines);
  const [busy, setBusy] = useState(false);
  const [classificationBusy, setClassificationBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const saved = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const blocker = useBlocker(() => !saved.current && (dirty || lock.current || classificationBusy));
  useEffect(() => {
    if (!dirty && !busy && !classificationBusy) return undefined;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy, classificationBusy]);
  function field(key, value) { setDraft((old) => ({ ...old, [key]: value })); }
  function section(index, key, value) {
    field("ingredient_sections", draft.ingredient_sections.map((s, i) => i === index ? { ...s, [key]: value } : s));
  }
  function pasteIngredients(event, index) {
    const text = ingredientPasteText(event.clipboardData.getData("text/plain"));
    event.preventDefault();
    if (!text) return;
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    // insertText retains the browser undo entry; setRangeText covers browsers without it.
    if (!textarea.ownerDocument.execCommand?.("insertText", false, text)) {
      textarea.setRangeText(text, start, end, "end");
    }
    section(index, "text", textarea.value);
    textarea.setSelectionRange(start + text.length, start + text.length);
  }
  async function save(event) {
    event.preventDefault();
    if (lock.current || classificationBusy) return;
    if (!draft.title.trim()) { setError("Recipe Title is required."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const persisted = edit ? await service.update(initial.id, draft) : await service.create(draft);
      saved.current = true;
      navigate(`/meals/recipes/${persisted.id}`, { replace: true });
    } catch (failure) { setError(`Recipe was not saved. ${failure.message} Your entries are preserved; retry Save.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <form onSubmit={save} className={styles.editor}>
      <fieldset disabled={busy || classificationBusy}><legend>Recipe fields</legend>
        <label>Title<input required value={draft.title} onChange={(e) => field("title", e.target.value)} /></label>
        <label>Source<input value={draft.source} onChange={(e) => field("source", e.target.value)} /></label>
        <label><input type="checkbox" checked={draft.favorite} onChange={(e) => field("favorite", e.target.checked)} />Favorite</label>
        <Classification kind="categories" label="Category" values={categories} value={draft.category_id}
          onChange={setCategories} onSelect={(value) => field("category_id", value)} onBusy={setClassificationBusy} />
        <Classification kind="cuisines" label="Cuisine" values={cuisines} value={draft.cuisine_id}
          onChange={setCuisines} onSelect={(value) => field("cuisine_id", value)} onBusy={setClassificationBusy} />
        <h3>Ingredients</h3>
        {draft.ingredient_sections.map((s, index) => <fieldset key={index}><legend>Ingredient section {index + 1}</legend>
          <label>Section name<input value={s.name} onChange={(e) => section(index, "name", e.target.value)} /></label>
          <label>Ingredient text<textarea rows={6} value={s.text} onChange={(e) => section(index, "text", e.target.value)}
            onPaste={(event) => pasteIngredients(event, index)} /></label>
          <button type="button" onClick={() => field("ingredient_sections", draft.ingredient_sections.filter((_, i) => i !== index))}>Remove section {index + 1}</button>
        </fieldset>)}
        <button type="button" onClick={() => field("ingredient_sections", [...draft.ingredient_sections, { name: "", text: "" }])}>Add ingredient section</button>
        <label>Instructions<textarea rows={10} value={draft.instructions} onChange={(e) => field("instructions", e.target.value)} /></label>
        <div className={styles.actions}><button type="submit">{busy ? "Saving..." : "Save Recipe"}</button>
          <button type="button" onClick={() => navigate(edit ? `/meals/recipes/${initial.id}` : "/meals/recipes")}>Cancel</button></div>
      </fieldset>
      <ErrorMessage error={error} />
    </form>
    {blocker.state === "blocked" && <Modal titleId="discard-title" onCancel={() => blocker.reset()}>
      <h3 id="discard-title">{busy || classificationBusy ? "Recipe save is in progress" : "Discard unsaved Recipe changes?"}</h3>
      <button type="button" onClick={() => blocker.reset()}>Stay in editor</button>
      <button type="button" disabled={busy || classificationBusy} onClick={() => blocker.proceed()}>Discard changes</button>
    </Modal>}
  </>;
}

export function RecipeEditor({ edit = false }) {
  const { id } = useParams();
  const loaded = useRecipeLoad(async () => {
    const [recipe, categories, cuisines] = await Promise.all([
      edit ? service.get(id) : Promise.resolve(newRecipe()), service.categories.list(), service.cuisines.list(),
    ]);
    return { recipe, categories, cuisines };
  }, [id, edit]);
  return <section className={styles.panel}>
    <h2>{edit ? "Edit Recipe" : "Add Recipe"}</h2>
    {loaded.loading ? <p role="status">Loading Recipe editor...</p> : loaded.error
      ? <ErrorMessage error={loaded.error} retry={loaded.retry} /> : !loaded.data.recipe
        ? <p>Recipe not found. <Link to="/meals/recipes">Return to Recipes</Link></p>
        : <EditorForm key={loaded.data.recipe.id} initial={loaded.data.recipe}
          categories={loaded.data.categories} cuisines={loaded.data.cuisines} edit={edit} />}
  </section>;
}

export function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const loaded = useRecipeLoad(async () => {
    const [recipe, categories, cuisines] = await Promise.all([service.get(id), service.categories.list(), service.cuisines.list()]);
    return { recipe, categories, cuisines };
  }, [id]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingMessage, setShoppingMessage] = useState("");
  async function mutate(remove) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (remove) { await service.remove([id]); navigate("/meals/recipes", { replace: true }); }
      else {
        const updated = await service.favorite(id, !loaded.data.recipe.favorite);
        loaded.setState((old) => ({ ...old, data: { ...old.data, recipe: updated } }));
      }
    } catch (failure) { setError(`${failure.message} The change was not confirmed. Retry when ready.`); }
    finally { lock.current = false; setBusy(false); }
  }
  const recipe = loaded.data?.recipe;
  const steps = recipe ? instructionLines(recipe.instructions) : [];
  return <section className={styles.panel}>
    <h2>Recipe Detail</h2>
    {loaded.loading ? <p role="status">Loading Recipe...</p> : loaded.error
      ? <ErrorMessage error={loaded.error} retry={loaded.retry} /> : !recipe
        ? <p>Recipe not found. <Link to="/meals/recipes">Return to Recipes</Link></p> : <>
          <h3 className={styles.preserved}>{recipe.title}</h3>
          <p>{[loaded.data.categories.find((v) => v.id === recipe.category_id)?.name,
            loaded.data.cuisines.find((v) => v.id === recipe.cuisine_id)?.name].filter(Boolean).join(" / ")}</p>
          {recipe.source && <p>Source: <Source source={recipe.source} /></p>}
          <div className={styles.actions}>
            <Favorite recipe={recipe} pending={busy} onChange={() => mutate(false)} />
            <Link to={`/meals/recipes/${id}/edit`} aria-disabled={busy} onClick={(event) => { if (busy) event.preventDefault(); }}>Edit Recipe</Link>
            <button type="button" disabled={busy} onClick={() => setConfirm(true)}>Delete Recipe</button>
            <button type="button" disabled={busy} onClick={() => { setShoppingMessage(""); setShoppingOpen(true); }}>Add to Shopping List</button>
            <button type="button" disabled>Plan Meal (not available yet)</button>
            <Link to="/meals/recipes">Back to Recipes</Link>
          </div>
          <ErrorMessage error={error} />
          {shoppingMessage && <p role="status">{shoppingMessage} <Link to="/meals/shopping">View Shopping List</Link></p>}
          {shoppingOpen && <RecipeShopping key={id} recipeId={id} onClose={() => setShoppingOpen(false)}
            onAdded={(count) => setShoppingMessage(`${count} ingredients added to Shopping List.`)} />}
          {recipe.ingredient_sections.map((section, index) => <section key={index}>
            <h3 className={styles.preserved}>{section.name}</h3><div className={styles.preserved}>{section.text}</div>
          </section>)}
          <h3>Instructions</h3>
          {steps.length ? <ol className={styles.instructions}>
            {steps.map((step, index) => <li key={index} className={styles.preserved}>{step}</li>)}
          </ol> : <p>No instructions provided.</p>}
          {confirm && <DeleteConfirmation count={1} pending={busy} error={error} onCancel={() => setConfirm(false)} onDelete={() => mutate(true)} />}
        </>}
  </section>;
}
