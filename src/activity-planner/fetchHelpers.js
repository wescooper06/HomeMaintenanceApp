import { getActivitySpreadsheetId } from "./useSheetsData.js";

const url = import.meta.env.VITE_APPS_SCRIPT_URL;

// The planner calls this without arguments; the standalone script needs an explicit spreadsheetId.
export async function regenerateWeeklyGrid(spreadsheetId = getActivitySpreadsheetId()) {
  if (!url) {
    throw new Error("Apps Script Web App URL is not configured (VITE_APPS_SCRIPT_URL).");
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "regenerate", spreadsheetId })
    });
    const payload = await response.json().catch(() => null);
    console.log("WeeklyGrid regeneration response", { status: response.status, payload });

    if (!response.ok || payload?.status !== "ok") {
      throw new Error(
        payload?.message || payload?.error ||
        `WeeklyGrid regeneration failed (HTTP ${response.status}).`
      );
    }

    return payload.result;
  } catch (error) {
    console.error("WeeklyGrid regeneration failed", error);
    throw error;
  }
}
