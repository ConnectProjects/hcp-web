/**
 * masterdb2/screens/worker.js — worker (employee) detail
 * params: { employeeId: number, fromLocation?: { locationId, companyId } }
 *
 * Shows: info card, active baseline, test history (expandable rows for thresholds),
 * archived baselines.
 */

import { query, run, save } from '../db/db.js'
import { getById, getTests, getBaselines, getHpdAssessments } from '../db/workers.js'
import { mountNocPicker } from '../../shared/components/noc-picker.js'

const FREQS = ['500','1k','2k','3k','4k','6k','8k']

export function mount(container, { navigate, employeeId, fromLocation, session }) {
  if (!employeeId) { navigate('workers'); return }
  let _nocPicker = null

  let _editing = false
  let _status  = null

  render()

  function render() {
    const emp = getById(employeeId)
    if (!emp) {
      container.innerHTML = `<div class="error-card"><h2>Not found</h2><p>Worker ${employeeId} does not exist or was deleted.</p></div>`
      return
    }

    const tests     = getTests(employeeId)
    const baselines = getBaselines(employeeId)
    const activebl  = baselines.find(b => b.archived === 0) ?? null

    const backLabel  = fromLocation ? 'Location' : 'Workers'
    const backAction = fromLocation
      ? () => navigate('location', fromLocation)
      : () => navigate('workers')

    const locDisplay = [emp.location_name, emp.location_province].filter(Boolean).join(', ')
    const sinDisplay = emp.sin_last_4 ? `***-***-${emp.sin_last_4}` : ''

    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-btn">&larr; ${backLabel}</button>
        <h1>${esc(emp.last_name)}, ${esc(emp.first_name)}${emp.middle_name ? ' ' + esc(emp.middle_name) : ''}</h1>
        <span class="badge ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}">${esc(emp.status ?? '')}</span>
        <button class="btn btn-secondary btn-sm" id="edit-btn">
          ${_editing ? 'Cancel Edit' : 'Edit'}
        </button>
        ${tests.length ? '<button class="btn btn-secondary btn-sm" id="csv-btn">Download CSV</button>' : ''}
      </div>
      <div class="screen-body">

        ${_status ? `<div class="${_status.ok ? 'success-banner' : 'error-banner'}" style="margin-bottom:1rem">${esc(_status.message)}</div>` : ''}

        ${_editing ? workerEditForm(emp) : `
          <div class="info-card">
            <dl>
              ${row('Date of Birth', emp.dob ? fmtDate(emp.dob) : null)}
              ${row('SIN (last 4)',  sinDisplay)}
              ${row('Phone',        emp.phone)}
              ${row('Email',        emp.email)}
              ${row('Job Title',    emp.job_title ? `${emp.job_title}${emp.occupation_code ? ` (${emp.occupation_code})` : ''}` : null)}
              ${row('Hire Date',    emp.hire_date ? fmtDate(emp.hire_date) : null)}
              ${row('Location',     locDisplay)}
              ${row('Company',      emp.company_name)}
              ${row('UID',          emp.uid)}
            </dl>
          </div>
        `}

        ${baselineSection(activebl)}

        <div class="section-head" style="margin-top:0.5rem">
          <h2>Test History (${tests.length})</h2>
        </div>
        ${testTable(tests)}

        ${archivedBaselines(baselines)}

      </div>
    `

    container.querySelector('#back-btn').addEventListener('click', backAction)
    container.querySelector('#edit-btn').addEventListener('click', () => {
      _editing = !_editing; _status = null; render()
    })
    container.querySelector('#emp-save')?.addEventListener('click', () => saveWorker(emp))
    container.querySelector('#emp-cancel')?.addEventListener('click', () => { _editing = false; render() })

    const titleWrap = container.querySelector('#ef-title-wrap')
    if (titleWrap) {
      _nocPicker = mountNocPicker(titleWrap, {
        jobTitle:       emp.job_title       ?? '',
        occupationCode: emp.occupation_code ?? '',
      })
    }
    container.querySelectorAll('tr.test-row').forEach(tr =>
      tr.addEventListener('click', () =>
        navigate('test', { testId: Number(tr.dataset.testId), employeeId })
      )
    )
    container.querySelector('#csv-btn')?.addEventListener('click', () =>
      downloadCsv(emp, tests)
    )
  }

  async function saveWorker(emp) {
    const errEl = container.querySelector('#emp-err')
    const first = container.querySelector('#ef-first')?.value.trim()
    const last  = container.querySelector('#ef-last')?.value.trim()
    if (!first || !last) { if (errEl) errEl.textContent = 'First and last name are required.'; return }

    try {
      const noc = _nocPicker?.getValue()
      run(
        `UPDATE employees SET first_name=?, middle_name=?, last_name=?, dob=?, job_title=?,
         occupation_code=?, hire_date=?, phone=?, email=?, sin_last_4=?, status=?,
         updated_at=datetime('now') WHERE employee_id=?`,
        [first,
         container.querySelector('#ef-middle')?.value.trim()  || null,
         last,
         container.querySelector('#ef-dob')?.value           || null,
         noc?.title || null,
         noc?.code  || null,
         container.querySelector('#ef-hire')?.value          || null,
         container.querySelector('#ef-phone')?.value.trim()  || null,
         container.querySelector('#ef-email')?.value.trim()  || null,
         container.querySelector('#ef-sin')?.value.trim()    || null,
         container.querySelector('#ef-status')?.value        || 'active',
         employeeId]
      )
      await save(session?.writerName ?? 'admin')
      _editing = false
      _status = { ok: true, message: `"${last}, ${first}" updated.` }
      render()
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
  }
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function workerEditForm(emp) {
  return `
    <div class="info-card" style="margin-bottom:1.5rem">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div>
          <label class="field-label">First Name *</label>
          <input class="search-input" id="ef-first" value="${esc(emp.first_name)}">
        </div>
        <div>
          <label class="field-label">Last Name *</label>
          <input class="search-input" id="ef-last" value="${esc(emp.last_name)}">
        </div>
        <div>
          <label class="field-label">Middle Name</label>
          <input class="search-input" id="ef-middle" value="${esc(emp.middle_name ?? '')}">
        </div>
        <div>
          <label class="field-label">Date of Birth</label>
          <input type="date" class="form-select" id="ef-dob" value="${esc(emp.dob ?? '')}" style="width:100%">
        </div>
        <div style="grid-column:1/-1">
          <label class="field-label">Job Title</label>
          <div id="ef-title-wrap"></div>
        </div>
        <div>
          <label class="field-label">Hire Date</label>
          <input type="date" class="form-select" id="ef-hire" value="${esc(emp.hire_date ?? '')}" style="width:100%">
        </div>
        <div>
          <label class="field-label">Phone</label>
          <input class="search-input" id="ef-phone" value="${esc(emp.phone ?? '')}">
        </div>
        <div>
          <label class="field-label">Email</label>
          <input class="search-input" id="ef-email" value="${esc(emp.email ?? '')}">
        </div>
        <div>
          <label class="field-label">SIN (last 4)</label>
          <input class="search-input" id="ef-sin" value="${esc(emp.sin_last_4 ?? '')}" maxlength="4">
        </div>
        <div>
          <label class="field-label">Status</label>
          <select class="form-select" id="ef-status" style="width:100%">
            <option value="active"   ${emp.status === 'active'   ? 'selected' : ''}>Active</option>
            <option value="inactive" ${emp.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="emp-save">Save Changes</button>
        <button class="btn btn-secondary" id="emp-cancel">Cancel</button>
        <span id="emp-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    </div>
  `
}

// ── Section builders ──────────────────────────────────────────────────────────

function baselineSection(bl) {
  if (!bl) {
    return `<div class="info-card" style="color:var(--clr-subtle);font-size:0.875rem">
      No baseline on file for this worker.
    </div>`
  }
  return `
    <div class="info-card" style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
        <span class="badge badge-blue">Active Baseline</span>
        <span style="font-size:0.875rem;color:var(--clr-subtle)">
          ${bl.test_date ? fmtDate(bl.test_date) : '?'}
          ${bl.location_name ? '— ' + esc(bl.location_name) : ''}
        </span>
      </div>
      ${thrGrid(bl)}
    </div>
  `
}

function testTable(tests) {
  if (!tests.length) {
    return `<div class="table-card"><div class="table-empty">No tests on record.</div></div>`
  }

  const rows = tests.map(t => `
    <tr class="test-row clickable" data-test-id="${t.test_id}">
      <td>${fmtDate(t.test_date)}</td>
      <td>${esc(t.test_type ?? '—')}</td>
      <td>${esc(t.province ?? '—')}</td>
      <td>${classificationBadge(t.classification)}</td>
      <td>${buildFlags(t)}</td>
      <td style="color:var(--clr-subtle);font-size:0.8125rem">${esc(t.location_name ?? '')}</td>
    </tr>
  `).join('')

  return `
    <div class="table-card" style="margin-bottom:1.5rem">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Prov</th>
              <th>Classification</th><th>Flags</th><th>Location</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <p style="font-size:0.75rem;color:var(--clr-subtle);margin-top:-1rem;margin-bottom:1rem">
      Click a row to view full test details and audiogram.
    </p>
  `
}

function archivedBaselines(baselines) {
  const archived = baselines.filter(b => b.archived === 1)
  if (!archived.length) return ''
  return `
    <div class="section-head" style="margin-top:0.5rem">
      <h2>Archived Baselines (${archived.length})</h2>
    </div>
    ${archived.map(bl => `
      <div class="info-card" style="margin-bottom:0.75rem">
        <div style="font-size:0.8125rem;color:var(--clr-subtle);margin-bottom:0.5rem">
          ${bl.test_date ? fmtDate(bl.test_date) : '?'}
          ${bl.location_name ? '— ' + esc(bl.location_name) : ''}
        </div>
        ${thrGrid(bl)}
      </div>
    `).join('')}
  `
}

// ── Display helpers ───────────────────────────────────────────────────────────

function thrGrid(r) {
  const cell = v => `<td style="text-align:center;padding:0.25rem 0.5rem;border:1px solid var(--clr-border)">${v ?? '<span style="color:var(--clr-subtle)">—</span>'}</td>`
  const hdr  = f => `<th style="text-align:center;padding:0.25rem 0.5rem;border:1px solid var(--clr-border);font-size:0.7rem;font-weight:600;color:var(--clr-subtle)">${f}</th>`
  const ear  = e => `<td style="padding:0.25rem 0.5rem;font-weight:600;font-size:0.8rem;border:1px solid var(--clr-border)">${e}</td>`

  return `
    <table style="border-collapse:collapse;font-size:0.8125rem">
      <thead><tr><th style="border:1px solid var(--clr-border)"></th>${FREQS.map(hdr).join('')}</tr></thead>
      <tbody>
        <tr>${ear('L')}${FREQS.map(f => cell(r[`left_${f}`])).join('')}</tr>
        <tr>${ear('R')}${FREQS.map(f => cell(r[`right_${f}`])).join('')}</tr>
      </tbody>
    </table>
  `
}

function downloadCsv(emp, tests) {
  const headers = [
    'Date','Type','Province','Classification','STS','Referral',
    'L_500','L_1k','L_2k','L_3k','L_4k','L_6k','L_8k',
    'R_500','R_1k','R_2k','R_3k','R_4k','R_6k','R_8k',
    'Tech Notes','Location'
  ]
  const csvRows = [headers.join(',')]

  for (const t of tests) {
    const cells = [
      t.test_date ?? '',
      t.test_type ?? '',
      t.province ?? '',
      t.classification ?? '',
      t.sts_flag ? 'Yes' : '',
      t.referral_given_to_worker ? 'Yes' : '',
      ...FREQS.map(f => t[`left_${f}`] ?? ''),
      ...FREQS.map(f => t[`right_${f}`] ?? ''),
      t.tech_notes ?? '',
      t.location_name ?? ''
    ]
    csvRows.push(cells.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
  }

  const name = `${emp.last_name}_${emp.first_name}`.replace(/\s+/g,'_')
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${name}_tests.csv`
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

function buildFlags(t) {
  const parts = []
  if (t.sts_flag)                  parts.push(`<span class="badge badge-yellow">STS</span>`)
  if (t.referral_given_to_worker)  parts.push(`<span class="badge badge-red">Referral</span>`)
  return parts.join(' ')
}

function classificationBadge(cls) {
  if (!cls) return '<span style="color:var(--clr-subtle)">—</span>'
  const lo = cls.toLowerCase()
  let cssCls = 'badge-gray'
  if (lo.includes('normal'))        cssCls = 'badge-green'
  else if (lo.includes('sts'))      cssCls = 'badge-yellow'
  else if (lo.includes('refer'))    cssCls = 'badge-red'
  return `<span class="badge ${cssCls}">${esc(cls)}</span>`
}

function row(label, value) {
  if (value == null || value === '') return ''
  return `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}
