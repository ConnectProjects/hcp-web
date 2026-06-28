import { getDashboardStats, getComingSoonCompanies } from '../db/tests.js'
import { getPacketsByStatus, getMyPackets, updatePacketStatus } from '../db/packets.js'
import { isDemoLoaded, loadDemoData }         from '../db/demo.js'
import { query, run, queryOne }               from '../db/sqlite.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile, moveJsonFile,
         fileExists, deleteJsonFile, writeJsonFile } from '@shared/fs/sync-folder.js'
import { ROLES }                              from '../../shared/auth-utils.js'

export function renderDashboard(container, state, navigate) {
  const role  = state.user?.role
  const isLC  = role === ROLES.LC

  if (isLC) {
    renderLCDashboard(container, state, navigate)
  } else {
    renderAdminDashboard(container, state, navigate)
  }
}

// ---------------------------------------------------------------------------
// Admin / Super-Admin dashboard
// ---------------------------------------------------------------------------

function renderAdminDashboard(container, state, navigate) {
  const stats          = getDashboardStats()
  const comingSoon     = getComingSoonCompanies(6).slice(0, 8)
  const incoming       = getPacketsByStatus('submitted').slice(0, 5)
  const isEmpty        = stats.totalCompanies === 0 && !isDemoLoaded()

  const pendingReferrals = query(`
    SELECT t.test_id, t.test_date, t.test_type, t.classification,
           e.first_name, e.last_name, e.employee_id,
           c.name AS company_name, c.company_id,
           t.referral_given_to_worker
    FROM tests t
    JOIN employees e ON e.employee_id = t.employee_id
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id  = l.company_id
    WHERE t.sts_flag = 1
      AND (t.referral_sent_to_employer IS NULL OR t.referral_sent_to_employer = 0)
      AND c.active = 1
    ORDER BY t.test_date DESC
    LIMIT 10
  `).filter(t => {
    try {
      const cls = typeof t.classification === 'string' ? JSON.parse(t.classification) : t.classification
      return cls && ['A','AC','EW'].includes(cls.category)
    } catch { return false }
  })

  container.innerHTML = `
    <div class="page">

      <!-- KPI Strip -->
      <div class="kpi-strip">
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${stats.totalCompanies}</span>
          <span class="kpi-strip-lbl">Companies</span>
        </div>
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${stats.totalEmployees}</span>
          <span class="kpi-strip-lbl">Employees</span>
        </div>
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${stats.testsThisMonth}</span>
          <span class="kpi-strip-lbl">Tests (30d)</span>
        </div>
        <div class="kpi-strip-item ${stats.incomingPackets > 0 ? 'kpi-strip-item--alert' : ''}">
          <span class="kpi-strip-num">${stats.incomingPackets}</span>
          <span class="kpi-strip-lbl">Incoming</span>
        </div>
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${stats.pendingPackets}</span>
          <span class="kpi-strip-lbl">In Field</span>
        </div>
        <div class="kpi-strip-date">${new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>

      ${isEmpty ? `
        <div class="demo-banner">
          <span>👋 No data yet.</span>
          <button class="btn btn-sm btn-outline" id="btn-load-demo">Load Demo Data</button>
          <span class="demo-hint">Adds 2 sample companies, 7 employees, and test history so you can explore every screen.</span>
        </div>
      ` : isDemoLoaded() ? `
        <div class="demo-banner demo-banner--active">
          <span>📋 Demo data is loaded.</span>
          <span class="demo-hint">Remove it any time in Settings → Clear Demo Data.</span>
        </div>
      ` : ''}

      <div class="dash-columns">
        <!-- Incoming packets -->
        <div class="dash-panel">
          <div class="panel-head">
            <h2>Incoming Completed Packets</h2>
            <button class="btn btn-sm btn-outline" id="btn-check-incoming">Check Sync Folder</button>
          </div>
          ${incoming.length === 0
            ? '<p class="empty-note">No packets awaiting import.</p>'
            : `<div class="incoming-list">
                ${incoming.map(p => `
                  <div class="incoming-row" data-packet-id="${p.packet_id}">
                    <div class="incoming-info">
                      <div class="incoming-company">${esc(p.company_name)}</div>
                      <div class="incoming-meta">${esc(p.province)} · ${p.visit_date}</div>
                    </div>
                    <button class="btn btn-sm btn-primary" data-packet-id="${p.packet_id}">Review →</button>
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-link" id="btn-view-all-incoming">View all incoming →</button>`
          }
        </div>

        <!-- Coming Soon -->
        <div class="dash-panel">
          <div class="panel-head">
            <h2>Coming Soon <span class="panel-head-hint">(due within 6 months)</span></h2>
          </div>
          ${comingSoon.length === 0
            ? '<p class="empty-note">No companies due soon.</p>'
            : `<div class="overdue-list">
                ${comingSoon.map(c => `
                  <div class="overdue-row company-link" data-location-id="${c.location_id}" style="cursor:pointer">
                    <div class="overdue-info">
                      <div class="overdue-name">${esc(c.name)}</div>
                      <div class="overdue-meta">${esc(c.company_name)} · ${esc(c.province)} · ${c.last_test_date ? 'Last: ' + c.last_test_date : 'Never tested'} · ${c.active_emp_count} emp</div>
                    </div>
                  </div>
                `).join('')}
              </div>`
          }
        </div>
      </div>

      <!-- Pending referrals -->
      ${pendingReferrals.length > 0 ? `
        <div class="dash-panel dash-panel--referrals" style="margin-top:20px">
          <div class="panel-head">
            <h2>⚠ Pending Referrals <span class="panel-head-hint">(not yet sent to employer)</span></h2>
          </div>
          <div class="referral-list">
            ${pendingReferrals.map(t => {
              let cls = null
              try { cls = typeof t.classification === 'string' ? JSON.parse(t.classification) : t.classification } catch {}
              const cat = cls?.category ?? '?'
              return `
                <div class="referral-row">
                  <div class="referral-info">
                    <span class="class-badge class-${cat.toLowerCase()}">${esc(cat)}</span>
                    <div class="referral-name">${esc(t.last_name)}, ${esc(t.first_name)}</div>
                    <div class="referral-meta">${esc(t.company_name)} · ${esc(t.test_date)}</div>
                    ${t.referral_given_to_worker
                      ? '<span class="ref-status ref-done">✓ Given to worker</span>'
                      : '<span class="ref-status ref-pending">○ Not confirmed given to worker</span>'}
                  </div>
                  <button class="btn btn-sm btn-ghost btn-view-referral" data-emp-id="${t.employee_id}">View →</button>
                </div>
              `
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `

  container.querySelector('#btn-check-incoming')?.addEventListener('click', () =>
    checkSyncFolder(container, state, navigate)
  )
  container.querySelector('#btn-load-demo')?.addEventListener('click', () => {
    loadDemoData()
    navigate('dashboard')
  })
  container.querySelector('#btn-view-all-incoming')?.addEventListener('click', () => navigate('incoming'))

  container.querySelectorAll('[data-packet-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.packetId
      navigate('import-confirm', { params: { packetId: id } })
    })
  })

  container.querySelectorAll('.company-link').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.locationId)
      navigate('location-detail', { currentLocation: { location_id: id } })
    })
  })

  container.querySelectorAll('.btn-view-referral').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = Number(btn.dataset.empId)
      navigate('employee-detail', { currentEmployee: { employee_id: empId } })
    })
  })
}

// ---------------------------------------------------------------------------
// LC dashboard — "My Packets"
// ---------------------------------------------------------------------------

function renderLCDashboard(container, state, navigate) {
  const userId = state.user?.user_id
  const allMyPackets = userId ? getMyPackets(userId) : []

  const pending   = allMyPackets.filter(p => p.status === 'pending')
  const active    = allMyPackets.filter(p => p.status === 'active')
  const submitted = allMyPackets.filter(p => p.status === 'submitted')
  const done      = allMyPackets.filter(p => ['imported','cancelled','rejected'].includes(p.status)).slice(0, 5)

  const lcStats = {
    total:     allMyPackets.length,
    pending:   pending.length,
    inField:   active.length + submitted.length
  }

  container.innerHTML = `
    <div class="page">

      <!-- KPI Strip -->
      <div class="kpi-strip">
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${lcStats.total}</span>
          <span class="kpi-strip-lbl">Generated</span>
        </div>
        <div class="kpi-strip-item ${lcStats.pending > 0 ? 'kpi-strip-item--alert' : ''}">
          <span class="kpi-strip-num">${lcStats.pending}</span>
          <span class="kpi-strip-lbl">Pending</span>
        </div>
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${lcStats.inField}</span>
          <span class="kpi-strip-lbl">In Field</span>
        </div>
        <div class="kpi-strip-date">${new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>

      <div class="dash-panel" style="margin-top:0">
        <div class="panel-head">
          <h2>My Packets</h2>
          <button class="btn btn-sm btn-primary" id="btn-go-companies">+ Generate Packet</button>
        </div>

        ${allMyPackets.length === 0 ? `
          <p class="empty-note">No packets generated yet. Select a company to create one.</p>
        ` : `

          ${pending.length > 0 ? `
            <div class="lc-group">
              <div class="lc-group-head">
                <span class="lc-group-label">Pending — awaiting tech pickup</span>
                <span class="lc-group-count">${pending.length}</span>
              </div>
              ${pending.map(p => lcPacketRow(p, true)).join('')}
            </div>
          ` : ''}

          ${active.length > 0 ? `
            <div class="lc-group">
              <div class="lc-group-head">
                <span class="lc-group-label">In Field — tech is testing</span>
                <span class="lc-group-count">${active.length}</span>
              </div>
              ${active.map(p => lcPacketRow(p, false)).join('')}
            </div>
          ` : ''}

          ${submitted.length > 0 ? `
            <div class="lc-group">
              <div class="lc-group-head">
                <span class="lc-group-label">Submitted — awaiting office import</span>
                <span class="lc-group-count">${submitted.length}</span>
              </div>
              ${submitted.map(p => lcPacketRow(p, false)).join('')}
            </div>
          ` : ''}

          ${done.length > 0 ? `
            <div class="lc-group">
              <div class="lc-group-head">
                <span class="lc-group-label">Recently Completed</span>
              </div>
              ${done.map(p => lcPacketRow(p, false)).join('')}
            </div>
          ` : ''}

        `}
      </div>
    </div>
  `

  container.querySelector('#btn-go-companies')?.addEventListener('click', () => navigate('companies'))

  container.querySelectorAll('.btn-cancel-packet').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { packetId, techFolder, filename } = btn.dataset
      await doLCCancel(packetId, techFolder, filename, container, state, navigate)
    })
  })
}

function lcPacketRow(p, cancellable) {
  const statusLabel = {
    pending:   '<span class="badge badge-neutral">Pending</span>',
    active:    '<span class="badge badge-warn">In Field</span>',
    submitted: '<span class="badge badge-info">Submitted</span>',
    imported:  '<span class="badge badge-success">Imported</span>',
    cancelled: '<span class="badge badge-error">Cancelled</span>',
    rejected:  '<span class="badge badge-error">Rejected</span>'
  }[p.status] ?? `<span class="badge badge-neutral">${esc(p.status)}</span>`

  return `
    <div class="lc-packet-row">
      <div class="lc-packet-info">
        <div class="lc-packet-company">${esc(p.company_name)}${p.location_name ? ` <span class="lc-packet-loc">— ${esc(p.location_name)}</span>` : ''}</div>
        <div class="lc-packet-meta">${esc(p.visit_date)} · ${esc(p.tech_name || 'No tech')} · ${statusLabel}</div>
      </div>
      ${cancellable ? `
        <button class="btn btn-sm btn-ghost btn-cancel-packet"
          data-packet-id="${esc(p.packet_id)}"
          data-tech-folder="${esc(p.tech_folder_name)}"
          data-filename="${esc(p.filename)}"
          style="color:var(--red); white-space:nowrap; flex-shrink:0;">
          Cancel
        </button>
      ` : ''}
    </div>
  `
}

async function doLCCancel(packetId, techFolderName, filename, container, state, navigate) {
  if (!confirm('Cancel this packet?\n\nIf the tech has not yet loaded it, the file will be removed from their sync folder.')) return

  try {
    let folder = state.syncFolder
    if (!folder) {
      folder = await getSyncFolder()
      if (!folder) folder = await pickSyncFolder()
      state.syncFolder = folder
    }

    // Check if TechTool has already acknowledged picking up this packet
    const techHasIt = await fileExists(folder, 'status', `${packetId}.json`)
    if (techHasIt) {
      alert('The tech has already loaded this packet onto their device.\n\nPlease contact them directly to cancel the visit — they can cancel from TechTool.')
      return
    }

    // Remove from tech's sync folder
    await deleteJsonFile(folder, `techs/${techFolderName}`, filename)

    // Write a cancellation notice in case tech syncs before next check
    await writeJsonFile(folder, 'status', `${packetId}.json`, {
      packet_id:    packetId,
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'office'
    })

    updatePacketStatus(packetId, 'cancelled')
    navigate('dashboard')
  } catch (e) {
    if (e.name !== 'AbortError') alert(`Could not cancel: ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// Sync folder check (Admin/SuperAdmin incoming scan)
// ---------------------------------------------------------------------------

async function checkSyncFolder(container, state, navigate) {
  const btn = container.querySelector('#btn-check-incoming')
  const head = btn.closest('.panel-head')

  let status = container.querySelector('#sync-status')
  if (!status) {
    status = document.createElement('div')
    status.id = 'sync-status'
    status.style.cssText = 'font-size:12px; margin-top:4px; padding:4px 8px; border-radius:4px;'
    head.after(status)
  }

  btn.disabled = true
  btn.textContent = 'Checking...'
  status.className = 'alert alert-info'
  status.style.display = 'block'
  status.textContent = 'Scanning sync folder...'

  try {
    let folder = state.syncFolder
    if (!folder) {
      folder = await getSyncFolder()
      if (!folder) folder = await pickSyncFolder()
      state.syncFolder = folder
    }

    const files = await listJsonFiles(folder, 'inbox')

    if (files.length === 0) {
      status.textContent = 'No new packets found.'
      setTimeout(() => { status.style.display = 'none'; btn.disabled = false; btn.textContent = 'Check Sync Folder' }, 2000)
      return
    }

    status.textContent = `Found ${files.length} packet(s), importing...`
    let saved = 0

    for (const { name } of files) {
      try {
        const packet = await readJsonFile(folder, 'inbox', name)
        const coName = packet.company?.name ?? ''
        const companyId = queryOne(
          `SELECT company_id FROM companies WHERE name = ? LIMIT 1`, [coName]
        )?.company_id ?? coName

        run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
          [`pending_packet_${packet.packet_id}`, JSON.stringify(packet)]
        )
        run(`INSERT OR REPLACE INTO packets
          (packet_id, company_id, tech_id, visit_date, filename, status, updated_at)
          VALUES (?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
          [packet.packet_id, companyId, packet.tech?.tech_id ?? null, packet.visit?.visit_date ?? '', name]
        )
        await moveJsonFile(folder, 'inbox', 'archive', name)
        saved++
      } catch (e) { console.warn('Could not process packet:', name, e) }
    }

    status.textContent = `✓ ${saved} packet(s) ready for review.`
    status.className = 'alert alert-success'
    setTimeout(() => navigate('dashboard'), 1500)
  } catch (e) {
    if (e.name !== 'AbortError') {
      status.textContent = `Failed: ${e.message}`
      status.className = 'alert alert-error'
      btn.disabled = false
      btn.textContent = 'Check Sync Folder'
    }
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
