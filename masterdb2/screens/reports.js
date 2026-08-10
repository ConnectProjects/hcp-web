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
  try {
    companies = query(`SELECT company_id, name FROM companies WHERE active = 1 ORDER BY name`)
  } catch { /* non-fatal — company filter just won't populate */ }

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
          <button class="btn btn-primary" id="r-generate">Generate</button>
        </div>
      </div>

      <div id="r-output"></div>
    </div>
  `

  container.querySelector('#r-generate').addEventListener('click', generateReport)

  function generateReport() {
    const from      = container.querySelector('#r-from').value
    const to        = container.querySelector('#r-to').value
    const companyId = container.querySelector('#r-company').value
    const output    = container.querySelector('#r-output')

    if (!from || !to) {
      output.innerHTML = `<div class="warning-banner">Please set both a From and To date.</div>`
      return
    }
    if (from > to) {
      output.innerHTML = `<div class="warning-banner">From date must be before To date.</div>`
      return
    }

    let rows
    try {
      const sql = `
        SELECT
          c.company_id,  c.name AS company_name,
          l.location_id, l.name AS location_name, l.province,
          DATE(te.test_date) AS visit_date,
          MIN(tk.name)                               AS tech_name,
          COUNT(DISTINCT te.employee_id)             AS workers_tested,
          COUNT(te.test_id)                          AS test_count,
          SUM(COALESCE(te.sts_flag,              0)) AS sts_count,
          SUM(COALESCE(te.referral_given_to_worker,0)) AS referral_count
        FROM tests te
        JOIN  locations l  ON l.location_id = te.location_id
        JOIN  companies c  ON c.company_id  = l.company_id
        LEFT JOIN techs tk ON tk.tech_id    = te.tech_id
        WHERE te.deleted_at IS NULL
          AND te.test_date >= ?
          AND te.test_date <= ?
          ${companyId ? 'AND c.company_id = ?' : ''}
        GROUP BY c.company_id, l.location_id, DATE(te.test_date)
        ORDER BY c.name, te.test_date DESC, l.name`

      const params = companyId ? [from, to, Number(companyId)] : [from, to]
      rows = query(sql, params)
    } catch (e) {
      output.innerHTML = `<div class="error-banner"><strong>Query error:</strong> ${esc(e.message)}</div>`
      return
    }

    if (!rows.length) {
      output.innerHTML = `<div class="table-card"><div class="table-empty">No tests found in that date range.</div></div>`
      return
    }

    const totals = rows.reduce((acc, r) => {
      acc.workers  += r.workers_tested
      acc.tests    += r.test_count
      acc.sts      += r.sts_count
      acc.referrals += r.referral_count
      return acc
    }, { workers: 0, tests: 0, sts: 0, referrals: 0 })

    const rowsHTML = rows.map(r => `
      <tr>
        <td>${esc(r.company_name)}</td>
        <td>${esc(r.location_name)}${r.province ? `, ${esc(r.province)}` : ''}</td>
        <td>${fmtDate(r.visit_date)}</td>
        <td>${esc(r.tech_name ?? '—')}</td>
        <td style="text-align:right">${r.workers_tested}</td>
        <td style="text-align:right"><strong>${r.test_count}</strong></td>
        <td style="text-align:right">${r.sts_count || ''}</td>
        <td style="text-align:right">${r.referral_count || ''}</td>
      </tr>
    `).join('')

    output.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
        <p style="font-size:0.875rem;color:var(--clr-subtle)">
          ${rows.length} visit${rows.length !== 1 ? 's' : ''}
          &nbsp;&mdash;&nbsp;
          <strong>${totals.tests}</strong> tests
          &nbsp;/&nbsp;
          <strong>${totals.workers}</strong> workers
          &nbsp;/&nbsp;
          <strong>${totals.sts}</strong> STS
          &nbsp;/&nbsp;
          <strong>${totals.referrals}</strong> referrals
        </p>
        <button class="btn btn-secondary" id="r-csv">Export CSV</button>
      </div>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Location</th>
                <th>Visit Date</th>
                <th>Tech</th>
                <th style="text-align:right">Workers</th>
                <th style="text-align:right">Tests</th>
                <th style="text-align:right">STS</th>
                <th style="text-align:right">Referrals</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
            <tfoot>
              <tr style="font-weight:600;border-top:2px solid var(--clr-border)">
                <td colspan="4">Total</td>
                <td style="text-align:right">${totals.workers}</td>
                <td style="text-align:right">${totals.tests}</td>
                <td style="text-align:right">${totals.sts}</td>
                <td style="text-align:right">${totals.referrals}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `

    output.querySelector('#r-csv').addEventListener('click', () => {
      // Fetch per-worker rows for detailed CSV
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
          ORDER BY c.name, te.test_date DESC, l.name, e.last_name, e.first_name`
        const params2 = companyId ? [from, to, Number(companyId)] : [from, to]
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
