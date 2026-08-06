/**
 * masterdb2/screens/location.js — location detail: info card + roster + visit history
 * params: { locationId: number, companyId?: number }
 */

import { query, scalar } from '../db/db.js'
import { listByLocation } from '../db/workers.js'

export function mount(container, { navigate, locationId, companyId }) {
  if (!locationId) { navigate('companies'); return }

  const loc = query(
    `SELECT l.*, c.name AS company_name, c.company_id
     FROM locations l JOIN companies c ON c.company_id = l.company_id
     WHERE l.location_id = ?`, [locationId]
  )[0] ?? null

  if (!loc) {
    container.innerHTML = `<div class="error-card"><h2>Not found</h2><p>Location ${locationId} does not exist.</p></div>`
    return
  }

  const roster = listByLocation(locationId, { includeInactive: false })

  const packets = query(
    `SELECT p.packet_id, p.visit_date, p.status, p.filename,
            t.name AS tech_name,
            COUNT(DISTINCT te.test_id) AS test_count
     FROM packets p
     LEFT JOIN techs  t  ON t.tech_id  = p.tech_id
     LEFT JOIN tests  te ON te.packet_id = p.packet_id AND te.deleted_at IS NULL
     WHERE p.location_id = ?
     GROUP BY p.packet_id
     ORDER BY p.visit_date DESC`,
    [locationId]
  )

  const rosterRows = roster.length
    ? roster.map(e => `
        <tr class="clickable" data-id="${e.employee_id}">
          <td>${esc(e.last_name)}, ${esc(e.first_name)}${e.middle_name ? ' ' + esc(e.middle_name) : ''}</td>
          <td>${e.dob ? fmtDate(e.dob) : '—'}</td>
          <td>${esc(e.job_title ?? '—')}</td>
          <td style="text-align:right">${e.test_count ?? 0}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" class="table-empty">No active workers at this location.</td></tr>`

  const packetRows = packets.length
    ? packets.map(p => `
        <tr>
          <td>${p.visit_date ? fmtDate(p.visit_date) : '—'}</td>
          <td>${esc(p.tech_name ?? '—')}</td>
          <td>${statusBadge(p.status)}</td>
          <td style="text-align:right">${p.test_count}</td>
          <td style="color:var(--clr-subtle);font-size:0.8rem">${esc(p.filename ?? '')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" class="table-empty">No packets on record.</td></tr>`

  container.innerHTML = `
    <div class="screen-header-row">
      <button class="back-link" id="back-btn">&larr; ${esc(loc.company_name)}</button>
      <h1>${esc(loc.name)}</h1>
    </div>
    <div class="screen-body">

      <div class="info-card">
        <dl>
          ${row('Company',   loc.company_name)}
          ${row('City',      loc.city)}
          ${row('Province',  loc.province)}
          ${row('Address',   loc.address)}
          ${row('Contact',   loc.contact_name)}
          ${row('Phone',     loc.phone)}
          ${row('Email',     loc.email)}
          ${row('CU Code',   loc.cu_code)}
          ${row('UID',       loc.uid)}
        </dl>
      </div>

      <div class="section-head">
        <h2>Active Workers (${roster.length})</h2>
      </div>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>DOB</th>
                <th>Job Title</th>
                <th style="text-align:right">Tests</th>
              </tr>
            </thead>
            <tbody id="roster-tbody">${rosterRows}</tbody>
          </table>
        </div>
      </div>

      <div class="section-head" style="margin-top:0.5rem">
        <h2>Visit History (${packets.length})</h2>
      </div>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Tech</th>
                <th>Status</th>
                <th style="text-align:right">Tests</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>${packetRows}</tbody>
          </table>
        </div>
      </div>

    </div>
  `

  container.querySelector('#back-btn').addEventListener('click', () =>
    navigate('company', { companyId: companyId ?? loc.company_id })
  )
  container.querySelectorAll('#roster-tbody tr.clickable').forEach(tr =>
    tr.addEventListener('click', () => navigate('worker', { employeeId: Number(tr.dataset.id) }))
  )
}

function statusBadge(status) {
  const map = {
    imported:  ['badge-green',  'Imported'],
    pending:   ['badge-yellow', 'Pending'],
    cancelled: ['badge-gray',   'Cancelled'],
    error:     ['badge-red',    'Error'],
  }
  const [cls, label] = map[status] ?? ['badge-gray', esc(status ?? '?')]
  return `<span class="badge ${cls}">${label}</span>`
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
