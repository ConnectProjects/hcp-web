/**
 * db/demo.js
 * Demo data for MasterDB — loads realistic sample companies, locations,
 * employees, baselines, and tests so the app is immediately explorable
 * without real data.
 *
 * Demo records are identified by sticky_notes containing '[DEMO]' on
 * their company row, making them easy to find and delete cleanly.
 *
 * Call loadDemoData() once. Call isDemoLoaded() to check first.
 * Call clearDemoData() to remove all demo records.
 */

import { run, query, queryOne } from './sqlite.js'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isDemoLoaded() {
  return (queryOne('SELECT value FROM settings WHERE key = ?', ['demo_loaded'])?.value ?? null) === '1'
}

export function loadDemoData() {
  if (isDemoLoaded()) return

  // Techs
  run(`INSERT OR IGNORE INTO techs (tech_id, name, initials, email, role)
       VALUES ('NR', 'Nick Rossiter', 'NR', 'nrossiter@connecthearing.ca', 'tech')`)
  run(`INSERT OR IGNORE INTO techs (tech_id, name, initials, email, role)
       VALUES ('KL', 'Karen Legault', 'KL', 'klegault@connecthearing.ca', 'tech')`)

  // ----- Company 1: Demo Mining Corp. --------------------------------------
  run(`INSERT INTO companies (name, city, contact_name, contact_phone, sticky_notes)
       VALUES (
         'Demo Mining Corp.', 'Calgary',
         'Dave Hartley', '403-555-0100',
         '[DEMO] Sample company — safe to delete via Settings → Clear Demo Data'
       )`)
  const miningCoId = queryOne('SELECT last_insert_rowid() AS id')?.id

  // Location: Calgary Plant (AB)
  run(`INSERT INTO locations
       (company_id, name, province, address, city, contact_name, contact_phone,
        hpd_inventory, sticky_notes)
       VALUES (?, 'Calgary Plant', 'AB',
         '1 Industrial Park', 'Calgary',
         'Dave Hartley', '403-555-0100',
         '[{"make_model":"3M E-A-R Classic","nrr":29,"type":"Earplug"},{"make_model":"Peltor Optime II","nrr":30,"type":"Earmuff"}]',
         '[DEMO]')`,
    [miningCoId])
  const miningLocId = queryOne('SELECT last_insert_rowid() AS id')?.id

  insertEmployee(miningLocId, 'Alice',  'Bergeron',  'Equipment Operator', 'AB',
    { date: '2023-03-10', L: [10,15,15,20,25,25,20], R: [15,15,20,25,30,30,25] },
    [{ date: '2024-03-15', type: 'Periodic', cls: 'N',
       L: [10,15,15,20,25,25,20], R: [15,15,20,25,30,30,25],
       counsel: 'Your hearing is within normal limits. Continue using your hearing protection consistently.' }]
  )

  insertEmployee(miningLocId, 'Marco', 'Pelletier', 'Drill Operator', 'AB',
    null,
    [{ date: '2024-09-20', type: 'Baseline', cls: 'N',
       L: [10,10,15,15,20,20,15], R: [10,15,15,20,25,25,20],
       counsel: 'This is your initial baseline hearing test. Your hearing is within normal limits.' }]
  )

  insertEmployee(miningLocId, 'Diane', 'Tremblay', 'Maintenance Tech', 'AB',
    { date: '2022-06-20', L: [20,20,25,30,35,40,30], R: [20,25,30,35,40,45,35] },
    [{ date: '2023-01-10', type: 'Periodic', cls: 'EW', shift: 12, freq: 4000, ear: 'right',
       sts: true,
       counsel: 'An early warning threshold shift has been noted at 4000 Hz in your right ear. Please ensure consistent use of hearing protection and schedule a retest in 6 months.' }]
  )

  insertEmployee(miningLocId, 'Robert', 'Côté', 'Blaster', 'AB',
    { date: '2021-05-15', L: [10,10,15,15,20,20,15], R: [10,10,15,15,20,25,15] },
    [{ date: '2022-08-20', type: 'Periodic', cls: 'A', shift: 25, freq: 4000, ear: 'right',
       sts: true,
       counsel: 'An abnormal threshold shift has been identified. A medical referral is required. Please see an audiologist as soon as possible.' }]
  )

  // ----- Company 2: Demo Forestry Inc. -------------------------------------
  run(`INSERT INTO companies (name, city, contact_name, contact_phone, sticky_notes)
       VALUES (
         'Demo Forestry Inc.', 'Prince George',
         'Sandra Okafor', '250-555-0200',
         '[DEMO] Sample company — safe to delete via Settings → Clear Demo Data'
       )`)
  const forestryCoId = queryOne('SELECT last_insert_rowid() AS id')?.id

  // Location: Prince George Mill (BC)
  run(`INSERT INTO locations
       (company_id, name, province, address, city, contact_name, contact_phone,
        hpd_inventory, sticky_notes)
       VALUES (?, 'Prince George Mill', 'BC',
         '400 Mill Road', 'Prince George',
         'Sandra Okafor', '250-555-0200',
         '[{"make_model":"Howard Leight LPF-1","nrr":25,"type":"Earplug"},{"make_model":"Peltor H10A","nrr":30,"type":"Earmuff"}]',
         '[DEMO]')`,
    [forestryCoId])
  const forestryLocId = queryOne('SELECT last_insert_rowid() AS id')?.id

  insertEmployee(forestryLocId, 'Sarah', 'Johnson', 'Chainsaw Operator', 'BC',
    { date: '2023-01-15', L: [15,15,20,20,25,25,20], R: [10,15,20,20,25,30,20] },
    [{ date: '2024-10-20', type: 'Periodic', cls: 'NC',
       L: [15,15,20,20,25,25,20], R: [10,15,20,20,25,30,20],
       counsel: 'No change in your hearing since your last test. Your hearing protection is working well.' }]
  )

  insertEmployee(forestryLocId, 'Mike', 'Chen', 'Equipment Operator', 'BC',
    { date: '2022-03-10', L: [15,15,20,25,30,30,25], R: [15,20,25,30,35,35,30] },
    [{ date: '2023-06-15', type: 'Periodic', cls: 'EWC', shift: 15, freq: 3000, ear: 'left',
       sts: true,
       counsel: 'An early warning change has been noted at 3000 Hz in your left ear compared to your baseline. Please ensure you are consistently wearing hearing protection in all noisy areas. A retest is recommended within 12 months.' }]
  )

  insertEmployee(forestryLocId, 'Tom', 'Wilson', 'Supervisor', 'BC',
    null, []
  )

  // Mark as loaded
  run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_loaded', '1')`)
}

export function clearDemoData() {
  const demos  = query(`SELECT company_id FROM companies WHERE sticky_notes LIKE '%[DEMO]%'`)
  const ids    = demos.map(r => r.company_id)

  if (ids.length === 0) {
    run(`DELETE FROM settings WHERE key = 'demo_loaded'`)
    return
  }

  const cPlaceholders = ids.map(() => '?').join(',')

  // Get location IDs
  const locs   = query(`SELECT location_id FROM locations WHERE company_id IN (${cPlaceholders})`, ids)
  const locIds = locs.map(r => r.location_id)

  if (locIds.length > 0) {
    const lPlaceholders = locIds.map(() => '?').join(',')

    // Get employee IDs
    const emps   = query(`SELECT employee_id FROM employees WHERE location_id IN (${lPlaceholders})`, locIds)
    const empIds = emps.map(r => r.employee_id)

    if (empIds.length > 0) {
      const ePlaceholders = empIds.map(() => '?').join(',')

      // Get test IDs
      const tests   = query(`SELECT test_id FROM tests WHERE employee_id IN (${ePlaceholders})`, empIds)
      const testIds = tests.map(r => r.test_id)

      if (testIds.length > 0) {
        const tPlaceholders = testIds.map(() => '?').join(',')
        run(`DELETE FROM hpd_assessments WHERE test_id    IN (${tPlaceholders})`, testIds)
        run(`DELETE FROM tests            WHERE test_id    IN (${tPlaceholders})`, testIds)
      }

      run(`DELETE FROM baselines  WHERE employee_id IN (${ePlaceholders})`, empIds)
      run(`DELETE FROM employment WHERE employee_id IN (${ePlaceholders})`, empIds)
      run(`DELETE FROM employees  WHERE employee_id IN (${ePlaceholders})`, empIds)
    }

    run(`DELETE FROM packets   WHERE location_id IN (${lPlaceholders})`, locIds)
    run(`DELETE FROM locations WHERE location_id IN (${lPlaceholders})`, locIds)
  }

  run(`DELETE FROM schedules WHERE company_id IN (${cPlaceholders})`, ids)
  run(`DELETE FROM packets   WHERE company_id IN (${cPlaceholders})`, ids)
  run(`DELETE FROM companies WHERE company_id IN (${cPlaceholders})`, ids)

  // Remove demo techs only if no real tests reference them
  const nrUsed = queryOne(`SELECT COUNT(*) AS n FROM tests WHERE tech_id = 'NR'`)?.n ?? 0
  const klUsed = queryOne(`SELECT COUNT(*) AS n FROM tests WHERE tech_id = 'KL'`)?.n ?? 0
  if (nrUsed === 0) run(`DELETE FROM techs WHERE tech_id = 'NR'`)
  if (klUsed === 0) run(`DELETE FROM techs WHERE tech_id = 'KL'`)

  run(`DELETE FROM settings WHERE key = 'demo_loaded'`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertEmployee(locationId, firstName, lastName, jobTitle, province, baseline, tests) {
  run(`INSERT INTO employees (location_id, first_name, last_name, job_title, status)
       VALUES (?, ?, ?, ?, 'active')`,
    [locationId, firstName, lastName, jobTitle])
  const empId = queryOne('SELECT last_insert_rowid() AS id')?.id

  if (baseline) {
    run(`INSERT INTO baselines
         (employee_id, location_id, test_date, archived,
          left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k,
          right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empId, locationId, baseline.date,
       ...baseline.L,
       ...baseline.R]
    )
  }

  for (const t of tests) {
    run(`INSERT INTO tests
         (employee_id, location_id, test_date, tech_id, test_type, province,
          left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k,
          right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k,
          classification, triggering_freq_hz, triggering_ear, shift_db,
          sts_flag, counsel_text, packet_id)
         VALUES (?, ?, ?, 'NR', ?, ?,
                 ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?, ?)`,
      [empId, locationId, t.date, t.type, province,
       ...(t.L ?? [null,null,null,null,null,null,null]),
       ...(t.R ?? [null,null,null,null,null,null,null]),
       t.cls ? JSON.stringify({
         category:          t.cls,
         triggered_rule_id: null,
         triggering_freq_hz: t.freq  ?? null,
         triggering_ear:     t.ear   ?? null,
         shift_db:           t.shift ?? null
       }) : null,
       t.freq  ?? null,
       t.ear   ?? null,
       t.shift ?? null,
       t.sts ? 1 : 0,
       t.counsel ?? null,
       'DEMO_PACKET'
      ]
    )
  }
}

function offsetDate(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
