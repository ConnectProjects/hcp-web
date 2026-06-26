import { getPacketsByStatus }  from '../db/packets.js'
import { query, queryOne, run, transaction } from '../db/sqlite.js'
import { updatePacketStatus }  from '../db/packets.js'
import { createTest, createHPDAssessment } from '../db/tests.js'
import { createBaseline }      from '../db/employees.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile, moveJsonFile } from '@shared/fs/sync-folder.js'

export function renderIncoming(container, state, navigate) {
  const packets = getPacketsByStatus('submitted')

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
        : `<p class="section-note">${packets.length} packet(s) ready to import.</p>
           <div class="incoming-cards">
             ${packets.map(p => incomingCard(p)).join('')}
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
      navigate('incoming')
    })
  })
}

function incomingCard(p) {
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

    status.textContent = 'Scanning inbox for completed packets…'
    const files = await listJsonFiles(folder, 'inbox')

    if (files.length === 0) {
      status.textContent = 'No packets found in inbox.'
      status.className   = 'alert alert-info'
      return
    }

    status.textContent = `Found ${files.length} packet(s) — importing…`
    let totalImported = 0
    let errors = []

    for (const { name } of files) {
      try {
        const packet = await readJsonFile(folder, 'inbox', name)
        const packetId = packet.packet_id

        await moveJsonFile(folder, 'inbox', 'archive', name)

        const coName    = packet.company?.name ?? ''
        const companyId = queryOne(
          `SELECT company_id FROM companies WHERE name = ? LIMIT 1`, [coName]
        )?.company_id ?? coName

        run(`INSERT OR REPLACE INTO packets
          (packet_id, company_id, tech_id, visit_date, filename, status, updated_at)
          VALUES (?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
          [packetId, companyId, packet.tech?.tech_id ?? null, packet.visit?.visit_date ?? '', name]
        )

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

    if (errors.length > 0) {
      status.textContent = `Imported ${totalImported} test(s). Errors: ${errors.join('; ')}`
      status.className = 'alert alert-warn'
    } else {
      status.textContent = `✓ ${totalImported} test(s) imported from ${files.length} packet(s).`
      status.className = 'alert alert-success'
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

function importPacket(packet, packetId) {
  try {
    const province = packet.company?.province ?? 'BC'
    let imported = 0

    transaction(() => {
      let resolvedCompany =
        (packet.company?.company_id
          ? queryOne('SELECT * FROM companies WHERE company_id = ?', [packet.company.company_id])
          : null) ??
        queryOne('SELECT * FROM companies WHERE name = ?', [packet.company?.name ?? ''])

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

      let defaultLocation = queryOne(
        `SELECT * FROM locations WHERE company_id = ? LIMIT 1`,
        [resolvedCompany.company_id]
      )

      if (!defaultLocation) {
        run(`INSERT INTO locations (company_id, name, province, active) VALUES (?, ?, ?, 1)`,
          [resolvedCompany.company_id, `${resolvedCompany.name} Main Location`, resolvedCompany.province ?? province]
        )
        defaultLocation = queryOne(
          `SELECT * FROM locations WHERE company_id = ? ORDER BY location_id DESC LIMIT 1`,
          [resolvedCompany.company_id]
        )
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
          const existingTest = queryOne(
            `SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ? AND tech_id = ?`,
            [dbEmp.employee_id, test.test_date, test.tech_id ?? packet.tech?.tech_id ?? null]
          )
          if (existingTest) {
            console.log(`Skipping duplicate test for ${emp.last_name} on ${test.test_date}`)
            continue
          }
          const effectiveType = (!hasExistingTests && empImportCount === 0)
            ? 'Baseline'
            : (test.test_type ?? 'Periodic')

          const testId = createTest({
            employee_id:    dbEmp.employee_id,
            location_id:    defaultLocation.location_id,
            test_date:      test.test_date,
            tech_id:        test.tech_id ?? packet.tech?.tech_id,
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

          empImportCount++
          imported++
        }
      }
    })

    updatePacketStatus(packetId, 'imported')
    run('UPDATE packets SET testing_duration = ? WHERE packet_id = ?', [packet.testing_duration ?? null, packetId])
    run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`])

    return { imported, error: null }
  } catch (e) {
    console.error('IMPORT ERROR:', e)
    return { imported: 0, error: e.message }
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
