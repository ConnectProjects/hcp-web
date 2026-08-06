/**
 * techtool2/screens/tt-test.js — TechTool packet working screen
 *
 * Two sub-views managed by _mode:
 *   'list'  — table of all workers in the packet with status + Test/View buttons
 *   'test'  — threshold entry form for one worker, with skip flow
 *
 * Params: { filename, techFolder }
 */

import { readTechPacket, saveTechPacket, submitTechPacket } from '../../masterdb2/db/db.js'
import { appendTestResult, markEmployeeSkipped, markSubmitted } from '../../shared/packet/schema.js'

const FREQS = ['500', '1k', '2k', '3k', '4k', '6k', '8k']

export function mount(container, { navigate, session, filename, techFolder }) {
  let _packet   = null
  let _empIdx   = null    // index into _packet.employees
  let _mode     = 'list'  // 'list' | 'test'
  let _skipMode = false   // inline skip-confirm visible
  let _saving   = false
  let _status   = null    // { ok, msg } | null

  // ── Boot ──────────────────────────────────────────────────────────────────

  async function load() {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Loading…</h1></div>
      <div class="screen-body"><div class="spinner"></div></div>`
    try {
      _packet = await readTechPacket(techFolder, filename)
      render()
    } catch (e) {
      container.innerHTML = `
        <div class="screen-header-row">
          <button class="back-link" id="back">← Inbox</button><h1>Error</h1>
        </div>
        <div class="screen-body">
          <div class="error-banner"><strong>Could not load packet:</strong> ${esc(e.message)}</div>
        </div>`
      container.querySelector('#back')?.addEventListener('click', () => navigate('tt-inbox'))
    }
  }

  function render() {
    if (_mode === 'list') renderList()
    else renderTest()
  }

  // ── Worker list ────────────────────────────────────────────────────────────

  function renderList() {
    const p       = _packet
    const company = p.company?.name ?? 'Unknown company'
    const locLine = [p.location?.name, p.location?.city,
                     p.location?.province ?? p.visit?.province].filter(Boolean).join(' · ')
    const date    = p.visit?.visit_date ? fmtDate(p.visit.visit_date) : '—'
    const emps    = p.employees ?? []
    const nTested = emps.filter(e => (e.completed_tests?.length ?? 0) > 0).length
    const nSkip   = emps.filter(e => !!e.skipped_at).length
    const nTotal  = emps.length
    const allDone = nTotal > 0 && (nTested + nSkip) >= nTotal

    const statusHTML = _status
      ? `<div class="${_status.ok ? 'success-banner' : 'error-banner'}" style="margin-bottom:1rem">${esc(_status.msg)}</div>`
      : ''

    const rows = emps.map((emp, idx) => {
      const tested  = (emp.completed_tests?.length ?? 0) > 0
      const skipped = !!emp.skipped_at
      const name    = `${emp.last_name ?? ''}, ${emp.first_name ?? ''}`
      let badge, action

      if (tested) {
        badge  = `<span class="badge badge-green">Tested</span>`
        action = `<button class="btn btn-secondary btn-sm" data-idx="${idx}">View / Edit</button>`
      } else if (skipped) {
        badge  = `<span class="badge badge-gray">Skipped</span>`
        action = `<button class="btn btn-secondary btn-sm" data-idx="${idx}">Re-test</button>`
      } else {
        badge  = ''
        action = `<button class="btn btn-primary btn-sm" data-idx="${idx}">Test →</button>`
      }

      return `<tr>
        <td>
          <strong>${esc(name)}</strong>
          ${emp.job_title ? `<br><span style="font-size:0.75rem;color:var(--clr-subtle)">${esc(emp.job_title)}</span>` : ''}
        </td>
        <td style="font-size:0.875rem">${emp.dob ? esc(emp.dob) : '—'}</td>
        <td style="font-size:0.875rem">${emp.baseline
          ? esc(emp.baseline.test_date ?? '—')
          : '<span style="color:var(--clr-subtle)">None</span>'}</td>
        <td>${badge}</td>
        <td>${action}</td>
      </tr>`
    }).join('') || `<tr><td colspan="5" class="table-empty">No workers in this packet.</td></tr>`

    const progress = nTotal === 0 ? '' :
      `${nTested} of ${nTotal} tested${nSkip ? `, ${nSkip} skipped` : ''}`

    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-btn">← Inbox</button>
        <div style="flex:1;overflow:hidden">
          <h1 style="font-size:1.0625rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(company)}</h1>
          ${locLine ? `<div class="screen-subtitle">${esc(locLine)}</div>` : ''}
        </div>
        <span class="screen-subtitle" style="white-space:nowrap;padding-left:1rem">${esc(date)}</span>
      </div>
      <div class="screen-body">
        ${statusHTML}
        ${(p.company?.sticky_notes ?? '').trim()
          ? `<div class="packet-note" style="margin-bottom:1rem">${esc(p.company.sticky_notes.trim())}</div>` : ''}
        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Worker</th><th>DOB</th><th>Baseline</th><th>Status</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1.25rem;gap:1rem;flex-wrap:wrap">
          <span style="font-size:0.875rem;color:var(--clr-subtle)">${esc(progress)}</span>
          <button class="btn btn-primary" id="submit-btn" ${allDone ? '' : 'disabled'}>Submit Packet →</button>
        </div>
      </div>`

    container.querySelector('#back-btn')?.addEventListener('click', () => navigate('tt-inbox'))
    container.querySelectorAll('[data-idx]').forEach(btn =>
      btn.addEventListener('click', () => {
        _empIdx = Number(btn.dataset.idx); _mode = 'test'; _skipMode = false; _status = null; render()
      })
    )
    container.querySelector('#submit-btn')?.addEventListener('click', runSubmit)
  }

  // ── Test entry ─────────────────────────────────────────────────────────────

  function renderTest() {
    const emp = _packet.employees[_empIdx]
    if (!emp) { _mode = 'list'; render(); return }

    const name     = `${emp.last_name ?? ''}, ${emp.first_name ?? ''}`
    const existing = emp.completed_tests?.[emp.completed_tests.length - 1]
    const today    = _packet.visit?.visit_date ?? new Date().toISOString().slice(0, 10)
    const thr      = existing?.thresholds ?? {}

    const typeOpts = ['Periodic', 'Baseline', 'Exit'].map(t =>
      `<option${(existing?.test_type ?? 'Periodic') === t ? ' selected' : ''}>${t}</option>`
    ).join('')

    const thrRow = (ear, color) => `<tr>
      <td style="font-weight:600;color:${color};white-space:nowrap">${ear === 'left' ? 'Left' : 'Right'}</td>
      ${FREQS.map(f => {
        const val = thr[`${ear}_${f}`] ?? ''
        return `<td><input class="thr-input" data-ear="${ear}" data-freq="${f}"
          type="number" min="-10" max="120" step="5"
          value="${val !== '' ? esc(String(val)) : ''}"
          placeholder="—" inputmode="numeric"></td>`
      }).join('')}
    </tr>`

    const skipBlock = _skipMode ? `
      <div class="info-card" style="padding:1rem;margin-top:1rem">
        <p style="margin:0 0 0.75rem;font-weight:500">Mark ${esc(emp.first_name ?? 'worker')} as skipped?</p>
        <label class="field-label">Reason (optional)</label>
        <input class="search-input" id="skip-reason" placeholder="e.g. Worker absent, refused test"
               style="width:100%;margin-bottom:0.75rem">
        <div style="display:flex;gap:0.625rem">
          <button class="btn btn-danger btn-sm" id="confirm-skip-btn">Confirm skip</button>
          <button class="btn btn-secondary btn-sm" id="cancel-skip-btn">Never mind</button>
        </div>
      </div>` : ''

    const actionRow = _skipMode ? '' : `
      <div id="tf-err" style="color:var(--clr-danger);font-size:0.875rem;margin-bottom:0.5rem;display:none"></div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <button class="btn btn-primary" id="save-test-btn" ${_saving ? 'disabled' : ''}>${_saving ? 'Saving…' : 'Save test'}</button>
        <button class="btn btn-secondary" id="skip-btn">Skip worker</button>
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
      </div>`

    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-list">← Worker list</button>
        <h1>${esc(name)}</h1>
      </div>
      <div class="screen-body" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:1.5rem;align-items:start">

        <div>
          <div class="section-head" style="margin-top:0"><h2>Worker info</h2></div>
          <div class="info-card">
            ${infoRow('DOB',       emp.dob       ?? '—')}
            ${infoRow('Job',       emp.job_title ?? '—')}
            ${infoRow('Hire date', emp.hire_date ?? '—')}
          </div>

          <div class="section-head" style="margin-top:1.25rem">
            <h2>${emp.baseline ? `Baseline — ${esc(emp.baseline.test_date ?? '')}` : 'Baseline'}</h2>
          </div>
          ${emp.baseline
            ? `<div class="info-card" style="padding:0.75rem;overflow-x:auto">${miniThrTable(emp.baseline.thresholds)}</div>`
            : `<div class="info-card" style="padding:0.75rem;color:var(--clr-subtle);font-size:0.875rem">No baseline on file.</div>`}

          ${emp.prior_tests?.length ? `
            <div class="section-head" style="margin-top:1rem">
              <h2>Prior — ${esc(emp.prior_tests[0].test_date ?? '')}</h2>
            </div>
            <div class="info-card" style="padding:0.75rem;overflow-x:auto">
              ${miniThrTable(emp.prior_tests[0].thresholds)}
            </div>` : ''}
        </div>

        <div>
          <div class="section-head" style="margin-top:0"><h2>Today's test</h2></div>
          <div class="info-card" style="padding:1rem">
            <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
              <div>
                <label class="field-label">Type</label>
                <select class="form-select" id="tf-type" style="width:auto">${typeOpts}</select>
              </div>
              <div>
                <label class="field-label">Date</label>
                <input class="search-input" id="tf-date" type="date" value="${esc(today)}" style="width:auto">
              </div>
            </div>

            <div style="overflow-x:auto;margin-bottom:1rem">
              <table class="data-table thr-table">
                <thead><tr>
                  <th></th>${FREQS.map(f => `<th>${f}</th>`).join('')}
                </tr></thead>
                <tbody>
                  ${thrRow('left',  '#c0392b')}
                  ${thrRow('right', '#2471a3')}
                </tbody>
              </table>
            </div>

            <div style="margin-bottom:1rem">
              <label class="field-label">Tech notes</label>
              <textarea class="search-input" id="tf-notes" rows="2"
                style="width:100%;resize:vertical">${esc(existing?.notes ?? '')}</textarea>
            </div>

            ${actionRow}
          </div>
          ${skipBlock}
        </div>

      </div>`

    // Back / cancel
    container.querySelector('#back-list')?.addEventListener('click', () => {
      _mode = 'list'; _status = null; _skipMode = false; render()
    })
    container.querySelector('#cancel-btn')?.addEventListener('click', () => {
      _mode = 'list'; _status = null; _skipMode = false; render()
    })

    // Save
    container.querySelector('#save-test-btn')?.addEventListener('click', saveTest)

    // Skip flow
    container.querySelector('#skip-btn')?.addEventListener('click', () => { _skipMode = true; render() })
    container.querySelector('#cancel-skip-btn')?.addEventListener('click', () => { _skipMode = false; render() })
    container.querySelector('#confirm-skip-btn')?.addEventListener('click', () => {
      const reason = container.querySelector('#skip-reason')?.value.trim() || 'No reason given'
      skipWorker(reason)
    })

    // Tab through threshold cells in row order (L500…L8k then R500…R8k)
    const thrInputs = [...container.querySelectorAll('.thr-input')]
    thrInputs.forEach((inp, i) => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault()
          ;(thrInputs[i + 1] ?? container.querySelector('#tf-notes'))?.focus()
        }
      })
    })
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function saveTest() {
    const errEl    = container.querySelector('#tf-err')
    const testType = container.querySelector('#tf-type')?.value ?? 'Periodic'
    const testDate = container.querySelector('#tf-date')?.value?.trim() ?? ''

    if (!testDate) { showErr(errEl, 'Test date is required.'); return }

    const thresholds = {}
    let anyEntered = false
    container.querySelectorAll('.thr-input').forEach(inp => {
      const key = `${inp.dataset.ear}_${inp.dataset.freq}`
      const raw = inp.value.trim()
      thresholds[key] = raw !== '' ? Number(raw) : null
      if (raw !== '') anyEntered = true
    })
    if (!anyEntered) { showErr(errEl, 'Enter at least one threshold value.'); return }

    const notes = container.querySelector('#tf-notes')?.value.trim() || null
    const emp   = _packet.employees[_empIdx]

    _saving = true
    render()

    try {
      appendTestResult(_packet, emp.employee_id, {
        test_date: testDate,
        tech_id:   session.user?.user_id ?? null,
        test_type: testType,
        notes,
        ...thresholds
      })
      await saveTechPacket(techFolder, filename, _packet)
      _saving = false; _mode = 'list'
      _status = { ok: true, msg: `${emp.last_name}, ${emp.first_name} — test saved.` }
      render()
    } catch (e) {
      _saving = false
      render()
      showErr(container.querySelector('#tf-err'), `Save failed: ${e.message}`)
    }
  }

  async function skipWorker(reason) {
    const emp = _packet.employees[_empIdx]
    try {
      markEmployeeSkipped(_packet, emp.employee_id, reason)
      await saveTechPacket(techFolder, filename, _packet)
      _mode = 'list'; _skipMode = false
      _status = { ok: true, msg: `${emp.last_name}, ${emp.first_name} marked as skipped.` }
      render()
    } catch (e) {
      _skipMode = false; _mode = 'list'
      _status = { ok: false, msg: `Skip failed: ${e.message}` }
      render()
    }
  }

  async function runSubmit() {
    try {
      markSubmitted(_packet, session.user?.user_id)
      await submitTechPacket(techFolder, filename, _packet)
      navigate('tt-inbox')
    } catch (e) {
      _status = { ok: false, msg: `Submit failed: ${e.message}` }
      render()
    }
  }

  load()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function miniThrTable(thr) {
  const FREQS = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
  const cell = (ear, f) => {
    const v = thr?.[`${ear}_${f}`]
    return `<td style="text-align:center;padding:0.2rem 0.375rem">${v != null ? v : '—'}</td>`
  }
  return `<table style="width:100%;border-collapse:collapse;font-size:0.8125rem">
    <thead><tr>
      <th style="text-align:left;padding:0.2rem 0.375rem;min-width:1.5rem"></th>
      ${FREQS.map(f => `<th style="text-align:center;padding:0.2rem 0.375rem;font-weight:500">${f}</th>`).join('')}
    </tr></thead>
    <tbody>
      <tr>
        <td style="padding:0.2rem 0.375rem;color:#c0392b;font-weight:600">L</td>
        ${FREQS.map(f => cell('left', f)).join('')}
      </tr>
      <tr>
        <td style="padding:0.2rem 0.375rem;color:#2471a3;font-weight:600">R</td>
        ${FREQS.map(f => cell('right', f)).join('')}
      </tr>
    </tbody>
  </table>`
}

function infoRow(label, value) {
  return `<div style="display:flex;gap:0.5rem;padding:0.375rem 0.75rem;border-bottom:1px solid var(--clr-border);font-size:0.875rem">
    <span style="color:var(--clr-subtle);min-width:5rem;flex-shrink:0">${esc(label)}</span>
    <span>${esc(String(value ?? '—'))}</span>
  </div>`
}

function showErr(el, msg) {
  if (!el) return
  el.textContent = msg; el.style.display = 'block'
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-CA',
      { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return d }
}
