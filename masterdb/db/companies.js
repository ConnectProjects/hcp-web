import { query, queryOne, transaction, run } from './sqlite.js'

/**
 * Gets all active companies.
 * Aggregates data from child locations for Schema 2.0.
 */
export function getAllCompanies() {
  return query(`
    SELECT 
      c.*,
      (SELECT GROUP_CONCAT(DISTINCT province) FROM locations WHERE company_id = c.company_id) as province_list,
      (SELECT COUNT(*) FROM employees e JOIN locations l ON e.location_id = l.location_id WHERE l.company_id = c.company_id) as employee_count,
      (SELECT DATE(MAX(test_date)) FROM tests t JOIN locations l ON t.location_id = l.location_id WHERE l.company_id = c.company_id) as last_test_date
    FROM companies c
    WHERE c.active = 1
    ORDER BY c.name ASC
  `);
}

/**
 * Gets a single company by ID.
 * Renamed to 'getCompany' to match the import in company-detail.js
 */
export function getCompany(id) {
  return queryOne(`
    SELECT 
      c.*,
      (SELECT GROUP_CONCAT(DISTINCT province) FROM locations WHERE company_id = c.company_id) as province_list
    FROM companies c 
    WHERE c.company_id = ?
  `, [id]);
}

/**
 * Search companies by name.
 */
export function searchCompanies(q) {
  return query(`
    SELECT 
      c.*,
      (SELECT GROUP_CONCAT(DISTINCT province) FROM locations WHERE company_id = c.company_id) as province_list,
      (SELECT COUNT(*) FROM employees e JOIN locations l ON e.location_id = l.location_id WHERE l.company_id = c.company_id) as employee_count,
      (SELECT MAX(test_date) FROM tests t JOIN locations l ON t.location_id = l.location_id WHERE l.company_id = c.company_id) as last_test_date
    FROM companies c
    WHERE c.active = 1 AND c.name LIKE ?
    ORDER BY c.name ASC
  `, [`%${q}%`]);
}

/**
 * Creates a new company AND an automatic 'Main Office' location.
 */
export function createCompany(data) {
  let newCompanyId;
  transaction(({ run }) => {
    // Only insert name (and auto-timestamps)
    run(`INSERT INTO companies (name) VALUES (?)`, [data.name]);
    newCompanyId = queryOne("SELECT last_insert_rowid() AS id").id;

    // Create default location
    run(`INSERT INTO locations (company_id, name, province) VALUES (?, 'Main Office', ?)`, 
        [newCompanyId, data.province]);
  });
  return newCompanyId;
}

/**
 * Updates company HQ details.
 */
export function updateCompany(id, data) {
  return run(`
    UPDATE companies
    SET name = ?, address = ?, city = ?, contact_name = ?,
        contact_phone = ?, contact_email = ?, website = ?, sticky_notes = ?,
        updated_at = datetime('now')
    WHERE company_id = ?
  `, [data.name, data.address, data.city, data.contact_name, data.contact_phone, data.contact_email, data.website, data.sticky_notes, id]);
}

/**
 * Deactivates a company (Soft delete).
 */
export function deactivateCompany(id) {
  return run(`UPDATE companies SET active = 0, updated_at = datetime('now') WHERE company_id = ?`, [id]);
}