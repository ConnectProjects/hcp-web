/**
 * masterdb2/screens/location.js — location detail: info card + roster + visit history
 * params: { locationId: number, companyId?: number }
 */

import { createPacket }                      from '../../shared/packet/schema.js'
import { query, run, save, writePacket }     from '../db/db.js'
import { listByLocation, getActiveBaseline } from '../db/workers.js'

export function mount(container, { navigate, locationId, companyId, session }) {
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

  const techs  = query(`SELECT * FROM techs WHERE active = 1 AND folder_name IS NOT NULL ORDER BY name`)
  let genStatus = null   // { ok, message } after generate attempt

  render()

  function render() {
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

    const techOpts = techs.map(t =>
      `<option value="${t.tech_id}">${esc(t.name)}</option>`
    ).join('')

    const today = new Date().toISOString().slice(0, 10)

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

        <div class="section-head" style="margin-top:0.5rem">
          <h2>Generate Packet</h2>
        </div>
        ${genStatus ? `<div class="${genStatus.ok ? 'success-banner' : 'error-banner'}" style="margin-bottom:0.75rem">${genStatus.message}</div>` : ''}
        <div class="info-card" style="margin-bottom:1.5rem">
          ${!techs.length
            ? `<p style="color:var(--clr-subtle);font-size:0.875rem">No active techs with a folder configured. Add techs in Settings.</p>`
            : `<div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:flex-end">
                <div>
                  <label class="field-label">Tech *</label>
                  <select class="form-select" id="gen-tech" style="min-width:160px">
                    <option value="">Select…</option>${techOpts}
                  </select>
                </div>
                <div>
                  <label class="field-label">Visit Date *</label>
                  <input type="date" class="form-select" id="gen-date" value="${today}">
                </div>
                <div style="flex:1;min-width:180px">
                  <label class="field-label">Notes for Tech</label>
                  <input type="text" class="search-input" id="gen-notes"
                         placeholder="Optional" style="width:100%">
                </div>
                <button class="btn btn-primary" id="gen-btn">Generate &amp; Write to Outbox</button>
                <span id="gen-err" style="color:var(--clr-error-text);font-size:0.875rem;align-self:center"></span>
              </div>`
          }
        </div>

        <div class="section-head">
          <h2>Active Workers (${roster.length})</h2>
        </div>
        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr>
                <th>Name</th><th>DOB</th><th>Job Title</th>
                <th style="text-align:right">Tests</th>
              </tr></thead>
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
              <thead><tr>
                <th>Date</th><th>Tech</th><th>Status</th>
                <th style="text-align:right">Tests</th><th>File</th>
              </tr></thead>
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
      tr.addEventListener('click', () =>
        navigate('worker', { employeeId: Number(tr.dataset.id), fromLocation: { locationId, companyId: loc.company_id } })
      )
    )
    container.querySelector('#gen-btn')?.addEventListener('click', () => generate(roster, loc))
  }

  async function generate(roster, loc) {
    const errEl  = container.querySelector('#gen-err')
    if (errEl) errEl.textContent = ''
    genStatus = null

    const techId = container.querySelector('#gen-tech').value
    const date   = container.querySelector('#gen-date').value
    const notes  = container.querySelector('#gen-notes').value.trim()

    if (!techId) { if (errEl) errEl.textContent = 'Select a tech.';    return }
    if (!date)   { if (errEl) errEl.textContent = 'Set a visit date.'; return }

    const company = query('SELECT * FROM companies WHERE company_id = ?', [loc.company_id])[0]
    const tech    = query('SELECT * FROM techs WHERE tech_id = ?', [techId])[0]
    if (!company || !tech) { if (errEl) errEl.textContent = 'Record not found.'; return }

    const employees = roster.map(emp => ({
      ...emp,
      baseline:    getActiveBaseline(emp.employee_id),
      prior_tests: query(
        `SELECT * FROM tests WHERE employee_id = ? AND location_id = ? AND deleted_at IS NULL ORDER BY test_date DESC LIMIT 2`,
        [emp.employee_id, locationId]
      ),
    }))

    const companyForPacket = { ...company, province: loc.province ?? 'XX' }
    const rules = query(
      `SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC`,
      [loc.province ?? 'XX']
    )

    let packet
    try {
      packet = createPacket({
        company:          companyForPacket,
        location:         loc,
        employees,
        rules,
        counselTemplates: [],
        hpdInventory:     [],
        techId:           tech.tech_id,
        techInitials:     tech.initials ?? tech.name.slice(0, 2).toUpperCase(),
        visitDate:        date,
        stickyNotes:      notes,
      })
    } catch (e) {
      genStatus = { ok: false, message: `Packet build failed: ${esc(e.message)}` }
      render(); return
    }

    const coSlug  = company.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 15)
    const locSlug = loc.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)
    const initials = tech.initials ?? tech.name.slice(0, 2).toUpperCase()
    const filename = `${coSlug}-${locSlug}_${date}_${initials}.json`

    try {
      await writePacket(tech.folder_name, filename, packet)
      run(
        `INSERT OR REPLACE INTO packets (packet_id, company_id, location_id, tech_id, visit_date, filename, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [packet.packet_id, loc.company_id, locationId, techId, date, filename, session?.writerName ?? 'admin']
      )
      await save(session?.writerName ?? 'admin')
      genStatus = { ok: true, message: `Packet written → ${esc(tech.name)}/outbox/${esc(filename)} (${roster.length} workers)` }
    } catch (e) {
      genStatus = { ok: false, message: `Write failed: ${esc(e.message)}` }
    }

    render()
  }
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
