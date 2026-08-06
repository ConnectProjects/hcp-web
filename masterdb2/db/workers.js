/**
 * masterdb2/db/workers.js — person model
 *
 * All functions operate on the in-memory sql.js DB via db.js helpers.
 * "Person" and "worker" are interchangeable; the backing table is `employees`.
 *
 * After any mutation (create/update/transfer/deactivate), the caller must
 * call db.save(writerName) to flush changes to disk.
 */

import { query, scalar, run } from './db.js'

const norm = s => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

// ── Shared column fragments ───────────────────────────────────────────────────

// Standard person row with current location and company joined in.
const PERSON_COLS = `
  e.employee_id, e.first_name, e.middle_name, e.last_name, e.dob,
  e.sin_last_4, e.phone, e.email, e.hire_date, e.job_title,
  e.status, e.current_location_id, e.uid, e.created_at, e.updated_at,
  l.name  AS location_name,
  l.province AS location_province,
  c.company_id,
  c.name  AS company_name,
  (SELECT COUNT(*) FROM tests t
   WHERE t.employee_id = e.employee_id AND t.deleted_at IS NULL) AS test_count`

const PERSON_JOINS = `
  LEFT JOIN locations l ON l.location_id = e.current_location_id
  LEFT JOIN companies c ON c.company_id  = l.company_id`

// ── Search & list ─────────────────────────────────────────────────────────────

/**
 * Full-text search across first_name + last_name. All whitespace-separated
 * tokens must match (AND). Returns up to 100 persons with location + company.
 *
 * options.locationId     — restrict to current_location_id
 * options.includeInactive — include status != 'active' (default false)
 */
export function search(q, { locationId = null, includeInactive = false } = {}) {
  const tokens = (q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []

  let sql = `SELECT ${PERSON_COLS} FROM employees e ${PERSON_JOINS}
             WHERE e.deleted_at IS NULL`
  const params = []

  if (!includeInactive) sql += ` AND e.status = 'active'`
  if (locationId != null) { sql += ` AND e.current_location_id = ?`; params.push(locationId) }

  for (const tok of tokens) {
    sql += ` AND (lower(e.first_name) LIKE ? OR lower(e.last_name) LIKE ?)`
    params.push(`%${tok}%`, `%${tok}%`)
  }

  sql += ` ORDER BY e.last_name, e.first_name LIMIT 100`
  return query(sql, params)
}

/**
 * All persons whose current_location_id = locationId, ordered by last/first name.
 * Used to build the roster on the Location detail screen and in packet generation.
 */
export function listByLocation(locationId, { includeInactive = false } = {}) {
  let sql = `SELECT ${PERSON_COLS} FROM employees e ${PERSON_JOINS}
             WHERE e.current_location_id = ? AND e.deleted_at IS NULL`
  if (!includeInactive) sql += ` AND e.status = 'active'`
  sql += ` ORDER BY e.last_name, e.first_name`
  return query(sql, [locationId])
}

// ── Single-record access ──────────────────────────────────────────────────────

/** Get one person by employee_id. Returns null if not found or soft-deleted. */
export function getById(employeeId) {
  const rows = query(
    `SELECT ${PERSON_COLS} FROM employees e ${PERSON_JOINS}
     WHERE e.employee_id = ? AND e.deleted_at IS NULL`,
    [employeeId]
  )
  return rows[0] ?? null
}

/** Get one person by uid. Returns null if not found. */
export function getByUid(uid) {
  const rows = query(
    `SELECT ${PERSON_COLS} FROM employees e ${PERSON_JOINS}
     WHERE e.uid = ? AND e.deleted_at IS NULL`,
    [uid]
  )
  return rows[0] ?? null
}

// ── Test & baseline access ────────────────────────────────────────────────────

/**
 * Full test history for a person, newest first.
 * Includes location name + company per test (cross-location history support).
 */
export function getTests(employeeId) {
  return query(
    `SELECT t.*,
            l.name AS location_name, l.province AS location_province,
            c.name AS company_name,  c.company_id
     FROM tests t
     LEFT JOIN locations l ON l.location_id = t.location_id
     LEFT JOIN companies c ON c.company_id  = l.company_id
     WHERE t.employee_id = ? AND t.deleted_at IS NULL
     ORDER BY t.test_date DESC, t.created_at DESC`,
    [employeeId]
  )
}

/**
 * All baselines for a person: active baseline first, then archived oldest-first.
 * Includes location name per baseline.
 */
export function getBaselines(employeeId) {
  return query(
    `SELECT b.*, l.name AS location_name
     FROM baselines b
     LEFT JOIN locations l ON l.location_id = b.location_id
     WHERE b.employee_id = ? AND b.deleted_at IS NULL
     ORDER BY b.archived ASC, b.test_date ASC`,
    [employeeId]
  )
}

/**
 * The single active (archived = 0) baseline for a person.
 * The schema enforces at most one per person (verified in migration + import).
 * Returns null if the person has no baseline yet.
 */
export function getActiveBaseline(employeeId) {
  const rows = query(
    `SELECT b.*, l.name AS location_name
     FROM baselines b
     LEFT JOIN locations l ON l.location_id = b.location_id
     WHERE b.employee_id = ? AND b.archived = 0 AND b.deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  )
  return rows[0] ?? null
}

/** HPD assessment(s) for a specific test. Returns [] if none recorded. */
export function getHpdAssessments(testId) {
  return query(
    `SELECT * FROM hpd_assessments WHERE test_id = ? AND deleted_at IS NULL`,
    [testId]
  )
}

// ── Mutations ─────────────────────────────────────────────────────────────────

// Fields the UI is allowed to set on a new person.
const CREATE_FIELDS = [
  'current_location_id', 'first_name', 'middle_name', 'last_name',
  'dob', 'sin_last_4', 'phone', 'email', 'hire_date', 'job_title', 'status', 'uid'
]

// Fields that can be updated after creation (identity and contact only).
const UPDATE_FIELDS = [
  'current_location_id', 'first_name', 'middle_name', 'last_name',
  'dob', 'sin_last_4', 'phone', 'email', 'hire_date', 'job_title', 'status'
]

/**
 * Insert a new person. Returns the new employee_id.
 * uid is optional: if omitted, the DB trigger stamps one on insert.
 * Call db.save(writerName) after.
 */
export function create(fields) {
  const cols = CREATE_FIELDS.filter(f => fields[f] !== undefined)
  if (!cols.includes('first_name') || !cols.includes('last_name')) {
    throw new Error('first_name and last_name are required')
  }
  run(
    `INSERT INTO employees (${cols.join(', ')})
     VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map(c => fields[c] ?? null)
  )
  return scalar('SELECT last_insert_rowid()')
}

/**
 * Update identity and contact fields for an existing person.
 * Unknown or read-only fields (employee_id, uid, created_at, deleted_at) are silently ignored.
 * Call db.save(writerName) after.
 */
export function update(employeeId, fields) {
  const cols = UPDATE_FIELDS.filter(f => f in fields)
  if (!cols.length) return
  run(
    `UPDATE employees
     SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now')
     WHERE employee_id = ?`,
    [...cols.map(c => fields[c] ?? null), employeeId]
  )
}

/**
 * Move a person to a new location (roster pointer update only).
 * All existing test records keep their original location_id — history is unchanged.
 * Call db.save(writerName) after.
 */
export function transfer(employeeId, newLocationId) {
  run(
    `UPDATE employees SET current_location_id = ?, updated_at = datetime('now')
     WHERE employee_id = ?`,
    [newLocationId, employeeId]
  )
}

/**
 * Soft-deactivate a person. They disappear from rosters and search by default
 * but their test history is preserved. Reversible via update(id, { status: 'active' }).
 * Call db.save(writerName) after.
 */
export function deactivate(employeeId) {
  run(
    `UPDATE employees SET status = 'inactive', updated_at = datetime('now')
     WHERE employee_id = ?`,
    [employeeId]
  )
}

// ── Import matching ───────────────────────────────────────────────────────────

/**
 * Score all non-deleted persons against the supplied identity fields to find
 * candidates for an on-site-added worker (no uid/employee_id in the packet).
 *
 * target   : { first_name, last_name, dob?, sin_last_4? }
 * companyId: when provided, restrict search to persons currently at this company.
 *            Pass null to search the entire DB (for cross-company edge cases).
 *
 * Returns [{ employee, score, reason }] sorted descending by score.
 * Only entries with score > 0 are returned (zero = name mismatch or confirmed different person).
 *
 * Score guide:
 *   4   — name + DOB + SIN all match
 *   3   — name + DOB match (strong; use as auto-proposal in import preview)
 *   2   — name + DOB match but SIN conflicts (flag: possible transcription error)
 *   1.5 — name + SIN match, no DOB to compare
 *   1   — name only, no DOB/SIN available (weak; always requires staff confirmation)
 *   0.5 — name match but SIN conflicts, no DOB (probably different person; shown with warning)
 */
export function matchCandidates(target, companyId = null) {
  let sql = `SELECT ${PERSON_COLS} FROM employees e ${PERSON_JOINS}
             WHERE e.deleted_at IS NULL`
  const params = []
  if (companyId != null) {
    // Only persons currently at a location in this company
    sql += ` AND l.company_id = ?`
    params.push(companyId)
  }

  const candidates = query(sql, params)
  const tFirst = norm(target.first_name)
  const tLast  = norm(target.last_name)
  const tDob   = target.dob     ?? null
  const tSin   = target.sin_last_4 ?? null

  const results = []
  for (const e of candidates) {
    if (norm(e.first_name) !== tFirst || norm(e.last_name) !== tLast) continue

    let score, reason
    const eDob = e.dob      ?? null
    const eSin = e.sin_last_4 ?? null

    if (tDob && eDob) {
      if (eDob !== tDob) continue   // DOBs both present and differ → different person
      // DOB match
      if (tSin && eSin) {
        if (eSin === tSin) { score = 4;   reason = 'name + DOB + SIN' }
        else               { score = 2;   reason = 'name + DOB match, SIN conflicts — verify' }
      } else {
        score = 3; reason = 'name + DOB'
      }
    } else if (tSin && eSin) {
      if (eSin === tSin) { score = 1.5; reason = 'name + SIN (no DOB available)' }
      else               { score = 0.5; reason = 'name match, SIN conflicts — probably different' }
    } else {
      score = 1; reason = 'name only — no DOB or SIN to corroborate, needs confirmation'
    }

    results.push({ employee: e, score, reason })
  }

  return results.sort((a, b) => b.score - a.score)
}
