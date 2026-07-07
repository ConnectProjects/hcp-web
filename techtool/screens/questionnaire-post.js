export function renderQuestionnairePost(container, state, navigate) {
  const emp = state.currentEmployee

  if (!state.questionnaire) state.questionnaire = {}
  if (!state.questionnaire.post) {
    state.questionnaire.post = {
      ear_infection: false,
      ear_surgery: false,
      head_injury: false,
      childhood_loss: false,
      tinnitus: false,
      tinnitus_ear: '',
      tinnitus_duration: '',
      firearms: false,
      firearms_type: '',
      firearms_shoulder: '',
      firearms_duration: ''
    }
  }

  const q = state.questionnaire.post

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Test Entry</button>
        <h1 class="app-title">Post-Test: ${esc(emp.last_name)}, ${esc(emp.first_name)}</h1>
      </header>

      <main class="screen-body">
        <div class="q-card">
          <div class="q-title">Medical History</div>
          
          <div class="q-item">
            <label class="checkbox-label">
              <input type="checkbox" id="q-ear-infection" ${q.ear_infection ? 'checked' : ''}>
              Ever had a severe ear infection?
            </label>
          </div>

          <div class="q-item">
            <label class="checkbox-label">
              <input type="checkbox" id="q-ear-surgery" ${q.ear_surgery ? 'checked' : ''}>
              Ever had ear surgery?
            </label>
          </div>

          <div class="q-item">
            <label class="checkbox-label">
              <input type="checkbox" id="q-head-injury" ${q.head_injury ? 'checked' : ''}>
              Ever had a serious head injury?
            </label>
          </div>

          <div class="q-item">
            <label class="checkbox-label">
              <input type="checkbox" id="q-childhood-loss" ${q.childhood_loss ? 'checked' : ''}>
              Hearing loss during childhood?
            </label>
          </div>
        </div>

        <div class="q-card">
          <div class="q-title">Ringing in Ears (Tinnitus)</div>
          
          <div class="q-item">
            <label class="checkbox-label">
              <input type="checkbox" id="q-tinnitus" ${q.tinnitus ? 'checked' : ''}>
              Ringing in ears?
            </label>
          </div>

          <div id="tinnitus-detail" class="q-sub-group" style="display: ${q.tinnitus ? 'block' : 'none'}">
            <div class="form-group" style="margin-bottom:12px">
              <label>Which ear?</label>
              <select id="q-tinnitus-ear" class="select-input">
                <option value="">— Select ear —</option>
                <option value="left" ${q.tinnitus_ear === 'left' ? 'selected' : ''}>Left</option>
                <option value="right" ${q.tinnitus_ear === 'right' ? 'selected' : ''}>Right</option>
                <option value="both" ${q.tinnitus_ear === 'both' ? 'selected' : ''}>Both</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>For how long?</label>
              <select id="q-tinnitus-duration" class="select-input">
                <option value="">— Select duration —</option>
                <option value="Under 5 yrs" ${q.tinnitus_duration === 'Under 5 yrs' ? 'selected' : ''}>Under 5 yrs</option>
                <option value="5-10 yrs" ${q.tinnitus_duration === '5-10 yrs' ? 'selected' : ''}>5-10 yrs</option>
                <option value="11-15 yrs" ${q.tinnitus_duration === '11-15 yrs' ? 'selected' : ''}>11-15 yrs</option>
                <option value="over 15 yrs" ${q.tinnitus_duration === 'over 15 yrs' ? 'selected' : ''}>Over 15 yrs</option>
              </select>
            </div>
          </div>
        </div>

        <div class="q-card">
          <div class="q-title">Recreational Noise</div>

          <div class="q-item">
            <label class="checkbox-label">
              <input type="checkbox" id="q-firearms" ${q.firearms ? 'checked' : ''}>
              Do you use firearms?
            </label>
          </div>

          <div id="firearms-detail" class="q-sub-group" style="display: ${q.firearms ? 'block' : 'none'}">
            <div class="form-group" style="margin-bottom:12px">
              <label>Type?</label>
              <select id="q-firearms-type" class="select-input">
                <option value="">— Select type —</option>
                <option value="handguns" ${q.firearms_type === 'handguns' ? 'selected' : ''}>Handguns</option>
                <option value="rifle/shotguns" ${q.firearms_type === 'rifle/shotguns' ? 'selected' : ''}>Rifle/Shotguns</option>
                <option value="both" ${q.firearms_type === 'both' ? 'selected' : ''}>Both</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:12px">
              <label>Which shoulder do you shoot from?</label>
              <select id="q-firearms-shoulder" class="select-input">
                <option value="">— Select shoulder —</option>
                <option value="left" ${q.firearms_shoulder === 'left' ? 'selected' : ''}>Left</option>
                <option value="right" ${q.firearms_shoulder === 'right' ? 'selected' : ''}>Right</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>How long have you used firearms?</label>
              <select id="q-firearms-duration" class="select-input">
                <option value="">— Select duration —</option>
                <option value="Under 10 yrs" ${q.firearms_duration === 'Under 10 yrs' ? 'selected' : ''}>Under 10 yrs</option>
                <option value="10-20 yrs" ${q.firearms_duration === '10-20 yrs' ? 'selected' : ''}>10-20 yrs</option>
                <option value="over 20 yrs" ${q.firearms_duration === 'over 20 yrs' ? 'selected' : ''}>Over 20 yrs</option>
              </select>
            </div>
          </div>
        </div>
      </main>

      <footer class="action-bar">
        <button class="btn btn-primary" id="btn-next">Review Results →</button>
      </footer>
    </div>
  `

  const tinnitusCheck = container.querySelector('#q-tinnitus')
  const tinnitusDetail = container.querySelector('#tinnitus-detail')
  tinnitusCheck.addEventListener('change', () => {
    tinnitusDetail.style.display = tinnitusCheck.checked ? 'block' : 'none'
  })

  const firearmsCheck = container.querySelector('#q-firearms')
  const firearmsDetail = container.querySelector('#firearms-detail')
  firearmsCheck.addEventListener('change', () => {
    firearmsDetail.style.display = firearmsCheck.checked ? 'block' : 'none'
  })

  container.querySelector('#btn-back').addEventListener('click', () => navigate('test-entry'))

  container.querySelector('#btn-next').addEventListener('click', () => {
    state.questionnaire.post = {
      ear_infection:     container.querySelector('#q-ear-infection').checked,
      ear_surgery:       container.querySelector('#q-ear-surgery').checked,
      head_injury:       container.querySelector('#q-head-injury').checked,
      childhood_loss:    container.querySelector('#q-childhood-loss').checked,
      tinnitus:          container.querySelector('#q-tinnitus').checked,
      tinnitus_ear:      container.querySelector('#q-tinnitus-ear').value,
      tinnitus_duration: container.querySelector('#q-tinnitus-duration').value,
      firearms:          container.querySelector('#q-firearms').checked,
      firearms_type:     container.querySelector('#q-firearms-type').value,
      firearms_shoulder: container.querySelector('#q-firearms-shoulder').value,
      firearms_duration: container.querySelector('#q-firearms-duration').value
    }
    // Proceed to classification (results review)
    // We need to trigger the classification logic here or in the next screen.
    // Usually doClassify is called in test-entry. I'll move it to questionnaire-post or a bridge.
    // Let's check test-entry.js doClassify.
    navigate('classification')
  })
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
