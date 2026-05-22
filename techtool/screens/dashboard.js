import { getAllPackets, savePacket, packetExists } from '../db/idb.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles } from '@shared/fs/sync-folder.js'
import { PACKET_STATUS } from '@shared/packet/schema.js'
import { syncLogoFromFolder } from './settings.js'
import { archivePacket } from '../db/idb.js'

export function renderDashboard(container, state, navigate) {
  // 1. Filter out packets the user has chosen to hide
  const activePackets = state.packets.filter(p => !p.ui_archived);

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <h1 class="app-title">Good morning, ${state.user?.name.split(' ')[0]}</h1>
      </header>

      <div class="section-label">ACTIVE VISITS</div>
      
      <div class="packet-grid">
        ${activePackets.length > 0 ? activePackets.map(p => `
          <div class="packet-card" data-id="${p.packet_id}">
            <div class="packet-card__body">
                <div class="packet-info">
                  <div class="packet-name">${esc(p.company_name)}</div>
                  <div class="packet-meta">${esc(p.location_name)} · ${p.employees.length} workers</div>
                </div>
                <button class="btn-archive" data-id="${p.packet_id}" title="Hide from Dashboard">✕</button>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${calculateProgress(p)}%"></div>
            </div>
          </div>
        `).join('') : '<div class="empty-state">No active packets. Check "Sync" to download new ones.</div>'}
      </div>
    </div>
  `;

  // Handle clicking the card to open it
  container.querySelectorAll('.packet-card').forEach(card => {
    card.onclick = (e) => {
        // Don't open if they clicked the 'X' button
        if (e.target.classList.contains('btn-archive')) return;
        
        state.currentPacket = activePackets.find(p => p.packet_id === card.dataset.id);
        navigate('employee-list');
    };
  });

  // Handle the Archive (Hide) button
  container.querySelectorAll('.btn-archive').forEach(btn => {
    btn.onclick = async (e) => {
        e.stopPropagation(); // Prevent opening the packet
        if (confirm("Hide this packet from your dashboard?")) {
            await archivePacket(btn.dataset.id);
            // Update local state and re-render
            const p = state.packets.find(p => p.packet_id === btn.dataset.id);
            if (p) p.ui_archived = true;
            renderDashboard(container, state, navigate);
        }
    };
  });
}

function calculateProgress(p) {
    const done = p.employees.filter(e => e.completed_tests?.length > 0).length;
    return (done / p.employees.length) * 100;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

// ---------------------------------------------------------------------------
// Card / row builders
// ---------------------------------------------------------------------------

function todayCard(p) {
  const empCount  = p.employees?.length ?? 0
  const doneCount = p.employees?.filter(e => (e.completed_tests?.length ?? 0) > 0).length ?? 0
  const pct       = empCount > 0 ? Math.round((doneCount / empCount) * 100) : 0
  const allDone   = empCount > 0 && doneCount === empCount

  return `
    <div class="dash-today-card ${allDone ? 'dash-today-card--done' : ''}"
         data-packet-id="${p.packet_id}">
      <div class="dash-today-main">
        <div class="dash-today-company">${esc(p.company?.name ?? 'Unknown')}</div>
        <div class="dash-today-meta">${esc(p.company?.province ?? '')} · ${doneCount} of ${empCount} tested</div>
      </div>
      <div class="dash-prog-wrap">
        <div class="dash-prog-bar">
          <div class="dash-prog-fill ${allDone ? 'dash-prog-fill--done' : ''}" style="width:${pct}%"></div>
        </div>
        <span class="dash-prog-label ${allDone ? 'dash-prog-label--done' : ''}">${allDone ? '✓ Done' : `${pct}%`}</span>
      </div>
      <span class="dash-card-arrow">›</span>
    </div>
  `
}

function upcomingRow(p) {
  const visitDate = p.visit?.visit_date ?? ''
  const dateLabel = visitDate
    ? new Date(visitDate + 'T12:00:00').toLocaleDateString('en-CA', {
        weekday: 'short', month: 'short', day: 'numeric'
      })
    : '—'
  const empCount = p.employees?.length ?? 0

  return `
    <div class="dash-upcoming-row" data-packet-id="${p.packet_id}">
      <span class="dash-upcoming-date">${dateLabel}</span>
      <span class="dash-upcoming-company">${esc(p.company?.name ?? 'Unknown')}</span>
      <span class="dash-upcoming-count">${empCount} emp</span>
      <span class="dash-upcoming-arrow">›</span>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function doSync(container, state, navigate) {
  const btn    = container.querySelector('#btn-sync')
  const banner = container.querySelector('#sync-banner')
  if (btn) { btn.disabled = true; btn.textContent = 'Checking Folder…' }
  showBanner(banner, 'info', 'Accessing sync folder…')

  try {
    let folder = state.syncFolder
    if (!folder) {
      folder = await getSyncFolder()
      if (!folder) folder = await pickSyncFolder()
      state.syncFolder = folder
    }

    const folderName = state.user?.folder_name
    if (!folderName) {
      showBanner(banner, 'error', 'Sync folder name not set — go to Settings and add your folder name.')
      return
    }

    const techSubfolder = `techs/${folderName}`
    showBanner(banner, 'info', `Scanning ${techSubfolder}…`)
    const files = await listJsonFiles(folder, techSubfolder)

    if (files.length === 0) {
      showBanner(banner, 'info', `No packets found in ${techSubfolder}.`)
      return
    }

    let loaded = 0, skipped = 0
    for (const { name, handle } of files) {
      const file   = await handle.getFile()
      const packet = JSON.parse(await file.text())
      if (await packetExists(packet.packet_id)) { skipped++; continue }
      packet.status = PACKET_STATUS.SYNCED
      await savePacket(packet)
      loaded++
    }

    state.packets  = await getAllPackets()
    state.lastSync = new Date().toLocaleString()

    // Silently sync logo from office if one has been published
    await syncLogoFromFolder(folder, state)

    const skipNote = skipped > 0 ? ` · ${skipped} already on device` : ''
    const msg = loaded > 0
      ? `✓ ${loaded} new packet(s) loaded${skipNote}`
      : skipped > 0 ? `All ${skipped} packet(s) already on device` : 'No new packets'
    showBanner(banner, 'success', `${msg} · ${state.lastSync}`)

    navigate('dashboard')
  } catch (e) {
    if (e.name !== 'AbortError') showBanner(banner, 'error', `Sync failed: ${e.message}`)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Check Sync Folder' }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function showBanner(el, type, msg) {
  if (!el) return
  el.className   = `sync-banner alert alert-${type}`
  el.textContent = msg
  el.classList.remove('hidden')
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
