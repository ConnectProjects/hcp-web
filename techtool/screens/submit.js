import { appendTestResult } from '@shared/packet/schema.js'
import { savePacket, deleteDraft } from '../db/idb.js'

export function renderSubmit(container, state, navigate) {
  const emp     = state.currentEmployee
  const result  = state.classResult
  const hpd     = state.hpdResult
  const counsel = state.counselText ?? ''
  const cat     = result?.category ?? '—'

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Back</button>
        <h1 class="app-title">Finalize Test</h1>
      </header>

      <main class="screen-body">
        <h2 class="submit-name">${esc(emp.last_name)}, ${esc(emp.first_name)}</h2>

        <section class="summary-card">
          <h3>Classification</h3>
          <div class="summary-row">
            <span>Result</span>
            <span class="class-badge class-${cat.toLowerCase()}">${cat}</span>
          </div>
          ${result?.triggering_freq_hz != null ? `
            <div class="summary-row">
              <span>Frequency</span><span>${result.triggering_freq_hz} Hz</span>
            </div>` : ''}
          ${result?.triggering_ear ? `
            <div class="summary-row">
              <span>Ear</span><span>${cap(result.triggering_ear)}</span>
            </div>` : ''}
          ${result?.shift_db != null ? `
            <div class="summary-row">
              <span>${result.no_baseline ? 'Threshold' : 'Shift'}</span>
              <span>${result.shift_db} dB</span>
            </div>` : ''}
        </section>

        <section class="summary-card">
          <h3>Counsel</h3>
          <p class="counsel-preview">${counsel
            ? esc(counsel)
            : '<em>No counsel entered.</em>'}</p>
        </section>

        <div id="submit-error"   class="alert alert-error   hidden"></div>
        <div id="submit-success" class="alert alert-success hidden">
          ✓ Test saved. Returning to employee list…
        </div>
      </main>

      <footer class="action-bar">
        <button class="btn btn-ghost"   id="btn-back2">Back</button>
        <button class="btn btn-primary" id="btn-confirm">Confirm &amp; Save</button>
      </footer>
    </div>
  `
  container.querySelector('#btn-back').addEventListener('click',  () => navigate('counsel'))
  container.querySelector('#btn-back2').addEventListener('click', () => navigate('counsel'))
  container.querySelector('#btn-confirm').addEventListener('click', () => {
    const btn = container.querySelector('#btn-confirm')
    if (btn.disabled) return
    btn.disabled = true
    doSave(container, state, navigate)
  })
}

async function doSave(container, state, navigate) {
  const btn       = container.querySelector('#btn-confirm')
  const errorEl   = container.querySelector('#submit-error')
  const successEl = container.querySelector('#submit-success')

  btn.textContent = 'Saving…'
  errorEl.classList.add('hidden')

  try {
    const today  = new Date().toISOString().slice(0, 10)
    const emp    = state.currentEmployee
    const packet = state.currentPacket

    const testRecord = {
      test_date:      today,
      tech_id:        state.user?.tech_id ?? state.user?.initials ?? 'unknown',
      test_type:      emp.baseline ? 'Periodic' : 'Baseline',
      classification: state.classResult,
      counsel_text:   state.counselText  ?? null,
      tech_notes:     state.techNotes    ?? null,
      questionnaire:  state.questionnaire ?? null,
      ...state.testData
    }

    appendTestResult(packet, emp.employee_id, testRecord)
    await savePacket(packet)
    await deleteDraft(packet.packet_id, emp.employee_id)

    btn.textContent = '✓ Saved'
    successEl.classList.remove('hidden')

    // Empty the booth
    state.currentEmployee = null
    
    setTimeout(() => navigate('employee-list'), 1600)
  } catch (e) {
    errorEl.textContent = `Save failed: ${e.message}`
    errorEl.classList.remove('hidden')
    btn.disabled    = false
    btn.textContent = 'Confirm & Save'
  }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
