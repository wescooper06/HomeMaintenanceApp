import { getSupabaseClient } from "./supabaseClient.js";

const tableName = "meals_ideas";
const columns = "id,text,checked,position,created_at,updated_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(message, code = "VALIDATION") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireId(value) {
  if (typeof value !== "string" || !uuid.test(value)) throw failure("Invalid Idea identity.");
  return value;
}

function nonblank(value) {
  if (typeof value !== "string" || !value.trim()) throw failure("Enter nonblank Idea text.");
  return value;
}

function validateIdea(value) {
  if (!value || typeof value !== "object" || !uuid.test(value.id)
    || typeof value.text !== "string" || !value.text.trim()
    || typeof value.checked !== "boolean" || !Number.isSafeInteger(value.position) || value.position < 1
    || typeof value.created_at !== "string" || typeof value.updated_at !== "string") {
    throw failure("Ideas response was incomplete. Reload and retry.", "CONFLICT");
  }
  return value;
}

function validateOrder(value) {
  if (!value || typeof value.moved !== "boolean" || !Array.isArray(value.items)) {
    throw failure("Idea move was not confirmed. Reload before retrying.", "CONFLICT");
  }
  const seen = new Set();
  let previousPosition = 0;
  for (const item of value.items) {
    if (!item || typeof item !== "object" || !uuid.test(item.id)
      || !Number.isSafeInteger(item.position) || item.position < 1 || item.position <= previousPosition
      || typeof item.updated_at !== "string" || seen.has(item.id)) {
      throw failure("Idea move returned an invalid ordering. Reload before retrying.", "CONFLICT");
    }
    previousPosition = item.position;
    seen.add(item.id);
  }
  return { moved: value.moved, items: value.items };
}

export function newIdea(id = globalThis.crypto.randomUUID()) {
  return { id, text: "" };
}

export function orderIdeas(ideas) {
  return [...ideas].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function ideasError(error) {
  const code = error?.code;
  if (code === "VALIDATION" || code === "CONFLICT") return error.message;
  if (["42501", "PGRST301", "PGRST302"].includes(code)) {
    return "Ideas change failed: access denied. Sign in as the owner and retry.";
  }
  if (code === "P0002") return "That Idea is no longer available. Reload the list and retry.";
  if (code === "23505") return "That Idea identity already exists with different text.";
  if (code === "23514" || code === "22023") return "Ideas change failed: the value or move direction is invalid.";
  if (error instanceof TypeError || code === "NETWORK") {
    return "Ideas request could not be confirmed because of a network failure. Retry the same action.";
  }
  return "Ideas change could not be confirmed. Your current values are kept; retry or reload.";
}

export function createMealsIdeasService(clientProvider = getSupabaseClient) {
  const table = () => clientProvider().from(tableName);

  async function result(request, operation) {
    let response;
    try {
      response = await request;
    } catch (error) {
      if (error instanceof TypeError) throw failure("Network request failed.", "NETWORK");
      throw error;
    }
    if (response.error) {
      const { code, message } = response.error;
      throw failure(message || `${operation} failed.`, code || (response.status === 0 ? "NETWORK" : "UNKNOWN"));
    }
    return response;
  }

  async function load() {
    const all = [];
    let cursor = null;
    let total;
    for (;;) {
      let query = table().select(columns, cursor === null ? { count: "exact" } : undefined)
        .order("position", { ascending: true }).order("id", { ascending: true }).limit(500);
      if (cursor !== null) query = query.gt("position", cursor);
      const response = await result(query, "Load Ideas");
      if (cursor === null) {
        total = response.count;
        if (!Number.isInteger(total) || total < 0) {
          throw failure("Idea total count is unavailable; retry loading.", "CONFLICT");
        }
      }
      if (!Array.isArray(response.data)) throw failure("Ideas load was incomplete. Retry.", "CONFLICT");
      if (!response.data.length) {
        if (all.length !== total) throw failure("Ideas changed during loading. Retry for a complete list.", "CONFLICT");
        return all;
      }
      for (const row of response.data) {
        validateIdea(row);
        if (cursor !== null && row.position <= cursor) {
          throw failure("Idea pagination did not advance in manual order. Retry loading.", "CONFLICT");
        }
        cursor = row.position;
        all.push(row);
      }
    }
  }

  async function update(id, values, operation) {
    const response = await result(table().update(values).eq("id", requireId(id)).select(columns).single(), operation);
    return validateIdea(response.data);
  }

  return {
    load,
    create: async (draft) => {
      const id = requireId(draft?.id);
      const text = nonblank(draft?.text);
      const response = await result(clientProvider().rpc("meals_ideas_create", {
        p_idea_id: id,
        p_text: text,
      }), "Create Idea");
      return validateIdea(response.data);
    },
    edit: (id, text) => update(id, { text: nonblank(text) }, "Edit Idea"),
    check: (id, checked) => {
      if (typeof checked !== "boolean") throw failure("Checked must be true or false.");
      return update(id, { checked }, "Change Idea status");
    },
    move: async (id, direction) => {
      const ideaId = requireId(id);
      if (direction !== -1 && direction !== 1) throw failure("Move direction must be -1 or 1.");
      const response = await result(clientProvider().rpc("meals_ideas_move", {
        p_idea_id: ideaId,
        p_direction: direction,
      }), "Move Idea");
      return validateOrder(response.data);
    },
    remove: async (id) => {
      const response = await result(table().delete({ count: "exact" }).eq("id", requireId(id)).select("id"), "Delete Idea");
      if (!Number.isInteger(response.count) || response.count !== 1
        || !Array.isArray(response.data) || response.data.length !== 1 || response.data[0]?.id !== id) {
        throw failure("Idea deletion was not confirmed. Reload before retrying.", "CONFLICT");
      }
      return id;
    },
  };
}
