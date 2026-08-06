/**
 * masterdb2/screens/worker.js — worker (employee) detail
 * params: { employeeId: number, fromLocation?: { locationId, companyId } }
 *
 * Shows: info card, active baseline, test history (expandable rows for thresholds),
 * archived baselines.
 */

import { getById, getTests, getBaselines, getHpdAssessments } from '../db/workers.js'

const FREQS = ['500','1k','2k','3k','4k','6k','8k']

export function mount(container, { navigate, employeeId, fromLocation }) {
  if (!employeeId) { navigate('workers'); return }

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
      ${tests.length ? '<button class="btn btn-secondary" id="csv-btn" style="margin-left:auto">Download CSV</button>' : ''}
    </div>
    <div class="screen-body">

      <div class="info-card">
        <dl>
          ${row('Date of Birth', emp.dob ? fmtDate(emp.dob) : null)}
          ${row('SIN (last 4)',  sinDisplay)}
          ${row('Phone',        emp.phone)}
          ${row('Email',        emp.email)}
          ${row('Job Title',    emp.job_title)}
          ${row('Hire Date',    emp.hire_date ? fmtDate(emp.hire_date) : null)}
          ${row('Location',     locDisplay)}
          ${row('Company',      emp.company_name)}
          ${row('UID',          emp.uid)}
        </dl>
      </div>

      ${baselineSection(activebl)}

      <div class="section-head" style="margin-top:0.5rem">
        <h2>Test History (${tests.length})</h2>
      </div>
      ${testTable(tests)}

      ${archivedBaselines(baselines)}

    </div>
  `

  container.querySelector('#back-btn').addEventListener('click', backAction)

  container.querySelectorAll('tr.test-row').forEach(tr =>
    tr.addEventListener('click', () =>
      navigate('test', { testId: Number(tr.dataset.testId), employeeId })
    )
  )

  container.querySelector('#csv-btn')?.addEventListener('click', () =>
    downloadCsv(emp, tests)
  )
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
