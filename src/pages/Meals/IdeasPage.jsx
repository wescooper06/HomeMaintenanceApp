import { useEffect, useRef, useState } from "react";

import PageHeader from "../../components/layout/PageHeader.jsx";
import { createMealsIdeasService, ideasError, newIdea, orderIdeas } from "../../services/mealsIdeasService.js";

import styles from "./IdeasPage.module.css";

const service = createMealsIdeasService();

export default function IdeasPage() {
  const [ideas, setIdeas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState(newIdea);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const addInput = useRef(null);
  const checkboxes = useRef(new Map());

  useEffect(() => {
    let active = true;
    service.load().then((rows) => {
      if (active) setIdeas(orderIdeas(rows));
    }).catch((failure) => {
      if (active) {
        setIdeas(null);
        setLoadError(ideasError(failure));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  async function mutate(operation) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (failure) {
      setError(failure.code || failure instanceof TypeError ? ideasError(failure) : failure.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function add(event) {
    event.preventDefault();
    if (!draft.text.trim()) {
      setError("Enter nonblank Idea text.");
      setNotice("");
      addInput.current?.focus();
      return;
    }
    await mutate(async () => {
      const created = await service.create(draft);
      setIdeas((current) => orderIdeas([...current, created]));
      setDraft(newIdea());
      setNotice("Idea added.");
      addInput.current?.focus();
    });
  }

  async function changeChecked(idea, checked) {
    await mutate(async () => {
      const updated = await service.check(idea.id, checked);
      if (updated.id !== idea.id || updated.checked !== checked || updated.position !== idea.position) {
        const failure = new Error("Idea status change was not confirmed. Reload before retrying.");
        failure.code = "CONFLICT";
        throw failure;
      }
      setIdeas((current) => current.map((item) => item.id === idea.id ? updated : item));
    });
  }

  async function move(idea, index, direction) {
    const neighbor = index + direction;
    if (neighbor < 0 || neighbor >= ideas.length) return;
    const expected = ideas.map((item) => item.id);
    [expected[index], expected[neighbor]] = [expected[neighbor], expected[index]];
    await mutate(async () => {
      const result = await service.move(idea.id, direction);
      const ordered = orderIdeas(result.items);
      if (!result.moved || ordered.length !== expected.length
        || ordered.some((item, position) => item.id !== expected[position])) {
        const failure = new Error("Idea move was not confirmed as one adjacent position. Reload before retrying.");
        failure.code = "CONFLICT";
        throw failure;
      }
      const positions = new Map(ordered.map((item) => [item.id, item]));
      setIdeas((current) => orderIdeas(current.map((item) => ({ ...item, ...positions.get(item.id) }))));
      requestAnimationFrame(() => checkboxes.current.get(idea.id)?.focus());
    });
  }

  async function remove(idea, index) {
    const focusId = ideas[index + 1]?.id ?? ideas[index - 1]?.id;
    await mutate(async () => {
      await service.remove(idea.id);
      setIdeas((current) => current.filter((item) => item.id !== idea.id));
      requestAnimationFrame(() => {
        if (focusId) checkboxes.current.get(focusId)?.focus();
        else addInput.current?.focus();
      });
    });
  }

  function retryLoad() {
    setLoadError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  return <section className={styles.page} aria-labelledby="ideas-title">
    <PageHeader id="ideas-title" title="Ideas" />
    <form className={styles.addForm} onSubmit={add}>
      <label htmlFor="ideas-entry">Idea
        <input id="ideas-entry" ref={addInput} className="lm-form-control" type="text"
          aria-label="Add idea" value={draft.text} disabled={pending || loading || Boolean(loadError)}
          onChange={(event) => {
            setDraft((current) => ({ ...current, text: event.target.value }));
            setError("");
            setNotice("");
          }} />
      </label>
      <button type="submit" className="lm-button lm-button--primary"
        disabled={pending || loading || Boolean(loadError)}>
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Loading Ideas...</p>}
    {!loading && loadError && <>
      <p className={styles.error} role="alert">{loadError}</p>
      <button type="button" className="lm-button lm-button--secondary" onClick={retryLoad}>
        Retry loading Ideas
      </button>
    </>}
    {!loading && !loadError && ideas?.length === 0 && <p className={styles.empty}>No ideas yet.</p>}
    {!loading && !loadError && ideas?.length > 0 && <ul className={styles.list} aria-label="Ideas checklist">
      {ideas.map((idea, index) => <li className={styles.row} key={idea.id}>
        <input ref={(node) => {
          if (node) checkboxes.current.set(idea.id, node);
          else checkboxes.current.delete(idea.id);
        }} className={styles.checkbox} type="checkbox" checked={idea.checked}
        aria-label={`${idea.checked ? "Uncheck" : "Check"} ${idea.text}`}
        disabled={pending} onChange={(event) => changeChecked(idea, event.target.checked)} />
        <span className={`${styles.text} ${idea.checked ? styles.checked : ""}`}>{idea.text}</span>
        <div className={styles.actions}>
          <button type="button" className="lm-button lm-button--quiet" disabled={pending || index === 0}
            aria-label={`Move ${idea.text} up`} onClick={() => move(idea, index, -1)}>Move up</button>
          <button type="button" className="lm-button lm-button--quiet" disabled={pending || index === ideas.length - 1}
            aria-label={`Move ${idea.text} down`} onClick={() => move(idea, index, 1)}>Move down</button>
          <button type="button" className="lm-button lm-button--quiet" disabled={pending}
            aria-label={`Delete ${idea.text}`} onClick={() => remove(idea, index)}>Delete</button>
        </div>
      </li>)}
    </ul>}
  </section>;
}
