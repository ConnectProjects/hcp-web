import { savePacket } from '../db/idb.js'
import { TimeService } from '../../shared/time-utils.js'

export function renderTestEntry(container, state, navigate) {
  const slot = state.slots[state.activeSlot];
  const emp = slot.currentEmployee;
  const packet = state.currentPacket;
  const baseline = emp?.baseline || null;

  if (!emp || !packet) { navigate('employee-list'); return; }

  container.innerHTML = `
    <style>
        .tech-tool-container { max-width: 1000px; margin: 0 auto; padding: 20px; }
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
          <button class="btn btn-ghost" id="btn-back">❮ Back to List</button>
      </div>

      <div style="background: #76B214; color: white; border-radius: 12px; padding: 25px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85; margin-bottom:4px;">Worker</label><span style="font-size:1.1rem; font-weight:600;">${esc(emp.last_name)}, ${esc(emp.first_name)}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85; margin-bottom:4px;">Employer</label><span style="font-size:1.1rem; font-weight:600;">${esc(packet.company?.name)}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85; margin-bottom:4px;">Date</label><span style="font-size:1.1rem; font-weight:600;">${new Date().toISOString().split('T')[0]}</span></div>
      </div>

      <h2 class="section-title" style="margin-top:0">Noise Exposure</h2>
      ${renderQ("exposed_2hr", "Exposed to noise within the last two hours?", slot.testData.exposed_2hr)}
      <div class="sub-question" id="exposed_2hr_details">
        <label class="q-label">Duration?</label>
        <select class="q-input q-select" data-id="exposed_2hr_duration"><option value="under 2hrs">under 2hrs</option><option value="2-4hrs">2-4hrs</option><option value="4+hrs">4+hrs</option></select>
      </div>

      ${renderQ("regular_hpd", "Regularly wear hearing protection?", slot.testData.regular_hpd)}
      <div class="sub-question" id="hpd_details">
        <div style="display:flex; gap:20px;">
            <select class="q-input q-select" data-id="hpd_class"><option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option></select>
            <select class="q-input q-select" data-id="hpd_style"><option value="earplugs">Earplugs</option><option value="earmuffs">Earmuffs</option><option value="custom">Custom</option></select>
        </div>
      </div>

      <div class="q-row">
        <div class="q-label">Has your employer given you information about noise induced hearing loss in the last year?</div>
        <select class="q-input q-select" data-id="employer_info">
            <option value="No">No</option>
            <option value="Yes" selected>Yes</option> <!-- DEFAULTED TO YES -->
        </select>
      </div>

      <h2 class="section-title">Hearing History</h2>
      ${renderSimpleQ("ear_infection", "Severe ear infection?", slot.testData.ear_infection)}
      ${renderSimpleQ("ear_surgery", "Ear surgery?", slot.testData.ear_surgery)}
      ${renderSimpleQ("dizziness", "Dizziness or balance problems?", slot.testData.dizziness)}
      
      <div class="q-row">
        <div class="q-label">Ringing in ears (tinnitus)?</div>
        <select class="q-input q-select" data-id="ringing" id="ringing"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="ringing_details">
        <select class="q-input q-select" data-id="ringing_ear"><option value="Left">Left</option><option value="Right">Right</option><option value="Both">Both</option></select>
      </div>

      <h2 class="section-title">Hearing Test Results</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px;">
          <div>
              <span class="ear-header">Left Ear (dB)</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('L', f, slot.testData['l'+f])).join('')}
              </div>
              <div class="audiogram-wrapper" id="chart-L">${renderAudiogramSVG('L')}</div>
          </div>
          <div>
              <span class="ear-header">Right Ear (dB)</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('R', f, slot.testData['r'+f])).join('')}
              </div>
              <div class="audiogram-wrapper" id="chart-R">${renderAudiogramSVG('R')}</div>
          </div>
      </div>

      <h2 class="section-title">Finalize</h2>
      <textarea id="tech-notes" rows="4" style="width:100%; border: 1px solid #ccc; border-radius: 8px; padding: 15px; font-size:14px;">${slot.techNotes || ''}</textarea>

      <div style="margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 12px; border: 1px solid #e2e8f0;">
          <label style="display:flex; gap:15px; font-size: 15px; cursor:pointer; align-items: center; color:#1e3a5f;">
              <input type="checkbox" id="chk-confirm" style="width:22px; height:22px; accent-color:#76B214;"> 
              <span>I confirm that this test was conducted according to provincial guidelines.</span>
          </label>
      </div>

      <div style="margin-top: 50px; text-align: right; display: flex; gap: 15px; justify-content: flex-end; padding-bottom: 120px;">
          <button class="btn btn-primary" id="btn-complete-test" style="background: #1e3a5f; color: white; padding: 14px 60px; border:none; font-weight:bold;">Finish Test</button>
      </div>
    </div>
  `;

  // --- INTERACTION LOGIC ---
  const toggleSub = (parentId, subId) => {
    const parent = container.querySelector(`#${parentId}`);
    const sub = container.querySelector(`#${subId}`);
    if (parent && sub) {
        sub.classList.toggle('visible', parent.value === 'Yes');
        parent.onchange = () => sub.classList.toggle('visible', parent.value === 'Yes');
    }
  };
  toggleSub('exposed_2hr', 'exposed_2hr_details');
  toggleSub('regular_hpd', 'hpd_details');
  toggleSub('ringing', 'ringing_details');

  container.querySelector('#btn-back').onclick = () => navigate('employee-list');

  // Initial plot of Baseline and Current
  updateAudiogramPlot(container, 'L', baseline);
  updateAudiogramPlot(container, 'R', baseline);

  container.querySelectorAll('.audio-input').forEach(sel => {
    sel.addEventListener('change', () => {
        updateAudiogramPlot(container, sel.dataset.ear, baseline);
        const key = (sel.dataset.ear === 'L' ? 'l' : 'r') + sel.dataset.freq;
        slot.testData[key] = sel.value;
    });
  });

  container.querySelector('#btn-complete-test').onclick = async () => {
    if (!container.querySelector('#chk-confirm').checked) return alert("Confirm first.");

    const testResult = {
        test_date: TimeService.getTimestamp(),
        tech_id: state.user.user_id,
        history: {},
        notes: container.querySelector('#tech-notes').value,
        thresholds: {}
    };

    container.querySelectorAll('.q-input').forEach(s => testResult.history[s.dataset.id] = s.value);
    container.querySelectorAll('.audio-input').forEach(s => {
        const key = (s.dataset.ear === 'L' ? 'left_' : 'right_') + (s.dataset.freq >= 1000 ? (s.dataset.freq/1000)+'k' : s.dataset.freq);
        testResult.thresholds[key] = parseInt(s.value);
    });

    const pEmp = packet.employees.find(e => e.employee_id == emp.employee_id);
    if (pEmp) {
        if (!pEmp.completed_tests) pEmp.completed_tests = [];
        // Replace existing if editing, otherwise push
        pEmp.completed_tests = [testResult];
    }

    await savePacket(packet);
    slot.currentEmployee = null; slot.testData = {};
    navigate('employee-list');
  };

  const audioInputs = container.querySelectorAll('.audio-input');
  audioInputs.forEach((sel, idx) => {
    sel.onchange = () => { if (sel.value !== "" && idx < audioInputs.length - 1) audioInputs[idx + 1].focus(); };
  });
}

function renderAudiogramSVG(ear) {
    return `<svg viewBox="0 0 300 240" style="width:100%; height:100%;">
        <rect x="40" y="40" width="240" height="70" class="normal-range" />
        <g class="chart-grid">
            ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map((f, i) => `<line x1="${40+(i*40)}" y1="20" x2="${40+(i*40)}" y2="220" />`).join('')}
            ${[0, 20, 40, 60, 80, 100].map((db) => `<line x1="40" y1="${40+((db+10)*2)}" x2="280" y2="${40+((db+10)*2)}" />`).join('')}
        </g>
        <line x1="40" y1="110" x2="280" y2="110" class="threshold-line" />
        <polyline id="base-path-${ear}" fill="none" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.4" />
        <g id="base-markers-${ear}" opacity="0.5"></g>
        <polyline id="path-${ear}" fill="none" stroke="${ear === 'L' ? '#0056b3' : '#d9534f'}" stroke-width="2.5" />
        <g id="markers-${ear}"></g>
    </svg>`;
}

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
            if (val !== undefined && val !== null && val !== "") {
                const x = 40 + (i * 40), y = 40 + ((parseInt(val) + 10) * 2);
                basePoints.push(`${x},${y}`);
                baseMarkers.innerHTML += `<circle cx="${x}" cy="${y}" r="3" fill="#999" />`;
            }
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
            const x = 40 + (i * 40), y = 40 + ((parseInt(val) + 10) * 2);
            points.push(`${x},${y}`);
            if (ear === 'L') markers.innerHTML += `<g stroke="#0056b3" stroke-width="2"><line x1="${x-5}" y1="${y-5}" x2="${x+5}" y2="${y+5}" /><line x1="${x+5}" y1="${y-5}" x2="${x-5}" y2="${y+5}" /></g>`;
            else markers.innerHTML += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#d9534f" stroke-width="2.5" />`;
        }
    });
    path.setAttribute('points', points.join(' '));
}

function renderQ(id, label, currentVal = "No") {
  return `<div class="q-row"><span class="q-label">${label}</span><select class="q-input q-select" id="${id}" data-id="${id}"><option value="No" ${currentVal === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${currentVal === 'Yes' ? 'selected' : ''}>Yes</option></select></div>`;
}

function renderSimpleQ(id, label, currentVal = "No") {
  return `<div class="q-row"><div class="q-label">${label}</div><select class="q-input q-select" data-id="${id}"><option value="No" ${currentVal === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${currentVal === 'Yes' ? 'selected' : ''}>Yes</option></select></div>`;
}

function renderAudioInput(ear, freq, currentVal = "") {
    let opts = '<option value="">--</option>';
    for (let i = 0; i <= 100; i += 5) opts += `<option value="${i}" ${currentVal == i ? 'selected' : ''}>${i}</option>`;
    return `<div style="text-align:center;"><select class="audio-input" data-ear="${ear}" data-freq="${freq}" style="width:100%; padding:8px 0; font-weight:bold; border-radius:4px; border:1px solid #ccc;">${opts}</select><label style="font-size:10px; color:#666; display:block; margin-top:4px;">${freq >= 1000 ? (freq/1000)+'k' : '.5k'}</label></div>`;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }