import { archivePacket } from '../db/idb.js'

export function renderDashboard(container, state, navigate) {
  // Hide archived and submitted packets
  const activePackets = (state.packets || []).filter(p =>
    !p.ui_archived && p.status !== 'submitted'
  )

  // --- Current-week date range (local time, no UTC shift) ---
  const now        = new Date()
  const todayStr   = localDateStr(now)
  const dow0       = now.getDay()                    // 0=Sun … 6=Sat
  const daysFromMon = dow0 === 0 ? 6 : dow0 - 1     // Mon→0, Sun→6
  const weekMon    = new Date(now)
  weekMon.setDate(now.getDate() - daysFromMon)
  const weekSun    = new Date(weekMon)
  weekSun.setDate(weekMon.getDate() + 6)
  const weekStart  = localDateStr(weekMon)
  const weekEnd    = localDateStr(weekSun)

  // Partition: this week vs prior-week overdue
  const weekPackets  = activePackets.filter(p => {
    const vd = p.visit?.visit_date || ''
    return vd >= weekStart && vd <= weekEnd
  })
  const priorOverdue = activePackets.filter(p => {
    const vd = p.visit?.visit_date || ''
    return vd && vd < weekStart
  })

  // Group this-week visits by day-of-week (no cross-week collision possible)
  const DOW    = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const byDow  = new Map()
  for (const p of [...weekPackets].sort((a, b) =>
    (a.visit?.visit_date || '').localeCompare(b.visit?.visit_date || '')
  )) {
    const vd  = p.visit?.visit_date
    const dow = vd ? new Date(vd + 'T12:00:00').getDay() : -1
    if (!byDow.has(dow)) byDow.set(dow, [])
    byDow.get(dow).push(p)
  }
  // Mon→Fri order (treat Sun=7 so Mon sorts first)
  const orderedDows = [...byDow.keys()].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))

  function colCard(p) {
    const d         = p.visit?.visit_date || ''
    const isPast    = d && d < todayStr
    const isToday   = d === todayStr
    const dateCls   = isToday ? 'cc-date--today' : (isPast ? 'cc-date--overdue' : '')
    const dateLabel = isToday ? 'TODAY' : (isPast ? 'OVERDUE' : '')
    const dt        = d ? new Date(d + 'T12:00:00') : null
    const dateStr   = dt ? dt.toLocaleString('en-CA', { month: 'short', day: 'numeric' }) : '—'
    const empCount  = (p.employees || []).length
    const done      = (p.employees || []).filter(e => (e.completed_tests?.length > 0) || e.skipped_at).length
    const pct       = empCount > 0 ? Math.round((done / empCount) * 100) : 0
    const locName   = p.location?.name || p.location_name || ''
    const province  = p.visit?.province || p.company?.province || ''
    const notes     = p.company?.sticky_notes || ''
    const subParts  = [locName, province, `${empCount}w`].filter(Boolean)
    return `
      <div class="col-card" data-id="${p.packet_id}">
        <div class="col-card__top">
          <span class="cc-date ${dateCls}">${dateStr}${dateLabel ? ` · ${dateLabel}` : ''}</span>
          <div class="pc-right">
            <span class="pc-progress-text">${done}/${empCount}</span>
            <button class="btn-archive" data-id="${p.packet_id}" title="Hide">✕</button>
          </div>
        </div>
        <div class="col-card__body">
          <div class="pc-company">${esc(p.company?.name || p.company_name || 'Unknown')}</div>
          <div class="pc-sub">${esc(subParts.join(' · '))}</div>
          ${notes ? `<div class="pc-notes">📌 ${esc(notes)}</div>` : ''}
        </div>
        <div class="pc-bar"><div class="pc-fill ${pct === 100 ? 'pc-fill--done' : ''}" style="width:${pct}%"></div></div>
      </div>`
  }

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <h1 class="app-title">Good morning, ${state.user?.name?.split(' ')[0] || 'Tech'}</h1>
      </header>

      <div class="section-header-row">
        <div class="section-label">ACTIVE VISITS</div>
        <button class="btn btn-sm btn-outline" id="btn-sync-now">🔄 Sync Now</button>
      </div>

      ${priorOverdue.length > 0 ? `
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;
                    padding:8px 12px;margin-bottom:10px;font-size:13px;color:#856404">
          ⚠ ${priorOverdue.length} overdue packet${priorOverdue.length !== 1 ? 's' : ''} from previous weeks —
          <a href="#" id="btn-go-packets-od" style="color:#856404;font-weight:600">view in Packets</a>
        </div>
      ` : ''}

      ${weekPackets.length > 0 ? `
        <div class="day-columns">
          ${orderedDows.map(dow => {
            const packets   = byDow.get(dow)
            const sampleDt  = new Date((packets[0]?.visit?.visit_date || '') + 'T12:00:00')
            const dateLabel = packets[0]?.visit?.visit_date
              ? sampleDt.toLocaleString('en-CA', { month: 'short', day: 'numeric' })
              : ''
            let lastDate = null
            const cards  = packets.map(p => {
              const vd      = p.visit?.visit_date || ''
              const divider = (lastDate !== null && vd !== lastDate) ? '<div class="day-divider"></div>' : ''
              lastDate = vd
              return divider + colCard(p)
            }).join('')
            return `
              <div class="day-column">
                <div class="day-col-header">${DOW[dow]}${dateLabel ? `<span style="font-weight:400;opacity:.7;margin-left:4px">${dateLabel}</span>` : ''}</div>
                ${cards}
              </div>`
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <p>No active packets found for this week.</p>
          <p style="font-size:13px;color:#999;margin-bottom:20px">Packets are hidden once submitted to the office.</p>
          <button class="btn btn-primary" id="btn-empty-sync">Check for New Packets</button>
        </div>
      `}
    </div>
  `

  // --- Handlers ---
  const goToSync    = () => navigate('sync')
  const goToPackets = (e) => { e.preventDefault(); navigate('schedule') }

  container.querySelector('#btn-sync-now')?.addEventListener('click', goToSync)
  container.querySelector('#btn-empty-sync')?.addEventListener('click', goToSync)
  container.querySelector('#btn-go-packets-od')?.addEventListener('click', goToPackets)

  container.querySelectorAll('.col-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.classList.contains('btn-archive')) return
      const selected = activePackets.find(p => p.packet_id === card.dataset.id)
      if (selected) {
        state.currentPacket = selected
        navigate('employee-list')
      }
    }
  })

  container.querySelectorAll('.btn-archive').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation()
      if (confirm('Hide this packet from your dashboard?')) {
        await archivePacket(btn.dataset.id)
        const p = state.packets.find(p => p.packet_id === btn.dataset.id)
        if (p) p.ui_archived = true
        renderDashboard(container, state, navigate)
      }
    }
  })
}

function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
