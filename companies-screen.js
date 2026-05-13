import { getAllCompanies, searchCompanies, createCompany } from '../db/companies.js'

export function renderCompanies(container, state, navigate) {
  let companies = getAllCompanies()

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Companies</h1>
        <button class="btn btn-primary" id="btn-add-company">+ Add Company</button>
      </div>

      <div class="toolbar">
        <input id="company-search" type="search" class="search-input" placeholder="Search companies…" />
        <span class="result-count" id="result-count">${companies.length} companies</span>
      </div>

      <div class="data-table-wrap">
        <table class="data-table" id="companies-table">
          <thead>
            <tr>
              <th>Company Name</th>
              <th>Locations</th>
              <th>Employees</th>
              <th>Last Visit</th>
              <th>HQ Contact</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="companies-tbody">
            ${renderRows(companies)}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Company modal -->
    <div id="modal-add" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h2>Add Company</h2>
          <button class="modal-close" id="modal-close-add">✕</button>
        </div>
        <div class="modal-body">
          ${companyForm()}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost"   id="btn-cancel-add">Cancel</button>
          <button class="btn btn-primary" id="btn-save-add">Save Company</button>
        </div>
      </div>
    </div>
  `

  // Search
  container.querySelector('#company-search').addEventListener('input', e => {
    const q = e.target.value.trim()
    companies = q ? searchCompanies(q) : getAllCompanies()
    container.querySelector('#companies-tbody').innerHTML = renderRows(companies)
    container.querySelector('#result-count').textContent = `${companies.length} companies`
    attachRowHandlers(container, navigate)
  })

  attachRowHandlers(container, navigate)

  // Add company modal
  const modal = container.querySelector('#modal-add')
  container.querySelector('#btn-add-company').addEventListener('click',  () => modal.classList.remove('hidden'))
  container.querySelector('#modal-close-add').addEventListener('click',  () => modal.classList.add('hidden'))
  container.querySelector('#btn-cancel-add').addEventListener('click',   () => modal.classList.add('hidden'))
  container.querySelector('.modal-backdrop').addEventListener('click',   () => modal.classList.add('hidden'))

  container.querySelector('#btn-save-add').addEventListener('click', () => {
    const name = container.querySelector('#f-name').value.trim()
    if (!name) { alert('Company name is required.'); return }

    const id = createCompany({
      name,
      city:          container.querySelector('#f-city').value.trim()          || null,
      address:       container.querySelector('#f-address').value.trim()       || null,
      contact_name:  container.querySelector('#f-contact-name').value.trim()  || null,
      contact_phone: container.querySelector('#f-contact-phone').value.trim() || null,
      contact_email: container.querySelector('#f-contact-email').value.trim() || null,
      website:       container.querySelector('#f-website').value.trim()       || null,
      sticky_notes:  container.querySelector('#f-sticky').value.trim()        || null
    })

    navigate('company-detail', { currentCompany: { company_id: id } })
  })
}

function renderRows(companies) {
  if (companies.length === 0) {
    return '<tr><td colspan="6" class="empty-cell">No companies found.</td></tr>'
  }
  return companies.map(c => `
    <tr class="table-row" data-company-id="${c.company_id}">
      <td class="td-primary">${esc(c.name)}</td>
      <td>${c.location_count ?? 0}</td>
      <td>${c.employee_count ?? 0}</td>
      <td>${c.last_test_date ?? '—'}</td>
      <td class="td-muted">${esc(c.contact_name ?? '—')}</td>
      <td><button class="btn btn-sm btn-outline" data-company-id="${c.company_id}">Open →</button></td>
    </tr>
  `).join('')
}

function attachRowHandlers(container, navigate) {
  container.querySelectorAll('.table-row, .btn[data-company-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      const id = el.dataset.companyId
      if (id) navigate('company-detail', { currentCompany: { company_id: Number(id) } })
    })
  })
}

function companyForm(data = {}) {
  return `
    <div class="form-grid">
      <div class="form-group span-2">
        <label>Company Name *</label>
        <input id="f-name" type="text" value="${esc(data.name ?? '')}" />
      </div>
      <div class="form-group">
        <label>City <span class="label-hint">(HQ)</span></label>
        <input id="f-city" type="text" value="${esc(data.city ?? '')}" />
      </div>
      <div class="form-group">
        <label>Address <span class="label-hint">(HQ)</span></label>
        <input id="f-address" type="text" value="${esc(data.address ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Name</label>
        <input id="f-contact-name" type="text" value="${esc(data.contact_name ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Phone</label>
        <input id="f-contact-phone" type="tel" value="${esc(data.contact_phone ?? '')}" />
      </div>
      <div class="form-group">
        <label>Contact Email</label>
        <input id="f-contact-email" type="email" value="${esc(data.contact_email ?? '')}" />
      </div>
      <div class="form-group">
        <label>Website</label>
        <input id="f-website" type="text" value="${esc(data.website ?? '')}" placeholder="https://…" />
      </div>
      <div class="form-group span-2">
        <label>Notes</label>
        <textarea id="f-sticky" rows="2">${esc(data.sticky_notes ?? '')}</textarea>
      </div>
    </div>
  `
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
