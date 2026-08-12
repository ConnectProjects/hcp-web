/**
 * techtool2/screens/tt-test.js — TechTool packet working screen
 *
 * Two independent booths let the tech test two workers simultaneously.
 * Each booth is a self-contained slot with its own employee, questionnaire
 * answers, thresholds, and notes. Switching booths saves the current form
 * state into the slot before switching.
 *
 * Flow per booth:
 *   Worker list → assign to active booth → pre-test Q → thresholds → post-test Q → save
 *
 * Params: { filename, techFolder }
 */

import { readTechPacket, saveTechPacket, submitTechPacket } from '../../masterdb2/db/db.js'
import { appendTestResult, markEmployeeSkipped, markSubmitted } from '../../shared/packet/schema.js'

const FREQS = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
const THR_OPTIONS = ['--', 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 'NR']

function emptySlot(visitDate = '') {
  return {
    empIdx:    null,
    empEdits:  null,
    testType:  'Periodic',
    testDate:  visitDate,
    thresholds:{},
    pre:       {},
    post:      {},
    notes:     '',
    skipMode:  false,
    saving:    false,
  }
}

export function mount(container, { navigate, session, filename, techFolder }) {
  let _packet     = null
  let _slots      = [emptySlot(), emptySlot()]
  let _activeSlot = 0
  let _mode        = 'list'   // 'list' | 'test'
  let _status      = null     // { ok, msg }
  let _selected    = new Set()
  let _skipConfirm = false

  // ── Boot ──────────────────────────────────────────────────────────────────

  async function load() {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Loading…</h1></div>
      <div class="screen-body"><div class="spinner"></div></div>`
    try {
      _packet = await readTechPacket(techFolder, filename)
      const vd = _packet.visit?.visit_date ?? new Date().toISOString().slice(0, 10)
      _slots   = [emptySlot(vd), emptySlot(vd)]
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

  const render = () => _mode === 'list' ? renderList() : renderTest()

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

    // Map empIdx → slot number for badge display
    const slotOf = {}
    _slots.forEach((s, i) => { if (s.empIdx != null) slotOf[s.empIdx] = i })

    const rows = emps.map((emp, idx) => {
      const tested  = (emp.completed_tests?.length ?? 0) > 0
      const skipped = !!emp.skipped_at
      const inSlot  = slotOf[idx]
      const name    = `${emp.last_name ?? ''}, ${emp.first_name ?? ''}`
      let badge, action

      const canCheck = inSlot == null && !tested && !skipped

      if (inSlot != null) {
        const lbl = inSlot === 0 ? 'Left Booth' : 'Right Booth'
        badge  = `<span class="badge" style="background:#1e2a3a;color:#fff">${lbl}</span>`
        action = `<button class="btn btn-secondary btn-sm" data-idx="${idx}" data-goto="${inSlot}">Open →</button>`
      } else if (tested) {
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
        <td style="width:2rem;text-align:center">
          ${canCheck
            ? `<input type="checkbox" class="worker-check" data-idx="${idx}" ${_selected.has(idx) ? 'checked' : ''}>`
            : ''}
        </td>
        <td>
          <strong>${esc(name)}</strong>
          ${emp.job_title ? `<br><span style="font-size:0.75rem;color:var(--clr-subtle)">${esc(emp.job_title)}</span>` : ''}
        </td>
        <td style="font-size:0.875rem">${emp.dob ?? '—'}</td>
        <td style="font-size:0.875rem">${emp.baseline
          ? esc(emp.baseline.test_date ?? '—')
          : '<span style="color:var(--clr-subtle)">None</span>'}</td>
        <td>${badge}</td>
        <td>${action}</td>
      </tr>`
    }).join('') || `<tr><td colspan="6" class="table-empty">No workers in this packet.</td></tr>`

    const boothSel = `
      <div class="booth-mini-bar">
        <span style="font-size:0.8125rem;color:var(--clr-subtle)">Assign to:</span>
        ${_slots.map((s, i) => {
          const emp  = s.empIdx != null ? p.employees[s.empIdx] : null
          const sub  = emp ? esc(`${emp.last_name ?? ''}, ${emp.first_name ?? ''}`) : 'Empty'
          return `<button class="booth-mini-tab${i === _activeSlot ? ' active' : ''}" data-slot="${i}">
            ${i === 0 ? 'Left Booth' : 'Right Booth'} · <em>${sub}</em>
          </button>`
        }).join('')}
      </div>`

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
        ${boothSel}
        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th style="width:2rem;text-align:center"><input type="checkbox" id="select-all-check" title="Select all"></th><th>Worker</th><th>DOB</th><th>Baseline</th><th>Status</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        ${_skipConfirm ? `
          <div class="info-card" style="border-color:var(--clr-border);margin-top:1rem">
            <p style="font-size:0.875rem;font-weight:500;margin-bottom:0.625rem">
              Skip ${_selected.size} worker${_selected.size !== 1 ? 's' : ''}?
            </p>
            <input class="search-input" id="bulk-skip-reason"
                   placeholder="Reason (optional — e.g. Worker absent)" style="margin-bottom:0.625rem">
            <div style="display:flex;gap:0.5rem">
              <button class="btn btn-danger btn-sm" id="confirm-bulk-skip">Confirm skip</button>
              <button class="btn btn-secondary btn-sm" id="cancel-bulk-skip">Cancel</button>
            </div>
          </div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1.25rem;gap:1rem;flex-wrap:wrap">
          <span style="font-size:0.875rem;color:var(--clr-subtle)">${nTotal ? `${nTested} of ${nTotal} tested${nSkip ? `, ${nSkip} skipped` : ''}` : ''}</span>
          <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
            ${_selected.size > 0 && !_skipConfirm
              ? `<button class="btn btn-secondary" id="skip-selected-btn">Skip selected (${_selected.size})</button>`
              : ''}
            <button class="btn btn-primary" id="submit-btn" ${allDone ? '' : 'disabled'}>Submit Packet →</button>
          </div>
        </div>
      </div>`

    container.querySelector('#back-btn')?.addEventListener('click', () => navigate('tt-inbox'))
    container.querySelectorAll('.booth-mini-tab[data-slot]').forEach(btn =>
      btn.addEventListener('click', () => { _activeSlot = Number(btn.dataset.slot); render() })
    )
    container.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx  = Number(btn.dataset.idx)
        const goTo = btn.dataset.goto != null ? Number(btn.dataset.goto) : null
        if (goTo != null) {
          _activeSlot = goTo
        } else {
          assignToSlot(_activeSlot, idx)
        }
        _mode   = 'test'
        _status = null
        render()
      })
    })
    const checkboxes = [...container.querySelectorAll('.worker-check')]
    const selectAll  = container.querySelector('#select-all-check')

    function syncSelectAll() {
      if (!selectAll) return
      const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked)
      const anyChecked = checkboxes.some(cb => cb.checked)
      selectAll.checked       = allChecked
      selectAll.indeterminate = anyChecked && !allChecked
    }

    function updateSkipBtn() {
      const btn = container.querySelector('#skip-selected-btn')
      if (btn) btn.textContent = `Skip selected (${_selected.size})`
      else if (_selected.size > 0) render()
    }

    selectAll?.addEventListener('change', () => {
      checkboxes.forEach(cb => {
        cb.checked = selectAll.checked
        const idx = Number(cb.dataset.idx)
        if (selectAll.checked) _selected.add(idx)
        else _selected.delete(idx)
      })
      updateSkipBtn()
    })

    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = Number(cb.dataset.idx)
        if (cb.checked) _selected.add(idx)
        else _selected.delete(idx)
        syncSelectAll()
        updateSkipBtn()
      })
    })

    syncSelectAll()
    container.querySelector('#skip-selected-btn')?.addEventListener('click', () => {
      _skipConfirm = true; render()
    })
    container.querySelector('#confirm-bulk-skip')?.addEventListener('click', () => {
      const reason = container.querySelector('#bulk-skip-reason')?.value.trim() || 'Worker absent'
      skipSelected(reason)
    })
    container.querySelector('#cancel-bulk-skip')?.addEventListener('click', () => {
      _skipConfirm = false; render()
    })
    container.querySelector('#submit-btn')?.addEventListener('click', runSubmit)
  }

  async function skipSelected(reason) {
    const indices = [..._selected]
    for (const idx of indices) {
      markEmployeeSkipped(_packet, _packet.employees[idx].employee_id, reason)
    }
    try {
      await saveTechPacket(techFolder, filename, _packet)
      _selected.clear()
      _skipConfirm = false
      _status = { ok: true, msg: `${indices.length} worker${indices.length !== 1 ? 's' : ''} marked as skipped.` }
      render()
    } catch (e) {
      _skipConfirm = false
      _status = { ok: false, msg: `Skip failed: ${e.message}` }
      render()
    }
  }

  function assignToSlot(slotIdx, empIdx) {
    const slot = _slots[slotIdx]
    const emp  = _packet.employees[empIdx]
    const last = emp.completed_tests?.slice(-1)[0]
    const vd   = _packet.visit?.visit_date ?? new Date().toISOString().slice(0, 10)

    _slots[slotIdx] = emptySlot(vd)
    const s = _slots[slotIdx]
    s.empIdx = empIdx

    if (last) {
      s.thresholds = { ...last.thresholds }
      s.testType   = last.test_type ?? 'Periodic'
      s.testDate   = last.test_date ?? vd
      s.notes      = last.notes ?? ''
      const q = last.questionnaire ?? {}
      s.pre  = { noise_2h: q.noise_2h ?? null, noise_2h_duration: q.noise_2h_duration ?? null,
                  wear_hpd: q.wear_hpd ?? null, hpd_class: q.hpd_class ?? null,
                  hpd_style: q.hpd_style ?? null, hpd_no_reason: q.hpd_no_reason ?? null,
                  employer_info: q.employer_info ?? null }
      s.post = { ear_infection: q.ear_infection ?? null, ear_surgery: q.ear_surgery ?? null,
                  dizziness: q.dizziness ?? null, head_injury: q.head_injury ?? null,
                  childhood_loss: q.childhood_loss ?? null, tinnitus: q.tinnitus ?? null,
                  tinnitus_ear: q.tinnitus_ear ?? null, tinnitus_duration: q.tinnitus_duration ?? null,
                  blast_exposure: q.blast_exposure ?? null, firearms: q.firearms ?? null,
                  firearms_type: q.firearms_type ?? null, firearms_shoulder: q.firearms_shoulder ?? null,
                  firearms_duration: q.firearms_duration ?? null }
    }
  }

  // ── Test view ──────────────────────────────────────────────────────────────

  function renderTest() {
    const p    = _packet
    const slot = _slots[_activeSlot]

    const boothBar = `
      <div class="booth-bar">
        ${_slots.map((s, i) => {
          const emp  = s.empIdx != null ? p.employees[s.empIdx] : null
          const name = emp ? `${emp.last_name ?? ''}, ${emp.first_name ?? ''}` : null
          return `<button class="booth-tab${i === _activeSlot ? ' active' : ''}" data-slot="${i}">
            <span class="booth-label">${i === 0 ? 'Left Booth' : 'Right Booth'}</span>
            <span class="booth-emp${name ? '' : ' empty'}">${name ? esc(name) : 'Empty — assign from worker list'}</span>
          </button>`
        }).join('')}
      </div>`

    if (slot.empIdx == null) {
      container.innerHTML = `
        <div class="screen-header-row">
          <button class="back-link" id="back-list">← Worker list</button>
          <h1>${esc(p.company?.name ?? 'Packet')}</h1>
        </div>
        <div class="screen-body">
          ${boothBar}
          <div style="text-align:center;padding:3rem 1rem;color:var(--clr-subtle)">
            No worker assigned to this booth.
            <div style="margin-top:1rem">
              <button class="btn btn-secondary" id="go-list">← Go to worker list to assign one</button>
            </div>
          </div>
        </div>`
      bindBoothTabs()
      container.querySelector('#back-list,#go-list')?.addEventListener('click', backToList)
      return
    }

    const emp = p.employees[slot.empIdx]

    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-list">← Worker list</button>
        <h1>${esc(`${emp.last_name ?? ''}, ${emp.first_name ?? ''}`)}</h1>
      </div>
      <div class="screen-body">
        ${boothBar}

        <div class="q-section">
          <div class="q-section-title">Worker Info</div>
          <div class="info-card" style="padding:1rem">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.625rem">
              <div><label class="field-label">Last name *</label>
                <input class="search-input" id="ef-last" value="${esc(emp.last_name ?? '')}" style="width:100%"></div>
              <div><label class="field-label">First name *</label>
                <input class="search-input" id="ef-first" value="${esc(emp.first_name ?? '')}" style="width:100%"></div>
              <div><label class="field-label">Middle name</label>
                <input class="search-input" id="ef-middle" value="${esc(emp.middle_name ?? '')}" style="width:100%"></div>
              <div><label class="field-label">Date of birth</label>
                <input class="search-input" id="ef-dob" type="date" value="${esc(emp.dob ?? '')}" style="width:100%"></div>
              <div><label class="field-label">Job title</label>
                <input class="search-input" id="ef-job" value="${esc(emp.job_title ?? '')}" style="width:100%"></div>
            </div>
          </div>
        </div>

        <div class="q-section">
          <div class="q-section-title">Pre-Test Questions</div>
          <div class="info-card" style="padding:1rem">${preQHTML(slot.pre)}</div>
        </div>

        <div class="q-section">
          <div class="q-section-title">Thresholds
            ${emp.baseline
              ? `<span style="font-size:0.75rem;font-weight:400;color:var(--clr-subtle);margin-left:0.5rem">Baseline: ${esc(emp.baseline.test_date ?? '')} shown faint</span>`
              : ''}</div>
          <div class="info-card" style="padding:1rem">
            <div style="display:flex;gap:0.75rem;margin-bottom:1rem">
              <div id="aud-left" style="flex:1;min-width:0"></div>
              <div id="aud-right" style="flex:1;min-width:0"></div>
            </div>
            <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
              <div><label class="field-label">Type</label>
                <select class="form-select" id="tf-type" style="width:auto">
                  ${['Periodic','Baseline','Exit'].map(t =>
                    `<option${(slot.testType ?? 'Periodic') === t ? ' selected' : ''}>${t}</option>`
                  ).join('')}
                </select></div>
              <div><label class="field-label">Date</label>
                <input class="search-input" id="tf-date" type="date" value="${esc(slot.testDate)}" style="width:auto"></div>
            </div>
            <div style="overflow-x:auto">
              <table class="data-table thr-table">
                <thead><tr><th></th>${FREQS.map(f => `<th>${f}</th>`).join('')}</tr></thead>
                <tbody>
                  ${thrRow('left',  '#2563eb', slot.thresholds)}
                  ${thrRow('right', '#dc2626', slot.thresholds)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="q-section">
          <div class="q-section-title">Post-Test Questions</div>
          <div class="info-card" style="padding:1rem">${postQHTML(slot.post)}</div>
        </div>

        <div class="q-section">
          <div class="q-section-title">Tech Notes</div>
          <div class="info-card" style="padding:1rem">
            <textarea class="search-input" id="tf-notes" rows="2"
              style="width:100%;resize:vertical">${esc(slot.notes)}</textarea>
          </div>
        </div>

        ${slot.skipMode ? `
          <div class="info-card" style="padding:1rem;margin-bottom:1rem;border-color:var(--clr-danger)">
            <p style="margin:0 0 0.75rem;font-weight:500">Mark ${esc(emp.first_name ?? 'this worker')} as skipped?</p>
            <input class="search-input" id="skip-reason" placeholder="Reason (optional, e.g. Worker absent)"
                   style="width:100%;margin-bottom:0.75rem">
            <div style="display:flex;gap:0.625rem">
              <button class="btn btn-danger btn-sm" id="confirm-skip">Confirm skip</button>
              <button class="btn btn-secondary btn-sm" id="cancel-skip">Never mind</button>
            </div>
          </div>` : ''}

        <div id="tf-err" style="color:var(--clr-danger);font-size:0.875rem;margin-bottom:0.5rem;display:none"></div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;padding-bottom:2rem">
          <button class="btn btn-primary" id="save-test-btn" ${slot.saving ? 'disabled' : ''}>${slot.saving ? 'Saving…' : 'Save test'}</button>
          ${!slot.skipMode ? `<button class="btn btn-secondary" id="skip-btn">Skip worker</button>` : ''}
          <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
        </div>

      </div>`

    // Events
    bindBoothTabs()
    container.querySelector('#back-list')?.addEventListener('click', backToList)
    container.querySelector('#cancel-btn')?.addEventListener('click', backToList)
    container.querySelector('#save-test-btn')?.addEventListener('click', saveTest)
    container.querySelector('#skip-btn')?.addEventListener('click', () => {
      captureSlot(); _slots[_activeSlot].skipMode = true; render()
    })
    container.querySelector('#cancel-skip')?.addEventListener('click', () => {
      _slots[_activeSlot].skipMode = false; render()
    })
    container.querySelector('#confirm-skip')?.addEventListener('click', () => {
      const reason = container.querySelector('#skip-reason')?.value.trim() || 'No reason given'
      skipWorker(reason)
    })

    wirePreQ()
    wirePostQ()
    wireAudiograms()
  }

  function wireAudiograms() {
    updateAudiograms()
    container.querySelectorAll('.thr-input').forEach(inp =>
      inp.addEventListener('input', updateAudiograms)
    )
  }

  function updateAudiograms() {
    const thr = {}
    container.querySelectorAll('.thr-input').forEach(sel => {
      const raw = sel.value
      thr[`${sel.dataset.ear}_${sel.dataset.freq}`] = raw === 'NR' ? 'NR' : (raw !== '' ? Number(raw) : null)
    })
    const slot     = _slots[_activeSlot]
    const baseline = slot.empIdx != null
      ? _packet.employees[slot.empIdx]?.baseline?.thresholds ?? null
      : null
    const leftEl  = container.querySelector('#aud-left')
    const rightEl = container.querySelector('#aud-right')
    if (leftEl)  leftEl.innerHTML  = audiogramSVG('left',  thr, baseline)
    if (rightEl) rightEl.innerHTML = audiogramSVG('right', thr, baseline)
  }

  function bindBoothTabs() {
    container.querySelectorAll('.booth-tab[data-slot]').forEach(btn =>
      btn.addEventListener('click', () => switchBooth(Number(btn.dataset.slot)))
    )
  }

  // ── Questionnaire HTML ─────────────────────────────────────────────────────

  function preQHTML(pre) {
    return `
      <div class="q-row">
        <span class="q-label">Have you been exposed to noise within the last two hours?</span>
        ${yesNo('noise_2h', pre.noise_2h)}
      </div>
      <div class="q-sub" id="sub-noise-dur"${pre.noise_2h !== true ? ' style="display:none"' : ''}>
        <div class="q-row">
          <span class="q-label">How long?</span>
          ${sel('pre-noise-dur',
            ['Less than 2 hours', '2-4 hours', 'Over 4 hours'],
            pre.noise_2h_duration)}
        </div>
      </div>

      <div class="q-row">
        <span class="q-label">Do you regularly wear hearing protection when you work in a noisy environment?</span>
        ${yesNo('wear_hpd', pre.wear_hpd)}
      </div>
      <div class="q-sub" id="sub-hpd-yes"${pre.wear_hpd !== true ? ' style="display:none"' : ''}>
        <div class="q-row">
          <span class="q-label">What class?</span>
          ${sel('pre-hpd-class', ['Class A', 'Class B', 'Class C', 'Dual'], pre.hpd_class)}
        </div>
        <div class="q-row">
          <span class="q-label">What style?</span>
          ${sel('pre-hpd-style',
            ['Both Earmuffs & Plugs', 'Earmuffs', 'Earplugs', 'Custom Molded Earplugs'],
            pre.hpd_style)}
        </div>
      </div>
      <div class="q-sub" id="sub-hpd-no"${pre.wear_hpd !== false ? ' style="display:none"' : ''}>
        <div class="q-row">
          <span class="q-label">Why not?</span>
          ${sel('pre-hpd-no-reason',
            ['Not Comfortable', "Can't Communicate", 'Blocks Sounds',
             'Not that noisy', 'Wrong Size', 'Other'],
            pre.hpd_no_reason)}
        </div>
      </div>

      <div class="q-row">
        <span class="q-label">Has your employer given you information about noise and noise induced hearing loss in the last year?</span>
        ${yesNo('employer_info', pre.employer_info)}
      </div>`
  }

  function postQHTML(post) {
    return `
      <div class="q-row">
        <span class="q-label">Have you ever had a severe ear infection?</span>
        ${yesNo('post_ear_infection', post.ear_infection)}
      </div>
      <div class="q-row">
        <span class="q-label">Have you ever had ear surgery?</span>
        ${yesNo('post_ear_surgery', post.ear_surgery)}
      </div>
      <div class="q-row">
        <span class="q-label">Have you ever had dizziness or balance problems?</span>
        ${yesNo('post_dizziness', post.dizziness)}
      </div>
      <div class="q-row">
        <span class="q-label">Have you ever had a serious head injury?</span>
        ${yesNo('post_head_injury', post.head_injury)}
      </div>
      <div class="q-row">
        <span class="q-label">Did you have hearing loss in childhood?</span>
        ${yesNo('post_childhood_loss', post.childhood_loss)}
      </div>

      <div class="q-row">
        <span class="q-label">Do you have ringing in your ears?</span>
        ${yesNo('post_tinnitus', post.tinnitus)}
      </div>
      <div class="q-sub" id="sub-tinnitus"${post.tinnitus !== true ? ' style="display:none"' : ''}>
        <div class="q-row" style="margin-top:0.25rem;gap:0.5rem;flex-wrap:wrap">
          <span class="q-label">Which ear?</span>
          ${sel('post-tinnitus-ear',
            [{value:'both',label:'Both'},{value:'left',label:'Left'},{value:'right',label:'Right'}],
            post.tinnitus_ear)}
          <span class="q-label">How long?</span>
          ${sel('post-tinnitus-dur',
            ['< 5 Years', '5-10 Years', '11-15 Years', '> 15 Years'],
            post.tinnitus_duration)}
        </div>
      </div>

      <div class="q-row">
        <span class="q-label">Have you ever had exposure to a loud blast or explosion?</span>
        ${yesNo('post_blast', post.blast_exposure)}
      </div>

      <div class="q-row">
        <span class="q-label">Have you ever used a firearm?</span>
        ${yesNo('post_firearms', post.firearms)}
      </div>
      <div class="q-sub" id="sub-firearms"${post.firearms !== true ? ' style="display:none"' : ''}>
        <div class="q-row" style="margin-top:0.25rem;gap:0.5rem;flex-wrap:wrap">
          <span class="q-label">Type of firearms?</span>
          ${sel('post-firearms-type',
            [{value:'both',label:'Both'},{value:'handguns',label:'Handguns'},{value:'rifles',label:'Rifles & Shotguns'}],
            post.firearms_type)}
          <span class="q-label">How many years?</span>
          ${sel('post-firearms-dur',
            ['Less than 10 Years', '10-20 Years', 'More than 20 Years'],
            post.firearms_duration)}
        </div>
        <div class="q-row" id="sub-firearms-shoulder"
             style="${['both','rifles'].includes(post.firearms_type) ? '' : 'display:none'}">
          <span class="q-label">From which shoulder did you shoot?</span>
          ${sel('post-firearms-shoulder',
            [{value:'both',label:'Both'},{value:'left',label:'Left'},{value:'right',label:'Right'}],
            post.firearms_shoulder)}
        </div>
      </div>`
  }

  function wirePreQ() {
    const cq = id => container.querySelector(id)
    container.querySelectorAll('input[name="noise_2h"]').forEach(inp =>
      inp.addEventListener('change', () => {
        cq('#sub-noise-dur').style.display = inp.value === 'true' ? '' : 'none'
      })
    )
    container.querySelectorAll('input[name="wear_hpd"]').forEach(inp =>
      inp.addEventListener('change', () => {
        const yes = inp.value === 'true'
        cq('#sub-hpd-yes').style.display = yes  ? '' : 'none'
        cq('#sub-hpd-no').style.display  = !yes ? '' : 'none'
      })
    )
  }

  function wirePostQ() {
    const cq = id => container.querySelector(id)
    container.querySelectorAll('input[name="post_tinnitus"]').forEach(inp =>
      inp.addEventListener('change', () => {
        cq('#sub-tinnitus').style.display = inp.value === 'true' ? '' : 'none'
      })
    )
    container.querySelectorAll('input[name="post_firearms"]').forEach(inp =>
      inp.addEventListener('change', () => {
        cq('#sub-firearms').style.display = inp.value === 'true' ? '' : 'none'
      })
    )
    cq('#post-firearms-type')?.addEventListener('change', e => {
      const needsShoulder = ['both', 'rifles'].includes(e.target.value)
      const shoulderRow = cq('#sub-firearms-shoulder')
      if (shoulderRow) shoulderRow.style.display = needsShoulder ? '' : 'none'
    })
  }

  // ── Slot capture ───────────────────────────────────────────────────────────

  function captureSlot() {
    const slot = _slots[_activeSlot]
    const q    = sel => container.querySelector(sel)
    const radio = name => {
      const el = container.querySelector(`input[name="${name}"]:checked`)
      return el ? el.value === 'true' : null
    }

    slot.empEdits = {
      last_name:   q('#ef-last')?.value.trim()   || null,
      first_name:  q('#ef-first')?.value.trim()  || null,
      middle_name: q('#ef-middle')?.value.trim() || null,
      dob:         q('#ef-dob')?.value            || null,
      job_title:   q('#ef-job')?.value.trim()    || null,
    }

    slot.testType = q('#tf-type')?.value  ?? 'Periodic'
    slot.testDate = q('#tf-date')?.value  ?? ''

    slot.thresholds = {}
    container.querySelectorAll('.thr-input').forEach(sel => {
      const key = `${sel.dataset.ear}_${sel.dataset.freq}`
      const raw = sel.value
      slot.thresholds[key] = raw === 'NR' ? 'NR' : (raw !== '' ? Number(raw) : null)
    })

    slot.pre = {
      noise_2h:          radio('noise_2h'),
      noise_2h_duration: q('#pre-noise-dur')?.value       || null,
      wear_hpd:          radio('wear_hpd'),
      hpd_class:         q('#pre-hpd-class')?.value       || null,
      hpd_style:         q('#pre-hpd-style')?.value       || null,
      hpd_no_reason:     q('#pre-hpd-no-reason')?.value   || null,
      employer_info:     radio('employer_info'),
    }

    slot.post = {
      ear_infection:     radio('post_ear_infection'),
      ear_surgery:       radio('post_ear_surgery'),
      dizziness:         radio('post_dizziness'),
      head_injury:       radio('post_head_injury'),
      childhood_loss:    radio('post_childhood_loss'),
      tinnitus:          radio('post_tinnitus'),
      tinnitus_ear:      q('#post-tinnitus-ear')?.value      || null,
      tinnitus_duration: q('#post-tinnitus-dur')?.value      || null,
      blast_exposure:    radio('post_blast'),
      firearms:          radio('post_firearms'),
      firearms_type:     q('#post-firearms-type')?.value     || null,
      firearms_shoulder: q('#post-firearms-shoulder')?.value || null,
      firearms_duration: q('#post-firearms-dur')?.value      || null,
    }

    slot.notes = q('#tf-notes')?.value.trim() ?? ''
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function switchBooth(toSlot) {
    if (toSlot === _activeSlot) return
    if (_slots[_activeSlot].empIdx != null) captureSlot()
    _activeSlot = toSlot
    render()
  }

  function backToList() {
    if (_slots[_activeSlot].empIdx != null) captureSlot()
    _mode = 'list'; _status = null; render()
  }

  async function saveTest() {
    captureSlot()
    const slot  = _slots[_activeSlot]
    const errEl = container.querySelector('#tf-err')

    if (!slot.testDate) { showErr(errEl, 'Test date is required.'); return }

    const anyThreshold = Object.values(slot.thresholds).some(v => v != null)
    if (!anyThreshold) { showErr(errEl, 'Enter at least one threshold value.'); return }

    const emp = _packet.employees[slot.empIdx]

    // Apply worker info corrections into the packet
    if (slot.empEdits) {
      if (slot.empEdits.last_name)  emp.last_name  = slot.empEdits.last_name
      if (slot.empEdits.first_name) emp.first_name = slot.empEdits.first_name
      emp.middle_name = slot.empEdits.middle_name ?? emp.middle_name
      emp.dob         = slot.empEdits.dob         ?? emp.dob
      emp.job_title   = slot.empEdits.job_title   ?? emp.job_title
    }

    slot.saving = true
    render()

    try {
      appendTestResult(_packet, emp.employee_id, {
        test_date:     slot.testDate,
        tech_id:       session.user?.user_id ?? null,
        test_type:     slot.testType,
        notes:         slot.notes || null,
        questionnaire: { ...slot.pre, ...slot.post },
        ...slot.thresholds
      })
      await saveTechPacket(techFolder, filename, _packet)

      const savedName  = `${emp.last_name ?? ''}, ${emp.first_name ?? ''}`
      const visitDate  = _packet.visit?.visit_date ?? new Date().toISOString().slice(0, 10)
      _slots[_activeSlot] = emptySlot(visitDate)
      _mode   = 'list'
      _status = { ok: true, msg: `${savedName} — test saved.` }
      render()
    } catch (e) {
      slot.saving = false
      render()
      showErr(container.querySelector('#tf-err'), `Save failed: ${e.message}`)
    }
  }

  async function skipWorker(reason) {
    captureSlot()
    const slot = _slots[_activeSlot]
    const emp  = _packet.employees[slot.empIdx]
    try {
      markEmployeeSkipped(_packet, emp.employee_id, reason)
      await saveTechPacket(techFolder, filename, _packet)
      const visitDate = _packet.visit?.visit_date ?? new Date().toISOString().slice(0, 10)
      const name = `${emp.last_name ?? ''}, ${emp.first_name ?? ''}`
      _slots[_activeSlot] = emptySlot(visitDate)
      _mode   = 'list'
      _status = { ok: true, msg: `${name} marked as skipped.` }
      render()
    } catch (e) {
      slot.skipMode = false; slot.saving = false
      _mode   = 'list'
      _status = { ok: false, msg: `Skip failed: ${e.message}` }
      render()
    }
  }

  async function runSubmit() {
    try {
      markSubmitted(_packet, session.user?.user_id)
      await submitTechPacket(techFolder, filename, _packet)
      navigate('tt-schedule')
    } catch (e) {
      _status = { ok: false, msg: `Submit failed: ${e.message}` }
      render()
    }
  }

  load()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function audiogramSVG(ear, thr, baseline) {
  const FKEYS   = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
  const FLABELS = ['500', '1K', '2K', '3K', '4K', '6K', '8K']
  const W = 260, H = 188
  const ml = 30, mr = 8, mt = 20, mb = 8
  const pw = W - ml - mr   // 222
  const ph = H - mt - mb   // 160

  const xOf = i  => ml + i * pw / (FKEYS.length - 1)
  const yOf = db => mt + db / 100 * ph

  const isLeft = ear === 'left'
  const color  = isLeft ? '#2563eb' : '#dc2626'
  const title  = isLeft ? 'Left Ear' : 'Right Ear'

  // Normal hearing zone (0–25 dB) shaded
  const normalZone = `<rect x="${ml}" y="${yOf(0)}" width="${pw}"
    height="${yOf(25) - yOf(0)}" fill="#f0fdf4"/>`

  // Horizontal grid lines
  const hLines = Array.from({ length: 11 }, (_, i) => i * 10).map(db => {
    const y = yOf(db)
    return `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}"
      stroke="${db % 20 === 0 ? '#d1d5db' : '#f3f4f6'}"
      stroke-width="${db % 20 === 0 ? 1 : 0.5}"/>`
  }).join('')

  // Vertical grid lines
  const vLines = FKEYS.map((_, i) =>
    `<line x1="${xOf(i)}" y1="${mt}" x2="${xOf(i)}" y2="${H - mb}"
      stroke="#e5e7eb" stroke-width="0.5"/>`
  ).join('')

  // Axis labels
  const freqLabels = FLABELS.map((lbl, i) =>
    `<text x="${xOf(i)}" y="${mt - 5}" font-size="7" text-anchor="middle" fill="#9ca3af">${lbl}</text>`
  ).join('')
  const dbLabels = [0, 20, 40, 60, 80, 100].map(db =>
    `<text x="${ml - 3}" y="${yOf(db) + 3}" font-size="7" text-anchor="end" fill="#9ca3af">${db}</text>`
  ).join('')

  const border = `<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}"
    fill="none" stroke="#d1d5db" stroke-width="1"/>`

  function plotLine(t, alpha) {
    const pts = FKEYS.map((f, i) => {
      const v = t[`${ear}_${f}`]
      if (v == null || v === 'NR') return null
      return { x: xOf(i), y: yOf(v) }
    })

    // Build path connecting consecutive non-null points
    let d = '', lastNull = true
    pts.forEach(p => {
      if (!p) { lastNull = true; return }
      d += lastNull ? `M${p.x},${p.y}` : `L${p.x},${p.y}`
      lastNull = false
    })

    const line = d
      ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${alpha < 1 ? 1 : 1.75}"
           opacity="${alpha}"${alpha < 1 ? ' stroke-dasharray="4,3"' : ''}/>`
      : ''

    const marks = pts.filter(Boolean).map(p => {
      if (isLeft) {
        const s = alpha < 1 ? 3 : 5
        return `<line x1="${p.x-s}" y1="${p.y-s}" x2="${p.x+s}" y2="${p.y+s}"
          stroke="${color}" stroke-width="${alpha < 1 ? 0.75 : 1.25}" opacity="${alpha}"/>
                <line x1="${p.x+s}" y1="${p.y-s}" x2="${p.x-s}" y2="${p.y+s}"
          stroke="${color}" stroke-width="${alpha < 1 ? 0.75 : 1.25}" opacity="${alpha}"/>`
      } else {
        return `<circle cx="${p.x}" cy="${p.y}" r="${alpha < 1 ? 3 : 5}"
          fill="none" stroke="${color}" stroke-width="${alpha < 1 ? 0.75 : 1.25}" opacity="${alpha}"/>`
      }
    }).join('')

    return line + marks
  }

  return `
    <div>
      <div style="text-align:center;font-size:0.8125rem;font-weight:600;color:${color};margin-bottom:2px">${title}</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
        ${normalZone}
        ${hLines}
        ${vLines}
        ${border}
        ${freqLabels}
        ${dbLabels}
        ${baseline ? plotLine(baseline, 0.3) : ''}
        ${plotLine(thr, 1)}
      </svg>
    </div>`
}

function yesNo(name, val) {
  return `<div class="yesno-group">
    <label class="yesno-btn"><input type="radio" name="${name}" value="true"${val === true ? ' checked' : ''}> Yes</label>
    <label class="yesno-btn"><input type="radio" name="${name}" value="false"${val === false ? ' checked' : ''}> No</label>
  </div>`
}

function sel(id, options, current) {
  const opts = options.map(o => {
    const v = o.value ?? o
    const l = o.label ?? o
    return `<option value="${esc(v)}"${current === v ? ' selected' : ''}>${esc(l)}</option>`
  }).join('')
  return `<select class="form-select" id="${id}" style="width:auto"><option value="">—</option>${opts}</select>`
}

function thrRow(ear, color, thr) {
  return `<tr>
    <td style="font-weight:600;color:${color};white-space:nowrap">${ear === 'left' ? 'Left' : 'Right'}</td>
    ${FREQS.map(f => {
      const val = thr[`${ear}_${f}`]
      const cur = val != null ? String(val) : ''
      const opts = THR_OPTIONS.map(o => {
        const v = o === '--' ? '' : String(o)
        return `<option value="${v}"${cur === v ? ' selected' : ''}>${o}</option>`
      }).join('')
      return `<td><select class="thr-input" data-ear="${ear}" data-freq="${f}" style="width:4rem">${opts}</select></td>`
    }).join('')}
  </tr>`
}

function miniThrTable(thr) {
  const cell = (ear, f) => {
    const v = thr?.[`${ear}_${f}`]
    return `<td style="text-align:center;padding:0.2rem 0.375rem">${v != null ? v : '—'}</td>`
  }
  return `<table style="width:100%;border-collapse:collapse;font-size:0.8125rem">
    <thead><tr>
      <th style="text-align:left;padding:0.2rem 0.375rem;min-width:1.5rem"></th>
      ${['500','1k','2k','3k','4k','6k','8k'].map(f =>
        `<th style="text-align:center;padding:0.2rem 0.375rem;font-weight:500">${f}</th>`).join('')}
    </tr></thead>
    <tbody>
      <tr><td style="padding:0.2rem 0.375rem;color:#2563eb;font-weight:600">L</td>
          ${['500','1k','2k','3k','4k','6k','8k'].map(f => cell('left',  f)).join('')}</tr>
      <tr><td style="padding:0.2rem 0.375rem;color:#dc2626;font-weight:600">R</td>
          ${['500','1k','2k','3k','4k','6k','8k'].map(f => cell('right', f)).join('')}</tr>
    </tbody>
  </table>`
}

function showErr(el, msg) {
  if (!el) return; el.textContent = msg; el.style.display = 'block'
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-CA',
      { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return d }
}
