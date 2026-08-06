/**
 * masterdb2/screens/schedule.js — packet generation
 *
 * Builds a v2 packet for a location visit, writes it to the tech's outbox,
 * records it in the packets table, and saves the DB.
 *
 * Province comes from the selected location (not the company — v2 schema
 * stores province per-location, not per-company).
 */

import { createPacket }                           from '../../shared/packet/schema.js'
import { query, run, save, writePacket }          from '../db/db.js'
import { listByLocation, getActiveBaseline }      from '../db/workers.js'

export function mount(container, { navigate, session }) {
  // Load reference data once
  const companies = query(`SELECT * FROM companies WHERE active = 1 ORDER BY name`)
  const techs     = query(`SELECT * FROM techs    WHERE active = 1 AND folder_name IS NOT NULL ORDER BY name`)

  let _status = null   // { ok: bool, message: string } — set after generate

  render()

  function render() {
    const coOpts = companies.map(c =>
      `<option value="${c.company_id}">${esc(c.name)}</option>`
    ).join('')

    const techOpts = techs.map(t =>
      `<option value="${esc(t.tech_id)}">${esc(t.name)}</option>`
    ).join('')

    const today = new Date().toISOString().slice(0, 10)

    container.innerHTML = `
      <div class="screen-header-row"><h1>Schedule</h1></div>
      <div class="screen-body">

        ${_status ? statusBanner(_status) : ''}

        <div class="section-head"><h2>Generate Packet</h2></div>
        <div class="info-card" style="margin-bottom:2rem">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem">

            <div>
              <label class="field-label">Company *</label>
              <select class="form-select" id="gen-co" style="width:100%">
                <option value="">Select company…</option>${coOpts}
              </select>
            </div>
            <div>
              <label class="field-label">Location *</label>
              <select class="form-select" id="gen-loc" style="width:100%" disabled>
                <option value="">Select company first</option>
              </select>
            </div>
            <div>
              <label class="field-label">Tech *</label>
              <select class="form-select" id="gen-tech" style="width:100%">
                <option value="">Select tech…</option>${techOpts}
              </select>
            </div>
            <div>
              <label class="field-label">Visit Date *</label>
              <input type="date" class="form-select" id="gen-date" value="${today}" style="width:100%">
            </div>
            <div style="grid-column:1/-1">
              <label class="field-label">Notes for Tech</label>
              <input type="text" class="search-input" id="gen-notes"
                     placeholder="Optional — visible to tech in TechTool" style="width:100%">
            </div>

          </div>
          <div style="margin-top:1rem;display:flex;align-items:center;gap:0.75rem">
            <button class="btn btn-primary" id="gen-btn">Generate &amp; Write to Outbox</button>
            <span id="gen-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
          </div>
        </div>

        <div class="section-head"><h2>Recent Packets</h2></div>
        <div id="packets-list"></div>

      </div>
    `

    loadLocations()   // populate location select based on initial company value
    loadPacketList()

    container.querySelector('#gen-co').addEventListener('change', loadLocations)
    container.querySelector('#gen-btn').addEventListener('click', generate)
  }

  function loadLocations() {
    const coId  = Number(container.querySelector('#gen-co').value)
    const locSel = container.querySelector('#gen-loc')
    if (!coId) { locSel.innerHTML = '<option value="">Select company first</option>'; locSel.disabled = true; return }

    const locs = query(
      `SELECT location_id, name, city, province FROM locations WHERE company_id = ? AND active = 1 ORDER BY name`,
      [coId]
    )
    locSel.disabled = false
    locSel.innerHTML = locs.length
      ? `<option value="">Select location…</option>` +
        locs.map(l => `<option value="${l.location_id}">${esc(l.name)}${l.city ? ' — ' + esc(l.city) : ''}</option>`).join('')
      : `<option value="">No active locations</option>`
  }

  function loadPacketList() {
    const wrap = container.querySelector('#packets-list')
    let rows
    try {
      rows = query(
        `SELECT p.*, c.name AS company_name, l.name AS location_name, tk.name AS tech_name
         FROM packets p
         JOIN  companies c ON c.company_id  = p.company_id
         LEFT JOIN locations l  ON l.location_id = p.location_id
         LEFT JOIN techs    tk ON tk.tech_id     = p.tech_id
         ORDER BY p.created_at DESC LIMIT 50`
      )
    } catch (e) {
      wrap.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`; return
    }
    if (!rows.length) {
      wrap.innerHTML = `<div class="table-card"><div class="table-empty">No packets generated yet.</div></div>`
      return
    }
    wrap.innerHTML = `
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Company</th><th>Location</th><th>Visit Date</th><th>Tech</th><th>Status</th><th>File</th></tr>
            </thead>
            <tbody>
              ${rows.map(p => `
                <tr>
                  <td>${esc(p.company_name)}</td>
                  <td>${esc(p.location_name ?? '—')}</td>
                  <td>${fmtDate(p.visit_date)}</td>
                  <td>${esc(p.tech_name ?? '—')}</td>
                  <td>${packetBadge(p.status)}</td>
                  <td style="font-size:0.8rem;color:var(--clr-subtle)">${esc(p.filename)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  async function generate() {
    const errEl  = container.querySelector('#gen-err')
    errEl.textContent = ''
    _status = null

    const coId     = Number(container.querySelector('#gen-co').value)
    const locId    = Number(container.querySelector('#gen-loc').value)
    const techId   = container.querySelector('#gen-tech').value
    const date     = container.querySelector('#gen-date').value
    const notes    = container.querySelector('#gen-notes').value.trim()

    if (!coId)   { errEl.textContent = 'Select a company.';  return }
    if (!locId)  { errEl.textContent = 'Select a location.'; return }
    if (!techId) { errEl.textContent = 'Select a tech.';     return }
    if (!date)   { errEl.textContent = 'Set a visit date.';  return }

    const company  = query('SELECT * FROM companies WHERE company_id = ?', [coId])[0]
    const location = query('SELECT * FROM locations WHERE location_id = ?', [locId])[0]
    const tech     = query('SELECT * FROM techs WHERE tech_id = ?', [techId])[0]
    if (!company || !location || !tech) { errEl.textContent = 'Record not found — refresh and try again.'; return }

    // Build enriched employee list (baseline + last 2 tests at this location)
    const roster = listByLocation(locId)
    const employees = roster.map(emp => ({
      ...emp,
      baseline:    getActiveBaseline(emp.employee_id),
      prior_tests: query(
        `SELECT * FROM tests WHERE employee_id = ? AND location_id = ? AND deleted_at IS NULL ORDER BY test_date DESC LIMIT 2`,
        [emp.employee_id, locId]
      ),
    }))

    // Province lives on the location in v2
    const companyForPacket = { ...company, province: location.province ?? 'XX' }

    const rules = query(
      `SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC`,
      [location.province ?? 'XX']
    )

    let packet
    try {
      packet = createPacket({
        company:          companyForPacket,
        location,
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
      errEl.textContent = `Packet build failed: ${e.message}`; return
    }

    // Derive filename the same way createPacket does internally
    const coSlug  = company.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 15)
    const locSlug = location.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)
    const slug    = `${coSlug}-${locSlug}`
    const initials = tech.initials ?? tech.name.slice(0, 2).toUpperCase()
    const filename = `${slug}_${date}_${initials}.json`

    try {
      await writePacket(tech.folder_name, filename, packet)
      run(
        `INSERT OR REPLACE INTO packets (packet_id, company_id, location_id, tech_id, visit_date, filename, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [packet.packet_id, coId, locId, techId, date, filename, session.writerName]
      )
      await save(session.writerName)
      _status = { ok: true, message: `Packet written → ${esc(tech.name)}/outbox/${esc(filename)} (${roster.length} workers)` }
    } catch (e) {
      _status = { ok: false, message: `Write failed: ${e.message}` }
    }

    render()
  }
}

function statusBanner({ ok, message }) {
  return ok
    ? `<div class="success-banner" style="margin-bottom:1rem"><strong>Packet generated.</strong> ${message}</div>`
    : `<div class="error-banner"   style="margin-bottom:1rem"><strong>Error:</strong> ${message}</div>`
}

function packetBadge(status) {
  const map = { pending: ['badge-yellow','Pending'], imported: ['badge-green','Imported'],
                cancelled: ['badge-gray','Cancelled'], error: ['badge-red','Error'] }
  const [cls, lbl] = map[status] ?? ['badge-gray', esc(status ?? '?')]
  return `<span class="badge ${cls}">${lbl}</span>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
