import { calcHPD } from '../components/hpd-calc.js'

export function renderHPD(container, state, navigate) {
  const packet    = state.currentPacket
  const inventory = packet?.hpd_inventory ?? []
  const prev      = state.hpdResult

  // Restore previous type if coming back to this screen
  const initType = prev?.type ?? 'earplug'

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Counsel</button>
        <h1 class="app-title">HPD Adequacy</h1>
      </header>

      <main class="screen-body">

        <!-- Protection type selector -->
        <div class="hpd-type-row">
          <button class="hpd-type-btn ${initType === 'earplug' ? 'hpd-type-btn--active' : ''}" data-type="earplug">
            Earplugs<br><span class="hpd-type-sub">50% derating</span>
          </button>
          <button class="hpd-type-btn ${initType === 'custom' ? 'hpd-type-btn--active' : ''}" data-type="custom">
            Custom Molded<br><span class="hpd-type-sub">50% derating</span>
          </button>
          <button class="hpd-type-btn ${initType === 'earmuff' ? 'hpd-type-btn--active' : ''}" data-type="earmuff">
            Earmuffs<br><span class="hpd-type-sub">30% derating</span>
          </button>
          <button class="hpd-type-btn ${initType === 'dual' ? 'hpd-type-btn--active' : ''}" data-type="dual">
            Dual<br><span class="hpd-type-sub">Plugs + Muffs</span>
          </button>
        </div>

        ${inventory.length > 0 ? `
          <div class="form-group">
            <label for="hpd-select">Select from company HPD inventory</label>
            <select id="hpd-select" class="select-input">
              <option value="">— choose —</option>
              ${inventory.map(h =>
                `<option value="${h.nrr}" data-model="${esc(h.make_model)}">${esc(h.make_model)} (NRR ${h.nrr})</option>`
              ).join('')}
            </select>
          </div>
        ` : ''}

        <div class="form-group">
          <label for="hpd-model" id="hpd-model-label">HPD Make / Model</label>
          <input id="hpd-model" type="text" value="${esc(prev?.hpd_model ?? '')}"
            placeholder="e.g. 3M E-A-Rsoft Yellow Neons" autocomplete="off" />
        </div>

        <div class="hpd-field-group">
          <div class="hpd-field-label">Worker Noise Exposure</div>
          <div class="hpd-field-sub">LEX-8hr (dB(A))</div>
          <div class="hpd-slider-row">
            <input type="range" id="lex8hr-range" min="70" max="140" step="0.5"
              value="${prev?.lex8hr ?? 90}" />
            <input type="number" id="lex8hr" class="hpd-num" min="70" max="140" step="0.5"
              value="${prev?.lex8hr ?? ''}" placeholder="90" />
            <span class="hpd-unit">dB(A)</span>
          </div>
        </div>

        <div class="hpd-field-group">
          <div class="hpd-field-label" id="nrr-label">Rated NRR</div>
          <div class="hpd-field-sub">From HPD packaging (dB)</div>
          <div class="hpd-slider-row">
            <input type="range" id="rated-nrr-range" min="0" max="40" step="1"
              value="${prev?.rated_nrr ?? 20}" />
            <input type="number" id="rated-nrr" class="hpd-num" min="0" max="40" step="1"
              value="${prev?.rated_nrr ?? ''}" placeholder="20" />
            <span class="hpd-unit">dB</span>
          </div>
        </div>

        <!-- Second NRR for dual — hidden unless dual selected -->
        <div class="hpd-field-group" id="nrr2-group" style="display:none">
          <div class="hpd-field-label">Earmuff NRR</div>
          <div class="hpd-field-sub">From earmuff packaging (dB)</div>
          <div class="hpd-slider-row">
            <input type="range" id="rated-nrr2-range" min="0" max="40" step="1"
              value="${prev?.rated_nrr2 ?? 20}" />
            <input type="number" id="rated-nrr2" class="hpd-num" min="0" max="40" step="1"
              value="${prev?.rated_nrr2 ?? ''}" placeholder="20" />
            <span class="hpd-unit">dB</span>
          </div>
        </div>

        <div id="hpd-result-live" class="hpd-calc-section">
          <div class="hpd-verdict hpd-verdict--empty" id="hpd-verdict">Enter values above</div>
        </div>
      </main>

      <footer class="action-bar">
        <button class="btn btn-ghost" id="btn-skip">Skip</button>
        <button class="btn btn-primary" id="btn-next" disabled>Submit →</button>
      </footer>
    </div>
  `

  // ---- element refs ----
  const lexRange  = container.querySelector('#lex8hr-range')
  const lexNum    = container.querySelector('#lex8hr')
  const nrrRange  = container.querySelector('#rated-nrr-range')
  const nrrNum    = container.querySelector('#rated-nrr')
  const nrr2Range = container.querySelector('#rated-nrr2-range')
  const nrr2Num   = container.querySelector('#rated-nrr2')
  const resultDiv = container.querySelector('#hpd-result-live')
  const nextBtn   = container.querySelector('#btn-next')
  const nrr2Group = container.querySelector('#nrr2-group')
  const nrrLabel  = container.querySelector('#nrr-label')

  let currentType = initType

  function setType(t) {
    currentType = t
    container.querySelectorAll('.hpd-type-btn').forEach(btn => {
      btn.classList.toggle('hpd-type-btn--active', btn.dataset.type === t)
    })
    nrr2Group.style.display = t === 'dual' ? 'block' : 'none'
    nrrLabel.textContent = t === 'earmuff' ? 'Rated NRR (Earmuffs)' : t === 'dual' ? 'Earplug NRR' : 'Rated NRR'
    recalc()
  }

  function recalc() {
    const lexVal  = lexNum.value
    const nrrVal  = nrrNum.value
    const nrr2Val = nrr2Num.value

    const needsNrr2 = currentType === 'dual'

    if (lexVal === '' || nrrVal === '' || (needsNrr2 && nrr2Val === '')) {
      resultDiv.innerHTML = `<div class="hpd-verdict hpd-verdict--empty" id="hpd-verdict">Enter values above</div>`
      nextBtn.disabled = true
      state.hpdResult = null
      return
    }

    const res = calcHPD(nrrVal, lexVal, currentType, needsNrr2 ? nrr2Val : null)
    res.hpd_model  = container.querySelector('#hpd-model').value.trim()
    res.rated_nrr2 = needsNrr2 ? Number(nrr2Val) : null
    state.hpdResult = res

    if (!res.valid) {
      resultDiv.innerHTML = `<div class="hpd-verdict hpd-verdict--empty">${esc(res.error)}</div>`
      nextBtn.disabled = true
      return
    }

    const pe       = res.protected_exposure
    const gaugeMin = 70, gaugeMax = 115
    const fillPct  = Math.max(0, Math.min(100, (pe - gaugeMin) / (gaugeMax - gaugeMin) * 100))
    const limitPct = (85 - gaugeMin) / (gaugeMax - gaugeMin) * 100

    let fillClass, verdictClass, verdictText
    if (pe <= 85) {
      fillClass = 'hpd-gauge-fill--ok';   verdictClass = 'hpd-verdict--ok';   verdictText = 'ADEQUATE'
    } else if (pe <= 90) {
      fillClass = 'hpd-gauge-fill--warn'; verdictClass = 'hpd-verdict--warn'; verdictText = 'MARGINAL'
    } else {
      fillClass = 'hpd-gauge-fill--bad';  verdictClass = 'hpd-verdict--bad';  verdictText = 'INADEQUATE'
    }

    resultDiv.innerHTML = `
      <div class="hpd-calc-row">
        <span>Derating</span>
        <strong>${esc(res.derating_label)}</strong>
      </div>
      <div class="hpd-calc-row">
        <span>Derated NRR</span>
        <strong>${res.derated_nrr} dB</strong>
      </div>
      <div class="hpd-calc-row">
        <span>dBA correction</span>
        <strong>− 3 dB</strong>
      </div>
      <div class="hpd-calc-row hpd-calc-total">
        <span>Effective reduction</span>
        <strong>${res.effective_reduction} dB</strong>
      </div>
      <div class="hpd-calc-row hpd-calc-total">
        <span>Protected exposure</span>
        <strong>${res.protected_exposure} dB(A)</strong>
      </div>

      <div class="hpd-gauge-wrap">
        <div class="hpd-gauge-labels">
          <span>70 dB(A)</span>
          <span>115 dB(A)</span>
        </div>
        <div class="hpd-gauge-track">
          <div class="hpd-gauge-fill ${fillClass}" style="width:${fillPct.toFixed(1)}%"></div>
          <div class="hpd-gauge-limit" style="left:${limitPct.toFixed(1)}%">
            <span class="hpd-gauge-limit-label">85</span>
          </div>
        </div>
      </div>

      <div class="hpd-verdict ${verdictClass}">${verdictText}</div>
    `

    nextBtn.disabled = false
  }

  // Type selector
  container.querySelectorAll('.hpd-type-btn').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type))
  })

  // Slider ↔ number sync
  lexRange.addEventListener('input',  () => { lexNum.value   = lexRange.value;  recalc() })
  lexNum.addEventListener('input',    () => { lexRange.value = lexNum.value;    recalc() })
  nrrRange.addEventListener('input',  () => { nrrNum.value   = nrrRange.value;  recalc() })
  nrrNum.addEventListener('input',    () => { nrrRange.value = nrrNum.value;    recalc() })
  nrr2Range.addEventListener('input', () => { nrr2Num.value  = nrr2Range.value; recalc() })
  nrr2Num.addEventListener('input',   () => { nrr2Range.value = nrr2Num.value;  recalc() })

  // Model text changes
  container.querySelector('#hpd-model').addEventListener('input', recalc)

  // Inventory pre-fill
  container.querySelector('#hpd-select')?.addEventListener('change', e => {
    const opt = e.target.selectedOptions[0]
    if (!opt.value) return
    nrrNum.value   = opt.value
    nrrRange.value = opt.value
    container.querySelector('#hpd-model').value = opt.dataset.model
    recalc()
  })

  // Apply initial type (shows/hides dual field)
  setType(initType)

  // Run initial calc if we have prior values
  if (prev?.lex8hr != null && prev?.rated_nrr != null) recalc()

  container.querySelector('#btn-back').addEventListener('click', () => navigate('counsel'))
  container.querySelector('#btn-skip').addEventListener('click', () => {
    state.hpdResult = null
    navigate('submit')
  })
  container.querySelector('#btn-next').addEventListener('click', () => navigate('submit'))
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
