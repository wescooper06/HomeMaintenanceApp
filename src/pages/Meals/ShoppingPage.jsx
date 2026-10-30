import { useEffect, useRef, useState } from "react";

import { automaticShoppingCategory, createShoppingService, orderShoppingCategories, orderShoppingItems, shoppingError } from "../../services/shoppingService.js";

import styles from "./ShoppingPage.module.css";

const service = createShoppingService();

function CategoryOptions({ categories }) {
  return <><option value="">Uncategorized</option>{orderShoppingCategories(categories).map((category) =>
    <option key={category.id} value={category.id}>{category.name}</option>)}</>;
}

function ClearConfirmation({ pending, onCancel, onClear, error }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={styles.confirm} aria-labelledby="clear-shopping-title"
    onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!pending) onCancel(); }
    }}>
    <h3 id="clear-shopping-title">Clear Shopping List?</h3>
    <p>Remove all Shopping items? Predefined and custom categories are kept. Recipes are not changed.</p>
    {error && <p role="alert">{error}</p>}
    <button disabled={pending} onClick={onCancel}>Cancel</button>
    <button disabled={pending} onClick={onClear}>{pending ? "Clearing..." : "Confirm Clear List"}</button>
  </dialog>;
}

export function ShoppingGroup({ name, items, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const allChecked = items.length > 0 && items.every((item) => item.checked);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 40rem)");
    function sync() { setCollapsed(media.matches && allChecked); }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [allChecked]);
  return <section className={styles.group} aria-label={name}>
    <h3><button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
      {name} ({items.length}) {collapsed ? "- Show" : "- Hide"}
    </button></h3>
    <div hidden={collapsed}>{children}</div>
  </section>;
}

export default function ShoppingPage() {
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
  const [editing, setEditing] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState(() => ({ id: crypto.randomUUID(), name: "" }));
  const [renaming, setRenaming] = useState(null);
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
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError(""); setRetry(null); setMessage("");
    try {
      const value = await task();
      if (active.current) { apply(value); setMessage(success); }
    } catch (failure) {
      if (active.current) {
        setError(shoppingError(failure));
        setRetry(() => () => mutate(task, apply, success));
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  const replaceItem = (item) => setData((value) => ({ ...value, items: value.items.map((row) => row.id === item.id ? item : row) }));
  const replaceCategory = (category) => setData((value) => ({ ...value,
    categories: value.categories.map((row) => row.id === category.id ? category : row) }));
  if (loading) return <p role="status">Loading Shopping...</p>;
  if (loadError) return <div role="alert">{loadError} <button onClick={() => {
    setLoading(true); setAttempt((value) => value + 1);
  }}>Retry loading Shopping</button></div>;
  const categories = orderShoppingCategories(data.categories);
  const assigned = automaticShoppingCategory(draft.text, categories);
  function add(event) {
    event.preventDefault();
    mutate(() => service.add({ ...draft, category_id: assigned }), (item) => {
      setData((value) => ({ ...value, items: [...value.items.filter((row) => row.id !== item.id), item] }));
      setDraft({ id: crypto.randomUUID(), text: "" });
    }, "Shopping item added.");
  }
  function clearList() {
    mutate(() => service.clearList(), () => {
      setData((value) => ({ ...value, items: [] })); setEditing(null); setConfirmClear(false);
    }, "Shopping List cleared. Categories kept.");
  }
  return <section className={styles.shopping} aria-labelledby="shopping-title">
    <h2 id="shopping-title">Shopping List</h2>
    <p role="status">{message}</p>
    {error && !confirmClear && <div role="alert">{error} {retry && <button disabled={pending} onClick={retry}>Retry last action</button>}
      <button disabled={pending} onClick={() => {
        setError(""); setRetry(null); setLoading(true); setAttempt((value) => value + 1);
        setMessage("Reloading Shopping to check the persisted state.");
      }}>Reload Shopping</button>
    </div>}
    <form onSubmit={add} className={styles.add}>
      <label>New Shopping item<input value={draft.text} disabled={pending}
        onChange={(event) => { setDraft({ ...draft, text: event.target.value }); setError(""); setRetry(null); }} /></label>
      <p>Automatic category: <strong>{categories.find((category) => category.id === assigned)?.name ?? "Uncategorized"}</strong></p>
      <button disabled={pending || !draft.text.trim()}>Add item</button>
    </form>
    <div className={styles.actions}>
      <button disabled={pending || !data.items.some((item) => item.checked)} onClick={() => mutate(
        () => service.clearChecked(), () => {
          setData((value) => ({ ...value, items: value.items.filter((item) => !item.checked) }));
          setEditing(null);
        }, "Checked Shopping items cleared.")}>Clear Checked</button>
      <button disabled={pending || !data.items.length} onClick={() => { setError(""); setRetry(null); setConfirmClear(true); }}>Clear List</button>
    </div>
    {!data.items.length && <p>Your Shopping List is empty. Add an item above.</p>}
    {[...categories, { id: null, name: "Uncategorized" }].map((category) => {
      const items = orderShoppingItems(data.items.filter((item) => item.category_id === category.id));
      return items.length > 0 && <ShoppingGroup key={category.id ?? "unassigned"} name={category.name} items={items}>
        <ul className={styles.items}>{items.map((item) => <li key={item.id} className={item.checked ? styles.checked : undefined}>
          <label className={styles.check}><input type="checkbox" checked={item.checked} disabled={pending}
            aria-label={`Purchased ${item.text}`} onChange={(event) => {
              const checked = event.target.checked;
              mutate(() => service.check(item.id, checked), replaceItem, "Purchased state saved.");
            }} />
          <span className={styles.itemText}>{item.text}</span></label>
          <div className={styles.actions}>
            <label>Category<select aria-label={`Category for ${item.text}`} disabled={pending} value={item.category_id ?? ""}
              onChange={(event) => {
                const next = event.target.value || null;
                mutate(() => service.categorize(item.id, next), replaceItem, "Shopping category saved.");
              }}><CategoryOptions categories={categories} /></select></label>
            <button aria-label={`Edit ${item.text}`} disabled={pending} onClick={() => setEditing({ id: item.id, text: item.text })}>Edit</button>
            <button aria-label={`Remove ${item.text}`} disabled={pending} onClick={() => mutate(() => service.remove(item.id), () => {
              setData((value) => ({ ...value, items: value.items.filter((row) => row.id !== item.id) }));
              if (editing?.id === item.id) setEditing(null);
            }, "Shopping item removed.")}>Remove</button>
          </div>
        </li>)}</ul>
      </ShoppingGroup>;
    })}
    {editing && <form className={styles.edit} onSubmit={(event) => {
      event.preventDefault();
      mutate(() => service.edit(editing.id, editing.text), (item) => { replaceItem(item); setEditing(null); }, "Shopping item saved.");
    }}>
      <label>Edit Shopping item<textarea value={editing.text} disabled={pending}
        onChange={(event) => { setEditing({ ...editing, text: event.target.value }); setRetry(null); setError(""); }} /></label>
      <button disabled={pending || !editing.text.trim()}>Save item</button>
      <button type="button" disabled={pending} onClick={() => setEditing(null)}>Cancel item edit</button>
    </form>}
    <details className={styles.categories}>
      <summary>Manage Shopping categories</summary>
      <p>Predefined categories cannot be renamed or deleted. Custom categories follow them in creation order.</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        mutate(() => service.createCategory(categoryDraft), (category) => {
          setData((value) => ({ ...value, categories: [...value.categories.filter((row) => row.id !== category.id), category] }));
          setCategoryDraft({ id: crypto.randomUUID(), name: "" });
        }, "Custom category created.");
      }}>
        <label>New custom category<input value={categoryDraft.name} disabled={pending}
          onChange={(event) => { setCategoryDraft({ ...categoryDraft, name: event.target.value }); setError(""); setRetry(null); }} /></label>
        <button disabled={pending || !categoryDraft.name.trim()}>Create category</button>
      </form>
      <ul>{categories.filter((category) => category.predefined_order === null).map((category) => <li key={category.id}>
        {category.name} <button disabled={pending} onClick={() => setRenaming({ id: category.id, name: category.name })}>Rename {category.name}</button>
        <button disabled={pending} onClick={() => mutate(() => service.removeCategory(category.id), () => {
          setData((value) => ({ ...value, categories: value.categories.filter((row) => row.id !== category.id) }));
          if (renaming?.id === category.id) setRenaming(null);
        }, "Custom category deleted.")}>Delete {category.name}</button>
      </li>)}</ul>
      {renaming && <form onSubmit={(event) => {
        event.preventDefault();
        mutate(() => service.renameCategory(renaming.id, renaming.name), (category) => {
          replaceCategory(category); setRenaming(null);
        }, "Custom category renamed.");
      }}>
        <label>Rename custom category<input value={renaming.name} disabled={pending}
          onChange={(event) => { setRenaming({ ...renaming, name: event.target.value }); setError(""); setRetry(null); }} /></label>
        <button disabled={pending || !renaming.name.trim()}>Save category</button>
        <button type="button" disabled={pending} onClick={() => setRenaming(null)}>Cancel category rename</button>
      </form>}
    </details>
    {confirmClear && <ClearConfirmation pending={pending} error={error} onCancel={() => {
      setConfirmClear(false); setError(""); setRetry(null);
    }} onClear={clearList} />}
  </section>;
}
