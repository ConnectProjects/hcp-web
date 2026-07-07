export function renderCompany(container, state, navigate) {
  const packet    = state.currentPacket
  const company   = packet?.company ?? {}
  const employees = packet?.employees ?? []

  const total      = employees.length
  const done       = employees.filter(e => e.completed_tests?.length > 0).length
  const skipped    = employees.filter(e => e.skipped_at).length
  const allResolved = (done + skipped) === total && total > 0

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Dashboard</button>
        <h1 class="app-title">${esc(company.name ?? 'Company')}</h1>
        <span class="province-chip">${esc(company.province ?? '')}</span>
      </header>

      <main class="screen-body">
        ${company.sticky_notes ? `
          <div class="sticky-note">
            <span class="sticky-icon">📌</span>
            <div class="sticky-body">
              <strong>Notes from office</strong>
              <p>${esc(company.sticky_notes)}</p>
            </div>
          </div>
        ` : ''}

        <div class="summary-bar">
          <div class="summary-tile">
            <span class="summary-num">${total}</span>
            <span class="summary-lbl">Employees</span>
          </div>
          <div class="summary-tile">
            <span class="summary-num">${done}</span>
            <span class="summary-lbl">Tested</span>
          </div>
          <div class="summary-tile">
            <span class="summary-num">${total - done}</span>
            <span class="summary-lbl">Remaining</span>
          </div>
        </div>

        <div class="section-row">
          <h2>Employees</h2>
          ${allResolved
            ? `<a class="btn btn-ghost btn-sm" id="btn-review">Review Employees</a>`
            : `<button class="btn btn-primary" id="btn-start">Start Testing →</button>`
          }
        </div>

        ${done > 0 || skipped > 0 ? `
          <div class="form-group visit-duration-box">
            <label for="test-duration">Actual Testing Duration (hrs)</label>
            <input type="number" id="test-duration" class="input-field" 
              placeholder="e.g. 4.5" 
              step="0.25"
              min="0"
              value="${esc(packet.testing_duration ?? '')}">
            <div class="field-help">* Total time spent testing today (required for submission)</div>
          </div>
        ` : ''}

        ${allResolved ? `
          <button class="btn btn-primary btn-block" id="btn-submit" ${!packet.testing_duration ? 'disabled' : ''}>
            Submit Packet →
          </button>
        ` : ''}

        <div class="employee-preview">
          ${employees.slice(0, 6).map(emp => empPreviewRow(emp)).join('')}
          ${total > 6 ? `<div class="show-more">+ ${total - 6} more — tap Start Testing to see all</div>` : ''}
        </div>

        ${company.contact_name ? `
          <div class="contact-card">
            <strong>Site contact:</strong> ${esc(company.contact_name)}
            ${company.contact_phone
              ? `<a class="contact-link" href="tel:${esc(company.contact_phone)}">${esc(company.contact_phone)}</a>`
              : ''}
            ${company.contact_email
              ? `<a class="contact-link" href="mailto:${esc(company.contact_email)}">${esc(company.contact_email)}</a>`
              : ''}
          </div>
        ` : ''}

        <div class="visit-detail">
          <span>Visit date: ${packet?.visit?.visit_date ?? '—'}</span>
          <span>Province: ${esc(company.province ?? '—')}</span>
        </div>
      </main>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('dashboard'))
  container.querySelector('#btn-start')?.addEventListener('click', () => navigate('employee-list'))
  container.querySelector('#btn-review')?.addEventListener('click', () => navigate('employee-list'))
  
  const submitBtn = container.querySelector('#btn-submit')
  const durationInput = container.querySelector('#test-duration')

  if (durationInput && submitBtn) {
    durationInput.addEventListener('input', () => {
      const val = durationInput.value.trim()
      packet.testing_duration = val
      submitBtn.disabled = !val || isNaN(parseFloat(val))
    })
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const val = durationInput?.value?.trim()
      
      if (!val) {
        alert('Please enter the total testing duration (e.g. 4.5) to submit this packet.')
        durationInput?.focus()
        return
      }

      // Update packet with duration
      packet.testing_duration = val
      await import('../db/idb.js').then(m => m.savePacket(packet))
      
      navigate('sync')
    })
  }
}

function empPreviewRow(emp) {
  const done      = emp.completed_tests?.length > 0
  const lastClass = emp.prior_tests?.[0]?.classification?.category ?? null
  return `
    <div class="emp-preview-row ${done ? 'emp-done' : ''}">
      <span class="emp-name">${esc(emp.last_name)}, ${esc(emp.first_name)}</span>
      <div class="emp-preview-right">
        ${lastClass ? `<span class="class-badge class-${lastClass.toLowerCase()}">${lastClass}</span>` : ''}
        ${done ? '<span class="done-mark">✓</span>' : ''}
      </div>
    </div>
  `
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
