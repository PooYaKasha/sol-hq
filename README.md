# Sol HQ

MatchNice's company dashboard. Sol sits at the center; divisions, people, agents, projects, workflows, products and tools orbit her. Everything in orbit comes from one registry, so a new hire, project or division is one record, not a code change.

Private. It holds company and customer data, so the server refuses to start in production without a password.

## Run it

```sh
HQ_PASSWORD=pick-one npm start      # http://localhost:3000, user "matchnice"
npm run check                       # registry valid, data files parse, browser code parses, page built right, no secrets
npm run build-ui -- <path to sol-hq-prototype.html>   # rebuild the page from a new prototype version
```

Node 18 or newer. No dependencies. Then open `/admin` once and load the data file (below).

## Prototype = app

The page you see is the Sol HQ prototype itself, the Claude artifact Pooya reviews and comments on. `scripts/build-ui.js` turns the prototype's source file into `public/index.html`, so every screen in the app matches the artifact exactly. To change the design, change the prototype, then rebuild. Never edit `public/index.html` by hand.

The build cuts the company data out of the page:

- **Data constants** (money, deals, customers, the Go list, the tracker seed and the rest, listed in `DATA` at the top of `build-ui.js`) become `__D('NAME', <empty shape>)` in the page.
- **HTML fragments** wrapped in `<!--@data:key-->` … `<!--@/data-->` in the prototype become placeholders.
- What was cut out goes to `data/snapshots/ui-data.js`, which git ignores. The server serves it at `/ui-data.js`, behind the password.

Without the data file the page still works: every panel shows its empty state and a notice links to `/admin`. Founders load the file at **`/admin`** (Sol attaches `sol-hq-ui-data.js` to each port in the project Library), or place it at `data/snapshots/ui-data.js` on the server. The server checks the file before saving it and never runs it.

The data file can also carry saved answers (`npm run build-ui -- <prototype> <seed.json>`, shape `{collection: {id: document}}`), such as the founders' Go list decisions. When the file is loaded at `/admin`, the page writes each one into the store unless Sol HQ already has an answer of its own for it.

The prototype uses the Claude page runtime for its shared store, file uploads and downloads. `public/shim.js` stands in for it in the app:

| Prototype (artifact) | App |
|---|---|
| `db.collection(c).onSnapshot`, `doc(id).set/delete` | `/api/store/<c>[/<id>]`, other people's changes arrive by polling every 4 s |
| `assets.upload/list/delete` | `/api/assets[/<id>]` (images, PDF, CSV, Markdown, text, JSON; 20 MB) |
| `downloads.save` | a normal browser download |

Store and uploads live in `data/state/` on the server and never go in git. They persist in the Replit workspace. **Before publishing**, they need a home that survives a redeploy (Supabase, the next step with ib), because a published Replit app does not keep files it writes.

Each inline script in the page is allowed by its hash in the Content Security Policy, worked out when the server starts, so a rebuilt page needs a restart (Replit's Run does that).

## The registry and data API (not used by the page yet)

The server still carries the registry and data API the first version of the page used. The new page does not read them yet; they stay for Ask Sol, the sync and the next step.

```
public/
  index.html          the page, built from the prototype (do not edit)
  shim.js             stands in for the Claude page runtime
  admin.html/.js/.css /admin, load the data file
lib/ui.js             the page's server side: /api/store, /api/assets, /api/ui-data, /ui-data.js
scripts/build-ui.js   prototype -> public/index.html + data/snapshots/ui-data.js
registry/
  kinds.json          the kinds of body (sun, human, division, project, agent, workflow, product, tool)
  bodies/*.json       the bodies themselves, one file per kind
  routes.json         how Ask Sol routes a question to a body before a model is connected
data/
  samples/*.json      fictional data sets, committed, always marked sample
  snapshots/          real data, never committed (see data/snapshots/README.md)
  state/              the page's store and uploads, never committed
lib/registry.js       loads and validates the registry
lib/data.js           serves a snapshot when one exists, else the sample
server.js             static files, password gate, /api/registry, /api/data, /api/ask, /config.js
sync/                 the nightly read-only sync (adapters per source; keys live only in secrets)
scripts/check.js      what `npm run check` runs; run it before every push
scripts/add-body.js   `npm run add`, puts a new body in orbit and validates
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

### Ask Sol

`/api/ask` routes a question to the body that owns it using `registry/routes.json`, and names the checks other bodies make and who approves. With `ANTHROPIC_API_KEY` set the model answers from the same registry and snapshots (v1.5).

## Rules

- Nothing is published on Replit without Pooya's explicit go.
- Every create, publish or data change gets a line in the team change log and the Ops Board.
- Keys are read-only and live in Replit Secrets or `.env`, never in git. `npm run check` scans for them.
- Real customer and finance data stay in `data/snapshots/` on the server, never in the repo.
