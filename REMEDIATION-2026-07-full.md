# FULL REMEDIATION RUNBOOK — July 2026 import corruption

Fixes the whole blast radius from `SWEEP-2026-07-hcp-import.md`: 21 duplicate
location pairs, ~35 duplicate test groups, and 8 mis-imported packets. Supersedes
the Yorkton-only `RECOVERY-2026-07-29-yorkton.md` (Yorkton is Packet #7 below).

**Run top to bottom. Preview SELECT → verify → run the change. Do not batch ahead.**
All SQL goes in **MasterDB → DB Browser → SQL box**. You (Norm) execute; this is the
reviewed plan.

---

## Phase 0 — Preconditions (mandatory)

1. **Stop-gap is live.** Everyone on v5 (hard-refresh); the import-owner box is set on
   exactly one computer. See `OPERATIONS-import-sync.md`.
2. **Freeze.** Do this on **one** computer with **every other MasterDB closed** for the
   whole window. No one imports or edits during remediation.
3. **Backup.** Settings → Export Backup (.sqlite). Copy the sync JSONs aside too. Do not
   continue until the `.sqlite` file is saved locally.
4. Work through the phases **in order** — later phases assume earlier ones are done.

Snapshot the starting counts so you can sanity-check at the end:
```sql
SELECT (SELECT COUNT(*) FROM tests) AS tests,
       (SELECT COUNT(*) FROM employees) AS emps,
       (SELECT COUNT(*) FROM baselines) AS baselines,
       (SELECT COUNT(*) FROM locations WHERE active=1) AS active_locs;
```

---

## Phase 1 — Merge duplicate locations (foundation)

Every affected SK store exists twice: an active duplicate `"#NNN Town"` and a
deactivated canonical `"#NNN Town, SK"`. We consolidate onto the `", SK"` canonical
(province-correct) and retire the duplicate. Direction: **duplicate → ", SK"**.

### 1a. Preview the pairs (should list ~21 rows)
```sql
SELECT dup.location_id AS dup_id, dup.name AS dup_name, dup.province AS dup_prov, dup.active AS dup_active,
       sk.location_id  AS sk_id,  sk.name  AS sk_name,   sk.active AS sk_active,
       (SELECT COUNT(*) FROM tests     WHERE location_id=dup.location_id) AS dup_tests,
       (SELECT COUNT(*) FROM employees WHERE location_id=dup.location_id) AS dup_emps
FROM locations dup
JOIN locations sk ON sk.company_id = dup.company_id AND sk.name = dup.name || ', SK'
WHERE sk.name LIKE '%, SK'
ORDER BY dup.name;
```
Confirm each `dup_name` truly is the same store as `sk_name`. If any pair looks wrong,
stop and tell me.

### 1b. Repoint every child row from duplicate → canonical (all pairs at once)
Run each statement; each uses the same pairing sub-query.
```sql
UPDATE tests SET location_id = (
  SELECT sk.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK'
  WHERE dup.location_id = tests.location_id)
WHERE location_id IN (
  SELECT dup.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK' WHERE sk.name LIKE '%, SK');

UPDATE baselines SET location_id = (
  SELECT sk.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK'
  WHERE dup.location_id = baselines.location_id)
WHERE location_id IN (
  SELECT dup.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK' WHERE sk.name LIKE '%, SK');

UPDATE employees SET location_id = (
  SELECT sk.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK'
  WHERE dup.location_id = employees.location_id)
WHERE location_id IN (
  SELECT dup.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK' WHERE sk.name LIKE '%, SK');

UPDATE packets SET location_id = (
  SELECT sk.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK'
  WHERE dup.location_id = packets.location_id)
WHERE location_id IN (
  SELECT dup.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK' WHERE sk.name LIKE '%, SK');
```
`employment` and `schedules` may not exist / be empty — if they do exist, repeat the same
pattern for them.

### 1c. Flip the active flags
```sql
-- reactivate the ", SK" canonicals we just merged onto
UPDATE locations SET active=1, province='SK', updated_at=datetime('now')
WHERE name LIKE '%, SK' AND location_id IN (
  SELECT sk.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK');

-- retire the duplicates
UPDATE locations SET active=0, updated_at=datetime('now')
WHERE location_id IN (
  SELECT dup.location_id FROM locations dup JOIN locations sk
    ON sk.company_id=dup.company_id AND sk.name=dup.name||', SK' WHERE sk.name LIKE '%, SK');
```

### 1d. Verify — no tests/employees left on any retired duplicate
```sql
SELECT l.location_id, l.name, l.active,
       (SELECT COUNT(*) FROM tests t WHERE t.location_id=l.location_id) AS tests,
       (SELECT COUNT(*) FROM employees e WHERE e.location_id=l.location_id) AS emps
FROM locations l WHERE l.active=0 AND l.name NOT LIKE '%, SK'
  AND EXISTS (SELECT 1 FROM locations sk WHERE sk.company_id=l.company_id AND sk.name=l.name||', SK');
-- Every retired duplicate should now show tests=0 and emps=0.
```

### 1e. CSN / Klassen — handle separately (NOT a ", SK" pair)
The KlassenSwift packet split across locations **11** and **309** ("Klassen - Swift
Current"), a CSN company duplicate the query above does not touch. Preview and pick the
canonical (keep the one with real history / correct company), then repoint the other onto
it and deactivate it — same pattern as 1b/1c but for that one pair:
```sql
SELECT location_id, company_id, name, province, active,
       (SELECT COUNT(*) FROM tests WHERE location_id=l.location_id) AS tests,
       (SELECT COUNT(*) FROM employees WHERE location_id=l.location_id) AS emps
FROM locations l WHERE location_id IN (11, 309);
-- Decide canonical (call it KEEP, the other DROP), then:
-- UPDATE tests SET location_id=<KEEP> WHERE location_id=<DROP>;
-- UPDATE baselines SET location_id=<KEEP> WHERE location_id=<DROP>;
-- UPDATE employees SET location_id=<KEEP> WHERE location_id=<DROP>;
-- UPDATE packets SET location_id=<KEEP> WHERE location_id=<DROP>;
-- UPDATE locations SET active=0, updated_at=datetime('now') WHERE location_id=<DROP>;
```

---

## Phase 2 — De-duplicate employees at the merged locations

Repointing left two copies of each worker on the canonical location (e.g. Ken Yeadon as
both `4881` and `6502`, now both on 166). Collapse them **before** re-importing.

Use **MasterDB → Data Tools → Merge Duplicate Employees**. It finds same name+location
duplicates and repoints tests/baselines onto the kept record. Review each pair; keep the
record with the fuller history. Do this for every affected SK store.

Verify no name is doubled at any active location:
```sql
SELECT location_id, first_name, last_name, COUNT(*) n
FROM employees
GROUP BY location_id, LOWER(first_name), LOWER(last_name)
HAVING n > 1
ORDER BY location_id;
-- Expect: no rows (or only genuine same-name different-person cases you confirm by DOB).
```

---

## Phase 3 — Rebuild the 8 mis-imported packets

Uniform method for every packet: **delete its imported rows, then re-import the source
file once** through the now-guarded pipeline (reconciliation makes it all-or-nothing).
Works for both the over-imports (duplicates) and the under-imports (loss).

| # | packet_id | source file (in `archive/`) | canonical loc | visit | expect |
|---|---|---|---|---|---|
| 1 | SK-KalTire-20260720-CS | FINAL_KalTire_2026-07-20_CS.json | 168 #734 Swift Current, SK | 2026-07-20 | 8 |
| 2 | SK-CSN-KlassenSwift-20260720-CS | FINAL_CSN-KlassenSwift_2026-07-20_CS.json | (Phase 1e KEEP) | 2026-07-20 | 7 |
| 3 | SK-KalTire-704ReginaSK-20260721-CS | FINAL_KalTire-704ReginaSK_2026-07-21_CS.json | 152 #704 Regina, SK | 2026-07-21 | 4 |
| 4 | SK-KalTire-705ReginaSK-20260721-CS | FINAL_KalTire-705ReginaSK_2026-07-21_CS.json | 153 #705 Regina, SK | 2026-07-21 | 11 |
| 5 | SK-KalTire-736MooseJawS-20260721-CS | FINAL_KalTire-736MooseJawS_2026-07-21_CS.json | 170 #736 Moose Jaw, SK | 2026-07-21 | 8 |
| 6 | SK-KalTire-721HumboldtS-20260728-CS | FINAL_KalTire-721HumboldtS_2026-07-28_CS.json | 161 #721 Humboldt, SK | 2026-07-28 | 2 |
| 7 | SK-KalTire-731YorktonSK-20260729-CS | FINAL_KalTire-731YorktonSK_2026-07-29_CS.json | 166 #731 Yorkton, SK | 2026-07-29 | 6 |
| 8 | SK-KalTire-20260730-CS | FINAL_KalTire_2026-07-30_CS.json | 150 #702 Assiniboia, SK | 2026-07-30 | 5 |

### 3a. Delete the old rows (do all 8, then re-import all 8)
```sql
-- Preview what will be removed for one packet (repeat per packet_id):
SELECT test_id, employee_id, location_id, test_date, test_type
FROM tests WHERE packet_id = 'SK-KalTire-20260720-CS';

-- Delete tests + their HPD rows for all 8 packets:
DELETE FROM hpd_assessments WHERE test_id IN (
  SELECT test_id FROM tests WHERE packet_id IN (
    'SK-KalTire-20260720-CS','SK-CSN-KlassenSwift-20260720-CS',
    'SK-KalTire-704ReginaSK-20260721-CS','SK-KalTire-705ReginaSK-20260721-CS',
    'SK-KalTire-736MooseJawS-20260721-CS','SK-KalTire-721HumboldtS-20260728-CS',
    'SK-KalTire-731YorktonSK-20260729-CS','SK-KalTire-20260730-CS'));

DELETE FROM tests WHERE packet_id IN (
  'SK-KalTire-20260720-CS','SK-CSN-KlassenSwift-20260720-CS',
  'SK-KalTire-704ReginaSK-20260721-CS','SK-KalTire-705ReginaSK-20260721-CS',
  'SK-KalTire-736MooseJawS-20260721-CS','SK-KalTire-721HumboldtS-20260728-CS',
  'SK-KalTire-731YorktonSK-20260729-CS','SK-KalTire-20260730-CS');
```

### 3b. Remove baselines created by those imports (so re-import doesn't stack them)
```sql
-- Preview: baselines on the canonical locations dated to those visits.
SELECT b.baseline_id, e.first_name, e.last_name, b.location_id, b.test_date, b.archived
FROM baselines b JOIN employees e ON e.employee_id=b.employee_id
WHERE (b.location_id=168 AND b.test_date='2026-07-20')
   OR (b.location_id=152 AND b.test_date='2026-07-21')
   OR (b.location_id=153 AND b.test_date='2026-07-21')
   OR (b.location_id=170 AND b.test_date='2026-07-21')
   OR (b.location_id=161 AND b.test_date='2026-07-28')
   OR (b.location_id=166 AND b.test_date='2026-07-29')
   OR (b.location_id=150 AND b.test_date='2026-07-30');
-- Include the Klassen KEEP location + 2026-07-20 once you know its id.
-- After reviewing, DELETE those baseline_ids. Garding's real baseline (loc 282) is NOT
-- in this list and must stay.
```

### 3c. Re-import the source files
Copy these 8 files from the sync folder's `archive/` back into `inbox/` (keep the archive
copies), then in MasterDB: **Incoming → Check Sync Folder**. Because you're the frozen
single instance with the owner flag on, they import here, onto the active `", SK"`
canonicals, guarded by reconciliation.

If any packet **rolls back with a reconciliation error**, that's the safety net — read the
message (it names the failing assertion: count, location, or province), fix that item
(usually a missed employee/location dedupe), and re-drop that one file into `inbox/`.

---

## Phase 4 — Global duplicate-test sweep (catch anything outside the 8)

The sweep found ~35 duplicate emp+date groups; Phases 1–3 clear the packet-linked ones.
Check for any stragglers (same worker, same day, same thresholds = a true duplicate):
```sql
SELECT employee_id, test_date, COUNT(*) n,
       GROUP_CONCAT(test_id) AS test_ids
FROM tests
WHERE test_date >= '2026-01-01'
GROUP BY employee_id, test_date,
         left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
         right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k
HAVING n > 1
ORDER BY test_date;
```
For each group, keep the lowest `test_id`, delete the rest (and their `hpd_assessments`).
Review the list first — ignore the demo/test people (George Jungle, Frank Oz, Mary Poppins,
New Worker, Solo Employee) or delete them wholesale if you want them gone.

---

## Phase 5 — Verify and push

```sql
-- All 8 packets: correct count, on the ", SK" canonical, province SK, no strays.
SELECT t.packet_id, l.name AS location, l.province, COUNT(*) AS tests
FROM tests t JOIN locations l ON l.location_id=t.location_id
WHERE t.packet_id IN (
  'SK-KalTire-20260720-CS','SK-CSN-KlassenSwift-20260720-CS',
  'SK-KalTire-704ReginaSK-20260721-CS','SK-KalTire-705ReginaSK-20260721-CS',
  'SK-KalTire-736MooseJawS-20260721-CS','SK-KalTire-721HumboldtS-20260728-CS',
  'SK-KalTire-731YorktonSK-20260729-CS','SK-KalTire-20260730-CS')
GROUP BY t.packet_id, l.name, l.province;
-- Compare each count to the "expect" column in Phase 3. Each packet should be on ONE
-- ", SK" location, province SK.

-- No active duplicate locations remain:
SELECT location_id, name, active FROM locations
WHERE active=1 AND EXISTS (
  SELECT 1 FROM locations sk WHERE sk.company_id=locations.company_id AND sk.name=locations.name||', SK');
-- Expect: no rows.
```
Then click the sync indicator to **push** to OneDrive, confirm the JSONs updated, and only
then let the other computers hard-refresh and reconnect.

---

## Known limitation (unchanged from the incident)

Re-imported tests will have `classification = NULL` — TechTool doesn't embed a
classification and the import doesn't run the rule engine yet. Placement is correct (right
person, right SK location, right count); clinical classification/STS regeneration via
`classify()` is part of the deferred engine/UUID pass and should be run across these SK
packets together once it lands. Do not hand-write classifications.

## Rollback
Anything looks wrong → Data Tools → Import Database → your Phase-0 `.sqlite` backup →
reload. Single frozen instance means the backup is a clean revert.
