/**
 * db/import-packet.js
 *
 * Pure, dependency-injected core of a MasterDB packet import — the exact write
 * sequence that must run inside the import transaction. Extracted verbatim from
 * import-confirm.js's doImport() so the same code that runs in the app can be
 * exercised directly by the Yorkton regression fixture (INCIDENT-2026-07-29).
 *
 * The CALLER wraps this in transaction() so rollback semantics are unchanged:
 * reconcileImport() throws on any mismatch → the whole packet rolls back and
 * nothing is imported.
 *
 * All database access is injected via `deps` (mirrors json-database.js
 * syncMaster's queryFn/runFn pattern) so nothing here imports the browser
 * sql.js layer, and the function runs in Node against a copy database.
 *
 * @param {object}      o
 * @param {object}      o.packet              source packet JSON
 * @param {object|null} o.company             resolved company row, or null to create from packet
 * @param {number|null} o.locationIdOverride  staff-selected location override, if any
 * @param {object}      o.deps                { query, queryOne, run, createTest,
 *                                              createHPDAssessment, createBaseline,
 *                                              getActiveBaseline, classify, reconcileImport }
 * @returns {object} { imported, skippedEmpty, skippedDuplicate, insertedTestIds,
 *                     defaultLocation, resolvedCompany }
 */
export function importPacket({ packet, company, locationIdOverride = null, deps }) {
  const {
    query, queryOne, run,
    createTest, createHPDAssessment, createBaseline, getActiveBaseline,
    classify, reconcileImport
  } = deps

  const province = packet.company?.province ?? 'BC'

  // Classify-at-import: MasterDB owns the authoritative classification because
  // it holds the worker's true baseline history (TechTool may have tested with
  // no baseline or a stale one). Resolve the province rules once for the whole
  // packet: prefer the rules the packet was generated with, else fall back to
  // MasterDB's own classification_rules table — the same authoritative source
  // generate-packet.js uses, and (unlike shared/rules/AB.json) it covers AB.
  const rules = (Array.isArray(packet.rules) && packet.rules.length)
    ? packet.rules
    : query('SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC', [province])
  if (!rules.length) {
    console.warn(`No ${province} classification rules available — tests will import as unclassified (recompute later).`)
  }

  let   imported = 0
  let   skippedEmpty = 0
  let   skippedDuplicate = 0
  const insertedTestIds = []
  let   resolvedCompany = company
  let   defaultLocation = null

  // Create company if needed (offline packet, user chose "new").
  // NOTE: province lives on `locations`, not `companies` (it moved there in a
  // prior schema change). The old INSERT still listed a `companies.province`
  // column that no longer exists, so creating a brand-new company on import
  // threw "no such column: province" and failed the whole packet. The packet's
  // province is carried into the location INSERT below via the `province` var.
  if (!resolvedCompany) {
    run(`INSERT INTO companies
      (name, address, contact_name, contact_phone, contact_email, sticky_notes, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        packet.company?.name     ?? '',
        packet.company?.address       ?? null,
        packet.company?.contact_name  ?? null,
        packet.company?.contact_phone ?? null,
        packet.company?.contact_email ?? null,
        packet.company?.sticky_notes  ?? null
      ]
    )
    resolvedCompany = queryOne(
      `SELECT * FROM companies WHERE name = ? LIMIT 1`,
      [packet.company?.name ?? '']
    )
    if (!resolvedCompany) throw new Error('Failed to create company record.')
  }

  if (locationIdOverride) {
    defaultLocation = queryOne('SELECT * FROM locations WHERE location_id = ? AND active = 1', [locationIdOverride])
    if (!defaultLocation) throw new Error(`Selected location ${locationIdOverride} not found or is inactive.`)
  } else {
    if (packet.location?.location_id) {
      defaultLocation = queryOne(
        `SELECT * FROM locations WHERE location_id = ? AND company_id = ? AND active = 1`,
        [packet.location.location_id, resolvedCompany.company_id]
      )
    }
    if (!defaultLocation && packet.location?.name) {
      defaultLocation = queryOne(
        `SELECT * FROM locations WHERE company_id = ? AND LOWER(name) = LOWER(?) AND active = 1 LIMIT 1`,
        [resolvedCompany.company_id, packet.location.name]
      )
    }
    if (!defaultLocation) {
      run(`INSERT INTO locations (company_id, name, province, active) VALUES (?, ?, ?, 1)`,
        [resolvedCompany.company_id, packet.location?.name ?? `${resolvedCompany.name} Main Location`, resolvedCompany.province ?? province]
      )
      defaultLocation = queryOne(
        `SELECT * FROM locations WHERE company_id = ? ORDER BY location_id DESC LIMIT 1`,
        [resolvedCompany.company_id]
      )
    }
  }

  for (const emp of packet.employees) {
    if (!emp.completed_tests?.length) continue

    // Find or create employee within default location
    let dbEmp = queryOne(
      `SELECT employee_id FROM employees
       WHERE location_id = ? AND first_name = ? AND last_name = ?`,
      [defaultLocation.location_id, emp.first_name, emp.last_name]
    )

    if (!dbEmp) {
      run(`INSERT INTO employees
        (location_id, first_name, last_name, dob, hire_date, job_title, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          defaultLocation.location_id,
          emp.first_name,
          emp.last_name,
          emp.dob        ?? null,
          emp.hire_date  ?? null,
          emp.job_title  ?? null,
          emp.status     ?? 'active'
        ]
      )

      dbEmp = queryOne(
        `SELECT employee_id FROM employees
         WHERE location_id = ? AND first_name = ? AND last_name = ?
         LIMIT 1`,
        [defaultLocation.location_id, emp.first_name, emp.last_name]
      )

      if (!dbEmp) {
        console.warn(`Could not create employee: ${emp.last_name}, ${emp.first_name}`)
        continue
      }
    }

    for (const test of emp.completed_tests) {
      // Skip tests with no threshold data
      const thresholds = test.thresholds ?? {}
      const hasData = Object.values(thresholds).some(v => v != null && v !== '')
      if (!hasData) {
        console.warn(`Skipping test for ${emp.last_name} on ${test.test_date}: no threshold data`)
        skippedEmpty++
        continue
      }

      // Prevention: Check if this specific test already exists
      const existingTest = queryOne(
        `SELECT test_id FROM tests
         WHERE employee_id = ? AND test_date = ? AND tech_id = ?`,
        [dbEmp.employee_id, test.test_date, test.tech_id ?? packet.tech?.tech_id ?? null]
      )

      if (existingTest) {
        console.log(`Skipping duplicate test for ${emp.last_name} on ${test.test_date}`)
        skippedDuplicate++
        continue
      }

      // If this employee has no prior tests at this location, it's their first —
      // automatically treat it as the baseline regardless of what TechTool tagged it.
      const priorCount = queryOne(
        'SELECT COUNT(*) AS n FROM tests WHERE employee_id = ? AND location_id = ?',
        [dbEmp.employee_id, defaultLocation.location_id]
      )?.n ?? 0
      const isFirstTest = priorCount === 0

      // Compute the classification against the worker's active baseline in
      // MasterDB. A first test at this location has no baseline, so the
      // engine takes its no-baseline path and returns category 'N' (this is
      // the correct new-hire result — e.g. the Selsek case in the incident).
      const baselineForClass = isFirstTest
        ? null
        : getActiveBaseline(dbEmp.employee_id, defaultLocation.location_id)
      const classification = classify(test.thresholds ?? {}, baselineForClass, rules)

      const testId = createTest({
        employee_id:              dbEmp.employee_id,
        location_id:              defaultLocation.location_id,
        test_date:                test.test_date,
        tech_id:                  test.tech_id ?? packet.tech?.tech_id,
        test_type:                isFirstTest ? 'Baseline' : (test.test_type ?? 'Periodic'),
        province,
        ...(test.thresholds ?? {}),
        classification,
        counsel_text:             test.counsel_text,
        tech_notes:               test.tech_notes,
        questionnaire:            test.questionnaire,
        referral_given_to_worker: test.referral_given_to_worker ?? 0,
        packet_id:                packet.packet_id
      })

      if (test.hpd_assessment?.valid) {
        createHPDAssessment(testId, test.hpd_assessment)
      }

      if (isFirstTest || test.test_type === 'Baseline') {
        createBaseline(
          dbEmp.employee_id,
          defaultLocation.location_id,
          test.test_date,
          test.thresholds ?? {}
        )
      }

      insertedTestIds.push(testId)
      imported++
    }
  }

  // Fail loud: verify the whole packet landed correctly before COMMIT.
  // Any mismatch throws → the transaction rolls back → nothing imports.
  reconcileImport({
    packet, queryOne, defaultLocation,
    locationIdOverride: locationIdOverride ?? null,
    imported, skippedDuplicate, skippedEmpty, insertedTestIds
  })

  return { imported, skippedEmpty, skippedDuplicate, insertedTestIds, defaultLocation, resolvedCompany }
}
