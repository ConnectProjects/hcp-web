/**
 * masterdb2/screens/workers.js — worker search (cross-company)
 * params: { searchQuery?: string }
 */

import { search as searchWorkers } from '../db/workers.js'

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

  function doSearch(q) {
    if (!q) {
      results.innerHTML = `<p style="color:var(--clr-subtle)">Type a name to search across all workers.</p>`
      return
    }

    let rows
    try {
      rows = searchWorkers(q, { includeInactive: false })
    } catch (e) {
      results.innerHTML = `<div class="error-banner"><strong>Error:</strong> ${esc(e.message)}</div>`
      return
    }

    if (!rows.length) {
      results.innerHTML = `
        <div class="table-card"><div class="table-empty">No active workers match "${esc(q)}".</div></div>
        <p style="font-size:0.8rem;color:var(--clr-subtle);margin-top:0.5rem">
          Only active workers are shown. Use the location roster to see inactive workers at a site.
        </p>
      `
      return
    }

    const rowsHTML = rows.map(r => `
      <tr class="clickable" data-id="${r.employee_id}">
        <td>
          <strong>${esc(r.last_name)}, ${esc(r.first_name)}${r.middle_name ? ' ' + esc(r.middle_name) : ''}</strong>
          ${r.uid ? `<br><span style="font-size:0.75rem;color:var(--clr-subtle)">uid: ${esc(r.uid)}</span>` : ''}
        </td>
        <td>${r.dob ? fmtDate(r.dob) : '<span style="color:var(--clr-subtle)">—</span>'}</td>
        <td>${esc(r.company_name ?? '—')}</td>
        <td>${esc(r.location_name ?? '—')}${r.location_province ? `, ${esc(r.location_province)}` : ''}</td>
        <td style="text-align:right">${r.test_count ?? 0}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>
    `).join('')

    results.innerHTML = `
      <p style="font-size:0.8rem;color:var(--clr-subtle);margin-bottom:0.75rem">
        ${rows.length} result${rows.length !== 1 ? 's' : ''}${rows.length === 100 ? ' (limit reached — refine your search)' : ''}
      </p>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>DOB</th>
                <th>Company</th>
                <th>Location</th>
                <th style="text-align:right">Tests</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>
      </div>
    `

    results.querySelectorAll('tr.clickable').forEach(tr =>
      tr.addEventListener('click', () => navigate('worker', { employeeId: Number(tr.dataset.id) }))
    )
  }

  let debounce = null
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => doSearch(searchEl.value.trim()), 200)
  })

  if (initial) {
    searchEl.value = initial
    doSearch(initial)
  } else {
    doSearch('')
  }
}

function statusBadge(status) {
  const map = { active: 'badge-green', inactive: 'badge-gray' }
  const cls  = map[status] ?? 'badge-gray'
  return `<span class="badge ${cls}">${esc(status ?? '?')}</span>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
