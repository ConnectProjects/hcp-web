/**
 * masterdb2/screens/companies.js — searchable list of active companies
 */

import { query } from '../db/db.js'

export function mount(container, { navigate }) {
  container.innerHTML = `
    <div class="screen-header-row">
      <h1>Companies</h1>
      <input class="search-input" id="co-search" type="search" placeholder="Search by name or city…" autocomplete="off">
    </div>
    <div class="screen-body">
      <div id="co-table-wrap"></div>
    </div>
  `

  const searchEl = container.querySelector('#co-search')
  const wrap     = container.querySelector('#co-table-wrap')

  function load(q = '') {
    const like = `%${q}%`
    let rows
    try {
      rows = query(
        `SELECT c.company_id, c.name, c.city,
                COUNT(DISTINCT l.location_id) AS location_count,
                COUNT(DISTINCT CASE WHEN e.status='active' AND e.deleted_at IS NULL
                               THEN e.employee_id END) AS worker_count,
                MAX(t.test_date) AS last_test_date
         FROM companies c
         LEFT JOIN locations l ON l.company_id = c.company_id AND l.active = 1
         LEFT JOIN employees e ON e.current_location_id = l.location_id
         LEFT JOIN tests    t ON t.location_id = l.location_id AND t.deleted_at IS NULL
         WHERE c.active = 1
           AND (LOWER(c.name) LIKE LOWER(?) OR LOWER(c.city) LIKE LOWER(?))
         GROUP BY c.company_id, c.name, c.city
         ORDER BY c.name`,
        [like, like]
      )
    } catch (e) {
      wrap.innerHTML = `<div class="error-banner"><strong>Error:</strong> ${esc(e.message)}</div>`
      return
    }

    if (!rows.length) {
      wrap.innerHTML = `<div class="table-card"><div class="table-empty">${q ? 'No companies match that search.' : 'No companies found.'}</div></div>`
      return
    }

    const rowsHTML = rows.map(r => `
      <tr class="clickable" data-id="${r.company_id}">
        <td><strong>${esc(r.name)}</strong></td>
        <td>${esc(r.city ?? '')}</td>
        <td style="text-align:right">${r.location_count}</td>
        <td style="text-align:right">${r.worker_count}</td>
        <td>${r.last_test_date ? fmtDate(r.last_test_date) : '<span style="color:var(--clr-subtle)">—</span>'}</td>
      </tr>
    `).join('')

    wrap.innerHTML = `
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>City</th>
                <th style="text-align:right">Locations</th>
                <th style="text-align:right">Workers</th>
                <th>Last Test</th>
              </tr>
            </thead>
            <tbody id="co-tbody">${rowsHTML}</tbody>
          </table>
        </div>
      </div>
    `

    wrap.querySelectorAll('tr.clickable').forEach(tr =>
      tr.addEventListener('click', () => navigate('company', { companyId: Number(tr.dataset.id) }))
    )
  }

  let debounce = null
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => load(searchEl.value.trim()), 150)
  })

  load()
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
