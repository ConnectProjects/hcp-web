/**
 * db/companies.js
 * Company-level queries. Province and HPD inventory now live on locations.
 */

import { query, queryOne, run, lastInsertId } from './sqlite.js'

export function getAllCompanies() {
  return query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.company_id AND l.active = 1) AS location_count,
      (SELECT COUNT(*) FROM employees e
         JOIN locations l ON l.location_id = e.location_id
         WHERE l.company_id = c.company_id AND e.status = 'active') AS employee_count,
      (SELECT MAX(t.test_date) FROM tests t
         JOIN employees e ON e.employee_id = t.employee_id
         JOIN locations l ON l.location_id = e.location_id
         WHERE l.company_id = c.company_id) AS last_test_date
    FROM companies c
    WHERE c.active = 1
    ORDER BY c.name ASC
  `)
}

export function getCompany(companyId) {
  return queryOne('SELECT * FROM companies WHERE company_id = ?', [companyId])
}

export function searchCompanies(q) {
  const like = `%${q}%`
  return query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.company_id AND l.active = 1) AS location_count,
      (SELECT COUNT(*) FROM employees e
         JOIN locations l ON l.location_id = e.location_id
         WHERE l.company_id = c.company_id AND e.status = 'active') AS employee_count
    FROM companies c
    WHERE c.active = 1
      AND (c.name LIKE ? OR c.contact_name LIKE ? OR c.city LIKE ?)
    ORDER BY c.name ASC
  `, [like, like, like])
}

export function createCompany(data) {
  run(`INSERT INTO companies
    (name, address, city, contact_name, contact_phone, contact_email, website, sticky_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.name,
     data.address       ?? null,
     data.city          ?? null,
     data.contact_name  ?? null,
     data.contact_phone ?? null,
     data.contact_email ?? null,
     data.website       ?? null,
     data.sticky_notes  ?? null]
  )
  return lastInsertId()
}

export function updateCompany(companyId, data) {
  run(`UPDATE companies SET
    name = ?, address = ?, city = ?, contact_name = ?, contact_phone = ?,
    contact_email = ?, website = ?, sticky_notes = ?, updated_at = datetime('now')
    WHERE company_id = ?`,
    [data.name,
     data.address       ?? null,
     data.city          ?? null,
     data.contact_name  ?? null,
     data.contact_phone ?? null,
     data.contact_email ?? null,
     data.website       ?? null,
     data.sticky_notes  ?? null,
     companyId]
  )
}

export function deactivateCompany(companyId) {
  run(`UPDATE companies SET active = 0, updated_at = datetime('now') WHERE company_id = ?`, [companyId])
}
