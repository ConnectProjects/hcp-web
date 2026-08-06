# DESIGN — MasterDB Rebuild (v2 core)

*Drafted 2026-08-05 from the brainstorm notes of the same date. Companion docs:
`DESIGN-uuid-sync-rework.md`, `INCIDENT-2026-07-29-yorkton.md`, `REMEDIATION-2026-07-full.md`.*

## 1. Scope & non-goals

Rebuild MasterDB around the core loop:

> generate packet → TechTool tests in field → import packet → report for billing

**Out of scope / unchanged:**
- **TechTool** — largely right as-is; not touched except where the packet format gains fields (additive, backward-compatible).
- **The sync layer** — `shared/fs/` (json-database, merge-uid, adopt-uid, single-writer, sync-folder) was just rebuilt, hardened through the Yorkton incident, and verified on real data (126/126 local regression + live fleet). The rebuild sits ON TOP of it; we do not reopen it.
- **Packet transport** — OneDrive `techs/<name>/`, `inbox/`, `archive/`, and the `db/` subfolder isolation (SW v10) stay exactly as deployed.
- **Classification engine** (`shared/classification/engine.js`) and province rules — data-driven, working; untouched.

**What actually gets rebuilt:** the MasterDB app layer — `masterdb/screens/` and `masterdb/db/` — plus one schema change (person-level worker identity) with its data migration.

**What gets deleted** (firefighting artifacts, per the brainstorm):
`db-browser.js`, `data-tools.js` (46 KB of one-off fixes), `legacy-import.js`,
`rejected-packets.js`, `packets.js` (status folds into Schedule/Dashboard),
`companies-screen-BAK.js`, `employees-screen.js`/`employees.js` duplication,
`logs.js` (audit log viewer folds into Settings), `province-rules.js` (read-only
view folds into Settings).

## 2. The one real schema change: person-level worker identity

### Today's model (the root of the dupes)
`employees.location_id` makes identity *per-location*, and `import-packet.js:113-117`
matches workers by `(location_id, first_name, last_name)`. Consequences: a worker
who appears at two branches exists twice (canonical carries **2,141 name+dob
employee collisions**), and a name match at the wrong location silently absorbs a
different person (Selsek/Garding).

### Rebuild model
- **`employees` is a person.** Identity fields: `uid`, names, `dob`, optional
  `sin_last_4`/`phone`/`email`. Plus `current_location_id` — a *pointer* used only
  to build rosters ("who works here now"), never part of identity.
- **`tests.location_id` stamps where the test happened** (already true). Person
  history = all tests by `employee_id`; site history = all tests by `location_id`.
  Both queryable, no data model change needed for tests.
- Worker changes branches → update `current_location_id`; full history follows
  automatically because it hangs off the person.

**Decision (recommended): drop the `employment` periods table.** It exists in the
schema today but nothing populates it. `current_location_id` + per-test location
stamps answer every query the business actually has (roster, person history, site
history, billing by site). Employment start/end periods are speculative complexity —
exactly the kind the rebuild is removing. Easy to add later if a regulator ever
asks "where was this person employed on date X" (and even then, the test stamps
mostly answer it).

### Schema 3.0 (delta from deployed 2.3)

```sql
-- employees: identity at person level
--   DROP  location_id            (replaced by current_location_id, non-identity)
--   ADD   current_location_id INTEGER REFERENCES locations(location_id)
--   ADD   middle_name TEXT, sin_last_4 TEXT, phone TEXT, email TEXT
--   KEEP  uid, deleted_at, created_at/updated_at, uid trigger (schema 2.3 machinery)

-- employment: DROP TABLE (see decision above)

-- hpd_assessments: reconcile the pk fork found during the uid work
--   (deployed pk = assessment_id, schema.js says hpd_id). Standardize on
--   assessment_id — what the live data has — and fix schema.js to match.

-- backups bookkeeping (new, local-only, NOT a merge/sync table):
CREATE TABLE IF NOT EXISTS backup_log (
  backup_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,          -- in OPFS /backups/
  reason      TEXT NOT NULL,          -- 'pre-import:<packet_id>' | 'manual' | 'daily'
  db_bytes    INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Everything else (companies, locations with province, tests, baselines, schedules,
packets, users, settings, provinces/classification_rules/counsel_templates,
system_log) carries over from 2.3 unchanged — including `uid`, `deleted_at`, and
the `<t>_set_uid` triggers the sync layer depends on.

### The migration is the hard part (Phase 1, gates everything)

Moving to person-level identity means **merging the duplicate person records**.
This is real data surgery on canonical (~6.8k employees) and must follow the
pattern that worked for the July remediation:

1. Script it (Node + sql.js against a **copy** of `remediated-final.sqlite` /
   current canonical), in git-ignored `local-tests/` like `remediate_apply.py` and
   the uid harnesses.
2. Merge rule: group candidate duplicates by `(normalized first+last, dob)` across
   locations **within the same company**; survivor = record with the richest
   history; repoint `tests.employee_id`, `baselines.employee_id`; set survivor
   `current_location_id` to the location of their most recent test; tombstone the
   losers (`deleted_at`, uid preserved so sync propagates the merge).
3. **Cross-company same-name people are NOT merged automatically** — different
   Kal Tire vs Herbers "John Smith" may be the same human or not; flag a review
   list, default keep-separate.
4. Fold in the deferred **628 historical exact-duplicate test rows** cleanup
   (same worker/date/type/audiogram) — same freeze, same script, one republish.
5. Verify like the uid work: row-count reconciliation per table, no dup uids,
   every test still reachable, Yorkton fixture green, idempotent re-run.
6. Apply on the owner via the proven offline-import path (Continue offline →
   Settings → Import Backup → connect), republish canonical to `db/`.

## 3. Packet format (additive changes only)

`shared/packet/schema.js` stays; three additions, all backward-compatible
(TechTool ignores unknown fields):

1. **`location.location_uid`** (and `employee.uid` per roster employee) — the
   packet already carries `location_id`, but integer ids are local per instance;
   uids are the fleet-stable identity. Import matches on uid first, integer id as
   fallback for old packets.
2. **`schema_version: '1.1'`** so import can branch on capability.
3. Roster employees carry `uid` — this is what makes import matching exact for
   every worker MasterDB already knows (see §5).

Generate-packet flow itself is unchanged — the brainstorm calls it working, and
`generate-packet.js` + `createPacket()` already do company → location → roster +
baseline + last-2 prior tests + snapshotted rules.

## 4. The five pillars — screen-by-screen

Eleven screens total (today: 25 screen files). Login, launcher gate
(`isSanctionedLaunch`), offline-login, and version indicator carry over from the
v8–v12 hardening untouched.

### 4.1 Dashboard
The core loop at a glance, nothing else:
- **Upcoming visits** (next 14 days, from schedules) with packet status chips:
  `no packet` / `pending` / `synced` / `in progress` / `submitted`.
- **Awaiting import** — inbox packets (import-owner machine only; others see
  "owner: <machine>" instead of import buttons).
- **Recently imported** (last 10, with test counts and link to the trip report).
- Sync status + version + import-owner indicator (exists today, keep).

### 4.2 Companies & Locations
- **Companies list** → **Company detail** (locations list, contacts, notes)
  → **Location detail** (roster = employees with `current_location_id` here,
  visit history, HPD inventory, schedule shortcut).
- Location detail gets a **"Transfer worker"** action: move a person's
  `current_location_id` to another branch — the one new piece of UI the identity
  model needs. Shows the person's history staying intact across the move.
- No inline data-repair tools. If data is wrong, it's fixed by editing the record,
  not by a preset button (lesson from the db-browser "Fix SK-suffix" incident).

### 4.3 Workers (person-level)
- **Worker search** — global, by name/dob, across all companies (replaces the
  per-location employees screens). Results show company/current location.
- **Worker detail** — identity fields, current location, full test history
  (each row stamped with its location), active + archived baselines, audiogram
  component. → **Test detail** (audiogram, classification, counsel, HPD,
  referral status — carries over from today's `test-detail.js`).

### 4.4 Schedule & Packet generation
- **Schedule screen** — create/edit visits: company → location → tech → date.
  List view by week. Completing the loop: a visit row shows its packet status and
  is where you **Generate packet** (current `generate-packet.js` flow, invoked
  from the visit) and later see "imported ✓".
- Packet cancel (before pickup) lives here too. No separate packets screen.

### 4.5 Import
One screen replacing `incoming.js` + `import-confirm.js` + `rejected-packets.js`:
- Inbox list → select packet → **preview**: resolved location (by uid — see §5),
  worker-by-worker match preview (`matched by uid` / `matched by name+dob` /
  `NEW worker`), test count, dup/empty warnings.
- **Import** button runs: auto-backup (§7) → single transaction →
  `reconcileImport` fail-loud → archive packet. Result banner shows the
  reconciled counts ("6 of 6 tests imported to Kal Tire #731 Yorkton, SK").
- Rejected/failed packets stay listed here with the reason, nothing silent.

### 4.6 Reports
- **Trip report (new, the billing driver):** date range in → for every location
  with tests in range: site name/province, test count, classification breakdown,
  STS/referral count, roster of workers tested, tech + testing duration (from
  `packets.testing_duration`). Grand totals. Print + XLSX export (xlsx vendor lib
  already present).
- **Carried over from `reports.js`:** company report, STS report, worker history
  report, tech-productivity report — they work; port, don't redesign.

### 4.7 Users & Settings
- **Users** — roles: `super_admin` (everything), `admin` (billing + reports),
  `coordinator` (schedule + packets), plus tech records (one type, feeds the
  `techs/<folder>` assignment). Route-level gate: each screen declares a minimum
  role; nav hides what you can't open. (Today `users.role` exists but nothing
  enforces it.)
- **Settings** — sync folder connect, import-owner toggle, backup list + manual
  backup/restore (existing Import Backup path), audit log viewer, read-only
  province rules viewer, version info.

## 5. Import flow (pillar 4, the incident-proofing)

Keeps the proven skeleton — DI `importPacket()` core, caller-wrapped transaction,
`reconcileImport` fail-loud — with three behavior changes:

1. **Location by uid, refuse on ambiguity.** Packet carries `location_uid`;
   import resolves it or **refuses** (staff explicitly picks, as override, logged).
   The silent `"<Company> Main Location"` auto-create fallback
   (`import-packet.js:98-106`) is **removed** — it's how packets landed on wrong
   sites. New location creation is an explicit confirm step in the preview, never
   implicit.
2. **Worker match by identity, not location+name:**
   - `employee.uid` present (roster worker) → exact match, done. Covers every
     worker MasterDB put in the packet.
   - No uid (added on-site) → match `(name, dob)` **within the company**; the
     preview shows the proposed match and staff confirms. No match → create
     person with `current_location_id` = packet location.
   - A matched worker whose `current_location_id` differs from the packet
     location gets flagged in the preview ("worked at Calgary, tested at
     Yorkton — transfer?") — staff choice, default: stamp the test, leave the
     pointer.
3. **Atomicity unchanged**: one transaction per packet, `reconcileImport` throws
   → full rollback. Classify-at-import against the person's active baseline
   (already shipped) carries over; "first test at location" baseline logic becomes
   "first test for the person" (person-level identity).

## 6. Multi-instance posture

Unchanged from the hardened deployment: uid-keyed non-destructive merge over the
OneDrive `db/` subfolder, adopt-on-first-sync, Web Locks + import-owner flag +
`import.lock.json` (one machine imports; currently Norm's personal laptop,
handing to Heather post-rollout). The rebuild changes nothing here — the new
`backup_log` table is deliberately **not** a merge table (backups are per-machine).

## 7. Automatic backups (the brainstorm's additional requirement)

- **Pre-import (mandatory):** before every import transaction, copy the OPFS
  sqlite file bytes to OPFS `backups/masterdb-<ISO-stamp>-pre-<packet_id>.sqlite`
  and log to `backup_log`. Import proceeds only if the snapshot succeeded.
  DB is ~20 MB → sub-second copy, negligible cost.
- **Daily (first launch of the day):** same mechanism, reason `daily`.
- **Retention:** keep all pre-import backups 90 days, dailies 30 days, always
  keep the 10 most recent regardless of age; prune on launch.
- **Restore:** Settings lists `backup_log` with one-click restore via the
  existing Import Backup (wholesale OPFS replace) path — already proven during
  the remediation.
- Backups stay in OPFS (on-machine, satisfies the no-server constraint). Optional
  later: mirror the latest daily to a local folder via showDirectoryPicker for
  off-browser-profile safety. NOT to the shared OneDrive `db/` folder (backups
  from three machines would bloat and confuse canonical).

## 8. Implementation plan

**Phase 0 — finish what's in flight (prereq, not rebuild work)**
Complete uid-rollout Phase 4: bring the work laptop and Heather's machine onto
the current build via FirstRun.bat, verify no duplication, delete leftover root
canonical files. The rebuild deploys to a *consistent* fleet or the mixed-version
lessons repeat. (This is now just "run the launcher" per the rollout doc.)

**Phase 1 — schema 3.0 + identity migration (the gate)**
Branch `masterdb-rebuild`. Write the migration + dedup script and its harness in
`local-tests/` against a copy of canonical (per §2). Exit criteria: all
verification checks green, review list for cross-company candidates produced,
Yorkton fixture still green. *No UI work starts until this passes on real data.*

**Phase 2 — db layer + import core**
New `masterdb/db/` modules for the person model (workers.js replacing
employees.js, companies/locations/tests/baselines ported), import-packet.js v2
(§5) with the packet 1.1 additions in `shared/packet/schema.js`, auto-backup
module. Extend the existing local harnesses: uid-match import, refuse-unknown-
location, on-site-worker confirm path, backup-before-import, rollback.

**Phase 3 — screens**
Build the 11 screens (§4) fresh in `masterdb/screens/`, deleting the retired
ones. Port audiogram component, print CSS, xlsx export. Role gates. Same stack:
vanilla ES modules, no build step.

**Phase 4 — reports**
Trip report first (billing is the payoff), then port the four existing reports.

**Phase 5 — rollout (same playbook as uid-sync, now routine)**
Bump `APP_VERSION` + `sw.js` cache. Freeze (others closed — brief, we've done
it), apply migration on the owner via offline-import, republish canonical to
`db/`, bring the other two machines up one at a time via FirstRun.bat, verify
counts, hand import-owner to Heather. TechTool needs no coordinated change
(packet 1.1 is additive), so field techs are unaffected mid-rollout.

**Sequencing note:** Phases 2–4 are pure code on a branch and can proceed while
Phase 0/1 verification runs; only Phase 5 needs the freeze.

## 9. Open decisions (flagged for Norm)

1. **`employment` periods table** — recommendation: drop (§2). Confirm the
   business never needs employment start/end dates independent of test history.
2. **Cross-company duplicate people** — recommendation: never auto-merge; review
   list only. Confirm.
3. **628 historical dup tests** — recommendation: fold into the Phase 1
   migration (one freeze instead of two). Confirm.
4. **Trip report grouping** — assumed a "trip" is purely a date range (per the
   notes). If trips should be first-class records (named, assigned to a tech),
   that's a small `trips` table + schedule linkage — say so before Phase 4.
