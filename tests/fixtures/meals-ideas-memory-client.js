export function createMemoryMealsIdeasClient(seed = [], config = {}) {
  const storage = config.storage ?? null;
  const storageKey = config.storageKey || "meals-ideas-synthetic-data";
  const stored = storage?.getItem(storageKey);
  const initial = stored === null || stored === undefined ? seed : JSON.parse(stored);
  if (!Array.isArray(initial)) throw new Error("Synthetic Ideas storage must contain an array.");
  const data = { meals_ideas: structuredClone(initial) };
  const control = { failure: null, loseCreate: false, calls: [], data };
  let clock = Date.now();
  const timestamp = () => new Date(++clock).toISOString();
  const ordered = (rows) => [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const error = (code, message) => ({ data: null, error: { code, message } });
  const persist = () => storage?.setItem(storageKey, JSON.stringify(data.meals_ideas));
  if (stored === null || stored === undefined) persist();

  function from(name) {
    if (name !== "meals_ideas") throw new Error("Unexpected test table.");
    let mode = "select", values, predicates = [], orders = [], limit = 500;
    let single = false, maybe = false, exact = false;
    const query = {
      select(_columns, options) { if (options?.count === "exact") exact = true; return query; },
      insert(value) { mode = "insert"; values = value; return query; },
      update(value) { mode = "update"; values = value; return query; },
      delete(options) { mode = "delete"; exact = options?.count === "exact"; return query; },
      eq(key, value) { predicates.push((row) => row[key] === value); return query; },
      gt(key, value) { predicates.push((row) => row[key] > value); return query; },
      order(key, options = {}) { orders.push([key, options.ascending !== false]); return query; },
      limit(value) { limit = Math.min(value, 500); return query; },
      single() { single = true; return query; },
      maybeSingle() { maybe = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          control.calls.push({ name, mode, values });
          if (control.failure?.operation === mode || control.failure?.operation === "all") {
            const failure = control.failure;
            control.failure = null;
            return error(failure.code || "NETWORK", failure.message || "Injected failure.");
          }
          let selected = data[name].filter((row) => predicates.every((predicate) => predicate(row)));
          const count = exact ? selected.length : null;
          if (mode === "insert") return error("42501", "Direct insert is not supported.");
          if (mode === "update") {
            selected = selected.map((row) => Object.assign(row, values, { updated_at: timestamp() }));
          } else if (mode === "delete") {
            data[name] = data[name].filter((row) => !selected.includes(row));
          } else {
            selected.sort((a, b) => {
              for (const [key, ascending] of orders) {
                if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
              }
              return 0;
            });
          }
          if (mode === "update" || mode === "delete") persist();
          if (mode === "select") selected = selected.slice(0, limit);
          if ((single && selected.length !== 1) || (maybe && selected.length > 1)) {
            return error("PGRST116", "Expected one Idea.");
          }
          return {
            data: structuredClone(single || maybe ? selected[0] ?? null : selected),
            count,
            error: null,
          };
        }).then(resolve, reject);
      },
    };
    return query;
  }

  async function rpc(name, args) {
    control.calls.push({ name, mode: "rpc", values: args });
    if (control.failure?.operation === name || control.failure?.operation === "rpc"
      || control.failure?.operation === "all") {
      const failure = control.failure;
      control.failure = null;
      return error(failure.code || "NETWORK", failure.message || "Injected failure.");
    }
    if (name === "meals_ideas_create") {
      const existing = data.meals_ideas.find((row) => row.id === args.p_idea_id);
      if (existing) {
        if (existing.text !== args.p_text) return error("23505", "Idea identity already exists with different text.");
        return { data: structuredClone(existing), error: null };
      }
      if (typeof args.p_text !== "string" || !args.p_text.trim()) return error("22023", "Idea text is blank.");
      const position = Math.max(0, ...data.meals_ideas.map((row) => row.position)) + 1;
      const now = timestamp();
      const idea = { id: args.p_idea_id, text: args.p_text, checked: false, position,
        created_at: now, updated_at: now };
      data.meals_ideas.push(idea);
      persist();
      if (control.loseCreate) {
        control.loseCreate = false;
        return error("NETWORK", "Response lost after create.");
      }
      return { data: structuredClone(idea), error: null };
    }
    if (name === "meals_ideas_move") {
      if (args.p_direction !== -1 && args.p_direction !== 1) return error("22023", "Invalid direction.");
      const rows = ordered(data.meals_ideas);
      const index = rows.findIndex((row) => row.id === args.p_idea_id);
      if (index < 0) return error("P0002", "Idea unavailable.");
      const neighbor = index + args.p_direction;
      let moved = false;
      if (neighbor >= 0 && neighbor < rows.length) {
        const now = timestamp();
        [rows[index].position, rows[neighbor].position] = [rows[neighbor].position, rows[index].position];
        rows[index].updated_at = now;
        rows[neighbor].updated_at = now;
        moved = true;
      }
      persist();
      return {
        data: {
          moved,
          items: ordered(data.meals_ideas).map(({ id, position, updated_at }) => ({ id, position, updated_at })),
        },
        error: null,
      };
    }
    return error("42883", "Unknown RPC.");
  }

  return { from, rpc, control };
}
