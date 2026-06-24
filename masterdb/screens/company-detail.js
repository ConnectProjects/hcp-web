import { getCompany, updateCompany, deactivateCompany } from '../db/companies.js'
import { getLocationsByCompany, createLocation } from '../db/locations.js'
import { logAction } from '../db/sqlite.js'

export function renderCompanyDetail(container, state, navigate) {
  const companyId = state.currentCompany?.company_id
  if (!companyId) { navigate('companies'); return }

  const company = getCompany(companyId)
  if (!company)  { navigate('companies'); return }

  redraw(container, state, navigate, companyId)
}

function redraw(container, state, navigate, companyId) {
  const company   = getCompany(companyId)
  const locations = getLocationsByCompany(companyId)

  const totalEmployees = locations.reduce((s, l) => s + (l.employee_count ?? 0), 0)
  const lastVisit      = locations.reduce((best, l) => {
    if (!l.last_test_date) return best
    return (!best || l.last_test_date > best) ? l.last_test_date : best
  }, null)

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back">Companies</button>
          <span>›</span>
          <span>${esc(company.name)}</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline btn-sm" id="btn-edit">Edit</button>
        </div>
      </div>

      <div class="company-hero">
        <div class="company-hero-info">
          <h1>${esc(company.name)}</h1>
          <div class="company-meta">
            ${company.city ? `<span>📍 ${esc(company.city)}</span>` : ''}
            ${company.contact_name  ? `<span>📞 ${esc(company.contact_name)}</span>` : ''}
            ${company.contact_phone ? `<a href="tel:${esc(company.contact_phone)}">${esc(company.contact_phone)}</a>` : ''}
            ${company.contact_email ? `<a href="mailto:${esc(company.contact_email)}">${esc(company.contact_email)}</a>` : ''}
            ${company.website       ? `<a href="${esc(company.website)}" target="_blank">${esc(company.website)}</a>` : ''}
          </div>
          ${company.address ? `<div class="company-address">${esc(company.address)}</div>` : ''}
        </div>
        <div class="company-kpis">
          <div class="ckpi">
            <span class="ckpi-n">${locations.length}</span>
            <span>Locations</span>
          </div>
          <div class="ckpi">
            <span class="ckpi-n">${totalEmployees}</span>
            <span>Employees</span>
          </div>
          <div class="ckpi">
            <span class="ckpi-n">${lastVisit ?? '—'}</span>
            <span>Last Visit</span>
          </div>
        </div>
      </div>

      ${company.sticky_notes ? `
        <div class="sticky-banner">
          <span>📌</span>
          <span>${esc(company.sticky_notes)}</span>
          <button class="btn btn-ghost btn-sm" id="btn-edit-sticky">Edit</button>
        </div>
      ` : `<button class="btn btn-link btn-sm" id="btn-add-sticky">+ Add notes</button>`}

      <!-- Locations -->
      <div class="section-header" style="margin-top:20px">
        <h2>Locations</h2>
        <button class="btn btn-primary btn-sm" id="btn-add-location">+ Add Location</button>
      </div>

      ${locations.length === 0
        ? '<p class="empty-note">No locations on file. Add one to get started.</p>'
        : `<div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Province</th>
                  <th>Employees</th>
                  <th>Last Visit</th>
                  <th>Contact</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${locations.map(l => `
                  <tr class="table-row table-row--clickable" data-location-id="${l.location_id}">
                    <td class="td-primary">${esc(l.name)}</td>
                    <td><span class="province-badge">${esc(l.province)}</span></td>
                    <td>${l.employee_count ?? 0}</td>
                    <td>${l.last_test_date ?? '—'}</td>
                    <td class="td-muted">${esc(l.contact_name ?? '—')}</td>
                    <td><button class="btn btn-sm btn-outline" data-location-id="${l.location_id}">Open →</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>

    <!-- Add Location modal -->
    <div id="modal-loc" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box modal-box--wide">
        <div class="modal-header">
          <h2>Add Location</h2>
          <button class="modal-close" id="modal-close-loc">✕</button>
        </div>
        <div class="modal-body">
          ${locationForm()}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost"   id="btn-cancel-loc">Cancel</button>
          <button class="btn btn-primary" id="btn-save-loc">Save Location</button>
        </div>
      </div>
    </div>
  `

  // Navigation
  container.querySelector('#btn-back').addEventListener('click', () => navigate('companies'))

  container.querySelector('#btn-edit').addEventListener('click', () =>
    openEditCompany(container, state, company, companyId, navigate)
  )
  container.querySelector('#btn-edit-sticky')?.addEventListener('click', () =>
    openEditCompany(container, state, company, companyId, navigate)
  )
  container.querySelector('#btn-add-sticky')?.addEventListener('click', () =>
    openEditCompany(container, state, company, companyId, navigate)
  )

  // Location row / button clicks
  container.querySelectorAll('.table-row--clickable[data-location-id], .btn[data-location-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      const locId = Number(el.dataset.locationId)
      if (locId) navigate('location-detail', { currentLocation: { location_id: locId } })
    })
  })

  // Add location modal
  const locModal = container.querySelector('#modal-loc')
  container.querySelector('#btn-add-location').addEventListener('click',  () => locModal.classList.remove('hidden'))
  container.querySelector('#modal-close-loc').addEventListener('click',   () => locModal.classList.add('hidden'))
  container.querySelector('#btn-cancel-loc').addEventListener('click',    () => locModal.classList.add('hidden'))
  locModal.querySelector('.modal-backdrop').addEventListener('click',     () => locModal.classList.add('hidden'))

  container.querySelector('#btn-save-loc').addEventListener('click', () => {
    const name     = locModal.querySelector('#lf-name').value.trim()
    const province = locModal.querySelector('#lf-province').value
    if (!name)     { alert('Location name is required.'); return }
    if (!province) { alert('Province is required.'); return }

    const locId = createLocation({
      company_id:    companyId,
      name,
      province,
      city:          locModal.querySelector('#lf-city').value.trim()          || null,
      address:       locModal.querySelector('#lf-address').value.trim()       || null,
      postal_code:   locModal.querySelector('#lf-postal').value.trim()        || null,
      contact_name:  locModal.querySelector('#lf-contact-name').value.trim()  || null,
      contact_phone: locModal.querySelector('#lf-contact-phone').value.trim() || null,
      contact_email: locModal.querySelector('#lf-contact-email').value.trim() || null,
      cu_code:       locModal.querySelector('#lf-cu-code').value.trim()       || null,
      sticky_notes:  locModal.querySelector('#lf-sticky').value.trim()        || null
    })

    locModal.classList.add('hidden')
    logAction(state, 'CREATE_LOCATION', `Added location "${name}" (${province}) to "${company.name}"`)
    navigate('location-detail', { currentLocation: { location_id: locId } })
  })
}

// ---------------------------------------------------------------------------
// Edit company modal
// ---------------------------------------------------------------------------

function openEditCompany(container, state, company, companyId, navigate) {
  container.querySelector('#modal-edit-co')?.remove()

  const div = document.createElement('div')
  div.id        = 'modal-edit-co'
  div.className = 'modal'
  div.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h2>Edit Company</h2>
        <button class="modal-close" id="co-close">✕</button>
      </div>
      <div class="modal-body">
        ${companyEditForm(company)}
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-ghost" id="co-deactivate" style="color:var(--red);margin-right:auto">
          Deactivate
        </button>
        <button class="btn btn-ghost"   id="co-cancel">Cancel</button>
        <button class="btn btn-primary" id="co-save">Save Changes</button>
      </div>
    </div>
  `
  container.appendChild(div)

  const close = () => div.remove()
  div.querySelector('#co-close').addEventListener('click',   close)
  div.querySelector('#co-cancel').addEventListener('click',  close)
  div.querySelector('.modal-backdrop').addEventListener('click', close)

  div.querySelector('#co-deactivate').addEventListener('click', () => {
    if (!confirm(`Deactivate "${company.name}"? It will be hidden from the companies list.`)) return
    deactivateCompany(companyId)
    logAction(state, 'DEACTIVATE_COMPANY', `Deactivated company "${company.name}"`)
    close()
    navigate('companies')
  })

  div.querySelector('#co-save').addEventListener('click', () => {
    const name = div.querySelector('#cf-name').value.trim()
    if (!name) { alert('Company name is required.'); return }
    updateCompany(companyId, {
      name,
      city:          div.querySelector('#cf-city').value.trim()          || null,
      address:       div.querySelector('#cf-address').value.trim()       || null,
      contact_name:  div.querySelector('#cf-contact-name').value.trim()  || null,
      contact_phone: div.querySelector('#cf-contact-phone').value.trim() || null,
      contact_email: div.querySelector('#cf-contact-email').value.trim() || null,
      website:       div.querySelector('#cf-website').value.trim()       || null,
      sticky_notes:  div.querySelector('#cf-sticky').value.trim()        || null
    })
    logAction(state, 'UPDATE_COMPANY', `Updated company "${name}"`)
    close()
    navigate('company-detail', { currentCompany: { company_id: companyId } })
  })
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function companyEditForm(co = {}) {
  return `
    <div class="form-grid">
      <div class="form-group span-2">
        <label>Company Name *</label>
        <input id="cf-name" type="text" value="${esc(co.name ?? '')}" />
      </div>
      <div class="form-group">
        <label>City <span class="label-hint">(HQ)</span></label>
        <input id="cf-city" type="text" value="${esc(co.city ?? '')}" />
      </div>
      <div class="form-group">
        <label>Address <span class="label-hint">(HQ)</span></label>
        <input id="cf-address" type="text" value="${esc(co.address ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Name</label>
        <input id="cf-contact-name" type="text" value="${esc(co.contact_name ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Phone</label>
        <input id="cf-contact-phone" type="tel" value="${esc(co.contact_phone ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Email</label>
        <input id="cf-contact-email" type="email" value="${esc(co.contact_email ?? '')}" />
      </div>
      <div class="form-group">
        <label>Website</label>
        <input id="cf-website" type="text" value="${esc(co.website ?? '')}" placeholder="https://…" />
      </div>
      <div class="form-group span-2">
        <label>Notes</label>
        <textarea id="cf-sticky" rows="2">${esc(co.sticky_notes ?? '')}</textarea>
      </div>
    </div>
  `
}

function locationForm(loc = {}) {
  const PROVS = [
    ['AB','Alberta'], ['BC','British Columbia'], ['SK','Saskatchewan'],
    ['MB','Manitoba'], ['ON','Ontario']
  ]
  return `
    <div class="form-grid">
      <div class="form-group span-2">
        <label>Location Name *</label>
        <input id="lf-name" type="text" value="${esc(loc.name ?? '')}" placeholder="e.g. Kal Tire #021 - Warehouse, Acheson" />
      </div>
      <div class="form-group">
        <label>Province *</label>
        <select id="lf-province">
          <option value="">— select —</option>
          ${PROVS.map(([c,l]) => `<option value="${c}" ${loc.province === c ? 'selected' : ''}>${c} — ${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Classification Unit (CU) Code</label>
        <input id="lf-cu-code" type="text" value="${esc(loc.cu_code ?? '')}" placeholder="e.g. 710006" />
      </div>
      <div class="form-group">
        <label>City</label>
        <input id="lf-city" type="text" value="${esc(loc.city ?? '')}" />
      </div>
      <div class="form-group">
        <label>Address</label>
        <input id="lf-address" type="text" value="${esc(loc.address ?? '')}" />
      </div>
      <div class="form-group">
        <label>Postal Code</label>
        <input id="lf-postal" type="text" value="${esc(loc.postal_code ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Name</label>
        <input id="lf-contact-name" type="text" value="${esc(loc.contact_name ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Phone</label>
        <input id="lf-contact-phone" type="tel" value="${esc(loc.contact_phone ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Email</label>
        <input id="lf-contact-email" type="email" value="${esc(loc.contact_email ?? '')}" />
      </div>
      <div class="form-group span-2">
        <label>Sticky Notes <span class="label-hint">(travel with packet to tech)</span></label>
        <textarea id="lf-sticky" rows="2">${esc(loc.sticky_notes ?? '')}</textarea>
      </div>
    </div>
  `
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
