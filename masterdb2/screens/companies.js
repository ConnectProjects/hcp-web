/**
 * masterdb2/screens/companies.js — searchable list of active companies
 * Search matches company name OR location name/city.
 * Results show matching locations grouped under each company.
 */

import { query, run, scalar, save } from '../db/db.js'
import { parseWsbcZip, previewWsbcImport, commitWsbcImport } from '../db/wsbc-import.js'

export function mount(container, { navigate, session }) {
  let _showForm   = false
  let _status     = null
  let _wsbcState  = null   // null | 'picking' | { parsed, preview } | 'importing' | 'done'

  render()

  function render() {
    container.innerHTML = `
      <div class="screen-header-row">
        <h1>Companies</h1>
        <input class="search-input" id="co-search" type="search"
               placeholder="Search by company name or city…" autocomplete="off">
        <div style="display:flex;gap:0.5rem;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" id="wsbc-import-btn">Import from WSBC</button>
          <button class="btn btn-secondary btn-sm" id="new-co-btn">+ New Company</button>
        </div>
      </div>
      <div class="screen-body">
        ${_status ? statusBanner(_status) : ''}
        <div id="co-wsbc-wrap"></div>
        <div id="co-form-wrap"></div>
        <div id="co-table-wrap"></div>
      </div>
    `

    const searchEl  = container.querySelector('#co-search')
    const formWrap  = container.querySelector('#co-form-wrap')
    const tableWrap = container.querySelector('#co-table-wrap')
    const wsbcWrap  = container.querySelector('#co-wsbc-wrap')

    if (_showForm) {
      formWrap.innerHTML = companyForm(null)
      formWrap.querySelector('#cof-save')?.addEventListener('click', () => saveCompany(null))
      formWrap.querySelector('#cof-cancel')?.addEventListener('click', () => {
        _showForm = false; _status = null; render()
      })
    }

    container.querySelector('#new-co-btn').addEventListener('click', () => {
      _showForm = !_showForm; _wsbcState = null; _status = null; render()
    })

    container.querySelector('#wsbc-import-btn').addEventListener('click', () => {
      _showForm = false; _status = null
      _wsbcState = 'picking'
      renderWsbc(wsbcWrap)
    })

    if (_wsbcState) renderWsbc(wsbcWrap)

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

    // ── WSBC import panel ─────────────────────────────────────────────────────

    function renderWsbc(wrap) {
      if (!_wsbcState) { wrap.innerHTML = ''; return }

      if (_wsbcState === 'picking') {
        wrap.innerHTML = `
          <div class="info-card" style="margin-bottom:1.5rem">
            <h3 style="margin-bottom:0.5rem;font-size:0.9375rem">Import from WSBC</h3>
            <p style="font-size:0.875rem;color:var(--clr-subtle);margin-bottom:0.75rem">
              Select the WSBC employer zip file downloaded from the WorkSafeBC Hearing Testing Portal.
              MasterDB will create or update the company, location, and worker records.
            </p>
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
              <label class="btn btn-primary" style="cursor:pointer">
                Choose zip file…
                <input type="file" id="wsbc-file-input" accept=".zip" style="display:none">
              </label>
              <button class="btn btn-secondary" id="wsbc-cancel">Cancel</button>
            </div>
            <div id="wsbc-err" style="color:var(--clr-error-text);font-size:0.875rem;margin-top:0.5rem"></div>
          </div>
        `
        wrap.querySelector('#wsbc-cancel').addEventListener('click', () => {
          _wsbcState = null; render()
        })
        wrap.querySelector('#wsbc-file-input').addEventListener('change', async e => {
          const file = e.target.files?.[0]
          if (!file) return

          // Show loading panel immediately — replace entire wrap so the browser
          // renders it before any blocking work starts
          wrap.innerHTML = `
            <div class="info-card" style="margin-bottom:1.5rem">
              <div class="spinner"></div>
              <p class="status-text">Reading zip file — this may take a moment…</p>
            </div>
          `
          // Yield to let the browser render the loading state before heavy work
          await new Promise(r => setTimeout(r, 80))

          try {
            const buf     = await file.arrayBuffer()
            // Yield again before JSZip scans the binary (large OCC Classification CSV inside)
            await new Promise(r => setTimeout(r, 0))
            const parsed  = await parseWsbcZip(buf)
            const preview = await previewWsbcImport(parsed)
            _wsbcState = { parsed, preview }
            renderWsbc(wrap)
          } catch (err) {
            wrap.innerHTML = `
              <div class="info-card" style="margin-bottom:1.5rem">
                <div class="error-banner"><strong>Failed to read zip:</strong> ${esc(err.message)}</div>
                <button class="btn btn-secondary" id="wsbc-err-back" style="margin-top:0.75rem">Back</button>
              </div>
            `
            wrap.querySelector('#wsbc-err-back').addEventListener('click', () => {
              _wsbcState = 'picking'; render()
            })
          }
        })
        return
      }

      if (_wsbcState === 'importing') {
        wrap.innerHTML = `
          <div class="info-card" style="margin-bottom:1.5rem">
            <div class="spinner"></div>
            <p class="status-text">Importing — please wait. Large files with years of history may take a minute or two.</p>
          </div>
        `
        return
      }

      if (_wsbcState === 'done') {
        return  // result rendered by caller after navigate
      }

      // Preview state
      const { parsed, preview } = _wsbcState
      const p = preview

      const statusBadge = (label, ok) =>
        ok ? `<span class="badge badge-green">${esc(label)}</span>`
           : `<span class="badge badge-gray">${esc(label)} (will create)</span>`

      const workerRows = p.workerSummary.map(w =>
        `<tr>
          <td>${esc(w.last_name)}, ${esc(w.first_name)}${w.dob ? ` <span style="color:var(--clr-subtle);font-size:0.8rem">${esc(w.dob)}</span>` : ''}</td>
          <td>${w.status === 'existing'
              ? '<span class="badge badge-green">Matched by WSBC ID</span>'
              : w.status === 'matched'
              ? '<span class="badge badge-blue">Matched by name/DOB</span>'
              : '<span class="badge badge-gray">New</span>'}</td>
        </tr>`
      ).join('')

      wrap.innerHTML = `
        <div class="info-card" style="margin-bottom:1.5rem">
          <h3 style="margin-bottom:0.75rem;font-size:0.9375rem">WSBC Import Preview</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.5rem;margin-bottom:1rem">
            <div>
              <span class="field-label">Employer</span>
              <div style="font-weight:600">${esc(p.employer.name)}</div>
              <div style="font-size:0.8rem;color:var(--clr-subtle)">WSBC ID: ${esc(p.employer.id)}</div>
            </div>
            <div>
              <span class="field-label">Operating Location${p.locations.length > 1 ? 's' : ''}</span>
              <div>${p.locations.map(l => esc(l.number) + (l.city ? ` — ${esc(l.city)}` : '')).join(', ')}</div>
            </div>
            <div>
              <span class="field-label">Company in DB</span>
              <div>${statusBadge(p.existingCompany?.name ?? 'Not found', !!p.existingCompany)}</div>
            </div>
            <div>
              <span class="field-label">Locations in DB</span>
              <div>${p.existingLocations.length
                ? `<span class="badge badge-green">${p.existingLocations.length} of ${p.locations.length} exist</span>`
                : `<span class="badge badge-gray">Will create ${p.locations.length}</span>`}</div>
            </div>
            <div>
              <span class="field-label">Workers</span>
              <div>${p.workerSummary.length}</div>
            </div>
            <div>
              <span class="field-label">Historical tests</span>
              <div>${p.testCount}${p.duplicateCount ? ` <span style="color:var(--clr-subtle);font-size:0.8rem">(${p.duplicateCount} already in DB)</span>` : ''}</div>
            </div>
          </div>

          ${p.workerSummary.length ? `
          <div class="table-wrap" style="max-height:16rem;overflow-y:auto;margin-bottom:0.75rem">
            <table class="data-table" style="margin:0">
              <thead><tr><th>Worker</th><th>Match</th></tr></thead>
              <tbody>${workerRows}</tbody>
            </table>
          </div>` : ''}

          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
            <button class="btn btn-primary" id="wsbc-commit">Import →</button>
            <button class="btn btn-secondary" id="wsbc-back">Back</button>
            <span id="wsbc-commit-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
          </div>
        </div>
      `
      wrap.querySelector('#wsbc-back').addEventListener('click', () => {
        _wsbcState = 'picking'; renderWsbc(wrap)
      })
      wrap.querySelector('#wsbc-commit').addEventListener('click', async () => {
        _wsbcState = 'importing'; renderWsbc(wrap)
        // Flush spinner to screen before commit blocks the thread
        await new Promise(r => setTimeout(r, 80))
        try {
          const r = await commitWsbcImport(parsed, session?.writerName ?? 'admin')
          _wsbcState = null
          _status = { ok: true, message: `WSBC import complete: ${r.imported} test${r.imported !== 1 ? 's' : ''} imported, ${r.newPersons} new worker${r.newPersons !== 1 ? 's' : ''} created.` }
          render()
          navigate('company', { companyId: r.companyId })
        } catch (err) {
          _wsbcState = { parsed, preview }
          renderWsbc(wrap)
          const errEl = wrap.querySelector('#wsbc-commit-err')
          if (errEl) errEl.textContent = `Import failed: ${err.message}`
        }
      })
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
              (SELECT MAX(t.test_date)
               FROM tests t
               JOIN locations lz ON lz.location_id = t.location_id
               WHERE lz.company_id = c.company_id AND lz.active = 1
                 AND t.deleted_at IS NULL) AS last_test_date
       FROM companies c
       LEFT JOIN locations l ON l.company_id = c.company_id AND l.active = 1
       LEFT JOIN employees e ON e.current_location_id = l.location_id
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
