import { writeJsonFile } from '@shared/fs/sync-folder.js'

export function renderTestEntry(container, state, navigate) {
  const slot = state.slots[state.activeSlot];
  const emp = slot.currentEmployee || { first_name: 'New', last_name: 'Worker' };
  const packet = slot.currentPacket || {};

  container.innerHTML = `
    <style>
        .sub-question { margin-left: 30px; padding: 10px; border-left: 3px solid #76B214; background: #f9f9f9; display: none; margin-top: 5px; margin-bottom: 10px; border-radius: 0 4px 4px 0; }
        .sub-question.visible { display: block; }
        .q-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; }
        .q-label { font-size: 14px; color: #333; flex: 1; padding-right: 15px; }
        .q-select { width: 120px; padding: 8px; border-radius: 4px; border: 1px solid #ccc; }
        
        /* Audiogram Styles */
        .audiogram-container { background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 10px; position: relative; width: 100%; height: 250px; }
        .chart-grid line { stroke: #e0e0e0; stroke-width: 1; }
        .chart-grid line.major { stroke: #ccc; }
        .chart-axis-text { font-size: 10px; fill: #888; font-family: sans-serif; }
        .normal-range { fill: #f0f4f0; opacity: 0.5; } /* Normal hearing shading */
    </style>

    <div class="tech-tool-container" style="max-width: 900px; margin: 0 auto; padding: 20px;">
      <div style="display:flex; justify-content: space-between; align-items: baseline;">
          <h1 style="color: #333;">Enter New Hearing Test</h1>
          <span class="badge" style="background:#76B214; color:white; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:bold;">BOOTH ${state.activeSlot + 1}</span>
      </div>
      
      <button class="btn btn-ghost" id="btn-back" style="margin-bottom:20px">❮ Back to List</button>

      <!-- 1. Test Setting (Green Box) -->
      <div style="background: #76B214; color: white; border-radius: 8px; padding: 25px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.9;">Worker</label><span style="font-size:1.1rem; font-weight:500;">${emp.last_name}, ${emp.first_name}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.9;">Employer</label><span style="font-size:1.1rem; font-weight:500;">${packet.company?.name || 'N/A'}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.9;">Test Date</label><span style="font-size:1.1rem; font-weight:500;">${new Date().toISOString().split('T')[0]}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.9;">Worker ID</label><span style="font-size:1.1rem; font-weight:500;">${emp.employee_id || '—'}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.9;">Location</label><span style="font-size:1.1rem; font-weight:500;">${packet.location_name || 'Main Office'}</span></div>
          <div class="setting-item"><label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.9;">Technician</label><span style="font-size:1.1rem; font-weight:500;">${state.user?.name || 'Admin'}</span></div>
      </div>

      <!-- 2. Noise Exposure -->
      <h2 style="color: #76B214; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Noise Exposure & Conservation</h2>
      <div class="q-row">
        <div class="q-label">Have you been exposed to noise within the last two hours?</div>
        <select class="q-input" data-id="exposed_2hr" id="exposed_2hr"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="exposed_2hr_details">
        <label class="q-label">How long was the exposure?</label>
        <select class="q-input" data-id="exposed_2hr_duration"><option value="under 2hrs">under 2hrs</option><option value="2-4hrs">2-4hrs</option><option value="4+hrs">4+hrs</option></select>
      </div>

      <div class="q-row">
        <div class="q-label">Do you regularly wear hearing protection in noisy areas?</div>
        <select class="q-input" data-id="regular_hpd" id="regular_hpd"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="hpd_details">
        <div style="display:flex; gap:20px;">
            <div style="flex:1">
                <label class="q-label">Class</label>
                <select class="q-input" data-id="hpd_class"><option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option></select>
            </div>
            <div style="flex:1">
                <label class="q-label">Style</label>
                <select class="q-input" data-id="hpd_style"><option value="earplugs">Earplugs</option><option value="earmuffs">Earmuffs</option><option value="custom">Custom Molded</option></select>
            </div>
        </div>
      </div>

      <div class="q-row">
        <div class="q-label">Has your employer given you information about noise and noise induced hearing loss in the last year?</div>
        <select class="q-input" data-id="employer_info"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>

      <!-- 3. Hearing History -->
      <h2 style="color: #76B214; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Noise & Hearing History</h2>
      ${renderSimpleQ("ear_infection", "Have you ever had a severe ear infection?")}
      ${renderSimpleQ("ear_surgery", "Have you ever had ear surgery?")}
      ${renderSimpleQ("dizziness", "Have you ever had dizziness or balance problems?")}
      ${renderSimpleQ("head_injury", "Have you ever had a serious head injury?")}
      ${renderSimpleQ("childhood_loss", "Did you have hearing loss in childhood?")}

      <div class="q-row">
        <div class="q-label">Do you have ringing in your ears?</div>
        <select class="q-input" data-id="ringing" id="ringing"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="ringing_details">
        <div style="display:flex; gap:20px;">
            <div style="flex:1">
                <label class="q-label">Which ear?</label>
                <select class="q-input" data-id="ringing_ear"><option value="Left">Left</option><option value="Right">Right</option><option value="Both">Both</option></select>
            </div>
            <div style="flex:1">
                <label class="q-label">How long? (Years)</label>
                <select class="q-input" data-id="ringing_duration"><option value="less than 5">less than 5</option><option value="5-10">5-10</option><option value="11-15">11-15</option><option value="over 15">over 15</option></select>
            </div>
        </div>
      </div>

      ${renderSimpleQ("loud_blast", "Have you ever had exposure to a loud blast or explosion?")}

      <div class="q-row">
        <div class="q-label">Have you ever used a firearm?</div>
        <select class="q-input" data-id="firearms" id="firearms"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="firearms_details">
        <div style="display:flex; gap:20px;">
            <div style="flex:1">
                <label class="q-label">Type</label>
                <select class="q-input" data-id="firearm_type"><option value="Both">Both</option><option value="Handguns">Handguns</option><option value="Rifles">Rifles</option></select>
            </div>
            <div style="flex:1">
                <label class="q-label">Frequency of use</label>
                <select class="q-input" data-id="firearm_duration"><option value="under 10">under 10 yrs</option><option value="10-20">10-20 yrs</option><option value="over 20">over 20 yrs</option></select>
            </div>
        </div>
      </div>

      <!-- 4. Audiogram Results -->
      <h2 style="color: #76B214; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Hearing Test Results</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px;">
          <div>
              <span style="font-weight:bold; color:#1e3a5f; display:block; margin-bottom:15px; text-transform:uppercase;">Left Ear (dB)</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('L', f)).join('')}
              </div>
              <div class="audiogram-container" id="chart-L">
                ${renderAudiogramSVG('L')}
              </div>
          </div>
          <div>
              <span style="font-weight:bold; color:#1e3a5f; display:block; margin-bottom:15px; text-transform:uppercase;">Right Ear (dB)</span>
              <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">
                  ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('R', f)).join('')}
              </div>
              <div class="audiogram-container" id="chart-R">
                ${renderAudiogramSVG('R')}
              </div>
          </div>
      </div>

      <!-- 5. Comments & Submit -->
      <h2 style="color: #76B214; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Finalize</h2>
      <div class="form-group">
          <label>Additional Technician Notes</label>
          <textarea id="tech-notes" rows="4" style="width:100%; border: 1px solid #ccc; border-radius: 4px; padding: 12px;"></textarea>
      </div>

      <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-top: 20px;">
          <label style="display:flex; gap:12px; font-size: 14px; cursor:pointer; align-items: center;">
              <input type="checkbox" id="chk-confirm" style="width:20px; height:20px;"> 
              <span>I confirm that this test was conducted according to provincial guidelines and the worker has been counselled.</span>
          </label>
      </div>

      <div style="margin-top: 40px; text-align: right; display: flex; gap: 15px; justify-content: flex-end; padding-bottom: 80px;">
          <button class="btn btn-outline" id="btn-save-draft">Save Draft</button>
          <button class="btn btn-primary" id="btn-submit-test" style="background: #1e3a5f; color: white; padding: 12px 40px; border:none;">Submit to Inbox</button>
      </div>
    </div>
  `;

  // --- INTERACTION LOGIC ---

  const toggleSub = (parentId, subId) => {
    const parent = container.querySelector(`#${parentId}`);
    const sub = container.querySelector(`#${subId}`);
    parent.onchange = () => sub.classList.toggle('visible', parent.value === 'Yes');
  };

  toggleSub('exposed_2hr', 'exposed_2hr_details');
  toggleSub('regular_hpd', 'hpd_details');
  toggleSub('ringing', 'ringing_details');
  toggleSub('firearms', 'firearms_details');

  container.querySelector('#btn-back').onclick = () => navigate('employee-list');

  // Trigger Audiogram update on change
  container.querySelectorAll('.audio-input').forEach(sel => {
    sel.addEventListener('change', () => updateAudiogramPlot(container, sel.dataset.ear));
  });

  container.querySelector('#btn-submit-test').onclick = async () => {
    if (!container.querySelector('#chk-confirm').checked) return alert("Please check the confirmation box.");
    if (!state.syncFolder) return alert("Sync folder not connected.");

    const finalResult = {
        tech: state.user,
        worker: { firstName: emp.first_name, lastName: emp.last_name, dob: emp.dob, id: emp.employee_id },
        employer: { name: packet.company?.name, location: packet.location_name },
        test_date: new Date().toISOString().split('T')[0],
        history: {},
        audio: { left: {}, right: {} },
        notes: container.querySelector('#tech-notes').value
    };

    container.querySelectorAll('.q-input').forEach(s => finalResult.history[s.dataset.id] = s.value);
    container.querySelectorAll('.audio-input').forEach(s => {
        const ear = s.dataset.ear === 'L' ? 'left' : 'right';
        finalResult.audio[ear][s.dataset.freq] = s.value;
    });

    try {
        const filename = `test_${emp.last_name}_${Date.now()}.json`;
        await writeJsonFile(state.syncFolder, 'inbox', filename, finalResult);
        alert("Submitted to Shared Folder!");
        navigate('dashboard');
    } catch (e) { alert(e.message); }
  };

  // Auto-tab logic
  const selects = container.querySelectorAll('.audio-input');
  selects.forEach((sel, idx) => {
    sel.onchange = () => { if (sel.value !== "" && idx < selects.length - 1) selects[idx + 1].focus(); };
  });
}

// ---------------------------------------------------------------------------
// Audiogram Plotting Logic (SVG)
// ---------------------------------------------------------------------------

function renderAudiogramSVG(ear) {
    return `
    <svg viewBox="0 0 300 220" style="width:100%; height:100%;">
        <!-- Shaded Normal Range (0-25dB) -->
        <rect x="40" y="40" width="240" height="50" class="normal-range" />
        
        <g class="chart-grid">
            <!-- Frequencies (X-axis) -->
            ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map((f, i) => {
                const x = 40 + (i * 40);
                return `<line x1="${x}" y1="20" x2="${x}" y2="200" />
                        <text x="${x}" y="215" text-anchor="middle" class="chart-axis-text">${f >= 1000 ? (f/1000)+'k' : '.5k'}</text>`;
            }).join('')}
            
            <!-- Intensity (Y-axis) -->
            ${[-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((db) => {
                const y = 40 + ((db + 10) * 2);
                return `<line x1="40" y1="${y}" x2="280" y2="${y}" class="${db % 20 === 0 ? 'major' : ''}" />
                        <text x="35" y="${y + 4}" text-anchor="end" class="chart-axis-text">${db}</text>`;
            }).join('')}
        </g>
        
        <!-- Data Path -->
        <polyline id="path-${ear}" fill="none" stroke="${ear === 'L' ? '#0056b3' : '#d9534f'}" stroke-width="2" />
        <g id="markers-${ear}"></g>
    </svg>`;
}

function updateAudiogramPlot(container, ear) {
    const freqs = [500, 1000, 2000, 3000, 4000, 6000, 8000];
    const points = [];
    const markers = container.querySelector(`#markers-${ear}`);
    const path = container.querySelector(`#path-${ear}`);
    
    markers.innerHTML = ''; // Clear markers

    freqs.forEach((f, i) => {
        const val = container.querySelector(`.audio-input[data-ear="${ear}"][data-freq="${f}"]`).value;
        if (val !== "") {
            const x = 40 + (i * 40);
            const y = 40 + ((parseInt(val) + 10) * 2);
            points.push(`${x},${y}`);
            
            // Draw Clinical Symbol
            if (ear === 'L') {
                // Blue X
                markers.innerHTML += `<g stroke="#0056b3" stroke-width="2">
                    <line x1="${x-4}" y1="${y-4}" x2="${x+4}" y2="${y+4}" />
                    <line x1="${x+4}" y1="${y-4}" x2="${x-4}" y2="${y+4}" />
                </g>`;
            } else {
                // Red O
                markers.innerHTML += `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#d9534f" stroke-width="2" />`;
            }
        }
    });
    
    path.setAttribute('points', points.join(' '));
}

function renderSimpleQ(id, label) {
    return `<div class="q-row">
        <div class="q-label">${label}</div>
        <select class="q-input" data-id="${id}"><option value="No">No</option><option value="Yes">Yes</option></select>
    </div>`;
}

function renderAudioInput(ear, freq) {
    let opts = '<option value="">--</option>';
    for (let i = -10; i <= 90; i += 5) opts += `<option value="${i}">${i}</option>`;
    const label = freq >= 1000 ? (freq/1000) + 'k' : '.5k';
    return `<div style="text-align:center;">
                <select class="audio-input" data-ear="${ear}" data-freq="${freq}" style="width:100%; padding:8px 0; font-weight:bold;">${opts}</select>
                <label style="font-size:10px; color:#666; display:block; margin-top:4px;">${label}</label>
            </div>`;
}