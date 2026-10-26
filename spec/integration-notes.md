# Modern integration notes

| Topic | Current implementation |
| --- | --- |
| Navigation | Shared React navigation and modern hash routes; Trips nested browser routes |
| Web/mobile | One responsive main build; Capacitor Android uses `dist/trips` |
| Persistence | Supabase only for application records; no Sheets fallback |
| Google | Explicit Calendar OAuth, direct Calendar events/notifications |
| Configuration | Vite environment in `trips/.env.local`; no Apps Script handlers |
| Projects | Server UUID + PA/PB/PC/PD allocation; edits and shared-confirmation modern cascade deletion; [SQL policy](../supabase/review/README.md) |
| Planner backup | Versioned modern JSON, insert-only conflict checks; historical formats rejected |
| Historical data | Archived as evidence only; never imported, corrected or reconciled |
| Release | HTTPS SPA hosting and device/signing verification required; see Phase 7 report |
