/**
 * db/employees.js
 * Employee queries. Employees are now tied to locations, not companies directly.
 * Employment history is in the employment table (see locations.js).
 */

import { query, queryOne } from './sqlite.js'

const THRESHOLD_COLS = [
  'left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
  'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k'
].join(', ')

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export function getEmployeesByLocation(locationId) {
  return query(`
    SELECT e.*,
      l.name AS location_name, l.province,
      c.name AS company_name,
      (SELECT t.classification FROM tests t
         WHERE t.employee_id = e.employee_id AND t.location_id = ?
         ORDER BY t.test_date DESC LIMIT 1) AS last_classification,
      (SELECT t.test_date FROM tests t
         WHERE t.employee_id = e.employee_id AND t.location_id = ?
         ORDER BY t.test_date DESC LIMIT 1) AS last_test_date
    FROM employees e
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id = l.company_id
    WHERE e.location_id = ?
    ORDER BY e.last_name, e.first_name
  `, [locationId, locationId, locationId])
}

export function getEmployee(employeeId) {
  return queryOne(`
    SELECT e.*,
      l.name AS location_name, l.province,
      c.name AS company_name, c.company_id
    FROM employees e
    LEFT JOIN locations l ON l.location_id = e.location_id
    LEFT JOIN companies c ON c.company_id = l.company_id
    WHERE e.employee_id = ?
  `, [employeeId])
}

export function searchEmployees(q) {
  const like = `%${q}%`
  return query(`
    SELECT e.*,
      l.name AS location_name, l.province,
      c.name AS company_name,
      (SELECT t.classification FROM tests t WHERE t.employee_id = e.employee_id ORDER BY t.test_date DESC LIMIT 1) AS last_classification,
      (SELECT t.test_date     FROM tests t WHERE t.employee_id = e.employee_id ORDER BY t.test_date DESC LIMIT 1) AS last_test_date
    FROM employees e
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id = l.company_id
    WHERE e.status = 'active'
      AND (e.first_name LIKE ? OR e.last_name LIKE ? OR l.name LIKE ? OR c.name LIKE ?)
    ORDER BY e.last_name, e.first_name
  `, [like, like, like, like])
}

export function createEmployee(data) {
  run(`INSERT INTO employees (location_id, first_name, last_name, dob, hire_date, job_title, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.location_id ?? null,
     data.first_name,
     data.last_name,
     data.dob       ?? null,
     data.hire_date ?? null,
     data.job_title ?? null,
     data.status    ?? 'active']
  )
  return lastInsertId()
}

export function updateEmployee(employeeId, data) {
  run(`UPDATE employees SET
    first_name = ?, last_name = ?, dob = ?, hire_date = ?,
    job_title = ?, status = ?, location_id = ?
    WHERE employee_id = ?`,
    [data.first_name,
     data.last_name,
     data.dob        ?? null,
     data.hire_date  ?? null,
     data.job_title  ?? null,
     data.status     ?? 'active',
     data.location_id ?? null,
     employeeId]
  )
}

export function deleteEmployee(employeeId) {
  run('DELETE FROM employees WHERE employee_id = ?', [employeeId])
}

// ---------------------------------------------------------------------------
// Baselines — scoped to employee + location
// Each employer owns their own baseline for the employee (AB OHS requirement)
// ---------------------------------------------------------------------------

export function getActiveBaseline(employeeId, locationId) {
  return queryOne(
    `SELECT * FROM baselines
     WHERE employee_id = ? AND location_id = ? AND archived = 0
     ORDER BY test_date DESC LIMIT 1`,
    [employeeId, locationId]
  )
}

export function getAllBaselines(employeeId, locationId) {
  if (locationId != null) {
    return query(
      `SELECT * FROM baselines
       WHERE employee_id = ? AND location_id = ?
       ORDER BY test_date DESC`,
      [employeeId, locationId]
    )
  }
  // All baselines across all locations (for employee detail view)
  return query(
    `SELECT b.*, l.name AS location_name, c.name AS company_name
     FROM baselines b
     LEFT JOIN locations l ON l.location_id = b.location_id
     LEFT JOIN companies c ON c.company_id = l.company_id
     WHERE b.employee_id = ?
     ORDER BY b.test_date DESC`,
    [employeeId]
  )
}

export function createBaseline(employeeId, locationId, testDate, thresholds) {
  // Archive existing baselines for this employee at this location
  run(`UPDATE baselines SET archived = 1
       WHERE employee_id = ? AND location_id = ? AND archived = 0`,
    [employeeId, locationId])

  run(`INSERT INTO baselines
    (employee_id, location_id, test_date, ${THRESHOLD_COLS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [employeeId, locationId, testDate, ...thresholdValues(thresholds)]
  )
  return lastInsertId()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thresholdValues(t) {
  return [
    t.left_500  ?? null, t.left_1k  ?? null, t.left_2k  ?? null, t.left_3k  ?? null,
    t.left_4k   ?? null, t.left_6k  ?? null, t.left_8k  ?? null,
    t.right_500 ?? null, t.right_1k ?? null, t.right_2k ?? null, t.right_3k ?? null,
    t.right_4k  ?? null, t.right_6k ?? null, t.right_8k ?? null
  ]
}

/**
 * Gets a filtered, paginated list of employees.
 */
export function getFilteredEmployees(filters = {}) {
  const { 
    search = '', 
    company_id = '', 
    location_id = '', 
    province = '', 
    limit = 100, 
    offset = 0 
  } = filters;

  let sql = `
    SELECT 
      e.*, 
      l.name as location_name, 
      l.province, 
      c.name as company_name,
      c.company_id
    FROM employees e
    JOIN locations l ON e.location_id = l.location_id
    JOIN companies c ON l.company_id = c.company_id
    WHERE e.status = 'active'
  `;

  const params = [];

  if (search) {
    sql += ` AND (e.first_name LIKE ? OR e.last_name LIKE ?) `;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (province) {
    sql += ` AND l.province = ? `;
    params.push(province);
  }

  if (company_id) {
    sql += ` AND c.company_id = ? `;
    params.push(company_id);
  }

  if (location_id) {
    sql += ` AND l.location_id = ? `;
    params.push(location_id);
  }

  // Get total count for pagination info
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const totalCount = queryOne(countSql, params).total;

  // Add sorting and pagination
  sql += ` ORDER BY e.last_name ASC, e.first_name ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return {
    results: query(sql, params),
    totalCount
  };
}