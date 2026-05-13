import { searchEmployees } from '../db/employees.js'
import { query }           from '../db/sqlite.js'

export function renderEmployees(container, state, navigate) {
  const filter = state.params?.filter ?? ''

  const ALL_EMPLOYEES_SQL = `
    SELECT e.*,
      l.name AS location_name, l.province,
      c.name AS company_name,
      (SELECT t.classification FROM tests t WHERE t.employee_id = e.employee_id ORDER BY t.test_date DESC LIMIT 1) AS last_classification,
      (SELECT t.test_date     FROM tests t WHERE t.employee_id = e.employee_id ORDER BY t.test_date DESC LIMIT 1) AS last_test_date
    FROM employees e
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id  = l.company_id
    WHERE e.status = 'active' AND l.active = 1
    ORDER BY e.last_name, e.first_name
  `

  let currentFilter = filter
  let currentSearch = ''
  let sortCol       = 'last_name'
  let sortDir       = 1

  function getDisplayed() {
    let base = currentSearch.length >= 2
      ? searchEmployees(currentSearch)
      : query(ALL_EMPLOYEES_SQL)

    if (currentFilter) {
      base = base.filter(e => {
        const cat = parseClassification(e.last_classification)?.category
        if (currentFilter === 'EW') return cat === 'EW' || cat === 'EWC'
        if (currentFilter === 'A')  return cat === 'A'  || cat === 'AC'
        if (currentFilter === 'N')  return cat === 'N'  || cat === 'NC'
        return cat === currentFilter
      })
    }

    base.sort((a, b) => {
      let va = a[sortCol] ?? ''
      let vb = b[sortCol] ?? ''
      if (sortCol === 'name') {
        va = `${a.last_name}, ${a.first_name}`.toLowerCase()
        vb = `${b.last_name}, ${b.first_name}`.toLowerCase()
      } else {
        if (typeof va === 'string') va = va.toLowerCase()
        if (typeof vb === 'string') vb = vb.toLowerCase()
      }
      if (va < vb) return -1 * sortDir
      if (va > vb) return  1 * sortDir
      return 0
    })

    return base
  }

  function refresh() {
    const displayed = getDisplayed()
    const tbody = container.querySelector('#emp-tbody')
    if (tbody) tbody.innerHTML = renderRows(displayed)
    const count = container.querySelector('#result-count')
    if (count) count.textContent = `${displayed.length} employee${displayed.length !== 1 ? 's' : ''}`
    attachRowHandlers(container, navigate)
  }

  const initialDisplayed = getDisplayed()

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Employees</h1>
        <div class="header-actions">
          <select id="filter-cat" class="select-sm">
            <option value="">All classifications</option>
            <option value="A"  ${currentFilter === 'A'  ? 'selected' : ''}>Abnormal / AC</option>
            <option value="EW" ${currentFilter === 'EW' ? 'selected' : ''}>Early Warning</option>
            <option value="N"  ${currentFilter === 'N'  ? 'selected' : ''}>Normal / NC</option>
          </select>
        </div>
      </div>

      <div class="toolbar">
        <input id="emp-search" type="search" class="search-input" placeholder="Search by name, company, or location…" />
        <span class="result-count" id="result-count">${initialDisplayed.length} employee${initialDisplayed.length !== 1 ? 's' : ''}</span>
      </div>

      <table class="data-table">
        <thead id="emp-thead">
          <tr>
            <th data-col="name"          class="sortable">Name</th>
            <th data-col="company_name"  class="sortable">Company</th>
            <th data-col="location_name" class="sortable">Location</th>
            <th data-col="province"      class="sortable">Province</th>
            <th data-col="last_test_date" class="sortable">Last Test</th>
            <th>Classification</th>
          </tr>
        </thead>
        <tbody id="emp-tbody">
          ${renderRows(initialDisplayed)}
        </tbody>
      </table>
    </div>
  `

  const HEADERS = {
    name:          'Name',
    company_name:  'Company',
    location_name: 'Location',
    province:      'Province',
    last_test_date:'Last Test'
  }

  container.querySelector('#emp-thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]')
    if (!th) return
    const col = th.dataset.col
    sortDir = (sortCol === col) ? sortDir * -1 : 1
    sortCol = col
    container.querySelectorAll('th[data-col]').forEach(t => {
      t.textContent = `${HEADERS[t.dataset.col]} ${sortCol === t.dataset.col ? (sortDir === 1 ? '↑' : '↓') : ''}`
    })
    refresh()
  })

  container.querySelector('#filter-cat').addEventListener('change', e => {
    currentFilter = e.target.value
    refresh()
  })

  container.querySelector('#emp-search').addEventListener('input', e => {
    currentSearch = e.target.value.trim()
    refresh()
  })

  attachRowHandlers(container, navigate)
}

function renderRows(employees) {
  if (employees.length === 0) {
    return '<tr><td colspan="6" class="empty-cell">No employees found.</td></tr>'
  }
  return employees.map(e => {
    const cls = parseClassification(e.last_classification)?.category
    return `
      <tr class="table-row" data-emp-id="${e.employee_id}" data-location-id="${e.location_id}">
        <td class="td-primary">${esc(e.last_name)}, ${esc(e.first_name)}</td>
        <td>${esc(e.company_name)}</td>
        <td>${esc(e.location_name)}</td>
        <td><span class="province-badge">${esc(e.province)}</span></td>
        <td>${e.last_test_date ?? '—'}</td>
        <td>${cls ? classBadge(cls) : '—'}</td>
      </tr>
    `
  }).join('')
}

function attachRowHandlers(container, navigate) {
  container.querySelectorAll('.table-row[data-emp-id]').forEach(row => {
    row.addEventListener('click', () =>
      navigate('employee-detail', { currentEmployee: { employee_id: Number(row.dataset.empId) } })
    )
  })
}

function classBadge(cat) {
  const m = { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }
  const l = { N: 'Normal', EW: 'Early Warning', A: 'Abnormal', NC: 'No Change', EWC: 'EW Change', AC: 'Abn Change' }
  return `<span class="class-badge class-${m[cat] ?? ''}">${l[cat] ?? cat}</span>`
}

function parseClassification(val) {
  if (!val) return null
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
