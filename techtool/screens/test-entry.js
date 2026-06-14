import { savePacket } from '../db/idb.js'
import { TimeService } from '@shared/time-utils.js'

export function renderTestEntry(container, state, navigate) {
  const slot = state.slots[state.activeSlot];
  const emp = slot.currentEmployee;
  const packet = state.currentPacket;
  const baseline = emp?.baseline || null;

  if (!emp) { navigate('employee-list'); return; }

  container.innerHTML = `
    <div class="tech-tool-container">
      <div class="test-header-box">
          <div class="header-item"><strong>Worker</strong><span>${esc(emp.last_name)}, ${esc(emp.first_name)}</span></div>
          <div class="header-item"><strong>Employer</strong><span>${esc(packet?.company?.name || 'Manual')}</span></div>
          <div class="header-item"><strong>Date</strong><span>${new Date().toISOString().split('T')[0]}</span></div>
      </div>
      <button class="btn btn-ghost" id="btn-back">❮ Back to List</button>

      <h2 class="section-title">Noise Exposure</h2>
      <div class="form-card">
          ${renderQ("exposed_2hr", "Exposed to noise within the last two hours?", slot.testData.exposed_2hr)}
          <div class="sub-question ${slot.testData.exposed_2hr === 'Yes' ? 'visible' : ''}" id="exposed_2hr_details">
            <div class="q-row no-border">
                <span class="q-label">Duration?</span>
                <select class="q-input q-select" data-id="exposed_2hr_duration">
                    <option value="under 2hrs" ${slot.testData.exposed_2hr_duration === 'under 2hrs' ? 'selected' : ''}>under 2hrs</option>
                    <option value="2-4hrs" ${slot.testData.exposed_2hr_duration === '2-4hrs' ? 'selected' : ''}>2-4hrs</option>
                    <option value="4+hrs" ${slot.testData.exposed_2hr_duration === '4+hrs' ? 'selected' : ''}>4+hrs</option>
                </select>
            </div>
          </div>
          ${renderQ("regular_hpd", "Regularly wear hearing protection?", slot.testData.regular_hpd)}
          <div class="sub-question ${slot.testData.regular_hpd === 'Yes' ? 'visible' : ''}" id="hpd_details">
            <div class="q-row no-border">
                <span class="q-label">Class & Style</span>
                <div style="display:flex; gap:10px;">
                    <select class="q-input q-select" data-id="hpd_class"><option value="A" ${slot.testData.hpd_class === 'A' ? 'selected' : ''}>A</option><option value="B" ${slot.testData.hpd_class === 'B' ? 'selected' : ''}>B</option><option value="C" ${slot.testData.hpd_class === 'C' ? 'selected' : ''}>C</option></select>
                    <select class="q-input q-select" data-id="hpd_style"><option value="earplugs" ${slot.testData.hpd_style === 'earplugs' ? 'selected' : ''}>Earplugs</option><option value="earmuffs" ${slot.testData.hpd_style === 'earmuffs' ? 'selected' : ''}>Earmuffs</option><option value="custom" ${slot.testData.hpd_style === 'custom' ? 'selected' : ''}>Custom</option></select>
                </div>
            </div>
          </div>
          <div class="q-row">
            <span class="q-label">Has your employer given you information about noise induced hearing loss in the last year?</span>
            <select class="q-input q-select" data-id="employer_info"><option value="No" ${slot.testData.employer_info === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${slot.testData.employer_info !== 'No' ? 'selected' : ''}>Yes</option></select>
          </div>
      </div>

      <h2 class="section-title">Hearing History</h2>
      <div class="form-card">
          ${renderSimpleQ("ear_infection", "Severe ear infection?", slot.testData.ear_infection)}
          ${renderSimpleQ("ear_surgery", "Ear surgery?", slot.testData.ear_surgery)}
          ${renderSimpleQ("dizziness", "Dizziness or balance problems?", slot.testData.dizziness)}
          <div class="q-row">
            <span class="q-label">Ringing in ears (tinnitus)?</span>
            <select class="q-input q-select" data-id="ringing" id="ringing"><option value="No" ${slot.testData.ringing === 'No' ? 'selected' : ''}>No</option><option value="Yes" ${slot.testData.ringing === 'Yes' ? 'selected' : ''}>Yes</option></select>
          </div>
          <div class="sub-question ${slot.testData.ringing === 'Yes' ? 'visible' : ''}" id="ringing_details">
            <select class="q-input q-select" data-id="ringing_ear"><option value="Left" ${slot.testData.ringing_ear === 'Left' ? 'selected' : ''}>Left</option><option value="Right" ${slot.testData.ringing_ear === 'Right' ? 'selected' : ''}>Right</option><option value="Both" ${slot.testData.ringing_ear === 'Both' ? 'selected' : ''}>Both</option></select>
          </div>
      </div>

      <h2 class="section-title">Hearing Test Results</h2>
      <div class="audio-entry-container">
          <div style="flex:1">
              <span class="ear-header">Left Ear (dB)</span>
              <div class="audio-input-row">${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('L', f, slot.testData['left_'+(f>=1000?f/1000+'k':f)])).join('')}</div>
              <div class="audiogram-wrapper" id="chart-L">${renderAudiogramSVG('L')}</div>
          </div>
          <div style="flex:1">
              <span class="ear-header">Right Ear (dB)</span>
              <div class="audio-input-row">${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('R', f, slot.testData['right_'+(f>=1000?f/1000+'k':f)])).join('')}</div>
              <div class="audiogram-wrapper" id="chart-R">${renderAudiogramSVG('R')}</div>
          </div>
      </div>

      <h2 class="section-title">Finalize</h2>
      <textarea id="tech-notes" rows="4" style="width:100%; border: 1px solid #ccc; border-radius: 8px; padding: 15px;">${slot.techNotes || ''}</textarea>
      <div style="margin-top: 40px; text-align: right; padding-bottom: 100px;"><button class="btn btn-primary" id="btn-complete-test" style="background: #1e3a5f; color: white; padding: 16px 80px; border:none; font-weight:bold;">Finish Test</button></div>
    </div>`;

  // --- LOGIC ---
  const toggleSub = (pId, sId) => { const p = container.querySelector(`#${pId}`); const s = container.querySelector(`#${sId}`); if (p && s) p.onchange = () => s.classList.toggle('visible', p.value === 'Yes'); };
  toggleSub('exposed_2hr', 'exposed_2hr_details'); toggleSub('regular_hpd', 'hpd_details'); toggleSub('ringing', 'ringing_details');

  container.querySelector('#btn-back').onclick = () => navigate('employee-list');

  updateAudiogramPlot(container, 'L', baseline); updateAudiogramPlot(container, 'R', baseline);

  container.querySelectorAll('.audio-input').forEach(sel => sel.onchange = () => {
      updateAudiogramPlot(container, sel.dataset.ear, baseline);
  });

  container.querySelector('#btn-complete-test').onclick = async () => {
    const testResult = { 
        test_date: TimeService.getTimestamp(), 
        tech_id: state.user.tech_id, 
        history: {}, 
        thresholds: {}, 
        notes: container.querySelector('#tech-notes').value 
    };
    container.querySelectorAll('.q-input').forEach(s => testResult.history[s.dataset.id] = s.value);
    container.querySelectorAll('.audio-input').forEach(s => testResult.thresholds[s.dataset.id] = parseInt(s.value));

    const pEmp = packet.employees.find(e => e.employee_id == emp.employee_id);
    if (pEmp) pEmp.completed_tests = [testResult];
    await savePacket(packet);
    slot.currentEmployee = null; slot.testData = {}; slot.techNotes = '';
    navigate('employee-list');
  };
}

function renderSimpleQ(id, label, cur = "No") { return `<div class="q-row"><span class="q-label">${label}</span><select class="q-input q-select" data-id="${id}"><option value="No" ${cur==='No'?'selected':''}>No</option><option value="Yes" ${cur==='Yes'?'selected':''}>Yes</option></select></div>`; }
function renderQ(id, label, cur = "No") { return `<div class="q-row"><span class="q-label">${label}</span><select class="q-input q-select" id="${id}" data-id="${id}"><option value="No" ${cur==='No'?'selected':''}>No</option><option value="Yes" ${cur==='Yes'?'selected':''}>Yes</option></select></div>`; }
function renderAudioInput(ear, freq, curVal = "") {
    const dbKey = (ear === 'L' ? 'left_' : 'right_') + (freq >= 1000 ? (freq/1000)+'k' : freq);
    let opts = '<option value="">--</option>';
    for (let i = 0; i <= 100; i += 5) opts += `<option value="${i}" ${curVal == i && curVal !== "" ? 'selected' : ''}>${i}</option>`;
    return `<div style="text-align:center; flex:1;"><select class="audio-input" data-id="${dbKey}" data-ear="${ear}" data-freq="${freq}" style="width:100%; padding:8px 0; font-weight:bold; border:1px solid #ccc; border-radius:4px;">${opts}</select><label style="font-size:10px; color:#666; display:block; margin-top:4px;">${freq >= 1000 ? (freq/1000)+'k' : '.5k'}</label></div>`;
}
function renderAudiogramSVG(ear) { return `<svg viewBox="0 0 300 240" style="width:100%; height:100%;"><rect x="40" y="40" width="240" height="70" fill="#76B214" opacity="0.1" /><g stroke="#eee" stroke-width="1">${[500, 1000, 2000, 3000, 4000, 6000, 8000].map((f, i) => `<line x1="${40+(i*40)}" y1="20" x2="${40+(i*40)}" y2="220" />`).join('')}${ [0, 20, 40, 60, 80, 100].map((db) => `<line x1="40" y1="${40+((db+10)*2)}" x2="280" y2="${40+((db+10)*2)}" />`).join('')}</g><line x1="40" y1="110" x2="280" y2="110" stroke="#76B214" stroke-width="2" stroke-dasharray="5,3" /><polyline id="base-path-${ear}" fill="none" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.4" /><g id="base-markers-${ear}" opacity="0.5"></g><polyline id="path-${ear}" fill="none" stroke="${ear === 'L' ? '#0056b3' : '#d9534f'}" stroke-width="2.5" /><g id="markers-${ear}"></g></svg>`; }
function updateAudiogramPlot(container, ear, baseline) { const freqs = [500, 1000, 2000, 3000, 4000, 6000, 8000]; const baseMarkers = container.querySelector(`#base-markers-${ear}`); const basePath = container.querySelector(`#base-path-${ear}`); if (baseline && baseMarkers.innerHTML === '') { const basePoints = []; const source = baseline.thresholds || baseline; freqs.forEach((f, i) => { const key = (ear === 'L' ? 'left_' : 'right_') + (f >= 1000 ? (f/1000)+'k' : f); const foundKey = Object.keys(source).find(k => k.toLowerCase() === key.toLowerCase()); const val = foundKey ? source[foundKey] : null; if (val !== undefined && val !== null) { const x = 40 + (i * 40), y = 40 + ((parseInt(val) + 10) * 2); basePoints.push(`${x},${y}`); baseMarkers.innerHTML += `<circle cx="${x}" cy="${y}" r="3" fill="#999" />`; } }); basePath.setAttribute('points', basePoints.join(' ')); } const points = []; const markers = container.querySelector(`#markers-${ear}`); const path = container.querySelector(`#path-${ear}`); markers.innerHTML = ''; freqs.forEach((f, i) => { const val = container.querySelector(`.audio-input[data-ear="${ear}"][data-freq="${f}"]`).value; if (val !== "") { const x = 40 + (i * 40), y = 40 + ((parseInt(val) + 10) * 2); points.push(`${x},${y}`); if (ear === 'L') markers.innerHTML += `<g stroke="#0056b3" stroke-width="2"><line x1="${x-5}" y1="${y-5}" x2="${x+5}" y2="${y+5}" /><line x1="${x+5}" y1="${y-5}" x2="${x-5}" y2="${y+5}" /></g>`; else markers.innerHTML += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#d9534f" stroke-width="2.5" />`; } }); path.setAttribute('points', points.join(' ')); }
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }