/**
 * HCP-Web OneDrive Packet Schema
 *
 * Packets are JSON files written to techs/{folder_name}/ by MasterDB and picked up
 * by the assigned tech's TechTool. Completed packets are written to inbox/ by TechTool
 * and imported by MasterDB. After import, packets are moved to archive/.
 *
 * Filename format: {CompanyName}_{YYYY-MM-DD}_{TechInitials}.json
 * Example:         SunriseMillingLP_2026-04-15_NR.json
 *
 * Packet ID format: {PROVINCE}-{CompanySlug}-{YYYYMMDD}-{TechInitials}
 * Example:          AB-SunriseMilling-20260415-NR
 */

// ---------------------------------------------------------------------------
// Packet status values
// ---------------------------------------------------------------------------

export const PACKET_STATUS = {
  PENDING:     'pending',      // Created by MasterDB, not yet picked up by tech
  SYNCED:      'synced',       // Downloaded to TechTool IndexedDB
  IN_PROGRESS: 'in_progress',  // At least one test started
  COMPLETE:    'complete',     // All tests done, ready for /outbox
  SUBMITTED:   'submitted',    // Dropped to /outbox
  IMPORTED:    'imported',     // Pulled into MasterDB SQLite
  ARCHIVED:    'archived',     // Moved to /archive
  CANCELLED:   'cancelled'     // Cancelled by LC (before pickup) or tech (before submission)
}

// ---------------------------------------------------------------------------
// Packet factory
// ---------------------------------------------------------------------------

/**
 * Create a new outbound packet (MasterDB → TechTool via /inbox).
 *
 * @param {object} opts
 * @param {object} opts.company           - Company record from MasterDB
 * @param {object} [opts.location]        - Location record this visit was generated for
 * @param {Array}  opts.employees         - Employee records with baseline and prior tests
 * @param {Array}  opts.rules             - Province classification rules (from rules/XX.json)
 * @param {Array}  opts.counselTemplates  - Counsel templates (from counsel/XX.json)
 * @param {Array}  opts.hpdInventory      - HPD items for this company
 * @param {string} opts.techId            - Tech user ID
 * @param {string} opts.techInitials      - Tech initials (used in filename)
 * @param {string} opts.visitDate         - ISO date string YYYY-MM-DD
 * @param {string} [opts.stickyNotes]     - Office notes to tech
 * @returns {object} packet
 */
export function createPacket({ company, location, employees, rules, counselTemplates, hpdInventory, techId, techInitials, visitDate, stickyNotes = '' }) {
  const slug = company.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
  const dateCompact = visitDate.replace(/-/g, '')
  const packetId = `${company.province}-${slug}-${dateCompact}-${techInitials}`
  const filename = `${slug}_${visitDate}_${techInitials}.json`

  return {
    packet_id:      packetId,
    filename,
    schema_version: '1.0',
    status:         PACKET_STATUS.PENDING,
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),

    tech: {
      tech_id:      techId,
      tech_initials: techInitials
    },

    visit: {
      visit_date:   visitDate,
      province:     company.province
    },

    company: {
      company_id:   company.company_id,
      name:         company.name,
      province:     company.province,
      address:      company.address     ?? null,
      contact_name: company.contact_name ?? null,
      contact_phone: company.contact_phone ?? null,
      contact_email: company.contact_email ?? null,
      sticky_notes: stickyNotes
    },

  location: location ? {
  location_id: location.location_id ?? null,
  name:        location.name        ?? null,
  province:    location.province    ?? company.province ?? null,
  address:     location.address     ?? null
} : null,

    // Classification rules for this company's province — snapshotted at packet creation time
    rules,

    // Counsel templates for this province — snapshotted at packet creation time
    counsel_templates: counselTemplates,

    // HPD inventory for this company
    hpd_inventory: hpdInventory ?? [],

    // Employee roster with baselines and prior test history
    employees: employees.map(emp => ({
      employee_id:    emp.employee_id,
      first_name:     emp.first_name,
      last_name:      emp.last_name,
      dob:            emp.dob            ?? null,
      hire_date:      emp.hire_date      ?? null,
      job_title:      emp.job_title      ?? null,
      status:         emp.status         ?? 'active',

      // Active baseline — null if no baseline on file
      baseline: emp.baseline ? {
        baseline_id:  emp.baseline.baseline_id,
        test_date:    emp.baseline.test_date,
        thresholds:   extractThresholds(emp.baseline)
      } : null,

      // Last 3 periodic tests, newest first
      prior_tests: (emp.prior_tests ?? []).slice(0, 3).map(t => ({
        test_id:        t.test_id,
        test_date:      t.test_date,
        classification: t.classification ?? null,
        thresholds:     extractThresholds(t)
      })),

      // Completed tests appended by TechTool — empty until tech submits
      completed_tests: []
    })),

    // Submission metadata — populated by TechTool at submit time
    submitted_at:  null,
    submitted_by:  null
  }
}

// ---------------------------------------------------------------------------
// Packet completion (TechTool → MasterDB via /outbox)
// ---------------------------------------------------------------------------

/**
 * Append a completed test result to an employee in the packet.
 * Called by TechTool when the tech finalizes a test.
 *
 * @param {object} packet       - The in-memory packet object
 * @param {string} employeeId   - Employee to update
 * @param {object} testResult   - Completed test data
 * @returns {object} Updated packet (mutates in place)
 */
export function appendTestResult(packet, employeeId, testResult) {
  const emp = packet.employees.find(e => e.employee_id == employeeId)
  if (!emp) throw new Error(`Employee ${employeeId} not found in packet ${packet.packet_id}`)

  // Hardened duplicate prevention: If we already have a test for this employee in this packet, 
  // we replace it instead of appending. This prevents dual-click or re-test duplication.
  emp.completed_tests = (emp.completed_tests ?? []).filter(t => t.test_date !== testResult.test_date)

  emp.completed_tests.push({
    test_date:                testResult.test_date,
    tech_id:                  testResult.tech_id,
    test_type:                testResult.test_type ?? 'Periodic',
    thresholds:               extractThresholds(testResult),
    classification:           testResult.classification           ?? null,
    counsel_text:             testResult.counsel_text             ?? null,
    hpd_assessment:           testResult.hpd_assessment           ?? null,
    questionnaire:            testResult.questionnaire            ?? null,
    notes:                    testResult.notes                    ?? null,
    referral_given_to_worker: testResult.referral_given_to_worker ? 1 : 0,
    entered_at:               new Date().toISOString()
  })

  packet.updated_at = new Date().toISOString()
  return packet
}

/**
 * Mark an employee as skipped (not tested this visit).
 *
 * @param {object} packet      - The in-memory packet object
 * @param {string} employeeId  - Employee to skip
 * @param {string} reason      - Reason for skipping
 * @returns {object} Updated packet (mutates in place)
 */
export function markEmployeeSkipped(packet, employeeId, reason) {
  const emp = packet.employees.find(e => e.employee_id == employeeId)
  if (!emp) throw new Error(`Employee ${employeeId} not found in packet`)
  emp.skipped_at  = new Date().toISOString()
  emp.skip_reason = reason ?? null
  packet.updated_at = new Date().toISOString()
  return packet
}

/**
 * Add a new employee to the packet (added on-site by tech).
 *
 * @param {object} packet                          - The in-memory packet object
 * @param {object} opts
 * @param {string} opts.first_name
 * @param {string} opts.last_name
 * @param {string} [opts.job_title]
 * @param {string} [opts.dob]
 * @param {string} [opts.sin_last_4]
 * @param {string} [opts.phone]
 * @param {string} [opts.email]
 * @param {string} [opts.tenure]
 * @returns {object} Updated packet (mutates in place)
 */
export function addNewEmployee(packet, { first_name, last_name, job_title = null, dob = null, sin_last_4 = null, phone = null, email = null, tenure = null }) {
  const tempId = 'new_' + Date.now()
  packet.employees.push({
    employee_id:     tempId,
    first_name,
    last_name,
    dob,
    sin_last_4,
    phone,
    email,
    tenure,
    hire_date:       null,
    job_title,
    status:          'active',
    baseline:        null,
    prior_tests:     [],
    completed_tests: [],
    new_employee:    true
  })
  packet.updated_at = new Date().toISOString()
  return packet
}

/**
 * Mark a packet as submitted (ready for /outbox).
 */
export function markSubmitted(packet, techId) {
  packet.status       = PACKET_STATUS.SUBMITTED
  packet.submitted_at = new Date().toISOString()
  packet.submitted_by = techId
  packet.updated_at   = new Date().toISOString()
  return packet
}

// ---------------------------------------------------------------------------
// Packet validation
// ---------------------------------------------------------------------------

/**
 * Basic structural validation of a packet before import.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
export function validatePacket(packet) {
  const errors = []

  if (!packet.packet_id)      errors.push('Missing packet_id')
  if (!packet.schema_version) errors.push('Missing schema_version')
  if (!packet.company)        errors.push('Missing company block')
  if (!packet.visit)          errors.push('Missing visit block')
  if (!Array.isArray(packet.employees)) errors.push('employees must be an array')
  if (!Array.isArray(packet.rules))     errors.push('rules must be an array')

  if (packet.company && !packet.company.province) {
    errors.push('company.province is required')
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract only the threshold fields from a test/baseline object.
 */
function extractThresholds(test) {
  return {
    left_500:  test.left_500  ?? null,
    left_1k:   test.left_1k   ?? null,
    left_2k:   test.left_2k   ?? null,
    left_3k:   test.left_3k   ?? null,
    left_4k:   test.left_4k   ?? null,
    left_6k:   test.left_6k   ?? null,
    left_8k:   test.left_8k   ?? null,
    right_500: test.right_500 ?? null,
    right_1k:  test.right_1k  ?? null,
    right_2k:  test.right_2k  ?? null,
    right_3k:  test.right_3k  ?? null,
    right_4k:  test.right_4k  ?? null,
    right_6k:  test.right_6k  ?? null,
    right_8k:  test.right_8k  ?? null
  }
}
