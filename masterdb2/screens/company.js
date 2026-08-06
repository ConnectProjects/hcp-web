/**
 * masterdb2/screens/company.js — company detail + location list
 * params: { companyId: number }
 * Supports inline edit of company info and creating new locations.
 */

import { query, run, scalar, save } from '../db/db.js'

const PROVINCES = [
  ['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],
  ['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['NT','Northwest Territories'],
  ['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island'],
  ['QC','Quebec'],['SK','Saskatchewan'],['YT','Yukon'],
]

export function mount(container, { navigate, companyId, session }) {
  if (!companyId) { navigate('companies'); return }

  let _mode   = null    // null | 'edit-company' | 'new-location'
  let _status = null

  render()

  function render() {
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
       WHERE l.company_id = ? AND l.active = 1 AND l.deleted_at IS NULL
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
    `).join('') || `<tr><td colspan="4" class="table-empty">No locations yet.</td></tr>`

    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-btn">&larr; Companies</button>
        <h1>${esc(company.name)}</h1>
        <button class="btn btn-secondary btn-sm" id="edit-co-btn">
          ${_mode === 'edit-company' ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>
      <div class="screen-body">

        ${_status ? statusBanner(_status) : ''}

        ${_mode === 'edit-company'
          ? companyEditForm(company)
          : companyInfoCard(company, totalTests)
        }

        <div class="section-head" style="margin-top:0.25rem">
          <h2>Locations (${locations.length})</h2>
          <button class="btn btn-secondary btn-sm" id="add-loc-btn">
            ${_mode === 'new-location' ? 'Cancel' : '+ Add Location'}
          </button>
        </div>

        ${_mode === 'new-location' ? locationForm(null, companyId) : ''}

        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Location</th><th>City / Province</th>
                  <th style="text-align:right">Workers</th><th>Last Test</th>
                </tr>
              </thead>
              <tbody>${locRows}</tbody>
            </table>
          </div>
        </div>

      </div>
    `

    // Wire up buttons
    container.querySelector('#back-btn').addEventListener('click', () => navigate('companies'))
    container.querySelector('#edit-co-btn').addEventListener('click', () => {
      _mode = _mode === 'edit-company' ? null : 'edit-company'
      _status = null; render()
    })
    container.querySelector('#add-loc-btn').addEventListener('click', () => {
      _mode = _mode === 'new-location' ? null : 'new-location'
      _status = null; render()
    })
    container.querySelector('#co-save')?.addEventListener('click', () => saveCompany(company))
    container.querySelector('#co-cancel')?.addEventListener('click', () => { _mode = null; render() })
    container.querySelector('#loc-save')?.addEventListener('click', () => saveLocation(companyId))
    container.querySelector('#loc-cancel')?.addEventListener('click', () => { _mode = null; render() })

    container.querySelectorAll('tr.clickable').forEach(tr =>
      tr.addEventListener('click', () => navigate('location', { locationId: Number(tr.dataset.id), companyId }))
    )
  }

  async function saveCompany(company) {
    const errEl = container.querySelector('#co-err')
    const name  = container.querySelector('#co-name')?.value.trim()
    if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return }

    const fields = {
      name,
      city:          container.querySelector('#co-city')?.value.trim()  || null,
      address:       container.querySelector('#co-addr')?.value.trim()  || null,
      contact_name:  container.querySelector('#co-cname')?.value.trim() || null,
      contact_phone: container.querySelector('#co-phone')?.value.trim() || null,
      contact_email: container.querySelector('#co-email')?.value.trim() || null,
      website:       container.querySelector('#co-web')?.value.trim()   || null,
      sticky_notes:  container.querySelector('#co-notes')?.value.trim() || null,
    }

    try {
      run(
        `UPDATE companies SET name=?, city=?, address=?, contact_name=?, contact_phone=?,
         contact_email=?, website=?, sticky_notes=?, updated_at=datetime('now')
         WHERE company_id=?`,
        [fields.name, fields.city, fields.address, fields.contact_name, fields.contact_phone,
         fields.contact_email, fields.website, fields.sticky_notes, companyId]
      )
      await save(session?.writerName ?? 'admin')
      _mode = null
      _status = { ok: true, message: `"${fields.name}" saved.` }
      render()
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
  }

  async function saveLocation(companyId) {
    const errEl    = container.querySelector('#loc-err')
    const name     = container.querySelector('#loc-name')?.value.trim()
    const province = container.querySelector('#loc-province')?.value

    if (!name)     { if (errEl) errEl.textContent = 'Location name is required.'; return }
    if (!province) { if (errEl) errEl.textContent = 'Province is required.'; return }

    const fields = {
      name,
      province,
      city:          container.querySelector('#loc-city')?.value.trim()    || null,
      address:       container.querySelector('#loc-addr')?.value.trim()    || null,
      postal_code:   container.querySelector('#loc-postal')?.value.trim()  || null,
      contact_name:  container.querySelector('#loc-cname')?.value.trim()   || null,
      contact_phone: container.querySelector('#loc-phone')?.value.trim()   || null,
      contact_email: container.querySelector('#loc-email')?.value.trim()   || null,
      cu_code:       container.querySelector('#loc-cu')?.value.trim()      || null,
    }

    try {
      run(
        `INSERT INTO locations (company_id, name, province, city, address, postal_code,
         contact_name, contact_phone, contact_email, cu_code, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [companyId, fields.name, fields.province, fields.city, fields.address,
         fields.postal_code, fields.contact_name, fields.contact_phone,
         fields.contact_email, fields.cu_code]
      )
      const newLocId = scalar('SELECT last_insert_rowid()')
      await save(session?.writerName ?? 'admin')
      _mode = null
      _status = { ok: true, message: `Location "${fields.name}" created.` }
      render()
      navigate('location', { locationId: newLocId, companyId })
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
  }
}

// ── Form builders ─────────────────────────────────────────────────────────────

function companyInfoCard(co, totalTests) {
  return `
    <div class="info-card">
      <dl>
        ${row('City',        co.city)}
        ${row('Address',     co.address)}
        ${row('Contact',     co.contact_name)}
        ${row('Phone',       co.contact_phone)}
        ${row('Email',       co.contact_email)}
        ${row('Website',     co.website)}
        ${row('Notes',       co.sticky_notes)}
        ${row('Total tests', totalTests || null)}
      </dl>
    </div>
  `
}

function companyEditForm(co) {
  return `
    <div class="info-card" style="margin-bottom:1.5rem">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div style="grid-column:1/-1">
          <label class="field-label">Company Name *</label>
          <input class="search-input" id="co-name" value="${esc(co.name)}">
        </div>
        <div>
          <label class="field-label">City</label>
          <input class="search-input" id="co-city" value="${esc(co.city ?? '')}">
        </div>
        <div>
          <label class="field-label">Address</label>
          <input class="search-input" id="co-addr" value="${esc(co.address ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Name</label>
          <input class="search-input" id="co-cname" value="${esc(co.contact_name ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Phone</label>
          <input class="search-input" id="co-phone" value="${esc(co.contact_phone ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Email</label>
          <input class="search-input" id="co-email" value="${esc(co.contact_email ?? '')}">
        </div>
        <div>
          <label class="field-label">Website</label>
          <input class="search-input" id="co-web" value="${esc(co.website ?? '')}">
        </div>
        <div style="grid-column:1/-1">
          <label class="field-label">Sticky Notes</label>
          <textarea class="search-input" id="co-notes" rows="2">${esc(co.sticky_notes ?? '')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="co-save">Save Changes</button>
        <button class="btn btn-secondary" id="co-cancel">Cancel</button>
        <span id="co-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    </div>
  `
}

function locationForm(loc, companyId) {
  const provOpts = PROVINCES.map(([code, name]) =>
    `<option value="${code}" ${loc?.province === code ? 'selected' : ''}>${code} — ${name}</option>`
  ).join('')

  return `
    <div class="info-card" style="margin-bottom:1rem">
      <h3 style="margin-bottom:0.75rem;font-size:0.9375rem">${loc ? 'Edit Location' : 'New Location'}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div style="grid-column:1/-1">
          <label class="field-label">Location Name *</label>
          <input class="search-input" id="loc-name" value="${esc(loc?.name ?? '')}" placeholder="Main Plant">
        </div>
        <div>
          <label class="field-label">Province *</label>
          <select class="form-select" id="loc-province" style="width:100%">
            <option value="">Select…</option>${provOpts}
          </select>
        </div>
        <div>
          <label class="field-label">City</label>
          <input class="search-input" id="loc-city" value="${esc(loc?.city ?? '')}" placeholder="Saskatoon">
        </div>
        <div>
          <label class="field-label">Address</label>
          <input class="search-input" id="loc-addr" value="${esc(loc?.address ?? '')}" placeholder="100 Industrial Ave">
        </div>
        <div>
          <label class="field-label">Postal Code</label>
          <input class="search-input" id="loc-postal" value="${esc(loc?.postal_code ?? '')}" placeholder="S7K 1A1">
        </div>
        <div>
          <label class="field-label">Contact Name</label>
          <input class="search-input" id="loc-cname" value="${esc(loc?.contact_name ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Phone</label>
          <input class="search-input" id="loc-phone" value="${esc(loc?.contact_phone ?? '')}">
        </div>
        <div>
          <label class="field-label">Contact Email</label>
          <input class="search-input" id="loc-email" value="${esc(loc?.contact_email ?? '')}">
        </div>
        <div>
          <label class="field-label">CU Code</label>
          <input class="search-input" id="loc-cu" value="${esc(loc?.cu_code ?? '')}" placeholder="Optional">
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="loc-save">Save</button>
        <button class="btn btn-secondary" id="loc-cancel">Cancel</button>
        <span id="loc-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    </div>
  `
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBanner({ ok, message }) {
  return ok
    ? `<div class="success-banner" style="margin-bottom:1rem">${esc(message)}</div>`
    : `<div class="error-banner" style="margin-bottom:1rem">${esc(message)}</div>`
}

function row(label, value) {
  if (value == null || value === '') return ''
  return `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
