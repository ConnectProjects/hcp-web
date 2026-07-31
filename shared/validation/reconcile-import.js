/**
 * shared/validation/reconcile-import.js
 *
 * Post-import reconciliation — the "fail loud" gate for packet imports.
 *
 * Called INSIDE the import transaction, after the write loop and BEFORE COMMIT.
 * If any assertion fails it THROWS, which rolls back the whole packet so an
 * import either lands completely and correctly or not at all. A half-imported
 * occupational-health packet that reports success is the exact failure mode
 * that hid INCIDENT-2026-07-29 (Yorkton) — see INCIDENT-2026-07-29-yorkton.md.
 *
 * What this CAN catch (write-time faults):
 *   - Silent partial import: fewer tests written than the packet's
 *     completed_tests count, with the difference unaccounted for.
 *   - Wrong location: import resolved to a different location_id than the
 *     packet specifies, or to a location in a different province.
 *   - Broken references: an inserted test that doesn't point at a real
 *     employee / isn't stamped with the resolved location.
 *
 * What this CANNOT catch (deferred to the ID/sync rework):
 *   - Rows destroyed or cross-linked AFTER commit by the row-level merge sync
 *     colliding on autoincrement primary keys across instances. That requires
 *     globally-unique ids + optimistic concurrency and is a separate pass.
 */

const THRESHOLD_COLS = [
  'left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
  'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k'
]

/**
 * Count the completed tests in a packet that carry real threshold data.
 * (Tests with no threshold data are legitimately skipped on import.)
 * Returns { total, withData, empty }.
 */
export function countPacketCompletedTests(packet) {
  let total = 0, withData = 0, empty = 0
  for (const emp of packet.employees ?? []) {
    for (const t of emp.completed_tests ?? []) {
      total++
      const th = t.thresholds ?? {}
      const has = THRESHOLD_COLS.some(c => th[c] != null && th[c] !== '')
      if (has) withData++; else empty++
    }
  }
  return { total, withData, empty }
}

/**
 * Assert the import result matches the packet. Throws on any mismatch.
 *
 * @param {object}   o
 * @param {object}   o.packet             - the source packet JSON
 * @param {function} o.queryOne           - db queryOne(sql, params)
 * @param {object}   o.defaultLocation    - resolved location row {location_id, name, province, active}
 * @param {number}   [o.locationIdOverride] - staff-selected override, if any
 * @param {number}   o.imported           - tests actually inserted this run
 * @param {number}   [o.skippedDuplicate] - tests skipped because already present
 * @param {number}   [o.skippedEmpty]     - tests skipped for no threshold data
 * @param {number[]} [o.insertedTestIds]  - test_ids inserted this run (identity check)
 */
export function reconcileImport({
  packet,
  queryOne,
  defaultLocation,
  locationIdOverride = null,
  imported,
  skippedDuplicate = 0,
  skippedEmpty = 0,
  insertedTestIds = []
}) {
  const errors = []

  // 1. COUNT — every completed test must be accounted for.
  const { total: expectedTotal } = countPacketCompletedTests(packet)
  const accounted = imported + skippedDuplicate + skippedEmpty
  if (accounted !== expectedTotal) {
    errors.push(
      `Count mismatch: packet has ${expectedTotal} completed test(s), but only ${accounted} ` +
      `were accounted for (${imported} imported, ${skippedDuplicate} duplicate, ${skippedEmpty} empty). ` +
      `${expectedTotal - accounted} test(s) vanished with no error.`
    )
  }

  // 2. LOCATION — must match the packet and never cross provinces.
  if (!defaultLocation) {
    errors.push('No location was resolved for this import.')
  } else {
    const pLocId = packet.location?.location_id
    if (!locationIdOverride && pLocId != null &&
        Number(defaultLocation.location_id) !== Number(pLocId)) {
      errors.push(
        `Location mismatch: packet specifies location_id ${pLocId} but the import resolved to ` +
        `${defaultLocation.location_id} ("${defaultLocation.name}"). Locations must resolve by id, not name.`
      )
    }
    const pProv = packet.company?.province ?? packet.visit?.province ?? null
    if (pProv && defaultLocation.province && defaultLocation.province !== pProv) {
      errors.push(
        `Province mismatch: packet is ${pProv} but resolved location ${defaultLocation.location_id} ` +
        `("${defaultLocation.name}") is ${defaultLocation.province}. Refusing to file ${pProv} tests ` +
        `into a ${defaultLocation.province} location — this is the duplicate-location trap.`
      )
    }
  }

  // 3. IDENTITY — each inserted test must sit on the resolved location and
  //    reference an employee that actually exists.
  for (const testId of insertedTestIds) {
    const row = queryOne(
      `SELECT t.test_id, t.location_id, t.employee_id, e.employee_id AS emp_exists
         FROM tests t LEFT JOIN employees e ON e.employee_id = t.employee_id
        WHERE t.test_id = ?`,
      [testId]
    )
    if (!row) { errors.push(`Inserted test ${testId} could not be read back.`); continue }
    if (defaultLocation && Number(row.location_id) !== Number(defaultLocation.location_id)) {
      errors.push(`Test ${testId} was stamped location ${row.location_id}, expected ${defaultLocation.location_id}.`)
    }
    if (row.emp_exists == null) {
      errors.push(`Test ${testId} references employee ${row.employee_id}, which does not exist.`)
    }
  }

  if (errors.length) {
    throw new Error(
      'Import reconciliation failed — the whole packet was rolled back, nothing was imported:\n  • ' +
      errors.join('\n  • ')
    )
  }
}
