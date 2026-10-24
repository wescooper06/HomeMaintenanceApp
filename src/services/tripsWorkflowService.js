import { getSupabaseClient } from "./supabaseClient.js";
import { tripFields, tripResult, tripUuid } from "./tripsSupabase.js";

const fields = { stage: "stage", stageNotes: "stage_notes" };
const fromRow = (row) => ({
  id: row.id, tripId: row.trip_id, stage: row.stage ?? "", stageNotes: row.stage_notes ?? "",
});

export function createTripsWorkflowService(getClient = getSupabaseClient) {
  async function getWorkflowMetadata(tripId) {
    const id = tripUuid(tripId);
    const row = await tripResult(getClient().from("trips_workflow_metadata")
      .select("*").eq("trip_id", id).single(), "Load trip workflow");
    return fromRow(row);
  }

  async function createWorkflowMetadata(tripId, status) {
    const id = tripUuid(tripId);
    const existing = await tripResult(getClient().from("trips_workflow_metadata")
      .select("*").eq("trip_id", id).maybeSingle(), "Check trip workflow");
    if (existing) return fromRow(existing);
    const row = await tripResult(getClient().from("trips_workflow_metadata")
      .insert({ trip_id: id, stage: status ?? null, stage_notes: "" }).select("*").single(),
    "Create trip workflow");
    return fromRow(row);
  }

  async function updateWorkflowMetadata(id, updates) {
    const values = tripFields(updates, fields);
    const row = await tripResult(getClient().from("trips_workflow_metadata")
      .update(values).eq("trip_id", tripUuid(id))
      .select("*").single(), "Save trip workflow");
    return fromRow(row);
  }

  return { createWorkflowMetadata, updateWorkflowMetadata, getWorkflowMetadata };
}

const workflow = createTripsWorkflowService();
export const createWorkflowMetadata = (...args) => workflow.createWorkflowMetadata(...args);
export const updateWorkflowMetadata = (...args) => workflow.updateWorkflowMetadata(...args);
export const getWorkflowMetadata = (...args) => workflow.getWorkflowMetadata(...args);
