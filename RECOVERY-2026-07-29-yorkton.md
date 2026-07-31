# RECOVERY RUNBOOK — Yorkton (#731) packet, 2026-07-29

Companion to `INCIDENT-2026-07-29-yorkton.md`. **Review every step before running anything.**
You (Norm) run the DB writes; this document is the reviewed plan.

All SQL below is meant for **MasterDB → DB Browser → SQL box** (`db-browser.js`), which runs
against the live OPFS database. Every destructive step is preceded by a **preview SELECT** —
run the SELECT, confirm the rows, then run the change.

---

## ⚠️ Preconditions (do not skip)

1. **Single instance only.** Close every *other* MasterDB tab/window/computer (Heather, Judy,
   any second browser) for the whole maintenance window. The concurrency fault (colliding
   autoincrement ids + destructive merge) is **not fixed yet** — a second instance syncing
   mid-recovery can re-corrupt everything you just fixed. Agree a window with the office.
2. **Deploy the reconciliation fix first.** This pass added fail-loud reconciliation to the
   import (`shared/validation/reconcile-import.js`, wired into `incoming.js` and
   `import-confirm.js`). Make sure the recovering instance is running that code (hard-refresh /
   bump `sw.js` if needed) so the re-import in Step 5 is guarded.
3. **Backup.** MasterDB → Data Tools → **Export Database** (`.sqlite`). Also copy the current
   sync JSONs aside (`tests.json`, `employees.json`, `locations.json`, `baselines.json`,
   `packets.json`, and the `*-CA21WW6R6Q673.json` split-brain copies) into a dated folder.
   Do not proceed until you have the `.sqlite` file saved locally.

> **Scope note:** this runbook fixes the **Yorkton (#731 / loc 166↔284)** packet. The
> **Weyburn (#733 / loc 167↔285)** packet was hit by the same duplicate-location trap and
> lands in Step 3 (location de-dupe covers both stores). If you also need to fully rebuild the
> Weyburn packet, repeat Steps 2/4/5 with its file after Step 3.

---

## Step 1 — Confirm the current bad state

```sql
-- Yorkton packet should show exactly 2 rows: Yeadon on 284, and a "Garding" Baseline on 284.
SELECT t.test_id, t.employee_id, e.first_name, e.last_name,
       t.location_id, l.name AS loc_name, l.province, t.test_type
FROM tests t
LEFT JOIN employees e ON e.employee_id = t.employee_id
LEFT JOIN locations l ON l.location_id = t.location_id
WHERE t.packet_id = 'SK-KalTire-731YorktonSK-20260729-CS';
```
Expected: 2 rows, both `location_id = 284` (AB). One is Ken Yeadon; the other resolves to
**Connor Garding** — that row is actually **Luka Selsek's** audiogram mis-filed under Garding's
employee id (verified: its thresholds are Selsek's, not Garding's).

```sql
-- Garding's REAL record — must remain untouched by this whole runbook.
SELECT test_id, employee_id, location_id, test_date, test_type
FROM tests WHERE test_id = 7295;          -- Garding baseline @ loc 282, packet ...20260728-CS
SELECT baseline_id, employee_id, location_id, test_date FROM baselines
WHERE employee_id = 6911;                  -- expect TWO: 6343 (loc 284, CORRUPT) + 6344 (loc 282, REAL)
```

```sql
-- The duplicate-location trap: SK record inactive, AB duplicate active.
SELECT location_id, name, province, active FROM locations
WHERE location_id IN (166, 284, 167, 285) ORDER BY location_id;
-- Expect 166 #731 Yorkton, SK / SK / active 0   ← correct but disabled
--        284 #731 Yorkton      / AB / active 1   ← wrong province but enabled
--        167 #733 Weyburn, SK  / SK / active 0
--        285 #733 Weyburn      / AB / active 1
```

---

## Step 2 — Remove the corrupt partial Yorkton rows

These are the 2 junk test rows + the poisoned baseline. Garding's real data (test 7295,
baseline 6344 @ loc 282) is **not** referenced here and stays intact.

```sql
-- Preview exactly what will be deleted:
SELECT test_id, employee_id, location_id, test_type, test_date
FROM tests WHERE packet_id = 'SK-KalTire-731YorktonSK-20260729-CS';           -- the 2 junk tests
SELECT baseline_id, employee_id, location_id, test_date
FROM baselines WHERE location_id = 284 AND test_date = '2026-07-29';          -- baseline 6343 (Selsek-as-Garding)
```

```sql
-- Delete (run after the previews look right):
DELETE FROM hpd_assessments
 WHERE test_id IN (SELECT test_id FROM tests WHERE packet_id = 'SK-KalTire-731YorktonSK-20260729-CS');
DELETE FROM tests
 WHERE packet_id = 'SK-KalTire-731YorktonSK-20260729-CS';
DELETE FROM baselines
 WHERE location_id = 284 AND test_date = '2026-07-29';                        -- removes the corrupt Garding baseline 6343 only
```

Re-check Garding is unharmed:
```sql
SELECT test_id, location_id FROM tests WHERE test_id = 7295;                   -- still there, loc 282
SELECT baseline_id, location_id FROM baselines WHERE employee_id = 6911;       -- only 6344 (loc 282) remains
```

---

## Step 3 — Fix trap C: merge the duplicate locations (province fix)

Direction is **AB duplicate → SK canonical** (284→166, 285→167). This is the **opposite** of
the existing "🔧 Fix SK-suffix Locations" preset in DB Browser — **do not run that preset**, it
consolidates onto the AB record and stamps SK workers as AB (see incident report §4C). A
corrected preset ships with this pass; use the SQL below.

```sql
-- Preview: how many child rows move from each AB duplicate.
SELECT 284 AS from_loc,
  (SELECT COUNT(*) FROM employees WHERE location_id=284) AS emps,
  (SELECT COUNT(*) FROM tests     WHERE location_id=284) AS tests,
  (SELECT COUNT(*) FROM baselines WHERE location_id=284) AS baselines
UNION ALL SELECT 285,
  (SELECT COUNT(*) FROM employees WHERE location_id=285),
  (SELECT COUNT(*) FROM tests     WHERE location_id=285),
  (SELECT COUNT(*) FROM baselines WHERE location_id=285);
```

```sql
-- 3a. Repoint every child row from the AB duplicates onto the SK canonicals.
UPDATE tests      SET location_id = 166 WHERE location_id = 284;
UPDATE baselines  SET location_id = 166 WHERE location_id = 284;
UPDATE employees  SET location_id = 166 WHERE location_id = 284;
UPDATE packets    SET location_id = 166 WHERE location_id = 284;
UPDATE employment SET location_id = 166 WHERE location_id = 284;
UPDATE schedules  SET location_id = 166 WHERE location_id = 284;

UPDATE tests      SET location_id = 167 WHERE location_id = 285;
UPDATE baselines  SET location_id = 167 WHERE location_id = 285;
UPDATE employees  SET location_id = 167 WHERE location_id = 285;
UPDATE packets    SET location_id = 167 WHERE location_id = 285;
UPDATE employment SET location_id = 167 WHERE location_id = 285;
UPDATE schedules  SET location_id = 167 WHERE location_id = 285;

-- 3b. Reactivate the province-correct SK records; retire the AB duplicates.
UPDATE locations SET active = 1, province = 'SK', updated_at = datetime('now') WHERE location_id IN (166, 167);
UPDATE locations SET active = 0,                 updated_at = datetime('now') WHERE location_id IN (284, 285);
```

> If `employment` or `schedules` doesn't exist / is empty on your DB, those UPDATEs are
> harmless no-ops.

---

## Step 3.5 — De-duplicate the employees now doubled at 166/167

Repointing merged two copies of each worker onto one location (e.g. Ken Yeadon existed as
`4881`@166 **and** `6502`@284, now both at 166). Collapse them so the re-import matches one
canonical person.

Use **MasterDB → Data Tools → Merge Duplicate Employees** (`data-tools.js`), which finds
same name+location duplicates and repoints tests/baselines onto the kept record. Review each
pair; keep the record with the fuller history. Do this for #731 Yorkton (166) and, if
rebuilding Weyburn, #733 Weyburn (167).

Verify no name is doubled at 166 before continuing:
```sql
SELECT first_name, last_name, COUNT(*) n
FROM employees WHERE location_id = 166
GROUP BY LOWER(first_name), LOWER(last_name) HAVING n > 1;
-- Expect: no rows.
```

---

## Step 4 — Re-import the intact source packet through the fixed pipeline

1. In the sync folder, copy the source packet back into the inbox:
   `archive/FINAL_KalTire-731YorktonSK_2026-07-29_CS.json` → `inbox/`
   (keep the archive copy; just copy it).
2. In MasterDB: **Incoming → Check Sync Folder** (or wait for the 60s heartbeat).

What happens now, with the fixes in place:
- Location resolves by the packet's own `location_id 166`, which is now active & SK.
- The 5 returning workers match by name to their single canonical record at 166.
- Luka Selsek (new hire, `baseline: null`) is created fresh as a new employee with a fresh
  baseline — no id collision because you're on a single instance.
- **Reconciliation runs before COMMIT.** It asserts all 6 completed tests are accounted for,
  all sit on location 166, and 166's province matches the packet (SK). If anything is off,
  the **whole packet rolls back** and the error names the failing assertion — you will not get
  a silent partial this time.

---

## Step 5 — Verify the re-import

```sql
SELECT t.test_id, e.first_name, e.last_name, t.location_id, l.province,
       t.test_type, t.classification
FROM tests t
JOIN employees e ON e.employee_id = t.employee_id
JOIN locations l ON l.location_id = t.location_id
WHERE t.packet_id = 'SK-KalTire-731YorktonSK-20260729-CS'
ORDER BY e.last_name;
```
Expected: **6 rows**, every `location_id = 166`, every `province = SK`, names =
Demetriow, Martin, Roizman, Turner, Yeadon, Selsek. **No Garding.**

```sql
SELECT test_id, location_id FROM tests WHERE test_id = 7295;   -- Garding real: still loc 282, untouched
```

---

## Step 6 — Push and reopen

1. Click the sync indicator (☁ / ⟳) to push the corrected data to OneDrive.
2. Confirm `tests.json` / `employees.json` / `locations.json` on OneDrive reflect the fix.
3. Only then let Heather/Judy/other instances reconnect — and have them **hard-refresh** so
   they pull the corrected state and the reconciliation code.

---

## Known limitation carried into the next pass

- **Classification / STS is still NULL on re-import.** Verified: *none* of the 149 completed
  tests across all archived packets carry a `classification` — TechTool doesn't embed one, and
  the import doesn't run the rule engine. So the re-imported Yorkton tests will be clinically
  *placed correctly* (right person, right SK location, all six present) but will have
  `classification = NULL`, exactly like every other packet-imported test today. Do **not**
  hand-write classifications. Regenerating them through `classify(current, baseline, rules)`
  (`shared/classification/engine.js`) at import time is part of the deferred ID/sync/engine
  pass, and should be run across the affected SK packets together once that lands.
- **The concurrency fault is still live.** Until globally-unique ids + eTag/`If-Match` +
  single-writer coordination are in (next pass), keep multi-user imports serialized and do
  bulk maintenance on a single instance during an agreed window.

---

## Rollback

If any step looks wrong, stop and **re-import the `.sqlite` backup** from Step 0 via
Data Tools → Import Database, then reload. Because you worked on a single instance with others
offline, restoring the backup fully reverts the recovery.
