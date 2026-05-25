import { savePacket } from '../db/idb.js'

export function renderTestEntry(container, state, navigate) {
  const slot = state.slots[state.activeSlot];
  const emp = slot.currentEmployee;
  const packet = state.currentPacket;
  const baseline = emp?.baseline || null;

  if (!emp || !packet) {
    navigate('employee-list');
    return;
  }

  container.innerHTML = `
    <style>
        .tech-tool-container { max-width: 900px; margin: 0 auto; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
        .sub-question { margin-left: 30px; padding: 15px; border-left: 4px solid #76B214; background: #f9f9f9; display: none; margin-top: 5px; margin-bottom: 15px; border-radius: 0 8px 8px 0; }
        .sub-question.visible { display: block; }
        .q-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #eee; }
        .q-label { font-size: 14px; color: #333; flex: 1; padding-right: 20px; line-height: 1.4; }
        .q-select { width: 120px; padding: 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; background: white; }
        .section-title { color: #76B214; font-size: 1.5rem; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 45px 0 20px 0; font-weight: 700; }
        .audiogram-wrapper { background: white; border: 1px solid #ddd; border-radius: 8px; margin-top: 15px; position: relative; width: 100%; height: 260px; }
        .chart-grid line { stroke: #eef0f2; stroke-width: 1; }
        .chart-grid line.major { stroke: #d1d5db; }
        .chart-axis-text { font-size: 10px; fill: #9ca3af; font-weight: 500; }
        .normal-range { fill: #76B214; opacity: 0.12; }
        .threshold-line { stroke: #76B214; stroke-width: 2; stroke-dasharray: 5,3; }
        .range-label { font-size: 9px; fill: #4d8a0b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
        .ear-header { font-weight: 800; color: #1e3a5f; display: block; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; }
        .baseline-info { font-size: 11px; color: #888; margin-bottom: 10px; display: block; }
        .badge-booth { background: #76B214; color: white; padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    </style>

    <div class="tech-tool-container">
      <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1 style="margin:0; font-size: 28px; color: #1e3a5f;">Hearing Test</h1>
          <span class="badge-booth">BOOTH ${state.activeSlot + 1}</span>
      </div>
      
      <button class="btn btn-ghost" id="btn-back" style="margin-bottom:25px">❮ Back to List</button>

      <!-- 1. Test Setting -->
      <div style="background: #76B214; color: white; border-radius: 12px; padding: 25px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Worker</label><span>${esc(emp.last_name)}, ${esc(emp.first_name)}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Employer</label><span>${esc(packet.company?.name)}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Date</label><span>${new Date().toISOString().split('T')[0]}</span></div>
      </div>

      <h2 class="section-title" style="margin-top:0">Noise Exposure</h2>
      <div class="q-row">
        <div class="q-label">Exposed to noise within the last two hours?</div>
        <select class="q-input q-select" data-id="exposed_2hr" id="exposed_2hr"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="exposed_2hr_details">
        <label class="q-label">Exposure duration?</label>
        <select class="q-input q-select" data-id="exposed_2hr_duration"><option value="under 2hrs">under 2hrs</option><option value="2-4hrs">2-4hrs</option><option value="4+hrs">4+hrs</option></select>
      </div>

      <div class="q-row">
        <div class="q-label">Regularly wear hearing protection?</div>
        <select class="q-input q-select" data-id="regular_hpd" id="regular_hpd"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="hpd_details">
        <div style="display:flex; gap:20px;">
            <select class="q-input q-select" data-id="hpd_class"><option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option></select>
            <select class="q-input q-select" data-id="hpd_style"><option value="earplugs">Earplugs</option><option value="earmuffs">Earmuffs</option><option value="custom">Custom</option></select>
        </div>
      </div>

      <h2 class="section-title">Hearing History</h2>
      ${renderSimpleQ("ear_infection", "Severe ear infection?")}
      ${renderSimpleQ("ear_surgery", "Ear surgery?")}
      ${renderSimpleQ("dizziness", "Dizziness or balance problems?")}
      
      <div class="q-row">
        <div class="q-label">Ringing in ears (tinnitus)?</div>
        <select class="q-input q-select" data-id="ringing" id="ringing"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="ringing_details">
        <select class="q-input q-select" data-id="ringing_ear"><option value="Left">Left</option><option value="Right">Right</option><option value="Both">Both</option></select>
        <select class="q-input q-select" data-id="ringing_duration"><option value="less than 5">less than 5</option><option value="over 15">over 15</option></select>
      </div>

      <h2 class="section-title">Test Results (dB)</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
          <div>
              <span class="ear-header">Left Ear</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('L', f)).join('')}
              </div>
              <div class="audiogram-wrapper" id="chart-L">${renderAudiogramSVG('L')}</div>
          </div>
          <div>
              <span class="ear-header">Right Ear</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('R', f)).join('')}
              </div>
              <div class="audiogram-wrapper" id="chart-R">${renderAudiogramSVG('R')}</div>
          </div>
      </div>

      <h2 class="section-title">Finalize</h2>
      <textarea id="tech-notes" rows="3" style="width:100%; border-radius:8px; padding:10px;" placeholder="Notes..."></textarea>

      <div style="margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 12px;">
          <label style="display:flex; gap:15px; cursor:pointer; align-items: center;">
              <input type="checkbox" id="chk-confirm" style="width:20px; height:20px;"> 
              <span>Confirm test completion and worker counseling.</span>
          </label>
      </div>

      <div style="margin-top: 40px; text-align: right; padding-bottom: 100px;">
          <button class="btn btn-primary" id="btn-complete-test" style="background: #1e3a5f; color: white; padding: 14px 60px; border:none; font-weight:bold;">Finish Test</button>
      </div>
    </div>
  `;

  // --- LOGIC ---

  const toggleSub = (parentId, subId) => {
    const parent = container.querySelector(`#${parentId}`);
    const sub = container.querySelector(`#${subId}`);
    if (parent && sub) parent.onchange = () => sub.classList.toggle('visible', parent.value === 'Yes');
  };
  toggleSub('exposed_2hr', 'exposed_2hr_details');
  toggleSub('regular_hpd', 'hpd_details');
  toggleSub('ringing', 'ringing_details');

  container.querySelector('#btn-back').onclick = () => navigate('employee-list');

  // Initial plot
  updateAudiogramPlot(container, 'L', baseline);
  updateAudiogramPlot(container, 'R', baseline);

  container.querySelectorAll('.audio-input').forEach(sel => {
    sel.addEventListener('change', () => {
        updateAudiogramPlot(container, sel.dataset.ear, baseline);
        slot.testData[(sel.dataset.ear === 'L' ? 'l' : 'r') + sel.dataset.freq] = sel.value;
    });
  });

  // THE CORE CHANGE: Save into the Packet locally
  container.querySelector('#btn-complete-test').onclick = async () => {
    if (!container.querySelector('#chk-confirm').checked) return alert("Please check the confirmation box.");

    // 1. Create the test result object
    const testResult = {
        test_date: new Date().toISOString().split('T')[0],
        tech_id: state.user.tech_id,
        history: { ...slot.testData },
        notes: container.querySelector('#tech-notes').value,
        thresholds: {}
    };

    // Map thresholds
    container.querySelectorAll('.audio-input').forEach(s => {
        const key = (s.dataset.ear === 'L' ? 'left_' : 'right_') + (s.dataset.freq >= 1000 ? (s.dataset.freq/1000)+'k' : s.dataset.freq);
        testResult.thresholds[key] = parseInt(s.value);
    });

    // 2. Find the employee in the current packet and update them
    const pEmp = packet.employees.find(e => e.employee_id == emp.employee_id);
    if (pEmp) {
        if (!pEmp.completed_tests) pEmp.completed_tests = [];
        pEmp.completed_tests.push(testResult);
        pEmp.status = 'tested';
    }

    // 3. Save the entire updated packet to local database
    await savePacket(packet);

    // 4. Reset slot and go back
    slot.currentEmployee = null;
    slot.testData = {};
    alert("Test recorded!");
    navigate('employee-list');
  };
}

// ---------------------------------------------------------------------------
// Audiogram Plotting
// ---------------------------------------------------------------------------

function renderAudiogramSVG(ear) {
    return `<svg viewBox="0 0 300 240" style="width:100%; height:100%;">
        <rect x="40" y="40" width="240" height="70" class="normal-range" />
        <line x1="40" y1="110" x2="280" y2="110" class="threshold-line" />
        <g class="chart-grid">
            ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map((f, i) => `<line x1="${40+(i*40)}" y1="20" x2="${40+(i*40)}" y2="220" />`).join('')}
            ${[-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((db) => `<line x1="40" y1="${40+((db+10)*2)}" x2="280" y2="${40+((db+10)*2)}" />`).join('')}
        </g>
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
            const val = source[key];
            if (val !== undefined && val !== null) {
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

function renderSimpleQ(id, label) {
    return `<div class="q-row"><div class="q-label">${label}</div><select class="q-input q-select" data-id="${id}"><option value="No">No</option><option value="Yes">Yes</option></select></div>`;
}

function renderAudioInput(ear, freq) {
    let opts = '<option value="">--</option>';
    for (let i = -10; i <= 90; i += 5) opts += `<option value="${i}">${i}</option>`;
    return `<div style="text-align:center;"><select class="audio-input" data-ear="${ear}" data-freq="${freq}" style="width:100%; padding:8px 0; font-weight:bold;">${opts}</select><label style="font-size:10px; color:#666; display:block; margin-top:4px;">${freq >= 1000 ? (freq/1000)+'k' : '.5k'}</label></div>`;
}

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }