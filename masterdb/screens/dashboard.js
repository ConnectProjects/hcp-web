import { getDashboardStats, getComingSoonCompanies } from '../db/tests.js'
import { getPacketsByStatus, updatePacketStatus } from '../db/packets.js'
import { isDemoLoaded, loadDemoData }         from '../db/demo.js'
import { query, run, queryOne }               from '../db/sqlite.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile, moveJsonFile,
         fileExists, deleteJsonFile, writeJsonFile } from '@shared/fs/sync-folder.js'

// ---------------------------------------------------------------------------
// Unified dashboard — same for all roles
// ---------------------------------------------------------------------------

async function refreshPacketStatuses(packets, syncFolder) {
  if (!syncFolder || !packets.length) return 0
  let updated = 0
  for (const p of packets) {
    try {
      const sf = await readJsonFile(syncFolder, 'status', `${p.packet_id}.json`)
      const remote = sf?.status
      if (remote === 'active'           && p.status === 'pending')                                    { updatePacketStatus(p.packet_id, 'active');           updated++ }
      if (remote === 'cancelled'        && !['cancelled', 'imported'].includes(p.status))             { updatePacketStatus(p.packet_id, 'cancelled');        updated++ }
      if (remote === 'removed_by_tech'  && !['removed_by_tech', 'imported'].includes(p.status))      { updatePacketStatus(p.packet_id, 'removed_by_tech');  updated++ }
    } catch { /* no status file yet */ }
  }
  return updated
}

export function renderDashboard(container, state, navigate) {
  const stats    = getDashboardStats()
  const isEmpty  = stats.totalCompanies === 0 && !isDemoLoaded()

  const incoming         = getPacketsByStatus('submitted')
  const inField          = [...getPacketsByStatus('pending'), ...getPacketsByStatus('active')]
  const comingSoon       = getComingSoonCompanies(6)
  const recentlyImported = query(`
    SELECT p.*,
      COALESCE(c.name, '')  AS company_name,
      COALESCE(l.name, '')  AS location_name,
      COALESCE(u.name, '')  AS tech_name
    FROM packets p
    LEFT JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN locations l ON l.location_id = p.location_id
    LEFT JOIN users u     ON u.user_id = p.tech_id
    WHERE p.status = 'imported'
    ORDER BY p.updated_at DESC
    LIMIT 30
  `)

  const pendingReferrals = query(`
    SELECT t.test_id, t.test_date, t.classification,
           e.first_name, e.last_name, e.employee_id,
           c.name AS company_name,
           t.referral_given_to_worker
    FROM tests t
    JOIN employees e ON e.employee_id = t.employee_id
    JOIN locations l ON l.location_id = e.location_id
    JOIN companies c ON c.company_id  = l.company_id
    WHERE t.sts_flag = 1
      AND (t.referral_sent_to_employer IS NULL OR t.referral_sent_to_employer = 0)
      AND c.active = 1
    ORDER BY t.test_date DESC
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
        <div class="kpi-strip-item ${stats.stsFlags > 0 ? 'kpi-strip-item--alert' : ''}">
          <span class="kpi-strip-num">${stats.stsFlags}</span>
          <span class="kpi-strip-lbl">STS Flags</span>
        </div>
        <div class="kpi-strip-item">
          <span class="kpi-strip-num">${inField.length}</span>
          <span class="kpi-strip-lbl">In Field</span>
        </div>
        <div class="kpi-strip-date">
          <span>${new Date().toLocaleDateString('en-CA')}</span>
          <button class="btn-hard-refresh" onclick="location.reload(true)" title="Hard refresh (Ctrl+Shift+R)">↺</button>
        </div>
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

      <!-- Row 1: three panels -->
      <div class="dash-grid-3">

        <!-- Incoming Completed Packets -->
        <div class="dash-panel ${incoming.length > 0 ? 'dash-panel--alert' : ''}">
          <div class="panel-head">
            <h2>Incoming <span class="panel-count ${incoming.length > 0 ? 'panel-count--alert' : ''}">${incoming.length}</span></h2>
            <button class="btn btn-sm btn-outline" id="btn-check-incoming">Check Folder</button>
          </div>
          ${incoming.length === 0
            ? '<p class="empty-note">No packets awaiting import.</p>'
            : `<div class="panel-scroll">
                ${incoming.map(p => `
                  <div class="incoming-row">
                    <div class="incoming-info">
                      <div class="incoming-company">${esc(p.company_name)}</div>
                      <div class="incoming-meta">${esc(p.province)} · ${p.visit_date}</div>
                    </div>
                    <button class="btn btn-sm btn-primary btn-review-packet" data-packet-id="${esc(p.packet_id)}">Review →</button>
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-link" id="btn-view-all-incoming">View all →</button>`
          }
        </div>

        <!-- Packets in the Field -->
        <div class="dash-panel">
          <div class="panel-head">
            <h2>In the Field <span class="panel-count">${inField.length}</span></h2>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="btn btn-sm btn-outline" id="btn-refresh-status">↺ Status</button>
              <button class="btn btn-sm btn-ghost"   id="btn-go-packets">All Packets →</button>
            </div>
          </div>
          ${inField.length === 0
            ? '<p class="empty-note">No packets currently out with techs.</p>'
            : `<div class="panel-scroll">
                ${inField.map(p => `
                  <div class="overdue-row">
                    <div class="overdue-name">${esc(p.company_name)}</div>
                    <div class="overdue-meta">
                      ${p.visit_date} · ${esc(p.tech_name || p.tech_id || 'Unassigned')}
                      ${p.location_name ? ` · ${esc(p.location_name)}` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>`
          }
        </div>

        <!-- Coming Soon -->
        <div class="dash-panel">
          <div class="panel-head">
            <h2>Coming Soon <span class="panel-head-hint">(6 mo)</span></h2>
          </div>
          ${comingSoon.length === 0
            ? '<p class="empty-note">No companies due within 6 months.</p>'
            : `<div class="panel-scroll">
                ${comingSoon.map(c => `
                  <div class="overdue-row company-link" data-location-id="${c.location_id}" style="cursor:pointer">
                    <div class="overdue-name">${esc(c.name)}</div>
                    <div class="overdue-meta">${esc(c.company_name)} · ${esc(c.province)} · ${c.last_test_date ? 'Last: ' + c.last_test_date : 'Never tested'} · ${c.active_emp_count} emp</div>
                  </div>
                `).join('')}
              </div>`
          }
        </div>
      </div>

      <!-- Row 2: referrals + recently imported -->
      <div class="dash-columns" style="margin-top:16px">

        <!-- Pending Referrals -->
        <div class="dash-panel ${pendingReferrals.length > 0 ? 'dash-panel--referrals' : ''}">
          <div class="panel-head">
            <h2>${pendingReferrals.length > 0 ? '⚠ ' : ''}Pending Referrals
              <span class="panel-count ${pendingReferrals.length > 0 ? 'panel-count--alert' : ''}">${pendingReferrals.length}</span>
            </h2>
          </div>
          ${pendingReferrals.length === 0
            ? '<p class="empty-note">No outstanding referrals.</p>'
            : `<div class="panel-scroll referral-list">
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
                          : '<span class="ref-status ref-pending">○ Not given to worker</span>'}
                      </div>
                      <button class="btn btn-sm btn-ghost btn-view-referral" data-emp-id="${t.employee_id}">View →</button>
                    </div>
                  `
                }).join('')}
              </div>`
          }
        </div>

        <!-- Recently Imported -->
        <div class="dash-panel">
          <div class="panel-head">
            <h2>Recently Imported <span class="panel-count">${recentlyImported.length}</span></h2>
          </div>
          ${recentlyImported.length === 0
            ? '<p class="empty-note">No imported packets yet.</p>'
            : `<div class="panel-scroll">
                ${recentlyImported.map(p => `
                  <div class="overdue-row">
                    <div class="overdue-name">${esc(p.company_name)}</div>
                    <div class="overdue-meta">Visit: ${p.visit_date} · Imported: ${(p.updated_at ?? '').slice(0,10)}${p.tech_name ? ` · ${esc(p.tech_name)}` : ''}</div>
                  </div>
                `).join('')}
              </div>`
          }
        </div>

      </div>
    </div>
  `

  container.querySelector('#btn-check-incoming')?.addEventListener('click', () =>
    checkSyncFolder(container, state, navigate)
  )
  container.querySelector('#btn-load-demo')?.addEventListener('click', () => {
    loadDemoData(); navigate('dashboard')
  })
  container.querySelector('#btn-view-all-incoming')?.addEventListener('click', () => navigate('incoming'))
  container.querySelector('#btn-go-packets')?.addEventListener('click',  () => navigate('packets'))

  container.querySelectorAll('.btn-review-packet').forEach(btn => {
    btn.addEventListener('click', () =>
      navigate('import-confirm', { params: { packetId: btn.dataset.packetId } })
    )
  })

  container.querySelectorAll('.company-link').forEach(row => {
    row.addEventListener('click', () =>
      navigate('location-detail', { currentLocation: { location_id: Number(row.dataset.locationId) } })
    )
  })

  container.querySelectorAll('.btn-view-referral').forEach(btn => {
    btn.addEventListener('click', () =>
      navigate('employee-detail', { currentEmployee: { employee_id: Number(btn.dataset.empId) } })
    )
  })

  // ↺ Status button — checks status files in sync folder for all in-field packets
  container.querySelector('#btn-refresh-status')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-refresh-status')
    btn.disabled = true; btn.textContent = 'Checking…'
    try {
      let folder = state.syncFolder
      if (!folder) {
        folder = await getSyncFolder()
        if (!folder) folder = await pickSyncFolder()
        state.syncFolder = folder
      }
      const toCheck = [...getPacketsByStatus('pending'), ...getPacketsByStatus('active')]
      const n = await refreshPacketStatuses(toCheck, folder)
      if (n > 0) renderDashboard(container, state, navigate)
      else { btn.disabled = false; btn.textContent = '↺ Status' }
    } catch (e) {
      if (e.name !== 'AbortError') alert(`Could not check status: ${e.message}`)
      btn.disabled = false; btn.textContent = '↺ Status'
    }
  })

  // Auto-refresh if sync folder already connected
  if (state.syncFolder && inField.length) {
    refreshPacketStatuses(inField, state.syncFolder).then(n => {
      if (n > 0) renderDashboard(container, state, navigate)
    })
  }
}

// ---------------------------------------------------------------------------
// Sync folder check — incoming packets from inbox
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
