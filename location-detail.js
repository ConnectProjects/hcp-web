import { getLocation, updateLocation, deactivateLocation,
         getHPDInventory, saveHPDInventory } from '../db/locations.js'
import { getEmployeesByLocation, createEmployee, updateEmployee, deleteEmployee } from '../db/employees.js'
import { getRecentTests, getSTSFlags } from '../db/tests.js'

export function renderLocationDetail(container, state, navigate) {
  const locationId = state.currentLocation?.location_id
  if (!locationId) { navigate('companies'); return }

  redraw(container, state, navigate, locationId)
}

function redraw(container, state, navigate, locationId) {
  const location  = getLocation(locationId)
  if (!location)  { navigate('companies'); return }

  const employees   = getEmployeesByLocation(locationId)
  const recentTests = getRecentTests(locationId, 10)
  const stsFlags    = getSTSFlags(locationId)
  const hpdInv      = getHPDInventory(locationId)

  let activeTab = state.params?.tab ?? 'employees'

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back-companies">Companies</button>
          <span>›</span>
          <button class="btn btn-link" id="btn-back-company">${esc(location.company_name)}</button>
          <span>›</span>
          <span>${esc(location.name)}</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline btn-sm" id="btn-edit">Edit</button>
          <button class="btn btn-primary btn-sm" id="btn-generate">Generate Packet</button>
        </div>
      </div>

      <div class="company-hero">
        <div class="company-hero-info">
          <h1>${esc(location.name)}</h1>
          <div class="company-meta">
            <span class="province-badge">${esc(location.province)}</span>
            ${location.city          ? `<span>📍 ${esc(location.city)}</span>` : ''}
            ${location.contact_name  ? `<span>📞 ${esc(location.contact_name)}</span>` : ''}
            ${location.contact_phone ? `<a href="tel:${esc(location.contact_phone)}">${esc(location.contact_phone)}</a>` : ''}
            ${location.cu_code       ? `<span class="badge badge-neutral">CU: ${esc(location.cu_code)}</span>` : ''}
          </div>
          ${location.address ? `<div class="company-address">${esc(location.address)}${location.postal_code ? ', ' + esc(location.postal_code) : ''}</div>` : ''}
        </div>
        <div class="company-kpis">
          <div class="ckpi">
            <span class="ckpi-n">${employees.length}</span>
            <span>Employees</span>
          </div>
          <div class="ckpi">
            <span class="ckpi-n">${recentTests.length}</span>
            <span>Recent Tests</span>
          </div>
          <div class="ckpi ${stsFlags.length > 0 ? 'ckpi--warn' : ''}">
            <span class="ckpi-n">${stsFlags.length}</span>
            <span>STS Flags</span>
          </div>
        </div>
      </div>

      ${location.sticky_notes ? `
        <div class="sticky-banner">
          <span>📌</span>
          <span>${esc(location.sticky_notes)}</span>
          <button class="btn btn-ghost btn-sm" id="btn-edit-sticky">Edit</button>
        </div>
      ` : `<button class="btn btn-link btn-sm" id="btn-add-sticky">+ Add sticky notes</button>`}

      <div class="tab-bar">
        <button class="tab-btn ${activeTab === 'employees' ? 'tab-btn--active' : ''}" data-tab="employees">
          Employees (${employees.length})
        </button>
        <button class="tab-btn ${activeTab === 'tests' ? 'tab-btn--active' : ''}" data-tab="tests">
          Test History
        </button>
        <button class="tab-btn ${activeTab === 'hpd' ? 'tab-btn--active' : ''}" data-tab="hpd">
          HPD Inventory (${hpdInv.length})
        </button>
      </div>

      <div id="tab-content">
        ${renderTab(activeTab, employees, recentTests, stsFlags, hpdInv)}
      </div>
    </div>

    <!-- Add/Edit Employee modal -->
    <div id="modal-emp" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h2 id="emp-modal-title">Add Employee</h2>
          <button class="modal-close" id="modal-close-emp">✕</button>
        </div>
        <div class="modal-body" id="emp-modal-body">
          ${employeeForm()}
        </div>
        <div class="modal-footer">
          <button class="btn btn-sm btn-ghost hidden" id="btn-delete-emp" style="color:var(--red);margin-right:auto">Delete Employee</button>
          <button class="btn btn-ghost"   id="btn-cancel-emp">Cancel</button>
          <button class="btn btn-primary" id="btn-save-emp">Save Employee</button>
        </div>
      </div>
    </div>
  `

  // Navigation
  container.querySelector('#btn-back-companies').addEventListener('click', () => navigate('companies'))
  container.querySelector('#btn-back-company').addEventListener('click', () =>
    navigate('company-detail', { currentCompany: { company_id: location.company_id } })
  )
  container.querySelector('#btn-generate').addEventListener('click', () =>
    navigate('generate-packet', { currentLocation: location })
  )
  container.querySelector('#btn-edit').addEventListener('click', () =>
    openEditLocation(container, location, locationId, navigate)
  )
  container.querySelector('#btn-edit-sticky')?.addEventListener('click', () =>
    openEditLocation(container, location, locationId, navigate)
  )
  container.querySelector('#btn-add-sticky')?.addEventListener('click', () =>
    openEditLocation(container, location, locationId, navigate)
  )

  // Tabs
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'))
      btn.classList.add('tab-btn--active')
      container.querySelector('#tab-content').innerHTML =
        renderTab(activeTab, employees, recentTests, stsFlags, hpdInv)
      wireTabHandlers(container, locationId, location, employees, hpdInv, navigate)
    })
  })

  wireTabHandlers(container, locationId, location, employees, hpdInv, navigate)

  // Employee modal
  const empModal = container.querySelector('#modal-emp')
  container.querySelector('#modal-close-emp').addEventListener('click', () => empModal.classList.add('hidden'))
  container.querySelector('#btn-cancel-emp').addEventListener('click',  () => empModal.classList.add('hidden'))
  empModal.querySelector('.modal-backdrop').addEventListener('click',   () => empModal.classList.add('hidden'))

  container.querySelector('#btn-save-emp').addEventListener('click', () => {
    const fn = container.querySelector('#ef-first').value.trim()
    const ln = container.querySelector('#ef-last').value.trim()
    if (!fn || !ln) { alert('First and last name are required.'); return }
    const editId = container.querySelector('#ef-emp-id')?.value
    const data = {
      location_id: locationId,
      first_name:  fn,
      last_name:   ln,
      dob:         container.querySelector('#ef-dob').value   || null,
      hire_date:   container.querySelector('#ef-hire').value  || null,
      job_title:   container.querySelector('#ef-title').value.trim() || null,
      status:      container.querySelector('#ef-status').value
    }
    if (editId) updateEmployee(Number(editId), data)
    else        createEmployee(data)
    empModal.classList.add('hidden')
    redraw(container, state, navigate, locationId)
  })
}

// ---------------------------------------------------------------------------
// Tab rendering
// ---------------------------------------------------------------------------

function renderTab(tab, employees, recentTests, stsFlags, hpdInv) {
  if (tab === 'employees') return renderEmployeesTab(employees, stsFlags)
  if (tab === 'tests')     return renderTestsTab(recentTests)
  if (tab === 'hpd')       return renderHPDTab(hpdInv)
  return ''
}

function renderEmployeesTab(employees, stsFlags) {
  const stsFlagIds = new Set(stsFlags.map(f => f.employee_id))
  return `
    <div class="tab-toolbar">
      <button class="btn btn-primary btn-sm" id="btn-add-emp">+ Add Employee</button>
    </div>
    ${employees.length === 0
      ? '<p class="empty-note">No employees on file.</p>'
      : `<table class="data-table">
          <thead><tr>
            <th>Name</th><th>Job Title</th><th>Last Test</th><th>Classification</th><th></th>
          </tr></thead>
          <tbody>
            ${employees.map(e => `
              <tr class="table-row table-row--clickable" data-emp-id="${e.employee_id}">
                <td class="td-primary">
                  ${esc(e.last_name)}, ${esc(e.first_name)}
                  ${stsFlagIds.has(e.employee_id) ? '<span class="sts-chip">STS</span>' : ''}
                </td>
                <td class="td-muted">${esc(e.job_title ?? '—')}</td>
                <td>${e.last_test_date ?? '—'}</td>
                <td>${classificationBadge(parseClassification(e.last_classification)?.category)}</td>
                <td><button class="btn btn-sm btn-ghost" data-edit-emp="${e.employee_id}">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
    }
  `
}

function renderTestsTab(tests) {
  return tests.length === 0
    ? '<p class="empty-note">No test history.</p>'
    : `<table class="data-table">
        <thead><tr>
          <th>Date</th><th>Employee</th><th>Type</th><th>Classification</th><th>HPD</th><th></th>
        </tr></thead>
        <tbody>
          ${tests.map(t => {
            const cls = parseClassification(t.classification)
            return `<tr>
              <td>${t.test_date}</td>
              <td>${esc(t.last_name)}, ${esc(t.first_name)}</td>
              <td>${esc(t.test_type)}</td>
              <td>${cls ? classificationBadge(cls.category) : '—'}</td>
              <td>${t.adequacy ? adequacyBadge(t.adequacy) : '—'}</td>
              <td>
                <button class="btn btn-link btn-sm btn-view-emp" data-emp-id="${t.employee_id}">
                  View →
                </button>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>`
}

function renderHPDTab(inventory) {
  return `
    <div class="tab-toolbar">
      <button class="btn btn-primary btn-sm" id="btn-add-hpd">+ Add HPD</button>
    </div>
    ${inventory.length === 0
      ? '<p class="empty-note">No HPD inventory on file.</p>'
      : `<table class="data-table">
          <thead><tr><th>Make / Model</th><th>Type</th><th>Rated NRR</th><th></th></tr></thead>
          <tbody>
            ${inventory.map((h, i) => `
              <tr>
                <td>${esc(h.make_model)}</td>
                <td>${esc(h.type ?? '—')}</td>
                <td>${h.nrr} dB</td>
                <td><button class="btn btn-sm btn-ghost" data-remove-hpd="${i}">Remove</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
    }
    <div id="hpd-add-form" class="inline-form hidden">
      <input id="hpd-model" type="text" placeholder="Make / Model" />
      <input id="hpd-nrr"   type="number" min="0" max="40" placeholder="NRR" style="width:80px" />
      <select id="hpd-type">
        <option value="Earplug">Earplug</option>
        <option value="Earmuff">Earmuff</option>
      </select>
      <button class="btn btn-primary btn-sm" id="btn-save-hpd">Add</button>
      <button class="btn btn-ghost btn-sm"   id="btn-cancel-hpd">Cancel</button>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Tab event wiring
// ---------------------------------------------------------------------------

function wireTabHandlers(container, locationId, location, employees, hpdInv, navigate) {
  // Add employee
  container.querySelector('#btn-add-emp')?.addEventListener('click', () => {
    container.querySelector('#emp-modal-title').textContent = 'Add Employee'
    container.querySelector('#emp-modal-body').innerHTML = employeeForm()
    container.querySelector('#btn-delete-emp').classList.add('hidden')
    container.querySelector('#modal-emp').classList.remove('hidden')
  })

  // Edit employee
  container.querySelectorAll('[data-edit-emp]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const emp = employees.find(em => String(em.employee_id) === btn.dataset.editEmp)
      if (!emp) return
      container.querySelector('#emp-modal-title').textContent = 'Edit Employee'
      container.querySelector('#emp-modal-body').innerHTML = employeeForm(emp)
      container.querySelector('#btn-delete-emp').classList.remove('hidden')
      container.querySelector('#modal-emp').classList.remove('hidden')
    })
  })

  // Delete employee
  container.querySelector('#btn-delete-emp')?.addEventListener('click', () => {
    const editId = container.querySelector('#ef-emp-id')?.value
    if (!editId) return
    const emp = employees.find(em => String(em.employee_id) === editId)
    if (!emp) return
    if (!confirm(`Permanently delete ${emp.first_name} ${emp.last_name}? Historical tests will remain on file.`)) return
    deleteEmployee(Number(editId))
    container.querySelector('#modal-emp').classList.add('hidden')
    navigate('location-detail', { currentLocation: { location_id: locationId } })
  })

  // Employee row → employee detail
  container.querySelectorAll('.table-row--clickable[data-emp-id]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return
      const empId = Number(row.dataset.empId)
      const emp   = employees.find(em => em.employee_id === empId)
      if (!emp) return
      navigate('employee-detail', { currentEmployee: emp })
    })
  })

  // Test history view buttons
  container.querySelectorAll('.btn-view-emp').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = Number(btn.dataset.empId)
      const emp   = employees.find(em => em.employee_id === empId)
      if (emp) navigate('employee-detail', { currentEmployee: emp })
    })
  })

  // HPD inventory
  container.querySelector('#btn-add-hpd')?.addEventListener('click', () => {
    container.querySelector('#hpd-add-form').classList.remove('hidden')
  })
  container.querySelector('#btn-cancel-hpd')?.addEventListener('click', () => {
    container.querySelector('#hpd-add-form').classList.add('hidden')
  })
  container.querySelector('#btn-save-hpd')?.addEventListener('click', () => {
    const model = container.querySelector('#hpd-model').value.trim()
    const nrr   = parseFloat(container.querySelector('#hpd-nrr').value)
    const type  = container.querySelector('#hpd-type').value
    if (!model || isNaN(nrr)) { alert('Model and NRR are required.'); return }
    hpdInv.push({ make_model: model, nrr, type })
    saveHPDInventory(locationId, hpdInv)
    navigate('location-detail', { currentLocation: location, params: { tab: 'hpd' } })
  })
  container.querySelectorAll('[data-remove-hpd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeHpd)
      hpdInv.splice(idx, 1)
      saveHPDInventory(locationId, hpdInv)
      navigate('location-detail', { currentLocation: location, params: { tab: 'hpd' } })
    })
  })
}

// ---------------------------------------------------------------------------
// Edit location modal
// ---------------------------------------------------------------------------

function openEditLocation(container, location, locationId, navigate) {
  container.querySelector('#modal-edit-loc')?.remove()

  const PROVS = [
    ['AB','Alberta'], ['BC','British Columbia'], ['SK','Saskatchewan'],
    ['MB','Manitoba'], ['ON','Ontario']
  ]

  const div = document.createElement('div')
  div.id        = 'modal-edit-loc'
  div.className = 'modal'
  div.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h2>Edit Location</h2>
        <button class="modal-close" id="loc-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Location Name *</label>
            <input id="lc-name" type="text" value="${esc(location.name ?? '')}" />
          </div>
          <div class="form-group">
            <label>Province *</label>
            <select id="lc-province">
              <option value="">— select —</option>
              ${PROVS.map(([c,l]) => `<option value="${c}" ${location.province === c ? 'selected' : ''}>${c} — ${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Classification Unit (CU) Code</label>
            <input id="lc-cu-code" type="text" value="${esc(location.cu_code ?? '')}" />
          </div>
          <div class="form-group">
            <label>City</label>
            <input id="lc-city" type="text" value="${esc(location.city ?? '')}" />
          </div>
          <div class="form-group">
            <label>Address</label>
            <input id="lc-address" type="text" value="${esc(location.address ?? '')}" />
          </div>
          <div class="form-group">
            <label>Postal Code</label>
            <input id="lc-postal" type="text" value="${esc(location.postal_code ?? '')}" />
          </div>
          <div class="form-group">
            <label>Contact Name</label>
            <input id="lc-contact-name" type="text" value="${esc(location.contact_name ?? '')}" />
          </div>
          <div class="form-group">
            <label>Contact Phone</label>
            <input id="lc-contact-phone" type="tel" value="${esc(location.contact_phone ?? '')}" />
          </div>
          <div class="form-group">
            <label>Contact Email</label>
            <input id="lc-contact-email" type="email" value="${esc(location.contact_email ?? '')}" />
          </div>
          <div class="form-group span-2">
            <label>Sticky Notes <span class="label-hint">(travel with packet to tech)</span></label>
            <textarea id="lc-sticky" rows="2">${esc(location.sticky_notes ?? '')}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-ghost" id="loc-deactivate" style="color:var(--red);margin-right:auto">
          Deactivate Location
        </button>
        <button class="btn btn-ghost"   id="loc-cancel">Cancel</button>
        <button class="btn btn-primary" id="loc-save">Save Changes</button>
      </div>
    </div>
  `
  container.appendChild(div)

  const close = () => div.remove()
  div.querySelector('#loc-close').addEventListener('click',   close)
  div.querySelector('#loc-cancel').addEventListener('click',  close)
  div.querySelector('.modal-backdrop').addEventListener('click', close)

  div.querySelector('#loc-deactivate').addEventListener('click', () => {
    if (!confirm(`Deactivate "${location.name}"? It will be hidden from the locations list.`)) return
    deactivateLocation(locationId)
    close()
    navigate('company-detail', { currentCompany: { company_id: location.company_id } })
  })

  div.querySelector('#loc-save').addEventListener('click', () => {
    const name     = div.querySelector('#lc-name').value.trim()
    const province = div.querySelector('#lc-province').value
    if (!name)     { alert('Location name is required.'); return }
    if (!province) { alert('Province is required.'); return }
    updateLocation(locationId, {
      name,
      province,
      city:          div.querySelector('#lc-city').value.trim()          || null,
      address:       div.querySelector('#lc-address').value.trim()       || null,
      postal_code:   div.querySelector('#lc-postal').value.trim()        || null,
      contact_name:  div.querySelector('#lc-contact-name').value.trim()  || null,
      contact_phone: div.querySelector('#lc-contact-phone').value.trim() || null,
      contact_email: div.querySelector('#lc-contact-email').value.trim() || null,
      cu_code:       div.querySelector('#lc-cu-code').value.trim()       || null,
      sticky_notes:  div.querySelector('#lc-sticky').value.trim()        || null
    })
    close()
    navigate('location-detail', { currentLocation: { location_id: locationId } })
  })
}

// ---------------------------------------------------------------------------
// Forms / helpers
// ---------------------------------------------------------------------------

function employeeForm(e = {}) {
  return `
    <input type="hidden" id="ef-emp-id" value="${e.employee_id ?? ''}" />
    <div class="form-grid">
      <div class="form-group">
        <label>First Name *</label>
        <input id="ef-first" type="text" value="${esc(e.first_name ?? '')}" />
      </div>
      <div class="form-group">
        <label>Last Name *</label>
        <input id="ef-last" type="text" value="${esc(e.last_name ?? '')}" />
      </div>
      <div class="form-group">
        <label>Date of Birth</label>
        <input id="ef-dob" type="date" value="${e.dob ?? ''}" />
      </div>
      <div class="form-group">
        <label>Hire Date</label>
        <input id="ef-hire" type="date" value="${e.hire_date ?? ''}" />
      </div>
      <div class="form-group">
        <label>Job Title</label>
        <input id="ef-title" type="text" value="${esc(e.job_title ?? '')}" />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="ef-status">
          <option value="active"   ${(!e.status || e.status === 'active')   ? 'selected' : ''}>Active</option>
          <option value="inactive" ${e.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    </div>
  `
}

function classificationBadge(cat) {
  if (!cat) return '—'
  const cls = { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }[cat] ?? 'n'
  const lbl = { N: 'Normal', EW: 'Early Warning', A: 'Abnormal', NC: 'Normal Change', EWC: 'EW Change', AC: 'Abn Change' }[cat] ?? cat
  return `<span class="class-badge class-${cls}">${lbl}</span>`
}

function adequacyBadge(a) {
  const m = { Adequate: 'adequate', Marginal: 'marginal', Inadequate: 'inadequate' }
  return `<span class="class-badge class-${m[a] ?? ''}">${a}</span>`
}

function parseClassification(val) {
  if (!val) return null
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
