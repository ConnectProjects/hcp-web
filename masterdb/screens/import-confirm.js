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

  const employees      = packet.employees ?? []
  const testedEmps     = employees.filter(e => e.completed_tests?.length > 0)
  const totalTests     = testedEmps.reduce((acc, e) => acc + (e.completed_tests?.length ?? 0), 0)
  const alreadyImported = query(
    'SELECT COUNT(*) AS n FROM tests WHERE packet_id = ?', [packetId]
  )[0]?.n ?? 0

  // State for company selection
  if (!state._importCoId && company) state._importCoId = company.company_id

  render()

  function render() {
    // If we have a company ID or if it's an offline packet we're creating fresh
    const canImport = !!(state._importCoId || isOffline);

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
              <span>Packet: ${esc(packet.packet_id)}</span>
            </div>
          </div>
          <div class="import-summary">
            <span class="import-count">${testedEmps.length} / ${employees.length} employees tested</span>
          </div>
        </div>

        <div class="import-results">
          ${testedEmps.map((emp, i) => empResultCard(emp, i, packet.company?.province)).join('')}
          ${employees.filter(e => !e.completed_tests?.length).map(e => `
            <div class="import-emp-row import-emp-row--skipped">
              <span>${esc(e.last_name)}, ${esc(e.first_name)}</span>
              <span class="td-muted">Not tested this visit</span>
            </div>
          `).join('')}
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
    
    container.querySelector('#btn-import')?.addEventListener('click', () => {
      const resolvedCo = queryOne('SELECT * FROM companies WHERE company_id = ?', [state._importCoId])
      doImport(container, packet, resolvedCo, packetId, isOffline, navigate, state)
    })
  }
}

function empResultCard(emp, empIndex, province) {
  return emp.completed_tests.map((test, testIndex) => {
    const cat = test.classification?.category ?? test.classification ?? '?';
    const clsM = { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }
    
    return `
      <div class="import-emp-row" style="display:flex; align-items:center; border-bottom:1px solid #eee; padding:10px;">
        <div style="flex:1">
            <strong>${esc(emp.last_name)}, ${esc(emp.first_name)}</strong>
            <div class="td-muted" style="font-size:11px;">${test.test_type || 'Periodic'} · ${test.test_date}</div>
        </div>
        <div>
            <span class="class-badge class-${clsM[cat] || ''}">${cat}</span>
        </div>
      </div>
    `
  }).join('')
}

async function doImport(container, packet, company, packetId, isOffline, navigate, state) {
  const btn    = container.querySelector('#btn-import')
  const errEl  = container.querySelector('#import-error')
  
  btn.disabled    = true
  btn.textContent = 'Importing…'

  try {
    const province = packet.company?.province ?? 'AB'
    let imported = 0

    transaction(() => {
      // 1. Get or Create Location
      let location = queryOne("SELECT * FROM locations WHERE company_id = ? LIMIT 1", [company.company_id]);
      if (!location) {
          run("INSERT INTO locations (company_id, name, province) VALUES (?, 'Main Office', ?)", [company.company_id, province]);
          location = queryOne("SELECT * FROM locations WHERE company_id = ? LIMIT 1", [company.company_id]);
      }

      for (const emp of packet.employees) {
        if (!emp.completed_tests?.length) continue

        // 2. Get or Create Employee
        let dbEmp = queryOne("SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? AND last_name = ?", 
                    [location.location_id, emp.first_name, emp.last_name]);

        if (!dbEmp) {
          run("INSERT INTO employees (location_id, first_name, last_name, dob, status) VALUES (?, ?, ?, ?, 'active')",
              [location.location_id, emp.first_name, emp.last_name, emp.dob]);
          dbEmp = queryOne("SELECT last_insert_rowid() as employee_id");
        }

        for (const test of emp.completed_tests) {
          // 3. SANITIZE DATA (Prevent 'undefined' crash)
          const cat = test.classification?.category ?? test.classification ?? '?';
          
          // 4. Create Test
          createTest({
            employee_id:    dbEmp.employee_id,
            location_id:    location.location_id,
            test_date:      test.test_date || new Date().toISOString().split('T')[0],
            tech_id:        test.tech_id || packet.tech?.tech_id || 'UNKNOWN',
            test_type:      test.test_type || 'Periodic',
            province:       province,
            classification: cat,
            tech_notes:     test.notes || test.tech_notes || null,
            packet_id:      packet.packet_id,
            // Ensure thresholds are numbers or null, never undefined
            left_500:  test.results?.left?.['500']  ?? test.thresholds?.left_500 ?? null,
            left_1k:   test.results?.left?.['1000'] ?? test.thresholds?.left_1k  ?? null,
            left_2k:   test.results?.left?.['2000'] ?? test.thresholds?.left_2k  ?? null,
            left_3k:   test.results?.left?.['3000'] ?? test.thresholds?.left_3k  ?? null,
            left_4k:   test.results?.left?.['4000'] ?? test.thresholds?.left_4k  ?? null,
            left_6k:   test.results?.left?.['6000'] ?? test.thresholds?.left_6k  ?? null,
            left_8k:   test.results?.left?.['8000'] ?? test.thresholds?.left_8k  ?? null,
            right_500: test.results?.right?.['500']  ?? test.thresholds?.right_500 ?? null,
            right_1k:  test.results?.right?.['1000'] ?? test.thresholds?.right_1k  ?? null,
            right_2k:  test.results?.right?.['2000'] ?? test.thresholds?.right_2k  ?? null,
            right_3k:  test.results?.right?.['3000'] ?? test.thresholds?.right_3k  ?? null,
            right_4k:  test.results?.right?.['4000'] ?? test.thresholds?.right_4k  ?? null,
            right_6k:  test.results?.right?.['6000'] ?? test.thresholds?.right_6k  ?? null,
            right_8k:  test.results?.right?.['8000'] ?? test.thresholds?.right_8k  ?? null
          });

          imported++
        }
      }
    });

    updatePacketStatus(packetId, 'imported');
    run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`]);
    
    alert(`Success! Imported ${imported} tests.`);
    navigate('packets');
 } catch (e) {
    console.error(e);
    errEl.textContent = `Import failed: ${e.message}`;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Import Tests';
 }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}