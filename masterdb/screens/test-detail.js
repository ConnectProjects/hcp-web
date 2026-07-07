import { getTestById, updateTest } from '../db/tests.js'
import { logAction } from '../db/sqlite.js'

export function renderTestDetail(container, state, navigate) {
  const testId = state.params?.id
  redraw(container, state, navigate, testId)
}

function redraw(container, state, navigate, testId) {
  const t = getTestById(testId)
  if (!t) {
    container.innerHTML = `<div class="page"><p>Test record not found.</p></div>`
    return
  }

  const cls = parseJson(t.classification)
  const q   = parseJson(t.questionnaire)
  const cat = cls?.category ?? (typeof t.classification === 'string' && !t.classification.startsWith('{') ? t.classification : null)

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back-to-emp">${esc(t.last_name)}, ${esc(t.first_name)}</button>
          <span>›</span>
          <span>Test · ${esc((t.test_date||'').slice(0,10))}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" id="btn-edit-test">Edit Test</button>
          <button class="btn btn-outline btn-sm" onclick="window.print()">Print</button>
        </div>
      </div>

      <!-- Hero bar -->
      <div style="background:#76B214;color:white;padding:16px 20px;border-radius:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;opacity:.8">Company</div><div style="font-weight:600">${esc(t.company_name)}</div></div>
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;opacity:.8">Location</div><div style="font-weight:600">${esc(t.location_name)} (${esc(t.province)})</div></div>
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;opacity:.8">Test Date</div><div style="font-weight:600">${esc((t.test_date||'').slice(0,10))}</div></div>
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;opacity:.8">Type</div><div style="font-weight:600">${esc(t.test_type)}</div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

        <!-- Audiogram -->
        <div class="form-card" style="grid-column:span 2">
          <div class="form-card-header"><h2>Audiogram</h2></div>
          <table class="threshold-table" style="width:100%">
            <thead>
              <tr><th></th><th>500</th><th>1K</th><th>2K</th><th>3K</th><th>4K</th><th>6K</th><th>8K</th></tr>
            </thead>
            <tbody>
              <tr class="ear-right">
                <td class="th-ear" style="color:#d9534f;font-weight:700">R</td>
                ${['500','1k','2k','3k','4k','6k','8k'].map(f => `<td class="threshold-cell">${t['right_'+f] ?? '—'}</td>`).join('')}
              </tr>
              <tr class="ear-left">
                <td class="th-ear" style="color:#0056b3;font-weight:700">L</td>
                ${['500','1k','2k','3k','4k','6k','8k'].map(f => `<td class="threshold-cell">${t['left_'+f] ?? '—'}</td>`).join('')}
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Classification -->
        <div class="form-card">
          <div class="form-card-header"><h2>Classification</h2></div>
          ${cat
            ? `<div style="margin-bottom:12px">
                 <span class="class-badge class-${cat.toLowerCase()}">${esc(cat)}</span>
                 ${t.sts_flag ? ' <span class="sts-chip">STS</span>' : ''}
               </div>`
            : '<p class="td-muted">Not classified</p>'
          }
          <table style="font-size:13px;width:100%;border-collapse:collapse">
            ${row('Rule',     cls?.triggered_rule_id  ?? t.triggered_rule_id)}
            ${row('Ear',      cls?.triggering_ear     ?? t.triggering_ear)}
            ${row('Freq',     (cls?.triggering_freq_hz ?? t.triggering_freq_hz) ? (cls?.triggering_freq_hz ?? t.triggering_freq_hz) + ' Hz' : null)}
            ${row('Shift',    (cls?.shift_db ?? t.shift_db) ? (cls?.shift_db ?? t.shift_db) + ' dB' : null)}
          </table>
          ${t.counsel_text ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--grey-100)">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--grey-500);margin-bottom:4px">Counseling Notes</div>
              <p style="font-size:13px;line-height:1.6;margin:0">${esc(t.counsel_text)}</p>
            </div>
          ` : ''}
        </div>

        <!-- HPD Assessment -->
        <div class="form-card">
          <div class="form-card-header"><h2>HPD Assessment</h2></div>
          ${t.hpd_make_model ? `
            <table style="font-size:13px;width:100%;border-collapse:collapse">
              ${row('Model',          t.hpd_make_model)}
              ${row('Rated NRR',      t.rated_nrr        != null ? t.rated_nrr + ' dB' : null)}
              ${row('Derated NRR',    t.derated_nrr      != null ? t.derated_nrr + ' dB' : null)}
              ${row('LEX8hr',         t.lex8hr           != null ? t.lex8hr + ' dB(A)' : null)}
              ${row('Protected Exp.', t.protected_exposure != null ? t.protected_exposure + ' dB(A)' : null)}
              ${row('Adequacy',       t.adequacy ? `<span class="badge ${adequacyClass(t.adequacy)}">${esc(t.adequacy)}</span>` : null, true)}
            </table>
          ` : '<p class="td-muted">No HPD assessment recorded.</p>'}
          ${t.tech_notes ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--grey-100)">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--grey-500);margin-bottom:4px">Tech Notes</div>
              <p style="font-size:13px;line-height:1.6;font-style:italic;margin:0">${esc(t.tech_notes)}</p>
            </div>
          ` : ''}
        </div>

        <!-- Worker -->
        <div class="form-card">
          <div class="form-card-header"><h2>Worker</h2></div>
          <table style="font-size:13px;width:100%;border-collapse:collapse">
            ${row('Name',      `${esc(t.last_name)}, ${esc(t.first_name)}`, true)}
            ${row('DOB',       t.dob)}
            ${row('Job Title', t.job_title)}
            ${row('Province',  t.province)}
            ${row('Packet',    t.packet_id ? '#' + t.packet_id : null)}
          </table>
        </div>

        <!-- Referral -->
        <div class="form-card">
          <div class="form-card-header"><h2>Referral Status</h2></div>
          <table style="font-size:13px;width:100%;border-collapse:collapse">
            ${row('Given to worker',   `<span class="badge ${t.referral_given_to_worker  ? 'badge-success' : 'badge-neutral'}">${t.referral_given_to_worker  ? 'Yes' : 'No'}</span>`, true)}
            ${row('Sent to employer',  `<span class="badge ${t.referral_sent_to_employer ? 'badge-success' : 'badge-neutral'}">${t.referral_sent_to_employer ? 'Yes' : 'No'}</span>`, true)}
            ${t.referral_sent_date ? row('Sent date', t.referral_sent_date) : ''}
          </table>
        </div>

        <!-- Questionnaire -->
        ${q && Object.keys(q).length ? `
          <div class="form-card" style="grid-column:span 2">
            <div class="form-card-header"><h2>Questionnaire</h2></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 32px">
              ${renderQuestionnaire(q)}
            </div>
          </div>
        ` : ''}

      </div>
    </div>

    <!-- Edit Modal -->
    <div id="modal-edit-test" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box modal-box--wide">
        <div class="modal-header">
          <h2>Edit Test · ${esc((t.test_date||'').slice(0,10))}</h2>
          <button class="modal-close" id="edit-close">✕</button>
        </div>
        <div class="modal-body">

          <div class="form-grid">
            <div class="form-group">
              <label>Test Date</label>
              <input type="date" id="et-date" value="${esc((t.test_date||'').slice(0,10))}" />
            </div>
            <div class="form-group">
              <label>Test Type</label>
              <select id="et-type">
                ${['Periodic','Baseline','Re-test'].map(v => `<option${t.test_type===v?' selected':''}>${v}</option>`).join('')}
              </select>
            </div>
          </div>

          <h3 style="margin:16px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:var(--grey-500)">Thresholds</h3>
          <table class="threshold-table" style="width:100%">
            <thead><tr><th></th><th>500</th><th>1K</th><th>2K</th><th>3K</th><th>4K</th><th>6K</th><th>8K</th></tr></thead>
            <tbody>
              <tr class="ear-right">
                <td class="th-ear" style="color:#d9534f;font-weight:700">R</td>
                ${['500','1k','2k','3k','4k','6k','8k'].map(f =>
                  `<td><input type="number" class="thresh-input" data-ear="right" data-freq="${f}" value="${t['right_'+f]??''}" style="width:52px;text-align:center" /></td>`
                ).join('')}
              </tr>
              <tr class="ear-left">
                <td class="th-ear" style="color:#0056b3;font-weight:700">L</td>
                ${['500','1k','2k','3k','4k','6k','8k'].map(f =>
                  `<td><input type="number" class="thresh-input" data-ear="left" data-freq="${f}" value="${t['left_'+f]??''}" style="width:52px;text-align:center" /></td>`
                ).join('')}
              </tr>
            </tbody>
          </table>

          <div class="form-grid" style="margin-top:16px">
            <div class="form-group span-2">
              <label>Counseling Notes</label>
              <textarea id="et-counsel" rows="3">${esc(t.counsel_text ?? '')}</textarea>
            </div>
            <div class="form-group span-2">
              <label>Tech Notes</label>
              <textarea id="et-notes" rows="2">${esc(t.tech_notes ?? '')}</textarea>
            </div>
          </div>

          <h3 style="margin:16px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:var(--grey-500)">Referral</h3>
          <div class="form-grid">
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:normal">
                <input type="checkbox" id="et-ref-worker" ${t.referral_given_to_worker ? 'checked' : ''} />
                Given to worker
              </label>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:normal">
                <input type="checkbox" id="et-ref-employer" ${t.referral_sent_to_employer ? 'checked' : ''} />
                Sent to employer
              </label>
            </div>
            <div class="form-group">
              <label>Sent Date</label>
              <input type="date" id="et-ref-date" value="${esc(t.referral_sent_date ?? '')}" />
            </div>
          </div>

          ${q && Object.keys(q).length ? `
            <h3 style="margin:16px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:var(--grey-500)">Questionnaire</h3>
            <div class="form-grid">
              ${renderQuestionnaireEdit(q)}
            </div>
          ` : ''}

        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="edit-cancel">Cancel</button>
          <button class="btn btn-primary" id="edit-save">Save Changes</button>
        </div>
      </div>
    </div>
  `

  container.querySelector('#btn-back-to-emp').onclick = () =>
    navigate('employee-detail', { currentEmployee: { employee_id: t.employee_id } })

  const editModal = container.querySelector('#modal-edit-test')
  container.querySelector('#btn-edit-test').onclick          = () => editModal.classList.remove('hidden')
  container.querySelector('#edit-close').onclick             = () => editModal.classList.add('hidden')
  container.querySelector('#edit-cancel').onclick            = () => editModal.classList.add('hidden')
  editModal.querySelector('.modal-backdrop').onclick         = () => editModal.classList.add('hidden')

  container.querySelector('#edit-save').onclick = () => {
    const date = container.querySelector('#et-date').value
    const type = container.querySelector('#et-type').value
    if (!date) { alert('Date is required.'); return }

    const thresholds = {}
    container.querySelectorAll('.thresh-input').forEach(input => {
      thresholds[`${input.dataset.ear}_${input.dataset.freq}`] =
        input.value !== '' ? Number(input.value) : null
    })

        let updatedQ = null
    if (q) {
      updatedQ = { pre: q.pre ? {} : undefined, post: q.post ? {} : undefined }
      container.querySelectorAll('.q-field').forEach(input => {
        const section = input.dataset.section
        const key     = input.dataset.key
        const val     = input.value
        if (section && updatedQ[section] !== undefined) {
          updatedQ[section][key] = val === 'true' ? true : val === 'false' ? false : val || null
        }
      })
    }

    updateTest(Number(testId), {
      test_date:                 date,
      test_type:                 type,
      province:                  t.province,
      counsel_text:              container.querySelector('#et-counsel').value.trim() || null,
      tech_notes:                container.querySelector('#et-notes').value.trim()   || null,
      referral_given_to_worker:  container.querySelector('#et-ref-worker').checked   ? 1 : 0,
      referral_sent_to_employer: container.querySelector('#et-ref-employer').checked ? 1 : 0,
      referral_sent_date:        container.querySelector('#et-ref-date').value       || null,
      questionnaire:             updatedQ,
      ...thresholds
    })

    logAction(state, 'UPDATE_TEST', `Edited ${type} test (${date}) for "${t.last_name}, ${t.first_name}"`)
    editModal.classList.add('hidden')
    redraw(container, state, navigate, testId)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(label, value, raw = false) {
  if (value === null || value === undefined || value === '') return ''
  const display = raw ? value : esc(String(value))
  return `
    <tr>
      <td style="color:var(--grey-500);padding:5px 0;width:140px;font-size:13px;vertical-align:top">${label}</td>
      <td style="padding:5px 0;font-size:13px">${display}</td>
    </tr>`
}

function renderQuestionnaire(q) {
  // Fallback: flat structure with no pre/post sections
  if (!q.pre && !q.post) {
    return Object.entries(q)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
      .map(([k, v]) => qrow(prettyKey(k), String(v)))
      .join('')
  }

  const out = []

  if (q.pre != null) {
    const p = q.pre
    out.push(qsection('Pre-Test'))
    out.push(qrow('Exposed to noise in the last 2 hours?',
      p.noise_2h != null
        ? (p.noise_2h ? `Yes${p.noise_2h_duration ? ' — ' + p.noise_2h_duration + ' hrs' : ''}` : 'No')
        : null))
    out.push(qrow('Regularly wears hearing protection?',
      p.wear_hpd != null ? (p.wear_hpd ? 'Yes' : 'No') : null))
    if (p.wear_hpd) {
      out.push(qrow('HPD Class', p.hpd_class || null))
      out.push(qrow('HPD Style', p.hpd_style || null))
    }
    if (p.wear_hpd === false || p.wear_hpd === 0) {
      out.push(qrow('Reason not wearing HPD', p.hpd_no_reason || null))
    }
    out.push(qrow('Employer provided noise information in the last year?',
      p.employer_info != null ? (p.employer_info ? 'Yes' : 'No') : null))
  }

  if (q.post != null) {
    const p = q.post
    out.push(qsection('Medical History'))
    out.push(qrow('Ever had a severe ear infection?',     yn(p.ear_infection)))
    out.push(qrow('Ever had ear surgery?',                yn(p.ear_surgery)))
    out.push(qrow('Ever had a serious head injury?',      yn(p.head_injury)))
    out.push(qrow('Hearing loss during childhood?',       yn(p.childhood_loss)))
    if (p.tinnitus || p.tinnitus === false || p.tinnitus === 0) {
      let tinVal = p.tinnitus ? 'Yes' : 'No'
      if (p.tinnitus) {
        if (p.tinnitus_ear)      tinVal += ' — ' + p.tinnitus_ear + ' ear'
        if (p.tinnitus_duration) tinVal += ' · ' + p.tinnitus_duration
      }
      out.push(qrow('Ringing in ears (tinnitus)?', tinVal))
    }
    out.push(qsection('Recreational Noise'))
    if (p.firearms || p.firearms === false || p.firearms === 0) {
      let faVal = p.firearms ? 'Yes' : 'No'
      if (p.firearms) {
        const parts = [p.firearms_type, p.firearms_shoulder ? p.firearms_shoulder + ' shoulder' : null, p.firearms_duration].filter(Boolean)
        if (parts.length) faVal += ' — ' + parts.join(' · ')
      }
      out.push(qrow('Uses firearms?', faVal))
    }
  }

  return out.filter(Boolean).join('')
}

function yn(v) {
  if (v === null || v === undefined) return null
  return (v === true || v === 1 || v === 'true') ? 'Yes' : 'No'
}

function qsection(label) {
  return `<div style="grid-column:span 2;font-size:11px;font-weight:700;text-transform:uppercase;
    color:var(--grey-500);margin:10px 0 2px;padding-bottom:4px;border-bottom:1px solid var(--grey-100)">${label}</div>`
}

function qrow(label, value) {
  if (value === null || value === undefined || value === '') return ''
  return `
    <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--grey-100);font-size:13px">
      <span style="color:var(--grey-500);min-width:180px">${label}</span>
      <span>${esc(String(value))}</span>
    </div>`
}

function renderQuestionnaireEdit(q) {
  const pre  = q.pre  ?? {}
  const post = q.post ?? {}
  const fields = []

  // Pre fields
  const preFields = [
    ['noise_2h',          'Noise exposure < 2h (true/false)'],
    ['noise_2h_duration', 'Noise duration'],
    ['wear_hpd',          'Wears HPD (true/false)'],
    ['hpd_class',         'HPD Class'],
    ['hpd_style',         'HPD Style'],
    ['hpd_no_reason',     'Reason not wearing HPD'],
    ['employer_info',     'Employer info given (true/false)'],
  ]
  const postFields = [
    ['ear_infection',   'Ear infection (true/false)'],
    ['ear_surgery',     'Ear surgery (true/false)'],
    ['head_injury',     'Head injury (true/false)'],
    ['childhood_loss',  'Childhood hearing loss (true/false)'],
    ['tinnitus',        'Tinnitus (true/false)'],
    ['tinnitus_ear',    'Tinnitus ear'],
    ['tinnitus_duration','Tinnitus duration'],
    ['firearms',        'Uses firearms (true/false)'],
    ['firearms_type',   'Firearms type'],
    ['firearms_shoulder','Firearms shoulder'],
    ['firearms_duration','Firearms duration'],
  ]

  if (q.pre !== undefined) {
    fields.push(`<div class="form-group span-2" style="margin-bottom:4px"><strong style="font-size:12px;color:var(--grey-500)">PRE-TEST</strong></div>`)
    preFields.forEach(([k, label]) => {
      fields.push(`
        <div class="form-group">
          <label>${label}</label>
          <input type="text" class="q-field" data-section="pre" data-key="${k}" value="${esc(String(pre[k] ?? ''))}" />
        </div>`)
    })
  }

  if (q.post !== undefined) {
    fields.push(`<div class="form-group span-2" style="margin-top:8px;margin-bottom:4px"><strong style="font-size:12px;color:var(--grey-500)">POST-TEST (MEDICAL HISTORY)</strong></div>`)
    postFields.forEach(([k, label]) => {
      fields.push(`
        <div class="form-group">
          <label>${label}</label>
          <input type="text" class="q-field" data-section="post" data-key="${k}" value="${esc(String(post[k] ?? ''))}" />
        </div>`)
    })
  }

  return fields.join('')
}

function prettyKey(k) {
  return k
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim()
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
