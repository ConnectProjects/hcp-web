# PLAN — packets as background transport

**Branch:** `feature/background-packet-sync` (from `origin/main` @ `e5c98a4`)
**Author:** planning session, 2026-11-20
**Status:** ready for implementation

---

## 1. Goal and invariants

Make the packet mechanism an implementation detail. Users see **visits** and **reviews**, not
JSON files, folder paths, or packet IDs. Clean work flows automatically; anything needing
judgement is surfaced in plain language.

**Decisions already made:**

- **Scope:** UI + background automation only. On-disk packet format, folder layout
  (`techs/{folder}/outbox|inbox|archive`), the `packets` table, and the import safety gates are
  **unchanged**. No data migration.
- **TechTool:** automatic refresh/sync with a status line and a retry affordance shown only on
  failure. No always-visible Sync button.
- **Philosophy:** invisible by default, loud on exception.

**Hard invariants — do not violate:**

1. `commitImport()` stays exactly as-is: `validatePacket`, mandatory pre-import snapshot,
   `reconcileImport` fail-loud gate, atomic transaction, `save(writerName)`.
2. `autoImportClean()`'s definition of "clean" is the only criterion for automatic commit:
   company resolves, location resolves, and `counts.unconfirmed === 0`.
3. Ambiguous packets are **never** auto-committed. They stay untouched in the inbox.
4. The canonical SQLite file and the JSON packet schema do not change on this branch.

---

## 2. Current state (why each change is needed)

| Area | Today |
|---|---|
| Auto-import | `autoImportClean()` exists but is only called by a button in `screens/import.js` |
| Dashboard | "Inbox Queue" lists `.json` filenames and says "N packets waiting to import" |
| Import screen | Tech dropdown → file list → "Auto-import all" → preview → commit |
| Generate | `location.js`: "Generate & Write to Outbox", success names the file path |
| Schedule | Detail panel shows Status / **File**; "Cancel Packet" |
| TechTool | `tt-inbox` "Inbox" + "↺ Refresh" + file cards; `tt-test` "Submit Packet"; back buttons go to `tt-inbox` |
| Timers | None for packets. Only the 60 s write-lock heartbeat started at login |
| Nav | `TECHTOOL_NAV` has only `tt-schedule` + `tt-settings`; `tt-inbox` is reachable only via `tt-test` back buttons |
| SW | `VERSION = 'hcp-v8'`, hard-coded `ASSETS` list (no `background-sync.js`) |

---

## 3. Implementation

### Phase 1 — background auto-import module (new)

**New file:** `masterdb2/db/background-sync.js`

```
startAutoImport(session, { intervalMs = 60_000 })  // immediate run + interval
stopAutoImport()                                   // clear interval
refreshNow()                                       // manual retry, guarded
getLastResult()  → { at, results: [], error } | null
subscribe(fn)    → unsubscribe                      // UI observers
```

`runOnce(session)` behaviour, in order:

1. If `_running` or `document.visibilityState !== 'visible'` → return.
   (Visible-only is deliberate: `app.js` releases the write lock when the tab is hidden.)
2. Re-entrancy guard: `if (navigator.locks) → navigator.locks.request('masterdb-auto-import',
   { ifAvailable: true }, fn)`. Fall back to the module flag where Web Locks is unavailable.
   Do **not** import legacy `shared/fs/single-writer.js`.
3. Cross-session guard: `readLock()`; if a fresh lock is held by another writer → skip this
   cycle.
4. `techs = query("SELECT * FROM techs WHERE active = 1 AND folder_name IS NOT NULL ORDER BY name")`
5. `results = await autoImportClean(techs, session.writerName)` — unchanged.
6. Publish `{ at: Date.now(), results, error: null }` to subscribers.
7. On any throw: publish `{ at, results: [], error: message }`. **Never** rethrow into the
   interval.

Wiring in `masterdb2/app.js`:

- Import the four exported functions.
- In `navigate()`, after a successful mount, if `session.user && name !== 'login'` and not
  already started → `startAutoImport(session)` and register a one-time `visibilitychange`
  listener that calls `refreshNow()` when the tab becomes visible.
- In `_signOut()` → `stopAutoImport()` (before clearing session fields).
- Keep the existing visibility handler that releases the lock on hide.

### Phase 2 — MasterDB UI relabel

**`screens/dashboard.js`**
- Replace "Inbox Queue" with **"Needs Review"**, rendered from `getLastResult().results.filter(r => r.skipped || !r.ok)`.
- Show company/tech names from the DB join where available, plus the human `reason` string —
  never a filename.
- Add a quiet status line: `Auto-import on · last checked HH:MM`, with a **Retry** link calling
  `refreshNow()`. If `result.error` is set, show a warning banner with the error and Retry.
- Render on mount, then `subscribe()`. Return `{ unmount }` to unsubscribe (the router already
  supports it).
- "Upcoming Visits": drop the `p.filename` column.
- Remove the `listInbox` import and `loadInboxQueue()`.

**`screens/import.js`** — becomes an exception-only review screen
- Remove: tech dropdown, inbox file table, "Auto-import all" button, `runAutoAll()`.
- On mount: `refreshNow()` (guarded), then render skipped items from `getLastResult()`.
- A review item shows company, visit date, tech, and the plain-language reason. Clicking it
  calls `readPacket(techFolder, filename)` → `previewImport(packet)` and opens the existing
  decision UI (`renderPreview`, `renderResult`, `runCommit` are kept).
- Keep the WSBC CSV download in the result banner.
- Change the header comment — it currently claims "no timers / subscriptions"; it will now
  subscribe to background-sync updates (or just read on mount — prefer read-on-mount plus a
  Refresh button to keep it simple).

**`screens/location.js`**
- "Generate & Write to Outbox" → **"Assign Visit"**; success text → `Visit assigned to {tech} for {date} ({N} workers)`.
- "Visit History" table: keep Status / Date / Tech / Workers, drop the File column.
- Underlying `createPacket` / `writePacket` / `INSERT INTO packets … 'pending'` unchanged.

**`screens/schedule.js`**
- Detail panel: drop the "File" row; "Cancel Packet" → **"Cancel Visit"** (keep the
  `UPDATE packets SET status='cancelled'` logic and confirm prompt).

**`screens/test.js`**
- Test detail: "Packet ID" → **"Visit reference"** (or remove).

**`screens/settings.js`**
- Keep the Conflict Copies warning and the folder-name field — both are legitimate setup/
  maintenance items, not packet UI. Reword the conflict warning to avoid packet jargon.

### Phase 3 — TechTool UI

**`techtool2/screens/tt-inbox.js` — delete**
- It is not in `TECHTOOL_NAV`; it exists only as the target of `tt-test` back buttons.
- `tt-schedule.js` already merges DB rows with `outbox`/`inbox` files and shows the same work.

**`tt-schedule.js` — become the single "Visits" screen**
- Nav label: Schedule → **Visits**. Heading likewise.
- Remove "↺ Refresh". Add automatic refresh: 60 s interval while visible + `visibilitychange`
  → visible. Return `{ unmount }` from `mount()` to clear the timer and listener.
- Status line `Updated HH:MM`; show **Retry** only when the last scan failed.
- Chip/detail wording: "Open packet →" → "Open visit"; "Complete — ready to submit" →
  "Complete — ready to send"; "Submitted — your LC will import this when they're back in the
  office" → "Results sent to your office"; legacy "hasn't been pushed to your OneDrive folder
  yet" → "Waiting for OneDrive".
- Keep `listTechPackets` / `readTechPacket` / `listInbox` / `readPacket` and all status logic.

**`tt-test.js`**
- "Submit Packet →" → **"Send Results"**. Keep `markSubmitted` + `submitTechPacket` unchanged.
- Both back buttons (`L75`, `L259`) → `navigate('tt-schedule')`.

**`tt-new-visit.js`**
- "Create Visit" stays; success message must not print the filename/path.

**`masterdb2/app.js`**
- Remove `tt-inbox` from any routing references (none in nav; only `tt-test` back links).

### Phase 4 — service worker

**`masterdb2/sw.js`**
- `VERSION`: `hcp-v8` → **`hcp-v9`** (mandatory — techs cache everything).
- `ASSETS`: add `/hcp-web/masterdb2/db/background-sync.js`; remove
  `/hcp-web/techtool2/screens/tt-inbox.js`.
- Do not change SW registration or scope in `index.html`.

### Phase 5 — tests

**New:** `tests/background-sync.test.mjs` (Node `node:test`, same stubbing pattern as
`tests/wsbc-export.test.mjs`). Cover:

1. clean packets are committed and `_last.results` reports them;
2. ambiguous packets stay skipped with a human reason and are **not** committed;
3. `_running` guard prevents a second concurrent cycle;
4. hidden document does not run;
5. an error from `autoImportClean` is captured in `_last.error` and does not throw;
6. `refreshNow()` re-runs after an error.

Run: `node --test tests/*.test.mjs`

---

## 4. Verification checklist (manual)

- [ ] Submit a clean packet from TechTool → within a minute it leaves `inbox/`, `tests` rows
      exist, `packets.status = 'imported'`, `meta.save_seq` advances — with no button click.
- [ ] Submit a packet with an unknown location → it stays in `inbox/`, appears on the MasterDB
      dashboard as "Needs Review" with a readable reason, and writes **zero** test rows.
- [ ] Open MasterDB in two tabs → only one auto-import cycle runs (Web Locks / guard).
- [ ] Hide the tab → no cycle runs; show it again → one cycle runs.
- [ ] TechTool: complete a visit → "Send Results" → returns to Visits showing "Results sent".
- [ ] No `.json` filename, `outbox`, `inbox`, or `archive` string visible in either app's UI
      (Settings maintenance section excepted).
- [ ] Hard-refresh picks up `hcp-v9`; `background-sync.js` is in the SW cache.

---

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Another MasterDB session writes concurrently | `readLock()` owner check + visible-only execution + Web Locks |
| Auto-import commits something ambiguous | Only `autoImportClean()` decides; `reconcileImport` gate untouched |
| Interval errors spam console or break app | All errors caught and published to state, never rethrown |
| Techs stuck on old cached code | SW `VERSION` bumped to `hcp-v9`, new asset added to `ASSETS` |
| Stale status vocabulary (`pending`/`pushed`/`imported`/`error`) leaks into UI | UI derives display labels from last-sync results; raw DB status never rendered |
| Hidden-tab lock release races with background import | Background import is visible-only by design |

Rollback = revert this branch and redeploy with the SW version bumped back. No data migration
means no restore step.

---

## 6. Explicitly out of scope (follow-up)

- Moving visit/assignment state into SQLite tables and making packets a purely opaque internal
  message (the "deep refactor" option).
- Unifying the three inconsistent packet-status vocabularies in the DB / JSON / UI.
- Auto-submitting completed tests without the technician's explicit "Send Results" action —
  that confirmation is intentional.
- Changing the packet JSON schema or the `techs/{folder}/outbox|inbox|archive` layout.
