import { archivePacket } from '../db/idb.js'

export function renderDashboard(container, state, navigate) {
  // Filter logic: Hide packets that are manually archived OR already submitted to the office
  const activePackets = (state.packets || []).filter(p => {
    return !p.ui_archived && p.status !== 'submitted';
  });

  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const DOW   = ['SUN','MON','TUE','WED','THU','FRI','SAT']

  // Group by day-of-week; within each group sort chronologically
  const byDow = new Map() // dow index (0-6) → packets[]
  for (const p of [...activePackets].sort((a, b) =>
    (a.visit?.visit_date || '').localeCompare(b.visit?.visit_date || '')
  )) {
    const d = p.visit?.visit_date
    const dow = d ? new Date(d + 'T12:00:00').getDay() : -1
    if (!byDow.has(dow)) byDow.set(dow, [])
    byDow.get(dow).push(p)
  }
  // Order columns Mon→Sun (treat Sun=7 so Mon comes first)
  const orderedDows = [...byDow.keys()].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))

  function colCard(p) {
    const d        = p.visit?.visit_date || ''
    const isPast   = d && d < today
    const isToday  = d === today
    const dateCls  = isToday ? 'cc-date--today' : (isPast ? 'cc-date--overdue' : '')
    const dateLabel= isToday ? 'TODAY' : (isPast ? 'OVERDUE' : '')
    const dt       = d ? new Date(d + 'T12:00:00') : null
    const dateStr  = dt ? dt.toLocaleString('en-CA', { month: 'short', day: 'numeric' }) : '—'
    const empCount = (p.employees || []).length
    const done     = (p.employees || []).filter(e => (e.completed_tests?.length > 0) || e.skipped_at).length
    const pct      = empCount > 0 ? Math.round((done / empCount) * 100) : 0
    const locName  = p.location?.name || p.location_name || ''
    const province = p.visit?.province || p.company?.province || ''
    const notes    = p.company?.sticky_notes || ''
    const subParts = [locName, province, `${empCount}w`].filter(Boolean)
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

      ${activePackets.length > 0 ? `
        <div class="day-columns">
          ${orderedDows.map(dow => {
            const packets = byDow.get(dow)
            let lastDate  = null
            const cards   = packets.map(p => {
              const d      = p.visit?.visit_date || ''
              const divider = (lastDate !== null && d !== lastDate) ? '<div class="day-divider"></div>' : ''
              lastDate = d
              return divider + colCard(p)
            }).join('')
            return `
              <div class="day-column">
                <div class="day-col-header">${DOW[dow]}</div>
                ${cards}
              </div>`
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <p>No active packets found on this device.</p>
          <p style="font-size: 13px; color: #999; margin-bottom: 20px;">Packets are hidden once they are submitted to the office.</p>
          <button class="btn btn-primary" id="btn-empty-sync">Check for New Packets</button>
        </div>
      `}
    </div>
  `;

  // --- Handlers ---
  
  const goToSync = () => navigate('sync');
  container.querySelector('#btn-sync-now')?.addEventListener('click', goToSync);
  container.querySelector('#btn-empty-sync')?.addEventListener('click', goToSync);

  container.querySelectorAll('.col-card').forEach(card => {
    card.onclick = (e) => {
        if (e.target.classList.contains('btn-archive')) return;
        const selected = activePackets.find(p => p.packet_id === card.dataset.id);
        if (selected) {
            state.currentPacket = selected;
            navigate('employee-list');
        }
    };
  });

  container.querySelectorAll('.btn-archive').forEach(btn => {
    btn.onclick = async (e) => {
        e.stopPropagation(); 
        if (confirm("Hide this packet from your dashboard?")) {
            await archivePacket(btn.dataset.id);
            const p = state.packets.find(p => p.packet_id === btn.dataset.id);
            if (p) p.ui_archived = true;
            renderDashboard(container, state, navigate);
        }
    };
  });
}


function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
