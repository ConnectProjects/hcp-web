/**
 * masterdb2/screens/workers.js — worker search (cross-company)
 * Default: shows all active workers alphabetically.
 * Search: filters live as you type.
 */

import { query } from '../db/db.js'
import { search as searchWorkers } from '../db/workers.js'

const ALL_SQL = `
  SELECT e.employee_id, e.first_name, e.middle_name, e.last_name, e.dob, e.status, e.uid,
         l.name     AS location_name, l.province AS location_province,
         c.name     AS company_name,
         (SELECT COUNT(*) FROM tests t WHERE t.employee_id = e.employee_id AND t.deleted_at IS NULL) AS test_count
  FROM employees e
  LEFT JOIN locations l ON l.location_id = e.current_location_id
  LEFT JOIN companies c ON c.company_id  = l.company_id
  WHERE e.status = 'active' AND e.deleted_at IS NULL
  ORDER BY e.last_name, e.first_name
  LIMIT 250`

export function mount(container, { navigate, searchQuery: initial = '' }) {
  container.innerHTML = `
    <div class="screen-header-row">
      <h1>Workers</h1>
      <input class="search-input" id="w-search" type="search"
             placeholder="Search by name…" autocomplete="off">
    </div>
    <div class="screen-body">
      <div id="w-results"></div>
    </div>
  `

  const searchEl = container.querySelector('#w-search')
  const results  = container.querySelector('#w-results')

  function renderTable(rows, caption) {
    if (!rows.length) {
      results.innerHTML = `<div class="table-card"><div class="table-empty">${esc(caption)}</div></div>`
      return
    }
    results.innerHTML = `
      <p style="font-size:0.8rem;color:var(--clr-subtle);margin-bottom:0.75rem">
        ${rows.length} worker${rows.length !== 1 ? 's' : ''}${rows.length === 250 ? ' (first 250 — search to filter)' : ''}
      </p>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th><th>DOB</th><th>Company</th>
                <th>Location</th><th style="text-align:right">Tests</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr class="clickable" data-id="${r.employee_id}">
                  <td><strong>${esc(r.last_name)}, ${esc(r.first_name)}${r.middle_name ? ' '+esc(r.middle_name) : ''}</strong></td>
                  <td>${r.dob ? fmtDate(r.dob) : '<span style="color:var(--clr-subtle)">—</span>'}</td>
                  <td>${esc(r.company_name ?? '—')}</td>
                  <td>${esc(r.location_name ?? '—')}${r.location_province ? ', '+esc(r.location_province) : ''}</td>
                  <td style="text-align:right">${r.test_count ?? 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
    results.querySelectorAll('tr.clickable').forEach(tr =>
      tr.addEventListener('click', () => navigate('worker', { employeeId: Number(tr.dataset.id) }))
    )
  }

  function doSearch(q) {
    if (!q) {
      try {
        renderTable(query(ALL_SQL), 'No active workers found.')
      } catch (e) {
        results.innerHTML = `<div class="error-banner"><strong>Error:</strong> ${esc(e.message)}</div>`
      }
      return
    }
    try {
      const rows = searchWorkers(q, { includeInactive: false })
      renderTable(rows, `No workers match "${q}".`)
    } catch (e) {
      results.innerHTML = `<div class="error-banner"><strong>Error:</strong> ${esc(e.message)}</div>`
    }
  }

  let debounce = null
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => doSearch(searchEl.value.trim()), 200)
  })

  searchEl.value = initial
  doSearch(initial)
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
