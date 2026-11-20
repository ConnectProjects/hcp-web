/**
 * masterdb2/screens/dashboard.js — home screen
 *
 * KPI bar + upcoming visits + needs-review queue (background auto-import).
 */

import { query, scalar, readLock } from '../db/db.js'
import { getLastResult, subscribe, refreshNow } from '../db/background-sync.js'

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
        <div class="section-head"><h2>Needs Review</h2></div>
        <div id="review-queue"><p style="color:var(--clr-subtle);font-size:0.875rem">Checking…</p></div>
      </div>

    </div>
  `

  // ── Review queue (background sync state) ─────────────────────────────────
  const render = result => {
    const el = container.querySelector('#review-queue')
    if (!el) return
    el.innerHTML = reviewQueue(result)
    el.querySelector('#retry-import')?.addEventListener('click', e => {
      e.preventDefault()
      refreshNow()
    })
    el.querySelectorAll('[data-review]').forEach(btn =>
      btn.addEventListener('click', () => navigate('import'))
    )
  }

  render(getLastResult())
  const unsubscribe = subscribe(render)
  return { unmount: unsubscribe }
}

function reviewQueue(result) {
  const checked = result?.at ? fmtTs(result.at) : null

  const status = result?.error
    ? `<div class="warning-banner" style="margin-bottom:0.75rem">
         <strong>Auto-import needs attention:</strong> ${esc(result.error)}
         <a href="#" id="retry-import" style="margin-left:0.5rem">Retry</a>
       </div>`
    : `<p style="font-size:0.8rem;color:var(--clr-subtle);margin:0 0 0.75rem">
         Auto-import on${checked ? ` &middot; last checked ${esc(checked)}` : ' &middot; checking…'}
         &middot; <a href="#" id="retry-import">Run now</a>
       </p>`

  if (!result) {
    return `${status}<div class="table-card"><div class="table-empty">Checking for completed visits…</div></div>`
  }

  const reviews = result.results.filter(r => r.skipped || !r.ok)
  if (!reviews.length) {
    return `${status}<div class="table-card"><div class="table-empty">
      No visits need review. Completed visits import automatically.
    </div></div>`
  }

  const rows = reviews.map(r => `
    <tr>
      <td style="font-size:0.8125rem">${esc(r.company ?? '—')}</td>
      <td style="font-size:0.8125rem">${esc(r.tech ?? '—')}</td>
      <td style="font-size:0.8125rem">${esc(r.visitDate ?? '—')}</td>
      <td style="font-size:0.8125rem">${esc(r.reason ?? 'Import failed')}</td>
      <td><button class="btn btn-secondary btn-sm" data-review="1">Review</button></td>
    </tr>
  `).join('')

  return `
    ${status}
    <div class="table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Company</th><th>Tech</th><th>Visit</th><th>Why</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
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
