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

  const isOffline = !!(packet._is_offline || packet.packet_id?.startsWith('OFFLINE-'))

  // Company resolution
  const company = getCompany(packet.company?.company_id) ??
                  queryOne('SELECT * FROM companies WHERE name = ?', [packet.company?.name])

  // Fuzzy matches for offline packets
  const fuzzyMatches = isOffline && !company
    ? query(`SELECT * FROM companies WHERE active = 1 AND (
        name LIKE ? OR name LIKE ? OR ? LIKE '%' || name || '%'
      ) LIMIT 5`,
      [`%${packet.company?.name ?? ''}%`,
       `${packet.company?.name ?? ''}%`,
       packet.company?.name ?? ''])
    : []

  const employees      = packet.employees ?? []
  const testedEmps     = employees.filter(e => e.completed_tests?.length > 0)
  const totalTests     = testedEmps.reduce((acc, e) => acc + (e.completed_tests?.length ?? 0), 0)
  const alreadyImported = query(
    'SELECT COUNT(*) AS n FROM tests WHERE packet_id = ?', [packetId]
  )[0]?.n ?? 0

  if (!state._importCoId && company) state._importCoId = company.company_id

  render()

  function render() {
    const resolvedCompany = state._importCoId
      ? queryOne('SELECT * FROM companies WHERE company_id = ?', [state._importCoId])
      : null
    
    // FIX: Ensure button enables if we have a valid company selection
    const canImport = !!(resolvedCompany || (isOffline && state._importCoId === 'new'))

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
              <span class="province-badge">${esc(packet.company?.province ?? '')}</span>
              <span>Visit: ${packet.visit?.visit_date ?? '—'}</span>
              <span>Tech: ${esc(packet.tech?.tech_id ?? '—')}</span>
              <span>Duration: ${esc(packet.testing_duration ?? '—')} hrs</span>
              <span>Packet: ${esc(packet.packet_id)}</span>
              ${isOffline ? '<span class="badge badge-warn">📵 Offline Packet</span>' : ''}
            </div>
          </div>
          <div class="import-summary">
            <span class="import-count">${testedEmps.length} / ${employees.length} employees tested</span>
          </div>
        </div>

        ${alreadyImported > 0 ? `
          <div class="alert alert-warn">
            ⚠ ${alreadyImported} test record${alreadyImported !== 1 ? 's' : ''} already imported.
          </div>
        ` : ''}

        ${isOffline && !company ? `
          <div class="form-card" style="margin-bottom:16px">
            <div class="form-card-header"><h2>Company Match</h2></div>
            <p style="font-size:13px;color:var(--grey-700);margin-bottom:12px">
              <strong>${esc(packet.company?.name)}</strong> is not in MasterDB.
            </p>
            <div class="nv-emp-list" style="margin-bottom:10px">
                ${fuzzyMatches.map(co => `
                  <label class="nv-emp-row" style="cursor:pointer">
                    <input type="radio" name="co-match" value="${co.company_id}" ${state._importCoId === co.company_id ? 'checked' : ''} />
                    <div class="nv-emp-info"><span class="nv-emp-name">${esc(co.name)}</span></div>
                  </label>
                `).join('')}
                <label class="nv-emp-row" style="cursor:pointer">
                  <input type="radio" name="co-match" value="new" ${state._importCoId === 'new' ? 'checked' : ''} />
                  <div class="nv-emp-info"><span class="nv-emp-name">Create as new company</span></div>
                </label>
            </div>
          </div>
        ` : ''}

        <div class="import-results">
          ${testedEmps.map((emp, i) => empResultCard(emp, i, packet.company?.province)).join('')}
        </div>

        <div id="import-error"   class="alert alert-error   hidden"></div>
        <div id="import-success" class="alert alert-success hidden"></div>

        <div class="action-row">
          <button class="btn btn-ghost"   id="btn-cancel">Cancel</button>
          <button class="btn btn-outline" id="btn-reject" style="color:var(--red); border-color:var(--red); margin-left:auto; margin-right:8px">Reject Packet</button>
          <button class="btn btn-primary" id="btn-import" ${canImport ? '' : 'disabled'}>
            Import ${totalTests} Test(s) into MasterDB
          </button>
        </div>
      </div>
    `

    container.querySelector('#btn-back').onclick = () => navigate('incoming')
    container.querySelector('#btn-cancel').onclick = () => navigate('incoming')
    
    container.querySelectorAll('input[name="co-match"]').forEach(radio => {
      radio.onchange = () => { state._importCoId = radio.value; render(); }
    })

    container.querySelector('#btn-import')?.addEventListener('click', () => {
      const resolvedCo = state._importCoId === 'new' ? null : queryOne('SELECT * FROM companies WHERE company_id = ?', [state._importCoId])
      doImport(container, packet, resolvedCo, packetId, isOffline, navigate, state)
    })
  }
}

function empResultCard(emp, empIndex, province) {
  return emp.completed_tests.map((test, testIndex) => {
    const cat  = test.classification?.category ?? test.classification ?? '?'
    const clsM = { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }
    const clsL = { N: 'Normal', EW: 'STS', A: 'Abnormal', NC: 'No Change', EWC: 'EW Change', AC: 'Abn Change' }
    
    const FREQS = ['500', '1000', '2000', '3000', '4000', '6000', '8000']
    
    // Map thresholds from both possible data structures
    const getVal = (ear, f) => {
        const key = ear.toLowerCase() + '_' + (f >= 1000 ? (f/1000)+'k' : f);
        return test.results?.[ear.toLowerCase()]?.[f] ?? test.thresholds?.[key] ?? '—';
    };

    return `
      <details class="import-details" style="border-bottom:1px solid var(--grey-200)">
        <summary class="import-emp-row" style="cursor:pointer; display:flex; align-items:center; list-style:none; padding: 12px;">
          <div style="flex:1">
            <strong>${esc(emp.last_name)}, ${esc(emp.first_name)}</strong>
            <span class="td-muted" style="margin-left:8px">${test.test_date}</span>
          </div>
          <span class="class-badge class-${clsM[cat] ?? ''}">${clsL[cat] ?? cat}</span>
        </summary>
        <div style="padding:15px; background:#f9f9f9;">
          <table class="threshold-table" style="width:100%; font-size:11px; text-align:center;">
            <thead><tr><th></th>${FREQS.map(f => `<th>${f >= 1000 ? f/1000+'k' : '.5k'}</th>`).join('')}</tr></thead>
            <tbody>
              <tr><td>R</td>${FREQS.map(f => `<td>${getVal('Right', f)}</td>`).join('')}</tr>
              <tr><td>L</td>${FREQS.map(f => `<td>${getVal('Left', f)}</td>`).join('')}</tr>
            </tbody>
          </table>
        </div>
      </details>
    `
  }).join('')
}

async function doImport(container, packet, company, packetId, isOffline, navigate, state) {
  const btn = container.querySelector('#btn-import'), errEl = container.querySelector('#import-error')
  btn.disabled = true; btn.textContent = 'Importing…'

  try {
    const province = packet.company?.province ?? 'AB'
    let imported = 0, resolvedCompany = company

    // SAFETY HELPER: SQLite crashes on 'undefined'. This forces 'null' instead.
    const safe = (v) => v === undefined ? null : v;

    transaction(() => {
      if (!resolvedCompany) {
        run(`INSERT INTO companies (name, province, active) VALUES (?, ?, 1)`, [packet.company?.name, province])
        resolvedCompany = queryOne(`SELECT * FROM companies WHERE name = ? ORDER BY company_id DESC LIMIT 1`, [packet.company?.name])
      }

      let location = queryOne(`SELECT * FROM locations WHERE company_id = ? LIMIT 1`, [resolvedCompany.company_id])
      if (!location) {
        run(`INSERT INTO locations (company_id, name, province, active) VALUES (?, 'Main Office', ?, 1)`, [resolvedCompany.company_id, province])
        location = queryOne(`SELECT * FROM locations WHERE company_id = ? LIMIT 1`, [resolvedCompany.company_id])
      }

      for (const emp of packet.employees) {
        if (!emp.completed_tests?.length) continue
        let dbEmp = queryOne(`SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? AND last_name = ?`, [location.location_id, emp.first_name, emp.last_name])
        if (!dbEmp) {
          run(`INSERT INTO employees (location_id, first_name, last_name, dob, status) VALUES (?, ?, ?, ?, 'active')`, [location.location_id, emp.first_name, emp.last_name, emp.dob])
          dbEmp = queryOne(`SELECT last_insert_rowid() as employee_id`)
        }

        for (const test of emp.completed_tests) {
          const cat = test.classification?.category ?? test.classification ?? '?'
          
          createTest({
            employee_id: dbEmp.employee_id,
            location_id: location.location_id,
            test_date: safe(test.test_date),
            tech_id: safe(test.tech_id || packet.tech?.tech_id),
            test_type: safe(test.test_type),
            province: province,
            classification: cat,
            packet_id: packet.packet_id,
            // Map thresholds safely from both potential structures
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