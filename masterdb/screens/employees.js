import { getFilteredEmployees } from '../db/employees.js'
import { query } from '../db/sqlite.js'

export function renderEmployees(container, state, navigate) {
  // 1. Initial State for filtering
  state.empFilters = state.empFilters || {
    search: '',
    province: '',
    company_id: '',
    location_id: '',
    page: 0,
    limit: 100
  };

  // 2. Fetch data for dropdowns
  const companies = query("SELECT company_id, name FROM companies WHERE active = 1 ORDER BY name ASC");
  let locations = [];
  if (state.empFilters.company_id) {
    locations = query("SELECT location_id, name FROM locations WHERE company_id = ? ORDER BY name ASC", [state.empFilters.company_id]);
  }

  const render = () => {
    const offset = state.empFilters.page * state.empFilters.limit;
    const { results, totalCount } = getFilteredEmployees({ ...state.empFilters, offset });

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>Employees</h1>
          <span class="count-chip">${totalCount} total</span>
        </div>

        <!-- FILTER BAR -->
        <div class="toolbar" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: var(--shadow-sm);">
          <input id="f-search" type="search" class="search-input" placeholder="Search by name..." value="${esc(state.empFilters.search)}">
          
          <select id="f-province" class="search-input">
            <option value="">All Provinces</option>
            <option value="AB" ${state.empFilters.province === 'AB' ? 'selected' : ''}>Alberta</option>
            <option value="BC" ${state.empFilters.province === 'BC' ? 'selected' : ''}>BC</option>
            <option value="SK" ${state.empFilters.province === 'SK' ? 'selected' : ''}>Saskatchewan</option>
          </select>

          <select id="f-company" class="search-input">
            <option value="">All Companies</option>
            ${companies.map(c => `<option value="${c.company_id}" ${state.empFilters.company_id == c.company_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>

          <select id="f-location" class="search-input" ${!state.empFilters.company_id ? 'disabled' : ''}>
            <option value="">All Locations</option>
            ${locations.map(l => `<option value="${l.location_id}" ${state.empFilters.location_id == l.location_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
          </select>
        </div>

        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Location</th>
                <th>Province</th>
                <th>Job Title</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${results.map(e => `
                <tr class="table-row" data-id="${e.employee_id}">
                  <td><strong>${esc(e.last_name)}, ${esc(e.first_name)}</strong></td>
                  <td class="td-muted" style="font-size:12px;">${esc(e.company_name)}</td>
                  <td class="td-muted" style="font-size:12px;">${esc(e.location_name)}</td>
                  <td><span class="province-badge">${e.province}</span></td>
                  <td>${esc(e.job_title || '—')}</td>
                  <td style="text-align:right;"><button class="btn btn-sm btn-outline">Open</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- PAGINATION -->
        <div style="display:flex; justify-content: space-between; align-items: center; margin-top: 20px; padding: 10px;">
          <div style="font-size: 13px; color: #666;">
            Showing ${offset + 1} - ${Math.min(offset + state.empFilters.limit, totalCount)} of ${totalCount}
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-sm btn-outline" id="btn-prev" ${state.empFilters.page === 0 ? 'disabled' : ''}>« Previous</button>
            <button class="btn btn-sm btn-outline" id="btn-next" ${(offset + state.empFilters.limit) >= totalCount ? 'disabled' : ''}>Next »</button>
          </div>
        </div>
      </div>
    `;

    attachHandlers();
  };

  const attachHandlers = () => {
    const update = (key, val) => {
        state.empFilters[key] = val;
        state.empFilters.page = 0; // Reset to page 1 on filter change
        render();
    };

    container.querySelector('#f-search').oninput = (e) => {
        // Debounce search to avoid lag
        clearTimeout(window.searchTimer);
        window.searchTimer = setTimeout(() => update('search', e.target.value.trim()), 300);
    };

    container.querySelector('#f-province').onchange = (e) => update('province', e.target.value);
    
    container.querySelector('#f-company').onchange = (e) => {
        state.empFilters.location_id = ''; // Clear location if company changes
        update('company_id', e.target.value);
    };

    container.querySelector('#f-location').onchange = (e) => update('location_id', e.target.value);

    container.querySelector('#btn-prev').onclick = () => { state.empFilters.page--; render(); };
    container.querySelector('#btn-next').onclick = () => { state.empFilters.page++; render(); };

    container.querySelectorAll('.table-row').forEach(row => {
        row.onclick = () => navigate('employee-detail', { id: row.dataset.id });
    });
  };

  render();
}

function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }