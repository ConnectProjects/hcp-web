# ROLLOUT — uid-keyed sync (the durable Yorkton fix)

Coordinated deploy for the UUID sync rework (steps 1–4). Pairs with
`DESIGN-uuid-sync-rework.md` §6 and `REMEDIATION-2026-07-full.md`.

**Why coordination is mandatory:** the JSON files on OneDrive are shared. A
**mixed old/new fleet corrupts** — an old MasterDB reading a new file ignores
`uid` and merges by integer PK again, re-creating the exact collision we fixed.
So every MasterDB must be on the new code before any of them syncs against the
new files. This is not optional and cannot be done rolling.

The change is **inert until this rollout**: on a single instance the uid columns
just sit there; the corruption only happens in the multi-instance merge.

---

## Addendum (2026-08-01): uid-ADOPTION fix — service worker **v7**

**Found mid-rollout (after v6 was live and the owner had migrated):** schema 2.3
backfills each instance's rows with its OWN random uids
(`schema.js`: `UPDATE … SET uid = lower(hex(randomblob(16)))`), and the merge
keys purely on uid. So bringing a *second, already-diverged* machine online would
stamp DIFFERENT uids on the same shared rows and the merge would **duplicate the
entire shared history** (~6.8k employees / 7.3k tests / …). The original Phase 4
line "existing uids map to local ids" wrongly assumed followers already share
canonical's uids — they don't.

**Fix:** `shared/fs/adopt-uid.js`, called by `syncMaster` **before** the merge. A
follower adopts canonical's uid for each shared row, identified by
`(integer pk, created_at)` **plus** corroborating business fields (validated on
real data: every unambiguous ancestor row shares the same id + created_at across
instances). A post-fork id-collision of DISTINCT rows (Selsek/Garding) differs on
created_at/content and is left alone — it flows up as a new row. Genuinely-new
follower rows (e.g. Heather's 385 divergent tests) get folded in automatically.
Idempotent. Covered by `local-tests/import-packet/adopt.mjs` (18/18) with no
regression to the real-`syncMaster` integration test.

**Ships:** `shared/fs/adopt-uid.js`; adoption pass in `shared/fs/json-database.js`;
SW bumps **MasterDB v6 → v7** (adopt-uid.js added to the app-shell) and
**TechTool v3 → v4**.

**Two corrections to the phases below:**
- **Phase 2 SW check:** a machine whose site data was cleared has **no registered
  service worker** (MasterDB registers none in code), so it loads fresh from the
  network every time — the "confirm v6/v7 in the SW panel" check does not apply to
  it (it's simply on the latest served code). Only machines that still hold an old
  registered SW show one to confirm.
- **Phase 4 adoption:** followers now adopt losslessly. After each follower syncs,
  **verify no duplication**: row counts must not balloon (they should be canonical
  + that machine's genuinely-unique rows), and `COUNT(*) - COUNT(DISTINCT uid)`
  must be 0 per uid table. Watch the console for `Adopt <table>: N uid(s) adopted`.

---

## What ships in this rollout

- **Step 1** schema 2.3: `uid` + `deleted_at` on the six entity tables, backfill
  + stamp-on-insert trigger (`masterdb/db/schema.js`).
- **Step 2** classify-at-import + extracted `db/import-packet.js` + the
  `companies.province` new-company fix.
- **Step 3** uid-keyed non-destructive merge (`shared/fs/merge-uid.js`,
  `shared/fs/json-database.js`).
- **Step 4** conflict-copy reconciler + optimistic mtime check.
- Service workers bumped: **MasterDB `sw.js` v5 → v6 → v7**, **TechTool `sw.js`
  v2 → v3 → v4** (new modules `merge-uid.js`, `import-packet.js`, `adopt-uid.js`).
  See the v7 addendum above for the uid-adoption fix added mid-rollout.

All verified on a real pre-incident copy via git-ignored `local-tests/`
(126 checks). None pushed/deployed yet.

---

## Preconditions

- [ ] A **known list of every computer** running MasterDB, and one person who
      can confirm each is closed.
- [ ] Agreed freeze window (do it with the remediation window — one freeze).
- [ ] The designated **import-owner** computer identified (the one machine whose
      Settings → OneDrive Sync import toggle is ON — see `single-writer.js`).

## Phase 0 — Backups (do not skip)

1. [ ] On the import-owner: **export the MasterDB `.sqlite`** (Settings → export /
       the autobackup in `…/backups/`). Label it `pre-uuid-rollout`.
2. [ ] **Copy the entire set of merge JSONs** from the sync folder to a dated
       backup dir: `companies/locations/employees/tests/baselines/hpd_assessments
       .json`. These are the pre-migration canonical files (rollback source).
3. [ ] Note the current **conflict copies present right now** (there are already
       some on disk, e.g. `tests-CA21WW6R6Q673.json`, `employees-…`,
       `locations-…`, `baselines-…`). Do NOT delete them — the reconciler will
       fold them in during Phase 3. Just record them.

## Phase 1 — Freeze

4. [ ] Close MasterDB on **every** computer. Confirm each is closed (not just
       navigated away — the tab/window closed).
5. [ ] TechTool in the field can keep running; it only writes to `inbox/` and
       `status/`, never the merge tables, so it is not a corruption vector. It
       will pick up v3 on its own next online load.

## Phase 2 — Deploy code to all machines (still closed)

6. [ ] Publish the new code to wherever the app is served from.
7. [ ] On each MasterDB computer: open once, **hard-refresh** (Ctrl+Shift+R) to
       force `sw.js` v6, confirm the new service worker activated (DevTools →
       Application → Service Workers shows `hcp-masterdb-v6`), then **close it
       again**. Do not let it sync yet beyond the initial load. Repeat on all.
   - Goal: every machine is on v6 before any machine publishes new-format files.

## Phase 3 — One instance establishes the new baseline

8. [ ] Open MasterDB on the **import-owner ONLY**. On boot it will:
       - run the schema 2.3 migration (backfill uids — idempotent),
       - **reconcile the existing conflict copies** (fold `*-<SUFFIX>.json` into
         canonical by uid, then delete the safe ones; pre-uid copies are LEFT for
         manual review — see below),
       - sync, which **republishes every table file in the new wire format**
         (`*_uid` foreign keys).
9. [ ] Verify on the import-owner:
       - [ ] Row counts sane (companies/locations/employees/tests/baselines).
       - [ ] Spot-check a Kal Tire SK location and a few workers.
       - [ ] DevTools console: note any `quarantined` warnings and any
             "conflict copy … left for manual review" lines.
10. [ ] If any conflict copy was **left for review** (pre-uid / unresolved
        parent), handle it by hand before proceeding — open it, confirm whether
        its rows are already present by uid, and only then delete it. Never bulk
        delete.
11. [ ] Do the **remediation** data cleanup now (per `REMEDIATION-2026-07-full.md`)
        on this same single instance, then let it sync once more so the cleaned,
        uid-stamped files are canonical.

## Phase 4 — Bring the rest online

12. [ ] Open the other MasterDB computers one at a time, hard-refresh, let each
        sync. Each adopts the new-format files: existing uids map to local ids,
        cloud-only uids get fresh local ids, FKs resolve by uid. From here every
        row has a uid and merges are collision-proof.
13. [ ] Re-enable normal operation. Keep the import-owner model in place (only
        that one machine auto-imports).

## Phase 5 — Post-rollout checks

14. [ ] On two different machines, confirm the same worker/test shows identical
        data (no split brain).
15. [ ] Create a test row on machine A, sync, confirm it appears on machine B
        with a matching uid and correct parent links; then delete it.
16. [ ] Over the next day, watch for new `*-<SUFFIX>.json` conflict copies. A few
        may still appear (OneDrive), but the reconciler should now fold them in
        automatically on the next sync and remove them. If they accumulate,
        investigate before they strand data.

---

## Rollback

The migration is **additive** (new columns only), so rollback is clean:

1. Close all MasterDB instances.
2. Restore the Phase-0 merge JSON backups over the sync folder (overwrites the
   new-format files with the pre-migration ones).
3. Revert the code deploy (previous commit) and hard-refresh all machines back to
   `sw.js` v5.
4. Old code ignores the extra `uid`/`deleted_at`/`*_uid` fields, so even a
   partially-new file is harmless to it.

Because the old integer-PK merge is what we're leaving behind, do NOT run a mixed
fleet during rollback either — restore files and code together, fleet-wide.

## Known issues carried into this rollout (not blockers)

- **26 orphan tests** in the current data (`tests.employee_id` → missing
  employee). Preserved locally by the merge; a brand-new instance adopting from
  scratch quarantines them (can't place them). Clean these during remediation.
- **hpd_assessments pk fork:** deployed installs use `assessment_id`; a fresh
  install's `schema.js` creates `hpd_id`. The merge derives the real pk at
  runtime so both work, but the schema should be reconciled later so all installs
  match.
