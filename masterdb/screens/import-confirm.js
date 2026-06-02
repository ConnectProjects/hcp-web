import { query, queryOne, run, transaction } from '../db/sqlite.js'
import { updatePacketStatus }               from '../db/packets.js'
import { getCompany }                       from '../db/companies.js'
import { createEmployee, createBaseline }   from '../db/employees.js'
import { createTest, createHPDAssessment }  from '../db/tests.js'

export function renderImportConfirm(container, state, navigate) {
  const packetId = state.params?.packetId
  if (!packetId) { navigate('incoming'); return }

  const row = queryOne('SELECT value FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
  if (!row) { navigate('incoming'); return }

  let packet
  try { packet = JSON.parse(row.value) } catch { navigate('incoming'); return }

  // 1. Resolve Company (by ID or by Name)
  let company = getCompany(packet.company?.company_id) ??
                queryOne('SELECT * FROM companies WHERE name = ? COLLATE NOCASE', [packet.company?.name])

  // 2. If not found, look for similar names to suggest
  const fuzzyMatches = !company
    ? query(`SELECT * FROM companies WHERE active = 1 AND name LIKE ? LIMIT 5`, [`%${packet.company?.name ?? ''}%`])
    : []

  const employees      = packet.employees ?? []
  const testedEmps     = employees.filter(e => e.completed_tests?.length > 0)
  const totalTests     = testedEmps.reduce((acc, e) => acc + (e.completed_tests?.length ?? 0), 0)

  // Maintain selection in state
  if (!state._importCoId && company) state._importCoId = company.company_id

  render()

  function render() {
    // Button is enabled if we have a company ID selected
    const canImport = !!state._importCoId;

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="breadcrumb">
            <button class="btn btn-link" id="btn-back">Incoming</button>
            <span>›</span>
            <span>Review Import</span>
          </div>
        </div>

        <div class="import-header">
          <div class="import-meta">
            <h2>${esc(packet.company?.name ?? 'Unknown Company')}</h2>
            <div class="meta-row">
              <span class="province-badge">${esc(packet.company?.province ?? '??')}</span>
              <span>Visit: ${packet.visit?.visit_date ?? '—'}</span>
              <span>Tech: ${esc(packet.tech?.tech_id ?? '—')}</span>
              <span>Packet: ${esc(packet.packet_id)}</span>
            </div>
          </div>
          <div class="import-summary">
            <span class="import-count">${testedEmps.length} / ${employees.length} employees tested</span>
          </div>
        </div>

        <!-- COMPANY MATCHING SECTION (Now shows whenever company is missing) -->
        ${!company ? `
          <div class="form-card" style="margin-bottom:20px; border: 2px solid var(--orange);">
            <div class="form-card-header">
              <h2 style="color:var(--orange)">⚠️ Company Not Found</h2>
            </div>
            <p style="font-size:13px; margin-bottom:12px">
              The company "<strong>${esc(packet.company?.name)}</strong>" is not in your local database.
            </p>
            
            <div class="nv-emp-list">
                ${fuzzyMatches.map(co => `
                  <label class="nv-emp-row" style="cursor:pointer; display:flex; gap:10px; padding:10px; border:1px solid #eee; margin-bottom:5px;">
                    <input type="radio" name="co-match" value="${co.company_id}" ${state._importCoId == co.company_id ? 'checked' : ''} />
                    <div><strong>${esc(co.name)}</strong> <small>(${co.province})</small></div>
                  </label>
                `).join('')}
                
                <label class="nv-emp-row" style="cursor:pointer; display:flex; gap:10px; padding:10px; border:1px solid #eee;">
                  <input type="radio" name="co-match" value="new" ${state._importCoId === 'new' ? 'checked' : ''} />
                  <div><em>Create as new company: "${esc(packet.company?.name)}"</em></div>
                </label>
            </div>
          </div>
        ` : ''}

        <div class="import-results">
          ${testedEmps.map((emp, i) => empResultCard(emp, i)).join('')}
          ${employees.filter(e => !e.completed_tests?.length).map(e => `
            <div class="import-emp-row import-emp-row--skipped">
              <span>${esc(e.last_name)}, ${esc(e.first_name)}</span>
              <span class="td-muted">Not tested this visit</span>
            </div>
          `).join('')}
        </div>

        <div id="import-error" class="alert alert-error hidden"></div>

        <div class="action-row">
          <button class="btn btn-ghost" id="btn-cancel">Cancel</button>
          <button class="btn btn-outline" id="btn-reject" style="color:var(--red); border-color:var(--red); margin-left:auto; margin-right:8px">Reject Packet</button>
          <button class="btn btn-primary" id="btn-import" ${canImport ? '' : 'disabled'}>
            Import ${totalTests} Test(s) into MasterDB
          </button>
        </div>
      </div>
    `

    container.querySelector('#btn-back').onclick = () => { state._importCoId = null; navigate('incoming'); }
    container.querySelector('#btn-cancel').onclick = () => { state._importCoId = null; navigate('incoming'); }
    
    container.querySelectorAll('input[name="co-match"]').forEach(radio => {
      radio.onchange = () => { state._importCoId = radio.value; render(); }
    })

    container.querySelector('#btn-import')?.addEventListener('click', () => {
      doImport(container, packet, packetId, navigate, state)
    })
  }
}

function empResultCard(emp, empIndex) {
  return emp.completed_tests.map((test) => {
    const cat = test.classification?.category ?? test.classification ?? '?'
    const clsM = { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }
    
    return `
      <div class="import-emp-row" style="display:flex; align-items:center; border-bottom:1px solid #eee; padding:12px;">
        <div style="flex:1">
            <strong>${esc(emp.last_name)}, ${esc(emp.first_name)}</strong>
            <div class="td-muted" style="font-size:11px;">${test.test_type || 'Periodic'} · ${test.test_date}</div>
        </div>
        <span class="class-badge class-${clsM[cat] || ''}">${cat}</span>
      </div>
    `
  }).join('')
}

async function doImport(container, packet, packetId, navigate, state) {
  const btn = container.querySelector('#btn-import'), errEl = container.querySelector('#import-error')
  btn.disabled = true; btn.textContent = 'Importing…'

  try {
    const province = packet.company?.province ?? 'AB'
    let imported = 0
    let resolvedCompanyId = state._importCoId

    const safe = (v) => (v === undefined || v === "") ? null : v;

    transaction(() => {
      // 1. Handle New Company Creation
      if (resolvedCompanyId === 'new') {
        run(`INSERT INTO companies (name, province, active) VALUES (?, ?, 1)`, [packet.company.name, province])
        resolvedCompanyId = queryOne(`SELECT last_insert_rowid() as id`).id
      }

      // 2. Ensure Location exists
      let location = queryOne(`SELECT location_id FROM locations WHERE company_id = ? LIMIT 1`, [resolvedCompanyId])
      if (!location) {
        run(`INSERT INTO locations (company_id, name, province, active) VALUES (?, 'Main Office', ?, 1)`, [resolvedCompanyId, province])
        location = queryOne(`SELECT last_insert_rowid() as location_id`)
      }

      for (const emp of packet.employees) {
        if (!emp.completed_tests?.length) continue
        
        let dbEmp = queryOne(`SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? AND last_name = ?`, [location.location_id, emp.first_name, emp.last_name])
        if (!dbEmp) {
          run(`INSERT INTO employees (location_id, first_name, last_name, dob, status) VALUES (?, ?, ?, ?, 'active')`, [location.location_id, emp.first_name, emp.last_name, emp.dob])
          dbEmp = queryOne(`SELECT last_insert_rowid() as employee_id`)
        }

        for (const test of emp.completed_tests) {
          createTest({
            employee_id: dbEmp.employee_id,
            location_id: location.location_id,
            test_date: safe(test.test_date),
            tech_id: safe(test.tech_id || packet.tech?.tech_id),
            test_type: safe(test.test_type),
            province: province,
            classification: test.classification?.category ?? test.classification ?? '?',
            packet_id: packet.packet_id,
            left_500: safe(test.results?.left?.['500'] || test.thresholds?.left_500),
            left_1k: safe(test.results?.left?.['1000'] || test.thresholds?.left_1k),
            left_2k: safe(test.results?.left?.['2000'] || test.thresholds?.left_2k),
            left_3k: safe(test.results?.left?.['3000'] || test.thresholds?.left_3k),
            left_4k: safe(test.results?.left?.['4000'] || test.thresholds?.left_4k),
            left_6k: safe(test.results?.left?.['6000'] || test.thresholds?.left_6k),
            left_8k: safe(test.results?.left?.['8000'] || test.thresholds?.left_8k),
            right_500: safe(test.results?.right?.['500'] || test.thresholds?.right_500),
            right_1k: safe(test.results?.right?.['1000'] || test.thresholds?.right_1k),
            right_2k: safe(test.results?.right?.['2000'] || test.thresholds?.right_2k),
            right_3k: safe(test.results?.right?.['3000'] || test.thresholds?.right_3k),
            right_4k: safe(test.results?.right?.['4000'] || test.thresholds?.right_4k),
            right_6k: safe(test.results?.right?.['6000'] || test.thresholds?.right_6k),
            right_8k: safe(test.results?.right?.['8000'] || test.thresholds?.right_8k)
          })
          imported++
        }
      }
    })

    updatePacketStatus(packetId, 'imported')
    run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
    alert(`Success! Imported ${imported} tests.`);
    navigate('incoming')
  } catch (e) {
    errEl.textContent = `Import failed: ${e.message}`; errEl.classList.remove('hidden')
    btn.disabled = false; btn.textContent = 'Import Tests'
  }
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }