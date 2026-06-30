import { archivePacket } from '../db/idb.js'

export function renderDashboard(container, state, navigate) {
  // Filter logic: Hide packets that are manually archived OR already submitted to the office
  const activePackets = (state.packets || []).filter(p => {
    return !p.ui_archived && p.status !== 'submitted';
  });

  const today = new Date().toISOString().slice(0, 10)

  // Group packets by visit date, sorted chronologically
  const groups = new Map()
  for (const p of [...activePackets].sort((a, b) =>
    (a.visit?.visit_date || '').localeCompare(b.visit?.visit_date || '')
  )) {
    const d = p.visit?.visit_date || ''
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(p)
  }

  function colHeader(visitDate) {
    const isPast  = visitDate && visitDate < today
    const isToday = visitDate === today
    const cls     = isToday ? 'day-col--today' : (isPast ? 'day-col--overdue' : 'day-col--upcoming')
    const label   = isToday ? 'TODAY' : (isPast ? 'OVERDUE' : '')
    const dt      = visitDate ? new Date(visitDate + 'T12:00:00') : null
    const dayName = dt ? dt.toLocaleString('en-CA', { weekday: 'short' }).toUpperCase() : '—'
    const dayNum  = dt ? dt.getDate() : '?'
    const month   = dt ? dt.toLocaleString('en-CA', { month: 'short' }).toUpperCase() : ''
    return `<div class="day-col-header ${cls}">
      <span class="day-col-name">${dayName}</span>
      <span class="day-col-date">${month} ${dayNum}</span>
      ${label ? `<span class="day-col-badge">${label}</span>` : ''}
    </div>`
  }

  function colCard(p) {
    const empCount = (p.employees || []).length
    const done     = (p.employees || []).filter(e => (e.completed_tests?.length > 0) || e.skipped_at).length
    const pct      = empCount > 0 ? Math.round((done / empCount) * 100) : 0
    const locName  = p.location?.name || p.location_name || ''
    const province = p.visit?.province || p.company?.province || ''
    const address  = p.location?.address || p.company?.address || ''
    const notes    = p.company?.sticky_notes || ''
    const subParts = [locName, province, `${empCount} worker${empCount === 1 ? '' : 's'}`].filter(Boolean)
    return `
      <div class="col-card" data-id="${p.packet_id}">
        <div class="col-card__body">
          <div class="col-card__info">
            <div class="pc-company">${esc(p.company?.name || p.company_name || 'Unknown')}</div>
            <div class="pc-sub">${esc(subParts.join(' · '))}</div>
            ${address ? `<div class="pc-address">${esc(address)}</div>` : ''}
            ${notes   ? `<div class="pc-notes">📌 ${esc(notes)}</div>` : ''}
          </div>
          <div class="pc-right">
            <span class="pc-progress-text">${done}/${empCount}</span>
            <button class="btn-archive" data-id="${p.packet_id}" title="Hide">✕</button>
          </div>
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
          ${[...groups.entries()].map(([date, packets]) => `
            <div class="day-column">
              ${colHeader(date)}
              ${packets.map(p => colCard(p)).join('')}
            </div>
          `).join('')}
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
