/**
 * masterdb2/screens/reports.js — billing / activity report
 *
 * Groups tests by company → location → visit date.
 * Generates a summary table and a downloadable CSV.
 */

import { query } from '../db/db.js'

export function mount(container) {
  const today       = new Date()
  const defaultFrom = `${today.getFullYear()}-01-01`
  const defaultTo   = today.toISOString().slice(0, 10)

  let companies = []
  let allLocations = []
  try {
    companies    = query(`SELECT company_id, name FROM companies WHERE active = 1 ORDER BY name`)
    allLocations = query(`SELECT l.location_id, l.name, l.company_id FROM locations l JOIN companies c ON c.company_id = l.company_id WHERE c.active = 1 ORDER BY l.name`)
  } catch { /* non-fatal */ }

  const coOpts = companies.map(c =>
    `<option value="${c.company_id}">${esc(c.name)}</option>`
  ).join('')

  container.innerHTML = `
    <div class="screen-header-row">
      <h1>Reports</h1>
    </div>
    <div class="screen-body">

      <div class="info-card" style="margin-bottom:1.5rem">
        <div style="display:flex;align-items:flex-end;gap:1rem;flex-wrap:wrap">
          <div>
            <label style="font-size:0.8rem;color:var(--clr-subtle);display:block;margin-bottom:0.25rem">From</label>
            <input type="date" class="form-select" id="r-from" value="${defaultFrom}">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--clr-subtle);display:block;margin-bottom:0.25rem">To</label>
            <input type="date" class="form-select" id="r-to" value="${defaultTo}">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--clr-subtle);display:block;margin-bottom:0.25rem">Company</label>
            <select class="form-select" id="r-company" style="min-width:200px">
              <option value="">All companies</option>
              ${coOpts}
            </select>
          </div>
          <div id="r-locations-wrap" style="display:none">
            <label style="font-size:0.8rem;color:var(--clr-subtle);display:block;margin-bottom:0.25rem">Locations <span style="font-weight:400">(none = all)</span></label>
            <select class="form-select" id="r-locations" multiple style="min-width:220px;height:7rem"></select>
          </div>
          <button class="btn btn-primary" id="r-generate" style="align-self:flex-end">Generate</button>
        </div>
      </div>

      <div id="r-output"></div>
    </div>
  `

  const companyEl      = container.querySelector('#r-company')
  const locationsEl    = container.querySelector('#r-locations')
  const locationsWrap  = container.querySelector('#r-locations-wrap')

  function populateLocations(companyId) {
    if (!companyId) {
      locationsWrap.style.display = 'none'
      locationsEl.innerHTML = ''
      return
    }
    const filtered = allLocations.filter(l => l.company_id === Number(companyId))
    locationsEl.innerHTML = filtered.map(l =>
      `<option value="${l.location_id}">${esc(l.name)}</option>`
    ).join('')
    locationsWrap.style.display = ''
  }

  populateLocations('')

  companyEl.addEventListener('change', () => {
    populateLocations(companyEl.value)
  })

  container.querySelector('#r-generate').addEventListener('click', generateReport)

  function getSelectedLocationIds() {
    return Array.from(locationsEl.selectedOptions).map(o => Number(o.value))
  }

  function locationClause(locationIds) {
    if (!locationIds.length) return ''
    return `AND l.location_id IN (${locationIds.map(() => '?').join(',')})`
  }

  function generateReport() {
    const from        = container.querySelector('#r-from').value
    const to          = container.querySelector('#r-to').value
    const companyId   = companyEl.value
    const locationIds = getSelectedLocationIds()
    const output      = container.querySelector('#r-output')

    if (!from || !to) {
      output.innerHTML = `<div class="warning-banner">Please set both a From and To date.</div>`
      return
    }
    if (from > to) {
      output.innerHTML = `<div class="warning-banner">From date must be before To date.</div>`
      return
    }

    let workerRows
    try {
      const sql = `
        SELECT
          c.company_id,  c.name AS company_name,
          l.location_id, l.name AS location_name, l.province,
          DATE(te.test_date) AS visit_date,
          e.last_name, e.first_name
        FROM tests te
        JOIN  employees e  ON e.employee_id = te.employee_id
        JOIN  locations l  ON l.location_id = te.location_id
        JOIN  companies c  ON c.company_id  = l.company_id
        WHERE te.deleted_at IS NULL
          AND te.test_date >= ?
          AND te.test_date <= ?
          ${companyId ? 'AND c.company_id = ?' : ''}
          ${locationClause(locationIds)}
        ORDER BY c.name, te.test_date DESC, l.name, e.last_name, e.first_name`

      const params = [from, to,
        ...(companyId   ? [Number(companyId)] : []),
        ...locationIds
      ]
      workerRows = query(sql, params)
    } catch (e) {
      output.innerHTML = `<div class="error-banner"><strong>Query error:</strong> ${esc(e.message)}</div>`
      return
    }

    if (!workerRows.length) {
      output.innerHTML = `<div class="table-card"><div class="table-empty">No tests found in that date range.</div></div>`
      return
    }

    // Group by company → location → visit date
    const visits = []
    const visitIndex = {}
    for (const row of workerRows) {
      const key = `${row.company_id}|${row.location_id}|${row.visit_date}`
      if (!visitIndex[key]) {
        const visit = {
          company_name:  row.company_name,
          location_name: row.location_name,
          province:      row.province,
          visit_date:    row.visit_date,
          workers:       [],
        }
        visitIndex[key] = visit
        visits.push(visit)
      }
      visitIndex[key].workers.push(`${row.last_name}, ${row.first_name}`)
    }

    const totalWorkers = workerRows.length
    const totalVisits  = visits.length

    const blocksHTML = visits.map(v => {
      const workerRowsHTML = v.workers.map(w => `
        <tr><td>${esc(w)}</td></tr>
      `).join('')

      return `
        <div class="info-card" style="margin-bottom:1rem;padding:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;
                      padding:0.6rem 1rem;border-bottom:1px solid var(--clr-border);
                      background:var(--clr-surface-alt, #f8f9fa);border-radius:var(--radius) var(--radius) 0 0">
            <div>
              <strong style="font-size:0.95rem">${esc(v.company_name)}</strong>
              <span style="color:var(--clr-subtle);margin:0 0.4rem">·</span>
              <span style="font-size:0.875rem">${esc(v.location_name)}${v.province ? `, ${esc(v.province)}` : ''}</span>
            </div>
            <div style="font-size:0.8rem;color:var(--clr-subtle);white-space:nowrap;margin-left:1rem">
              <strong>Test Date:</strong> ${fmtDate(v.visit_date)}
              &nbsp;·&nbsp;
              <strong>${v.workers.length}</strong> worker${v.workers.length !== 1 ? 's' : ''} tested
            </div>
          </div>
          <div class="table-wrap" style="padding:0">
            <table class="data-table" style="margin:0">
              <thead>
                <tr><th>Worker</th></tr>
              </thead>
              <tbody>${workerRowsHTML}</tbody>
            </table>
          </div>
        </div>
      `
    }).join('')

    output.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
        <p style="font-size:0.875rem;color:var(--clr-subtle)">
          ${totalVisits} visit${totalVisits !== 1 ? 's' : ''}
          &nbsp;&mdash;&nbsp;
          <strong>${totalWorkers}</strong> worker${totalWorkers !== 1 ? 's' : ''} tested
        </p>
        <button class="btn btn-secondary" id="r-csv">Export CSV</button>
      </div>
      ${blocksHTML}
    `

    output.querySelector('#r-csv').addEventListener('click', () => {
      let workerRows = []
      try {
        const sql2 = `
          SELECT
            c.name AS company_name,
            l.name AS location_name, l.province,
            DATE(te.test_date) AS visit_date,
            tk.name            AS tech_name,
            e.last_name, e.first_name, e.middle_name, e.dob,
            te.test_type, te.classification,
            te.sts_flag, te.referral_given_to_worker,
            te.left_500, te.left_1k, te.left_2k, te.left_3k, te.left_4k, te.left_6k, te.left_8k,
            te.right_500, te.right_1k, te.right_2k, te.right_3k, te.right_4k, te.right_6k, te.right_8k
          FROM tests te
          JOIN  employees e  ON e.employee_id  = te.employee_id
          JOIN  locations l  ON l.location_id  = te.location_id
          JOIN  companies c  ON c.company_id   = l.company_id
          LEFT JOIN techs tk ON tk.tech_id     = te.tech_id
          WHERE te.deleted_at IS NULL
            AND te.test_date >= ?
            AND te.test_date <= ?
            ${companyId ? 'AND c.company_id = ?' : ''}
            ${locationClause(locationIds)}
          ORDER BY c.name, te.test_date DESC, l.name, e.last_name, e.first_name`
        const params2 = [from, to,
          ...(companyId   ? [Number(companyId)] : []),
          ...locationIds
        ]
        workerRows = query(sql2, params2)
      } catch { /* fall back to summary only */ }

      const headers = [
        'Company','Location','Province','Visit Date','Tech',
        'Last Name','First Name','Middle','DOB',
        'Test Type','Classification','STS','Referral',
        'L_500','L_1k','L_2k','L_3k','L_4k','L_6k','L_8k',
        'R_500','R_1k','R_2k','R_3k','R_4k','R_6k','R_8k'
      ]
      const csvData = [
        headers,
        ...workerRows.map(r => [
          r.company_name, r.location_name, r.province ?? '', r.visit_date, r.tech_name ?? '',
          r.last_name, r.first_name, r.middle_name ?? '', r.dob ?? '',
          r.test_type ?? '', r.classification ?? '',
          r.sts_flag ? 'Yes' : '', r.referral_given_to_worker ? 'Yes' : '',
          r.left_500 ?? '', r.left_1k ?? '', r.left_2k ?? '', r.left_3k ?? '',
          r.left_4k ?? '', r.left_6k ?? '', r.left_8k ?? '',
          r.right_500 ?? '', r.right_1k ?? '', r.right_2k ?? '', r.right_3k ?? '',
          r.right_4k ?? '', r.right_6k ?? '', r.right_8k ?? '',
        ])
      ]
      downloadCSV(`masterdb-report-${from}-to-${to}.csv`, csvData)
    })
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function downloadCSV(filename, rows) {
  const csv  = rows.map(r => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}

