/**
 * masterdb2/screens/dashboard.js — home screen
 *
 * KPI bar + upcoming visits + inbox queue (async).
 */

import { query, scalar, readLock, listInbox } from '../db/db.js'

export function mount(container, { navigate, session }) {
  const or = session.openResult

  // ── Sync data (instant) ──────────────────────────────────────────────────
  const companies = scalar('SELECT COUNT(*) FROM companies WHERE active = 1') ?? 0
  const locations = scalar('SELECT COUNT(*) FROM locations WHERE active = 1') ?? 0
  const workers   = scalar("SELECT COUNT(*) FROM employees WHERE status='active' AND deleted_at IS NULL") ?? 0
  const tests     = scalar('SELECT COUNT(*) FROM tests WHERE deleted_at IS NULL') ?? 0

  const upcoming = query(
    `SELECT p.packet_id, p.visit_date, p.filename, p.status,
            c.name AS company_name, l.name AS location_name, l.province,
            tk.initials AS tech_initials, tk.name AS tech_name
     FROM packets p
     JOIN  companies c ON c.company_id  = p.company_id
     LEFT JOIN locations l  ON l.location_id = p.location_id
     LEFT JOIN techs    tk ON tk.tech_id     = p.tech_id
     WHERE p.status = 'pending' AND p.visit_date >= date('now')
     ORDER BY p.visit_date LIMIT 10`
  )

  const techs = query(`SELECT * FROM techs WHERE active = 1 AND folder_name IS NOT NULL ORDER BY name`)

  // Lock banner
  let lockBanner = ''
  try {
    const lock = readLock()
    if (lock && !lock.stale && lock.owner && lock.owner !== session.writerName) {
      lockBanner = `<div class="warning-banner" style="margin-bottom:1rem">
        <strong>Write lock held by ${esc(lock.owner)}</strong>
        — MasterDB is read-only until they sign out.
      </div>`
    }
  } catch { /* ignore */ }

  // ── Render shell ─────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="screen-header-row">
      <h1>Dashboard</h1>
      <span style="font-size:0.8125rem;color:var(--clr-subtle)">
        ${esc(session.user?.name ?? '')} &mdash; seq&nbsp;${or?.saveSeq ?? '?'}
      </span>
    </div>

    ${lockBanner}

    <div class="kpi-bar">
      ${kpi(companies, 'Companies')}
      ${kpi(locations, 'Locations')}
      ${kpi(workers,   'Workers')}
      ${kpi(tests,     'Tests')}
    </div>

    <div class="screen-body" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start">

      <div>
        <div class="section-head"><h2>Upcoming Visits</h2></div>
        ${upcomingTable(upcoming, navigate)}
      </div>

      <div>
        <div class="section-head"><h2>Inbox Queue</h2></div>
        <div id="inbox-queue"><p style="color:var(--clr-subtle);font-size:0.875rem">Loading…</p></div>
      </div>

    </div>
  `

  // ── Async: inbox queue ───────────────────────────────────────────────────
  loadInboxQueue(techs).then(html => {
    const el = container.querySelector('#inbox-queue')
    if (el) el.innerHTML = html
  }).catch(() => {
    const el = container.querySelector('#inbox-queue')
    if (el) el.innerHTML = `<p style="color:var(--clr-subtle);font-size:0.875rem">Could not read inbox folders.</p>`
  })
}

async function loadInboxQueue(techs) {
  if (!techs.length) return `<p style="color:var(--clr-subtle);font-size:0.875rem">No techs configured.</p>`

  const results = await Promise.all(
    techs.map(async t => {
      try {
        const files = await listInbox(t.folder_name)
        const packets = files.filter(f => f.kind === 'file' && f.name.endsWith('.json'))
        return { tech: t, packets }
      } catch {
        return { tech: t, packets: null }
      }
    })
  )

  const totalFiles = results.reduce((n, r) => n + (r.packets?.length ?? 0), 0)
  if (!totalFiles) {
    return `<div class="table-card"><div class="table-empty">All inboxes are empty.</div></div>`
  }

  const rows = results.flatMap(({ tech, packets }) => {
    if (!packets?.length) return []
    return packets.map(f => `
      <tr>
        <td style="color:var(--clr-subtle);font-size:0.8rem">${esc(tech.initials ?? tech.name.slice(0,2))}</td>
        <td style="font-size:0.8125rem">${esc(f.name)}</td>
        <td style="font-size:0.75rem;color:var(--clr-subtle)">${f.lastModified ? fmtTs(f.lastModified) : ''}</td>
      </tr>
    `)
  }).join('')

  return `
    <div class="table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Tech</th><th>File</th><th>Received</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <p style="font-size:0.8rem;color:var(--clr-subtle);margin-top:0.375rem">
      ${totalFiles} packet${totalFiles !== 1 ? 's' : ''} waiting to import.
    </p>
  `
}

function upcomingTable(rows, navigate) {
  if (!rows.length) {
    return `<div class="table-card"><div class="table-empty">No upcoming visits scheduled.</div></div>`
  }
  return `
    <div class="table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Company</th><th>Tech</th></tr></thead>
          <tbody>
            ${rows.map(p => `
              <tr class="clickable" data-pid="${esc(p.packet_id)}">
                <td style="white-space:nowrap">${fmtDate(p.visit_date)}</td>
                <td>
                  <strong>${esc(p.company_name)}</strong>
                  ${p.location_name ? `<br><span style="font-size:0.75rem;color:var(--clr-subtle)">${esc(p.location_name)}${p.province ? ', '+esc(p.province) : ''}</span>` : ''}
                </td>
                <td style="white-space:nowrap">${esc(p.tech_initials ?? p.tech_name ?? '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <p style="font-size:0.8rem;color:var(--clr-subtle);margin-top:0.375rem">
      ${rows.length} upcoming visit${rows.length !== 1 ? 's' : ''}. Open Schedule for full calendar.
    </p>
  `
}

function kpi(n, label) {
  return `<div class="kpi-item"><span class="kpi-num">${n.toLocaleString()}</span><span class="kpi-label">${label}</span></div>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month:'short', day:'numeric' }) } catch { return d }
}

function fmtTs(ts) {
  try { return new Date(ts).toLocaleString('en-CA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) } catch { return '' }
}
