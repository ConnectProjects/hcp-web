/**
 * masterdb2/screens/location.js — location detail: info card + roster + visit history
 * params: { locationId: number, companyId?: number }
 */

import { createPacket }                      from '../../shared/packet/schema.js'
import { query, run, scalar, save, writePacket } from '../db/db.js'
import { listByLocation, getActiveBaseline } from '../db/workers.js'

const PROVINCES = [
  ['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],
  ['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['NT','Northwest Territories'],
  ['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island'],
  ['QC','Quebec'],['SK','Saskatchewan'],['YT','Yukon'],
]

export function mount(container, { navigate, locationId, companyId, session }) {
  if (!locationId) { navigate('companies'); return }

  const techs   = query(`SELECT * FROM techs WHERE active = 1 AND folder_name IS NOT NULL ORDER BY name`)
  let genStatus = null
  let _mode     = null   // null | 'edit-loc' | 'new-worker'
  let _locStatus = null

  render()

  function render() {
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

    const techOpts = techs.map(t =>
      `<option value="${t.tech_id}">${esc(t.name)}</option>`
    ).join('')

    const today = new Date().toISOString().slice(0, 10)

    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-btn">&larr; ${esc(loc.company_name)}</button>
        <h1>${esc(loc.name)}</h1>
        <button class="btn btn-secondary btn-sm" id="edit-loc-btn">
          ${_mode === 'edit-loc' ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>
      <div class="screen-body">

        ${_locStatus ? `<div class="${_locStatus.ok ? 'success-banner' : 'error-banner'}" style="margin-bottom:1rem">${esc(_locStatus.message)}</div>` : ''}

        ${_mode === 'edit-loc' ? locEditForm(loc) : `
          <div class="info-card">
            <dl>
              ${row('Company',   loc.company_name)}
              ${row('City',      loc.city)}
              ${row('Province',  loc.province)}
              ${row('Address',   loc.address)}
              ${row('Contact',   loc.contact_name)}
              ${row('Phone',     loc.contact_phone)}
              ${row('Email',     loc.contact_email)}
              ${row('CU Code',   loc.cu_code)}
              ${row('UID',       loc.uid)}
            </dl>
          </div>
        `}

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
          <button class="btn btn-secondary btn-sm" id="add-worker-btn">
            ${_mode === 'new-worker' ? 'Cancel' : '+ Add Worker'}
          </button>
        </div>
        ${_mode === 'new-worker' ? workerForm() : ''}
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
    container.querySelector('#edit-loc-btn').addEventListener('click', () => {
      _mode = _mode === 'edit-loc' ? null : 'edit-loc'
      _locStatus = null; render()
    })
    container.querySelector('#add-worker-btn').addEventListener('click', () => {
      _mode = _mode === 'new-worker' ? null : 'new-worker'
      _locStatus = null; render()
    })
    container.querySelector('#loc-save')?.addEventListener('click', () => saveLoc(loc))
    container.querySelector('#loc-cancel')?.addEventListener('click', () => { _mode = null; render() })
    container.querySelector('#worker-save')?.addEventListener('click', () => saveWorker(loc))
    container.querySelector('#worker-cancel')?.addEventListener('click', () => { _mode = null; render() })
    container.querySelectorAll('#roster-tbody tr.clickable').forEach(tr =>
      tr.addEventListener('click', () =>
        navigate('worker', { employeeId: Number(tr.dataset.id), fromLocation: { locationId, companyId: loc.company_id } })
      )
    )
    container.querySelector('#gen-btn')?.addEventListener('click', () => generate(roster, loc))
  }

  async function saveLoc(loc) {
    const errEl    = container.querySelector('#loc-err')
    const name     = container.querySelector('#loc-name')?.value.trim()
    const province = container.querySelector('#loc-province')?.value
    if (!name)     { if (errEl) errEl.textContent = 'Name is required.'; return }
    if (!province) { if (errEl) errEl.textContent = 'Province is required.'; return }

    try {
      run(
        `UPDATE locations SET name=?, province=?, city=?, address=?, postal_code=?,
         contact_name=?, contact_phone=?, contact_email=?, cu_code=?,
         updated_at=datetime('now') WHERE location_id=?`,
        [name, province,
         container.querySelector('#loc-city')?.value.trim()    || null,
         container.querySelector('#loc-addr')?.value.trim()    || null,
         container.querySelector('#loc-postal')?.value.trim()  || null,
         container.querySelector('#loc-cname')?.value.trim()   || null,
         container.querySelector('#loc-phone')?.value.trim()   || null,
         container.querySelector('#loc-email')?.value.trim()   || null,
         container.querySelector('#loc-cu')?.value.trim()      || null,
         locationId]
      )
      await save(session?.writerName ?? 'admin')
      _mode = null
      _locStatus = { ok: true, message: `Location "${name}" saved.` }
      render()
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
  }

  async function saveWorker(loc) {
    const errEl = container.querySelector('#worker-err')
    const first = container.querySelector('#wf-first')?.value.trim()
    const last  = container.querySelector('#wf-last')?.value.trim()
    if (!first || !last) { if (errEl) errEl.textContent = 'First and last name are required.'; return }

    try {
      run(
        `INSERT INTO employees (current_location_id, first_name, middle_name, last_name,
         dob, job_title, hire_date, phone, email, sin_last_4, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [locationId, first,
         container.querySelector('#wf-middle')?.value.trim()  || null,
         last,
         container.querySelector('#wf-dob')?.value           || null,
         container.querySelector('#wf-title')?.value.trim()  || null,
         container.querySelector('#wf-hire')?.value          || null,
         container.querySelector('#wf-phone')?.value.trim()  || null,
         container.querySelector('#wf-email')?.value.trim()  || null,
         container.querySelector('#wf-sin')?.value.trim()    || null,
        ]
      )
      const newId = scalar('SELECT last_insert_rowid()')
      await save(session?.writerName ?? 'admin')
      _mode = null
      _locStatus = { ok: true, message: `Worker "${last}, ${first}" added.` }
      render()
      navigate('worker', { employeeId: newId, fromLocation: { locationId, companyId: loc.company_id } })
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
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

function locEditForm(loc) {
  const provOpts = PROVINCES.map(([code, name]) =>
    `<option value="${code}" ${loc.province === code ? 'selected' : ''}>${code} — ${name}</option>`
  ).join('')

  return `
    <div class="info-card" style="margin-bottom:1rem">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div style="grid-column:1/-1">
          <label class="field-label">Location Name *</label>
          <input class="search-input" id="loc-name" value="${esc(loc.name)}">
        </div>
        <div>
          <label class="field-label">Province *</label>
          <select class="form-select" id="loc-province" style="width:100%">
            <option value="">Select…</option>${provOpts}
          </select>
        </div>
        <div>
          <label class="field-label">City</label>
          <input class="search-input" id="loc-city" value="${esc(loc.city ?? '')}">
        </div>
        <div>
          <label class="field-label">Address</label>
          <input class="search-input" id="loc-addr" value="${esc(loc.address ?? '')}">
        </div>
        <div>
          <label class="field-label">Postal Code</label>
          <input class="search-input" id="loc-postal" value="${esc(loc.postal_code ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Name</label>
          <input class="search-input" id="loc-cname" value="${esc(loc.contact_name ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Phone</label>
          <input class="search-input" id="loc-phone" value="${esc(loc.contact_phone ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Email</label>
          <input class="search-input" id="loc-email" value="${esc(loc.contact_email ?? '')}">
        </div>
        <div>
          <label class="field-label">CU Code</label>
          <input class="search-input" id="loc-cu" value="${esc(loc.cu_code ?? '')}">
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="loc-save">Save Changes</button>
        <button class="btn btn-secondary" id="loc-cancel">Cancel</button>
        <span id="loc-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    </div>
  `
}

function workerForm() {
  return `
    <div class="info-card" style="margin-bottom:1rem">
      <h3 style="margin-bottom:0.75rem;font-size:0.9375rem">New Worker</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div>
          <label class="field-label">First Name *</label>
          <input class="search-input" id="wf-first" placeholder="John">
        </div>
        <div>
          <label class="field-label">Last Name *</label>
          <input class="search-input" id="wf-last" placeholder="Smith">
        </div>
        <div>
          <label class="field-label">Middle Name</label>
          <input class="search-input" id="wf-middle" placeholder="Optional">
        </div>
        <div>
          <label class="field-label">Date of Birth</label>
          <input type="date" class="form-select" id="wf-dob" style="width:100%">
        </div>
        <div>
          <label class="field-label">Job Title</label>
          <input class="search-input" id="wf-title" placeholder="Machine Operator">
        </div>
        <div>
          <label class="field-label">Hire Date</label>
          <input type="date" class="form-select" id="wf-hire" style="width:100%">
        </div>
        <div>
          <label class="field-label">Phone</label>
          <input class="search-input" id="wf-phone" placeholder="306-555-0100">
        </div>
        <div>
          <label class="field-label">Email</label>
          <input class="search-input" id="wf-email" placeholder="worker@company.com">
        </div>
        <div>
          <label class="field-label">SIN (last 4 digits)</label>
          <input class="search-input" id="wf-sin" placeholder="1234" maxlength="4">
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="worker-save">Add Worker</button>
        <button class="btn btn-secondary" id="worker-cancel">Cancel</button>
        <span id="worker-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    </div>
  `
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
