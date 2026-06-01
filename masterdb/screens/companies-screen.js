import { getAllCompanies, searchCompanies, createCompany } from '../db/companies.js'

export function renderCompanies(container, state, navigate) {
  // 1. Initialize Sort State if it doesn't exist
  state.companiesSort = state.companiesSort || { key: 'name', order: 'asc' };

  let companies = getAllCompanies();

  const render = () => {
    // 2. Sort the data before rendering
    const sortedCompanies = sortData(companies, state.companiesSort.key, state.companiesSort.order);

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
                <th class="sortable" data-key="name">Company Name ${getSortIcon('name', state.companiesSort)}</th>
                <th class="sortable" data-key="province_list">Province ${getSortIcon('province_list', state.companiesSort)}</th>
                <th class="sortable" data-key="employee_count">Employees ${getSortIcon('employee_count', state.companiesSort)}</th>
                <th class="sortable" data-key="last_test_date">Last Visit ${getSortIcon('last_test_date', state.companiesSort)}</th>
                <th>Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="companies-tbody">
              ${renderRows(sortedCompanies)}
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
    `;

    attachHandlers();
  };

  const attachHandlers = () => {
    // Search logic
    container.querySelector('#company-search').addEventListener('input', e => {
      const q = e.target.value.trim();
      companies = q ? searchCompanies(q) : getAllCompanies();
      // Re-render to apply current sort to search results
      render(); 
    });

    // Header Sort logic
    container.querySelectorAll('th.sortable').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        // Toggle order if same key, otherwise default to asc
        if (state.companiesSort.key === key) {
            state.companiesSort.order = state.companiesSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            state.companiesSort.key = key;
            state.companiesSort.order = 'asc';
        }
        render();
      });
    });

    attachRowHandlers(container, navigate);

    // Modal logic
    const modal = container.querySelector('#modal-add');
    container.querySelector('#btn-add-company').onclick = () => modal.classList.remove('hidden');
    container.querySelector('#modal-close-add').onclick = () => modal.classList.add('hidden');
    container.querySelector('#btn-cancel-add').onclick = () => modal.classList.add('hidden');

    container.querySelector('#btn-save-add').onclick = () => {
      const name = container.querySelector('#f-name').value.trim();
      const province = container.querySelector('#f-province').value;
      if (!name || !province) return alert('Name and Province required.');

      const id = createCompany({
        name,
        province,
        address: container.querySelector('#f-address').value.trim() || null,
        contact_name: container.querySelector('#f-contact-name').value.trim() || null,
        contact_phone: container.querySelector('#f-contact-phone').value.trim() || null,
        contact_email: container.querySelector('#f-contact-email').value.trim() || null,
        sticky_notes: container.querySelector('#f-sticky').value.trim() || null
      });

      navigate('company-detail', { currentCompany: { company_id: id } });
    };
  };

  render();
}

// --- HELPERS ---

function sortData(data, key, order) {
  return [...data].sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    // Handle nulls
    if (valA === null || valA === undefined) valA = '';
    if (valB === null || valB === undefined) valB = '';

    // Numeric comparison
    if (typeof valA === 'number' && typeof valB === 'number') {
      return order === 'asc' ? valA - valB : valB - valA;
    }

    // String/Date comparison
    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

function getSortIcon(key, sortState) {
    if (sortState.key !== key) return '<span style="color:#ccc; font-size:10px;">↕</span>';
    return sortState.order === 'asc' ? '▲' : '▼';
}

function renderRows(companies) {
  if (companies.length === 0) return '<tr><td colspan="6" class="empty-cell">No companies found.</td></tr>';
  return companies.map(c => {
    const provinceDisplay = c.province_list ? c.province_list.split(',').join(', ') : '—';
    return `
      <tr class="table-row" data-company-id="${c.company_id}">
        <td class="td-primary">${esc(c.name)}</td>
        <td><span class="province-badge">${esc(provinceDisplay)}</span></td>
        <td>${c.employee_count ?? 0}</td>
        <td>${c.last_test_date ?? '—'}</td>
        <td class="td-muted">${esc(c.contact_name ?? '—')}</td>
        <td><button class="btn btn-sm btn-outline" data-company-id="${c.company_id}">Open →</button></td>
      </tr>
    `;
  }).join('');
}

function attachRowHandlers(container, navigate) {
  container.querySelectorAll('.table-row, .btn[data-company-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.companyId;
      if (id) navigate('company-detail', { currentCompany: { company_id: Number(id) } });
    });
  });
}

function companyForm(data = {}) {
  const provinces = [['AB', 'Alberta'], ['BC', 'British Columbia'], ['SK', 'Saskatchewan']];
  return `
    <div class="form-grid">
      <div class="form-group span-2"><label>Company Name *</label><input id="f-name" type="text" value="${esc(data.name ?? '')}" /></div>
      <div class="form-group">
        <label>Province *</label>
        <select id="f-province">
          <option value="">— select —</option>
          ${provinces.map(([code, label]) => `<option value="${code}" ${data.province === code ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Contact Name</label><input id="f-contact-name" type="text" value="${esc(data.contact_name ?? '')}" /></div>
      <div class="form-group"><label>Contact Phone</label><input id="f-contact-phone" type="tel" value="${esc(data.contact_phone ?? '')}" /></div>
      <div class="form-group"><label>Contact Email</label><input id="f-contact-email" type="email" value="${esc(data.contact_email ?? '')}" /></div>
      <div class="form-group span-2"><label>Address</label><input id="f-address" type="text" value="${esc(data.address ?? '')}" /></div>
      <div class="form-group span-2"><label>Sticky Notes</label><textarea id="f-sticky" rows="3">${esc(data.sticky_notes ?? '')}</textarea></div>
    </div>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}