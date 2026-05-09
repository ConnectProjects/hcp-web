/**
 * db/locations.js
 * Location-level queries. A location belongs to a company and has its own
 * province, CU code, contact info, and HPD inventory.
 */

import { query, queryOne, run, lastInsertId } from './sqlite.js'

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export function getLocationsByCompany(companyId) {
  return query(`
    SELECT l.*,
      (SELECT COUNT(*) FROM employees e WHERE e.location_id = l.location_id AND e.status = 'active') AS employee_count,
      (SELECT MAX(t.test_date) FROM tests t
         JOIN employees e ON e.employee_id = t.employee_id
         WHERE e.location_id = l.location_id) AS last_test_date
    FROM locations l
    WHERE l.company_id = ? AND l.active = 1
    ORDER BY l.name ASC
  `, [companyId])
}

export function getLocation(locationId) {
  return queryOne(`
    SELECT l.*, c.name AS company_name
    FROM locations l
    JOIN companies c ON c.company_id = l.company_id
    WHERE l.location_id = ?
  `, [locationId])
}

export function searchLocations(q) {
  const like = `%${q}%`
  return query(`
    SELECT l.*, c.name AS company_name,
      (SELECT COUNT(*) FROM employees e WHERE e.location_id = l.location_id AND e.status = 'active') AS employee_count
    FROM locations l
    JOIN companies c ON c.company_id = l.company_id
    WHERE l.active = 1
      AND (l.name LIKE ? OR c.name LIKE ? OR l.province LIKE ? OR l.city LIKE ? OR l.contact_name LIKE ?)
    ORDER BY c.name ASC, l.name ASC
  `, [like, like, like, like, like])
}

export function createLocation(data) {
  run(`INSERT INTO locations
    (company_id, name, province, address, city, postal_code,
     contact_name, contact_phone, contact_email, cu_code, hpd_inventory, sticky_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.company_id,
     data.name,
     data.province,
     data.address      ?? null,
     data.city         ?? null,
     data.postal_code  ?? null,
     data.contact_name  ?? null,
     data.contact_phone ?? null,
     data.contact_email ?? null,
     data.cu_code       ?? null,
     JSON.stringify(data.hpd_inventory ?? []),
     data.sticky_notes  ?? null]
  )
  return lastInsertId()
}

export function updateLocation(locationId, data) {
  run(`UPDATE locations SET
    name = ?, province = ?, address = ?, city = ?, postal_code = ?,
    contact_name = ?, contact_phone = ?, contact_email = ?,
    cu_code = ?, sticky_notes = ?, updated_at = datetime('now')
    WHERE location_id = ?`,
    [data.name,
     data.province,
     data.address       ?? null,
     data.city          ?? null,
     data.postal_code   ?? null,
     data.contact_name  ?? null,
     data.contact_phone ?? null,
     data.contact_email ?? null,
     data.cu_code       ?? null,
     data.sticky_notes  ?? null,
     locationId]
  )
}

export function deactivateLocation(locationId) {
  run(`UPDATE locations SET active = 0, updated_at = datetime('now') WHERE location_id = ?`, [locationId])
}

// ---------------------------------------------------------------------------
// HPD Inventory (per location)
// ---------------------------------------------------------------------------

export function getHPDInventory(locationId) {
  const row = queryOne('SELECT hpd_inventory FROM locations WHERE location_id = ?', [locationId])
  try { return JSON.parse(row?.hpd_inventory ?? '[]') } catch { return [] }
}

export function saveHPDInventory(locationId, inventory) {
  run(`UPDATE locations SET hpd_inventory = ?, updated_at = datetime('now') WHERE location_id = ?`,
    [JSON.stringify(inventory), locationId])
}

// ---------------------------------------------------------------------------
// Employment history
// ---------------------------------------------------------------------------

export function getEmploymentHistory(employeeId) {
  return query(`
    SELECT em.*, l.name AS location_name, l.province, c.name AS company_name
    FROM employment em
    JOIN locations l ON l.location_id = em.location_id
    JOIN companies c ON c.company_id = l.company_id
    WHERE em.employee_id = ?
    ORDER BY em.start_date DESC
  `, [employeeId])
}

export function getActiveEmployments(employeeId) {
  return query(`
    SELECT em.*, l.name AS location_name, l.province, c.name AS company_name
    FROM employment em
    JOIN locations l ON l.location_id = em.location_id
    JOIN companies c ON c.company_id = l.company_id
    WHERE em.employee_id = ? AND em.end_date IS NULL
    ORDER BY em.start_date DESC
  `, [employeeId])
}

export function addEmployment(employeeId, locationId, jobTitle, startDate) {
  run(`INSERT INTO employment (employee_id, location_id, job_title, start_date)
       VALUES (?, ?, ?, ?)`,
    [employeeId, locationId, jobTitle ?? null, startDate ?? null])
  return lastInsertId()
}

export function endEmployment(employmentId, endDate) {
  run(`UPDATE employment SET end_date = ? WHERE employment_id = ?`,
    [endDate, employmentId])
}

// ---------------------------------------------------------------------------
// Baselines (per employee + location)
// ---------------------------------------------------------------------------

export function getActiveBaseline(employeeId, locationId) {
  return queryOne(`
    SELECT * FROM baselines
    WHERE employee_id = ? AND location_id = ? AND archived = 0
    ORDER BY test_date DESC LIMIT 1
  `, [employeeId, locationId])
}

export function getAllBaselinesForLocation(employeeId, locationId) {
  return query(`
    SELECT * FROM baselines
    WHERE employee_id = ? AND location_id = ?
    ORDER BY test_date DESC
  `, [employeeId, locationId])
}

export function getAllBaselinesForEmployee(employeeId) {
  return query(`
    SELECT b.*, l.name AS location_name, c.name AS company_name
    FROM baselines b
    LEFT JOIN locations l ON l.location_id = b.location_id
    LEFT JOIN companies c ON c.company_id = l.company_id
    WHERE b.employee_id = ?
    ORDER BY b.test_date DESC
  `, [employeeId])
}

// ---------------------------------------------------------------------------
// Packet building — employees for a location visit
// ---------------------------------------------------------------------------

export function buildPacketEmployees(locationId) {
  const fourYearsAgo = new Date()
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4)
  const cutoff = fourYearsAgo.toISOString().slice(0, 10)

  const employees = query(`
    SELECT e.*
    FROM employees e
    WHERE e.location_id = ? AND e.status = 'active'
      AND (
        (SELECT MAX(t.test_date) FROM tests t WHERE t.employee_id = e.employee_id) >= ?
        OR (SELECT COUNT(*) FROM tests t WHERE t.employee_id = e.employee_id) = 0
      )
    ORDER BY e.last_name, e.first_name
  `, [locationId, cutoff])

  const location = getLocation(locationId)

  return employees.map(emp => {
    const baseline = getActiveBaseline(emp.employee_id, locationId)
    const priorTests = query(`
      SELECT t.*, h.adequacy AS hpd_adequacy
      FROM tests t
      LEFT JOIN hpd_assessments h ON h.test_id = t.test_id
      WHERE t.employee_id = ? AND t.location_id = ? AND t.test_type = 'Periodic'
      ORDER BY t.test_date DESC LIMIT 3
    `, [emp.employee_id, locationId])

    return {
      employee_id:  String(emp.employee_id),
      first_name:   emp.first_name,
      last_name:    emp.last_name,
      dob:          emp.dob,
      hire_date:    emp.hire_date,
      job_title:    emp.job_title,
      status:       emp.status,
      baseline:     baseline ? { ...baseline, thresholds: extractThresholds(baseline) } : null,
      prior_tests:  priorTests.map(t => ({
        test_id:        String(t.test_id),
        test_date:      t.test_date,
        classification: t.classification ? JSON.parse(t.classification) : null,
        thresholds:     extractThresholds(t)
      })),
      completed_tests: []
    }
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractThresholds(row) {
  return {
    left_500:  row.left_500,  left_1k:  row.left_1k,  left_2k:  row.left_2k,
    left_3k:   row.left_3k,   left_4k:  row.left_4k,  left_6k:  row.left_6k,  left_8k: row.left_8k,
    right_500: row.right_500, right_1k: row.right_1k, right_2k: row.right_2k,
    right_3k:  row.right_3k,  right_4k: row.right_4k, right_6k: row.right_6k, right_8k: row.right_8k
  }
}
