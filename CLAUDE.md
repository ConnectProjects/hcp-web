# HCP-Web — CLAUDE.md

## Model Selection & Session Guide
See `model-guide.md` for which model (Sonnet/Opus/Haiku) fits a given task, session hygiene practices, and how to get the most value per session. Consult it before starting nontrivial work and suggest a model switch if warranted.

---

## What This Repo Is

Browser-based hearing conservation platform for industrial audiometric programs. Three tools:

- **TechTool** (`techtool2/`) — field app; downloads company packets, works fully offline, uploads results via OneDrive
- **MasterDB** (`masterdb2/`) — office admin app; manages companies, employees, test history, scheduling, reporting; unified app shell with TechTool (role-based routing)
- **Lead Finder** (`lead-finder/`) — separate noise-hazard lead discovery tool; Supabase backend + Google Places API; plain HTML/JS

TechTool and MasterDB are the same deployed URL — `masterdb2/app.js` routes to TechTool or MasterDB screens based on role.

## Architecture

Static site — no build step, no server-side logic. Deployed to GitHub Pages.

```
App server:  HTML/CSS/JS only — zero patient data
OneDrive:    masterdb.sqlite — single canonical database
             techs/{name}/outbox|inbox|archive — packet transit
Storage:     File System Access API over locally-synced OneDrive folder
             No OPFS, no IndexedDB, no Microsoft Graph API calls
```

No Azure AD app registration required. FSA permission is granted once via a browser prompt pointing at the locally-synced OneDrive folder.

## Directory Map

```
masterdb2/          MasterDB + TechTool unified app (live)
  app.js            App shell, role-based routing, sidebar
  screens/          MasterDB admin screens (dashboard, companies, workers,
                    schedule, import, reconcile, reports, users, settings)
  db/
    db.js           Database lifecycle, query helpers, file I/O
    fsa-store.js    File System Access API storage backend
    import-packet.js Packet import pipeline
    schema.js       DDL + seed
    workers.js      Employee/baseline helpers
  vendor/           sql-wasm.js + sql-wasm.wasm (self-contained)

techtool2/          TechTool field screens (loaded by masterdb2/app.js)
  screens/          tt-schedule, tt-test, tt-inbox, tt-new-visit, tt-settings

lead-finder/        Noise-hazard lead discovery tool (separate Supabase project)
  config.js         API keys (gitignored — see config.example.js)
  js/               Feature modules
  supabase/         Edge Functions and migrations

shared/             Code shared across apps
  packet/           Packet format, import/export logic
  classification/   Province audiometric classification engine (data-driven)
  rules/            Province rule JSON files
  components/       Shared UI widgets
  validation/       Input validation
  counsel/          Counselling/referral logic
  fs/               OneDrive file system helpers (legacy)
  auth/             Microsoft Graph auth helpers (legacy)
  time-utils.js
  auth-utils.js
  referral-form.js
```

## Key Constraints

- **No worker data on any server.** Health records live in `masterdb.sqlite` on the user's OneDrive only.
- **No build pipeline.** All JS is vanilla ES modules — no bundler, no transpiler.
- **Offline-first.** TechTool must function with no connectivity after packet download. No service workers — offline relies on the locally-synced OneDrive folder being available on disk.
- **Province rules are data, not code.** Adding a province = adding a JSON rule file under `shared/rules/`, no JS changes.

## Active Work Context

See memory files for current project state:
- `project_masterdb_rebuild.md` — v2 rebuild details, screens, known issues
- `project_hcp_import_incident.md` — 2026-07-29 Yorkton incident and remediation
- `project_lead_finder.md` — Lead Finder current status

Memory index: `C:\Users\norma\.claude\projects\C--Users-norma-OneDrive---Sonova-hcp-web\memory\MEMORY.md`
