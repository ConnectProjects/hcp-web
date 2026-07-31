import { query, queryOne, run, transaction } from '../db/sqlite.js'
import { updatePacketStatus }               from '../db/packets.js'
import { getCompany }                       from '../db/companies.js'
import { createEmployee, createBaseline, getActiveBaseline } from '../db/employees.js'
import { createTest, createHPDAssessment }  from '../db/tests.js'
import { reconcileImport }                  from '@shared/validation/reconcile-import.js'
import { classify }                         from '@shared/classification/engine.js'
import { importPacket }                     from '../db/import-packet.js'

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

  // Fuzzy matches for offline packets — companies with similar names
  const fuzzyMatches = isOffline && !company
    ? query(`SELECT * FROM companies WHERE active = 1 AND (
        name LIKE ? OR name LIKE ? OR ? LIKE '%' || name || '%'
      ) LIMIT 5`,
      [`%${packet.company?.name ?? ''}%`,
       `${packet.company?.name ?? ''}%`,
       packet.company?.name ?? ''])
    : []

  const mismatchLocName = queryOne('SELECT value FROM settings WHERE key = ?', [`packet_loc_mismatch_${packetId}`])?.value
  const activeLocations = (company && mismatchLocName)
    ? query('SELECT location_id, name FROM locations WHERE company_id = ? AND active = 1 ORDER BY name', [company.company_id])
    : []
  if (mismatchLocName && state._importLocId === undefined) {
    state._importLocId = suggestLocationId(activeLocations, mismatchLocName) ?? null
  }

  const employees      = packet.employees ?? []
  const testedEmps     = employees.filter(e => e.completed_tests?.length > 0)
  const totalTests     = testedEmps.reduce((acc, e) => acc + (e.completed_tests?.length ?? 0), 0)
  const alreadyImported = query(
    `SELECT COUNT(*) AS n FROM tests WHERE packet_id = ?`, [packetId]
  )[0]?.n ?? 0

  // State for company selection (offline packets)
  if (!state._importCoId && company) state._importCoId = company.company_id

  render()

  function render() {
    const resolvedCompany = state._importCoId
      ? queryOne('SELECT * FROM companies WHERE company_id = ?', [state._importCoId])
      : null
    const canImport = !!(resolvedCompany || (isOffline && state._importCoId === 'new'))
      && (!mismatchLocName || !!state._importLocId)

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
            ⚠ ${alreadyImported} test record${alreadyImported !== 1 ? 's' : ''} from this packet
            have already been imported. Importing again will create duplicate entries.
          </div>
        ` : ''}

        ${isOffline && !company ? `
          <div class="form-card" style="margin-bottom:16px">
            <div class="form-card-header">
              <h2>Company Match</h2>
            </div>
            <p style="font-size:13px;color:var(--grey-700);margin-bottom:12px">
              <strong>${esc(packet.company?.name)}</strong> is not in MasterDB.
              ${fuzzyMatches.length > 0
                ? 'Does this match an existing company?'
                : 'It will be created as a new company on import.'}
            </p>
            ${fuzzyMatches.length > 0 ? `
              <div class="nv-emp-list" style="margin-bottom:10px">
                ${fuzzyMatches.map(co => `
                  <label class="nv-emp-row" style="cursor:pointer">
                    <input type="radio" name="co-match" value="${co.company_id}"
                      ${state._importCoId === co.company_id ? 'checked' : ''}
                      style="margin-right:8px;accent-color:var(--navy-mid)" />
                    <div class="nv-emp-info">
                      <span class="nv-emp-name">${esc(co.name)}</span>
                      <span class="nv-emp-meta">${esc(co.province)}</span>
                    </div>
                  </label>
                `).join('')}
                <label class="nv-emp-row" style="cursor:pointer">
                  <input type="radio" name="co-match" value="new"
                    ${state._importCoId === 'new' || !state._importCoId ? 'checked' : ''}
                    style="margin-right:8px;accent-color:var(--navy-mid)" />
                  <div class="nv-emp-info">
                    <span class="nv-emp-name">Create as new company</span>
                    <span class="nv-emp-meta">${esc(packet.company?.name)}</span>
                  </div>
                </label>
              </div>
            ` : `
              <div class="alert alert-info">
                ✓ A new company "<strong>${esc(packet.company?.name)}</strong>" will be created
                in ${esc(packet.company?.province ?? '')} on import.
              </div>
            `}
          </div>
        ` : ''}

        ${mismatchLocName ? `
          <div class="form-card" style="margin-bottom:16px; border-left:4px solid #f0ad4e">
            <div class="form-card-header"><h2>⚠ Location Mismatch</h2></div>
            <p style="font-size:13px; color:var(--grey-700); margin-bottom:12px">
              Packet location "<strong>${esc(mismatchLocName)}</strong>" is not an active location.
              Select the correct location to import into:
            </p>
            <select id="loc-override-select" class="search-input" style="width:100%">
              <option value="">-- Select location --</option>
              ${activeLocations.map(l => `<option value="${l.location_id}" ${l.location_id === state._importLocId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
            </select>
          </div>
        ` : ''}

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
          <button class="btn btn-primary" id="btn-import"
            ${canImport ? '' : 'disabled'}
            ${alreadyImported > 0 ? 'style="background:var(--red)"' : ''}>
            ${alreadyImported > 0
              ? `Re-import ${totalTests} Test(s) — Creates Duplicates`
              : `Import ${totalTests} Test(s) into MasterDB`}
          </button>
        </div>
      </div>
    `

    container.querySelector('#btn-back').addEventListener('click', () => {
      state._importCoId = null
      state._importLocId = undefined
      navigate('incoming')
    })
    container.querySelector('#btn-cancel').addEventListener('click', () => {
      state._importCoId = null
      state._importLocId = undefined
      navigate('incoming')
    })
    container.querySelector('#btn-reject').addEventListener('click', () => {
      const note = prompt('Reason for rejection:')
      if (note !== null) {
        updatePacketStatus(packetId, 'rejected', note)
        run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
        run('DELETE FROM settings WHERE key = ?', [`packet_loc_mismatch_${packetId}`])
        state._importLocId = undefined
        navigate('packets')
      }
    })

    // Wire radio buttons for company match
    container.querySelectorAll('input[name="co-match"]').forEach(radio => {
      radio.addEventListener('change', () => {
        state._importCoId = radio.value
        render()
      })
    })

    // Set default for "new" when no fuzzy matches
    if (isOffline && !company && fuzzyMatches.length === 0) {
      state._importCoId = 'new'
    }

    container.querySelector('#loc-override-select')?.addEventListener('change', e => {
      state._importLocId = e.target.value ? parseInt(e.target.value) : null
      render()
    })

    container.querySelector('#btn-import')?.addEventListener('click', () => {
      const resolvedCo = state._importCoId === 'new'
        ? null  // will create new company in doImport
        : queryOne('SELECT * FROM companies WHERE company_id = ?', [state._importCoId])
      doImport(container, packet, resolvedCo, packetId, isOffline, navigate, state, mismatchLocName ? (state._importLocId ?? null) : null)
    })
  }
}

function empResultCard(emp, empIndex, province) {
  return emp.completed_tests.map((test, testIndex) => {
    const cls  = test.classification ?? null
    const cat  = cls?.category ?? '?'
    const hpd  = test.hpd_assessment
    const clsM = { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }
    const clsL = { N: 'Normal', EW: 'Early Warning', A: 'Abnormal', NC: 'No Change', EWC: 'EW Change', AC: 'Abn Change' }
    const q    = test.questionnaire 
    
    // Thresholds table
    const FREQS = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
    const tBody = `
      <table class="threshold-table" style="font-size:11px; margin-top:8px">
        <thead><tr><th></th>${FREQS.map(f => `<th>${f.toUpperCase()}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>R</td>${FREQS.map(f => `<td>${test.thresholds?.['right_'+f] ?? '—'}</td>`).join('')}</tr>
          <tr><td>L</td>${FREQS.map(f => `<td>${test.thresholds?.['left_'+f] ?? '—'}</td>`).join('')}</tr>
        </tbody>
      </table>
    `

    return `
      <details class="import-details" style="border-bottom:1px solid var(--grey-200)">
        <summary class="import-emp-row" style="cursor:pointer; display:flex; align-items:center; list-style:none">
          <div class="import-emp-info" style="flex:1">
            <strong>${esc(emp.last_name)}, ${esc(emp.first_name)}</strong>
            <span class="td-muted" style="margin-left:8px">${test.test_type ?? 'Periodic'} · ${test.test_date}</span>
          </div>
          <div class="import-emp-result">
            <span class="class-badge class-${clsM[cat] ?? ''}">${clsL[cat] ?? cat}</span>
            ${hpd?.valid ? `<span class="class-badge class-${hpd.adequacy?.toLowerCase()}">${hpd.adequacy}</span>` : ''}
          </div>
          <span class="chevron" style="margin-left:12px; color:var(--grey-400)">▼</span>
        </summary>
        <div class="import-details-content" style="padding:0 16px 16px 16px; background:var(--grey-50); font-size:13px">
          ${tBody}
          
          ${q?.pre ? `
            <div style="margin-top:12px; border-top:1px solid var(--grey-200); padding-top:8px">
              <div style="font-weight:600; font-size:11px; color:var(--grey-600); text-transform:uppercase; margin-bottom:4px">Questionnaire</div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px">
                <span>Noise < 2h: <strong>${q.pre.noise_2h ? 'Yes ('+q.pre.noise_2h_duration+')' : 'No'}</strong></span>
                <span>Wears HPD: <strong>${q.pre.wear_hpd ? 'Yes' : 'No'}</strong></span>
                ${q.pre.wear_hpd ? `
                  <span>Style: <strong>${esc(q.pre.hpd_style)}</strong></span>
                  <span>Class: <strong>${esc(q.pre.hpd_class)}</strong></span>
                ` : ''}
              </div>
            </div>
          ` : ''}

          ${test.counsel_text ? `
            <div style="margin-top:12px; border-top:1px solid var(--grey-200); padding-top:8px">
              <div style="font-weight:600; font-size:11px; color:var(--grey-600); text-transform:uppercase; margin-bottom:4px">Counseling</div>
              <div style="color:var(--grey-800)">${esc(test.counsel_text)}</div>
            </div>
          ` : ''}

          ${test.tech_notes ? `
            <div style="margin-top:12px; border-top:1px solid var(--grey-200); padding-top:8px">
              <div style="font-weight:600; font-size:11px; color:var(--grey-600); text-transform:uppercase; margin-bottom:4px">Tech Notes</div>
              <div style="color:var(--grey-600); font-style:italic">${esc(test.tech_notes)}</div>
            </div>
          ` : ''}

          ${hpd?.valid ? `
            <div style="margin-top:12px; border-top:1px solid var(--grey-200); padding-top:8px">
              <div style="font-weight:600; font-size:11px; color:var(--grey-600); text-transform:uppercase; margin-bottom:4px">HPD Assessment</div>
              <div>${esc(hpd.hpd_make_model)} · NRR: ${hpd.rated_nrr}dB · LEX: ${hpd.lex8hr}dB(A) · <strong>${hpd.adequacy}</strong></div>
            </div>
          ` : ''}
        </div>
      </details>
    `
  }).join('')
}

async function doImport(container, packet, company, packetId, isOffline, navigate, state, locationIdOverride = null) {
  const btn    = container.querySelector('#btn-import')
  const errEl  = container.querySelector('#import-error')
  const sucEl  = container.querySelector('#import-success')

  btn.disabled    = true
  btn.textContent = 'Importing…'
  errEl.classList.add('hidden')

  try {
    // The import core lives in db/import-packet.js as a pure, dependency-injected
    // function (also driven by the Yorkton regression fixture). We wrap it in a
    // single transaction here so rollback semantics are unchanged: reconcileImport
    // (inside importPacket) throws on any mismatch → the whole packet rolls back
    // and nothing is imported.
    const deps = {
      query, queryOne, run,
      createTest, createHPDAssessment, createBaseline, getActiveBaseline,
      classify, reconcileImport
    }
    let result
    transaction(() => {
      result = importPacket({ packet, company, locationIdOverride, deps })
    })
    const { imported, skippedDuplicate, skippedEmpty } = result

    updatePacketStatus(packetId, 'imported')
    run('UPDATE packets SET testing_duration = ? WHERE packet_id = ?', [packet.testing_duration ?? null, packetId])
    run('DELETE FROM settings WHERE key = ?', [`pending_packet_${packetId}`])
    state._importCoId = null
    state._importLocId = undefined

    sucEl.textContent = `✓ Imported ${imported} test(s)`
      + (skippedDuplicate > 0 ? ` · ${skippedDuplicate} already on file (skipped)` : '')
      + (skippedEmpty > 0 ? ` · ${skippedEmpty} skipped (no threshold data)` : '')
      + '.'
    sucEl.classList.remove('hidden')
    btn.textContent = '✓ Imported'

    setTimeout(() => navigate('incoming'), 1800)
 } catch (e) {
  console.error('IMPORT ERROR:', e)

  errEl.textContent = `Import failed: ${e.message}`
  errEl.classList.remove('hidden')
  btn.disabled = false
  btn.textContent = 'Import Tests into MasterDB'
}
}

function suggestLocationId(locations, packetLocName) {
  if (!packetLocName || !locations.length) return null
  const pLower = packetLocName.toLowerCase()
  let best = locations.find(l => pLower.includes(l.name.toLowerCase()))
  if (best) return best.location_id
  best = locations.find(l => l.name.toLowerCase().includes(pLower))
  if (best) return best.location_id
  const pNum = (packetLocName.match(/^#?(\d+)/) ?? [])[1]
  if (pNum) {
    best = locations.find(l => new RegExp(`^#?${pNum}\\b`).test(l.name))
    if (best) return best.location_id
  }
  return null
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
