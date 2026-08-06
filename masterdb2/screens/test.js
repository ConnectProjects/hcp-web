/**
 * masterdb2/screens/test.js — full test detail
 * params: { testId, employeeId }
 *
 * Shows: audiogram SVG, all test fields, questionnaire data, HPD assessments.
 */

import { query } from '../db/db.js'
import { getById, getHpdAssessments } from '../db/workers.js'

const FREQ_KEYS   = ['500','1k','2k','3k','4k','6k','8k']
const FREQ_LABELS = ['500','1k','2k','3k','4k','6k','8k']

export function mount(container, { navigate, testId, employeeId }) {
  if (!testId) { navigate('workers'); return }

  const tests = query(
    `SELECT t.*,
            l.name AS location_name, l.province,
            c.name AS company_name,
            tk.name AS tech_name, tk.initials AS tech_initials
     FROM tests t
     LEFT JOIN locations l  ON l.location_id = t.location_id
     LEFT JOIN companies c  ON c.company_id  = l.company_id
     LEFT JOIN techs    tk ON tk.tech_id     = t.tech_id
     WHERE t.test_id = ? AND t.deleted_at IS NULL`,
    [testId]
  )
  const test = tests[0] ?? null

  if (!test) {
    container.innerHTML = `<div class="error-card"><h2>Not found</h2><p>Test ${testId} does not exist.</p></div>`
    return
  }

  const emp = employeeId ? getById(employeeId) : null
  const hpd = getHpdAssessments(testId)

  // Parse questionnaire
  let qData = null
  if (test.questionnaire) {
    try { qData = JSON.parse(test.questionnaire) } catch { qData = null }
  }

  const hasThresh = FREQ_KEYS.some(f => test[`left_${f}`] != null || test[`right_${f}`] != null)

  container.innerHTML = `
    <div class="screen-header-row">
      <button class="back-link" id="back-btn">&larr; ${emp ? esc(emp.last_name + ', ' + emp.first_name) : 'Worker'}</button>
      <h1>Test — ${fmtDate(test.test_date)}</h1>
      ${test.sts_flag         ? '<span class="badge badge-yellow" style="margin-left:0.5rem">STS</span>' : ''}
      ${test.referral_given_to_worker ? '<span class="badge badge-red" style="margin-left:0.25rem">Referral</span>' : ''}
    </div>

    <div class="screen-body" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start">

      <!-- Left column -->
      <div>
        <div class="section-head"><h2>Audiogram</h2></div>
        <div class="info-card" style="padding:0.75rem">
          ${hasThresh ? audiogramSVG(test) : '<p style="color:var(--clr-subtle)">No threshold data recorded.</p>'}
        </div>

        <div class="section-head" style="margin-top:1rem"><h2>Thresholds (dB HL)</h2></div>
        <div class="info-card" style="padding:0.75rem">
          ${hasThresh ? thrTable(test) : '<p style="color:var(--clr-subtle)">—</p>'}
        </div>

        ${hpd.length ? `
          <div class="section-head" style="margin-top:1rem"><h2>Hearing Protection</h2></div>
          <div class="info-card">
            <dl>
              ${hpd.map(h => `
                ${row('Device',      h.hpd_make_model)}
                ${row('Rated NRR',   h.rated_nrr != null ? h.rated_nrr + ' dB' : null)}
                ${row('Derated NRR', h.derated_nrr != null ? h.derated_nrr + ' dB' : null)}
                ${row('Lex8hr',      h.lex8hr)}
                ${row('Protected exposure', h.protected_exposure)}
                ${row('Adequacy',    h.adequacy)}
              `).join('')}
            </dl>
          </div>` : ''}
      </div>

      <!-- Right column -->
      <div>
        <div class="section-head"><h2>Test Details</h2></div>
        <div class="info-card">
          <dl>
            ${row('Date',           fmtDate(test.test_date))}
            ${row('Type',           test.test_type)}
            ${row('Province',       test.province)}
            ${row('Classification', test.classification)}
            ${row('Triggered Rule', test.triggered_rule_id)}
            ${row('STS Flag',       test.sts_flag ? 'Yes' : null)}
            ${row('Triggering Freq', test.triggering_freq_hz ? test.triggering_freq_hz + ' Hz' : null)}
            ${row('Triggering Ear', test.triggering_ear)}
            ${row('Shift (dB)',     test.shift_db)}
            ${row('Tech',           test.tech_name)}
            ${row('Location',       test.location_name)}
            ${row('Company',        test.company_name)}
            ${row('Packet ID',      test.packet_id)}
            ${row('Referral given', test.referral_given_to_worker ? 'Yes' : null)}
          </dl>
        </div>

        ${test.counsel_text ? `
          <div class="section-head" style="margin-top:1rem"><h2>Counselling</h2></div>
          <div class="info-card">
            <p style="font-size:0.875rem;white-space:pre-wrap">${esc(test.counsel_text)}</p>
          </div>` : ''}

        ${test.tech_notes ? `
          <div class="section-head" style="margin-top:1rem"><h2>Tech Notes</h2></div>
          <div class="info-card">
            <p style="font-size:0.875rem;white-space:pre-wrap">${esc(test.tech_notes)}</p>
          </div>` : ''}

        <div class="section-head" style="margin-top:1rem"><h2>Questionnaire</h2></div>
        <div class="info-card">
          ${renderQuestionnaire(qData)}
        </div>
      </div>

    </div>

    <div class="screen-body" style="padding-top:0">
      <button class="btn btn-secondary" onclick="window.print()">Print / Save PDF</button>
    </div>
  `

  container.querySelector('#back-btn').addEventListener('click', () =>
    navigate('worker', { employeeId })
  )
}

// ── Audiogram SVG ─────────────────────────────────────────────────────────────

function audiogramSVG(test) {
  const W = 500, H = 290
  const PL = 48, PR = 16, PT = 22, PB = 32
  const PW = W - PL - PR, PH = H - PT - PB
  const DB_MIN = -10, DB_MAX = 110

  const xAt = i  => PL + (i / (FREQ_KEYS.length - 1)) * PW
  const yAt = db => PT + ((Number(db) - DB_MIN) / (DB_MAX - DB_MIN)) * PH

  let svg = ''

  // Horizontal grid + dB labels
  for (let db = 0; db <= 100; db += 10) {
    const y = yAt(db)
    const isNormal = db === 25
    svg += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}"
              stroke="${isNormal ? '#86efac' : '#e5e7eb'}"
              stroke-width="${isNormal ? 1.5 : 1}"
              stroke-dasharray="${isNormal ? '5,3' : 'none'}"/>`
    svg += `<text x="${PL-5}" y="${y+4}" text-anchor="end" font-size="10" fill="#9ca3af">${db}</text>`
  }

  // Vertical grid + frequency labels
  FREQ_KEYS.forEach((_, i) => {
    const x = xAt(i)
    svg += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${H-PB}" stroke="#e5e7eb" stroke-width="1"/>`
    svg += `<text x="${x}" y="${H-PB+16}" text-anchor="middle" font-size="10" fill="#9ca3af">${FREQ_LABELS[i]}</text>`
  })

  // dB HL axis label
  svg += `<text transform="rotate(-90)" x="${-(PT+PH/2)}" y="12" text-anchor="middle" font-size="10" fill="#9ca3af">dB HL</text>`
  svg += `<text x="${PL+PW/2}" y="${H-1}" text-anchor="middle" font-size="10" fill="#9ca3af">Frequency (Hz)</text>`

  // Build point arrays
  const mkPts = side => FREQ_KEYS.map((f, i) => {
    const v = test[`${side}_${f}`]
    return (v != null && v !== '') ? { x: xAt(i), y: yAt(v) } : null
  })

  const leftPts  = mkPts('left')
  const rightPts = mkPts('right')

  // Connect valid runs with polylines
  const polylines = (pts, color) => {
    let seg = [], out = ''
    const flush = () => { if (seg.length > 1) out += `<polyline points="${seg.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.5"/>`; seg = [] }
    for (const p of pts) { p ? seg.push(p) : flush() }
    flush()
    return out
  }

  svg += polylines(leftPts, '#ef4444')
  svg += polylines(rightPts, '#3b82f6')

  // Markers: X for left, O for right
  for (const p of leftPts) {
    if (!p) continue
    svg += `<line x1="${p.x-5}" y1="${p.y-5}" x2="${p.x+5}" y2="${p.y+5}" stroke="#ef4444" stroke-width="2.5"/>`
    svg += `<line x1="${p.x+5}" y1="${p.y-5}" x2="${p.x-5}" y2="${p.y+5}" stroke="#ef4444" stroke-width="2.5"/>`
  }
  for (const p of rightPts) {
    if (!p) continue
    svg += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="none" stroke="#3b82f6" stroke-width="2.5"/>`
  }

  // Legend
  svg += `<text x="${PL+4}" y="${PT-8}" font-size="10" fill="#ef4444" font-weight="600">Left (×)</text>`
  svg += `<text x="${PL+60}" y="${PT-8}" font-size="10" fill="#3b82f6" font-weight="600">Right (○)</text>`
  svg += `<text x="${W-PR}" y="${PT-8}" text-anchor="end" font-size="9" fill="#86efac">── 25 dB</text>`

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;display:block">${svg}</svg>`
}

// ── Threshold table ────────────────────────────────────────────────────────────

function thrTable(test) {
  const cell = (v, highlight) => {
    const val = v != null && v !== '' ? v : '—'
    const style = highlight && v != null && v > 25 ? 'color:#c2410c;font-weight:600' : ''
    return `<td style="text-align:center;padding:0.25rem 0.5rem;border:1px solid var(--clr-border);${style}">${val}</td>`
  }
  const hdr = f => `<th style="text-align:center;padding:0.25rem 0.5rem;border:1px solid var(--clr-border);font-size:0.75rem;color:var(--clr-subtle)">${f}</th>`
  const ear = e => `<td style="font-weight:600;font-size:0.8125rem;padding:0.25rem 0.5rem;border:1px solid var(--clr-border)">${e}</td>`

  return `<table style="border-collapse:collapse;font-size:0.8125rem">
    <thead><tr><th style="border:1px solid var(--clr-border);padding:0.25rem 0.5rem"></th>${FREQ_LABELS.map(hdr).join('')}</tr></thead>
    <tbody>
      <tr>${ear('Left')}${FREQ_KEYS.map(f => cell(test[`left_${f}`], true)).join('')}</tr>
      <tr>${ear('Right')}${FREQ_KEYS.map(f => cell(test[`right_${f}`], true)).join('')}</tr>
    </tbody>
  </table>`
}

// ── Questionnaire ─────────────────────────────────────────────────────────────

function renderQuestionnaire(data) {
  if (!data || typeof data !== 'object' || !Object.keys(data).length) {
    return `<p style="color:var(--clr-subtle);font-size:0.875rem">No questionnaire data recorded.</p>`
  }
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return `<p style="color:var(--clr-subtle);font-size:0.875rem">No questionnaire data recorded.</p>`
  return `<dl>${entries.map(([k, v]) =>
    `<dt>${esc(toLabel(k))}</dt><dd>${esc(String(v))}</dd>`
  ).join('')}</dl>`
}

function toLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
