# Sync adapters

One file per source. Each exports `{ name, needs: [ENV keys], async run(env) }` and returns one data set (or a list of them) in the snapshot shape. Keys are read-only and come from Replit Secrets.

| Adapter | Sets | Keys | Status |
| --- | --- | --- | --- |
| `files.js` | any | `SNAPSHOT_IMPORT_DIR` | done: imports hand-placed JSON |
| `drive.js` | `drive` | `GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_BRAIN_FOLDER_ID` | next: file counts, last filed and recent files per team folder (drive.metadata.readonly only) |
| `hubspot.js` | `deals`, `accounts` | `HUBSPOT_READ_TOKEN` | next: deals, stage dates, last contact, next activity, Terms quoted |
| `stripe.js` | `pulse.cash`, verified amounts | `STRIPE_READ_KEY` | next: payments and open invoices, restricted key with read scopes only |
| `quickbooks.js` | `pulse.runway` | `QUICKBOOKS_READ_TOKEN` | next: cash balance; reports only, never invoices or payroll |
| `ops.js` | `ops` | Google Sheets read | next: Ops Board rows |

Rules: an adapter never writes to its source, never logs a key, and marks any row it cannot verify.
