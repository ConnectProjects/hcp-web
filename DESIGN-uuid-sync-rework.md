# DESIGN — durable fix: global identity, conflict-tolerant sync, classify-at-import

**Status: proposal for approval. No code until signed off.** This is "item 3" — the
permanent fix behind the stop-gap. It touches the sync core on live medical data, so it
gets a reviewed design first.

Addresses the root fault in `INCIDENT-2026-07-29-yorkton.md`: MasterDB treats browser-local
`AUTOINCREMENT` integers as stable identities, then merges independent instances by those
integers → collisions → lost/cross-linked records.

---

## 1. The central design decision

The naïve reading of "use UUIDs" is *make every primary key a TEXT UUID*. I recommend
**against** that here, and instead propose:

> **UUIDs are the durable cross-instance identity, carried on the wire and used as the merge
> key. Integer primary keys stay exactly as they are, local to each instance. The sync layer
> translates between the two at the boundary — nothing else changes.**

### Why not TEXT primary keys everywhere (the "big bang")
- **941** references to `employee_id / location_id / test_id / company_id / baseline_id`
  across **36** files, plus `<option value>`, `parseInt(sel.value)` on selected ids, and
  `ORDER BY location_id DESC` "last inserted" heuristics. Converting the PKs to TEXT means
  auditing all of it on live health data. High risk, low incremental benefit.
- SQLite's `INTEGER PRIMARY KEY` is the rowid; it *cannot* hold a UUID, so this is a
  full-table rebuild of every entity table plus a rewrite of every FK column.

### Why not "merge by uid but keep integer FKs as-is" (remap-only)
- If two instances mint integer `6911` for different people, importing both means one must be
  renumbered locally and every FK to it rewritten mid-merge. Fragile, and the failure mode is
  silent corruption — the exact thing we're removing.

### Why the translation-layer approach wins
- The collision happens **only in the sync merge**. A single instance with integer ids works
  fine. So we fix identity *at the merge*, and leave the app untouched.
- Churn is confined to `schema.js` (add `uid` columns), ~6 insert helpers in `db/*.js`, and
  `json-database.js` (the merge). The 941 app references and every `parseInt`/`ORDER BY` stay
  valid because **local ids remain integers**.
- It makes OneDrive's own conflict-copy files (the `*-CA21WW6R6Q673.json` split-brain we
  found) *recoverable* instead of destructive, because identity is now content-stable (uid),
  not position/counter-based.

---

## 2. Schema changes

Add `uid TEXT` to each synced entity table: `companies, locations, employees, tests,
baselines, hpd_assessments`. (`packets`, `users`, `techs` already have stable text keys.)

```sql
ALTER TABLE <t> ADD COLUMN uid TEXT;
-- backfill existing rows with fresh UUIDs, once:
UPDATE <t> SET uid = <generated-uuid> WHERE uid IS NULL OR uid = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_<t>_uid ON <t>(uid);
```

- Backfill runs through the existing migration framework in `schema.js` (per-row UUID via
  `crypto.randomUUID()`), guarded so it runs once.
- `updated_at` already exists on the merge tables (used for last-writer-wins per row) — kept.
- New in-app inserts (`createTest/createEmployee/createBaseline/createCompany/createLocation`)
  set `uid = crypto.randomUUID()`. ~6 one-line changes.

## 3. Sync merge rewrite (`json-database.js`)

The wire format gains `uid` and **uid-valued foreign keys** (`employee_uid`, `location_uid`,
`test_uid`, `company_uid`) so relationships are portable. Local rows keep integer FKs.

**Export (local → JSON):** for each row, emit `uid` + translate each integer FK to the
referenced row's `uid` via an in-memory `id→uid` map. Include a soft-delete tombstone flag
(see below) rather than dropping rows.

**Import/merge (JSON → local), processed in dependency order**
`companies → locations → employees → tests → baselines → hpd_assessments`:
1. Build `uid→localId` from the local table (the table *is* the map — no side structure).
2. Key the merge by `uid`: local-only kept; cloud-only added; in-both → newer `updated_at`
   wins (unchanged policy, now keyed on uid).
3. For a cloud-only `uid`, assign a fresh local integer id (max(id)+1, tracked) and extend
   the map.
4. Rebuild the table: write each row's local id (existing-for-uid or newly assigned) and
   translate its `*_uid` FKs back to local integer ids via the parent maps. Keep `uid`.
5. A row whose FK `uid` resolves to nothing (dangling) is **quarantined**, not guessed —
   surfaced for review, never attached to the wrong parent.

Because identity is `uid`, two instances that both created a row never collapse it; Selsek and
Garding stay two people, and a test always points at the uid it was entered against.

### Deletes → soft-delete tombstones
Hard deletes reappear from the other side on next sync. Merge tables already lean on
`active/status` flags; we formalize a tombstone (`deleted_at` or reuse `active=0`) so a delete
propagates by uid instead of being undone.

### Conflict-copy reconciler
Add a boot/heartbeat step that detects OneDrive conflict copies (`tests-<SUFFIX>.json`, etc.),
merges them by uid into the canonical file, and removes them — so split brain self-heals
instead of accumulating.

## 4. Concurrency control — corrected from the original brief

**The brief specified eTag / `If-Match` / 412 / 423. Those are Microsoft Graph (HTTP)
concepts, and the sync path does not use Graph.** It uses the **File System Access API**
(`showDirectoryPicker`, `createWritable`) over a OneDrive folder synced by the desktop client
(`sync-folder.js`). There is no HTTP request to attach an `If-Match` header to. So the
concurrency design is:

- **Single-writer / import-owner model** — already shipped (stop-gap). Retained.
- **Mtime optimistic check** — before writing a table file, re-read its `lastModified`; if it
  changed since we read it for the merge, re-merge and retry rather than overwrite. Best-effort
  (FSA has no atomic compare-and-swap), but cheap and catches the common races.
- **uid-keyed non-destructive merge** (§3) — the real safety net: even when OneDrive makes a
  conflict copy, no data is lost because both sides reconcile by uid.

(If we ever want *true* optimistic concurrency, that means moving writes to the Graph API with
real eTags — a larger change that trades offline-first for it. Out of scope; noted.)

## 5. Classify-at-import

Today the import stores `classification = NULL` (0 of 149 archived completed tests carry one),
so reports have nothing to show. Add engine execution at import:

- For each completed test, resolve the worker's active baseline (`getActiveBaseline`), load the
  province rules (packet carries `rules`; fall back to `shared/rules/<prov>.json`), call
  `classify(current, baseline, rules)` (`shared/classification/engine.js`).
- Store `classification` (JSON), `triggered_rule_id`, `triggering_freq_hz`, `triggering_ear`,
  `shift_db`, and derive `sts_flag` from `category` (as `createTest` already does).
- `classify()` already handles **no baseline** (new hire) — it skips baseline-basis rules and
  returns `category: 'N'` with `no_baseline: true`, so Selsek-type cases are correct.
- Runs inside the import transaction, before reconciliation. Deterministic and re-runnable, so
  it can be re-applied to the already-imported SK packets during remediation.

## 6. Rollout — mandatory fleet coordination

The JSON files are shared, so a **mixed old/new fleet corrupts**: an old instance reading the
new JSON ignores `uid` and merges by integer PK again. Therefore:

1. **Freeze.** All MasterDB closed except one; agreed window.
2. **Deploy** the new version to all computers (bump `sw.js`; everyone hard-refreshes) — but
   they stay closed until step 4.
3. **One instance** opens, runs the uid backfill migration, and **republishes** every table
   file with uids (`pushMaster`). This is the new canonical baseline.
4. Other instances open, hard-refresh, and adopt. From here every row has a uid and merges are
   collision-proof.
5. This pairs naturally with the `REMEDIATION-2026-07-full.md` window — do the data cleanup on
   the same frozen instance, then republish once.

**Rollback:** the Phase-0 `.sqlite` backup + the pre-migration JSON copies. The migration is
additive (new column), so reverting code + restoring files is clean.

## 7. Testing (built alongside)

- **Yorkton regression fixture** (the original deliverable #4): import the real Yorkton packet
  → assert exactly 6 tests, all on location 166, mapped to the 6 correct workers, zero foreign
  records; and a simulated mid-loop error rolls back to 0 rows.
- **Merge-collision unit test**: two simulated instances create different rows that would share
  an integer id; assert the uid-keyed merge keeps both, distinct, with correct FKs — i.e. the
  Selsek/Garding scenario cannot recur.
- **Conflict-copy test**: a `tests-<suffix>.json` is reconciled and removed without loss.

## 8. Decisions I need from you

1. **Approve the translation-layer approach** (uid on the wire, integer ids stay local) over a
   TEXT-primary-key rewrite? (Strongly recommended.)
2. **Tombstones:** reuse existing `active=0/status` where present, or add an explicit
   `deleted_at` to every merge table? (I lean: explicit `deleted_at`, uniform.)
3. **Classify-at-import scope:** just new imports, or also back-fill classifications across all
   existing tests during the remediation window? (I lean: both — it's the same engine call.)
4. **Sequencing:** land this immediately after the remediation window (one freeze for both), or
   as a separate later window?

## 9. Suggested build order (once approved)

1. Schema: `uid` columns + backfill migration + insert-helper uids. (Low risk, deployable
   alone; uids sit unused until the merge switches.)
2. Classify-at-import + the Yorkton regression fixture. (Independent, high value.)
3. Merge rewrite to uid-keyed translation + tombstones + collision tests. (The core.)
4. Conflict-copy reconciler + mtime optimistic check. (Hardening.)
5. Coordinated rollout per §6.
