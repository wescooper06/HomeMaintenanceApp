const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "calendarReminderService.js"), "utf8");
const { createCalendarReminderService, plannerReminderEventId, calendarPopupReminders } = vm.runInNewContext(`(() => {
  ${source.replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "")}
  return { createCalendarReminderService, plannerReminderEventId, calendarPopupReminders };
})()`, {
  googleAuth: {}, GOOGLE_SCOPES: { calendarRead: "calendar.read", calendarEvents: "calendar.events" },
  plannerStorage: {}, crypto: require("node:crypto").webcrypto, TextEncoder,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const task = { id: "fixture-task", title: "Check furnace", date: "2030-10-24",
  timeSlot: "morning", reminder: { active: false }, metadata: { keep: true } };

function fixture() {
  const events = new Map();
  const calls = [];
  const writes = [];
  let failSave = false;
  let denied = false;
  let apiFailure;
  let missingOnce = false;
  let loseResponse = false;
  const service = createCalendarReminderService({
    eventIdForTask: async (id) => `event-${id}`,
    now: () => new Date("2030-01-01").getTime(),
    auth: { ensureAuthenticated: async () => {
      if (denied) throw new Error("Connect Google Calendar");
      return "not-a-real-token";
    }, signIn: async () => { denied = false; } },
    storage: { upsertWeeklyTask: async (record) => {
      if (failSave) throw new Error("Fixture database denied");
      writes.push(plain(record));
    } },
    request: async (url, options) => {
      const id = decodeURIComponent(url.split("/").pop());
      const body = options.body && JSON.parse(options.body);
      calls.push({ id, ...options, body });
      if (apiFailure) return { ok: false, status: apiFailure };
      if (options.method === "GET") {
        if (missingOnce) { missingOnce = false; return { ok: false, status: 404 }; }
        return { ok: events.has(id), status: events.has(id) ? 200 : 404,
          json: async () => plain(events.get(id)) };
      }
      if (options.method === "POST") {
        if (events.has(body.id)) return { ok: false, status: 409 };
        events.set(body.id, body);
        if (loseResponse) { loseResponse = false; throw new Error("Fixture connection lost"); }
        return { ok: true, status: 200, json: async () => body };
      }
      if (options.method === "PATCH") {
        const previous = events.get(id);
        if (!previous) return { ok: false, status: 404 };
        events.set(id, { ...previous, ...body });
        return { ok: true, status: 200, json: async () => plain(events.get(id)) };
      }
      throw new Error(`Unexpected request ${options.method}`);
    },
  });
  return { service, events, calls, writes,
    failSave: (value) => { failSave = value; },
    deny: () => { denied = true; },
    apiFailure: (status) => { apiFailure = status; },
    missNextGet: () => { missingOnce = true; },
    loseNextWriteResponse: () => { loseResponse = true; } };
}

test("native event identity is stable and valid for Google Calendar IDs", async () => {
  const id = await plannerReminderEventId("task-one");
  assert.match(id, /^[0-9a-v]{5,1024}$/);
  assert.equal(await plannerReminderEventId("task-one"), id);
  assert.notEqual(await plannerReminderEventId("task-two"), id);
  await assert.rejects(plannerReminderEventId(""), /stable Planner task ID/);
});

test("schedule and reset use one owned Google event and persist the complete mapping", async () => {
  const f = fixture();
  const reminder = await f.service.schedule(task, new Date("2030-10-24T15:00:00Z"));
  assert.equal(reminder.provider, "google-calendar");
  assert.equal(reminder.eventId, "event-fixture-task");
  assert.equal(f.events.size, 1);
  assert.deepEqual(f.events.get(reminder.eventId).reminders,
    { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] });
  assert.equal(f.events.get(reminder.eventId).extendedProperties.private.plannerTaskId, task.id);
  assert.equal(f.writes[0].metadata.keep, true);
  await f.service.schedule({ ...task, reminder }, new Date("2030-10-24T16:00:00Z"));
  assert.equal(f.events.size, 1);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(f.writes.at(-1).reminder.sendAt, "2030-10-24T16:00:00.000Z");
});

test("cancellation disables notifications and repeated cancel/reset remains safe", async () => {
  const f = fixture();
  await f.service.schedule(task, new Date("2030-10-24T15:00:00Z"));
  const cancelled = await f.service.cancel(task);
  assert.equal(cancelled.active, false);
  assert.deepEqual(f.events.get(cancelled.eventId).reminders, { useDefault: false, overrides: [] });
  await f.service.cancel(task);
  await f.service.schedule(task, new Date("2030-10-24T17:00:00Z"));
  assert.equal(f.events.size, 1);
  assert.equal(f.writes.at(-1).reminder.active, true);
});

test("past/invalid dates and missing authorization never write remote or local state", async () => {
  const f = fixture();
  await assert.rejects(f.service.schedule(task, "not a date"), /future/);
  await assert.rejects(f.service.schedule(task, new Date("2020-01-01")), /future/);
  f.deny();
  await assert.rejects(f.service.schedule(task, new Date("2030-10-24")), /Connect Google Calendar/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.writes.length, 0);
});

test("Calendar permission failures and ownership mismatches do not claim success", async () => {
  const f = fixture();
  f.apiFailure(403);
  await assert.rejects(f.service.schedule(task, new Date("2030-10-24")), /403/);
  assert.equal(f.writes.length, 0);
  f.apiFailure(null);
  f.events.set("event-fixture-task", { id: "event-fixture-task",
    extendedProperties: { private: { plannerTaskId: "someone-else" } } });
  await assert.rejects(f.service.cancel(task), /identity does not match/);
  assert.equal(f.writes.length, 0);
});

test("partial Calendar success is explicit and a retry reconciles the same event", async () => {
  const f = fixture();
  f.failSave(true);
  await assert.rejects(f.service.schedule(task, new Date("2030-10-24")), /Calendar was updated.*Planner persistence failed/);
  assert.equal(f.events.size, 1);
  assert.equal(f.writes.length, 0);
  f.failSave(false);
  await f.service.schedule(task, new Date("2030-10-24"));
  assert.equal(f.events.size, 1);
  assert.equal(f.writes.length, 1);
  f.failSave(true);
  await assert.rejects(f.service.cancel(task), /may already be cancelled/);
});

test("Calendar event notification editing patches only reminders and validates lead times", async () => {
  const f = fixture();
  f.events.set("calendar-event", { id: "calendar-event", summary: "Keep me", description: "Notes" });
  await f.service.setEventReminder("calendar-event", 10);
  assert.equal(f.events.get("calendar-event").summary, "Keep me");
  assert.equal(f.events.get("calendar-event").description, "Notes");
  assert.deepEqual(f.calls.at(-1).body, { reminders: {
    useDefault: false, overrides: [{ method: "popup", minutes: 10 }],
  } });
  await f.service.setEventReminder("calendar-event", null);
  assert.deepEqual(f.calls.at(-1).body, { reminders: { useDefault: false, overrides: [] } });
  for (const value of [-1, 1.5, 40321, "invalid", "", false, "10"]) {
    assert.throws(() => calendarPopupReminders(value), /lead time/);
  }
});

test("concurrent Calendar creates reconcile the existing owned event rather than duplicate it", async () => {
  const f = fixture();
  await f.service.schedule(task, new Date("2030-10-24"));
  f.missNextGet();
  await f.service.schedule(task, new Date("2030-10-25"));
  assert.equal(f.events.size, 1);
  assert.equal(f.writes.at(-1).reminder.sendAt, "2030-10-25T00:00:00.000Z");
  assert.equal(f.calls.at(-1).method, "PATCH");
});

test("a lost Calendar write response reports uncertainty and retries reconcile the same ID", async () => {
  const f = fixture();
  f.loseNextWriteResponse();
  await assert.rejects(f.service.schedule(task, new Date("2030-10-24")), /may have been updated.*connection lost/);
  assert.equal(f.events.size, 1);
  assert.equal(f.writes.length, 0);
  await f.service.schedule(task, new Date("2030-10-24"));
  assert.equal(f.events.size, 1);
  assert.equal(f.writes.length, 1);
});
