import { markEmployeeSkipped, addNewEmployee } from '@shared/packet/schema.js'
import { savePacket } from '../db/idb.js'

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
        <button class="btn btn-ghost" id="btn-back">‹ ${esc(packet?.company?.name ?? 'Company')}</button>
        <h1 class="app-title">Employees</h1>
        <span class="count-chip">${employees.length}</span>
      </header>

      <div class="search-wrap">
        <input id="emp-search" type="search" class="search-input"
          placeholder="Search by name…" autocomplete="off" autocorrect="off" />
      </div>

      ${allResolved ? `
        <div class="emp-complete-banner">
          <p>✓ All employees resolved — ready to submit</p>
          <button class="btn btn-primary btn-sm" id="btn-submit-packet">Submit Packet →</button>
        </div>
      ` : ''}

      <div id="emp-list" class="emp-list">
        ${buildList(employees)}
      </div>

      <button class="add-emp-toggle" id="btn-add-emp-toggle">+ Add Employee</button>
      <div id="add-emp-form" class="add-emp-form" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label for="new-first">First Name <span style="color:var(--red)">*</span></label>
            <input id="new-first" type="text" placeholder="First name" autocomplete="off" />
          </div>
          <div class="form-group">
            <label for="new-last">Last Name <span style="color:var(--red)">*</span></label>
            <input id="new-last" type="text" placeholder="Last name" autocomplete="off" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="new-dob">Birthdate <span style="color:var(--red)">*</span></label>
            <input id="new-dob" type="date" />
          </div>
          <div class="form-group">
            <label for="new-sin">SIN (Last 4)</label>
            <input id="new-sin" type="text" maxlength="4" placeholder="1234" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="new-phone">Phone</label>
            <input id="new-phone" type="tel" placeholder="555-0100" />
          </div>
          <div class="form-group">
            <label for="new-email">Email</label>
            <input id="new-email" type="email" placeholder="email@example.com" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="new-title">Job Title</label>
            <input id="new-title" type="text" placeholder="e.g. Welder" autocomplete="off" />
          </div>
          <div class="form-group">
            <label for="new-tenure">Tenure (at position)</label>
            <input id="new-tenure" type="text" placeholder="e.g. 2 years" />
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" id="btn-add-emp-submit">Add to Packet</button>
          <button class="btn btn-secondary btn-sm" id="btn-add-emp-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('company'))

  if (allResolved) {
    container.querySelector('#btn-submit-packet').addEventListener('click', () => navigate('company'))
  }

  const searchEl = container.querySelector('#emp-search')
  searchEl.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim()
    const filtered = q
      ? employees.filter(emp => fullName(emp).toLowerCase().includes(q))
      : employees
    container.querySelector('#emp-list').innerHTML = buildList(filtered)
    attachRowHandlers(container, filtered, packet, state, navigate)
  })

  attachRowHandlers(container, employees, packet, state, navigate)

  // Add employee toggle
  const addToggle = container.querySelector('#btn-add-emp-toggle')
  const addForm   = container.querySelector('#add-emp-form')
  addToggle.addEventListener('click', () => {
    addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none'
    if (addForm.style.display === 'block') {
      container.querySelector('#new-first').focus()
    }
  })

  container.querySelector('#btn-add-emp-cancel').addEventListener('click', () => {
    addForm.style.display = 'none'
  })

  container.querySelector('#btn-add-emp-submit').addEventListener('click', async () => {
    const firstName = container.querySelector('#new-first').value.trim()
    const lastName  = container.querySelector('#new-last').value.trim()
    const dob       = container.querySelector('#new-dob').value
    const sin       = container.querySelector('#new-sin').value.trim()
    const phone     = container.querySelector('#new-phone').value.trim()
    const email     = container.querySelector('#new-email').value.trim()
    const jobTitle  = container.querySelector('#new-title').value.trim() || null
    const tenure    = container.querySelector('#new-tenure').value.trim() || null

    if (!firstName || !lastName || !dob) {
      alert('First name, last name, and birthdate are required.')
      return
    }

    addNewEmployee(packet, {
      first_name: firstName,
      last_name: lastName,
      dob,
      sin_last_4: sin,
      phone,
      email,
      job_title: jobTitle,
      tenure
    })
    await savePacket(packet)
    navigate('employee-list')
  })

  searchEl.focus()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildList(employees) {
  if (employees.length === 0) {
    return '<div class="empty-state">No employees match.</div>'
  }
  return employees.map(emp => empRow(emp)).join('')
}

function empRow(emp) {
  const done     = emp.completed_tests?.length > 0
  const skipped  = !!emp.skipped_at
  const isNew    = !!emp.new_employee
  const lastCat  = emp.prior_tests?.[0]?.classification?.category ?? null
  const age      = emp.dob ? calcAge(emp.dob) : null
  const baseline = !!emp.baseline
  const isPending = !done && !skipped

  return `
    <div class="emp-row ${done ? 'emp-row--done' : ''} ${skipped ? 'emp-row--skipped' : ''}"
         data-emp-id="${esc(emp.employee_id)}"
         style="${skipped ? 'cursor:default;' : ''}">
      <div class="emp-row__info">
        <div class="emp-row__name">${esc(emp.last_name)}, ${esc(emp.first_name)}</div>
        <div class="emp-row__meta">
          ${age ? `Age ${age}` : ''}
          ${emp.job_title ? `· ${esc(emp.job_title)}` : ''}
          ${!baseline && !isNew ? '<em>· No baseline on file</em>' : ''}
          ${isNew ? '<em>· New</em>' : ''}
          ${skipped ? `· Skipped: ${esc(emp.skip_reason ?? '')}` : ''}
        </div>
      </div>
      <div class="emp-row__right">
        ${lastCat ? `<span class="class-badge class-${lastCat.toLowerCase()}">${lastCat}</span>` : ''}
        ${done
          ? '<span class="badge badge-success">✓ Tested</span>'
          : skipped
            ? '<span class="badge badge-neutral">Skipped</span>'
            : '<span class="badge badge-neutral">Pending</span>'}
        ${isPending ? `<button class="emp-row__skip" data-skip-id="${esc(emp.employee_id)}">Skip</button>` : ''}
      </div>
      ${!skipped ? '<div class="emp-row__chevron">›</div>' : ''}
    </div>
    ${isPending ? `
      <div class="skip-confirm-row" id="skip-confirm-${esc(emp.employee_id)}" style="display:none">
        <label>Skip this employee?</label>
        <select id="skip-reason-${esc(emp.employee_id)}">
          <option value="Not present today">Not present today</option>
          <option value="Left company">Left company</option>
          <option value="Declined to test">Declined to test</option>
          <option value="Other">Other</option>
        </select>
        <button class="btn btn-sm btn-secondary" data-confirm-skip="${esc(emp.employee_id)}">Confirm Skip</button>
        <button class="btn btn-sm btn-ghost" data-cancel-skip="${esc(emp.employee_id)}">Cancel</button>
      </div>
    ` : ''}
  `
}

function attachRowHandlers(container, employees, packet, state, navigate) {
  // Row click → navigate to the new ONE-LONG-SCREEN test entry
  container.querySelectorAll('.emp-row').forEach(row => {
    const empId = row.dataset.empId
    const emp   = employees.find(e => e.employee_id === empId)
    if (!emp || emp.skipped_at) return

    row.addEventListener('click', e => {
      if (e.target.closest('.emp-row__skip')) return
      
      // 1. Load the employee into the current Booth Slot
      const slot = state.slots[state.activeSlot];
      slot.currentEmployee = emp;
      slot.currentPacket   = packet; // Ensure company/location info is carried over
      slot.testData        = {}; 
      slot.techNotes       = '';

      // 2. Navigate to the new consolidated screen
      navigate('test-entry', {
        currentEmployee: emp,
        currentPacket: packet
      })
    })
  })

  // Skip button — show confirmation row
  container.querySelectorAll('.emp-row__skip').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const empId = btn.dataset.skipId
      const row   = container.querySelector(`#skip-confirm-${empId}`)
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none'
    })
  })

  // Confirm skip
  container.querySelectorAll('[data-confirm-skip]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const empId  = btn.dataset.confirmSkip
      const reason = container.querySelector(`#skip-reason-${empId}`)?.value ?? null
      markEmployeeSkipped(packet, empId, reason)
      await savePacket(packet)
      navigate('employee-list')
    })
  })

  // Cancel skip
  container.querySelectorAll('[data-cancel-skip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = btn.dataset.cancelSkip
      const row   = container.querySelector(`#skip-confirm-${empId}`)
      if (row) row.style.display = 'none'
    })
  })
}

function fullName(emp) { return `${emp.first_name} ${emp.last_name}` }

function calcAge(dob) {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}