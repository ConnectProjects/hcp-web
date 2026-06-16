import { archivePacket } from '../db/idb.js'

export function renderDashboard(container, state, navigate) {
  // Filter logic: Hide packets that are manually archived OR already submitted to the office
  const activePackets = (state.packets || []).filter(p => {
    return !p.ui_archived && p.status !== 'submitted';
  });

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
        ${activePackets.length > 0 ? activePackets.map(p => `
          <div class="packet-card" data-id="${p.packet_id}">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${calculateProgress(p)}%"></div>
          </div>
            <div class="packet-card__body">
                <div class="packet-info">
                  <div class="packet-name">${esc(p.company_name || p.company?.name || 'Unknown')}</div>
                  <div class="packet-meta">
                    ${esc(p.location_name || 'Main Office')} · ${(p.employees || []).length} workers
                  </div>
                </div>
                <button class="btn-archive" data-id="${p.packet_id}" title="Hide from Dashboard">✕</button>
            </div>
          </div>
        `).join('') : `
          <div class="empty-state">
            <p>No active packets found on this device.</p>
            <p style="font-size: 13px; color: #999; margin-bottom: 20px;">Packets are hidden once they are submitted to the office.</p>
            <button class="btn btn-primary" id="btn-empty-sync">Check for New Packets</button>
          </div>
        `}
      </div>
    </div>
  `;

  // --- Handlers ---
  
  const goToSync = () => navigate('sync');
  container.querySelector('#btn-sync-now')?.addEventListener('click', goToSync);
  container.querySelector('#btn-empty-sync')?.addEventListener('click', goToSync);

  container.querySelectorAll('.packet-card').forEach(card => {
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

function calculateProgress(p) {
    if (!p.employees || p.employees.length === 0) return 0;
    // Count workers who have a completed test OR were marked as skipped
    const done = p.employees.filter(e => (e.completed_tests && e.completed_tests.length > 0) || e.skipped_at).length;
    return Math.round((done / p.employees.length) * 100);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}