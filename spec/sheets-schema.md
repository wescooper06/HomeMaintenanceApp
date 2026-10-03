# Sheets Schema

## Trips
| Field | Type | Description |
|-------|------|-------------|
| tripId | string | Unique ID |
| destination | string | City/region |
| startDate | date | Trip start |
| endDate | date | Trip end |
| tripType | string | Domestic / International / Road Trip |
| status | enum | Active / Paused / Deferred |
| priorityRank | number | Backlog sorting |
| timelineMonth | number | Month placement |
| timelineYear | number | Year placement |
| notes | string | Freeform notes |

## Workflow Metadata
| Field | Type | Description |
|-------|------|-------------|
| tripId | string | FK to Trips |
| goals | string | Trip goals |
| constraints | string | Weather, PTO, budget |
| stageStatus | enum | Define / Research / Book / Prepare / Itinerary / Travel Mode / Review |
| stageNotes | string | Notes per stage |

## Resources
| Field | Type | Description |
|-------|------|-------------|
| tripId | string | FK |
| url | string | Link |
| title | string | Page title |
| type | enum | video / article / website |
| notes | string | Why it matters |

## Checklists
| Field | Type | Description |
|-------|------|-------------|
| tripId | string | FK |
| checklistType | enum | Packing / Pre‑Trip / Home Prep |
| item | string | Checklist item |
| completed | boolean | TRUE/FALSE |

## Itinerary
| Field | Type | Description |
|-------|------|-------------|
| tripId | string | FK |
| date | date | Day |
| startTime | time | Start |
| endTime | time | End |
| activity | string | What’s happening |
| location | string | Where |
| confirmation | string | Booking code |
| notes | string | Freeform |

## Month Constraints
| Field | Type | Description |
|-------|------|-------------|
| year | number | Year |
| month | number | Month |
| constraintType | enum | Ideal / Caution / Conflict |
| notes | string | Reason |
