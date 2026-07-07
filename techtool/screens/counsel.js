import { openReferralPrintWindow } from '@shared/referral-form.js'
import { getSetting }              from '../db/idb.js'

const REFERRAL_CATS = new Set(['A', 'AC', 'EW'])

export function renderCounsel(container, state, navigate) {
  const emp    = state.currentEmployee
  const result = state.classResult
  const cat    = result?.category ?? 'N'
  const needsReferral = REFERRAL_CATS.has(cat)

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Classification</button>
        <h1 class="app-title">Counsel Summary</h1>
      </header>

      <main class="screen-body">
        <div class="counsel-meta">
          <span class="emp-name-inline">${esc(emp.last_name)}, ${esc(emp.first_name)}</span>
          <span class="class-badge class-${cat.toLowerCase()}">${cat}</span>
        </div>

        ${state.questionnaire ? `
          <div class="summary-card" style="margin-bottom: 16px; padding: 10px; font-size: 0.9rem;">
            <h3 style="margin-top: 0; font-size: 0.8rem; text-transform: uppercase; color: #666;">Questionnaire Highlights</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
              ${state.questionnaire.pre?.noise_2h ? '<span class="badge badge-warn">⚠ Noise < 2h</span>' : ''}
              ${state.questionnaire.post?.tinnitus ? '<span class="badge badge-warn">⚠ Tinnitus</span>' : ''}
              ${state.questionnaire.post?.ear_infection ? '<span class="badge badge-warn">⚠ Ear Infection</span>' : ''}
              ${state.questionnaire.post?.ear_surgery ? '<span class="badge badge-warn">⚠ Ear Surgery</span>' : ''}
              ${state.questionnaire.post?.head_injury ? '<span class="badge badge-warn">⚠ Head Injury</span>' : ''}
              ${state.questionnaire.post?.childhood_loss ? '<span class="badge badge-warn">⚠ Childhood Loss</span>' : ''}
              ${state.questionnaire.post?.firearms ? '<span class="badge badge-warn">⚠ Firearms</span>' : ''}
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 8px; margin-top: 4px;">
              <span class="muted">HPD: <strong>${state.questionnaire.pre?.hpd_type || 'None'}</strong></span>
              <span class="muted">Trained: <strong>${state.questionnaire.pre?.hpd_trained ? 'Yes' : 'No'}</strong></span>
            </div>
          </div>
        ` : ''}

        <div class="form-group">
          <label for="counsel-text">
            Counsel text
            <span class="label-hint">— shown to or read to the worker, edit as needed</span>
          </label>
          <textarea id="counsel-text" class="counsel-textarea" rows="8">${esc(state.counselText ?? '')}</textarea>
        </div>

        <div class="form-group">
          <label for="tech-notes">
            Tech notes
            <span class="label-hint">— internal only, not shared with worker</span>
          </label>
          <textarea id="tech-notes" class="counsel-textarea counsel-textarea--sm" rows="3">${esc(state.techNotes ?? '')}</textarea>
        </div>

        ${needsReferral ? `
          <div class="referral-block">
            <div class="referral-block-header">
              <span class="referral-icon">📋</span>
              <strong>Referral Required</strong>
            </div>
            <p class="referral-desc">
              This result requires referral to a physician or audiologist.
              Complete the referral on-site using the paper form or print one below.
            </p>
            <button class="btn btn-outline btn-sm" id="btn-print-referral">
              🖨 Print / Save Referral Form
            </button>
            <label class="referral-confirm-label" id="referral-confirm-wrap">
              <input type="checkbox" id="chk-referral-given" ${state.referralGivenToWorker ? 'checked' : ''} />
              <span>I have provided the worker with their referral</span>
            </label>
            <div id="referral-warn" class="alert alert-warn hidden" style="margin-top:8px">
              ⚠ Please confirm the worker has received their referral, or proceed if circumstances prevent this.
            </div>
          </div>
        ` : ''}
      </main>

      <footer class="action-bar">
        <button class="btn btn-primary" id="btn-submit">Finalize & Review →</button>
      </footer>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('classification'))

  container.querySelector('#counsel-text').addEventListener('input', e => {
    state.counselText = e.target.value
  })
  container.querySelector('#tech-notes').addEventListener('input', e => {
    state.techNotes = e.target.value
  })

  // Referral checkbox
  if (needsReferral) {
    container.querySelector('#chk-referral-given')?.addEventListener('change', e => {
      state.referralGivenToWorker = e.target.checked
      container.querySelector('#referral-warn')?.classList.add('hidden')
    })

    // Print referral form
    container.querySelector('#btn-print-referral')?.addEventListener('click', async () => {
      const orgProfile = await loadOrgProfile()
      openReferralPrintWindow({
        org:            orgProfile,
        worker:         emp,
        employer:       state.currentPacket?.company ?? {},
        test_date:      state.currentPacket?.visit?.visit_date ?? null,
        test_type:      result?.no_baseline ? 'Baseline' : 'Periodic',
        classification: result,
        thresholds:     state.currentThresholds ?? {},
        baseline:       emp.baseline?.thresholds ?? null,
        counsel_text:   container.querySelector('#counsel-text').value,
        tech: {
          name:       state.user?.name        ?? '',
          iat_number: state.user?.iat_number  ?? ''
        }
      })
    })
  }

  function proceedToSubmit() {
    if (needsReferral && !state.referralGivenToWorker) {
      container.querySelector('#referral-warn')?.classList.remove('hidden')
      container.querySelector('#referral-warn')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => navigate('submit'), 1400)
      return
    }
    navigate('submit')
  }

  container.querySelector('#btn-submit').addEventListener('click', proceedToSubmit)
}

async function loadOrgProfile() {
  // Load org settings from IDB — these are synced from MasterDB via the packet
  // Falls back gracefully if not set
  const [name, address, city, province, postal, phone, email, website, logoUrl] = await Promise.all([
    getSetting('org_name'),
    getSetting('org_address'),
    getSetting('org_city'),
    getSetting('org_province'),
    getSetting('org_postal'),
    getSetting('org_phone'),
    getSetting('org_email'),
    getSetting('org_website'),
    getSetting('logo_url')
  ])
  return { name, address, city, province, postal, phone, email, website, logoUrl }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
