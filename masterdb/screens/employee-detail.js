import { query, queryOne, run }  from '../db/sqlite.js'
import { deleteTest, createTest, updateTest } from '../db/tests.js'
import { createBaseline } from '../db/employees.js'
import { openReferralPrintWindow } from '@shared/referral-form.js'

const REFERRAL_CATS = new Set(['A', 'AC', 'EW'])

export function renderEmployeeDetail(container, state, navigate) {
  const empId = state.currentEmployee?.employee_id || state.params?.id
  if (!empId) { navigate('companies'); return }

  redraw(container, state, navigate, empId)
}

function redraw(container, state, navigate, empId) {
  const emp = queryOne(`
    SELECT e.*,
      l.name AS location_name, l.province, l.location_id,
      l.company_id,
      c.name AS company_name
    FROM employees e
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id  = l.company_id
    WHERE e.employee_id = ?
  `, [empId])
  if (!emp) { navigate('companies'); return }

  const locationId = emp.location_id

  const baseline = queryOne(`
    SELECT * FROM baselines
    WHERE employee_id = ? AND location_id = ? AND archived = 0
    ORDER BY test_date DESC LIMIT 1
  `, [empId, locationId])

  const tests = query(`
    SELECT t.*, h.hpd_make_model, h.rated_nrr, h.derated_nrr, h.lex8hr, h.protected_exposure, h.adequacy
    FROM tests t
    LEFT JOIN hpd_assessments h ON h.test_id = t.test_id
    WHERE t.employee_id = ?
    ORDER BY t.test_date DESC
  `, [empId])

  const orgProfile = loadOrgProfile()
  const location   = { name: emp.location_name, province: emp.province }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back-companies">Companies</button>
          <span>›</span>
          <button class="btn btn-link" id="btn-back-company">${esc(emp.company_name)}</button>
          <span>›</span>
          <button class="btn btn-link" id="btn-back-location">${esc(emp.location_name)}</button>
          <span>›</span>
          <span>${esc(emp.last_name)}, ${esc(emp.first_name)}</span>
        </div>
      </div>

      <!-- Employee header -->
      <div class="company-hero" style="margin-bottom:16px">
        <div class="company-hero-info">
          <h1>${esc(emp.last_name)}, ${esc(emp.first_name)}</h1>
          <div class="company-meta">
            <span class="province-badge">${esc(emp.province)}</span>
            ${emp.job_title ? `<span>${esc(emp.job_title)}</span>` : ''}
            ${emp.dob       ? `<span>DOB: ${esc(emp.dob)}</span>` : ''}
            <span class="badge ${emp.status === 'active' ? 'badge-success' : 'badge-neutral'}">${esc(emp.status ?? 'active')}</span>
          </div>
          <div class="company-meta" style="margin-top:4px;font-size:12px;color:var(--grey-500)">
            ${esc(emp.company_name)} › ${esc(emp.location_name)}
          </div>
        </div>
        <div class="company-kpis">
          <div class="ckpi">
            <span class="ckpi-n">${tests.length}</span>
            <span>Tests</span>
          </div>
          <div class="ckpi ${baseline ? '' : 'ckpi--warn'}">
            <span class="ckpi-n">${baseline ? '✓' : '✗'}</span>
            <span>Baseline</span>
          </div>
          <div class="ckpi ${tests.some(t => t.sts_flag) ? 'ckpi--warn' : ''}">
            <span class="ckpi-n">${tests.filter(t => t.sts_flag).length}</span>
            <span>STS Flags</span>
          </div>
        </div>
      </div>

      <!-- Baseline audiogram -->
      ${baseline ? `
        <div class="form-card" style="margin-bottom:16px">
          <div class="form-card-header">
            <h2>Baseline Audiogram <span class="td-muted" style="font-size:12px;font-weight:400">· ${esc(baseline.test_date)}</span></h2>
          </div>
          ${buildAudiogramCard(baseline, null, false)}
        </div>
      ` : `
        <div class="alert alert-warn" style="margin-bottom:16px">
          No baseline on file for this location. Periodic tests cannot be fully classified until a baseline is recorded.
        </div>
      `}

      <div class="form-card">
        <div class="form-card-header">
          <h2>Test History</h2>
          <button class="btn btn-outline btn-sm" id="btn-manual-test" style="margin-left:auto">+ Manual Entry</button>
        </div>
        <div class="test-history-list">
          ${tests.length === 0
            ? '<p class="empty-note" style="padding:16px">No test records on file.</p>'
            : tests.map(t => renderTestCard(t, baseline, emp, location, orgProfile)).join('')
          }
        </div>
      </div>
    </div>

    <!-- Manual Test Modal -->
    <div id="modal-test" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box modal-box--wide">
        <div class="modal-header">
          <h2>Manual Test Entry</h2>
          <button class="modal-close" id="modal-close-test">✕</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="mt-test-id" value="" />
          <p class="section-note" style="margin-bottom:12px">Note: Manual entry does not perform auto-classification. Use TechTool for full diagnostic logic.</p>
          <div class="form-grid">
            <div class="form-group">
              <label>Test Date *</label>
              <input type="date" id="mt-date" value="${new Date().toISOString().slice(0,10)}" />
            </div>
            <div class="form-group">
              <label>Test Type *</label>
              <select id="mt-type">
                <option value="Periodic">Periodic</option>
                <option value="Baseline">Baseline</option>
                <option value="Re-test">Re-test</option>
              </select>
            </div>
          </div>
          <div class="audiogram-card" style="margin-top:16px">
            <table class="threshold-table">
              <thead>
                <tr>
                  <th class="th-ear"></th>
                  <th>500</th><th>1K</th><th>2K</th><th>3K</th><th>4K</th><th>6K</th><th>8K</th>
                </tr>
              </thead>
              <tbody>
                <tr class="ear-right">
                  <td class="th-ear">R</td>
                  ${['500','1k','2k','3k','4k','6k','8k'].map(f =>
                    `<td><input type="number" class="thresh-input" data-ear="right" data-freq="${f}" style="width:50px;text-align:center" /></td>`
                  ).join('')}
                </tr>
                <tr class="ear-left">
                  <td class="th-ear">L</td>
                  ${['500','1k','2k','3k','4k','6k','8k'].map(f =>
                    `<td><input type="number" class="thresh-input" data-ear="left" data-freq="${f}" style="width:50px;text-align:center" /></td>`
                  ).join('')}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-cancel-test">Cancel</button>
          <button class="btn btn-primary" id="btn-save-test">Save Test</button>
        </div>
      </div>
    </div>
  `

  // Navigation
  container.querySelector('#btn-back-companies').addEventListener('click', () => navigate('companies'))
  container.querySelector('#btn-back-company').addEventListener('click', () =>
    navigate('company-detail', { currentCompany: { company_id: emp.company_id } })
  )
  container.querySelector('#btn-back-location').addEventListener('click', () =>
    navigate('location-detail', { currentLocation: { location_id: locationId } })
  )

  // Test Detail Navigation (Clicking a card)
  container.querySelectorAll('.test-card').forEach(card => {
    card.addEventListener('click', e => {
      // Don't navigate if clicking a button inside the card
      if (e.target.closest('button')) return;
      const testId = Number(card.dataset.testId)
      navigate('test-detail', { id: testId })
    })
  })

  // Referral buttons
  container.querySelectorAll('.btn-print-referral').forEach(btn => {
    btn.addEventListener('click', () => {
      const testId = Number(btn.dataset.testId)
      const test   = tests.find(t => t.test_id === testId)
      if (!test) return
      const cls = parseClassification(test.classification)
      openReferralPrintWindow({
        org:            orgProfile,
        worker:         emp,
        employer:       location,
        test_date:      test.test_date,
        test_type:      test.test_type,
        classification: cls,
        thresholds:     extractThresholds(test),
        baseline:       baseline ? extractThresholds(baseline) : null,
        counsel_text:   test.counsel_text ?? '',
        tech:           getTechForTest(test.tech_id)
      })
    })
  })

  // Mark referral sent
  container.querySelectorAll('.btn-mark-sent').forEach(btn => {
    btn.addEventListener('click', () => {
      const testId = Number(btn.dataset.testId)
      run(`UPDATE tests SET referral_sent_to_employer = 1, referral_sent_date = date('now')
           WHERE test_id = ?`, [testId])
      redraw(container, state, navigate, empId)
    })
  })

  // Delete test
  container.querySelectorAll('.btn-delete-test').forEach(btn => {
    btn.addEventListener('click', () => {
      const testId = Number(btn.dataset.testId)
      const test   = tests.find(t => t.test_id === testId)
      if (!test) return
      if (!confirm(`Permanently delete the test from ${test.test_date}? This cannot be undone.`)) return
      deleteTest(testId)
      redraw(container, state, navigate, empId)
    })
  })

  // Manual test modal
  const testModal = container.querySelector('#modal-test')

  container.querySelector('#btn-manual-test').addEventListener('click', () => {
    container.querySelector('#mt-test-id').value = ''
    container.querySelector('#mt-date').value    = new Date().toISOString().slice(0,10)
    container.querySelector('#mt-type').value    = 'Periodic'
    container.querySelectorAll('.thresh-input').forEach(i => i.value = '')
    testModal.classList.remove('hidden')
  })

  container.querySelectorAll('.btn-edit-test').forEach(btn => {
    btn.addEventListener('click', () => {
      const testId = Number(btn.dataset.testId)
      const test   = tests.find(t => t.test_id === testId)
      if (!test) return
      container.querySelector('#mt-test-id').value = testId
      container.querySelector('#mt-date').value    = test.test_date
      container.querySelector('#mt-type').value    = test.test_type
      container.querySelectorAll('.thresh-input').forEach(input => {
        input.value = test[`${input.dataset.ear}_${input.dataset.freq}`] ?? ''
      })
      testModal.classList.remove('hidden')
    })
  })

  container.querySelector('#btn-cancel-test').addEventListener('click',  () => testModal.classList.add('hidden'))
  container.querySelector('#modal-close-test').addEventListener('click', () => testModal.classList.add('hidden'))

  container.querySelector('#btn-save-test').addEventListener('click', () => {
    const testId = container.querySelector('#mt-test-id').value
    const date   = container.querySelector('#mt-date').value
    const type   = container.querySelector('#mt-type').value
    if (!date) { alert('Date is required.'); return }

    const thresholds = {}
    container.querySelectorAll('.thresh-input').forEach(input => {
      thresholds[`${input.dataset.ear}_${input.dataset.freq}`] =
        input.value ? Number(input.value) : null
    })

    const data = {
      employee_id: empId,
      location_id: locationId,
      test_date:   date,
      test_type:   type,
      province:    emp.province,
      ...thresholds
    }

    if (testId) updateTest(Number(testId), data)
    else        createTest(data)

    if (type === 'Baseline') {
      createBaseline(empId, locationId, date, thresholds)
    }

    testModal.classList.add('hidden')
    redraw(container, state, navigate, empId)
  })
}

// ---------------------------------------------------------------------------
// Test card renderer
// ---------------------------------------------------------------------------

function renderTestCard(test, baseline, emp, location, orgProfile) {
  const cls      = parseClassification(test.classification)
  const cat      = cls?.category ?? null
  const needsRef = cat && REFERRAL_CATS.has(cat)
  const refGiven = !!test.referral_given_to_worker
  const refSent  = !!test.referral_sent_to_employer
  const sentDate = test.referral_sent_date ?? null

  const questionnaire = test.questionnaire ? parseJson(test.questionnaire) : null

  return `
    <div class="test-card ${test.sts_flag ? 'test-card--flagged' : ''} clickable-card" data-test-id="${test.test_id}">
      <div class="test-card-header">
        <div class="test-card-meta">
          <span class="test-date">${esc(test.test_date)}</span>
          <span class="test-type">${esc(test.test_type)}</span>
          ${cat ? `<span class="class-badge class-${(cat ?? 'n').toLowerCase()}">${esc(cat)}</span>` : ''}
          ${test.sts_flag ? '<span class="sts-chip">STS</span>' : ''}
          <div style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-link btn-sm btn-edit-test" data-test-id="${test.test_id}" style="text-decoration:none">Edit</button>
            <button class="btn btn-link btn-sm btn-delete-test" data-test-id="${test.test_id}" style="color:var(--red);text-decoration:none">Remove</button>
            <span class="td-muted" style="font-size: 18px; margin-left: 4px;">›</span>
          </div>
        </div>
        ${needsRef ? `
          <div class="referral-status-row">
            <span class="referral-status-item ${refGiven ? 'ref-done' : 'ref-pending'}">
              ${refGiven ? '✓' : '○'} Given to worker
            </span>
            <span class="referral-status-item ${refSent ? 'ref-done' : 'ref-pending'}">
              ${refSent ? '✓' : '○'} Sent to employer${sentDate ? ' · ' + esc(sentDate) : ''}
            </span>
            ${!refSent ? `<button class="btn btn-sm btn-outline btn-mark-sent" data-test-id="${test.test_id}">Mark Sent</button>` : ''}
            <button class="btn btn-sm btn-ghost btn-print-referral" data-test-id="${test.test_id}">🖨 Referral Form</button>
          </div>
        ` : ''}
      </div>

      ${buildAudiogramCard(test, baseline ? extractThresholds(baseline) : null, test.test_type !== 'Baseline')}

      ${test.tech_notes ? `
        <div class="test-counsel" style="border-top: none; padding-top: 0;">
          <div class="test-counsel-label">Tech Notes</div>
          <div class="test-counsel-text td-muted">${esc(test.tech_notes)}</div>
        </div>
      ` : ''}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Inline audiogram card
// ---------------------------------------------------------------------------

function buildAudiogramCard(test, baselineThresholds, showShifts) {
  const FREQ_LABELS = ['500', '1K', '2K', '3K', '4K', '6K', '8K']
  const FREQ_KEYS = {
    left:  ['left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k'],
    right: ['right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k']
  }

  function row(ear) {
    return FREQ_KEYS[ear].map(key => {
      const val   = test[key]
      const disp  = val != null ? String(val) : '—'
      const shift = (showShifts && baselineThresholds && val != null && baselineThresholds[key] != null)
        ? Number(val) - Number(baselineThresholds[key]) : null
      const shiftStr = shift !== null
        ? `<span class="threshold-shift ${shift > 0 ? 'shift-worse' : 'shift-better'}">${shift > 0 ? '+' : ''}${shift}</span>`
        : ''
      return `<td class="threshold-cell">${disp}${shiftStr}</td>`
    }).join('')
  }

  return `
    <div class="audiogram-card">
      <table class="threshold-table">
        <thead>
          <tr>
            <th class="th-ear"></th>
            ${FREQ_LABELS.map(f => `<th>${f}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr class="ear-right"><td class="th-ear">R</td>${row('right')}</tr>
          <tr class="ear-left" ><td class="th-ear">L</td>${row('left')}</tr>
        </tbody>
      </table>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadOrgProfile() {
  const get = k => queryOne(`SELECT value FROM settings WHERE key = ?`, [k])?.value ?? ''
  return {
    name: get('org_name'), address: get('org_address'), city: get('org_city'),
    province: get('org_province'), postal: get('org_postal'),
    phone: get('org_phone'), email: get('org_email'),
    website: get('org_website'), logoUrl: get('company_logo')
  }
}

function getTechForTest(techId) {
  if (!techId) return { name: '', iat_number: '' }
  // Updated to join from users table
  return queryOne('SELECT name, iat_number FROM users WHERE user_id = ?', [techId]) ?? { name: '', iat_number: '' }
}

function extractThresholds(record) {
  const keys = ['left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
                 'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k']
  const out = {}
  for (const k of keys) out[k] = record[k] ?? null
  return out
}

function parseClassification(val) {
  if (!val) return null
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function parseJson(val) {
  if (!val) return null
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function adequacyClass(a) {
  return { Adequate: 'badge-success', Marginal: 'badge-warn', Inadequate: 'badge-error' }[a] ?? 'badge-neutral'
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Add CSS for clickable cards if not already in style.css
const styleId = 'employee-detail-styles';
if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .clickable-card {
      transition: transform 0.1s, box-shadow 0.1s;
      cursor: pointer;
    }
    .clickable-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--navy-light);
    }
  `;
  document.head.appendChild(style);
}