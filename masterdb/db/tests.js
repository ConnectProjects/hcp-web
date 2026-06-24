/**
 * db/tests.js
 * Test queries. Tests now carry a location_id snapshot of where the test
 * was performed. Queries that previously joined through companies now join
 * through locations → companies.
 */

import { query, queryOne, run, lastInsertId } from './sqlite.js'

export function getTestsByEmployee(employeeId) {
  return query(`
    SELECT t.*,
      l.name AS location_name, l.province AS location_province,
      c.name AS company_name,
      h.hpd_make_model, h.rated_nrr, h.derated_nrr, h.lex8hr, h.protected_exposure, h.adequacy
    FROM tests t
    LEFT JOIN locations l ON l.location_id = t.location_id
    LEFT JOIN companies c ON c.company_id = l.company_id
    LEFT JOIN hpd_assessments h ON h.test_id = t.test_id
    WHERE t.employee_id = ?
    ORDER BY t.test_date DESC
  `, [employeeId])
}

export function getRecentTests(locationId, limit = 20) {
  return query(`
    SELECT t.*, e.first_name, e.last_name
    FROM tests t
    JOIN employees e ON e.employee_id = t.employee_id
    WHERE t.location_id = ?
    ORDER BY t.test_date DESC
    LIMIT ?
  `, [locationId, limit])
}

export function getSTSFlags(locationId) {
  return query(`
    SELECT t.*, e.first_name, e.last_name
    FROM tests t
    JOIN employees e ON e.employee_id = t.employee_id
    WHERE t.location_id = ? AND t.sts_flag = 1
    ORDER BY t.test_date DESC
  `, [locationId])
}

export function getOverdueTests(monthsThreshold = 24) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - monthsThreshold)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  return query(`
    SELECT e.*,
      l.name AS location_name, l.province,
      c.name AS company_name,
      MAX(t.test_date) AS last_test_date
    FROM employees e
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id = l.company_id
    LEFT JOIN tests t ON t.employee_id = e.employee_id AND t.location_id = e.location_id
    WHERE e.status = 'active' AND l.active = 1
    GROUP BY e.employee_id
    HAVING last_test_date IS NULL OR last_test_date < ?
    ORDER BY last_test_date ASC
  `, [cutoffStr])
}

export function getComingSoonCompanies(monthsThreshold = 6) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - monthsThreshold)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  // Returns locations (not companies) as the actionable unit for scheduling
  return query(`
    SELECT l.location_id, l.name, l.province,
           c.company_id, c.name AS company_name,
           MAX(t.test_date) AS last_test_date,
           COUNT(e.employee_id) AS active_emp_count
    FROM locations l
    JOIN companies c ON c.company_id = l.company_id
    LEFT JOIN employees e ON e.location_id = l.location_id AND e.status = 'active'
    LEFT JOIN tests t ON t.employee_id = e.employee_id AND t.location_id = l.location_id
    WHERE l.active = 1
    GROUP BY l.location_id
    HAVING last_test_date IS NULL OR last_test_date < ?
    ORDER BY last_test_date ASC
  `, [cutoffStr])
}

/**
 * Helper to ensure we never send 'undefined' to the SQLite engine.
 * SQLite accepts null, but crashes on JavaScript undefined.
 */
const nullify = (v) => (v === undefined || v === "" ? null : v);

export function createTest(data) {
  // 1. Prepare JSON strings safely
  const classJson = data.classification ? JSON.stringify(data.classification) : null;
  const qJson     = data.questionnaire  ? JSON.stringify(data.questionnaire)  : null;
  
  // 2. Determine STS Flag safely
  const cat = (data.classification?.category || data.classification || '').toUpperCase();
  const stsFlag = ['EW', 'EWC', 'A', 'AC'].includes(cat) ? 1 : 0;

  // 3. Execute Insert with sanitized values
  run(`INSERT INTO tests (
      employee_id, location_id, test_date, tech_id, test_type, province,
      left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k,
      right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k,
      classification, triggered_rule_id, triggering_freq_hz, triggering_ear,
      shift_db, sts_flag, counsel_text, tech_notes, questionnaire, packet_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nullify(data.employee_id),
      nullify(data.location_id),
      nullify(data.test_date),
      nullify(data.tech_id),
      nullify(data.test_type || 'Periodic'),
      nullify(data.province),
      // Left Ear
      nullify(data.left_500), nullify(data.left_1k), nullify(data.left_2k), 
      nullify(data.left_3k), nullify(data.left_4k), nullify(data.left_6k), nullify(data.left_8k),
      // Right Ear
      nullify(data.right_500), nullify(data.right_1k), nullify(data.right_2k), 
      nullify(data.right_3k), nullify(data.right_4k), nullify(data.right_6k), nullify(data.right_8k),
      // Metadata
      nullify(classJson),
      nullify(data.classification?.triggered_rule_id),
      nullify(data.classification?.triggering_freq_hz),
      nullify(data.classification?.triggering_ear),
      nullify(data.classification?.shift_db),
      stsFlag,
      nullify(data.counsel_text),
      nullify(data.tech_notes),
      nullify(qJson),
      nullify(data.packet_id)
    ]
  );
  
  return lastInsertId();
}

export function updateTest(testId, data) {
  const qJson = data.questionnaire ? JSON.stringify(data.questionnaire) : null
  run(`UPDATE tests SET
    test_date = ?, test_type = ?, province = ?,
    left_500 = ?, left_1k = ?, left_2k = ?, left_3k = ?, left_4k = ?, left_6k = ?, left_8k = ?,
    right_500 = ?, right_1k = ?, right_2k = ?, right_3k = ?, right_4k = ?, right_6k = ?, right_8k = ?,
    counsel_text = ?, tech_notes = ?,
    referral_given_to_worker = ?, referral_sent_to_employer = ?, referral_sent_date = ?,
    questionnaire = ?
    WHERE test_id = ?`,
    [
      data.test_date,
      data.test_type ?? 'Periodic',
      data.province,
      data.left_500  ?? null, data.left_1k  ?? null, data.left_2k  ?? null, data.left_3k  ?? null,
      data.left_4k   ?? null, data.left_6k  ?? null, data.left_8k  ?? null,
      data.right_500 ?? null, data.right_1k ?? null, data.right_2k ?? null, data.right_3k ?? null,
      data.right_4k  ?? null, data.right_6k ?? null, data.right_8k ?? null,
      data.counsel_text ?? null,
      data.tech_notes ?? null,
      data.referral_given_to_worker  ?? null,
      data.referral_sent_to_employer ?? null,
      data.referral_sent_date        ?? null,
      qJson,
      testId
    ]
  )
}

export function createHPDAssessment(testId, hpd) {
  if (!hpd?.valid) return null
  run(`INSERT INTO hpd_assessments
    (test_id, hpd_make_model, rated_nrr, derated_nrr, lex8hr, protected_exposure, adequacy)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [testId,
     hpd.hpd_model ?? null,
     hpd.rated_nrr,
     hpd.derated_nrr,
     hpd.lex8hr,
     hpd.protected_exposure,
     hpd.adequacy]
  )
  return lastInsertId()
}

export function deleteTest(testId) {
  run('DELETE FROM tests          WHERE test_id = ?', [testId])
  run('DELETE FROM hpd_assessments WHERE test_id = ?', [testId])
}

export function getDashboardStats() {
  const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  return {
    totalCompanies:  queryOne('SELECT COUNT(*) AS n FROM companies  WHERE active = 1')?.n ?? 0,
    totalLocations:  queryOne('SELECT COUNT(*) AS n FROM locations  WHERE active = 1')?.n ?? 0,
    totalEmployees:  queryOne("SELECT COUNT(*) AS n FROM employees  WHERE status = 'active'")?.n ?? 0,
    testsThisMonth:  queryOne('SELECT COUNT(*) AS n FROM tests      WHERE test_date >= ?', [ago30])?.n ?? 0,
    stsFlags:        queryOne(`SELECT COUNT(*) AS n FROM tests t
                               JOIN employees e ON e.employee_id = t.employee_id
                               JOIN locations  l ON l.location_id = e.location_id
                               WHERE t.sts_flag = 1 AND l.active = 1`)?.n ?? 0,
    pendingPackets:  queryOne("SELECT COUNT(*) AS n FROM packets WHERE status = 'pending'")?.n ?? 0,
    incomingPackets: queryOne("SELECT COUNT(*) AS n FROM packets WHERE status = 'submitted'")?.n ?? 0
  }
}

/**
 * Gets full details for a single test, including worker and HPD info.
 */
export function getTestById(id) {
  return queryOne(`
    SELECT t.*,
           e.first_name, e.last_name, e.dob, e.job_title,
           l.name AS location_name, l.province,
           c.name AS company_name,
           h.hpd_make_model, h.rated_nrr, h.derated_nrr,
           h.lex8hr, h.protected_exposure, h.adequacy
    FROM tests t
    JOIN employees e ON t.employee_id = e.employee_id
    JOIN locations l ON t.location_id = l.location_id
    JOIN companies c ON l.company_id = c.company_id
    LEFT JOIN hpd_assessments h ON t.test_id = h.test_id
    WHERE t.test_id = ?
  `, [id])
}
