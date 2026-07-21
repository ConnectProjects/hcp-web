import { query, queryOne }      from '../db/sqlite.js'
import { getAllCompanies }       from '../db/companies.js'
import { getLocationsByCompany } from '../db/locations.js'
import { renderAudiogram }       from '../components/audiogram.js'

export function renderReports(container, state, navigate) {
  const companies = getAllCompanies()
  const tab       = state.reportTab ?? 'company'
  const yr        = new Date().getFullYear()
  const today     = new Date().toLocaleDateString('en-CA')
  const yrStart   = `${yr}-01-01`

  const coOptions = companies.map(c =>
    `<option value="${c.company_id}">${esc(c.name)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Reports</h1>
        <button class="btn btn-outline btn-sm" id="btn-print" hidden>Print / Save as PDF</button>
      </div>

      <div class="tab-bar">
        <button class="tab-btn ${tab === 'company'  ? 'tab-btn--active' : ''}" data-tab="company">Company Annual</button>
        <button class="tab-btn ${tab === 'employee' ? 'tab-btn--active' : ''}" data-tab="employee">Worker History</button>
        <button class="tab-btn ${tab === 'sts'      ? 'tab-btn--active' : ''}" data-tab="sts">STS / Flagged</button>
        <button class="tab-btn ${tab === 'audtech'  ? 'tab-btn--active' : ''}" data-tab="audtech">Aud-Tech Summary</button>
      </div>

      <div class="report-controls">
        ${tab === 'company' ? `
          <div class="inline-form" style="flex-wrap:wrap;align-items:flex-start">
            <div class="form-group">
              <label>Company</label>
              <select id="rc-company"><option value="">— select —</option>${coOptions}</select>
            </div>
            <div class="form-group">
              <label>From</label>
              <input id="rc-from" type="date" value="${yrStart}" />
            </div>
            <div class="form-group">
              <label>To</label>
              <input id="rc-to" type="date" value="${today}" />
            </div>
            <div class="form-group" style="flex:1;min-width:200px">
              <label>Locations <span class="label-hint">(select company first)</span></label>
              <div id="rc-locations" style="display:flex;flex-direction:column;gap:4px;padding:6px 0">
                <span style="color:var(--grey-400);font-size:13px">— select a company —</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-self:flex-end;margin-bottom:1px">
              <button class="btn btn-primary btn-sm" id="btn-gen">Generate</button>
              <button class="btn btn-outline btn-sm" id="btn-export-xlsx">Export Excel (.xlsx)</button>
            </div>
          </div>
        ` : ''}
        ${tab === 'employee' ? `
          <div class="inline-form">
            <div class="form-group">
              <label>Company</label>
              <select id="re-company"><option value="">— select —</option>${coOptions}</select>
            </div>
            <div class="form-group">
              <label>Location</label>
              <select id="re-location"><option value="">— select company first —</option></select>
            </div>
            <div class="form-group">
              <label>Worker</label>
              <select id="re-employee"><option value="">— select location first —</option></select>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-gen" style="align-self:flex-end;margin-bottom:1px">Generate</button>
          </div>
        ` : ''}
        ${tab === 'sts' ? `
          <div class="inline-form" style="flex-wrap:wrap;align-items:flex-start">
            <div class="form-group">
              <label>Company</label>
              <select id="rs-company"><option value="">— select —</option>${coOptions}</select>
            </div>
            <div class="form-group" style="flex:1;min-width:200px">
              <label>Locations <span class="label-hint">(select company first)</span></label>
              <div id="rs-locations" style="display:flex;flex-direction:column;gap:4px;padding:6px 0">
                <span style="color:var(--grey-400);font-size:13px">— select a company —</span>
              </div>
            </div>
            <div class="form-group">
              <label>From</label>
              <input id="rs-from" type="date" value="${yrStart}" />
            </div>
            <div class="form-group">
              <label>To</label>
              <input id="rs-to" type="date" value="${today}" />
            </div>
            <button class="btn btn-primary btn-sm" id="btn-gen" style="align-self:flex-end;margin-bottom:1px">Generate</button>
          </div>
        ` : ''}
        ${tab === 'audtech' ? `
          <div class="inline-form">
            <div class="form-group">
              <label>From</label>
              <input id="ra-from" type="date" value="${yrStart}" />
            </div>
            <div class="form-group">
              <label>To</label>
              <input id="ra-to" type="date" value="${today}" />
            </div>
            <button class="btn btn-primary btn-sm" id="btn-gen" style="align-self:flex-end;margin-bottom:1px">Generate Summary</button>
          </div>
        ` : ''}
      </div>

      <div id="report-preview" class="report-preview"></div>
    </div>
  `

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => { state.reportTab = btn.dataset.tab; navigate('reports') })
  )

  const printBtn = container.querySelector('#btn-print')
  printBtn.addEventListener('click', () => window.print())

  const preview = container.querySelector('#report-preview')
  function showReport(html) { preview.innerHTML = html; printBtn.hidden = false }

  // Helper: populate location checkboxes
  function populateLocationCheckboxes(containerId, companyId) {
    const wrap = container.querySelector(`#${containerId}`)
    if (!wrap) return
    if (!companyId) {
      wrap.innerHTML = '<span style="color:var(--grey-400);font-size:13px">— select a company —</span>'
      return
    }
    const locs = getLocationsByCompany(Number(companyId))
    if (locs.length === 0) {
      wrap.innerHTML = '<span style="color:var(--grey-400);font-size:13px">No locations found.</span>'
      return
    }
    wrap.innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:4px">
        <button type="button" class="btn btn-link btn-sm loc-select-all" style="padding:0;font-size:12px">Select All</button>
        <button type="button" class="btn btn-link btn-sm loc-deselect-all" style="padding:0;font-size:12px">Deselect All</button>
      </div>
      ${locs.map(l => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" class="loc-checkbox" value="${l.location_id}" />
          ${esc(l.name)} <span class="province-badge" style="font-size:11px">${esc(l.province)}</span>
        </label>
      `).join('')}
    `
    wrap.querySelector('.loc-select-all').addEventListener('click', () => {
      wrap.querySelectorAll('.loc-checkbox').forEach(cb => { cb.checked = true })
    })
    wrap.querySelector('.loc-deselect-all').addEventListener('click', () => {
      wrap.querySelectorAll('.loc-checkbox').forEach(cb => { cb.checked = false })
    })
  }

  function getCheckedLocationIds(containerId) {
    return Array.from(container.querySelectorAll(`#${containerId} .loc-checkbox:checked`))
      .map(cb => Number(cb.value))
  }

  // ---- Company Annual ----
  if (tab === 'company') {
    container.querySelector('#rc-company').addEventListener('change', e => {
      populateLocationCheckboxes('rc-locations', e.target.value)
    })

    container.querySelector('#btn-gen').addEventListener('click', () => {
      const companyId   = Number(container.querySelector('#rc-company').value)
      const from        = container.querySelector('#rc-from').value
      const to          = container.querySelector('#rc-to').value
      const locationIds = getCheckedLocationIds('rc-locations')
      if (!companyId || !from || !to)  { alert('Select a company and date range.'); return }
      if (locationIds.length === 0)    { alert('Select at least one location.'); return }
      showReport(buildCompanyReport(companyId, locationIds, from, to))
    })

    container.querySelector('#btn-export-xlsx').addEventListener('click', () => {
      const companyId   = Number(container.querySelector('#rc-company').value)
      const from        = container.querySelector('#rc-from').value
      const to          = container.querySelector('#rc-to').value
      const locationIds = getCheckedLocationIds('rc-locations')
      if (!companyId || !from || !to)  { alert('Select a company and date range.'); return }
      if (locationIds.length === 0)    { alert('Select at least one location.'); return }
      exportCompanyXlsx(companyId, locationIds, from, to)
    })
  }

  // ---- Employee History ----
  if (tab === 'employee') {
    const companySelect  = container.querySelector('#re-company')
    const locationSelect = container.querySelector('#re-location')
    const employeeSelect = container.querySelector('#re-employee')

    companySelect.addEventListener('change', () => {
      const cid = companySelect.value
      locationSelect.innerHTML = '<option value="">— select —</option>'
      employeeSelect.innerHTML = '<option value="">— select location first —</option>'
      if (!cid) return
      const locs = getLocationsByCompany(Number(cid))
      locationSelect.innerHTML = '<option value="">— select —</option>' +
        locs.map(l => `<option value="${l.location_id}">${esc(l.name)} (${esc(l.province)})</option>`).join('')
    })

    locationSelect.addEventListener('change', () => {
      const lid = locationSelect.value
      employeeSelect.innerHTML = '<option value="">— select —</option>'
      if (!lid) return
      const emps = query(
        `SELECT employee_id, first_name, last_name FROM employees
         WHERE location_id = ? AND status = 'active' ORDER BY last_name, first_name`,
        [Number(lid)]
      )
      employeeSelect.innerHTML = '<option value="">— select —</option>' +
        emps.map(e => `<option value="${e.employee_id}">${esc(e.last_name)}, ${esc(e.first_name)}</option>`).join('')
    })

    container.querySelector('#btn-gen').addEventListener('click', () => {
      const employeeId = Number(employeeSelect.value)
      if (!employeeId) { alert('Select an employee.'); return }
      showReport(buildEmployeeReport(employeeId))
    })
  }

  // ---- STS / Flagged ----
  if (tab === 'sts') {
    container.querySelector('#rs-company').addEventListener('change', e => {
      populateLocationCheckboxes('rs-locations', e.target.value)
    })

    container.querySelector('#btn-gen').addEventListener('click', () => {
      const companyId   = Number(container.querySelector('#rs-company').value)
      const locationIds = getCheckedLocationIds('rs-locations')
      const from        = container.querySelector('#rs-from').value
      const to          = container.querySelector('#rs-to').value
      if (!companyId || !from || !to)  { alert('Fill in all fields.'); return }
      if (locationIds.length === 0)    { alert('Select at least one location.'); return }
      showReport(buildStsReport(companyId, locationIds, from, to))
    })
  }

  // ---- Aud-Tech Summary ----
  if (tab === 'audtech') {
    container.querySelector('#btn-gen').addEventListener('click', () => {
      const from = container.querySelector('#ra-from').value
      const to   = container.querySelector('#ra-to').value
      if (!from || !to) { alert('Select a date range.'); return }
      showReport(buildAudTechReport(from, to))
    })
  }
}

// ---------------------------------------------------------------------------
// Company Annual Report — sections per location
// ---------------------------------------------------------------------------

function buildCompanyReport(companyId, locationIds, from, to) {
  const co = queryOne('SELECT * FROM companies WHERE company_id = ?', [companyId])
  if (!co) return '<p class="alert alert-error">Company not found.</p>'

  const genDate = new Date().toLocaleDateString('en-CA')

  // Grand totals across all selected locations
  let grandTotal = 0, grandTested = 0
  const grandCounts = { N: 0, NC: 0, EW: 0, EWC: 0, A: 0, AC: 0 }

  const locationSections = locationIds.map(locId => {
    const loc = queryOne('SELECT * FROM locations WHERE location_id = ?', [locId])
    if (!loc) return ''

    const rows = query(`
      SELECT e.employee_id, e.first_name, e.last_name, e.hire_date, e.job_title,
             t.test_id, t.test_date, t.test_type, t.classification, t.sts_flag, t.tech_id
      FROM employees e
      LEFT JOIN tests t ON t.test_id = (
        SELECT test_id FROM tests
        WHERE employee_id = e.employee_id
          AND location_id = ?
          AND test_date BETWEEN ? AND ?
        ORDER BY test_date DESC LIMIT 1
      )
      WHERE e.location_id = ? AND e.status = 'active'
      ORDER BY e.last_name, e.first_name
    `, [locId, from, to, locId])

    const tested = rows.filter(r => r.test_id != null)
    const counts = { N: 0, NC: 0, EW: 0, EWC: 0, A: 0, AC: 0 }
    for (const r of tested) {
      const cat = parseCat(r.classification)
      if (cat in counts) counts[cat]++
    }

    // Accumulate grand totals
    grandTotal  += rows.length
    grandTested += tested.length
    for (const k of Object.keys(grandCounts)) grandCounts[k] += counts[k]

    const tableRows = rows.map(r => {
      const cat = parseCat(r.classification)
      return `<tr>
        <td>${esc(r.last_name)}, ${esc(r.first_name)}</td>
        <td>${r.job_title ? esc(r.job_title) : '—'}</td>
        <td>${r.hire_date ?? '—'}</td>
        <td>${r.test_date ?? '<span style="color:#aaa">—</span>'}</td>
        <td>${r.test_type ?? '—'}</td>
        <td>${r.test_id ? catBadge(cat) : '—'}</td>
      </tr>`
    }).join('')

    return `
      <div class="report-location-section" style="margin-bottom:32px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:baseline;
                    border-bottom:2px solid var(--navy-mid);padding-bottom:6px;margin-bottom:12px">
          <h2 style="margin:0;font-size:16px;color:var(--navy)">${esc(loc.name)}</h2>
          <span class="province-badge">${esc(loc.province)}</span>
        </div>

        <div class="report-stats-row" style="margin-bottom:12px">
          <div class="report-stat"><span class="stat-n">${rows.length}</span><span class="stat-lbl">Active Employees</span></div>
          <div class="report-stat"><span class="stat-n">${tested.length}</span><span class="stat-lbl">Tested in Period</span></div>
          <div class="report-stat"><span class="stat-n">${counts.N + counts.NC}</span><span class="stat-lbl">Normal / No Change</span></div>
          <div class="report-stat report-stat--ew"><span class="stat-n">${counts.EW + counts.EWC}</span><span class="stat-lbl">Early Warning</span></div>
          <div class="report-stat report-stat--abn"><span class="stat-n">${counts.A + counts.AC}</span><span class="stat-lbl">Abnormal</span></div>
        </div>

        ${rows.length === 0
          ? '<p style="color:#999;font-size:13px">No active employees at this location.</p>'
          : `<table class="report-table">
              <thead>
                <tr>
                  <th>Employee</th><th>Job Title</th><th>Hire Date</th>
                  <th>Test Date</th><th>Type</th><th>Result</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>`
        }
      </div>
    `
  }).join('')

  return `
    <div class="report-print">
      <div class="report-header">
        <div>
          <div class="report-brand">HCP-Web · MasterDB</div>
          <h1 class="report-title">Hearing Test Report — ${from} to ${to}</h1>
          <div class="report-meta">${esc(co.name)} · ${locationIds.length} location${locationIds.length !== 1 ? 's' : ''} · Generated ${genDate}</div>
        </div>
      </div>

      <!-- Grand summary -->
      <div style="margin-bottom:24px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--grey-500);margin-bottom:8px">
          Combined Summary — All Selected Locations
        </div>
        <div class="report-stats-row">
          <div class="report-stat"><span class="stat-n">${grandTotal}</span><span class="stat-lbl">Active Employees</span></div>
          <div class="report-stat"><span class="stat-n">${grandTested}</span><span class="stat-lbl">Tested in Period</span></div>
          <div class="report-stat"><span class="stat-n">${grandCounts.N + grandCounts.NC}</span><span class="stat-lbl">Normal / No Change</span></div>
          <div class="report-stat report-stat--ew"><span class="stat-n">${grandCounts.EW + grandCounts.EWC}</span><span class="stat-lbl">Early Warning</span></div>
          <div class="report-stat report-stat--abn"><span class="stat-n">${grandCounts.A + grandCounts.AC}</span><span class="stat-lbl">Abnormal</span></div>
        </div>
      </div>

      ${locationSections}

      <div class="report-footer">
        ${esc(co.name)} — Hearing Conservation Program · ${from} to ${to}
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Employee History Report
// ---------------------------------------------------------------------------

function buildEmployeeReport(employeeId) {
  const emp = queryOne(`
    SELECT e.*,
      l.name AS location_name, l.province,
      c.name AS company_name
    FROM employees e
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id  = l.company_id
    WHERE e.employee_id = ?
  `, [employeeId])
  if (!emp) return '<p class="alert alert-error">Employee not found.</p>'

  const locationId = emp.location_id

  const baseline = queryOne(
    `SELECT * FROM baselines
     WHERE employee_id = ? AND location_id = ? AND archived = 0
     ORDER BY test_date DESC LIMIT 1`,
    [employeeId, locationId]
  )

  const tests = query(`
    SELECT t.*, h.hpd_make_model, h.rated_nrr, h.derated_nrr, h.lex8hr, h.protected_exposure, h.adequacy
    FROM tests t
    LEFT JOIN hpd_assessments h ON h.test_id = t.test_id
    WHERE t.employee_id = ?
    ORDER BY t.test_date DESC
  `, [employeeId])

  const latest = tests[0] ?? null
  const gram   = latest
    ? renderAudiogram({ current: latest, baseline: baseline ?? null })
    : '<p style="color:#999;font-size:13px">No test data available.</p>'

  const testRows = tests.map(t => {
    const cat     = parseCat(t.classification)
    const hpdText = t.adequacy
      ? `${esc(t.adequacy)}${t.derated_nrr != null ? ` (${t.derated_nrr} dB)` : ''}`
      : '—'

    return `<tr>
      <td>${t.test_date}</td>
      <td>${esc(t.test_type)}</td>
      <td>${catBadge(cat)}</td>
      <td>${esc(t.tech_id ?? '—')}</td>
      <td>${hpdText}</td>
      <td style="max-width:180px;font-size:11px;line-height:1.3">${t.tech_notes ? esc(t.tech_notes) : '—'}</td>
    </tr>`
  }).join('')

  const latestCounsel = tests.find(t => t.counsel_text)?.counsel_text ?? null
  const genDate = new Date().toLocaleDateString('en-CA')

  return `
    <div class="report-print">
      <div class="report-header">
        <div>
          <div class="report-brand">HCP-Web · MasterDB</div>
          <h1 class="report-title">Employee Hearing History</h1>
          <div class="report-meta">${esc(emp.company_name)} · ${esc(emp.location_name)} · ${esc(emp.province)}</div>
        </div>
      </div>

      <div class="report-emp-info">
        <div class="report-emp-name">${esc(emp.last_name)}, ${esc(emp.first_name)}</div>
        <div class="report-emp-details">
          ${emp.job_title ? `${esc(emp.job_title)} &nbsp;·&nbsp; ` : ''}
          ${emp.hire_date ? `Hired: ${emp.hire_date} &nbsp;·&nbsp; ` : ''}
          ${emp.dob       ? `DOB: ${emp.dob} &nbsp;·&nbsp; ` : ''}
          Province: ${esc(emp.province)}
        </div>
        <div class="report-emp-details">
          ${baseline
            ? `Baseline established: ${baseline.test_date}`
            : '<em style="color:#999">No baseline on record for this location</em>'}
        </div>
      </div>

      <div class="report-audiogram-wrap">${gram}</div>

      ${tests.length > 0 ? `
        <div class="report-section-label">Test History (${tests.length} record${tests.length !== 1 ? 's' : ''})</div>
        <table class="report-table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Result</th><th>Tech</th><th>HPD</th><th>Tech Notes</th></tr>
          </thead>
          <tbody>${testRows}</tbody>
        </table>
      ` : '<p style="color:#999;font-size:13px;margin-top:16px">No tests on record.</p>'}

      ${latestCounsel ? `
        <div class="report-counsel-box">
          <div class="report-section-label">Most Recent Counsel Summary</div>
          <p style="font-size:13px;line-height:1.65;white-space:pre-line;margin:0">${esc(latestCounsel)}</p>
        </div>
      ` : ''}

      <div class="report-footer">
        ${esc(emp.last_name)}, ${esc(emp.first_name)} — ${esc(emp.company_name)} · ${esc(emp.location_name)} — ${genDate}
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// STS / Flagged Report — sections per location
// ---------------------------------------------------------------------------

function buildStsReport(companyId, locationIds, from, to) {
  const co = queryOne('SELECT * FROM companies WHERE company_id = ?', [companyId])
  if (!co) return '<p class="alert alert-error">Company not found.</p>'

  const genDate = new Date().toLocaleDateString('en-CA')

  let grandTotal = 0

  const locationSections = locationIds.map(locId => {
    const loc = queryOne('SELECT * FROM locations WHERE location_id = ?', [locId])
    if (!loc) return ''

    const rows = query(`
      SELECT t.test_id, t.test_date, t.test_type, t.classification,
             t.triggering_ear, t.triggering_freq_hz, t.shift_db,
             t.counsel_text, t.tech_id,
             e.first_name, e.last_name, e.job_title,
             h.adequacy AS hpd_adequacy, h.derated_nrr
      FROM tests t
      JOIN employees e ON e.employee_id = t.employee_id
      LEFT JOIN hpd_assessments h ON h.test_id = t.test_id
      WHERE t.location_id = ?
        AND t.test_date BETWEEN ? AND ?
        AND t.sts_flag = 1
      ORDER BY t.test_date DESC, e.last_name, e.first_name
    `, [locId, from, to])

    grandTotal += rows.length
    if (rows.length === 0) return ''

    const cards = rows.map(r => {
      const cat    = parseCat(r.classification)
      const detail = [
        r.triggering_ear     ? `${r.triggering_ear} ear`     : null,
        r.triggering_freq_hz ? `${r.triggering_freq_hz} Hz`  : null,
        r.shift_db != null   ? `${r.shift_db} dB shift`      : null
      ].filter(Boolean).join(' · ')

      return `
        <div class="report-sts-card">
          <div class="report-sts-top">
            <div>
              <strong>${esc(r.last_name)}, ${esc(r.first_name)}</strong>
              ${r.job_title ? `<span class="td-muted"> · ${esc(r.job_title)}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              ${catBadge(cat)}
              <span style="font-size:12px;color:#666">${r.test_date} · ${esc(r.test_type)}</span>
            </div>
          </div>
          ${detail ? `<div class="report-sts-detail">${detail}</div>` : ''}
          ${r.hpd_adequacy ? `<div class="report-sts-detail">HPD: ${esc(r.hpd_adequacy)}${r.derated_nrr != null ? ` (derated NRR: ${r.derated_nrr} dB)` : ''}</div>` : ''}
          ${r.counsel_text ? `<div class="report-sts-counsel">${esc(r.counsel_text.slice(0, 220))}${r.counsel_text.length > 220 ? '…' : ''}</div>` : ''}
        </div>
      `
    }).join('')

    return `
      <div class="report-location-section" style="margin-bottom:32px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;
                    border-bottom:2px solid var(--navy-mid);padding-bottom:6px;margin-bottom:12px">
          <h2 style="margin:0;font-size:16px;color:var(--navy)">${esc(loc.name)}</h2>
          <span class="province-badge">${esc(loc.province)}</span>
        </div>
        <p style="font-size:13px;color:#555;margin-bottom:12px">
          ${rows.length} flagged result${rows.length !== 1 ? 's' : ''} in this period.
        </p>
        <div class="report-sts-list">${cards}</div>
      </div>
    `
  }).join('')

  return `
    <div class="report-print">
      <div class="report-header">
        <div>
          <div class="report-brand">HCP-Web · MasterDB</div>
          <h1 class="report-title">STS / Flagged Results</h1>
          <div class="report-meta">${esc(co.name)} · ${from} to ${to} · Generated ${genDate}</div>
        </div>
      </div>

      ${grandTotal === 0
        ? '<p style="color:#555;margin-top:16px;font-size:14px">No flagged results found for the selected locations and period.</p>'
        : locationSections
      }

      <div class="report-footer">
        ${esc(co.name)} · Flagged Results ${from} to ${to}
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Aud-Tech Summary Report — unchanged, packets still join companies directly
// ---------------------------------------------------------------------------

function buildAudTechReport(from, to) {
  const rows = query(`
    SELECT p.packet_id, p.visit_date, p.tech_id, p.testing_duration,
           COALESCE(l.name, c.name) AS location_name,
           c.name AS company_name,
           (SELECT COUNT(*) FROM tests WHERE packet_id = p.packet_id) AS test_count
    FROM packets p
    JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    WHERE p.visit_date BETWEEN ? AND ? AND p.status = 'imported'
    ORDER BY p.visit_date DESC, p.tech_id
  `, [from, to])

  const techs = {}
  rows.forEach(r => {
    if (!techs[r.tech_id]) {
      techs[r.tech_id] = { name: r.tech_id, totalTests: 0, totalDuration: 0, visits: [] }
    }
    const duration = parseFloat(r.testing_duration) || 0
    techs[r.tech_id].totalTests    += r.test_count
    techs[r.tech_id].totalDuration += duration
    techs[r.tech_id].visits.push(r)
  })

  const techSections = Object.values(techs).map(t => {
    const visitRows = t.visits.map(v => `
      <tr>
        <td>${v.visit_date}</td>
        <td class="td-primary">${esc(v.location_name)}</td>
        <td>${esc(v.company_name)}</td>
        <td style="text-align:center">${v.test_count}</td>
        <td style="text-align:center">${v.testing_duration ?? '—'}</td>
        <td class="td-muted" style="font-size:11px">${esc(v.packet_id)}</td>
      </tr>
    `).join('')

    return `
      <div class="report-tech-section" style="margin-bottom:32px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;
                    border-bottom:2px solid var(--navy-mid);padding-bottom:6px;margin-bottom:12px">
          <h2 style="margin:0;font-size:18px;color:var(--navy)">Tech: ${esc(t.name)}</h2>
          <div style="font-size:13px;font-weight:600">
            Total: ${t.totalTests} Tests &nbsp;·&nbsp; ${t.totalDuration.toFixed(1)} hrs
          </div>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width:100px">Date</th>
              <th>Location</th>
              <th>Company</th>
              <th style="width:80px;text-align:center">Tests</th>
              <th style="width:100px;text-align:center">Duration (h)</th>
              <th style="width:140px">Packet ID</th>
            </tr>
          </thead>
          <tbody>${visitRows}</tbody>
        </table>
      </div>
    `
  }).join('')

  const genDate       = new Date().toLocaleDateString('en-CA')
  const totalAllTests = rows.reduce((acc, r) => acc + r.test_count, 0)
  const totalAllHours = rows.reduce((acc, r) => acc + (parseFloat(r.testing_duration) || 0), 0)

  return `
    <div class="report-print">
      <div class="report-header">
        <div>
          <div class="report-brand">HCP-Web · MasterDB</div>
          <h1 class="report-title">Aud-Tech Activity Summary</h1>
          <div class="report-meta">Date Range: ${from} to ${to} &nbsp;·&nbsp; Generated ${genDate}</div>
        </div>
      </div>

      <div class="report-stats-row">
        <div class="report-stat"><span class="stat-n">${Object.keys(techs).length}</span><span class="stat-lbl">Active Techs</span></div>
        <div class="report-stat"><span class="stat-n">${rows.length}</span><span class="stat-lbl">Total Visits</span></div>
        <div class="report-stat"><span class="stat-n">${totalAllTests}</span><span class="stat-lbl">Total Tests</span></div>
        <div class="report-stat"><span class="stat-n">${totalAllHours.toFixed(1)}</span><span class="stat-lbl">Total Hours</span></div>
      </div>

      ${rows.length === 0
        ? '<p style="color:#666;font-style:italic;padding:20px 0">No imported activity found in this date range.</p>'
        : techSections}

      <div class="report-footer">Aud-Tech Activity Report · Range: ${from} to ${to}</div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Excel Export — Company Annual (multi-location, one sheet per location)
// ---------------------------------------------------------------------------

function exportCompanyXlsx(companyId, locationIds, from, to) {
  const XLSX = window.XLSX
  if (!XLSX) { alert('Excel library not loaded. Please refresh and try again.'); return }

  const co = queryOne('SELECT * FROM companies WHERE company_id = ?', [companyId])
  if (!co) return

  const wb = XLSX.utils.book_new()

  // Summary sheet across all locations
  let grandRows = 0, grandTested = 0
  const grandCounts = { N: 0, NC: 0, EW: 0, EWC: 0, A: 0, AC: 0 }

  const DETAIL_HEADERS = [
    'Location', 'Last Name', 'First Name', 'DOB', 'Hire Date', 'Job Title',
    'Test Date', 'Test Type', 'Province', 'Classification', 'STS Flag',
    'L-500', 'L-1k', 'L-2k', 'L-3k', 'L-4k', 'L-6k', 'L-8k',
    'R-500', 'R-1k', 'R-2k', 'R-3k', 'R-4k', 'R-6k', 'R-8k',
    'Triggering Ear', 'Triggering Freq (Hz)', 'Shift (dB)',
    'Tech ID', 'HPD Make/Model', 'Rated NRR', 'Derated NRR',
    'LEX8hr (dB)', 'Protected Exposure (dB)', 'HPD Adequacy',
    'Counselling', 'Tech Notes', 'Packet ID'
  ]

  const allDetailRows = [DETAIL_HEADERS]

  for (const locId of locationIds) {
    const loc = queryOne('SELECT * FROM locations WHERE location_id = ?', [locId])
    if (!loc) continue

    const summaryRows = query(`
      SELECT e.employee_id, t.test_id, t.classification
      FROM employees e
      LEFT JOIN tests t ON t.test_id = (
        SELECT test_id FROM tests
        WHERE employee_id = e.employee_id AND location_id = ? AND test_date BETWEEN ? AND ?
        ORDER BY test_date DESC LIMIT 1
      )
      WHERE e.location_id = ? AND e.status = 'active'
    `, [locId, from, to, locId])

    const tested = summaryRows.filter(r => r.test_id != null)
    const counts = { N: 0, NC: 0, EW: 0, EWC: 0, A: 0, AC: 0 }
    for (const r of tested) {
      const cat = parseCat(r.classification)
      if (cat in counts) counts[cat]++
    }

    grandRows   += summaryRows.length
    grandTested += tested.length
    for (const k of Object.keys(grandCounts)) grandCounts[k] += counts[k]

    const detailRows = query(`
      SELECT e.last_name, e.first_name, e.dob, e.hire_date, e.job_title,
             t.test_date, t.test_type, t.province, t.classification, t.sts_flag,
             t.left_500,  t.left_1k,  t.left_2k,  t.left_3k,  t.left_4k,  t.left_6k,  t.left_8k,
             t.right_500, t.right_1k, t.right_2k, t.right_3k, t.right_4k, t.right_6k, t.right_8k,
             t.triggering_ear, t.triggering_freq_hz, t.shift_db,
             t.tech_id, t.counsel_text, t.tech_notes, t.packet_id,
             h.hpd_make_model, h.rated_nrr, h.derated_nrr, h.lex8hr, h.protected_exposure, h.adequacy
      FROM tests t
      JOIN employees e ON e.employee_id = t.employee_id
      LEFT JOIN hpd_assessments h ON h.test_id = t.test_id
      WHERE t.location_id = ? AND t.test_date BETWEEN ? AND ?
      ORDER BY e.last_name, e.first_name, t.test_date DESC
    `, [locId, from, to])

    for (const r of detailRows) {
      allDetailRows.push([
        loc.name,
        r.last_name, r.first_name, r.dob ?? '', r.hire_date ?? '', r.job_title ?? '',
        r.test_date, r.test_type, r.province,
        parseCat(r.classification) ?? '', r.sts_flag ? 'Yes' : 'No',
        r.left_500  ?? '', r.left_1k  ?? '', r.left_2k  ?? '', r.left_3k  ?? '',
        r.left_4k   ?? '', r.left_6k  ?? '', r.left_8k  ?? '',
        r.right_500 ?? '', r.right_1k ?? '', r.right_2k ?? '', r.right_3k ?? '',
        r.right_4k  ?? '', r.right_6k ?? '', r.right_8k ?? '',
        r.triggering_ear ?? '', r.triggering_freq_hz ?? '', r.shift_db ?? '',
        r.tech_id ?? '', r.hpd_make_model ?? '', r.rated_nrr ?? '', r.derated_nrr ?? '',
        r.lex8hr ?? '', r.protected_exposure ?? '', r.adequacy ?? '',
        r.counsel_text ?? '', r.tech_notes ?? '', r.packet_id ?? ''
      ])
    }
  }

  // Summary sheet
  const summarySheet = [
    [`${co.name} — Hearing Test Report ${from} to ${to}`],
    [],
    ['Company',   co.name],
    ['Locations', locationIds.length],
    ['From',      from],
    ['To',        to],
    ['Generated', new Date().toLocaleDateString('en-CA')],
    [],
    ['COMBINED SUMMARY'],
    ['Active Employees', 'Tested in Period', 'Not Tested', 'Normal / No Change', 'Early Warning', 'Abnormal'],
    [grandRows, grandTested, grandRows - grandTested,
     grandCounts.N + grandCounts.NC, grandCounts.EW + grandCounts.EWC, grandCounts.A + grandCounts.AC]
  ]

  const ws1 = XLSX.utils.aoa_to_sheet(summarySheet)
  const ws2 = XLSX.utils.aoa_to_sheet(allDetailRows)

  ws2['!cols'] = DETAIL_HEADERS.map(h => {
    if (h === 'Counselling' || h === 'Tech Notes') return { wch: 50 }
    if (h.startsWith('L-') || h.startsWith('R-'))  return { wch: 7  }
    if (h === 'Last Name' || h === 'First Name')    return { wch: 18 }
    if (h === 'Location')                           return { wch: 30 }
    return { wch: 16 }
  })

  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')
  XLSX.utils.book_append_sheet(wb, ws2, 'Test Detail')

  const safeName = co.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  const filename  = `${safeName}_${from}_to_${to}_HearingTestReport.xlsx`

  const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob  = new Blob([wbout], { type: 'application/octet-stream' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href      = url
  a.download  = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CAT_LABEL = { N: 'Normal', EW: 'Early Warning', A: 'Abnormal', NC: 'No Change', EWC: 'EW Change', AC: 'Abn Change' }
const CAT_CLASS = { N: 'n', EW: 'ew', A: 'a', NC: 'n', EWC: 'ew', AC: 'a' }

function parseCat(classJson) {
  if (!classJson) return null
  try { return JSON.parse(classJson)?.category ?? null } catch { return null }
}

function parseJson(val) {
  if (!val) return null
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function catBadge(cat) {
  if (!cat) return '—'
  return `<span class="class-badge class-${CAT_CLASS[cat] ?? ''}">${CAT_LABEL[cat] ?? cat}</span>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
