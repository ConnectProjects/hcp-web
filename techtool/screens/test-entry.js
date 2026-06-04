import { savePacket } from '../db/idb.js'

export function renderTestEntry(container, state, navigate) {
  const slot = state.slots[state.activeSlot];
  const emp = slot.currentEmployee;
  const packet = state.currentPacket;
  const baseline = emp?.baseline || null;

  if (!emp || !packet) { navigate('employee-list'); return; }

  container.innerHTML = `
    <div class="tech-tool-container">
      <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1 style="margin:0; font-size: 28px; color: #1e3a5f;">Hearing Test</h1>
      </div>
      
      <button class="btn btn-ghost" id="btn-back" style="margin-bottom:25px">❮ Back to List</button>

      <div style="background: #76B214; color: white; border-radius: 12px; padding: 25px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
          <div class="setting-item"><label style="font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Worker</label><span>${esc(emp.last_name)}, ${esc(emp.first_name)}</span></div>
          <div class="setting-item"><label style="font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Employer</label><span>${esc(packet.company?.name)}</span></div>
          <div class="setting-item"><label style="font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.85;">Date</label><span>${new Date().toISOString().split('T')[0]}</span></div>
      </div>

      <h2 class="section-title">Noise Exposure</h2>
      <div class="q-row">
        <div class="q-label">Exposed to noise within the last two hours?</div>
        <select class="q-input q-select" data-id="exposed_2hr" id="exposed_2hr"><option value="No">No</option><option value="Yes">Yes</option></select>
      </div>
      <div class="sub-question" id="exposed_2hr_details">
        <label class="q-label">Duration?</label>
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

      <div class="q-row">
        <div class="q-label">Has your employer given you information about noise and noise induced hearing loss in the last year?</div>
        <select class="q-input q-select" data-id="employer_info">
            <option value="No">No</option>
            <option value="Yes" selected>Yes</option> <!-- DEFAULTED TO YES -->
        </select>
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
          <div><span class="ear-header">Left Ear</span><div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('L', f)).join('')}</div><div class="audiogram-wrapper" id="chart-L">${renderAudiogramSVG('L')}</div></div>
          <div><span class="ear-header">Right Ear</span><div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioInput('R', f)).join('')}</div><div class="audiogram-wrapper" id="chart-R">${renderAudiogramSVG('R')}</div></div>
      </div>

      <h2 class="section-title">Finalize</h2>
      <textarea id="tech-notes" rows="3" style="width:100%; border-radius:8px; padding:10px;" placeholder="Notes...">${slot.techNotes || ''}</textarea>
      <div style="margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 12px;"><label style="display:flex; gap:15px; cursor:pointer; align-items: center;"><input type="checkbox" id="chk-confirm" style="width:20px; height:20px;"><span>Confirm test completion.</span></label></div>
      <div style="margin-top: 40px; text-align: right; padding-bottom: 100px;"><button class="btn btn-primary" id="btn-complete-test" style="background: #1e3a5f; color: white; padding: 14px 60px; border:none; font-weight:bold;">Finish Test</button></div>
    </div>
  `;

  // ... (All logic from previous turn: toggles, plotting, completion) ...
  const toggleSub = (pId, sId) => { const p = container.querySelector(`#${pId}`); const s = container.querySelector(`#${sId}`); if (p && s) p.onchange = () => s.classList.toggle('visible', p.value === 'Yes'); };
  toggleSub('exposed_2hr', 'exposed_2hr_details'); toggleSub('regular_hpd', 'hpd_details'); toggleSub('ringing', 'ringing_details');
  container.querySelector('#btn-back').onclick = () => navigate('employee-list');
  updateAudiogramPlot(container, 'L', baseline); updateAudiogramPlot(container, 'R', baseline);
  container.querySelectorAll('.audio-input').forEach(sel => sel.addEventListener('change', () => { updateAudiogramPlot(container, sel.dataset.ear, baseline); slot.testData[(sel.dataset.ear === 'L' ? 'l' : 'r') + sel.dataset.freq] = sel.value; }));

  container.querySelector('#btn-complete-test').onclick = async () => {
    if (!container.querySelector('#chk-confirm').checked) return alert("Confirm first.");
    const testResult = { test_date: new Date().toISOString().split('T')[0], tech_id: state.user.tech_id, history: { ...slot.testData }, notes: container.querySelector('#tech-notes').value, thresholds: {} };
    container.querySelectorAll('.audio-input').forEach(s => { const key = (s.dataset.ear === 'L' ? 'left_' : 'right_') + (s.dataset.freq >= 1000 ? (s.dataset.freq/1000)+'k' : s.dataset.freq); testResult.thresholds[key] = parseInt(s.value); });
    const pEmp = packet.employees.find(e => e.employee_id == emp.employee_id);
    if (pEmp) { if (!pEmp.completed_tests) pEmp.completed_tests = []; pEmp.completed_tests.push(testResult); }
    await savePacket(packet);
    slot.currentEmployee = null; slot.testData = {}; slot.scrollPos = 0;
    navigate('employee-list');
  };
}

function renderAudioInput(ear, freq) {
    let opts = '<option value="">--</option>';
    for (let i = 0; i <= 100; i += 5) opts += `<option value="${i}">${i}</option>`; // UPDATED RANGE 0-100
    return `<div style="text-align:center;"><select class="audio-input" data-ear="${ear}" data-freq="${freq}" style="width:100%; padding:8px 0; font-weight:bold;">${opts}</select><label style="font-size:10px; color:#666; display:block; margin-top:4px;">${freq >= 1000 ? (freq/1000)+'k' : '.5k'}</label></div>`;
}
// ... (renderAudiogramSVG and updateAudiogramPlot functions from previous turn) ...