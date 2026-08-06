# HCP-Web — CLAUDE.md

## Model Selection & Session Guide
See `model-guide.md` for which model (Sonnet/Opus/Haiku) fits a given task, session hygiene practices, and how to get the most value per session. Consult it before starting nontrivial work and suggest a model switch if warranted.

---

## What This Repo Is

Browser-based hearing conservation platform for industrial audiometric programs. Two apps plus a lead-discovery tool:

- **TechTool** (`techtool/`) — field app; downloads company packets, works fully offline, syncs results via OneDrive
- **MasterDB** (`masterdb/`) — office admin app; manages companies, employees, test history, scheduling; data stored in OPFS, never leaves the machine
- **Lead Finder** (`lead-finder/`) — separate noise-hazard lead discovery tool; Supabase backend + Google Places API; plain HTML/JS

## Architecture

Static site — no build step, no server-side logic. Deploy to Netlify or Cloudflare Pages.

```
App server: HTML/CSS/JS only — zero patient data
OneDrive:   /inbox, /outbox, /archive — packet transit between TechTool and MasterDB
MasterDB:   OPFS database on office hardware — data never leaves
TechTool:   IndexedDB cache for offline operation
```

Auth uses Microsoft Graph API (Azure AD app registration). Credentials live in `config.js` (gitignored).

## Directory Map

```
techtool/           Field technician app
  app.js            App shell, routing
  screens/          Screen modules
  db/               IndexedDB layer
  components/       Shared UI components

masterdb/           Office admin app
  app.js            App shell, routing
  screens/          Screen modules
  db/               OPFS database layer
  components/       Shared UI components

lead-finder/        Lead discovery tool (separate Supabase project)
  config.js         API keys (gitignored — see config.example.js)
  js/               Feature modules
  supabase/         Edge Functions and migrations

shared/             Code shared between TechTool and MasterDB
  packet/           Packet format, import/export logic
  classification/   Province audiometric classification engine (data-driven)
  rules/            Province rule JSON files
  fs/               OneDrive file system helpers
  auth/             Microsoft Graph auth helpers
  components/       Shared UI widgets
  validation/       Input validation
  counsel/          Counselling/referral logic
  time-utils.js
  auth-utils.js
  referral-form.js
```

## Key Constraints

- **No worker data on any server.** Health records stay in OPFS or OneDrive only.
- **No build pipeline.** All JS is vanilla ES modules — no bundler, no transpiler.
- **Offline-first.** TechTool must function with no connectivity after packet download. Service workers handle caching (`sw.js` in each app).
- **Province rules are data, not code.** Adding a province = adding a JSON rule file under `shared/rules/`, no JS changes.

## Active Work Context

See memory files for current project state:
- `project_hcp_rollout_status.md` — v6 rollout status and what's blocked
- `project_hcp_import_incident.md` — 2026-07-29 Yorkton incident and remediation
- `project_hcp_fleet.md` — device IDs and import-owner assignments
- `project_lead_finder.md` — Lead Finder current status

Memory index: `C:\Users\norma\.claude\projects\C--Users-norma-OneDrive---Sonova-hcp-web\memory\MEMORY.md`
