/**
 * masterdb2/db/wsbc-import.js — WorkSafeBC zip import
 *
 * parseWsbcZip(arrayBuffer)
 *   Unzip the WSBC employer package, parse CSVs, return a structured preview object.
 *
 * commitWsbcImport(parsed, writerName)
 *   Write the parsed data to the DB: create/update company + location + workers + tests.
 *   Returns { companyId, locationId, imported, newPersons, duplicates }.
 *
 * The WSBC zip contains:
 *   *_HearingTests_*.csv      — historical test records (same columns as File_Upload_Template)
 *   *_Locations_*.csv         — locations with Operating Location Number + address
 *   *_Technicians_*.csv       — tech roster (used for reference only)
 *   *_File_Upload_Template_*.csv — empty header-only CSV (returned as exportBlob after new tests)
 *   *_CUs_Template_*.csv      — CU codes (not imported)
 *   *_Occupational_Classification_*.csv — job codes (not imported)
 */

import { query, run, scalar, transaction, save } from './db.js'
import { getByUid, getActiveBaseline, create as createPerson, matchCandidates } from './workers.js'
import { classify } from '../../shared/classification/engine.js'

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    rows.push(splitCsvLine(line))
  }
  if (rows.length < 1) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(cols => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim() })
    return obj
  })
}

function splitCsvLine(line) {
  const fields = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { fields.push(cur); cur = '' }
      else cur += ch
    }
  }
  fields.push(cur)
  return fields
}

// ── Threshold column mapping ──────────────────────────────────────────────────

const CSV_TO_DB = {
  LeftEar05khz:  'left_500',
  LeftEar1khz:   'left_1k',
  LeftEar2khz:   'left_2k',
  LeftEar3khz:   'left_3k',
  LeftEar4khz:   'left_4k',
  LeftEar6khz:   'left_6k',
  LeftEar8khz:   'left_8k',
  RightEar05khz: 'right_500',
  RightEar1khz:  'right_1k',
  RightEar2khz:  'right_2k',
  RightEar3khz:  'right_3k',
  RightEar4khz:  'right_4k',
  RightEar6khz:  'right_6k',
  RightEar8khz:  'right_8k',
}

function mapThresholds(row) {
  const th = {}
  for (const [csv, db] of Object.entries(CSV_TO_DB)) {
    const v = parseFloat(row[csv])
    if (!isNaN(v)) th[db] = v
  }
  return th
}

function hasThresholdData(th) {
  return Object.keys(th).some(k => th[k] != null)
}

// Convert WSBC date YYYY/MM/DD to ISO YYYY-MM-DD
function wsbcDate(s) {
  if (!s) return null
  return s.replace(/\//g, '-')
}

// ── Zip parsing ───────────────────────────────────────────────────────────────

/**
 * Parse a WSBC employer zip (ArrayBuffer) using JSZip.
 * JSZip must be loaded as a <script> before calling this (window.JSZip).
 *
 * Returns:
 *   {
 *     employer: { id, name },
 *     location: { number, address },
 *     workers:  [{ wsbc_worker_id, first_name, middle_name, last_name, dob, sin_last_4, gender }],
 *     tests:    [{ wsbc_worker_id, test_date, wsbc_tech_id, thresholds, questionnaire }],
 *     techCount: N,
 *     csvHeaders: [string],   // File_Upload_Template column headers
 *   }
 */
export async function parseWsbcZip(arrayBuffer) {
  if (!window.JSZip) throw new Error('JSZip not loaded — include vendor/jszip.min.js before importing this module')

  const zip = await JSZip.loadAsync(arrayBuffer)

  let hearingTestsCsv = null
  let locationsCsv    = null
  let techniciansCsv  = null
  let uploadTemplate  = null

  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    const lc = name.toLowerCase()
    if (lc.includes('hearingtests'))              hearingTestsCsv = await file.async('string')
    else if (lc.includes('locations_template'))   locationsCsv    = await file.async('string')
    else if (lc.includes('technicians_template')) techniciansCsv  = await file.async('string')
    else if (lc.includes('file_upload_template')) uploadTemplate  = await file.async('string')
  }

  if (!hearingTestsCsv) throw new Error('ZIP is missing HearingTests CSV — is this a valid WSBC employer package?')
  if (!locationsCsv)    throw new Error('ZIP is missing Locations CSV')

  const testRows = parseCSV(hearingTestsCsv)
  const locRows  = parseCSV(locationsCsv)
  const techRows = techniciansCsv ? parseCSV(techniciansCsv) : []

  if (!testRows.length && !locRows.length) throw new Error('No data found in WSBC zip')

  // Employer info from Locations CSV (or fall back to test rows)
  const locRow = locRows[0] ?? {}
  const employer = {
    id:   String(locRow['Employer ID'] ?? testRows[0]?.['Employer ID'] ?? '').trim(),
    name: String(locRow['Employer Legal Name'] ?? testRows[0]?.['Employer Name'] ?? '').trim(),
  }

  const location = {
    number:  String(locRow['Operating Location Number'] ?? '001').trim(),
    address: String(locRow['Operating Location Address'] ?? '').trim(),
  }

  // Deduplicate workers by wsbc_worker_id
  const workerMap = new Map()
  for (const row of testRows) {
    const wid = String(row['Worker ID'] ?? '').trim()
    if (!wid || workerMap.has(wid)) continue
    workerMap.set(wid, {
      wsbc_worker_id: wid,
      first_name:     String(row['Worker First Name']  ?? '').trim(),
      middle_name:    String(row['Worker Middle Name'] ?? '').trim() || null,
      last_name:      String(row['Worker Last Name']   ?? '').trim(),
      dob:            wsbcDate(row['Birth Date']),
      sin_last_4:     String(row['4 digits SIN']       ?? '').replace(/"/g, '').trim() || null,
      gender:         String(row['Gender']             ?? '').trim() || null,
    })
  }

  // Build test list
  const tests = testRows.map(row => {
    const th = mapThresholds(row)
    if (!hasThresholdData(th)) return null
    return {
      wsbc_worker_id: String(row['Worker ID']      ?? '').trim(),
      wsbc_tech_id:   String(row['Technician ID']  ?? '').trim(),
      test_date:      wsbcDate(row['Test Date']),
      thresholds:     th,
      questionnaire: {
        exposed_noise_last_hours:  row['ExposedToNoiseInLastHours']         || null,
        hours_noise_exposure:      row['HowManyHoursExposedToNoise']        || null,
        regularly_wear_hpd:        row['RegularlyWearHearingProt']          || null,
        hpd_class:                 row['ClassOfHearingProtWornReg']         || null,
        hpd_style:                 row['StyleOfHearingProtWornReg']         || null,
        why_not_wear_hpd:          row['WhyNotWearHearingProtReg']          || null,
        ear_infection:             row['HadSevereEarInfection']             || null,
        ear_surgery:               row['HadEarSurgery']                     || null,
        dizziness:                 row['HadDizzinessOrBalanceProblems']     || null,
        head_injury:               row['HadSeriousHeadInjury']              || null,
        childhood_hearing_loss:    row['HadHearingLossInChildhood']         || null,
        tinnitus:                  row['HasRingingInEars']                  || null,
        tinnitus_ear:              row['WhichEar']                          || null,
        blast_exposure:            row['HadExposureToLoudBlast']            || null,
        firearms:                  row['HasUsedFirearms']                   || null,
      },
    }
  }).filter(Boolean)

  const csvHeaders = uploadTemplate ? uploadTemplate.split('\n')[0] : null

  return {
    employer,
    location,
    workers:   Array.from(workerMap.values()),
    tests,
    techCount: techRows.length,
    csvHeaders,
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

const queryOne = (sql, p = []) => query(sql, p)[0] ?? null

function resolveOrCreateCompany(employer) {
  // Try by worksafebc_employer_id first
  if (employer.id) {
    const row = queryOne('SELECT * FROM companies WHERE worksafebc_employer_id = ? AND active = 1', [employer.id])
    if (row) return { company: row, created: false }
  }
  // Fall back to name match
  if (employer.name) {
    const row = queryOne('SELECT * FROM companies WHERE LOWER(name) = LOWER(?) AND active = 1', [employer.name])
    if (row) {
      // Update worksafebc_employer_id if not yet set
      if (!row.worksafebc_employer_id && employer.id) {
        run('UPDATE companies SET worksafebc_employer_id = ?, updated_at = datetime(\'now\') WHERE company_id = ?',
          [employer.id, row.company_id])
      }
      return { company: { ...row, worksafebc_employer_id: employer.id }, created: false }
    }
  }
  // Create new
  run(
    `INSERT INTO companies (name, worksafebc_employer_id, active) VALUES (?, ?, 1)`,
    [employer.name || `WSBC Employer ${employer.id}`, employer.id || null]
  )
  const companyId = scalar('SELECT last_insert_rowid()')
  return { company: queryOne('SELECT * FROM companies WHERE company_id = ?', [companyId]), created: true }
}

function resolveOrCreateLocation(companyId, locationNumber, address) {
  // Location name = Operating Location Number (e.g. "001")
  const row = queryOne(
    'SELECT * FROM locations WHERE company_id = ? AND name = ? AND active = 1',
    [companyId, locationNumber]
  )
  if (row) return { location: row, created: false }

  run(
    `INSERT INTO locations (company_id, name, province, address, active) VALUES (?, ?, 'BC', ?, 1)`,
    [companyId, locationNumber, address || null]
  )
  const locationId = scalar('SELECT last_insert_rowid()')
  return { location: queryOne('SELECT * FROM locations WHERE location_id = ?', [locationId]), created: true }
}

function resolveOrCreateEmployee(worker, locationId) {
  // Try by wsbc_worker_id first
  if (worker.wsbc_worker_id) {
    const row = queryOne('SELECT * FROM employees WHERE wsbc_worker_id = ? AND deleted_at IS NULL', [worker.wsbc_worker_id])
    if (row) return { employeeId: row.employee_id, created: false }
  }
  // Score-based name+DOB match against company workers
  const candidates = matchCandidates(
    { first_name: worker.first_name, last_name: worker.last_name, dob: worker.dob, sin_last_4: worker.sin_last_4 },
    null  // search all — WSBC workers may not be current_location_id-matched yet
  )
  if (candidates.length && candidates[0].score >= 3) {
    const emp = candidates[0].employee
    // Stamp wsbc_worker_id if missing
    if (!emp.wsbc_worker_id && worker.wsbc_worker_id) {
      run('UPDATE employees SET wsbc_worker_id = ?, updated_at = datetime(\'now\') WHERE employee_id = ?',
        [worker.wsbc_worker_id, emp.employee_id])
    }
    return { employeeId: emp.employee_id, created: false }
  }
  // Create new
  const employeeId = createPerson({
    first_name:          worker.first_name,
    last_name:           worker.last_name,
    middle_name:         worker.middle_name   ?? null,
    dob:                 worker.dob            ?? null,
    sin_last_4:          worker.sin_last_4     ?? null,
    current_location_id: locationId,
    status: 'active',
  })
  // Stamp wsbc_worker_id
  if (worker.wsbc_worker_id) {
    run('UPDATE employees SET wsbc_worker_id = ? WHERE employee_id = ?', [worker.wsbc_worker_id, employeeId])
  }
  return { employeeId, created: true }
}

const THR_COLS = [
  'left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
  'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k'
]
const TEST_COLS = [
  'employee_id','location_id','test_date','tech_id','test_type','province',
  ...THR_COLS,
  'classification','triggered_rule_id','sts_flag','questionnaire','packet_id',
]

function isDuplicate(employeeId, testDate) {
  return !!queryOne(
    'SELECT 1 FROM tests WHERE employee_id = ? AND test_date = ? AND deleted_at IS NULL',
    [employeeId, testDate]
  )
}

// ── Phase 1: preview ──────────────────────────────────────────────────────────

/**
 * Given parsed WSBC zip data, analyse what would be created/updated.
 * Pure read — no writes.
 *
 * Returns:
 *   { employer, location, workerSummary, testCount, duplicateCount,
 *     existingCompany, existingLocation }
 */
export function previewWsbcImport(parsed) {
  const { employer, location, workers, tests } = parsed

  let existingCompany  = null
  let existingLocation = null

  if (employer.id) {
    existingCompany = queryOne('SELECT * FROM companies WHERE worksafebc_employer_id = ? AND active = 1', [employer.id])
  }
  if (!existingCompany && employer.name) {
    existingCompany = queryOne('SELECT * FROM companies WHERE LOWER(name) = LOWER(?) AND active = 1', [employer.name])
  }

  if (existingCompany) {
    existingLocation = queryOne(
      'SELECT * FROM locations WHERE company_id = ? AND name = ? AND active = 1',
      [existingCompany.company_id, location.number]
    )
  }

  // Worker match summary
  const workerSummary = workers.map(w => {
    let status = 'new'
    if (w.wsbc_worker_id) {
      const row = queryOne('SELECT employee_id FROM employees WHERE wsbc_worker_id = ? AND deleted_at IS NULL', [w.wsbc_worker_id])
      if (row) { status = 'existing'; return { ...w, status } }
    }
    const candidates = matchCandidates(
      { first_name: w.first_name, last_name: w.last_name, dob: w.dob, sin_last_4: w.sin_last_4 }, null
    )
    if (candidates.length && candidates[0].score >= 3) status = 'matched'
    return { ...w, status }
  })

  // Test duplicate check (only reliable if we know who the workers are)
  let duplicateCount = 0
  for (const test of tests) {
    const worker = workerSummary.find(w => w.wsbc_worker_id === test.wsbc_worker_id)
    if (!worker || worker.status === 'new') continue
    let empId = null
    if (worker.wsbc_worker_id) {
      const row = queryOne('SELECT employee_id FROM employees WHERE wsbc_worker_id = ?', [worker.wsbc_worker_id])
      if (row) empId = row.employee_id
    }
    if (empId && isDuplicate(empId, test.test_date)) duplicateCount++
  }

  return {
    employer,
    location,
    workerSummary,
    testCount:      tests.length,
    duplicateCount,
    existingCompany,
    existingLocation,
  }
}

// ── Phase 2: commit ───────────────────────────────────────────────────────────

/**
 * Import parsed WSBC data into the DB.
 * Returns { companyId, locationId, imported, newPersons, duplicates }.
 */
export async function commitWsbcImport(parsed, writerName) {
  const { employer, location, workers, tests } = parsed

  const rules = query(
    'SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC', ['BC']
  )

  let companyId, locationId
  let imported = 0, newPersons = 0, duplicates = 0

  await transaction(async () => {
    // 1. Company
    const { company } = resolveOrCreateCompany(employer)
    companyId = company.company_id

    // 2. Location
    const { location: loc } = resolveOrCreateLocation(companyId, location.number, location.address)
    locationId = loc.location_id

    // 3. Worker → employee map
    const wsbcIdToEmpId = new Map()
    for (const worker of workers) {
      const { employeeId, created } = resolveOrCreateEmployee(worker, locationId)
      if (created) newPersons++
      wsbcIdToEmpId.set(worker.wsbc_worker_id, employeeId)
    }

    // 4. Tests
    const packetId = `wsbc-${employer.id}-import-${new Date().toISOString().slice(0, 10)}`

    for (const test of tests) {
      const employeeId = wsbcIdToEmpId.get(test.wsbc_worker_id)
      if (!employeeId) continue
      if (!test.test_date) continue
      if (isDuplicate(employeeId, test.test_date)) { duplicates++; continue }

      const baseline = getActiveBaseline(employeeId)
      const cl = rules.length
        ? classify(test.thresholds, baseline, rules)
        : { category: null, triggered_rule_id: null, sts_calculated: false,
            triggering_freq_hz: null, triggering_ear: null, shift_db: null }

      const fields = {
        employee_id:       employeeId,
        location_id:       locationId,
        test_date:         test.test_date,
        tech_id:           null,
        test_type:         baseline ? 'Periodic' : 'Baseline',
        province:          'BC',
        ...test.thresholds,
        classification:    cl.category,
        triggered_rule_id: cl.triggered_rule_id,
        sts_flag:          cl.sts_calculated ? 1 : 0,
        questionnaire:     JSON.stringify(test.questionnaire),
        packet_id:         packetId,
      }

      run(
        `INSERT INTO tests (${TEST_COLS.join(',')}) VALUES (${TEST_COLS.map(() => '?').join(',')})`,
        TEST_COLS.map(c => fields[c] ?? null)
      )

      if (!baseline) {
        run(`UPDATE baselines SET archived = 1 WHERE employee_id = ? AND archived = 0`, [employeeId])
        run(
          `INSERT INTO baselines (employee_id, location_id, test_date, archived, ${THR_COLS.join(',')})
           VALUES (?, ?, ?, 0, ${THR_COLS.map(() => '?').join(',')})`,
          [employeeId, locationId, test.test_date, ...THR_COLS.map(k => test.thresholds[k] ?? null)]
        )
      }

      imported++
    }
  })

  await save(writerName)

  return { companyId, locationId, imported, newPersons, duplicates }
}
