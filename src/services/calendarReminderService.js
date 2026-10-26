import { googleAuth, GOOGLE_SCOPES } from "./googleAuth.js";
import { plannerStorage } from "./plannerSupabaseStorage.js";

const scopes = `${GOOGLE_SCOPES.calendarRead} ${GOOGLE_SCOPES.calendarEvents}`;
const baseUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function plannerReminderEventId(taskId) {
  if (!String(taskId || "").trim()) throw new Error("A stable Planner task ID is required.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`planner-reminder:${taskId}`));
  return `hm${Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function calendarPopupReminders(minutes) {
  if (minutes === null) return { useDefault: false, overrides: [] };
  const lead = minutes;
  if (typeof lead !== "number" || !Number.isInteger(lead) || lead < 0 || lead > 40320) {
    throw new Error("Calendar notification lead time must be 0 to 40320 whole minutes.");
  }
  return { useDefault: false, overrides: [{ method: "popup", minutes: lead }] };
}

export function createCalendarReminderService({
  auth = googleAuth,
  storage = plannerStorage,
  request = (...args) => fetch(...args),
  eventIdForTask = plannerReminderEventId,
  now = Date.now,
} = {}) {
  const pending = new Set();

  async function send(method, id, body, allowMissing = false) {
    const token = await auth.ensureAuthenticated(scopes);
    const response = await request(id ? `${baseUrl}/${encodeURIComponent(id)}` : baseUrl, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (allowMissing && [404, 410].includes(response.status)) return null;
    if (!response.ok) {
      if (response.status === 401) throw new Error("Google Calendar authorization expired. Connect Google Calendar and retry.");
      throw Object.assign(new Error(`Google Calendar notification ${method} failed (${response.status}).`),
        { status: response.status });
    }
    if (method !== "DELETE") {
      const event = await response.json();
      if (!event || typeof event !== "object" || Array.isArray(event)
        || event.id !== (id || body?.id)) throw new Error("Google Calendar returned an invalid notification event.");
      return event;
    }
    return null;
  }

  async function ownedEvent(id, taskId) {
    const event = await send("GET", id, null, true);
    if (event && event.extendedProperties?.private?.plannerTaskId !== taskId) {
      throw new Error("Calendar notification identity does not match this Planner task. No event was changed.");
    }
    return event;
  }

  async function schedule(task, sendAt, cancel = false) {
    if (!task?.id) throw new Error("A stable Planner task is required.");
    if (pending.has(task.id)) throw new Error("A reminder operation for this task is already in progress.");
    const at = new Date(sendAt);
    if (!cancel && (!Number.isFinite(at.getTime()) || at.getTime() <= now())) {
      throw new Error("Choose a future Google Calendar notification time.");
    }
    pending.add(task.id);
    let calendarChanged = false;
    let calendarAttempted = false;
    try {
      const id = await eventIdForTask(task.id);
      const previous = await ownedEvent(id, task.id);
      let reminder;
      if (cancel) {
        if (previous) {
          calendarAttempted = true;
          await send("PATCH", id, { reminders: calendarPopupReminders(null),
            summary: `Cancelled reminder: ${task.title || "Planner task"}` });
          calendarChanged = true;
        }
        reminder = { active: false, provider: "google-calendar", eventId: id };
      } else {
        const body = {
          summary: `Reminder: ${task.title || "Planner task"}`,
          description: "Planner notification.",
          start: { dateTime: at.toISOString() },
          end: { dateTime: new Date(at.getTime() + 60000).toISOString() },
          reminders: calendarPopupReminders(0),
          transparency: "transparent",
          extendedProperties: { private: { plannerTaskId: task.id } },
        };
        calendarAttempted = true;
        if (previous) await send("PATCH", id, body);
        else {
          try { await send("POST", null, { id, ...body }); }
          catch (error) {
            if (error.status !== 409) throw error;
            if (!await ownedEvent(id, task.id)) throw error;
            await send("PATCH", id, body);
          }
        }
        calendarChanged = true;
        reminder = { active: true, provider: "google-calendar", eventId: id, sendAt: at.toISOString() };
      }
      await storage.upsertWeeklyTask({ ...task, reminder });
      return reminder;
    } catch (error) {
      if (calendarChanged) throw new Error(
        `Google Calendar was updated, but Planner persistence failed. The notification may already be ${cancel ? "cancelled" : "scheduled"}. Retry to reconcile the stable event ID. ${error.message}`,
        { cause: error }
      );
      if (calendarAttempted) throw new Error(
        `Google Calendar may have been updated, but the notification operation did not finish. Retry to reconcile the stable event ID. ${error.message}`,
        { cause: error }
      );
      throw error;
    } finally { pending.delete(task.id); }
  }

  return {
    connect: () => auth.signIn(scopes),
    schedule: (task, sendAt) => schedule(task, sendAt),
    cancel: (task) => schedule(task, null, true),
    async setEventReminder(eventId, minutes) {
      if (!String(eventId || "").trim()) throw new Error("A Calendar event ID is required.");
      return send("PATCH", eventId, { reminders: calendarPopupReminders(minutes) });
    },
  };
}

export const calendarReminders = createCalendarReminderService();
