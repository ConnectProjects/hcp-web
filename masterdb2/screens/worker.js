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

  // Back destination
  const backLabel  = fromLocation ? 'Location' : 'Workers'
  const backAction = fromLocation
    ? () => navigate('location', fromLocation)
    : () => navigate('workers')

  // ── Render ─────────────────────────────────────────────────────────────────

  const locDisplay = [emp.location_name, emp.location_province].filter(Boolean).join(', ')
  const sinDisplay = emp.sin_last_4 ? `***-***-${emp.sin_last_4}` : ''

  container.innerHTML = `
    <div class="screen-header-row">
      <button class="back-link" id="back-btn">&larr; ${backLabel}</button>
      <h1>${esc(emp.last_name)}, ${esc(emp.first_name)}${emp.middle_name ? ' ' + esc(emp.middle_name) : ''}</h1>
      <span class="badge ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}">${esc(emp.status ?? '')}</span>
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

  // Expand / collapse test detail rows on click
  container.querySelectorAll('tr.test-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const detail = container.querySelector(`tr[data-detail-for="${tr.dataset.testId}"]`)
      if (detail) {
        const isHidden = detail.classList.contains('detail-hidden')
        detail.classList.toggle('detail-hidden', !isHidden)
        tr.classList.toggle('detail-open', isHidden)
      }
    })
  })
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

  const rowPairs = tests.map(t => {
    const hpd         = getHpdAssessments(t.test_id)
    const hasThresh   = FREQS.some(f => t[`left_${f}`] != null || t[`right_${f}`] != null)
    const flags       = buildFlags(t)
    const classBadge  = classificationBadge(t.classification)

    return `
      <tr class="test-row clickable" data-test-id="${t.test_id}">
        <td>${fmtDate(t.test_date)}</td>
        <td>${esc(t.test_type ?? '—')}</td>
        <td>${esc(t.province ?? '—')}</td>
        <td>${classBadge}</td>
        <td>${flags}</td>
        <td style="color:var(--clr-subtle);font-size:0.8125rem">${esc(t.location_name ?? '')}</td>
      </tr>
      <tr class="detail-hidden" data-detail-for="${t.test_id}">
        <td colspan="6" style="padding:0.75rem 1rem;background:var(--clr-surface);border-bottom:1px solid var(--clr-border)">
          ${hasThresh ? thrGrid(t) : '<p style="color:var(--clr-subtle);font-size:0.875rem">No threshold data.</p>'}
          ${t.tech_notes ? `<p style="margin-top:0.5rem;font-size:0.8125rem"><strong>Notes:</strong> ${esc(t.tech_notes)}</p>` : ''}
          ${t.counsel_text ? `<p style="margin-top:0.375rem;font-size:0.8125rem"><strong>Counselling:</strong> ${esc(t.counsel_text)}</p>` : ''}
          ${hpdRows(hpd)}
        </td>
      </tr>
    `
  }).join('')

  return `
    <div class="table-card" style="margin-bottom:1.5rem">
      <div class="table-wrap">
        <table class="data-table" id="test-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Prov</th>
              <th>Classification</th>
              <th>Flags</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>${rowPairs}</tbody>
        </table>
      </div>
    </div>
    <style>
      tr.detail-hidden { display: none; }
      tr.test-row.detail-open td:first-child::before { content: '▾ '; }
      tr.test-row td:first-child::before { content: '▸ '; color: var(--clr-subtle); }
    </style>
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

function hpdRows(hpdList) {
  if (!hpdList.length) return ''
  return `<div style="margin-top:0.625rem;font-size:0.8125rem">
    <strong>HPD:</strong>
    ${hpdList.map(h => `${esc(h.hpd_make_model ?? '?')} NRR ${h.rated_nrr ?? '?'} / ${h.derated_nrr ?? '?'} dB — ${esc(h.adequacy ?? '')}`).join('; ')}
  </div>`
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
