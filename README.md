# Sol HQ

MatchNice's company dashboard. Sol sits at the center; divisions, people, agents, projects, workflows, products and tools orbit her. Everything in orbit comes from one registry, so a new hire, project or division is one record, not a code change.

Private. It holds company and customer data, so the server refuses to start in production without a password.

## Run it

```sh
HQ_PASSWORD=pick-one npm start      # http://localhost:3000, user "matchnice"
npm run check                       # registry valid, data files parse, browser code parses, no secrets
npm run add -- --kind project --name "Nonprofit POWER 2027" --orbits sol --lead pooya --due 2027-12-01
```

Node 18 or newer. No dependencies, no build step.

## How it is put together

```
registry/
  kinds.json          the kinds of body (sun, human, division, project, agent, workflow, product, tool),
                      their glyph and default ring, the statuses, tiers and roles
  bodies/*.json       the bodies themselves, one file per kind (any .json in the folder is loaded)
  routes.json         how Ask Sol routes a question to a body before a model is connected
data/
  samples/*.json      fictional data sets, committed, always marked sample
  snapshots/*.json    real data written by the sync, never committed (see data/snapshots/README.md)
lib/registry.js       loads and validates the registry (ids, kinds, orbits, leads, loops)
lib/data.js           serves a snapshot when one exists, else the sample
server.js             static files, password gate, /api/registry, /api/data, /api/ask, /api/tasks, /api/gchat, /config.js
lib/gchat.js          Google Chat webhook posts: outbox, thread keys, mentions, the send gate
lib/digest.js         the daily digest Sol drafts for Chat, filtered by role
sync/                 the nightly read-only sync (adapters per source; keys live only in secrets)
scripts/check.js      what `npm run check` runs; run it before every push
scripts/add-body.js   `npm run add`, puts a new body in orbit and validates
public/
  app.js              shell: routing, tabs, ask bar, search, detail panel, role switch
  lib/store.js        the one store views read from: bodies, data sets, role, derived numbers
  lib/orbit.js        the orbit engine: any body with children can be the center
  lib/search.js       grouped search across bodies and every data set
  views/*.js          one module per tab; register it in app.js VIEWS
```

### A body

```json
{ "id": "proj-power-2026", "kind": "project", "name": "Nonprofit POWER 2026",
  "orbits": "sol", "lead": "pooya", "status": "building", "due": "2026-12-15", "tier": "open",
  "mission": "The conference: P2P matching demo and the TNL recording table." }
```

- `orbits` is the id of the body it circles. Sol is the only body with none. Chains can go as deep as you like: an agent orbits a division, a sub-project can orbit a project.
- `kind` decides the glyph and the default ring (`kinds.json`); `ring` and `angle` override it.
- `lead` must be a human body; `approver`, `owner` and `for` must be bodies.
- `tier` (`open`, `studio`, `restricted`) and `tags` (`investor`) decide who sees it. Roles are in `kinds.json`.
- `metrics` name a source like `pulse.cash` or `deals.waiting_on_matcher`; `store.js` resolves them and labels anything without a real snapshot as a sample.
- `drive` points at the body's team folder.

Data rows attach to bodies through `body`, `agent` or `owner` fields, so the detail panel, the orbit badges and Ask Sol find them without view code.

### Data sets

Each set is one file: `{ set, as_of, source, sample, meta, rows }`. The page shows `as_of` and the source next to every number, and says "sample" wherever the sync has not run. Current sets: `pulse`, `deals`, `accounts`, `ops`, `library`, `drive`.

### Access

One shared password today (HTTP Basic auth, `HQ_USER` and `HQ_PASSWORD`). Everyone with it sees everything; the "Viewing as" switch is a preview of what each role will see. Per-person logins and server-side role enforcement arrive with the Supabase step, before anyone outside the three founders gets access. Every response carries `noindex`, a strict CSP and `frame-ancestors 'none'`.

### Google Chat

Sol drafts a daily digest and one-off updates for a Google Chat space through an incoming webhook (`lib/gchat.js`, `lib/digest.js`, `/api/gchat`). Drafts only until `GCHAT_WEBHOOK_URL` is in Replit Secrets and `GCHAT_SENDING=on`; sample data never sends; restricted rows stay out unless the digest role is `founder`. Setup steps and the API: [docs/google-chat.md](docs/google-chat.md). Tests: `npm run test:gchat`.

### Ask Sol

`/api/ask` routes a question to the body that owns it using `registry/routes.json`, and names the checks other bodies make and who approves. With `ANTHROPIC_API_KEY` set the model answers from the same registry and snapshots (v1.5).

## Rules

- Nothing is published on Replit without Pooya's explicit go.
- Every create, publish or data change gets a line in the team change log and the Ops Board.
- Keys are read-only and live in Replit Secrets or `.env`, never in git. `npm run check` scans for them.
- Real customer and finance data stay in `data/snapshots/` on the server, never in the repo.
