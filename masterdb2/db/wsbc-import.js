/**
 * masterdb2/db/wsbc-import.js — WorkSafeBC zip import
 *
 * parseWsbcZip(arrayBuffer)
 *   Unzip the WSBC employer package, parse CSVs, return a structured preview object.
 *
 * commitWsbcImport(parsed, writerName)
 *   Write the parsed data to the DB: create/update company + locations + workers + tests.
 *   Returns { companyId, imported, newPersons, duplicates }.
 *
 * The WSBC zip contains:
 *   *_HearingTests_*.csv      — historical test records (same columns as File_Upload_Template)
 *   *_Locations_*.csv         — locations with Operating Location Number + address + city
 *   *_Technicians_*.csv       — tech roster (reference only)
 *   *_File_Upload_Template_*.csv — empty header-only CSV
 *   *_CUs_Template_*.csv      — CU codes (not imported)
 *   *_Occupational_Classification_*.csv — job codes (not imported)
 */

import { query, run, scalar, transaction, save } from './db.js'
import { getActiveBaseline, create as createPerson, matchCandidates } from './workers.js'
import { classify } from '../../shared/classification/engine.js'

const yield_ = () => new Promise(r => setTimeout(r, 0))

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  // Strip UTF-8 BOM if present — otherwise the first column header gets a ﻿ prefix
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const lines = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
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

// Extract just the leading numeric location code from "Operating Location" in HearingTests CSV.
// That column is often a composite: "003 BC HYDRO & POWER AUTHORITY".
// The Locations CSV "Operating Location Number" is just "003".
function extractLocNum(s) {
  if (!s) return ''
  const m = s.trim().match(/^(\d+)/)
  return m ? m[1] : s.trim()
}

// ── Zip parsing ───────────────────────────────────────────────────────────────

/**
 * Parse a WSBC employer zip (ArrayBuffer) using JSZip.
 * JSZip must be loaded as a <script> before calling this (window.JSZip).
 *
 * Returns:
 *   {
 *     employer:  { id, name },
 *     locations: [{ number, address, city }],   // one entry per Operating Location
 *     workers:   [{ wsbc_worker_id, first_name, last_name, dob, ..., last_operating_location }],
 *     tests:     [{ wsbc_worker_id, operating_location, test_date, thresholds, questionnaire }],
 *     techCount: N,
 *   }
 */
export async function parseWsbcZip(arrayBuffer) {
  if (!window.JSZip) throw new Error('JSZip not loaded — include vendor/jszip.min.js before importing this module')

  await yield_()
  const zip = await JSZip.loadAsync(arrayBuffer)
  await yield_()

  let hearingTestsCsv = null
  let locationsCsv    = null
  let techniciansCsv  = null

  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    const lc = name.toLowerCase()
    if (lc.includes('occupational') || lc.includes('cus_template')) continue
    if (lc.includes('hearingtests'))              hearingTestsCsv = await file.async('string')
    else if (lc.includes('locations_template'))   locationsCsv    = await file.async('string')
    else if (lc.includes('technicians_template')) techniciansCsv  = await file.async('string')
    await yield_()
  }

  if (!hearingTestsCsv) throw new Error('ZIP is missing HearingTests CSV — is this a valid WSBC employer package?')
  if (!locationsCsv)    throw new Error('ZIP is missing Locations CSV')

  const testRows = parseCSV(hearingTestsCsv)
  const locRows  = parseCSV(locationsCsv)
  const techRows = techniciansCsv ? parseCSV(techniciansCsv) : []

  if (!testRows.length && !locRows.length) throw new Error('No data found in WSBC zip')

  await yield_()

  // Employer info from Locations CSV (or fall back to test rows)
  const locRow0  = locRows[0] ?? {}
  const employer = {
    id:   String(locRow0['Employer ID']       ?? testRows[0]?.['Employer ID']   ?? '').trim(),
    name: String(locRow0['Employer Legal Name'] ?? testRows[0]?.['Employer Name'] ?? '').trim(),
  }

  // Build a map of all operating locations from the Locations CSV
  const locationMap = new Map()
  for (const row of locRows) {
    const num = String(row['Operating Location Number'] ?? '').trim()
    if (!num) continue
    if (!locationMap.has(num)) {
      // "Operating Location Address" is formatted "110 - GALIANO ISLAND B C"
      // The part after the first " - " is the location name/city; no separate city column exists.
      const addrRaw = String(row['Operating Location Address'] ?? '').trim()
      const dashIdx = addrRaw.indexOf(' - ')
      const city    = dashIdx >= 0 ? addrRaw.slice(dashIdx + 3).trim() || null : addrRaw || null
      locationMap.set(num, { number: num, address: null, city })
    }
  }
  // If Locations CSV was empty, seed from the first test row
  if (!locationMap.size) {
    const num = extractLocNum(testRows[0]?.['Operating Location'] ?? '001')
    locationMap.set(num, { number: num, address: null, city: null })
  }

  await yield_()

  // Sort testRows by test_date ascending so the oldest record = baseline candidate
  testRows.sort((a, b) => {
    const da = wsbcDate(a['Test Date']) ?? ''
    const db = wsbcDate(b['Test Date']) ?? ''
    return da < db ? -1 : da > db ? 1 : 0
  })

  await yield_()

  // Build worker map — iterate sorted testRows so last_operating_location = most recent
  const workerMap = new Map()
  for (const row of testRows) {
    const wid = String(row['Worker ID'] ?? '').trim()
    if (!wid) continue
    const opLoc = extractLocNum(row['Operating Location'] ?? '')
    if (!workerMap.has(wid)) {
      workerMap.set(wid, {
        wsbc_worker_id:         wid,
        first_name:             String(row['Worker First Name']  ?? '').trim(),
        middle_name:            String(row['Worker Middle Name'] ?? '').trim() || null,
        last_name:              String(row['Worker Last Name']   ?? '').trim(),
        dob:                    wsbcDate(row['Birth Date']),
        sin_last_4:             String(row['4 digits SIN']           ?? '').replace(/"/g, '').trim() || null,
        gender:                 String(row['Gender']                 ?? '').trim() || null,
        job_title:              String(row['Occupation Job Title']   ?? '').trim() || null,
        occupation_code:        String(row['Occupation Code']        ?? '').trim() || null,
        last_operating_location: opLoc,
      })
    } else {
      // Update to the most recent operating location (testRows sorted ascending by date)
      workerMap.get(wid).last_operating_location = opLoc
    }
  }

  await yield_()

  // Build test list — each test carries its operating_location so commit assigns the right DB location_id
  const tests = testRows.map(row => {
    const th = mapThresholds(row)
    if (!hasThresholdData(th)) return null
    return {
      wsbc_worker_id:      String(row['Worker ID']         ?? '').trim(),
      operating_location:  extractLocNum(row['Operating Location'] ?? ''),
      wsbc_tech_id:        String(row['Technician ID']     ?? '').trim(),
      test_date:           wsbcDate(row['Test Date']),
      thresholds:          th,
      questionnaire: {
        exposed_noise_last_hours:  row['ExposedToNoiseInLastHours']      || null,
        hours_noise_exposure:      row['HowManyHoursExposedToNoise']     || null,
        regularly_wear_hpd:        row['RegularlyWearHearingProt']       || null,
        hpd_class:                 row['ClassOfHearingProtWornReg']      || null,
        hpd_style:                 row['StyleOfHearingProtWornReg']      || null,
        why_not_wear_hpd:          row['WhyNotWearHearingProtReg']       || null,
        ear_infection:             row['HadSevereEarInfection']          || null,
        ear_surgery:               row['HadEarSurgery']                  || null,
        dizziness:                 row['HadDizzinessOrBalanceProblems']  || null,
        head_injury:               row['HadSeriousHeadInjury']           || null,
        childhood_hearing_loss:    row['HadHearingLossInChildhood']      || null,
        tinnitus:                  row['HasRingingInEars']               || null,
        tinnitus_ear:              row['WhichEar']                       || null,
        blast_exposure:            row['HadExposureToLoudBlast']         || null,
        firearms:                  row['HasUsedFirearms']                || null,
      },
    }
  }).filter(Boolean)

  return {
    employer,
    locations: Array.from(locationMap.values()),
    workers:   Array.from(workerMap.values()),
    tests,
    techCount: techRows.length,
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

const queryOne = (sql, p = []) => query(sql, p)[0] ?? null

function resolveOrCreateCompany(employer) {
  if (employer.id) {
    const row = queryOne('SELECT * FROM companies WHERE worksafebc_employer_id = ? AND active = 1', [employer.id])
    if (row) return { company: row, created: false }
  }
  if (employer.name) {
    const row = queryOne('SELECT * FROM companies WHERE LOWER(name) = LOWER(?) AND active = 1', [employer.name])
    if (row) {
      if (!row.worksafebc_employer_id && employer.id) {
        run("UPDATE companies SET worksafebc_employer_id = ?, updated_at = datetime('now') WHERE company_id = ?",
          [employer.id, row.company_id])
      }
      return { company: { ...row, worksafebc_employer_id: employer.id }, created: false }
    }
  }
  run(
    `INSERT INTO companies (name, worksafebc_employer_id, active) VALUES (?, ?, 1)`,
    [employer.name || `WSBC Employer ${employer.id}`, employer.id || null]
  )
  const companyId = scalar('SELECT last_insert_rowid()')
  return { company: queryOne('SELECT * FROM companies WHERE company_id = ?', [companyId]), created: true }
}

function resolveOrCreateLocation(companyId, locNumber, address, city) {
  const row = queryOne(
    'SELECT * FROM locations WHERE company_id = ? AND name = ? AND active = 1',
    [companyId, locNumber]
  )
  if (row) {
    // Backfill city if it wasn't set before
    if (!row.city && city) {
      run("UPDATE locations SET city = ?, updated_at = datetime('now') WHERE location_id = ?",
        [city, row.location_id])
    }
    return { location: { ...row, city: city ?? row.city }, created: false }
  }
  run(
    `INSERT INTO locations (company_id, name, province, address, city, active) VALUES (?, ?, 'BC', ?, ?, 1)`,
    [companyId, locNumber, address || null, city || null]
  )
  const locationId = scalar('SELECT last_insert_rowid()')
  return { location: queryOne('SELECT * FROM locations WHERE location_id = ?', [locationId]), created: true }
}

function resolveOrCreateEmployee(worker, locationId) {
  if (worker.wsbc_worker_id) {
    const row = queryOne('SELECT * FROM employees WHERE wsbc_worker_id = ? AND deleted_at IS NULL', [worker.wsbc_worker_id])
    if (row) return { employeeId: row.employee_id, created: false }
  }
  const candidates = matchCandidates(
    { first_name: worker.first_name, last_name: worker.last_name, dob: worker.dob, sin_last_4: worker.sin_last_4 },
    null
  )
  if (candidates.length && candidates[0].score >= 3) {
    const emp = candidates[0].employee
    const updates = [], vals = []
    if (!emp.wsbc_worker_id  && worker.wsbc_worker_id)  { updates.push('wsbc_worker_id=?');  vals.push(worker.wsbc_worker_id)  }
    if (!emp.occupation_code && worker.occupation_code) { updates.push('occupation_code=?'); vals.push(worker.occupation_code) }
    if (!emp.job_title       && worker.job_title)       { updates.push('job_title=?');       vals.push(worker.job_title)       }
    if (updates.length) {
      run(`UPDATE employees SET ${updates.join(',')}, updated_at=datetime('now') WHERE employee_id=?`,
        [...vals, emp.employee_id])
    }
    return { employeeId: emp.employee_id, created: false }
  }
  const employeeId = createPerson({
    first_name:          worker.first_name,
    last_name:           worker.last_name,
    middle_name:         worker.middle_name   ?? null,
    dob:                 worker.dob            ?? null,
    sin_last_4:          worker.sin_last_4     ?? null,
    job_title:           worker.job_title      ?? null,
    current_location_id: locationId,
    status: 'active',
  })
  if (worker.wsbc_worker_id || worker.occupation_code) {
    run('UPDATE employees SET wsbc_worker_id=?, occupation_code=? WHERE employee_id=?',
      [worker.wsbc_worker_id || null, worker.occupation_code || null, employeeId])
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

// ── Phase 1: preview ──────────────────────────────────────────────────────────

/**
 * Given parsed WSBC zip data, analyse what would be created/updated.
 * Pure read — no writes.
 *
 * Returns:
 *   { employer, locations, workerSummary, testCount, duplicateCount,
 *     existingCompany, existingLocations }
 */
export async function previewWsbcImport(parsed) {
  const { employer, locations, workers, tests } = parsed

  let existingCompany = null
  if (employer.id) {
    existingCompany = queryOne('SELECT * FROM companies WHERE worksafebc_employer_id = ? AND active = 1', [employer.id])
  }
  if (!existingCompany && employer.name) {
    existingCompany = queryOne('SELECT * FROM companies WHERE LOWER(name) = LOWER(?) AND active = 1', [employer.name])
  }

  let existingLocations = []
  if (existingCompany) {
    existingLocations = locations.map(loc => {
      const row = queryOne(
        'SELECT * FROM locations WHERE company_id = ? AND name = ? AND active = 1',
        [existingCompany.company_id, loc.number]
      )
      return row ? loc.number : null
    }).filter(Boolean)
  }

  // Worker match summary — yield per worker so matchCandidates doesn't freeze the browser
  const workerSummary = []
  for (const w of workers) {
    let status = 'new'
    if (w.wsbc_worker_id) {
      const row = queryOne('SELECT employee_id FROM employees WHERE wsbc_worker_id = ? AND deleted_at IS NULL', [w.wsbc_worker_id])
      if (row) { workerSummary.push({ ...w, status: 'existing' }); await yield_(); continue }
    }
    const candidates = matchCandidates(
      { first_name: w.first_name, last_name: w.last_name, dob: w.dob, sin_last_4: w.sin_last_4 }, null
    )
    if (candidates.length && candidates[0].score >= 3) status = 'matched'
    workerSummary.push({ ...w, status })
    await yield_()
  }

  // Quick duplicate estimate for existing workers only (skip full scan for new workers)
  let duplicateCount = 0
  const existingWorkerIds = workerSummary
    .filter(w => w.status !== 'new' && w.wsbc_worker_id)
    .map(w => w.wsbc_worker_id)

  if (existingWorkerIds.length) {
    const ph = existingWorkerIds.map(() => '?').join(',')
    const empRows = query(
      `SELECT employee_id, wsbc_worker_id FROM employees WHERE wsbc_worker_id IN (${ph}) AND deleted_at IS NULL`,
      existingWorkerIds
    )
    const wsbcToEmpId = new Map(empRows.map(r => [r.wsbc_worker_id, r.employee_id]))

    // Batch load all existing test dates for these employees
    const empIds = [...wsbcToEmpId.values()]
    if (empIds.length) {
      const eph = empIds.map(() => '?').join(',')
      const testRows = query(
        `SELECT employee_id, test_date FROM tests WHERE employee_id IN (${eph}) AND deleted_at IS NULL`,
        empIds
      )
      const existingSet = new Set(testRows.map(r => `${r.employee_id}:${r.test_date}`))
      for (const test of tests) {
        const empId = wsbcToEmpId.get(test.wsbc_worker_id)
        if (empId && existingSet.has(`${empId}:${test.test_date}`)) duplicateCount++
      }
    }
  }

  return {
    employer,
    locations,
    workerSummary,
    testCount:       tests.length,
    duplicateCount,
    existingCompany,
    existingLocations,
  }
}

// ── Phase 2: commit ───────────────────────────────────────────────────────────

/**
 * Import parsed WSBC data into the DB.
 * Returns { companyId, imported, newPersons, duplicates }.
 */
export async function commitWsbcImport(parsed, writerName) {
  const { employer, locations, workers, tests } = parsed

  const rules = query(
    'SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC', ['BC']
  )

  let companyId
  let imported = 0, newPersons = 0, duplicates = 0

  // Tests are already sorted oldest-first from parseWsbcZip.
  // Pre-sort defensively in case parsed object came from elsewhere.
  const sortedTests = [...tests].sort((a, b) => (a.test_date ?? '') < (b.test_date ?? '') ? -1 : 1)

  await transaction(async () => {
    // 1. Company
    const { company } = resolveOrCreateCompany(employer)
    companyId = company.company_id

    // 2. All locations — build a map from WSBC Operating Location Number → DB location_id
    const fallbackLocNum = locations[0]?.number ?? '001'
    const locationIdByNum = new Map()
    for (const loc of locations) {
      const { location } = resolveOrCreateLocation(companyId, loc.number, loc.address, loc.city)
      locationIdByNum.set(loc.number, location.location_id)
    }
    const fallbackLocationId = locationIdByNum.get(fallbackLocNum) ?? [...locationIdByNum.values()][0]

    // 3. Workers → employee map
    const wsbcIdToEmpId = new Map()
    for (const worker of workers) {
      const workerLocId = locationIdByNum.get(worker.last_operating_location) ?? fallbackLocationId
      const { employeeId, created } = resolveOrCreateEmployee(worker, workerLocId)
      if (created) newPersons++
      wsbcIdToEmpId.set(worker.wsbc_worker_id, employeeId)
    }
    await yield_()

    // 4. Pre-load existing (employee_id, test_date) pairs to skip duplicates without per-test queries
    const allEmpIds = [...new Set(wsbcIdToEmpId.values())]
    const existingTestSet = new Set()
    if (allEmpIds.length) {
      const ph = allEmpIds.map(() => '?').join(',')
      const rows = query(
        `SELECT employee_id, test_date FROM tests WHERE employee_id IN (${ph}) AND deleted_at IS NULL`,
        allEmpIds
      )
      for (const r of rows) existingTestSet.add(`${r.employee_id}:${r.test_date}`)
    }
    await yield_()

    // 5. Pre-load which employees already have an active baseline
    const hasBaselineSet = new Set()
    if (allEmpIds.length) {
      const ph = allEmpIds.map(() => '?').join(',')
      const rows = query(
        `SELECT DISTINCT employee_id FROM baselines WHERE employee_id IN (${ph}) AND archived = 0 AND deleted_at IS NULL`,
        allEmpIds
      )
      for (const r of rows) hasBaselineSet.add(r.employee_id)
    }
    await yield_()

    // 6. Insert tests (sorted oldest-first so first = baseline for new workers)
    const packetId = `wsbc-${employer.id}-import-${new Date().toISOString().slice(0, 10)}`
    let testIdx = 0

    for (const test of sortedTests) {
      const employeeId = wsbcIdToEmpId.get(test.wsbc_worker_id)
      if (!employeeId || !test.test_date) continue

      const key = `${employeeId}:${test.test_date}`
      if (existingTestSet.has(key)) { duplicates++; continue }
      existingTestSet.add(key)  // prevent self-duplication within this import batch

      const locationId = locationIdByNum.get(test.operating_location) ?? fallbackLocationId
      const hasBaseline = hasBaselineSet.has(employeeId)

      const cl = rules.length
        ? classify(test.thresholds, hasBaseline ? getActiveBaseline(employeeId) : null, rules)
        : { category: null, triggered_rule_id: null, sts_calculated: false }

      const fields = {
        employee_id:       employeeId,
        location_id:       locationId,
        test_date:         test.test_date,
        tech_id:           null,
        test_type:         hasBaseline ? 'Periodic' : 'Baseline',
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

      if (!hasBaseline) {
        run(`UPDATE baselines SET archived = 1 WHERE employee_id = ? AND archived = 0`, [employeeId])
        run(
          `INSERT INTO baselines (employee_id, location_id, test_date, archived, ${THR_COLS.join(',')})
           VALUES (?, ?, ?, 0, ${THR_COLS.map(() => '?').join(',')})`,
          [employeeId, locationId, test.test_date, ...THR_COLS.map(k => test.thresholds[k] ?? null)]
        )
        hasBaselineSet.add(employeeId)  // subsequent tests for this worker are Periodic
      }

      imported++
      testIdx++
      if (testIdx % 50 === 0) await yield_()
    }
  })

  await save(writerName)

  return { companyId, imported, newPersons, duplicates }
}
