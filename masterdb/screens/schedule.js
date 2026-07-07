import { query, queryOne, run, lastInsertId } from '../db/sqlite.js'
import { getAllCompanies }           from '../db/companies.js'
import { getTechs }                 from '../db/packets.js'

export function renderSchedule(container, state, navigate) {
  const today   = new Date().toISOString().slice(0, 10)
  const upcoming = query(`
    SELECT s.*, c.name AS company_name, c.province
    FROM schedules s
    JOIN companies c ON c.company_id = s.company_id
    WHERE s.visit_date >= ? AND s.completed = 0
    ORDER BY s.visit_date ASC
    LIMIT 50
  `, [today])

  const past = query(`
    SELECT s.*, c.name AS company_name, c.province
    FROM schedules s
    JOIN companies c ON c.company_id = s.company_id
    WHERE s.visit_date < ? OR s.completed = 1
    ORDER BY s.visit_date DESC
    LIMIT 20
  `, [today])

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Schedule</h1>
        <button class="btn btn-primary" id="btn-add-visit">+ Add Visit</button>
      </div>

      <div class="schedule-sections">
        <section>
          <h2 class="section-title">Upcoming Visits (${upcoming.length})</h2>
          ${upcoming.length === 0
            ? '<p class="empty-note">No upcoming visits scheduled.</p>'
            : `<div class="schedule-list">
                ${upcoming.map(s => scheduleRow(s, false)).join('')}
              </div>`
          }
        </section>

        ${past.length > 0 ? `
          <section>
            <h2 class="section-title">Past Visits</h2>
            <div class="schedule-list schedule-list--past">
              ${past.map(s => scheduleRow(s, true)).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    </div>

    <!-- Add visit modal -->
    <div id="modal-visit" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h2>Schedule Visit</h2>
          <button class="modal-close" id="modal-close-visit">✕</button>
        </div>
        <div class="modal-body">
          ${visitForm(getAllCompanies(), getTechs())}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-cancel-visit">Cancel</button>
          <button class="btn btn-primary" id="btn-save-visit">Save</button>
        </div>
      </div>
    </div>
  `

  const modal = container.querySelector('#modal-visit')
  container.querySelector('#btn-add-visit').addEventListener('click', () => {
    container.querySelector('#sv-schedule-id').value = ''
    modal.classList.remove('hidden')
  })
  container.querySelector('#modal-close-visit').addEventListener('click', () => modal.classList.add('hidden'))
  container.querySelector('#btn-cancel-visit').addEventListener('click', () => modal.classList.add('hidden'))
  modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'))

  container.querySelector('#btn-save-visit').addEventListener('click', () => {
    const companyId  = container.querySelector('#sv-company').value
    const visitDate  = container.querySelector('#sv-date').value
    const techId     = container.querySelector('#sv-tech').value || null
    const notes      = container.querySelector('#sv-notes').value.trim() || null
    const scheduleId = container.querySelector('#sv-schedule-id').value
    if (!companyId || !visitDate) { alert('Company and date are required.'); return }
    if (scheduleId) {
      run('UPDATE schedules SET company_id = ?, tech_id = ?, visit_date = ?, notes = ? WHERE schedule_id = ?',
        [companyId, techId, visitDate, notes, scheduleId])
    } else {
      run('INSERT INTO schedules (company_id, tech_id, visit_date, notes) VALUES (?, ?, ?, ?)',
        [companyId, techId, visitDate, notes])
    }
    modal.classList.add('hidden')
    navigate('schedule')
  })

  container.querySelectorAll('.btn-packet').forEach(btn => {
    btn.addEventListener('click', () => {
      const companyId = Number(btn.dataset.companyId)
      navigate('generate-packet', { currentCompany: { company_id: companyId } })
    })
  })

  container.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', () => {
      run('UPDATE schedules SET completed = 1 WHERE schedule_id = ?', [btn.dataset.scheduleId])
      navigate('schedule')
    })
  })

  container.querySelectorAll('.btn-edit-sched').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      container.querySelector('#sv-schedule-id').value = btn.dataset.scheduleId
      container.querySelector('#sv-company').value     = btn.dataset.companyId
      container.querySelector('#sv-date').value        = btn.dataset.visitDate
      container.querySelector('#sv-tech').value        = btn.dataset.techId ?? ''
      container.querySelector('#sv-notes').value       = btn.dataset.notes ?? ''
      modal.classList.remove('hidden')
    })
  })

  container.querySelectorAll('.btn-delete-sched').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this scheduled visit?')) return
      run('DELETE FROM schedules WHERE schedule_id = ?', [btn.dataset.scheduleId])
      navigate('schedule')
    })
  })
}

function scheduleRow(s, past) {
  const dateLabel = new Date(s.visit_date + 'T12:00:00').toLocaleDateString('en-CA',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `
    <div class="schedule-row ${past ? 'schedule-row--past' : ''}">
      <div class="sched-date">${dateLabel}</div>
      <div class="sched-info">
        <div class="sched-company">${esc(s.company_name)}</div>
        <div class="sched-meta">
          <span class="province-badge">${esc(s.province)}</span>
          ${s.tech_id ? `· ${esc(s.tech_id)}` : ''}
          ${s.notes ? `· ${esc(s.notes)}` : ''}
        </div>
      </div>
      <div class="sched-actions">
        ${!past ? `
          <button class="btn btn-outline btn-sm btn-packet" data-company-id="${s.company_id}">
            Generate Packet
          </button>
          <button class="btn btn-ghost btn-sm btn-complete" data-schedule-id="${s.schedule_id}">
            Complete
          </button>
          <button class="btn btn-ghost btn-sm btn-edit-sched"
            data-schedule-id="${s.schedule_id}"
            data-company-id="${s.company_id}"
            data-visit-date="${s.visit_date}"
            data-tech-id="${s.tech_id ?? ''}"
            data-notes="${esc(s.notes ?? '')}">
            Edit
          </button>
          <button class="btn btn-ghost btn-sm btn-delete-sched" data-schedule-id="${s.schedule_id}"
            style="color:var(--red)">✕</button>
        ` : `<span class="td-muted">${s.completed ? 'Completed' : 'Past'}</span>`}
      </div>
    </div>
  `
}

function visitForm(companies, techs) {
  const today = new Date().toISOString().slice(0, 10)
  return `
    <input type="hidden" id="sv-schedule-id" value="" />
    <div class="form-grid">
      <div class="form-group span-2">
        <label>Company *</label>
        <select id="sv-company">
          <option value="">— select —</option>
          ${companies.map(c => `<option value="${c.company_id}">${esc(c.name)} (${esc(c.province)})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Visit Date *</label>
        <input id="sv-date" type="date" value="${today}" />
      </div>
      <div class="form-group">
        <label>Tech</label>
        <select id="sv-tech">
          <option value="">— unassigned —</option>
          ${techs.map(t => `<option value="${esc(t.tech_id)}">${esc(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group span-2">
        <label>Notes</label>
        <input id="sv-notes" type="text" placeholder="Optional notes…" />
      </div>
    </div>
  `
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
