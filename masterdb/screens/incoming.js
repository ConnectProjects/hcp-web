import { getPacketsByStatus }  from '../db/packets.js'
import { query, queryOne, run, transaction } from '../db/sqlite.js'
import { updatePacketStatus }  from '../db/packets.js'
import { createTest, createHPDAssessment } from '../db/tests.js'
import { createBaseline }      from '../db/employees.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile, moveJsonFile } from '@shared/fs/sync-folder.js'
import { reconcileImport } from '@shared/validation/reconcile-import.js'
import { withSyncLock, acquireImportClaim, releaseImportClaim } from '@shared/fs/single-writer.js'

export function renderIncoming(container, state, navigate) {
  const packets = getPacketsByStatus('submitted')

  const mismatchRows = query("SELECT key, value FROM settings WHERE key LIKE 'packet_loc_mismatch_%'")
  const mismatches = {}
  for (const r of mismatchRows) mismatches[r.key.replace('packet_loc_mismatch_', '')] = r.value
  const reviewCount = packets.filter(p => mismatches[p.packet_id]).length
  const readyCount  = packets.length - reviewCount

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Incoming Packets</h1>
        <button class="btn btn-primary" id="btn-check-inbox">Check Sync Folder</button>
      </div>

      <div id="check-status" class="hidden"></div>

      ${packets.length === 0
        ? `<div class="empty-state">
             <p>No packets awaiting import.</p>
             <p>Click <strong>Check Sync Folder</strong> to scan for completed packets from techs.</p>
           </div>`
        : `${reviewCount > 0 ? `<p class="section-note" style="color:#c0392b">⚠ ${reviewCount} packet(s) need location review before importing.</p>` : ''}
           ${readyCount  > 0 ? `<p class="section-note">${readyCount} packet(s) ready to import.</p>` : ''}
           <div class="incoming-cards">
             ${packets.map(p => incomingCard(p, mismatches[p.packet_id])).join('')}
           </div>`
      }
    </div>
  `

  container.querySelector('#btn-check-inbox').addEventListener('click', () =>
    checkInbox(container, state, navigate)
  )

  container.querySelectorAll('.btn-import').forEach(btn => {
    btn.addEventListener('click', async () => {
      const packetId = btn.dataset.packetId
      const row = queryOne('SELECT value FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
      if (!row) { navigate('incoming'); return }
      let packet
      try { packet = JSON.parse(row.value) } catch { navigate('incoming'); return }
      btn.disabled = true
      btn.textContent = 'Importing…'
      const { imported, error } = importPacket(packet, packetId)
      if (error) {
        btn.disabled = false
        btn.textContent = 'Import'
        const status = container.querySelector('#check-status')
        status.textContent = `Error: ${error}`
        status.className = 'alert alert-error'
        status.classList.remove('hidden')
      } else {
        btn.textContent = `✓ ${imported} imported`
        setTimeout(() => navigate('incoming'), 1000)
      }
    })
  })

  container.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', () => {
      const packetId = btn.dataset.packetId
      if (!confirm('Reject this packet? It will be removed from the import list.')) return
      run('UPDATE packets SET status = "rejected", updated_at = datetime("now") WHERE packet_id = ?', [packetId])
      run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
      run('DELETE FROM settings WHERE key = ?', [`packet_loc_mismatch_${packetId}`])
      navigate('incoming')
    })
  })

  // Location-override import for mismatched packets
  container.querySelectorAll('.loc-override-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const btn = container.querySelector(`.btn-import-override[data-packet-id="${sel.dataset.packetId}"]`)
      if (btn) btn.disabled = !sel.value
    })
  })

  container.querySelectorAll('.btn-import-override').forEach(btn => {
    btn.addEventListener('click', async () => {
      const packetId   = btn.dataset.packetId
      const sel        = container.querySelector(`.loc-override-select[data-packet-id="${packetId}"]`)
      const locationId = parseInt(sel?.value)
      if (!locationId) return
      const row = queryOne('SELECT value FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
      if (!row) { navigate('incoming'); return }
      let packet
      try { packet = JSON.parse(row.value) } catch { navigate('incoming'); return }
      btn.disabled    = true
      btn.textContent = 'Importing…'
      const { imported, error } = importPacket(packet, packetId, locationId)
      if (error) {
        btn.disabled    = false
        btn.textContent = 'Import →'
        alert('Import failed: ' + error)
      } else {
        run('DELETE FROM settings WHERE key = ?', [`packet_loc_mismatch_${packetId}`])
        btn.textContent = `✓ ${imported} imported`
        setTimeout(() => navigate('incoming'), 1000)
      }
    })
  })
}

function incomingCard(p, mismatchLocName) {
  if (mismatchLocName) {
    const locations = query(
      'SELECT location_id, name FROM locations WHERE company_id = ? AND active = 1 ORDER BY name',
      [p.company_id]
    )
    const suggested = suggestLocation(locations, mismatchLocName)
    return `
      <div class="incoming-card" style="border-left:4px solid #f0ad4e">
        <div class="incoming-card__info">
          <div class="incoming-company">${esc(p.company_name)}</div>
          <div class="incoming-meta">
            <span class="province-badge">${esc(p.province)}</span>
            · Visit ${p.visit_date}
            · Packet: ${esc(p.packet_id)}
          </div>
          <div style="margin-top:8px; background:#fff8e1; border-radius:4px; padding:8px; font-size:12px">
            ⚠ Location not found: <strong>${esc(mismatchLocName)}</strong>
            <div style="margin-top:6px">
              <label style="display:block; margin-bottom:4px; font-weight:600; font-size:11px; text-transform:uppercase; color:#666">Import into:</label>
              <select class="search-input loc-override-select" data-packet-id="${esc(p.packet_id)}" style="width:100%; font-size:12px">
                <option value="">-- Select location --</option>
                ${locations.map(l => `<option value="${l.location_id}" ${l.location_id === suggested ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="incoming-card__actions">
          <button class="btn btn-primary btn-sm btn-import-override" data-packet-id="${esc(p.packet_id)}" ${suggested ? '' : 'disabled'}>
            Import →
          </button>
          <button class="btn btn-ghost btn-sm btn-reject" data-packet-id="${esc(p.packet_id)}" style="color:var(--red);margin-top:8px">
            Reject
          </button>
        </div>
      </div>
    `
  }

  return `
    <div class="incoming-card">
      <div class="incoming-card__info">
        <div class="incoming-company">${esc(p.company_name)}</div>
        <div class="incoming-meta">
          <span class="province-badge">${esc(p.province)}</span>
          · Visit ${p.visit_date}
          · Packet: ${esc(p.packet_id)}
        </div>
      </div>
      <div class="incoming-card__actions">
        <button class="btn btn-primary btn-sm btn-import" data-packet-id="${esc(p.packet_id)}">
          Import →
        </button>
        <button class="btn btn-ghost btn-sm btn-reject" data-packet-id="${esc(p.packet_id)}" style="color:var(--red);margin-top:8px">
          Reject
        </button>
      </div>
    </div>
  `
}

/**
 * Scan inbox/ and import any completed packets without touching the DOM.
 * Returns { imported: number, files: number }.
 */
export async function scanAndImportInbox(folder) {
  const files = await listJsonFiles(folder, 'inbox')
  if (files.length === 0) return { imported: 0, files: 0 }

  let totalImported = 0

  for (const { name } of files) {
    try {
      const packet   = await readJsonFile(folder, 'inbox', name)
      const packetId = packet.packet_id

      await moveJsonFile(folder, 'inbox', 'archive', name)

      const coName     = packet.company?.name ?? ''
      const resolvedCo = queryOne(
        `SELECT * FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`, [coName]
      )
      const companyId  = resolvedCo?.company_id ?? coName

      run(`INSERT OR REPLACE INTO packets
        (packet_id, company_id, location_id, tech_id, visit_date, filename, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
        [packetId, companyId, packet.location?.location_id ?? null, packet.tech?.tech_id ?? null, packet.visit?.visit_date ?? '', name]
      )

      // If company exists and has locations but this packet's location doesn't match any,
      // park it for staff review instead of auto-creating a misnamed location.
      if (resolvedCo) {
        const hasLocs = queryOne('SELECT 1 FROM locations WHERE company_id = ? AND active = 1 LIMIT 1', [resolvedCo.company_id])
        if (hasLocs && !resolveLocation(resolvedCo.company_id, packet)) {
          run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
            [`pending_packet_${packetId}`, JSON.stringify(packet)])
          run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
            [`packet_loc_mismatch_${packetId}`, packet.location?.name ?? '(unknown)'])
          continue
        }
      }

      const { imported } = importPacket(packet, packetId)
      totalImported += imported
    } catch (e) {
      console.warn('Could not process packet:', name, e)
    }
  }

  return { imported: totalImported, files: files.length }
}

async function checkInbox(container, state, navigate) {
  const btn    = container.querySelector('#btn-check-inbox')
  const status = container.querySelector('#check-status')

  btn.disabled       = true
  btn.textContent    = 'Checking…'
  status.className   = 'alert alert-info'
  status.textContent = 'Accessing sync folder…'
  status.classList.remove('hidden')

  try {
    let folder = state.syncFolder
    if (!folder) {
      folder = await getSyncFolder()
      if (!folder) folder = await pickSyncFolder()
      state.syncFolder = folder
    }

    // Randomized 1–3s delay so two people clicking at nearly the same instant
    // don't both read the shared import lock before the other's claim lands.
    // On its own a delay barely helps; combined with the claim below it lets
    // the loser back off cleanly instead of racing.
    status.textContent = 'Preparing…'
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000))

    // Serialize within this browser (Web Lock) and across computers (claim file).
    const outcome = await withSyncLock(async () => {
      const claimed = await acquireImportClaim(folder)
      if (!claimed) return { busy: true }
      try {
        const files = await listJsonFiles(folder, 'inbox')
        if (files.length === 0) return { empty: true }

        status.textContent = `Found ${files.length} packet(s) — importing…`
        let totalImported = 0
        let errors = []
        let parked = 0

        for (const { name } of files) {
          try {
            const packet = await readJsonFile(folder, 'inbox', name)
            const packetId = packet.packet_id

            await moveJsonFile(folder, 'inbox', 'archive', name)

            const coName     = packet.company?.name ?? ''
            const resolvedCo = queryOne(
              `SELECT * FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`, [coName]
            )
            const companyId  = resolvedCo?.company_id ?? coName

            run(`INSERT OR REPLACE INTO packets
              (packet_id, company_id, location_id, tech_id, visit_date, filename, status, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
              [packetId, companyId, packet.location?.location_id ?? null, packet.tech?.tech_id ?? null, packet.visit?.visit_date ?? '', name]
            )

            if (resolvedCo) {
              const hasLocs = queryOne('SELECT 1 FROM locations WHERE company_id = ? AND active = 1 LIMIT 1', [resolvedCo.company_id])
              if (hasLocs && !resolveLocation(resolvedCo.company_id, packet)) {
                run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
                  [`pending_packet_${packetId}`, JSON.stringify(packet)])
                run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
                  [`packet_loc_mismatch_${packetId}`, packet.location?.name ?? '(unknown)'])
                parked++
                continue
              }
            }

            const { imported, error } = importPacket(packet, packetId)
            if (error) {
              errors.push(`${name}: ${error}`)
            } else {
              totalImported += imported
            }
          } catch (e) {
            errors.push(`${name}: ${e.message}`)
            console.warn('Could not process packet:', name, e)
          }
        }

        return { totalImported, errors, parked, fileCount: files.length }
      } finally {
        await releaseImportClaim(folder)
      }
    })

    // Another tab (skipped) or another computer (busy) is already importing.
    if (outcome?.skipped || outcome?.result?.busy) {
      status.textContent = 'Another computer is importing right now — please try again in a moment.'
      status.className   = 'alert alert-warn'
      return
    }

    const r = outcome.result
    if (r.empty) {
      status.textContent = 'No packets found in inbox.'
      status.className   = 'alert alert-info'
      return
    }

    const parkedMsg = r.parked > 0 ? ` · ${r.parked} packet(s) need location review — check Incoming.` : ''
    if (r.errors.length > 0) {
      status.textContent = `Imported ${r.totalImported} test(s). Errors: ${r.errors.join('; ')}${parkedMsg}`
      status.className = 'alert alert-warn'
    } else {
      status.textContent = `✓ ${r.totalImported} test(s) imported from ${r.fileCount} packet(s).${parkedMsg}`
      status.className = r.parked > 0 ? 'alert alert-warn' : 'alert alert-success'
    }

    setTimeout(() => navigate('incoming'), 1500)
  } catch (e) {
    if (e.name !== 'AbortError') {
      status.textContent = `Failed: ${e.message}`
      status.className   = 'alert alert-error'
    }
  } finally {
    btn.disabled    = false
    btn.textContent = 'Check Sync Folder'
  }
}

export function importPacket(packet, packetId, locationIdOverride = null) {
  try {
    const province = packet.company?.province ?? 'BC'
    let imported = 0
    let skippedDuplicate = 0
    const insertedTestIds = []

    transaction(() => {
      let resolvedCompany =
        (packet.company?.company_id
          ? queryOne('SELECT * FROM companies WHERE company_id = ?', [packet.company.company_id])
          : null) ??
        queryOne('SELECT * FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [packet.company?.name ?? ''])

      if (!resolvedCompany) {
run(`INSERT INTO companies
  (name, address, contact_name, contact_phone, contact_email, sticky_notes, active)
  VALUES (?, ?, ?, ?, ?, ?, 1)`,
  [
    packet.company?.name          ?? '',
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

      let defaultLocation = null

      if (locationIdOverride) {
        // Staff selected a location to override the packet's mismatched location
        defaultLocation = queryOne('SELECT * FROM locations WHERE location_id = ?', [locationIdOverride])
        if (!defaultLocation) throw new Error(`Override location ${locationIdOverride} not found.`)
      } else {
        // Try exact match by location_id from the packet (active only — ignore deactivated duplicates)
        if (packet.location?.location_id) {
          defaultLocation = queryOne(
            `SELECT * FROM locations WHERE location_id = ? AND company_id = ? AND active = 1`,
            [packet.location.location_id, resolvedCompany.company_id]
          )
        }

        // Fall back to name match (handles id mismatch between devices)
        if (!defaultLocation && packet.location?.name) {
          defaultLocation = queryOne(
            `SELECT * FROM locations WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
            [resolvedCompany.company_id, packet.location.name]
          )
        }

        // Create location if this company has none yet
        if (!defaultLocation) {
          const locName = packet.location?.name ?? `${resolvedCompany.name} Main Location`
          run(`INSERT INTO locations (company_id, name, province, active) VALUES (?, ?, ?, 1)`,
            [resolvedCompany.company_id, locName, resolvedCompany.province ?? province]
          )
          defaultLocation = queryOne(
            `SELECT * FROM locations WHERE company_id = ? ORDER BY location_id DESC LIMIT 1`,
            [resolvedCompany.company_id]
          )
        }
      }

      for (const emp of packet.employees ?? []) {
        if (!emp.completed_tests?.length) continue

        let dbEmp = queryOne(
          `SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? AND last_name = ?`,
          [defaultLocation.location_id, emp.first_name ?? null, emp.last_name ?? null]
        )

        if (!dbEmp) {
          run(`INSERT INTO employees (location_id, first_name, last_name, dob, hire_date, job_title, status)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [defaultLocation.location_id, emp.first_name ?? null, emp.last_name ?? null,
             emp.dob ?? null, emp.hire_date ?? null, emp.job_title ?? null, emp.status ?? 'active']
          )
          dbEmp = queryOne(
            `SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? AND last_name = ? LIMIT 1`,
            [defaultLocation.location_id, emp.first_name ?? null, emp.last_name ?? null]
          )
          if (!dbEmp) { console.warn(`Could not create employee: ${emp.last_name}, ${emp.first_name}`); continue }
        }

        // REPLACE WITH:
        const hasExistingTests = !!queryOne(
          'SELECT test_id FROM tests WHERE employee_id = ? LIMIT 1',
          [dbEmp.employee_id]
        )
        let empImportCount = 0

        for (const test of emp.completed_tests) {
          const techId = test.tech_id ?? packet.tech?.tech_id ?? null
          const existingTest = queryOne(
            `SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ? AND tech_id IS ?`,
            [dbEmp.employee_id, test.test_date, techId]
          )
          if (existingTest) {
            console.log(`Skipping duplicate test for ${emp.last_name} on ${test.test_date}`)
            skippedDuplicate++
            continue
          }
          const effectiveType = (!hasExistingTests && empImportCount === 0)
            ? 'Baseline'
            : (test.test_type ?? 'Periodic')

          const testId = createTest({
            employee_id:    dbEmp.employee_id,
            location_id:    defaultLocation.location_id,
            test_date:      test.test_date,
            tech_id:        techId,
            test_type:      effectiveType,
            province,
            ...(test.thresholds ?? {}),
            classification: test.classification,
            counsel_text:   test.counsel_text,
            tech_notes:     test.tech_notes,
            questionnaire:  test.questionnaire,
            packet_id:      packet.packet_id
          })

          if (test.hpd_assessment?.valid) createHPDAssessment(testId, test.hpd_assessment)

          if (effectiveType === 'Baseline') {
            createBaseline(dbEmp.employee_id, defaultLocation.location_id, test.test_date, test.thresholds ?? {})
          }

          insertedTestIds.push(testId)
          empImportCount++
          imported++
        }
      }

      // Fail loud: verify the whole packet landed correctly before COMMIT.
      // Any mismatch throws → the transaction rolls back → nothing imports.
      reconcileImport({
        packet, queryOne, defaultLocation, locationIdOverride,
        imported, skippedDuplicate, skippedEmpty: 0, insertedTestIds
      })
    })

    updatePacketStatus(packetId, 'imported')
    run('UPDATE packets SET testing_duration = ? WHERE packet_id = ?', [packet.testing_duration ?? null, packetId])
    run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`])

    run(`UPDATE tests SET test_type = 'Baseline' WHERE test_id IN (SELECT t1.test_id FROM tests t1 WHERE t1.test_date = (SELECT MIN(t2.test_date) FROM tests t2 WHERE t2.employee_id = t1.employee_id) AND t1.test_type != 'Baseline')`)

    return { imported, error: null }
  } catch (e) {
    console.error('IMPORT ERROR:', e)
    return { imported: 0, error: e.message }
  }
}

// Try to resolve a packet's location against active locations in the DB.
function resolveLocation(companyId, packet) {
  if (packet.location?.location_id) {
    const loc = queryOne(
      `SELECT * FROM locations WHERE location_id = ? AND company_id = ? AND active = 1`,
      [packet.location.location_id, companyId]
    )
    if (loc) return loc
  }
  if (packet.location?.name) {
    const loc = queryOne(
      `SELECT * FROM locations WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND active = 1 LIMIT 1`,
      [companyId, packet.location.name]
    )
    if (loc) return loc
  }
  return null
}

// Return the location_id of the best name match from a list, or null.
function suggestLocation(locations, packetLocName) {
  if (!packetLocName || !locations.length) return null
  const pLower = packetLocName.toLowerCase()
  // Canonical name is a substring of the packet name (e.g. "Saskatoon" ⊂ "Saskatoon, SK")
  let best = locations.find(l => pLower.includes(l.name.toLowerCase()))
  if (best) return best.location_id
  // Packet name is a substring of location name
  best = locations.find(l => l.name.toLowerCase().includes(pLower))
  if (best) return best.location_id
  // Share the same # number prefix
  const pNum = (packetLocName.match(/^#?(\d+)/) ?? [])[1]
  if (pNum) {
    best = locations.find(l => new RegExp(`^#?${pNum}\\b`).test(l.name))
    if (best) return best.location_id
  }
  return null
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
