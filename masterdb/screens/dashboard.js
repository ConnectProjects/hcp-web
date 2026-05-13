import { getDashboardStats, getComingSoonCompanies } from '../db/tests.js'
import { getPacketsByStatus }                 from '../db/packets.js'
import { isDemoLoaded, loadDemoData }         from '../db/demo.js'
import { query, run, queryOne }               from '../db/sqlite.js'
import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile, moveJsonFile } from '@shared/fs/sync-folder.js'

export function renderDashboard(container, state, navigate) {
  const stats          = getDashboardStats()
  const comingSoon     = getComingSoonCompanies(6).slice(0, 8)
  const incoming       = getPacketsByStatus('submitted').slice(0, 5)
  const isEmpty        = stats.totalCompanies === 0 && !isDemoLoaded()

  // Pending referrals — tests with A/AC/EW classification not yet marked sent to employer
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
      <div class="page-header">
        <h1>Dashboard</h1>
        <span class="page-date">${new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
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

      <!-- KPI tiles -->
      <div class="kpi-row">
        <div class="kpi-tile" data-action="companies">
          <div class="kpi-num">${stats.totalCompanies}</div>
          <div class="kpi-lbl">Companies</div>
        </div>
        <div class="kpi-tile" data-action="employees">
          <div class="kpi-num">${stats.totalEmployees}</div>
          <div class="kpi-lbl">Active Employees</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-num">${stats.testsThisMonth}</div>
          <div class="kpi-lbl">Tests (30 days)</div>
        </div>
        <div class="kpi-tile kpi-tile--blue ${stats.incomingPackets > 0 ? 'kpi-tile--alert' : ''}" data-action="incoming">
          <div class="kpi-num">${stats.incomingPackets}</div>
          <div class="kpi-lbl">Incoming Packets</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-num">${stats.pendingPackets}</div>
          <div class="kpi-lbl">Pending (in field)</div>
        </div>
      </div>

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
                  <div class="overdue-row company-link" data-company-id="${c.company_id}" style="cursor:pointer">
                    <div class="overdue-info">
                      <div class="overdue-name">${esc(c.name)}</div>
                      <div class="overdue-meta">${esc(c.province)} · ${c.last_test_date ? 'Last visit: ' + c.last_test_date : 'Never tested'} · ${c.active_emp_count} emp</div>
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
                  <button class="btn btn-sm btn-ghost btn-view-referral"
                    data-emp-id="${t.employee_id}">
                    View →
                  </button>
                </div>
              `
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `

  // KPI tile navigation
  container.querySelectorAll('.kpi-tile[data-action]').forEach(tile => {
    tile.style.cursor = 'pointer'
    tile.addEventListener('click', () => navigate(tile.dataset.action))
  })

  container.querySelector('#btn-check-incoming')?.addEventListener('click', () => checkSyncFolder(container, state, navigate))
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
      const id = Number(row.dataset.companyId)
      navigate('company-detail', { currentCompany: { company_id: id } })
    })
  })

  // Pending referral → employee detail
  container.querySelectorAll('.btn-view-referral').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = Number(btn.dataset.empId)
      navigate('employee-detail', { currentEmployee: { employee_id: empId } })
    })
  })
}

async function checkSyncFolder(container, state, navigate) {
  const btn = container.querySelector('#btn-check-incoming')
  const head = btn.closest('.panel-head')

  let status = container.querySelector('#sync-status')
  if (!status) {
    status = document.createElement('div')
    status.id = 'sync-status'
    status.style.fontSize = '12px'
    status.style.marginTop = '4px'
    status.style.padding = '4px 8px'
    status.style.borderRadius = '4px'
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
      status.className = 'alert alert-info'
      setTimeout(() => { 
        if (status) status.style.display = 'none'
        btn.disabled = false
        btn.textContent = 'Check Sync Folder'
      }, 2000)
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
          [
            packet.packet_id,
            companyId,
            packet.tech?.tech_id ?? null,
            packet.visit?.visit_date ?? '',
            name
          ]
        )

        await moveJsonFile(folder, 'inbox', 'archive', name)
        saved++
      } catch (e) {
        console.warn('Could not process packet:', name, e)
      }
    }

    status.textContent = `✓ ${saved} packet(s) ready for review.`
    status.className = 'alert alert-success'
    
    // Refresh the dashboard to show new packets
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
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
