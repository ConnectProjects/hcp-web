import { query } from '../db/sqlite.js'

export function renderProvinceRules(container, state, navigate) {
  const provinces = query('SELECT * FROM provinces WHERE active = 1 ORDER BY province_code')
  const selected  = state.params?.province ?? provinces[0]?.province_code ?? 'AB'

  const rules     = query(
    `SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC, category_code`,
    [selected]
  )
  const counsel   = query(
    `SELECT * FROM counsel_templates WHERE province_code = ? ORDER BY category_code`,
    [selected]
  )
  const province  = provinces.find(p => p.province_code === selected)

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back">Settings</button>
          <span>›</span>
          <span>Province Rules</span>
        </div>
        <div class="header-actions">
          ${provinces.map(p => `
            <button class="btn btn-sm ${p.province_code === selected ? 'btn-primary' : 'btn-outline'} btn-province"
              data-province="${p.province_code}">
              ${p.province_code}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="rules-intro">
        <strong>${esc(province?.province_name ?? selected)}</strong>
        ${province?.regulation_ref ? `<span class="td-muted"> — ${esc(province.regulation_ref)}</span>` : ''}
        <p class="section-desc" style="margin-top:6px">
          These rules are read-only — they are derived directly from the provincial regulations
          and hard-coded into the classification engine. Contact your administrator to update
          them if regulations change.
        </p>
      </div>

      <!-- Classification rules -->
      <div class="rules-section">
        <h2>Classification Rules <span class="packets-count packets-count--muted">${rules.length}</span></h2>
        ${rules.length === 0
          ? '<p class="empty-note">No rules loaded for this province.</p>'
          : `<table class="data-table rules-table">
              <thead>
                <tr>
                  <th>Category</th><th>Rule Type</th><th>Threshold</th>
                  <th>Freq Range</th><th>Basis</th><th>Follow-up</th><th>Referral</th>
                </tr>
              </thead>
              <tbody>
                ${rules.map(r => `
                  <tr>
                    <td><span class="class-badge class-${catClass(r.category_code)}">${esc(r.category_code)}</span>
                        <span class="td-muted" style="font-size:11px;margin-left:4px">${esc(r.category_label)}</span></td>
                    <td>${esc(r.rule_type)}</td>
                    <td>${r.threshold_db} dB</td>
                    <td>${freqRange(r)}</td>
                    <td>${esc(r.comparison_basis)}</td>
                    <td>${r.followup_months != null ? r.followup_months + ' mo.' : '—'}</td>
                    <td>${r.requires_referral ? '<span class="badge badge-warn">Yes</span>' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>

      <!-- Counsel templates -->
      <div class="rules-section">
        <h2>Counsel Templates <span class="packets-count packets-count--muted">${counsel.length}</span></h2>
        ${counsel.length === 0
          ? '<p class="empty-note">No counsel templates loaded for this province.</p>'
          : counsel.map(t => `
              <div class="counsel-template-card">
                <div class="counsel-template-head">
                  <span class="class-badge class-${catClass(t.category_code)}">${esc(t.category_code)}</span>
                  <strong>${esc(t.category_label)}</strong>
                </div>
                <p class="counsel-template-text">${esc(t.summary_text)}</p>
                ${t.tech_notes ? `<p class="counsel-template-notes"><em>Tech notes: ${esc(t.tech_notes)}</em></p>` : ''}
              </div>
            `).join('')
        }
      </div>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('settings'))

  container.querySelectorAll('.btn-province').forEach(btn => {
    btn.addEventListener('click', () =>
      navigate('province-rules', { params: { province: btn.dataset.province } })
    )
  })
}

function catClass(code) {
  return { N: 'n', EW: 'ew', A: 'a', NC: 'nc', EWC: 'ewc', AC: 'ac' }[code] ?? ''
}

function freqRange(r) {
  if (r.freq_range_low != null && r.freq_range_high != null)
    return `${r.freq_range_low}–${r.freq_range_high} Hz`
  if (r.freq_range_low != null) return `≥ ${r.freq_range_low} Hz`
  return '—'
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
