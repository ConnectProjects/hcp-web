# DESIGN — MasterDB v2 Rebuild

*Rev 2 — 2026-08-05. Rev 1 (same day) assumed the local-first OPFS + file-sync
architecture; superseded after Norm's decision to make MasterDB **online-only
over the Microsoft Graph API**. Rollout of the uid-sync fix is COMPLETE, so all
phases here are rebuild work. Companion history: `DESIGN-uuid-sync-rework.md`,
`INCIDENT-2026-07-29-yorkton.md`.*

## 1. Scope & hard constraints

Rebuild MasterDB around the core loop:

> schedule visit → generate packet → TechTool tests offline → import packet → trip report for billing

**Hard constraints (Norm, 2026-08-05):**
1. **No installable software** — IT forbids installs. Everything is web tech
   (js/css/html/json) running in the browser.
2. **Served from GitHub** (Pages, static hosting) — no server-side code of our own.
3. **TechTool must operate offline** → the packet system stays.
4. **MasterDB does NOT need offline** → freed to be online-only.
5. Worker health data lives in the Sonova tenant (OneDrive) — no third-party
   database (hosted-DB option considered and set aside pending any future
   IT/privacy sign-off).

**Out of scope:** TechTool — unchanged except additive packet-format fields
(§4); old TechTool versions ignore unknown fields, so techs are unaffected.
Classification engine and province rules — untouched.

**Retired for MasterDB v2** (stays in git history; the old app keeps running on
`main` until launch): OPFS local database, the file-sync/merge machinery
(`json-database.js`, `merge-uid.js`, `adopt-uid.js`), import-owner flag and
lock-file coordination, the launcher/clean-profile hardening (existed only to
protect against dirty OPFS), and all firefighting screens (db-browser,
data-tools, legacy-import, rejected-packets, packets, logs, province-rules,
duplicate/BAK screen files).

## 2. Architecture: one database, accessed live

### The core change
Every 2026 incident traced to one root cause: three machines each holding a
divergent local copy, merged after the fact. MasterDB v2 keeps **one canonical
`masterdb.sqlite` file in the shared OneDrive folder** and works on it directly
over the Microsoft Graph API. No local copies, no merge, nothing to adopt or
reconcile.

### How a session works
1. **Open:** MSAL login (already in the stack) → download `db/masterdb.sqlite`
   via Graph (~20 MB, seconds on office broadband) → load into sql.js in memory.
   Record the file's **eTag**.
2. **Work:** all reads/queries run against the in-memory DB — the app feels
   instant; the network is only touched on open, save, and packet I/O.
3. **Save:** upload the DB back with `If-Match: <eTag>`. Graph rejects the
   upload with **412** if anyone else saved first — the corruption mode that the
   old file-sync physically could not detect. On 412: refetch, reapply (or
   surface to the user), never overwrite blind.
4. **Write lock (belt and braces):** before entering any editing/import action,
   claim `db/write.lock.json` (create-if-not-exists via `If-None-Match: *`,
   heartbeat timestamp, stale after 5 min). Other machines get read-only mode
   with a "locked by Heather since 10:12" banner. With 1–2 office users this is
   invisible in practice; eTags backstop it if the lock ever fails.
5. **Saves are explicit and transactional**: an import saves once, at commit,
   after `reconcileImport` passes. Screen edits save on action (debounced), not
   keystroke.

### Consequences that simplify everything downstream
- **Integer ids are now globally unambiguous** — there is only one counter.
  The uid translation layer existed solely because each machine minted its own
  ids. We **keep** the `uid` columns (populated, harmless, useful as stable
  external references in packets) but retire all merge/adopt machinery.
- **True whole-DB atomicity**: one file = one eTag = an import either lands
  entirely in the uploaded file or not at all.
- **Backups come nearly free**: OneDrive keeps version history on every save of
  `masterdb.sqlite` (§8), on top of explicit pre-import snapshots.
- **No more fleet coordination**: any machine, any browser profile, always sees
  the current data or a 412. The FirstRun/launcher apparatus is unnecessary
  (keep the desktop shortcut for convenience only).

### Technical risk #1 (spike first — Phase 1a)
Confirm from a browser MSAL token we can address the **shared** folder
(`Brothen, Jan's files - TechTool` is another user's share) via Graph:
resolve driveId/itemId (likely via `/me/drive/sharedWithMe` or the remoteItem
facet), then exercise download / upload-with-If-Match / 412 / create-with-
If-None-Match / server-side copy / move (for packet archive). Everything in §2
rests on these six verbs. Half a day; do it before any other build work.

### Packet transport under v2
Unchanged for techs: TechTool reads its `techs/<name>/` folder from the locally
synced OneDrive, fully offline, as today. MasterDB v2 simply does its side of
the file I/O via Graph instead of the File System Access API: write packet →
`techs/<name>/`, list/read `inbox/`, move imported packets → `archive/`.

## 3. Schema 3.0

Delta from deployed 2.3 (everything not listed carries over: companies,
locations with province, tests, baselines, hpd_assessments, schedules, packets,
users, settings, provinces/classification_rules/counsel_templates, system_log):

```sql
-- employees: identity at PERSON level (the key change)
--   DROP  location_id              (identity never lives at a location again)
--   ADD   current_location_id INTEGER REFERENCES locations(location_id)  -- roster pointer only
--   ADD   middle_name TEXT, sin_last_4 TEXT, phone TEXT, email TEXT
--   KEEP  uid (stable external ref), deleted_at (soft delete for health data)

-- employment: DROP TABLE  (decided 2026-08-05 — nothing populates it; test
--   location stamps answer "where was this person" historically)

-- hpd_assessments: standardize pk on assessment_id (what live data has);
--   fix schema.js to match (closes the fork found during the uid work)

-- backup_log (local bookkeeping of pre-import snapshots, §8):
CREATE TABLE IF NOT EXISTS backup_log (
  backup_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,
  reason      TEXT NOT NULL,          -- 'pre-import:<packet_id>' | 'manual'
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Person history = tests by `employee_id`; site history = tests by `location_id`;
roster = employees where `current_location_id` = X and active. A worker changing
branches is one pointer update; history follows automatically.

## 4. Packet format (schema 1.1, additive)

- Roster employees carry `uid` **and** `employee_id` (ids are unambiguous now).
- `location.location_uid` alongside the existing `location_id`.
- `schema_version: '1.1'`.
- On-site-added workers: TechTool already captures dob / sin_last_4 / phone /
  email in `addNewEmployee` — these now matter for matching (§5), so
  generate-packet's tech instructions should encourage filling them.

## 5. Import flow

Keeps the proven skeleton — pure `importPacket()` core, one transaction,
`reconcileImport` fail-loud, full rollback on any mismatch — with these changes:

1. **Location resolved by id/uid or REFUSED.** The silent "Main Location"
   auto-create fallback is removed. Unknown location → staff explicitly picks or
   creates one in the preview, logged as an override.
2. **Worker matching, person-level, multi-identifier** (decided 2026-08-05):
   - Packet `employee_id`/`uid` present (roster worker) → exact match. Done.
     This covers everyone MasterDB itself put in the packet.
   - On-site-added workers → candidate scoring across the whole company:
     DOB + first + last = strong match; SIN last-4 corroborates or breaks ties;
     name-only = weak (needs staff confirm). The import preview shows every
     proposed match (`exact` / `strong` / `needs confirmation` / `NEW person`)
     before anything is written.
   - Matched worker whose `current_location_id` differs from the packet
     location → flagged in preview ("tested at Yorkton, roster says Calgary —
     transfer?"); default stamps the test and leaves the pointer.
3. **Pre-import snapshot** (§8) must succeed before the transaction starts.
4. Classify-at-import against the person's active baseline (shipped logic
   carries over); first-test-for-person auto-baselines.
5. Save-to-OneDrive happens once, after commit — a failed import never uploads.

## 6. The five pillars — screens (11 total; today: 25 files)

- **Login** — MSAL + role check. No launcher gate needed (§2).
- **Dashboard** — upcoming visits with packet status chips; inbox awaiting
  import; recently imported; who holds the write lock.
- **Companies list → Company detail → Location detail** — locations, contacts,
  notes, HPD inventory, roster, visit history, **Transfer worker** action.
  No inline data-repair presets (db-browser lesson).
- **Worker search** (global, by name/dob — person-level) → **Worker detail**
  (identity incl. sin_last_4, current location, full cross-location test
  history, baselines, audiogram) → **Test detail** (audiogram, classification,
  counsel, HPD, referral).
- **Schedule** — create/edit visits (company → location → tech → date), week
  view; packet generation and cancel live on the visit row; supports several
  packets for one site/date ("1 of 2, 2 of 2" — filename/packet_id already
  distinguish by tech+date; add an optional sequence suffix).
- **Import** — inbox list → preview (location resolution, per-worker match
  table, dup/empty warnings) → import → result banner with reconciled counts;
  failed packets stay listed with reasons.
- **Reports** — §7.
- **Users** — roles: super_admin (all), admin (billing/reports), coordinator
  (schedule/packets); tech records (one type). Route-level gates (today
  `users.role` exists but nothing enforces it).
- **Settings** — Graph connection status, backup list + manual snapshot/restore,
  audit log viewer, read-only province rules, version info.

## 7. Reports

- **Trip report (new — the billing driver).** A trip is a **date range**
  (typically 1–2 weeks; may span multiple companies/locations, or one site with
  multiple packets per day). Input: date range (optionally filter by tech).
  Output: every location with tests in range → site name/province, test count,
  classification breakdown, STS/referral counts, roster of workers tested,
  tech + testing duration per packet; grand totals. Print + XLSX.
- **Ported as-is:** company report, STS report, worker history report,
  tech-productivity report.

## 8. Backups

- **OneDrive version history** — automatic version of `masterdb.sqlite` on
  every save; restorable from OneDrive UI or Graph. This is the always-on net.
- **Pre-import snapshot (mandatory):** Graph **server-side copy** of
  `db/masterdb.sqlite` → `db/backups/masterdb-<stamp>-pre-<packet_id>.sqlite`
  (no download/upload round-trip), logged in `backup_log`. Import blocked if
  the copy fails.
- **Retention:** prune `db/backups/` on launch — keep pre-import 90 days,
  always keep newest 10.
- **Restore:** Settings lists snapshots; restore = server-side copy back over
  `db/masterdb.sqlite` (itself versioned, so even a restore is undoable).

## 9. One-time migration (canonical → v2)

Produces the single `db/masterdb.sqlite` from today's canonical wire JSONs.
Must be **re-runnable**: it runs at least twice — once now to create a realistic
dev/test database, once at launch against the freshest data.

1. Script + harness in git-ignored `local-tests/` (Node + sql.js), same
   discipline as the uid rework and July remediation. Never against live files.
2. Steps: load wire JSONs → build schema 3.0 → **person-identity dedup**: group
   by multi-identifier (normalized name + DOB, sin_last_4 corroborating) within
   company; survivor keeps richest history; repoint tests/baselines; set
   `current_location_id` from most recent test; tombstone losers. Cross-company
   candidates → review list only, never auto-merged (decided 2026-08-05).
3. Verification gate: per-table row reconciliation, every test reachable from
   exactly one person, no dup uids, Yorkton fixture green, idempotent re-run.
   (Exact-duplicate tests already clean — verified 2026-08-05: 6,605 live rows,
   0 dup groups.)
4. Output uploaded as `db/masterdb.sqlite`. The old `db/*.json` files stay
   untouched until launch (§10) — the v12 fleet keeps using them; v2 dev reads
   only the new file.

## 10. Implementation plan

- **Phase 1a — Graph spike** (§2 risk): prove the six Graph verbs against the
  shared folder from a browser token. Nothing else starts until this passes.
- **Phase 1b — migration script + harness** (§9) on a canonical copy.
- **Phase 2 — data layer + import core:** `masterdb/db/` v2 (graph-store module:
  open/save/lock/412 handling; workers.js person model; ports of
  companies/locations/tests/baselines), `importPacket` v2 (§5), packet 1.1
  additions, pre-import snapshot. Extend local harnesses: match-by-id/uid,
  refuse-unknown-location, multi-identifier confirm path, 412 conflict, rollback.
- **Phase 3 — screens** (§6), porting audiogram component, print CSS, xlsx.
- **Phase 4 — reports** (§7), trip report first.
- **Phase 5 — launch:** re-run migration on fresh canonical → upload
  `db/masterdb.sqlite` → merge `masterdb-rebuild` to `main` (Pages deploys) →
  brief freeze while the fleet switches (no per-machine migration needed — v2
  has no local state, machines just open the new app) → archive the legacy
  `db/*.json` + root JSONs to `db/legacy-<date>/` → old app retired.

All work stays on branch `masterdb-rebuild`; `main` keeps serving the current
build until Phase 5. Hotfixes continue on `main`; merge `main` into the branch
periodically.

## 11. Decision log

| Date | Decision |
|------|----------|
| 2026-08-05 | Rebuild MasterDB around minimal 5-pillar core; TechTool stays |
| 2026-08-05 | All rebuild work on branch `masterdb-rebuild`; `main` = live until launch |
| 2026-08-05 | **Architecture: online-only over Graph API; single `masterdb.sqlite` in OneDrive** (hosted DB set aside — health-data compliance; local-first+sync retired) |
| 2026-08-05 | Drop `employment` table |
| 2026-08-05 | Worker matching by multiple identifiers (DOB, names, SIN last-4); cross-company never auto-merged |
| 2026-08-05 | 628-dup-test cleanup confirmed already done (0 dup groups in canonical) |
| 2026-08-05 | Trip = date range (1–2 weeks), not a first-class record; multi-packet-per-site-per-day supported |
