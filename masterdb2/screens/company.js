/**
 * masterdb2/screens/company.js — company detail + location list
 * params: { companyId: number }
 */

import { query, scalar } from '../db/db.js'

export function mount(container, { navigate, companyId }) {
  if (!companyId) { navigate('companies'); return }

  const company = query('SELECT * FROM companies WHERE company_id = ?', [companyId])[0] ?? null
  if (!company) {
    container.innerHTML = `<div class="error-card"><h2>Not found</h2><p>Company ${companyId} does not exist.</p></div>`
    return
  }

  const locations = query(
    `SELECT l.*,
            COUNT(DISTINCT CASE WHEN e.status='active' AND e.deleted_at IS NULL
                           THEN e.employee_id END) AS worker_count,
            MAX(t.test_date) AS last_test_date
     FROM locations l
     LEFT JOIN employees e ON e.current_location_id = l.location_id
     LEFT JOIN tests    t ON t.location_id = l.location_id AND t.deleted_at IS NULL
     WHERE l.company_id = ? AND l.active = 1
     GROUP BY l.location_id
     ORDER BY l.name`,
    [companyId]
  )

  const totalTests = scalar(
    `SELECT COUNT(*) FROM tests t
     JOIN locations l ON l.location_id = t.location_id
     WHERE l.company_id = ? AND t.deleted_at IS NULL`,
    [companyId]
  ) ?? 0

  const locRows = locations.map(l => `
    <tr class="clickable" data-id="${l.location_id}">
      <td><strong>${esc(l.name)}</strong></td>
      <td>${esc(l.city ?? '')}${l.province ? `, ${esc(l.province)}` : ''}</td>
      <td style="text-align:right">${l.worker_count}</td>
      <td>${l.last_test_date ? fmtDate(l.last_test_date) : '<span style="color:var(--clr-subtle)">—</span>'}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="table-empty">No locations.</td></tr>`

  container.innerHTML = `
    <div class="screen-header-row">
      <button class="back-link" id="back-btn">&larr; Companies</button>
      <h1>${esc(company.name)}</h1>
    </div>
    <div class="screen-body">

      <div class="info-card">
        <dl>
          ${row('City',       company.city)}
          ${row('Province',   company.province)}
          ${row('Address',    company.address)}
          ${row('Contact',    company.contact_name)}
          ${row('Phone',      company.phone)}
          ${row('Email',      company.email)}
          ${row('CU Code',    company.cu_code)}
          ${row('Total tests', totalTests)}
        </dl>
      </div>

      <div class="section-head">
        <h2>Locations (${locations.length})</h2>
      </div>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>City</th>
                <th style="text-align:right">Workers</th>
                <th>Last Test</th>
              </tr>
            </thead>
            <tbody>${locRows}</tbody>
          </table>
        </div>
      </div>

    </div>
  `

  container.querySelector('#back-btn').addEventListener('click', () => navigate('companies'))
  container.querySelectorAll('tr.clickable').forEach(tr =>
    tr.addEventListener('click', () => navigate('location', { locationId: Number(tr.dataset.id), companyId }))
  )
}

function row(label, value) {
  if (value == null || value === '') return ''
  return `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
