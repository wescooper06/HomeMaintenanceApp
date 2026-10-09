# API Endpoints (Google Sheets)

## Sheets API Calls
| Name | Sheet | Operation | Description |
|------|--------|-----------|-------------|
| getTrips | Trips | read | Fetch all trips |
| addTrip | Trips | append | Create new trip |
| updateTrip | Trips | update | Modify trip fields |
| getWorkflow | Workflow Metadata | read | Fetch metadata |
| updateWorkflow | Workflow Metadata | update | Save modal changes |
| getResources | Resources | read | Fetch links |
| addResource | Resources | append | Add link |
| getChecklists | Checklists | read | Fetch checklist items |
| updateChecklist | Checklists | update | Mark complete |
| getItinerary | Itinerary | read | Fetch itinerary |
| addItineraryItem | Itinerary | append | Add activity |
| getMonthConstraints | Month Constraints | read | Fetch timeline shading |

## General API Notes
| Topic | Details |
|--------|---------|
| Auth | Google Sheets API key + OAuth |
| Format | JSON rows mapped to Sheets columns |
| Errors | Network, missing rows, invalid IDs |
| Rate Limits | Minimal for personal use |
