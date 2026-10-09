# State & Flows

## Trip Status State Machine
| Current | Allowed Next States |
|---------|---------------------|
| Active | Paused, Deferred |
| Paused | Active, Deferred |
| Deferred | Active |

## Workflow Stage Flow
| Stage | Next Stage |
|--------|------------|
| Define | Research |
| Research | Book |
| Book | Prepare |
| Prepare | Itinerary |
| Itinerary | Travel Mode |
| Travel Mode | Review |
| Review | Complete |

## Data Flow
| Source | Destination | Description |
|--------|-------------|-------------|
| UI → Sheets | write | Save changes |
| Sheets → UI | read | Load data |
| Mobile → Web | sync | Shared Sheets backend |
| Sheets → Supabase | migrate | Future v2 migration |

## Timeline Conflict Logic
| Condition | Result |
|-----------|--------|
| Trip month = Conflict | Warning |
| Trip month = Caution | Soft warning |
| Trip month = Ideal | Highlight |
