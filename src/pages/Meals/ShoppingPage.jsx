import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import PageHeader from "../../components/layout/PageHeader.jsx";
import { automaticShoppingCategory, createShoppingService, orderShoppingCategories, orderShoppingItems, shoppingError } from "../../services/shoppingService.js";

import styles from "./ShoppingPage.module.css";

const service = createShoppingService();

function CategoryOptions({ categories }) {
  return <>{orderShoppingCategories(categories).map((category) =>
    <option key={category.id} value={category.id}>{category.name}</option>)}</>;
}

function ClearConfirmation({ pending, onCancel, onClear, error }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`${styles.confirm} lm-overlay-panel lm-bottom-sheet`}
    aria-labelledby="clear-shopping-title"
    onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!pending) onCancel(); }
    }}
    onClick={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
    <h2 id="clear-shopping-title">Clear Shopping List?</h2>
    <p>Remove all Shopping items? Categories are kept. Recipes are not changed.</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" className="lm-button lm-button--secondary" disabled={pending} onClick={onCancel}>Cancel</button>
      <button type="button" className="lm-button lm-button--danger" disabled={pending} onClick={onClear}>
        {pending ? "Clearing..." : "Confirm Clear List"}
      </button>
    </div>
  </dialog>;
}

function ItemActionDialog({ item, categories, mode, pending, error, retry, onMode, onCancel, onEdit, onMove, onRemove, onClearError }) {
  const ref = useRef(null);
  const [text, setText] = useState(item.text);
  const [category, setCategory] = useState(item.category_id || "");
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  function close(event) {
    if (event) event.preventDefault();
    if (!pending) onCancel();
  }
  return <dialog ref={ref} className={`${styles.itemDialog} lm-overlay-panel lm-bottom-sheet`}
    aria-labelledby="shopping-item-action-title" onCancel={close}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <h2 id="shopping-item-action-title">{mode === "menu" ? "Shopping item actions" : mode === "edit" ? "Edit item" : "Move item"}</h2>
    <p className={styles.itemActionName}>{item.text}</p>
    {mode === "menu" && <div className={styles.itemActionList}>
      <button type="button" className="lm-button lm-button--secondary" disabled={pending} onClick={() => onMode("edit")}>Edit</button>
      <button type="button" className="lm-button lm-button--secondary" disabled={pending} onClick={() => onMode("move")}>Move</button>
      <button type="button" className="lm-button lm-button--danger" disabled={pending} onClick={onRemove}>Remove</button>
    </div>}
    {mode === "edit" && <form onSubmit={(event) => { event.preventDefault(); onEdit(text); }}>
      <label className={styles.formField}>Shopping item
        <textarea className="lm-form-control" rows={3} value={text} disabled={pending}
          onChange={(event) => { setText(event.target.value); onClearError(); }} />
      </label>
      <div className={styles.actions}>
        <button type="button" className="lm-button lm-button--secondary" disabled={pending} onClick={() => onMode("menu")}>Back</button>
        <button type="submit" className="lm-button lm-button--primary" disabled={pending || !text.trim()}>
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>}
    {mode === "move" && <form onSubmit={(event) => { event.preventDefault(); onMove(category || null); }}>
      <label className={styles.formField}>Shopping Category
        <select className="lm-form-control" value={category} disabled={pending}
          onChange={(event) => { setCategory(event.target.value); onClearError(); }}>
          <option value="">Uncategorized</option>
          <CategoryOptions categories={categories} />
        </select>
      </label>
      <div className={styles.actions}>
        <button type="button" className="lm-button lm-button--secondary" disabled={pending} onClick={() => onMode("menu")}>Back</button>
        <button type="submit" className="lm-button lm-button--primary"
          disabled={pending || category === (item.category_id || "")}>
          {pending ? "Moving..." : "Move"}
        </button>
      </div>
    </form>}
    {error && <div role="alert">{error} {retry && <button type="button" className="lm-button lm-button--secondary"
      disabled={pending} onClick={retry}>Retry last action</button>}</div>}
    <button type="button" className="lm-button lm-button--quiet" disabled={pending} onClick={close}>Cancel</button>
  </dialog>;
}

export function ShoppingGroup({ name, items, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const allChecked = items.length > 0 && items.every((item) => item.checked);
  const wasComplete = useRef(allChecked);
  useEffect(() => {
    if (wasComplete.current === allChecked) return;
    wasComplete.current = allChecked;
    setCollapsed(allChecked);
  }, [allChecked]);
  const remaining = items.filter((item) => !item.checked).length;
  return <section className={`${styles.group} ${allChecked ? styles.groupComplete : ""}`} aria-label={name}>
    <h2 className={styles.categoryHeading}><button className={styles.categoryToggle} type="button"
      aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
      <span className={styles.categoryHeadingText}>
        <span className={styles.categoryName}>{name}</span>
        <span className={styles.categoryProgress}>
          {allChecked ? `Complete · ${items.length} items` : `${remaining} remaining · ${items.length} items`}
        </span>
      </span>
      <span className={styles.categoryDisclosure}>{collapsed ? "Show items" : "Hide items"}</span>
    </button></h2>
    <div hidden={collapsed}>{children}</div>
  </section>;
}

export default function ShoppingPage() {
  const { pathname } = useLocation();
  const customize = pathname.endsWith("/customize");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(() => ({ id: crypto.randomUUID(), text: "" }));
  const [manualCategory, setManualCategory] = useState("");
  const [categoryDraft, setCategoryDraft] = useState(() => ({ id: crypto.randomUUID(), name: "" }));
  const [renaming, setRenaming] = useState(null);
  const [itemAction, setItemAction] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    let live = true;
    service.load().then((value) => {
      if (live) {
        setData(value); setLoading(false); setLoadError("");
        if (attempt > 0) setMessage("Shopping reloaded. Check the persisted state before retrying.");
      }
    }, (failure) => {
      if (live) { setLoadError(shoppingError(failure)); setLoading(false); }
    });
    return () => { live = false; };
  }, [attempt]);
  async function mutate(task, apply, success) {
    if (busy.current) return false;
    busy.current = true;
    setPending(true); setError(""); setRetry(null); setMessage("");
    try {
      const value = await task();
      if (active.current) { apply(value); setMessage(success); }
      return true;
    } catch (failure) {
      if (active.current) {
        setError(shoppingError(failure));
        setRetry(() => () => mutate(task, apply, success));
      }
      return false;
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  const replaceItem = (item) => setData((value) => ({
    ...value, items: value.items.map((row) => row.id === item.id ? item : row),
  }));
  const replaceCategory = (category) => setData((value) => ({
    ...value, categories: value.categories.map((row) => row.id === category.id ? category : row),
  }));
  const header = <>
    <PageHeader id="shopping-page-title" title="Shopping" />
    <nav className="lm-tabs" aria-label="Shopping views">
      <NavLink end to="/meals/shopping" className={({ isActive }) => isActive ? "lm-tab active" : "lm-tab"}>
        Shopping List
      </NavLink>
      <NavLink to="/meals/shopping/customize" className={({ isActive }) => isActive ? "lm-tab active" : "lm-tab"}>
        Customize
      </NavLink>
    </nav>
  </>;
  if (loading) return <section className={styles.shopping}>{header}<p role="status">Loading Shopping...</p></section>;
  if (loadError) return <section className={styles.shopping}>{header}<div role="alert">{loadError} <button type="button"
    className="lm-button lm-button--secondary" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>
    Retry loading Shopping
  </button></div></section>;
  const categories = orderShoppingCategories(data.categories);
  const assigned = automaticShoppingCategory(draft.text, categories);
  const addCategory = assigned || manualCategory || null;
  function add(event) {
    event.preventDefault();
    mutate(() => service.add({ ...draft, category_id: addCategory }), (item) => {
      setData((value) => ({ ...value, items: [...value.items.filter((row) => row.id !== item.id), item] }));
      setDraft({ id: crypto.randomUUID(), text: "" });
      setManualCategory("");
    }, "Shopping item added.");
  }
  function clearList() {
    mutate(() => service.clearList(), () => {
      setData((value) => ({ ...value, items: [] })); setConfirmClear(false);
    }, "Shopping List cleared. Categories kept.");
  }
  return <section className={styles.shopping} aria-labelledby="shopping-page-title">
    {header}
    <div role="status" className={styles.status}>{message}</div>
    {error && !confirmClear && !itemAction && <div role="alert" className={styles.feedback}>
      {error} {retry && <button type="button" className="lm-button lm-button--secondary" disabled={pending}
        onClick={retry}>Retry last action</button>}
      <button type="button" className="lm-button lm-button--quiet" disabled={pending} onClick={() => {
        setError(""); setRetry(null); setLoading(true); setAttempt((value) => value + 1);
        setMessage("Reloading Shopping to check the persisted state.");
      }}>Reload Shopping</button>
    </div>}
    {customize ? <section className={styles.customize} aria-labelledby="shopping-customize-title">
      <h2 id="shopping-customize-title">Shopping Categories</h2>
      <p>Predefined categories cannot be renamed or deleted. Custom categories follow them in creation order.</p>
      <form className={styles.categoryForm} onSubmit={(event) => {
        event.preventDefault();
        mutate(() => service.createCategory(categoryDraft), (category) => {
          setData((value) => ({ ...value, categories: [...value.categories.filter((row) => row.id !== category.id), category] }));
          setCategoryDraft({ id: crypto.randomUUID(), name: "" });
        }, "Custom category created.");
      }}>
        <label className={styles.formField}>New custom category
          <input className="lm-form-control" value={categoryDraft.name} disabled={pending}
            onChange={(event) => { setCategoryDraft({ ...categoryDraft, name: event.target.value }); setError(""); setRetry(null); }} />
        </label>
        <button className="lm-button lm-button--primary" disabled={pending || !categoryDraft.name.trim()}>Create category</button>
      </form>
      <ul className={styles.categoryList}>{categories.map((category) =>
        <li key={category.id}>
          {category.predefined_order !== null ? <span>{category.name} <small>Built-in</small></span>
            : renaming?.id === category.id ? <form onSubmit={(event) => {
            event.preventDefault();
            mutate(() => service.renameCategory(renaming.id, renaming.name), (saved) => {
              replaceCategory(saved); setRenaming(null);
            }, "Custom category renamed.");
          }}>
            <label className={styles.formField}>Rename {category.name}
              <input className="lm-form-control" value={renaming.name} disabled={pending}
                onChange={(event) => { setRenaming({ ...renaming, name: event.target.value }); setError(""); setRetry(null); }} />
            </label>
            <button className="lm-button lm-button--primary" disabled={pending || !renaming.name.trim()}>Save category</button>
            <button type="button" className="lm-button lm-button--secondary" disabled={pending}
              onClick={() => setRenaming(null)}>Cancel</button>
          </form> : <>
            <span>{category.name}</span>
            <div className={styles.actions}>
              <button type="button" className="lm-button lm-button--secondary" disabled={pending}
                onClick={() => setRenaming({ id: category.id, name: category.name })}>Rename {category.name}</button>
              <button type="button" className="lm-button lm-button--danger" disabled={pending}
                onClick={() => mutate(() => service.removeCategory(category.id), () => {
                  setData((value) => ({ ...value, categories: value.categories.filter((row) => row.id !== category.id) }));
                }, "Custom category deleted.")}>Delete {category.name}</button>
            </div>
          </>}
        </li>)}
      </ul>
      {error && <p role="alert">{error} {retry && <button type="button" className="lm-button lm-button--secondary"
        disabled={pending} onClick={retry}>Retry last action</button>}</p>}
    </section> : <>
      <form onSubmit={add} className={styles.add}>
        <label className={`${styles.formField} ${styles.addName}`}>Add item
          <input className="lm-form-control" value={draft.text} disabled={pending}
            onChange={(event) => { setDraft({ ...draft, text: event.target.value }); setError(""); setRetry(null); }} />
        </label>
        {assigned ? <p className={styles.assignment}>Automatic category: <strong>
          {categories.find((category) => category.id === assigned)?.name ?? "Uncategorized"}
        </strong></p> : <label className={`${styles.formField} ${styles.addCategory}`}>Category
          <select className="lm-form-control" value={manualCategory} disabled={pending}
            onChange={(event) => setManualCategory(event.target.value)}>
            <option value="">Uncategorized</option><CategoryOptions categories={categories} />
          </select>
        </label>}
        <button className="lm-button lm-button--primary" disabled={pending || !draft.text.trim()}>Add item</button>
      </form>
      <div className={styles.listActions}>
        <button type="button" className="lm-button lm-button--secondary"
          disabled={pending || !data.items.some((item) => item.checked)} onClick={() => mutate(
            () => service.clearChecked(), () => setData((value) => ({
              ...value, items: value.items.filter((item) => !item.checked),
            })), "Checked Shopping items cleared.")}>Clear Checked</button>
        <button type="button" className="lm-button lm-button--danger" disabled={pending || !data.items.length}
          onClick={() => { setError(""); setRetry(null); setConfirmClear(true); }}>Clear List</button>
      </div>
      {!data.items.length && <p className="lm-empty-state">Your Shopping List is empty. Add an item above.</p>}
      <div className={styles.categoryGroups}>
        {[...categories, { id: null, name: "Uncategorized" }].map((category) => {
          const items = orderShoppingItems(data.items.filter((item) => item.category_id === category.id));
          return items.length > 0 && <ShoppingGroup key={category.id ?? "unassigned"} name={category.name} items={items}>
            <ul className={styles.items}>{items.map((item) => <li key={item.id}
              className={`${styles.itemRow} ${item.checked ? styles.checked : ""}`}>
              <label className={styles.check}>
                <input className="lm-checkbox" type="checkbox" checked={item.checked} disabled={pending}
                  aria-label={`Purchased ${item.text}`} onChange={(event) => {
                    const checked = event.target.checked;
                    mutate(() => service.check(item.id, checked), replaceItem, "Purchased state saved.");
                  }} />
                <span className={styles.itemText}>{item.text}</span>
              </label>
              <button type="button" className={`${styles.itemActionButton} lm-button lm-button--quiet`}
                disabled={pending}
                aria-haspopup="dialog" aria-label={`Actions for ${item.text}`} onClick={() => {
                  setError(""); setRetry(null); setItemAction({ item, mode: "menu" });
                }}>Item Actions</button>
            </li>)}</ul>
          </ShoppingGroup>;
        })}
      </div>
    </>}
    {itemAction && <ItemActionDialog item={itemAction.item} categories={categories} mode={itemAction.mode}
      pending={pending} error={error} retry={retry}
      onMode={(mode) => { setError(""); setItemAction((current) => ({ ...current, mode })); }}
      onCancel={() => { setItemAction(null); setError(""); setRetry(null); }}
      onClearError={() => { setError(""); setRetry(null); }}
      onEdit={(text) => mutate(() => service.edit(itemAction.item.id, text), (item) => {
        replaceItem(item); setItemAction(null);
      }, "Shopping item saved.")}
      onMove={(category) => mutate(() => service.categorize(itemAction.item.id, category), (item) => {
        replaceItem(item); setItemAction(null);
      }, "Shopping category saved.")}
      onRemove={() => mutate(() => service.remove(itemAction.item.id), () => {
        setData((value) => ({ ...value, items: value.items.filter((row) => row.id !== itemAction.item.id) }));
        setItemAction(null);
      }, "Shopping item removed.")} />}
    {confirmClear && <ClearConfirmation pending={pending} error={error} onCancel={() => {
      setConfirmClear(false); setError(""); setRetry(null);
    }} onClear={clearList} />}
  </section>;
}
