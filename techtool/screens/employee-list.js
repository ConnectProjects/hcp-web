import { markEmployeeSkipped, addNewEmployee } from '@shared/packet/schema.js'
import { savePacket } from '../db/idb.js'
import { writeJsonFile, deleteJsonFile } from '@shared/fs/sync-folder.js'

export function renderEmployeeList(container, state, navigate) {
  const packet    = state.currentPacket
  const employees = packet?.employees ?? []

  const total   = employees.length
  const done    = employees.filter(e => e.completed_tests?.length > 0).length
  const skipped = employees.filter(e => e.skipped_at).length
  const allResolved = total > 0 && (done + skipped) === total

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Dashboard</button>
        <h1 class="app-title">Employees</h1>
        <span class="count-chip">${employees.length}</span>
      </header>

      <div class="search-wrap">
        <input id="emp-search" type="search" class="search-input" placeholder="Search by name…" />
      </div>

      ${allResolved ? `
        <div class="emp-complete-banner">
          <p>✓ All workers resolved. Ready to submit visit.</p>
          <button class="btn btn-primary btn-sm" id="btn-submit-packet">Submit Packet to Office →</button>
        </div>
      ` : ''}

      <div id="emp-list" class="emp-list">
        ${buildList(employees)}
      </div>

      <button class="add-emp-toggle" id="btn-add-emp-toggle">+ Add Employee</button>
      <div id="add-emp-form" class="add-emp-form" style="display:none">
        <div class="form-row">
          <div class="form-group"><label>First Name *</label><input id="new-first" type="text" /></div>
          <div class="form-group"><label>Last Name *</label><input id="new-last" type="text" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Birthdate *</label><input id="new-dob" type="date" /></div>
          <div class="form-group"><label>Job Title</label><input id="new-title" type="text" /></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" id="btn-add-emp-submit">Add to Packet</button>
          <button class="btn btn-secondary btn-sm" id="btn-add-emp-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `

  container.querySelector('#btn-back').onclick = () => navigate('dashboard')

  if (allResolved) {
    container.querySelector('#btn-submit-packet').onclick = async () => {
        if (!state.syncFolder) return alert("Connect OneDrive first.");
        try {
            packet.status = 'submitted';
            await writeJsonFile(state.syncFolder, 'inbox', `FINAL_${packet.filename}`, packet);
            if (state.user?.folder_name) await deleteJsonFile(state.syncFolder, `techs/${state.user.folder_name}`, packet.filename);
            await savePacket(packet);
            alert("Visit submitted successfully!");
            navigate('dashboard');
        } catch (err) { alert("Error: " + err.message); }
    };
  }

  attachRowHandlers(container, employees, packet, state, navigate)

  container.querySelector('#btn-add-emp-toggle').onclick = () => {
    const f = container.querySelector('#add-emp-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  }

  container.querySelector('#btn-add-emp-submit').onclick = async () => {
    const f = container.querySelector('#new-first').value.trim();
    const l = container.querySelector('#new-last').value.trim();
    const d = container.querySelector('#new-dob').value;
    if (!f || !l || !d) return alert("Required fields missing.");
    addNewEmployee(packet, { first_name: f, last_name: l, dob: d, job_title: container.querySelector('#new-title').value });
    await savePacket(packet);
    renderEmployeeList(container, state, navigate);
  }
}

function buildList(employees) {
  return employees.map(emp => {
    const done = emp.completed_tests?.length > 0;
    const skipped = !!emp.skipped_at;
    return `
      <div class="emp-row ${done ? 'emp-row--done' : ''} ${skipped ? 'emp-row--skipped' : ''}" data-emp-id="${emp.employee_id}">
        <div class="emp-row__info">
          <div class="emp-row__name">${esc(emp.last_name)}, ${esc(emp.first_name)}</div>
          <div class="emp-row__meta">${esc(emp.job_title || '')} ${skipped ? '· SKIPPED' : ''}</div>
        </div>
        <div class="emp-row__right">
          ${done ? '<span class="badge badge-success">✓ Done (Click to Edit)</span>' : skipped ? '<span class="badge">Skipped</span>' : '<span class="badge badge-neutral">Pending</span>'}
          ${!done && !skipped ? `<button class="emp-row__skip" data-skip-id="${emp.employee_id}">Skip</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function attachRowHandlers(container, employees, packet, state, navigate) {
  container.querySelectorAll('.emp-row').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('.emp-row__skip')) return;
      const emp = employees.find(e => e.employee_id == row.dataset.empId);
      if (!emp || emp.skipped_at) return;

      const slot = state.slots[state.activeSlot];
      slot.currentEmployee = emp;
      slot.currentPacket = packet;

      // --- THE EDIT LOGIC ---
      if (emp.completed_tests?.length > 0) {
          const test = emp.completed_tests[0];
          // 1. Load questionnaire history
          slot.testData = { ...test.history };
          slot.techNotes = test.notes || '';
          
          // 2. Map Database Keys (left_1k) back to UI Keys (l1000)
          const freqs = [500, 1000, 2000, 3000, 4000, 6000, 8000];
          freqs.forEach(f => {
              const dbFreq = f >= 1000 ? (f/1000)+'k' : f;
              slot.testData['l' + f] = test.thresholds['left_' + dbFreq];
              slot.testData['r' + f] = test.thresholds['right_' + dbFreq];
          });
          
          console.log("Loaded existing test for editing:", slot.testData);
      } else {
          slot.testData = {}; 
          slot.techNotes = '';
      }

      navigate('test-entry');
    };
  });

  container.querySelectorAll('.emp-row__skip').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm("Skip this worker?")) {
        markEmployeeSkipped(packet, btn.dataset.skipId, "Not present");
        await savePacket(packet);
        renderEmployeeList(container, state, navigate);
      }
    };
  });
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }