const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

// Supply PLANNER_PARKING_FRAGMENT while the fragment is awaiting integration.
const sourcePath = process.env.PLANNER_PARKING_FRAGMENT
  || path.resolve(__dirname, "..", "src", "services", "plannerService.js");
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("const PARKING_COLORS =");
assert.ok(start >= 0, "Parking service fragment must be appended or PLANNER_PARKING_FRAGMENT supplied.");
const fragment = source.slice(start);
const names = [...fragment.matchAll(/export (?:async )?function (\w+)/g)].map((match) => match[1]);

function harness() {
  const calls = { parking: [], tasks: [], projects: [], weeklyDeletes: [] };
  const window = {
    PlannerStorage: {
      upsertParkingItem: async (item) => { calls.parking.push(item); return item; },
      upsertTaskManagerTask: async (task) => { calls.tasks.push(task); return { ...task, taskId: "task-1" }; },
      deleteWeeklyTask: async (...args) => { calls.weeklyDeletes.push(args); },
      invalidateCache: () => {},
    },
    ProjectsService: {
      createProject: async (payload) => {
        calls.projects.push(payload);
        return { ok: true, id: "project-1", tabName: "Project List_A", rowNumber: 8 };
      },
    },
  };
  const context = vm.createContext({
    window, console, ensurePlannerAdapters: async () => {},
    cleanText: (value, fallback) => String(value ?? "").trim() || fallback,
  });
  vm.runInContext(fragment.replace(/export /g, "") + `\nglobalThis.api = {${names.join(",")}};`, context);
  return { api: context.api, calls };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("ordinary edit sends the exact legacy parking payload, including tag/priority reset", async () => {
  const { api, calls } = harness();
  const existing = {
    id: "p1", title: "Old", notes: "Old notes", createdAt: "created", updatedAt: "updated",
    tags: "important", priority: "high", source: "custom", convertedTo: { type: "weekly", id: "w1" },
    color: "#123456", checklistJson: '[{"text":"one"}]', reminderJson: '{"enabled":true}',
    metadataJson: '{"asset":"House"}', deleted: false, convertedFromParking: "original",
  };
  await api.saveParkingItem(existing, { title: " Edited ", notes: " Notes ", convertTo: "none" });
  assert.deepEqual(plain(calls.parking[0]), {
    id: "p1", title: "Edited", notes: "Notes", createdAt: "created", updatedAt: "",
    source: "parking-lot", tags: "", priority: "low", convertedTo: { type: "weekly", id: "w1" },
    color: "#123456", checklistJson: '[{"text":"one"}]', reminderJson: '{"enabled":true}',
    metadataJson: '{"asset":"House"}', deleted: false, convertedFromParking: "original",
  });
});

test("ad-hoc title edit changes only the in-memory parking item", async () => {
  const { api, calls } = harness();
  const item = api.parseParkingItem({ id: "p1", title: "Old", tags: "tag", convertedTo: { type: "task-manager", id: "t1" } });
  const next = await api.saveParkingAdHocTitle(item, " Renamed ");
  assert.equal(next.title, "Renamed");
  assert.equal(item.title, "Old");
  assert.equal(next.tags, "tag");
  assert.deepEqual(calls, { parking: [], tasks: [], projects: [], weeklyDeletes: [] });
});

test("project and repeatable conversions use exact legacy create payloads", async () => {
  for (const type of ["project", "repeatable"]) {
    const { api, calls } = harness();
    await api.convertParkingItem({ id: "p1", title: "Idea" }, type);
    assert.deepEqual(plain(calls.projects[0]), {
      source: "home", property: "", vehicle: "", title: "Idea", area: "",
      category: "uncategorized", priority: "3", order: "", resourceLinks: "",
      state: "unknown", dateCompleted: "", hours: "", mileage: "", mechanic: "",
      addToRepeating: type === "repeatable", recurrence: "",
    });
    assert.deepEqual(plain(calls.parking[0].convertedTo), {
      type, id: "project-1", tabName: "Project List_A", rowNumber: 8,
    });
  }
});

test("ad-hoc conversion uses exact legacy task-manager payload", async () => {
  const { api, calls } = harness();
  await api.convertParkingItem({ id: "p1", title: "Idea" }, "task-manager");
  assert.deepEqual(Object.keys(calls.tasks[0]).sort(), [
    "taskId", "projectId", "title", "source", "category", "state",
    "asset", "mileage", "recurrence", "priority", "order",
  ].sort());
  assert.equal(calls.tasks[0].order, undefined);
  assert.deepEqual(plain(calls.tasks[0]), {
    taskId: "p1", projectId: "p1", title: "Idea", source: "parking-lot",
    category: "uncategorized", state: "unknown", asset: "", mileage: "", recurrence: "", priority: 3,
  });
});

test("weekly drop preserves the legacy snapshot and archive payload", async () => {
  const { api, calls } = harness();
  await api.parkPlannerPayload({ kind: "weekly-move", weeklyTask: {
    id: "w1", title: "Weekly", tags: "tag", checklist: [{ text: "one" }],
    reminder: { enabled: true }, metadata: { asset: "House" },
  } });
  assert.deepEqual(plain(calls.parking[0]), {
    id: "", title: "Weekly", notes: "", createdAt: "", updatedAt: "", source: "parking-lot",
    tags: "tag", priority: "low", convertedTo: { type: "weekly", id: "w1" }, color: "",
    checklistJson: '[{"text":"one"}]', reminderJson: '{"enabled":true}',
    metadataJson: '{"asset":"House"}', deleted: false, convertedFromParking: "w1",
  });
  assert.deepEqual(plain(calls.weeklyDeletes), [["w1", { hardDelete: false }]]);
});
