# Snapshots

Real company data, written by `sync/run.js` or placed here by hand on the server. Never committed: `.gitignore` excludes everything in this folder except this file.

Each file is one data set with the same shape as `data/samples/<set>.json`:

```json
{ "set": "deals", "as_of": "2026-10-26", "source": "HubSpot + Stripe, read by Pip", "meta": {}, "rows": [] }
```

When a snapshot exists it replaces the sample of the same name. The page shows `as_of` and the source next to every number.
