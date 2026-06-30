import { archivePacket } from '../db/idb.js'

export function renderDashboard(container, state, navigate) {
  // Filter logic: Hide packets that are manually archived OR already submitted to the office
  const activePackets = (state.packets || []).filter(p => {
    return !p.ui_archived && p.status !== 'submitted';
  });

  const today = new Date().toISOString().slice(0, 10)

  // Group packets by visit date, preserving date order
  const groups = new Map()
  const sorted = [...activePackets].sort((a, b) =>
    (a.visit?.visit_date || '').localeCompare(b.visit?.visit_date || '')
  )
  for (const p of sorted) {
    const d = p.visit?.visit_date || ''
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(p)
  }

  function dateBadge(visitDate) {
    const isPast    = visitDate && visitDate < today
    const isToday   = visitDate === today
    const dateClass = isToday ? 'pc-date--today' : (isPast ? 'pc-date--overdue' : 'pc-date--upcoming')
    const dateLabel = isToday ? 'TODAY' : (isPast ? 'OVERDUE' : '')
    const [, , dy]  = visitDate ? visitDate.split('-') : ['','','']
    const monthAbbr = visitDate ? new Date(visitDate + 'T12:00:00').toLocaleString('en-CA', { month: 'short' }).toUpperCase() : ''
    return `<div class="pc-date ${dateClass}">
      <span class="pc-month">${monthAbbr || '—'}</span>
      <span class="pc-day">${dy || '?'}</span>
      ${dateLabel ? `<span class="pc-label">${dateLabel}</span>` : ''}
    </div>`
  }

  function packetRow(p, multi = false) {
    const empCount = (p.employees || []).length
    const done     = (p.employees || []).filter(e => (e.completed_tests?.length > 0) || e.skipped_at).length
    const pct      = empCount > 0 ? Math.round((done / empCount) * 100) : 0
    const province = p.visit?.province || p.company?.province || ''
    const locName  = p.location?.name || p.location_name || ''
    const address  = p.location?.address || p.company?.address || ''
    const notes    = p.company?.sticky_notes || ''
    const subParts = [locName, province, `${empCount} worker${empCount === 1 ? '' : 's'}`].filter(Boolean)

    if (!multi) {
      const visitDate = p.visit?.visit_date || ''
      return `
        <div class="packet-card" data-id="${p.packet_id}">
          <div class="pc-body">
            ${dateBadge(visitDate)}
            <div class="pc-info">
              <div class="pc-company">${esc(p.company?.name || p.company_name || 'Unknown')}</div>
              <div class="pc-sub">${esc(subParts.join(' · '))}</div>
              ${address ? `<div class="pc-address">${esc(address)}</div>` : ''}
              ${notes   ? `<div class="pc-notes">📌 ${esc(notes)}</div>` : ''}
            </div>
            <div class="pc-right">
              <span class="pc-progress-text">${done}/${empCount}</span>
              <button class="btn-archive" data-id="${p.packet_id}" title="Hide from Dashboard">✕</button>
            </div>
          </div>
          <div class="pc-bar"><div class="pc-fill ${pct === 100 ? 'pc-fill--done' : ''}" style="width:${pct}%"></div></div>
        </div>`
    }

    return `
      <div class="day-row" data-id="${p.packet_id}">
        <div class="day-row__info">
          <div class="pc-company">${esc(p.company?.name || p.company_name || 'Unknown')}</div>
          <div class="pc-sub">${esc(subParts.join(' · '))}</div>
          ${address ? `<div class="pc-address">${esc(address)}</div>` : ''}
          ${notes   ? `<div class="pc-notes">📌 ${esc(notes)}</div>` : ''}
        </div>
        <div class="pc-right">
          <span class="pc-progress-text">${done}/${empCount}</span>
          <button class="btn-archive" data-id="${p.packet_id}" title="Hide from Dashboard">✕</button>
        </div>
      </div>`
  }

  function dayTile(visitDate, packets) {
    const totalEmp  = packets.reduce((s, p) => s + (p.employees || []).length, 0)
    const totalDone = packets.reduce((s, p) => s + (p.employees || []).filter(e => (e.completed_tests?.length > 0) || e.skipped_at).length, 0)
    const pct       = totalEmp > 0 ? Math.round((totalDone / totalEmp) * 100) : 0
    return `
      <div class="day-tile">
        <div class="day-tile__header">
          ${dateBadge(visitDate)}
          <div class="day-tile__summary">
            <span class="day-tile__count">${packets.length} stops · ${totalEmp} workers</span>
            <span class="day-tile__progress">${totalDone}/${totalEmp} done</span>
          </div>
        </div>
        <div class="day-tile__rows">
          ${packets.map(p => packetRow(p, true)).join('')}
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

      <div class="packet-grid">
        ${activePackets.length > 0
          ? [...groups.entries()].map(([date, packets]) =>
              packets.length === 1 ? packetRow(packets[0]) : dayTile(date, packets)
            ).join('')
          : `<div class="empty-state">
               <p>No active packets found on this device.</p>
               <p style="font-size: 13px; color: #999; margin-bottom: 20px;">Packets are hidden once they are submitted to the office.</p>
               <button class="btn btn-primary" id="btn-empty-sync">Check for New Packets</button>
             </div>`
        }
      </div>
    </div>
  `;

  // --- Handlers ---
  
  const goToSync = () => navigate('sync');
  container.querySelector('#btn-sync-now')?.addEventListener('click', goToSync);
  container.querySelector('#btn-empty-sync')?.addEventListener('click', goToSync);

  container.querySelectorAll('.packet-card, .day-row').forEach(card => {
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
