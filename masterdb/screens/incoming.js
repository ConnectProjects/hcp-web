import { getPacketsByStatus }  from '../db/packets.js'
import { run, queryOne }        from '../db/sqlite.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile, moveJsonFile } from '@shared/fs/sync-folder.js'

export function renderIncoming(container, state, navigate) {
  const packets = getPacketsByStatus('submitted')

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Incoming Packets</h1>
        <button class="btn btn-primary" id="btn-check-inbox">Check Sync Folder</button>
      </div>

      <div id="check-status" class="hidden"></div>

      ${packets.length === 0
        ? `<div class="empty-state">
             <p>No completed packets awaiting review.</p>
             <p>Click <strong>Check Sync Folder</strong> to scan for completed packets from techs.</p>
           </div>`
        : `<p class="section-note">${packets.length} packet(s) awaiting review and import.</p>
           <div class="incoming-cards">
             ${packets.map(p => incomingCard(p)).join('')}
           </div>`
      }
    </div>
  `

  container.querySelector('#btn-check-inbox').addEventListener('click', () =>
    checkInbox(container, state, navigate)
  )

  container.querySelectorAll('.btn-review').forEach(btn => {
    btn.addEventListener('click', () => {
      const packetId = btn.dataset.packetId
      navigate('import-confirm', { params: { packetId } })
    })
  })

  container.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', () => {
      const packetId = btn.dataset.packetId
      if (!confirm('Reject this packet? It will be removed from the review list.')) return
      
      // Update status in DB
      run('UPDATE packets SET status = "rejected", updated_at = datetime("now") WHERE packet_id = ?', [packetId])
      
      navigate('incoming')
    })
  })
}

function incomingCard(p) {
  return `
    <div class="incoming-card">
      <div class="incoming-card__info">
        <div class="incoming-company">${esc(p.company_name)}</div>
        <div class="incoming-meta">
          <span class="province-badge">${esc(p.province)}</span>
          · Visit ${p.visit_date}
          · Packet: ${esc(p.packet_id)}
        </div>
      </div>
      <div class="incoming-card__actions">
        <button class="btn btn-primary btn-sm btn-review" data-packet-id="${esc(p.packet_id)}">
          Review &amp; Import →
        </button>
        <button class="btn btn-ghost btn-sm btn-reject" data-packet-id="${esc(p.packet_id)}" style="color:var(--red);margin-top:8px">
          Reject
        </button>
      </div>
    </div>
  `
}

async function checkInbox(container, state, navigate) {
  const btn    = container.querySelector('#btn-check-inbox')
  const status = container.querySelector('#check-status')

  btn.disabled      = true
  btn.textContent   = 'Checking…'
  status.className  = 'alert alert-info'
  status.textContent = 'Accessing sync folder…'
  status.classList.remove('hidden')

  try {
    // Ensure sync folder access
    let folder = state.syncFolder
    if (!folder) {
      folder = await getSyncFolder()
      if (!folder) folder = await pickSyncFolder()
      state.syncFolder = folder
    }

    status.textContent = 'Scanning inbox for completed packets…'
    const files = await listJsonFiles(folder, 'inbox')

    if (files.length === 0) {
      status.textContent = 'No packets found in inbox.'
      status.className   = 'alert alert-info'
      return
    }

    status.textContent = `Found ${files.length} packet(s) — importing…`
    let saved = 0

    for (const { name } of files) {
      try {
        const packet = await readJsonFile(folder, 'inbox', name)

        // For offline packets the company may not exist in MasterDB yet.
        // Use the company name as a temporary stand-in for company_id.
        // import-confirm.js will resolve the real company_id on import.
        const coName    = packet.company?.name ?? ''
        const companyId = queryOne(
          `SELECT company_id FROM companies WHERE name = ? LIMIT 1`, [coName]
        )?.company_id ?? coName   // fall back to name string if company doesn't exist yet

        // Store packet JSON for review
        run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
          [`pending_packet_${packet.packet_id}`, JSON.stringify(packet)]
        )

        // Register in packets table
        run(`INSERT OR REPLACE INTO packets
          (packet_id, company_id, location_id, tech_id, visit_date, filename, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
          [
            packet.packet_id,
            companyId,
            packet.location?.location_id ?? null,
            packet.tech?.tech_id ?? null,
            packet.visit?.visit_date ?? '',
            name
          ]
        )

        // Move to archive so inbox stays clean
        await moveJsonFile(folder, 'inbox', 'archive', name)
        saved++
      } catch (e) {
        console.warn('Could not process packet:', name, e)
      }
    }

    status.textContent = `✓ ${saved} packet(s) ready for review.`
    status.className   = 'alert alert-success'

    setTimeout(() => navigate('incoming'), 800)
  } catch (e) {
    if (e.name !== 'AbortError') {
      status.textContent = `Failed: ${e.message}`
      status.className   = 'alert alert-error'
    }
  } finally {
    btn.disabled    = false
    btn.textContent = 'Check Sync Folder'
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
