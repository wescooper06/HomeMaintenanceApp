# Trips Supabase migration checklist

## Schema and behavior

- [x] Read/write `public.trips` using the supplied snake_case columns.
- [x] Associate workflows through `trips_workflow_metadata.trip_id`, referencing
  `trips.id`. New workflow stages use the saved trip's actual status.
- [x] Keep drag-and-drop ranking in the text column `trips.priority`.
- [x] Store workflow stage/notes in `trips_workflow_metadata`.
- [x] Store shared month color/notes/blocks in `trips_timeline`, keyed by
  `(year, month)`. Preserve existing month labels when updating.
- [x] Derive Timeline trip assignments from `trips.timeline_year` and
  `trips.timeline_month`; the Timeline table has no trip-ID list.
- [x] Create a workflow row for every new trip. Create a shared Timeline month
  only when both month and year are supplied. Unscheduled trips are allowed.
- [x] Reuse an existing Timeline month without clearing its settings.
- [x] Never write database rows during ordinary Trip/Timeline reads.
- [x] Report database and validation errors instead of falling back to another
  persistence backend.

## Files changed

- [Trips service](../src/services/tripsService.js): replace all Trips Sheets
  access, header creation, row-number edits, and Sheet-based synchronization.
  Map database columns to the existing React field names and validate dates,
  UUIDs, JSON links, and smallint fields.
- [Workflow service](../src/services/tripsWorkflowService.js): new workflow
  persistence keyed by the trip's UUID in `trip_id`.
- [Timeline service](../src/services/tripsTimelineService.js): new composite-key
  month persistence, derived assignments, and year propagation.
- [Supabase helpers](../src/services/tripsSupabase.js): explicit errors,
  paginated reads, field allowlists, and identity validation.
- [Trips application](../src/pages/Trips/TripsApplication.jsx): remove the
  Google connection gate. Existing routes are preserved.
- [Trips Home](../src/pages/Trips/TripsHome.jsx): remove obsolete Sheets comments;
  its existing list, editor, and delete actions use the new shared service.
- [New Trip](../src/pages/Trips/NewTrip.jsx) and
  [Capture Trip](../src/pages/Trips/components/CaptureTrip.jsx): creation calls
  the centralized three-table orchestration. Preserve IDs across retries and
  show failures in the UI.
- [Trip details](../src/pages/Trips/TripDetails.jsx): use the workflow service
  and show save errors/status rather than unhandled promises.
- [Prioritize](../src/pages/Trips/PrioritizeTrips.jsx): remove automatic Sheets
  priority-column creation; rankings save to `trips.priority`.
- [Trip editor](../src/pages/Trips/components/TripEditorPanel.jsx): load/save
  workflow stage/notes in a Workflow tab alongside trip edits.
- [Timeline view](../src/pages/Trips/TimelineView.jsx),
  [Timeline preview](../src/pages/Trips/components/PriorityTimelinePreview.jsx),
  and [month details](../src/pages/Trips/components/MonthDetailsModal.jsx):
  use the Timeline service; expose month blocks; remove read-side year creation.
- [Retained Activity Planner hook](./src/features/activityPlanner/useSheetsData.js):
  import its Google helpers directly, not through Trips.
- [Regression tests](../tests/trips-supabase.test.cjs): verify the exact table
  and column contracts, pagination, creation retries, CRUD, and failures.
- [Shared build test](../tests/planner-vite.test.cjs): verify the production
  bundle includes both new Trips metadata/Timeline table names.
- [README](./README.md): update Trips storage documentation.

Existing components such as Trips Home and Expanded Trip Modal already call the
shared Trips service and now use Supabase without changing their layout.
There is no Trips context provider or independent Sheets data hook to replace.
The existing React effects/state remain the UI loading mechanism.

## Legacy code removed or isolated

The Trips service no longer contains Sheets requests, proxy endpoints, column
setup, row appends, row-number updates/deletes, or exported Google utilities.
Its old Sheet-based workflow and Timeline implementations are removed entirely.
No Trips database operation uses localStorage or a fallback backend.

The shared Google client is intentionally retained for Daily Activities and
other independent features. Legacy `www/` reference files are not modified.
Trips list filter preferences still use localStorage, and collapsed-year UI
preferences still use sessionStorage; neither stores trip/workflow/timeline
records or serves as a persistence fallback.

## Added service APIs

- Trips: `createTrip(tripData)`, `updateTrip(id, updates)`, `deleteTrip(id)`,
  `getTrips()`, `getTripById(id)`, `assignTripToMonth(id, year, month)`,
  `removeTripFromMonth(id, year, month)`.
- Workflow: `createWorkflowMetadata(tripId, status)`,
  `updateWorkflowMetadata(id, updates)`, `getWorkflowMetadata(tripId)`.
- Timeline: `createTimelineEntry(year, month, data)`,
  `updateTimelineEntry(year, month, updates)`, `getTimelineEntries()`,
  `getTimeline()`, `getTimelineMonth(year, month)`,
  `initializeTimelineYear(year)`, `propagateTimelineYear(fromYear, toYear)`.
  `updateTimelineMonth` aliases the month update API for existing components.

Creation APIs are idempotent by their existing keys. Repeating `createTrip`
with the same ID and values finishes missing related setup without duplicating
records. Conflicting values for an existing ID are an explicit error; use Edit.
Creating an existing workflow or month never overwrites its settings.
Trip/workflow updates surface missing rows or permission failures. Timeline
updates create the shared month when missing and then apply the requested fields.

## Validation

1. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in
   `trips/.env.local`. Never put a service-role key in browser code.
2. Verify existing trip IDs are valid UUIDs and workflow `trip_id` values reference them.
   No IDs or existing records are automatically rewritten.
3. Ensure the current Supabase role can SELECT/INSERT/UPDATE/DELETE Trips and
   workflow rows and SELECT/INSERT/UPDATE Timeline months. Updates/deletes need
   SELECT visibility as well. This patch does not change RLS or create tables.
4. Run from the workspace root:

   ```powershell
   node --test tests\trips-supabase.test.cjs
   npm --prefix trips run build
   ```

5. Open `/#trips`: no Google prompt should appear. Check that existing Trips
   render, including dates, JSON links, priorities, purpose, and location.
6. Capture a scheduled trip: verify one trip, a workflow row whose `trip_id`
   references it and whose stage matches its chosen status, and a new Timeline
   month only if that shared month did not exist.
   Capture an unscheduled trip: verify only trip and workflow rows are created.
7. Edit a trip and refresh. Reorder Prioritize rows and verify `trips.priority`.
   Edit Workflow stage/notes in the Prioritize editor and check the workflow row.
8. Move a trip between months: verify the trip's month/year columns change,
   old markers disappear, and other trips/month settings remain unchanged.
9. Edit month color, notes, and blocks; reload to confirm persistence. Propagate
   a year: only colors and notes copy, preserving target blocks and assignments.
10. Delete a trip: its workflow is removed, its marker disappears, and shared
    month settings remain. Check Daily Activities still connects independently.
11. With a mocked or test database, deny writes and confirm visible errors,
    no Sheets network calls, and no local data persistence fallback.

## Atomicity and recovery

The supplied schema includes no transactional RPC or foreign keys. Multi-table
creation/deletion therefore uses separate requests, not a database transaction.
Creation failures identify the saved trip ID; retry with that same ID and values
to complete setup. Workflow cleanup failures after deletion explicitly request
retrying deletion. A failed trip move may leave an unused shared month row, but
does not move the trip until month setup succeeds. A workflow edit can fail after
trip details save; the editor reports that partial result and supports retry.
Concurrent edits are last-writer-wins. No migration, reimport, automatic rollback,
or deletion of shared Timeline settings is performed.
