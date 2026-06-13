import { savePacket } from '../db/idb.js'
import { TimeService } from '@shared/time-utils.js'

export function renderTestEntry(container, state, navigate) {
  // 1. Robust data retrieval
  const slot = state.slots[state.activeSlot];
  const emp = state.currentEmployee || slot.currentEmployee;
  const packet = state.currentPacket || slot.currentPacket;
  const baseline = emp?.baseline || null;

  // 2. Visual Error Catching (Instead of silent exit)
  if (!emp) {
    container.innerHTML = `<div class="page"><div class="alert alert-error">Error: No worker loaded into Booth ${state.activeSlot + 1}.</div><button class="btn btn-primary" onclick="location.reload()">Reload App</button></div>`;
    return;
  }

  container.innerHTML = `
    <style>
        .tech-tool-container { max-width: 1000px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif; }
        .sub-question { margin-left: 30px; padding: 15px; border-left: 4px solid #76B214; background: #f9f9f9; display: none; margin-top: 5px; margin-bottom: 15px; border-radius: 0 8px 8px 0; }
        .sub-question.visible { display: block; }
        .q-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #eee; }
        .q-label { font-size: 14px; color: #333; flex: 1; padding-right: 20px; line-height: 1.4; }
        .q-select { width: 120px; padding: 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; background: white; }
        .section-title { color: #76B214; font-size: 1.5rem; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 45px 0 20px 0; font-weight: 700; }
        .audiogram-wrapper { background: white; border: 1px solid #ddd; border-radius: 8px; margin-top: 15px; position: relative; width: 100%; height: 260px; }
        .chart-grid line { stroke: #d1d5db; stroke-width: 1; }
        .chart-grid line.major { stroke: #9ca3af; }
        .chart-axis-text { font-size: 10px; fill: #9ca3af; font-weight: 500; }
        .normal-range { fill: #76B214; opacity: 0.1; }
        .threshold-line { stroke: #76B214; stroke-width: 2; stroke-dasharray: 5,3; }
        .ear-header { font-weight: 800; color: #1e3a5f; display: block; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; }
    </style>

    <div class="tech-tool-container">
      <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1 style="margin:0; font-size: 28px; color: #1e3a5f;">Hearing Test</h1>
          <button class="btn btn-ghost" id="btn-back" title="Return to list">❮ Back to List</button>
      </div>

      <div style="background: #76B214; color: white; border-radius: 12px; padding: 25px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Worker</label><span>${esc(emp.last_name)}, ${esc(emp.first_name)}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Employer</label><span>${esc(packet?.company?.name || 'N/A')}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Date</label><span>${new Date().toISOString().split('T')[0]}</span></div>
      </div>

      <h2 class="section-title" style="margin-top:0">Noise Exposure</h2>
      ${renderQ("exposed_2hr", "Exposed to noise within the last two hours?", slot.testData.exposed_2hr)}
      <div class="sub-question" id="exposed_2hr_details">
        <label class="q-label">Duration?</label>
        <select class="q-input q-select" data-id="exposed_2hr_duration" title="Exposure duration"><option value="under 2hrs">under 2hrs</option><option value="2-4hrs">2-4hrs</option><option value="4+hrs">4+hrs</option></select>
      </div>

      ${renderQ("regular_hpd", "Regularly wear hearing protection?", slot.testData.regular_hpd)}
      <div class="sub-question" id="hpd_details">
        <div style="display:flex; gap:10px;">
            <select class="q-input q-select" data-id="hpd_class" title="HPD Class"><option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option></select>
            <select class="q-input q-select" data-id="hpd_style" title="HPD Style"><option value="earplugs">Earplugs</option><option value="earmuffs">Earmuffs</option><option value="custom">Custom</option></select>
        </div>
      </div>

      <div class="q-row">
        <div class="q-label">Has your employer given you information about noise induced hearing loss in the last year?</div>
        <select class="q-input q-select" data-id="employer_info" title="Employer info provided">
            <option value="No">No</option>
            <option value="Yes" selected>Yes</option>
        </select>
      </div>

      <h2 class="section-title">Hearing History</h2>
      ${renderSimpleQ("ear_infection", "Severe ear infection?", slot.testData.ear_infection)}
      ${renderSimpleQ("ear_surgery", "Ear surgery?", slot.testData.ear_surgery)}
      ${renderSimpleQ("dizziness", "Dizziness or balance problems?", slot.testData.dizziness)}
      ${renderSimpleQ("head_injury", "Serious head injury?", slot.testData.head_injury)}
      ${renderSimpleQ("childhood_loss", "Hearing loss in childhood?", slot.testData.childhood_loss)}
      
      <div class="q-row">
        <div class="q-label">Ringing in ears (tinnitus)?</div>
        <select class="q-input q-select" data-id="ringing" id="ringing" title="Ringing in ears"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="ringing_details">
        <div style="display:flex; gap:20px;">
            <select class="q-input q-select" data-id="ringing_ear" title="Which ear"><option value="Left">Left</option><option value="Right">Right</option><option value="Both">Both</option></select>
            <select class="q-input q-select" data-id="ringing_duration" title="How long"><option value="less than 5">less than 5</option><option value="5-10">5-10</option><option value="over 15">over 15</option></select>
        </div>
      </div>

      ${renderSimpleQ("loud_blast", "Exposure to a loud blast or explosion?", slot.testData.loud_blast)}

      <div class="q-row">
        <div class="q-label">Have you ever used a firearm?</div>
        <select class="q-input q-select" data-id="firearms" id="firearms" title="Firearm use"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="firearms_details">
        <div style="display:flex; gap:20px;">
            <select class="q-input q-select" data-id="firearm_type" title="Firearm type"><option value="Both">Both</option><option value="Handguns">Handguns</option><option value="Rifles">Rifles</option></select>
            <select class="q-input q-select" data-id="firearm_duration" title="Years of use"><option value="under 10">under 10</option><option value="10-20">10-20</option><option value="over 20">over 20</option></select>
        </div>
      </div>

      <h2 class="section-title">Hearing Test Results</h2>
      <div class="audio-entry-container" style="display:flex; gap:30px;">
          <div style="flex:1">
              <span class="ear-header">Left Ear (dB)</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('L', f, slot.testData['l'+f])).join('')}
              </div>
              <div class="audiogram-wrapper" id="chart-L">${renderAudiogramSVG('L')}</div>
          </div>
          <div style="flex:1">
              <span class="ear-header">Right Ear (dB)</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('R', f, slot.testData['r'+f])).join('')}
              </div>
              <div class="audiogram-wrapper" id="chart-R">${renderAudiogramSVG('R')}</div>
          </div>
      </div>

      <div style="margin-top: 40px; text-align: right; padding-bottom: 120px;">
          <button class="btn btn-primary" id="btn-complete-test" style="background: #1e3a5f; color: white; padding: 14px 60px; border:none; font-weight:bold;">Finish Test</button>
      </div>
    </div>
  `;

  // --- Handlers ---
  const toggleSub = (pId, sId) => { 
    const p = container.querySelector(`#${pId}`); 
    const s = container.querySelector(`#${sId}`); 
    if (p && s) {
        s.classList.toggle('visible', p.value === 'Yes');
        p.onchange = () => s.classList.toggle('visible', p.value === 'Yes');
    }
  };
  toggleSub('exposed_2hr', 'exposed_2hr_details');
  toggleSub('regular_hpd', 'hpd_details');
  toggleSub('ringing', 'ringing_details');
  toggleSub('firearms', 'firearms_details');

  container.querySelector('#btn-back').onclick = () => navigate('employee-list');

  updateAudiogramPlot(container, 'L', baseline);
  updateAudiogramPlot(container, 'R', baseline);

  container.querySelectorAll('.audio-input').forEach(sel => {
    sel.addEventListener('change', () => {
        updateAudiogramPlot(container, sel.dataset.ear, baseline);
        slot.testData[(sel.dataset.ear === 'L' ? 'l' : 'r') + sel.dataset.freq] = sel.value;
    });
  });

  container.querySelector('#btn-complete-test').onclick = async () => {
    const testResult = {
        test_date: TimeService.getTimestamp(),
        tech_id: state.user.tech_id,
        history: {},
        thresholds: {}
    };

    container.querySelectorAll('.q-input').forEach(s => testResult.history[s.dataset.id] = s.value);
    container.querySelectorAll('.audio-input').forEach(s => {
        const key = (s.dataset.ear === 'L' ? 'left_' : 'right_') + (s.dataset.freq >= 1000 ? (s.dataset.freq/1000)+'k' : s.dataset.freq);
        testResult.thresholds[key] = parseInt(s.value);
    });

    const pEmp = packet.employees.find(e => e.employee_id == emp.employee_id);
    if (pEmp) pEmp.completed_tests = [testResult];

    await savePacket(packet);
    slot.currentEmployee = null; slot.testData = {};
    navigate('employee-list');
  };

  const audioInputs = container.querySelectorAll('.audio-input');
  audioInputs.forEach((sel, idx) => {
    sel.onchange = () => { if (sel.value !== "" && idx < audioInputs.length - 1) audioInputs[idx + 1].focus(); };
  });
}

// Helper: Renders static background grid
function renderAudiogramSVG(ear) {
    return `<svg viewBox="0 0 300 240" style="width:100%; height:100%;">
        <rect x="40" y="40" width="240" height="70" fill="#76B214" opacity="0.1" />
        <g stroke="#ddd" stroke-width="1">
            ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map((f, i) => `<line x1="${40+(i*40)}" y1="20" x2="${40+(i*40)}" y2="220" />`).join('')}
            ${[0, 20, 40, 60, 80, 100].map((db) => `<line x1="40" y1="${40+((db+10)*2)}" x2="280" y2="${40+((db+10)*2)}" />`).join('')}
        </g>
        <line x1="40" y1="110" x2="280" y2="110" stroke="#76B214" stroke-width="2" stroke-dasharray="5,3" />
        <polyline id="base-path-${ear}" fill="none" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.4" />
        <g id="base-markers-${ear}" opacity="0.5"></g>
        <polyline id="path-${ear}" fill="none" stroke="${ear === 'L' ? '#0056b3' : '#d9534f'}" stroke-width="2.5" />
        <g id="markers-${ear}"></g>
    </svg>`;
}

// Helper: Updates plotted points
function updateAudiogramPlot(container, ear, baseline) {
    const freqs = [500, 1000, 2000, 3000, 4000, 6000, 8000];
    const baseMarkers = container.querySelector(`#base-markers-${ear}`);
    const basePath = container.querySelector(`#base-path-${ear}`);
    if (baseline && baseMarkers.innerHTML === '') {
        const basePoints = [];
        const source = baseline.thresholds || baseline;
        freqs.forEach((f, i) => {
            const key = (ear === 'L' ? 'left_' : 'right_') + (f >= 1000 ? (f/1000)+'k' : f);
            const foundKey = Object.keys(source).find(k => k.toLowerCase() === key.toLowerCase());
            const val = foundKey ? source[foundKey] : null;
            if (val !== undefined && val !== null) { const x = 40 + (i * 40), y = 40 + ((parseInt(val) + 10) * 2); basePoints.push(`${x},${y}`); baseMarkers.innerHTML += `<circle cx="${x}" cy="${y}" r="3" fill="#999" />`; }
        });
        basePath.setAttribute('points', basePoints.join(' '));
    }
    const points = [];
    const markers = container.querySelector(`#markers-${ear}`);
    const path = container.querySelector(`#path-${ear}`);
    markers.innerHTML = ''; 
    freqs.forEach((f, i) => {
        const val = container.querySelector(`.audio-input[data-ear="${ear}"][data-freq="${f}"]`).value;
        if (val !== "") {
            const x = 40 + (i * 40), y = 40 + ((parseInt(val) + 10) * 2); points.push(`${x},${y}`);
            if (ear === 'L') markers.innerHTML += `<g stroke="#0056b3" stroke-width="2"><line x1="${x-5}" y1="${y-5}" x2="${x+5}" y2="${y+5}" /><line x1="${x+5}" y1="${y-5}" x2="${x-5}" y2="${y+5}" /></g>`;
            else markers.innerHTML += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#d9534f" stroke-width="2.5" />`;
        }
    });
    path.setAttribute('points', points.join(' '));
}

function renderQ(id, label, cur = "No") { return `<div class="q-row"><span class="q-label">${label}</span><select class="q-input q-select" id="${id}" data-id="${id}" title="${label}"><option value="No" ${cur==='No'?'selected':''}>No</option><option value="Yes" ${cur==='Yes'?'selected':''}>Yes</option></select></div>`; }
function renderSimpleQ(id, label, cur = "No") { return `<div class="q-row"><div class="q-label">${label}</div><select class="q-input q-select" data-id="${id}" title="${label}"><option value="No" ${cur==='No'?'selected':''}>No</option><option value="Yes" ${cur==='Yes'?'selected':''}>Yes</option></select></div>`; }
function renderAudioInput(ear, freq, cur = "") {
    let opts = '<option value="">--</option>';
    for (let i = 0; i <= 100; i += 5) opts += `<option value="${i}" ${cur==i?'selected':''}>${i}</option>`;
    return `<div style="text-align:center;"><select class="audio-input" data-ear="${ear}" data-freq="${freq}" title="${ear} ear ${freq}Hz" style="width:100%; padding:8px 0; font-weight:bold; border-radius:4px; border:1px solid #ccc;">${opts}</select><label style="font-size:10px; color:#666; display:block; margin-top:4px;">${freq >= 1000 ? (freq/1000)+'k' : '.5k'}</label></div>`;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }