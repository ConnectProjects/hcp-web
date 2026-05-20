import { query, queryOne, transaction } from './sqlite.js'

/**
 * Gets all active companies.
 * Aggregates provinces, employee counts, and last visit dates from child locations.
 */
export function getAllCompanies() {
  return query(`
    SELECT 
      c.*,
      -- Aggregates all unique provinces from this company's locations
      (SELECT GROUP_CONCAT(DISTINCT province) FROM locations WHERE company_id = c.company_id) as province_list,
      -- Counts employees across all locations belonging to this company
      (SELECT COUNT(*) FROM employees e JOIN locations l ON e.location_id = l.location_id WHERE l.company_id = c.company_id) as employee_count,
      -- Finds the most recent test date across all company locations
      (SELECT MAX(test_date) FROM tests t JOIN locations l ON t.location_id = l.location_id WHERE l.company_id = c.company_id) as last_test_date
    FROM companies c
    WHERE c.active = 1
    ORDER BY c.name ASC
  `);
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
 * This keeps the "Add Company" workflow simple while respecting Schema 2.0.
 */
export function createCompany(data) {
  let newCompanyId;

  // Use a transaction to ensure both Company and Location are created together
  transaction(({ run }) => {
    
    // 1. Insert the Company
    run(`
      INSERT INTO companies (
        name, address, contact_name, contact_phone, 
        contact_email, sticky_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      data.name, 
      data.address, 
      data.contact_name, 
      data.contact_phone, 
      data.contact_email, 
      data.sticky_notes
    ]);

    newCompanyId = queryOne("SELECT last_insert_rowid() AS id").id;

    // 2. Insert the default 'Main Office' Location
    run(`
      INSERT INTO locations (
        company_id, name, province, address, 
        contact_name, contact_phone, contact_email, 
        active, created_at, updated_at
      ) VALUES (?, 'Main Office', ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [
      newCompanyId,
      data.province,     // The province selected in the UI
      data.address,      // Shared with company HQ info
      data.contact_name, 
      data.contact_phone, 
      data.contact_email
    ]);
  });

  return newCompanyId;
}