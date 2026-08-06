/**
 * masterdb2/screens/companies.js — searchable list of active companies
 * Search matches company name OR location name/city.
 * Results show matching locations grouped under each company.
 */

import { query, run, scalar, save } from '../db/db.js'

export function mount(container, { navigate, session }) {
  let _showForm  = false
  let _status    = null

  render()

  function render() {
    container.innerHTML = `
      <div class="screen-header-row">
        <h1>Companies</h1>
        <input class="search-input" id="co-search" type="search"
               placeholder="Search by company name or city…" autocomplete="off">
        <button class="btn btn-secondary btn-sm" id="new-co-btn"
                style="flex-shrink:0">+ New Company</button>
      </div>
      <div class="screen-body">
        ${_status ? statusBanner(_status) : ''}
        <div id="co-form-wrap"></div>
        <div id="co-table-wrap"></div>
      </div>
    `

    const searchEl = container.querySelector('#co-search')
    const formWrap = container.querySelector('#co-form-wrap')
    const tableWrap = container.querySelector('#co-table-wrap')

    if (_showForm) {
      formWrap.innerHTML = companyForm(null)
      formWrap.querySelector('#cof-save')?.addEventListener('click', () => saveCompany(null))
      formWrap.querySelector('#cof-cancel')?.addEventListener('click', () => {
        _showForm = false; _status = null; render()
      })
    }

    container.querySelector('#new-co-btn').addEventListener('click', () => {
      _showForm = !_showForm; _status = null; render()
    })

    function doLoad(q) { loadTable(tableWrap, q, navigate) }

    let debounce = null
    searchEl.addEventListener('input', () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => doLoad(searchEl.value.trim()), 150)
    })
    doLoad('')

    async function saveCompany() {
      const errEl  = formWrap.querySelector('#cof-err')
      const name   = formWrap.querySelector('#cof-name')?.value.trim()
      const city   = formWrap.querySelector('#cof-city')?.value.trim()
      const addr   = formWrap.querySelector('#cof-addr')?.value.trim()
      const cname  = formWrap.querySelector('#cof-cname')?.value.trim()
      const phone  = formWrap.querySelector('#cof-phone')?.value.trim()
      const email  = formWrap.querySelector('#cof-email')?.value.trim()

      if (!name) { if (errEl) errEl.textContent = 'Company name is required.'; return }

      try {
        run(
          `INSERT INTO companies (name, city, address, contact_name, contact_phone, contact_email, active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [name, city || null, addr || null, cname || null, phone || null, email || null]
        )
        const newId = scalar('SELECT last_insert_rowid()')
        await save(session?.writerName ?? 'admin')
        _showForm = false
        _status = { ok: true, message: `Company "${name}" created.` }
        render()
        navigate('company', { companyId: newId })
      } catch (e) {
        if (errEl) errEl.textContent = `Save failed: ${e.message}`
      }
    }
  }
}

function loadTable(wrap, q, navigate) {
  const like = `%${q}%`
  let companies, locMatches

  try {
    companies = query(
      `SELECT c.company_id, c.name, c.city,
              COUNT(DISTINCT l.location_id) AS location_count,
              COUNT(DISTINCT CASE WHEN e.status='active' AND e.deleted_at IS NULL
                             THEN e.employee_id END) AS worker_count,
              MAX(t.test_date) AS last_test_date
       FROM companies c
       LEFT JOIN locations l ON l.company_id = c.company_id AND l.active = 1
       LEFT JOIN employees e ON e.current_location_id = l.location_id
       LEFT JOIN tests    t ON t.location_id = l.location_id AND t.deleted_at IS NULL
       WHERE c.active = 1 AND c.deleted_at IS NULL
         AND (LOWER(c.name) LIKE LOWER(?)
              OR EXISTS (
                SELECT 1 FROM locations lx
                WHERE lx.company_id = c.company_id AND lx.active = 1
                  AND (LOWER(lx.name) LIKE LOWER(?) OR LOWER(lx.city) LIKE LOWER(?))
              ))
       GROUP BY c.company_id, c.name, c.city
       ORDER BY c.name`,
      [like, like, like]
    )

    if (q) {
      locMatches = query(
        `SELECT location_id, company_id, name AS loc_name, city, province
         FROM locations
         WHERE active = 1 AND deleted_at IS NULL
           AND (LOWER(name) LIKE LOWER(?) OR LOWER(city) LIKE LOWER(?))
         ORDER BY name`,
        [like, like]
      )
    }
  } catch (e) {
    wrap.innerHTML = `<div class="error-banner"><strong>Error:</strong> ${esc(e.message)}</div>`
    return
  }

  if (!companies.length) {
    wrap.innerHTML = `<div class="table-card"><div class="table-empty">${q ? 'No companies match that search.' : 'No companies found.'}</div></div>`
    return
  }

  // Group location matches by company
  const locByCompany = {}
  if (locMatches) {
    for (const l of locMatches) {
      ;(locByCompany[l.company_id] ??= []).push(l)
    }
  }

  const isCitySearch = q && Object.keys(locByCompany).length > 0

  const rowsHTML = companies.map(c => {
    const locs = locByCompany[c.company_id]

    if (isCitySearch && locs?.length) {
      // Company row with matching location sub-rows
      return `
        <tr class="clickable" data-id="${c.company_id}">
          <td>
            <strong>${esc(c.name)}</strong>
            <div style="margin-top:0.25rem">
              ${locs.map(l =>
                `<span class="badge badge-gray" style="margin-right:0.25rem;margin-top:0.2rem;display:inline-block">
                  ${esc(l.loc_name)}${l.city ? ` — ${esc(l.city)}` : ''}${l.province ? `, ${esc(l.province)}` : ''}
                </span>`
              ).join('')}
            </div>
          </td>
          <td style="text-align:right">${c.worker_count}</td>
          <td>${c.last_test_date ? fmtDate(c.last_test_date) : '<span style="color:var(--clr-subtle)">—</span>'}</td>
        </tr>
      `
    }

    return `
      <tr class="clickable" data-id="${c.company_id}">
        <td><strong>${esc(c.name)}</strong>${c.city ? `<br><span style="color:var(--clr-subtle);font-size:0.8rem">${esc(c.city)}</span>` : ''}</td>
        <td style="text-align:right">${c.location_count}</td>
        <td style="text-align:right">${c.worker_count}</td>
        <td>${c.last_test_date ? fmtDate(c.last_test_date) : '<span style="color:var(--clr-subtle)">—</span>'}</td>
      </tr>
    `
  }).join('')

  const thead = isCitySearch
    ? `<tr><th>Company / Matching Locations</th><th style="text-align:right">Workers</th><th>Last Test</th></tr>`
    : `<tr><th>Company</th><th style="text-align:right">Locations</th><th style="text-align:right">Workers</th><th>Last Test</th></tr>`

  wrap.innerHTML = `
    <p style="font-size:0.8rem;color:var(--clr-subtle);margin-bottom:0.75rem">
      ${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}
    </p>
    <div class="table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>${thead}</thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    </div>
  `

  wrap.querySelectorAll('tr.clickable').forEach(tr =>
    tr.addEventListener('click', () => navigate('company', { companyId: Number(tr.dataset.id) }))
  )
}

function companyForm(co) {
  return `
    <div class="info-card" style="margin-bottom:1.5rem">
      <h3 style="margin-bottom:0.75rem;font-size:0.9375rem">${co ? 'Edit Company' : 'New Company'}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div style="grid-column:1/-1">
          <label class="field-label">Company Name *</label>
          <input class="search-input" id="cof-name" value="${esc(co?.name ?? '')}" placeholder="Acme Manufacturing Ltd.">
        </div>
        <div>
          <label class="field-label">City</label>
          <input class="search-input" id="cof-city" value="${esc(co?.city ?? '')}" placeholder="Saskatoon">
        </div>
        <div>
          <label class="field-label">Address</label>
          <input class="search-input" id="cof-addr" value="${esc(co?.address ?? '')}" placeholder="123 Main St">
        </div>
        <div>
          <label class="field-label">Contact Name</label>
          <input class="search-input" id="cof-cname" value="${esc(co?.contact_name ?? '')}" placeholder="Jane Smith">
        </div>
        <div>
          <label class="field-label">Contact Phone</label>
          <input class="search-input" id="cof-phone" value="${esc(co?.contact_phone ?? '')}" placeholder="306-555-0100">
        </div>
        <div>
          <label class="field-label">Contact Email</label>
          <input class="search-input" id="cof-email" value="${esc(co?.contact_email ?? '')}" placeholder="contact@company.com">
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="cof-save">Save</button>
        <button class="btn btn-secondary" id="cof-cancel">Cancel</button>
        <span id="cof-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    </div>
  `
}

function statusBanner({ ok, message }) {
  return ok
    ? `<div class="success-banner" style="margin-bottom:1rem">${esc(message)}</div>`
    : `<div class="error-banner" style="margin-bottom:1rem">${esc(message)}</div>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
