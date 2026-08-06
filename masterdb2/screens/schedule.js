/**
 * masterdb2/screens/schedule.js — Google Calendar-style month view
 *
 * Shows scheduled packets as color-coded chips on the calendar.
 * Tech filter toggles visibility by tech. Click a chip for detail + reschedule.
 * Packet generation lives in location.js.
 */

import { query, run, save } from '../db/db.js'

const TECH_COLORS = [
  '#4285F4','#EA4335','#34A853','#FBBC04',
  '#FF6D00','#46BDC6','#7C4DFF','#E52592',
]

export function mount(container, { navigate, session }) {
  const techs = query(`SELECT * FROM techs WHERE active = 1 ORDER BY name`)

  // Assign stable colors by sort order
  const techColor = {}
  techs.forEach((t, i) => { techColor[t.tech_id] = TECH_COLORS[i % TECH_COLORS.length] })

  // State
  const now   = new Date()
  let year    = now.getFullYear()
  let month   = now.getMonth()        // 0-based
  let filters = new Set(techs.map(t => t.tech_id))  // all on by default
  let detail  = null                  // { packet, tech } currently selected

  function render() {
    const packets = loadPackets(year, month)
    const byDay   = groupByDay(packets)

    const calHtml = buildCalendar(year, month, byDay, filters, techColor)

    const filterBtns = techs.map(t => `
      <button class="cal-tech-btn ${filters.has(t.tech_id) ? 'active' : ''}"
              data-tech-id="${t.tech_id}"
              style="--chip-color:${techColor[t.tech_id]}">
        ${esc(t.initials ?? t.name.slice(0,2))}
      </button>
    `).join('')

    container.innerHTML = `
      <div class="screen-header-row">
        <h1>Schedule</h1>
        <div style="display:flex;align-items:center;gap:0.5rem;margin-left:auto">
          ${filterBtns}
        </div>
      </div>
      <div class="screen-body" style="padding-bottom:0">

        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
          <button class="btn btn-secondary btn-sm" id="prev-btn">&lsaquo; Prev</button>
          <h2 style="margin:0;min-width:10rem;text-align:center">${monthName(year, month)}</h2>
          <button class="btn btn-secondary btn-sm" id="next-btn">Next &rsaquo;</button>
          <button class="btn btn-secondary btn-sm" id="today-btn" style="margin-left:auto">Today</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr ${detail ? '280px' : ''};gap:1rem;align-items:start">
          <div>${calHtml}</div>
          ${detail ? detailPanel(detail) : ''}
        </div>

      </div>
    `

    // Nav buttons
    container.querySelector('#prev-btn').addEventListener('click', () => {
      month--; if (month < 0) { month = 11; year-- }; detail = null; render()
    })
    container.querySelector('#next-btn').addEventListener('click', () => {
      month++; if (month > 11) { month = 0; year++ }; detail = null; render()
    })
    container.querySelector('#today-btn').addEventListener('click', () => {
      year = now.getFullYear(); month = now.getMonth(); detail = null; render()
    })

    // Tech filter toggles
    container.querySelectorAll('.cal-tech-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.techId
        filters.has(id) ? filters.delete(id) : filters.add(id)
        detail = null; render()
      })
    })

    // Chip clicks
    container.querySelectorAll('.cal-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation()
        const packetId = chip.dataset.packetId
        const pkt = packets.find(p => p.packet_id === packetId)
        const tech = techs.find(t => t.tech_id === pkt?.tech_id)
        detail = pkt ? { packet: pkt, tech } : null
        render()
      })
    })

    // Close detail on calendar background click
    container.querySelector('.cal-grid')?.addEventListener('click', () => {
      detail = null; render()
    })

    // Reschedule in detail panel
    container.querySelector('#reschedule-btn')?.addEventListener('click', async () => {
      const newDate = container.querySelector('#reschedule-date').value
      if (!newDate) return
      const errEl = container.querySelector('#reschedule-err')
      try {
        run(`UPDATE packets SET visit_date = ?, updated_at = datetime('now') WHERE packet_id = ?`,
            [newDate, detail.packet.packet_id])
        await save(session.writerName)
        detail = null
        // Move view to rescheduled month if needed
        const d = new Date(newDate + 'T00:00:00')
        year = d.getFullYear(); month = d.getMonth()
        render()
      } catch (e) {
        errEl.textContent = e.message
      }
    })

    // Cancel chip
    container.querySelector('#cancel-btn')?.addEventListener('click', async () => {
      if (!confirm(`Cancel this packet? This cannot be undone.`)) return
      const errEl = container.querySelector('#reschedule-err')
      try {
        run(`UPDATE packets SET status = 'cancelled', updated_at = datetime('now') WHERE packet_id = ?`,
            [detail.packet.packet_id])
        await save(session.writerName)
        detail = null; render()
      } catch (e) {
        errEl.textContent = e.message
      }
    })
  }

  render()
}

// ── Data ──────────────────────────────────────────────────────────────────────

function loadPackets(year, month) {
  const first = `${year}-${String(month+1).padStart(2,'0')}-01`
  const last  = lastDayOf(year, month)
  return query(
    `SELECT p.*, c.name AS company_name, l.name AS location_name, l.province,
            tk.name AS tech_name, tk.initials AS tech_initials, tk.tech_id
     FROM packets p
     JOIN  companies c ON c.company_id  = p.company_id
     LEFT JOIN locations l  ON l.location_id = p.location_id
     LEFT JOIN techs    tk ON tk.tech_id     = p.tech_id
     WHERE p.visit_date BETWEEN ? AND ? AND p.status != 'cancelled'
     ORDER BY p.visit_date`,
    [first, last]
  )
}

function groupByDay(packets) {
  const map = {}
  for (const p of packets) {
    const d = p.visit_date?.slice(0, 10)
    if (!d) continue
    ;(map[d] ??= []).push(p)
  }
  return map
}

// ── Calendar HTML ─────────────────────────────────────────────────────────────

function buildCalendar(year, month, byDay, filters, techColor) {
  const first     = new Date(year, month, 1)
  const lastDate  = new Date(year, month + 1, 0).getDate()
  const startDow  = first.getDay()   // 0=Sun
  const today     = new Date().toISOString().slice(0, 10)

  const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(d => `<div style="text-align:center;font-size:0.7rem;font-weight:600;color:var(--clr-subtle);padding:0.25rem">${d}</div>`)
    .join('')

  let cells = ''

  // Leading empty cells
  for (let i = 0; i < startDow; i++) {
    cells += `<div class="cal-cell cal-cell-out"></div>`
  }

  // Day cells
  for (let d = 1; d <= lastDate; d++) {
    const iso   = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const pkts  = (byDay[iso] ?? []).filter(p => filters.has(p.tech_id))
    const isToday = iso === today

    const chips = pkts.map(p => {
      const color = techColor[p.tech_id] ?? '#888'
      return `<div class="cal-chip" data-packet-id="${esc(p.packet_id)}"
                   style="background:${color};padding:1px 4px;margin-top:1px;
                          border-radius:3px;color:#fff;font-size:0.68rem;
                          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer"
                   title="${esc(p.company_name)} — ${esc(p.tech_name ?? '')}">
                ${esc(p.tech_initials ?? p.tech_name?.slice(0,2) ?? '?')} ${esc(p.company_name)}
              </div>`
    }).join('')

    cells += `
      <div class="cal-cell ${isToday ? 'cal-cell-today' : ''}">
        <div class="cal-day-num" style="font-size:0.75rem;text-align:right;color:${isToday ? 'var(--clr-primary)' : 'var(--clr-subtle)'};font-weight:${isToday ? '700' : '400'}">${d}</div>
        ${chips}
      </div>
    `
  }

  // Trailing empty cells to complete the grid
  const total = startDow + lastDate
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7)
  for (let i = 0; i < trailing; i++) {
    cells += `<div class="cal-cell cal-cell-out"></div>`
  }

  return `
    <div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);border:1px solid var(--clr-border);border-radius:6px;overflow:hidden">
      ${dayHeaders}
      ${cells}
    </div>
  `
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function detailPanel({ packet: p, tech }) {
  return `
    <div class="info-card" style="position:sticky;top:1rem">
      <div style="font-size:0.75rem;color:var(--clr-subtle);margin-bottom:0.5rem">Packet detail</div>
      <dl>
        ${row('Company',   p.company_name)}
        ${row('Location',  p.location_name)}
        ${row('Province',  p.province)}
        ${row('Visit',     fmtDate(p.visit_date))}
        ${row('Tech',      p.tech_name)}
        ${row('Status',    p.status)}
        ${row('File',      p.filename)}
        ${row('Created',   fmtDate(p.created_at?.slice(0,10)))}
      </dl>

      <div style="margin-top:1rem">
        <label class="field-label">Reschedule to:</label>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <input type="date" id="reschedule-date" class="form-select"
                 value="${p.visit_date ?? ''}" style="flex:1">
          <button class="btn btn-primary btn-sm" id="reschedule-btn">Save</button>
        </div>
        <div id="reschedule-err" style="color:var(--clr-error-text);font-size:0.8rem;margin-top:0.25rem"></div>
      </div>

      <div style="margin-top:0.75rem">
        <button class="btn btn-danger btn-sm" id="cancel-btn">Cancel Packet</button>
      </div>
    </div>
  `
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthName(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function lastDayOf(year, month) {
  const d = new Date(year, month + 1, 0)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function row(label, value) {
  if (value == null || value === '') return ''
  return `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month:'short', day:'numeric', year:'numeric' }) } catch { return d }
}
