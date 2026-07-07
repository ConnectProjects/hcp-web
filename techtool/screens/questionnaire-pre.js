export function renderQuestionnairePre(container, state, navigate) {
  const emp = state.currentEmployee

  if (!state.questionnaire) state.questionnaire = {}
  if (!state.questionnaire.pre) {
    state.questionnaire.pre = {
      noise_2h:          null, // null, true, false
      noise_2h_duration: '',
      wear_hpd:          null, // null, true, false
      hpd_class:         '',
      hpd_style:         '',
      hpd_no_reason:     '',
      employer_info:     false
    }
  }

  const q = state.questionnaire.pre

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Employees</button>
        <h1 class="app-title">Pre-Test: ${esc(emp.last_name)}, ${esc(emp.first_name)}</h1>
      </header>

      <main class="screen-body">
        <div class="q-card">
          <div class="q-title">Noise Exposure & Information</div>
          
          <div class="q-item">
            <div style="font-weight:600; margin-bottom:8px">Have you been exposed to noise within the last two hours?</div>
            <div class="btn-group" style="display:flex; gap:12px">
              <button class="btn ${q.noise_2h === true ? 'btn-primary' : 'btn-secondary'}" id="btn-noise-yes" style="flex:1">Yes</button>
              <button class="btn ${q.noise_2h === false ? 'btn-primary' : 'btn-secondary'}" id="btn-noise-no" style="flex:1">No</button>
            </div>
          </div>

          <div id="noise-2h-detail" class="q-sub-group" style="display: ${q.noise_2h === true ? 'block' : 'none'}">
            <div class="form-group" style="margin-bottom:0">
              <label>For how many hours were you exposed to noise?</label>
              <select id="q-noise-2h-duration" class="select-input">
                <option value="">— Select duration —</option>
                <option value="Less than 2" ${q.noise_2h_duration === 'Less than 2' ? 'selected' : ''}>Less than 2</option>
                <option value="2-4" ${q.noise_2h_duration === '2-4' ? 'selected' : ''}>2-4</option>
                <option value="More than 4" ${q.noise_2h_duration === 'More than 4' ? 'selected' : ''}>More than 4</option>
              </select>
            </div>
          </div>

          <div class="q-item" style="margin-top:20px">
            <div style="font-weight:600; margin-bottom:8px">Do you regularly wear hearing protection when you work in a noisy environment?</div>
            <div class="btn-group" style="display:flex; gap:12px">
              <button class="btn ${q.wear_hpd === true ? 'btn-primary' : 'btn-secondary'}" id="btn-wear-yes" style="flex:1">Yes</button>
              <button class="btn ${q.wear_hpd === false ? 'btn-primary' : 'btn-secondary'}" id="btn-wear-no" style="flex:1">No</button>
            </div>
          </div>

          <div id="hpd-yes-detail" class="q-sub-group" style="display: ${q.wear_hpd === true ? 'block' : 'none'}">
            <div class="form-group" style="margin-bottom:12px">
              <label>What class of hearing protection do you wear regularly?</label>
              <select id="q-hpd-class" class="select-input">
                <option value="">— Select class —</option>
                <option value="Class A" ${q.hpd_class === 'Class A' ? 'selected' : ''}>Class A</option>
                <option value="Class B" ${q.hpd_class === 'Class B' ? 'selected' : ''}>Class B</option>
                <option value="Class C" ${q.hpd_class === 'Class C' ? 'selected' : ''}>Class C</option>
                <option value="Dual Protection" ${q.hpd_class === 'Dual Protection' ? 'selected' : ''}>Dual Protection</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>What style of hearing protection do you wear regularly?</label>
              <select id="q-hpd-style-yes" class="select-input">
                <option value="">— Select style —</option>
                <option value="Both Earmuffs and Earplugs - Dual Protection" ${q.hpd_style === 'Both Earmuffs and Earplugs - Dual Protection' ? 'selected' : ''}>Both Earmuffs and Earplugs - Dual Protection</option>
                <option value="Earmuffs" ${q.hpd_style === 'Earmuffs' ? 'selected' : ''}>Earmuffs</option>
                <option value="Earplugs" ${q.hpd_style === 'Earplugs' ? 'selected' : ''}>Earplugs</option>
                <option value="Custom Molded Earplugs" ${q.hpd_style === 'Custom Molded Earplugs' ? 'selected' : ''}>Custom Molded Earplugs</option>
              </select>
            </div>
          </div>

          <div id="hpd-no-detail" class="q-sub-group" style="display: ${q.wear_hpd === false ? 'block' : 'none'}">
            <div class="form-group" style="margin-bottom:0">
              <label>Why do you not wear hearing protection regularly?</label>
              <select id="q-hpd-no-reason" class="select-input">
                <option value="">— Select reason —</option>
                <option value="Not Comfortable" ${q.hpd_no_reason === 'Not Comfortable' ? 'selected' : ''}>Not Comfortable</option>
                <option value="Can't communicate" ${q.hpd_no_reason === "Can't communicate" ? 'selected' : ''}>Can't communicate</option>
                <option value="Blocks sounds I want to hear" ${q.hpd_no_reason === 'Blocks sounds I want to hear' ? 'selected' : ''}>Blocks sounds I want to hear</option>
                <option value="It's not that noisy" ${q.hpd_no_reason === "It's not that noisy" ? 'selected' : ''}>It's not that noisy</option>
                <option value="Wrong size" ${q.hpd_no_reason === 'Wrong size' ? 'selected' : ''}>Wrong size</option>
                <option value="Other" ${q.hpd_no_reason === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>

          <div class="q-item" style="margin-top:20px">
            <label class="checkbox-label">
              <input type="checkbox" id="q-employer-info" ${q.employer_info ? 'checked' : ''}>
              Has your employer given you information about noise and noise induced hearing loss in the last year?
            </label>
          </div>
        </div>
      </main>

      <footer class="action-bar">
        <button class="btn btn-primary" id="btn-next">Continue to Test →</button>
      </footer>
    </div>
  `

  // Noise Button handlers
  const btnNoiseYes = container.querySelector('#btn-noise-yes')
  const btnNoiseNo  = container.querySelector('#btn-noise-no')
  const noise2hDetail = container.querySelector('#noise-2h-detail')
  let noise2h = q.noise_2h

  btnNoiseYes.addEventListener('click', () => {
    noise2h = true
    btnNoiseYes.className = 'btn btn-primary'
    btnNoiseNo.className = 'btn btn-secondary'
    noise2hDetail.style.display = 'block'
  })

  btnNoiseNo.addEventListener('click', () => {
    noise2h = false
    btnNoiseYes.className = 'btn btn-secondary'
    btnNoiseNo.className = 'btn btn-primary'
    noise2hDetail.style.display = 'none'
  })

  // HPD Button handlers
  const btnHpdYes = container.querySelector('#btn-wear-yes')
  const btnHpdNo  = container.querySelector('#btn-wear-no')
  const hpdYesDetail = container.querySelector('#hpd-yes-detail')
  const hpdNoDetail  = container.querySelector('#hpd-no-detail')
  let wearHpd = q.wear_hpd

  btnHpdYes.addEventListener('click', () => {
    wearHpd = true
    btnHpdYes.className = 'btn btn-primary'
    btnHpdNo.className = 'btn btn-secondary'
    hpdYesDetail.style.display = 'block'
    hpdNoDetail.style.display = 'none'
  })

  btnHpdNo.addEventListener('click', () => {
    wearHpd = false
    btnHpdYes.className = 'btn btn-secondary'
    btnHpdNo.className = 'btn btn-primary'
    hpdYesDetail.style.display = 'none'
    hpdNoDetail.style.display = 'block'
  })

  container.querySelector('#btn-back').addEventListener('click', () => navigate('employee-list'))

  container.querySelector('#btn-next').addEventListener('click', () => {
    state.questionnaire.pre = {
      noise_2h:          noise2h,
      noise_2h_duration: container.querySelector('#q-noise-2h-duration').value,
      wear_hpd:          wearHpd,
      hpd_class:         container.querySelector('#q-hpd-class').value,
      hpd_style:         container.querySelector('#q-hpd-style-yes').value,
      hpd_no_reason:     container.querySelector('#q-hpd-no-reason').value,
      employer_info:     container.querySelector('#q-employer-info').checked
    }
    navigate('test-entry')
  })
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
