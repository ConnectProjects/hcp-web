import { writeJsonFile } from '@shared/fs/sync-folder.js'

export function renderTestEntry(container, state, navigate) {
  // Access the data for the currently active booth/slot
  const slot = state.slots[state.activeSlot];
  const emp = slot.currentEmployee || { first_name: 'New', last_name: 'Worker' };
  const packet = slot.currentPacket || {};

  container.innerHTML = `
    <div class="tech-tool-container" style="max-width: 900px; margin: 0 auto; padding: 20px;">
      
      <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1 style="margin:0; color: #333;">New Hearing Test</h1>
        <div style="text-align:right">
            <span class="badge" style="background:#76B214; color:white; padding:4px 12px; border-radius:20px; font-size:12px;">
                BOOTH ${state.activeSlot + 1}
            </span>
        </div>
      </div>

      <!-- SECTION 1: TEST SETTING (Connect Hearing Green) -->
      <div style="background: #76B214; color: white; border-radius: 8px; padding: 25px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <div class="setting-item">
            <label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8; margin-bottom:4px;">Worker</label>
            <span style="font-size:1.1rem; font-weight:500;">${emp.last_name}, ${emp.first_name}</span>
        </div>
        <div class="setting-item">
            <label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8; margin-bottom:4px;">Employer</label>
            <span style="font-size:1.1rem; font-weight:500;">${packet.company_name || 'Manual Entry'}</span>
        </div>
        <div class="setting-item">
            <label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8; margin-bottom:4px;">Test Date</label>
            <span style="font-size:1.1rem; font-weight:500;">${new Date().toISOString().split('T')[0]}</span>
        </div>
        <div class="setting-item">
            <label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8; margin-bottom:4px;">Worker ID</label>
            <span style="font-size:1.1rem; font-weight:500;">${emp.employee_id || '—'}</span>
        </div>
        <div class="setting-item">
            <label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8; margin-bottom:4px;">Location</label>
            <span style="font-size:1.1rem; font-weight:500;">${packet.location_name || 'Main Office'}</span>
        </div>
        <div class="setting-item">
            <label style="display:block; font-size:10px; text-transform:uppercase; font-weight:bold; opacity:0.8; margin-bottom:4px;">Technician</label>
            <span style="font-size:1.1rem; font-weight:500;">${state.user?.name || 'Tech'}</span>
        </div>
      </div>

      <!-- SECTION 2: NOISE EXPOSURE -->
      <h2 style="color: #76B214; font-size: 1.4rem; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Noise Exposure & Conservation</h2>
      <div class="form-card" style="background:white; padding:20px; border-radius:8px; border:1px solid #eee;">
        ${renderQ("exposed_2hr", "Have you been exposed to noise within the last two hours?", slot.testData.exposed_2hr)}
        ${renderQ("regular_hpd", "Do you regularly wear hearing protection in noisy areas?", slot.testData.regular_hpd)}
        ${renderQ("edu_received", "Have you received hearing conservation info in the last year?", slot.testData.edu_received)}
      </div>

      <!-- SECTION 3: HISTORY -->
      <h2 style="color: #76B214; font-size: 1.4rem; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Noise & Hearing History</h2>
      <div class="form-card" style="background:white; padding:20px; border-radius:8px; border:1px solid #eee;">
        ${renderQ("ear_infection", "Have you ever had a severe ear infection?", slot.testData.ear_infection)}
        ${renderQ("ear_surgery", "Have you ever had ear surgery?", slot.testData.ear_surgery)}
        ${renderQ("dizziness", "Have you ever had dizziness or balance problems?", slot.testData.dizziness)}
        ${renderQ("ringing", "Do you have ringing in your ears (tinnitus)?", slot.testData.ringing)}
        ${renderQ("loud_blast", "Have you ever had exposure to a loud blast or explosion?", slot.testData.loud_blast)}
        ${renderQ("firearms", "Have you ever used a firearm?", slot.testData.firearms)}
      </div>

      <!-- SECTION 4: AUDIOGRAM (WorkSafeBC Style) -->
      <h2 style="color: #76B214; font-size: 1.4rem; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Hearing Test Results</h2>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px;">
        <div>
          <strong style="display:block; margin-bottom:15px; color:#1e3a5f; text-transform:uppercase; letter-spacing:1px;">Left Ear (dB)</strong>
          <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">
            ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioCell('L', f, slot.testData[`l${f}`])).join('')}
          </div>
        </div>
        <div>
          <strong style="display:block; margin-bottom:15px; color:#1e3a5f; text-transform:uppercase; letter-spacing:1px;">Right Ear (dB)</strong>
          <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">
            ${[500, 1000, 2000, 3000, 4000, 6000, 8000].map(f => renderAudioCell('R', f, slot.testData[`r${f}`])).join('')}
          </div>
        </div>
      </div>

      <!-- SECTION 5: COMMENTS & SUBMIT -->
      <h2 style="color: #76B214; font-size: 1.4rem; border-bottom: 2px solid #eee; padding-bottom: 8px; margin: 40px 0 20px 0;">Technician Comments</h2>
      <div class="form-group">
        <textarea id="tech-notes" rows="4" style="width:100%; border: 1px solid #ccc; border-radius: 4px; padding: 12px;" placeholder="Enter any additional observations...">${slot.techNotes || ''}</textarea>
      </div>

      <div style="margin-top: 30px; padding: 20px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
        <label style="display:flex; gap:12px; font-size: 14px; cursor:pointer; align-items: center;">
          <input type="checkbox" id="chk-confirm" style="width:20px; height:20px;"> 
          <span>I confirm that the technician conducted this test and provided appropriate counseling.</span>
        </label>
      </div>

      <div style="margin-top: 50px; text-align: right; display: flex; gap: 15px; justify-content: flex-end; padding-bottom: 100px;">
        <button class="btn btn-outline" id="btn-save-draft" style="padding: 12px 30px;">Save Draft</button>
        <button class="btn btn-primary" id="btn-submit-json" style="padding: 12px 50px; background:#1e3a5f; color:white; border:none;">Submit to Inbox</button>
      </div>
    </div>
  `;

  // --- INTERACTION LOGIC ---

  // 1. Auto-save to slot state on any change
  container.querySelectorAll('select, textarea').forEach(el => {
    el.addEventListener('change', () => {
        if (el.classList.contains('q-input')) {
            slot.testData[el.dataset.id] = el.value;
        } else if (el.classList.contains('audio-input')) {
            const key = (el.dataset.ear === 'L' ? 'l' : 'r') + el.dataset.freq;
            slot.testData[key] = el.value;
        } else if (el.id === 'tech-notes') {
            slot.techNotes = el.value;
        }
    });
  });

  // 2. Auto-tabbing for audiogram
  const audioInputs = container.querySelectorAll('.audio-input');
  audioInputs.forEach((sel, idx) => {
    sel.addEventListener('change', () => {
        if (sel.value !== "" && idx < audioInputs.length - 1) {
            audioInputs[idx + 1].focus();
        }
    });
  });

  // 3. Draft Saving
  container.querySelector('#btn-save-draft').onclick = () => {
    alert("Draft saved to Booth " + (state.activeSlot + 1));
    navigate('dashboard');
  };

  // 4. Final Submission to Shared Folder
  container.querySelector('#btn-submit-json').onclick = async () => {
    if (!container.querySelector('#chk-confirm').checked) {
      alert("Please check the confirmation box before submitting.");
      return;
    }

    if (!state.syncFolder) {
      alert("Error: Shared OneDrive folder is not connected. Please go to Settings.");
      return;
    }

    // Build the final result object
    const finalResult = {
      version: "2.0",
      tech: state.user,
      worker: {
          firstName: emp.first_name,
          lastName: emp.last_name,
          dob: emp.dob,
          employee_id: emp.employee_id
      },
      employer: {
          name: packet.company_name,
          location: packet.location_name,
          company_id: packet.company_id
      },
      test_date: new Date().toISOString().split('T')[0],
      history: slot.testData,
      notes: container.querySelector('#tech-notes').value
    };

    try {
      const filename = `test_${emp.last_name}_${Date.now()}.json`;
      // Use your existing sync-folder utility to write to the 'inbox'
      await writeJsonFile(state.syncFolder, 'inbox', filename, finalResult);
      
      alert("Test submitted successfully to the office inbox!");
      
      // Clear the slot after successful submit
      state.slots[state.activeSlot] = { screen: 'dashboard', testData: {}, currentThresholds: {} };
      navigate('dashboard');
    } catch (err) {
      alert("Submission failed: " + err.message);
    }
  };
}

// --- HELPERS ---

function renderQ(id, label, currentVal = "No") {
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #f0f0f0;">
      <span style="font-size:14px; color:#333;">${label}</span>
      <select class="q-input" data-id="${id}" style="width:100px; padding:8px; border-radius:4px; border:1px solid #ccc;">
        <option value="No" ${currentVal === 'No' ? 'selected' : ''}>No</option>
        <option value="Yes" ${currentVal === 'Yes' ? 'selected' : ''}>Yes</option>
      </select>
    </div>`;
}

function renderAudioCell(ear, freq, currentVal = "") {
  let opts = '<option value="">--</option>';
  for (let i = -10; i <= 90; i += 5) {
      opts += `<option value="${i}" ${currentVal == i ? 'selected' : ''}>${i}</option>`;
  }
  const label = freq >= 1000 ? (freq/1000) + 'k' : '.5k';
  return `
    <div style="text-align:center">
      <select class="audio-input" data-ear="${ear}" data-freq="${freq}" style="width:100%; font-weight:bold; padding:10px 2px; border:1px solid #ccc; border-radius:4px;">
        ${opts}
      </select>
      <label style="font-size:10px; color:#999; display:block; margin-top:4px;">${label}</label>
    </div>`;
}