import { markEmployeeSkipped, addNewEmployee } from '@shared/packet/schema.js'
import { savePacket } from '../db/idb.js'
import { writeJsonFile, deleteJsonFile } from '@shared/fs/sync-folder.js'

export function renderEmployeeList(container, state, navigate) {
  const packet    = state.currentPacket
  const employees = packet?.employees ?? []

  const total      = employees.length
  const done       = employees.filter(e => e.completed_tests?.length > 0).length
  const skipped    = employees.filter(e => e.skipped_at).length
  const pendingCount = employees.filter(e => !e.completed_tests?.length && !e.skipped_at).length
  const allResolved  = total > 0 && (done + skipped) === total

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ ${esc(packet?.company?.name ?? 'Dashboard')}</button>
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

      ${pendingCount > 0 ? `
        <div class="emp-bulk-bar" style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--grey-50);border-bottom:1px solid var(--grey-200)">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="check-all-pending" />
            Select all pending
          </label>
          <button class="btn btn-sm btn-outline" id="btn-bulk-skip" disabled style="color:var(--red);border-color:var(--red)">Skip Selected</button>
        </div>
      ` : ''}

      <div id="emp-list" class="emp-list">
        ${buildList(employees)}
      </div>

      <button class="add-emp-toggle" id="btn-add-emp-toggle">+ Add Employee</button>
      <div id="add-emp-form" class="add-emp-form" style="display:none">
        <div class="form-row">
          <div class="form-group"><label>First Name *</label><input id="new-first" type="text" /></div>
          <div class="form-group"><label>Middle Name</label><input id="new-middle" type="text" /></div>
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

  // --- Handlers ---
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
    const m = container.querySelector('#new-middle').value.trim();
    const l = container.querySelector('#new-last').value.trim();
    const d = container.querySelector('#new-dob').value;
    if (!f || !l || !d) return alert("Required fields missing.");
    addNewEmployee(packet, { first_name: f, middle_name: m || null, last_name: l, dob: d, job_title: container.querySelector('#new-title').value });
    await savePacket(packet);
    renderEmployeeList(container, state, navigate);
  }

  container.querySelector('#btn-add-emp-cancel').onclick = () => {
    container.querySelector('#add-emp-form').style.display = 'none';
  }
}

function buildList(employees) {
  return employees.map(emp => {
    const done = emp.completed_tests?.length > 0;
    const skipped = !!emp.skipped_at;
    const pending = !done && !skipped;
    const fullName = emp.middle_name
      ? `${esc(emp.last_name)}, ${esc(emp.first_name)} ${esc(emp.middle_name)}`
      : `${esc(emp.last_name)}, ${esc(emp.first_name)}`;
    return `
      <div class="emp-row ${done ? 'emp-row--done' : ''} ${skipped ? 'emp-row--skipped' : ''}" data-emp-id="${emp.employee_id}">
        ${pending ? `<input type="checkbox" class="emp-bulk-check" data-emp-id="${emp.employee_id}" style="margin:0 8px;flex-shrink:0" />` : '<span style="width:28px;flex-shrink:0"></span>'}
        <div class="emp-row__info">
          <div class="emp-row__name">${fullName}</div>
          <div class="emp-row__meta">${esc(emp.job_title || '')} ${skipped ? '· SKIPPED: ' + esc(emp.skip_reason) : ''}</div>
        </div>
        <div class="emp-row__right">
          ${done ? '<span class="badge badge-success">✓ Done (Edit)</span>' :
            skipped ? '<span class="badge">Skipped</span>' :
            '<span class="badge badge-neutral">Pending</span>'}

          ${pending ? `<button class="emp-row__skip" data-skip-id="${emp.employee_id}">Skip</button>` : ''}

          ${skipped ? `<button class="emp-row__unskip" data-unskip-id="${emp.employee_id}">Unskip</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function attachRowHandlers(container, employees, packet, state, navigate) {
  container.querySelectorAll('.emp-row').forEach(row => {
    row.onclick = (e) => {
      // Prevent row click if clicking skip/unskip buttons or bulk checkbox
      if (e.target.closest('.emp-row__skip') || e.target.closest('.emp-row__unskip') || e.target.classList.contains('emp-bulk-check')) return;
      
      const emp = employees.find(e => e.employee_id == row.dataset.empId);
      if (!emp || emp.skipped_at) return;

      const slot = state.slots[state.activeSlot];
      slot.currentEmployee = emp;
      slot.currentPacket = packet;

      if (emp.completed_tests?.length > 0) {
          const test = emp.completed_tests[0];
          slot.testData = { ...test.history, ...test.thresholds };
          slot.techNotes = test.notes || '';
      } else {
          slot.testData = { employer_info: 'Yes' }; 
          slot.techNotes = '';
      }
      navigate('test-entry');
    };
  });

  // Skip logic
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

  // Unskip logic
  container.querySelectorAll('.emp-row__unskip').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const empId = btn.dataset.unskipId;
      const emp = employees.find(e => e.employee_id == empId);
      if (emp) {
        delete emp.skipped_at;
        delete emp.skip_reason;
        await savePacket(packet);
        renderEmployeeList(container, state, navigate);
      }
    };
  });

  // Bulk skip controls
  const checkAllEl  = container.querySelector('#check-all-pending');
  const bulkSkipBtn = container.querySelector('#btn-bulk-skip');

  if (checkAllEl && bulkSkipBtn) {
    const updateBulkBtn = () => {
      const checked = container.querySelectorAll('.emp-bulk-check:checked').length;
      bulkSkipBtn.disabled = checked === 0;
      bulkSkipBtn.textContent = checked > 0 ? `Skip Selected (${checked})` : 'Skip Selected';
    };

    checkAllEl.addEventListener('change', () => {
      container.querySelectorAll('.emp-bulk-check').forEach(cb => { cb.checked = checkAllEl.checked; });
      updateBulkBtn();
    });

    container.addEventListener('change', e => {
      if (e.target.classList.contains('emp-bulk-check')) {
        const total = container.querySelectorAll('.emp-bulk-check').length;
        const checked = container.querySelectorAll('.emp-bulk-check:checked').length;
        checkAllEl.indeterminate = checked > 0 && checked < total;
        checkAllEl.checked = checked === total;
        updateBulkBtn();
      }
    });

    bulkSkipBtn.onclick = async () => {
      const checked = container.querySelectorAll('.emp-bulk-check:checked');
      if (!checked.length) return;
      if (!confirm(`Skip ${checked.length} selected worker(s)? Reason: Not present.`)) return;
      checked.forEach(cb => markEmployeeSkipped(packet, cb.dataset.empId, 'Not present'));
      await savePacket(packet);
      renderEmployeeList(container, state, navigate);
    };
  }
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }