# INCIDENT-2026-07-29 — Yorkton (#731) packet imported catastrophically wrong

**Status:** Root cause identified and verified against live sync data.
**Author:** Investigation on 2026-07-30.
**Severity:** High — occupational-health records lost and cross-contaminated; class of bug affects every multi-user import day, not just this packet.

---

## 0. How this was verified (evidence base)

The live MasterDB lives in the browser's OPFS (WASM SQLite) and cannot be queried from disk. **However**, the OneDrive sync JSON — which is a faithful mirror of that DB via the row-level merge — *is* on disk and was inspected directly:

- Sync root: `C:\Users\norma\OneDrive - Sonova\Brothen, Jan's files - TechTool\`
- Source packet: `archive\FINAL_KalTire-731YorktonSK_2026-07-29_CS.json`
- Table mirrors: `tests.json`, `employees.json`, `locations.json`, plus the **device-suffixed split-brain copies** `tests-CA21WW6R6Q673.json`, `employees-CA21WW6R6Q673.json`, `packets-CA21WW6R6Q673.json`.

Every claim below is backed by those files. Where my findings differ from the original brief, I trust the data and flag it.

---

## 1. Executive summary

Three visible failures (A partial import, B foreign record, C wrong location) are **symptoms of one underlying architecture fault plus two contributing traps**:

- **Root fault — colliding primary keys across instances.** Every entity table (`tests`, `employees`, `locations`, `baselines`) uses `INTEGER PRIMARY KEY AUTOINCREMENT` (`masterdb/db/schema.js:136,110,89,179`). Each MasterDB instance keeps its **own** OPFS database with its **own** autoincrement counters. The sync (`shared/fs/json-database.js:66` `syncMaster`) then does a **row-level merge keyed on those local integer IDs** and a **destructive `DELETE FROM <table>` + re-insert + last-writer-wins file push** (`json-database.js:150-160`). When two instances mint *different real rows* under the *same* integer ID, the merge silently collapses them into one — losing one record and mis-pointing anything that referenced it.

  **Proof it is multi-instance:** in `tests.json`, `test_id` 7295–7298 carry `updated_at = 2026-07-29 16:36:26/29`, while the **higher** ids 7299–7300 carry the **earlier** `updated_at = 2026-07-29 16:33:01`. A higher autoincrement id created *before* a lower one is impossible on a single counter. Two instances minted these ids independently, then merged.

- **Contributing trap 1 — deactivated province-correct locations.** The correct SK locations are **inactive** and their **AB duplicates are active**:
  | id | name | province | active |
  |----|------|----------|--------|
  | 166 | `#731 Yorkton, SK` | SK | **0** |
  | 284 | `#731 Yorkton` | AB | **1** |
  | 167 | `#733 Weyburn, SK` | SK | **0** |
  | 285 | `#733 Weyburn` | AB | **1** |

  Every import resolver filters `active = 1`, so the packet's own `location_id: 166` is rejected and the import is steered onto **284 (AB)**.

- **Contributing trap 2 — name-based employee matching over duplicated locations.** Employees are matched by `(location_id, first_name, last_name)` (`masterdb/screens/incoming.js:393`, `import-confirm.js:374`). Because the store exists twice (166 and 284), every worker exists twice too — e.g. **Ken Yeadon is both `employee_id 4881` @166 and `6502` @284**. The import attaches tests to whichever duplicate the (wrong) location resolves to.

The reason nobody noticed is that **both import loops swallow every per-record failure with `continue`** (`incoming.js:408,425`; `import-confirm.js:403-405,412-416,425-428`) and there is **no post-import reconciliation** of imported-count vs source-count. The import reported "success" while writing 2 of 6 tests.

---

## 2. What the source packet actually contains (verified)

`FINAL_KalTire-731YorktonSK_2026-07-29_CS.json`:

- `packet_id: SK-KalTire-731YorktonSK-20260729-CS`
- `company: 31 / Kal Tire / SK`
- `location: { location_id: 166, name: "#731 Yorkton, SK", province: SK }`
- `tech.tech_id: 77fc9f41-8462-4c1b-8a6c-64364c9c6216` (initials CS)
- 26 employees: **6 completed, 20 skipped ("Not present")**.

The six completed tests (all with full, valid threshold data — confirmed):

| packet employee_id | name | baseline | notes |
|---|---|---|---|
| 4858 | Micheal Demetriow | 2024-07-24 | |
| 4872 | Andrew Martin | 2015-07-14 | |
| 4874 | Vladimir Roizman | 2015-07-14 | |
| 4879 | Jordan Turner | 2024-07-24 | |
| 4881 | Ken Yeadon | 2009-07-13 | |
| `new_1785339346396` | Luka Selsek | **null** | new hire, string id |

Note: in the packet, every `completed_tests[0]` has `classification: undefined` and `tech_id: undefined`. TechTool did **not** store a computed classification; the import stored `classification = NULL`. So even the tests that *did* import carry no classification/STS flag. (Bearing on recovery — see §6.)

---

## 3. What actually landed (verified in `tests.json`)

Querying `packet_id = SK-KalTire-731YorktonSK-20260729-CS` returns **exactly 2 rows**, identical in `tests.json` and the split-brain `tests-CA21WW6R6Q673.json`:

| test_id | employee_id | resolves to | location_id | test_type | updated_at |
|---|---|---|---|---|---|
| 7299 | 6502 | **Ken Yeadon** (@284) | 284 | Periodic | 2026-07-29 16:33:01 |
| 7300 | 6911 | **Connor Garding** (dob 2009-05-13, @282) | 284 | Baseline | 2026-07-29 16:33:01 |

- Only workers **#5 (Yeadon)** and **#6 (Selsek)** produced a row. The first four (Demetriow, A. Martin, Roizman, J. Turner) produced **nothing** on this packet — in *either* file snapshot.
- Row 7300 was created **Baseline** — consistent with it being the **new-hire Luka Selsek** (first test → forced Baseline; `incoming.js:428`). It now dereferences to **Connor Garding** because employee 6911 was overwritten (see §4B).
- Location stamped **284 (AB)**, not the packet's 166 (see §4C).

---

## 4. The three failures, mapped to code and data

### A. Silent partial import — only 2 of 6 tests written

Two independent mechanisms both contributed; the data shows the second dominated here.

**A1 — Swallowed per-record skips (latent, always dangerous).**
Both loops `continue` on any per-record problem with only a `console.*`:
- duplicate-test guard: `incoming.js:420-427`, `import-confirm.js:418-428`
- employee create-failure: `incoming.js:408`, `import-confirm.js:402-405`
- empty-threshold skip: `import-confirm.js:409-416`

None of these throw, so the wrapping `BEGIN/COMMIT` (`sqlite.js:81-92`) never rolls back — it **commits the partial**. `imported` is whatever survived, and the UI shows `✓ Imported N test(s)` regardless. There is no check that `N == 6`.

The most likely trigger for the first four workers being skipped is the **duplicate-test guard firing against rows from an earlier import attempt of the same packet on another instance** (this DB shows heavy prior double-importing — e.g. `employee_id 6503` and `6505` each already carry two identical `2024-07-24` baselines). A worker who already had a `2026-07-29` row (later clobbered by a merge) would be silently skipped as a "duplicate."

**A2 — Test rows destroyed by primary-key collision in the merge (dominant).**
`syncMaster` merges `tests` by `test_id` and, for a colliding id, keeps the row with the newer `updated_at` (`json-database.js:133-147`), then rewrites the whole file (last writer wins). The **07-29 Weyburn packet** (`SK-KalTire-20260729-CS`) imported on 07-30 created `test_id` **7301–7304** at loc 285, `updated_at = 2026-07-30 15:43:55`. Any Yorkton worker tests that had been minted with those same ids on another instance (earlier `updated_at`) lost the comparison and were deleted on re-insert. Net effect: Yorkton's non-surviving tests vanish with **no error anywhere**.

> Verdict on brief's hypothesis 1 (no transaction): **partially rejected.** A `BEGIN/COMMIT` *does* wrap the loop, so a *thrown* error would roll back. The real defect is that errors are **swallowed, not thrown**, and that the *sync merge* (outside any transaction) destroys committed rows after the fact. Wrapping in a transaction is necessary but **not sufficient** — the fail-loud reconciliation and globally-unique IDs matter more.

### B. Foreign record — Connor Garding attached to the Yorkton packet

`employee_id 6911` is the collision point:

- `tests.json` test **7295** (packet `SK-KalTire-20260728-CS`, loc 282, Baseline) → `employee_id 6911`. This is Garding's **real** test.
- `tests.json` test **7300** (Yorkton packet, loc 284, Baseline) → also `employee_id 6911`. This slot was created for the **new-hire Luka Selsek**.
- **Luka Selsek does not exist as an employee in either `employees.json` snapshot.** `employee_id 6911 = Connor Garding` in both, `updated_at = ""` (empty).

Sequence: the Yorkton import (instance X, 16:33) created a new employee "Luka Selsek" and got `employee_id 6911` from *its* counter, plus test 7300 → 6911. A Tisdale/Humboldt import (instance Y) created "Connor Garding" and also got `employee_id 6911` from *its* counter. On merge by `employee_id`, the two 6911 rows collapsed to one; Garding won (his row was the last written to the shared `employees.json`). Selsek's employee row was deleted, but **test 7300 still points at 6911**, so the Yorkton packet now shows Garding — a real minor's test, mis-filed, not a fabricated record.

> Verdict on brief's hypothesis 2 (matching key) and 3 (new-hire): the *matching key* (name + location) is a real weakness, but the Garding attachment is **not** a fuzzy/array-index mismatch. It is an **autoincrement `employee_id` collision** between two new-hire inserts on two instances. Yeadon's "4881 → 6502" is a *different* phenomenon: correct human, matched by name into the **wrong duplicate location record** (284 vs 166).

### C. Wrong location — stamped 284 (AB) instead of 166 (SK)

The packet says `location_id: 166`. Resolution (`incoming.js:362-367`, `import-confirm.js:347-352`) requires `location_id = 166 AND company_id = 31 AND active = 1`. **166 is `active = 0`**, so it returns nothing. The name fallback in the mismatch pathway requires `active = 1` too (`incoming.js:483`, `resolveLocation`), and 284's name (`#731 Yorkton`) ≠ the packet's `#731 Yorkton, SK`, so nothing matches → the packet is **parked as a location mismatch** (`incoming.js:279-286`).

Staff then import it through the mismatch UI, whose suggester (`incoming.js:492`/`import-confirm.js:494` `suggestLocation`/`suggestLocationId`) does `packetName.includes(locationName)` → `"#731 yorkton, sk".includes("#731 yorkton")` → **284**, and pre-selects it. The import lands on the AB duplicate. Weyburn behaves identically (→ 285).

> Verdict on brief's hypothesis 5: **confirmed** — location is effectively resolved by **name into an active duplicate**, and the province-correct record being deactivated is what forces it there.

---

## 5. The sync/coordination symptoms (Heather & Judy)

Same root fault, observed from the front office:

- **Split brain:** `tests.json` (max id 7305, 7301 rows) and `tests-CA21WW6R6Q673.json` (max id 7300, 7296 rows) are two *divergent* copies of the same table written by two instances/devices. `employees-…`, `packets-…` similarly. These device-suffixed files are the residue of instances writing past each other with **no `If-Match`/eTag concurrency control** (`sync-folder.js:170-176` `writeJsonFile` just overwrites).
- **"Different packets in each dashboard / some auto-import, some don't":** every instance runs a 60s heartbeat (`app.js:228-242` `startHeartbeat`) that calls `syncMaster` *and* `scanAndImportInbox` (`incoming.js:178`). Two heartbeats race on the same OneDrive `inbox/`: whichever fires first `moveJsonFile`s the packet to `archive/` and imports it under *its* counters; the other sees an empty inbox. Merends then reconcile by colliding ids.
- **"Humboldt report showed for one, then blank for both":** classic **lost update**. `syncMaster` reads the cloud snapshot, unions it with local, `DELETE`s the whole table, re-inserts, and pushes the whole file. Two instances that read the same snapshot and each import a different packet will each push a file missing the other's new rows; the last push wins and the earlier instance's rows disappear on its next pull.
- **Heartbeat push gate:** `startHeartbeat` only pushes when `countPendingRows() > 0` (`app.js:234-235`), and pending is measured by `updated_at > last_synced_at`. Merge re-inserts don't reliably bump `updated_at`, so an instance can pull-and-clobber without ever pushing its view back — widening divergence.

> Verdict on brief's hypothesis 6 (concurrency): **confirmed**, and it is the same fault as A/B — there is no single-writer coordination for OPFS and no optimistic concurrency for the OneDrive JSON.

---

## 6. Why the naïve fixes are wrong (constraints on recovery)

- **Don't hand-INSERT the 5 missing tests.** Their `classification`, `sts_flag`, `shift_db`, referral flags and counsel text must come from the rule engine (`shared/classification/engine.js:40` `classify(current, baseline, rules)`) against each worker's baseline and the SK rules carried in the packet. Selsek has **no baseline** (new hire) — the engine must treat a first test as a baseline, not compute a shift. The packet's stored tests even lack classification entirely, so a correct re-import must (re)compute it.
- **Don't blind-delete Garding's row (7300).** It is a real test for a real minor. It must be **re-associated with Garding's correct Tisdale record**, not destroyed. (His legitimate baseline is test 7295 at loc 282.)
- **Fix the pipeline first, then re-import the intact source file** so all six tests regenerate through the engine, idempotently. Clearing the 2 bad partial rows must happen *after* a DB backup and *before* the corrected re-import.
- **Province fix must fold into location de-duplication**, not just flip `province` on 284/285 — otherwise the duplicates persist and re-trap the next packet.

---

## 7. Root-cause statement (one paragraph)

MasterDB treats browser-local `AUTOINCREMENT` integers as if they were globally stable identities, then synchronizes multiple independent instances by **row-level merge keyed on those integers with destructive whole-table rewrite and last-writer-wins file push, and no optimistic-concurrency control**. On 2026-07-29 two instances imported different Saskatchewan Kal Tire packets concurrently; their `test_id`/`employee_id` counters collided, so the Yorkton new-hire's employee row was overwritten by a Tisdale new-hire (Garding), four Yorkton tests were destroyed by `test_id` collisions with the Weyburn import, and the whole event was invisible because both import loops swallow per-record errors with `continue` and never reconcile imported-count against the packet's `completed_tests` count. Two data traps aimed the import at the wrong store record to begin with: the province-correct SK locations (166/167) are deactivated while their AB duplicates (284/285) are active, and employees are matched by name within a location, so every worker exists twice and tests attach to whichever duplicate the mis-resolved location selects.

---

## 8. Fault → fix traceability (detail in the separate fix proposal)

| Failure | Root cause | Prevention |
|---|---|---|
| A. Partial import, silent | swallowed `continue`; no reconciliation; PK-collision merge | fail-loud reconciliation (imported == source count); throw-and-rollback on any per-record error; globally-unique IDs |
| B. Foreign record (Garding) | `employee_id` autoincrement collision across instances | UUID/instance-scoped IDs (or `(source_system,natural_key)`); deterministic match; quarantine on no-confident-match |
| C. Wrong location (284/285) | province-correct record deactivated; resolve-by-name-into-active-duplicate | resolve strictly by packet `location_id`; **merge** duplicate locations 166/284 & 167/285; never fall back to name |
| Sync symptoms | destructive merge + last-writer push, no eTag, dual heartbeat import | eTag/`If-Match` (412 → refetch/retry, 423 → skip); single-writer OPFS via Web Locks; single import owner |
