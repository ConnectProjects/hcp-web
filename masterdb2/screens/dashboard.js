/**
 * masterdb2/screens/dashboard.js — home screen
 *
 * KPI bar + upcoming visits + returned-result processing (async).
 */

import { query, scalar, readLock, listInbox } from '../db/db.js'
import { autoImportClean } from '../db/import-packet.js'

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

  // ── Render shell ─────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="screen-header-row">
      <h1>Dashboard</h1>
      <span style="font-size:0.8125rem;color:var(--clr-subtle)">
        ${esc(session.user?.name ?? '')} &mdash; seq&nbsp;${or?.saveSeq ?? '?'}
      </span>
    </div>

    <div id="lock-status"></div>

    <div class="kpi-bar">
      ${kpi(companies, 'Companies')}
      ${kpi(locations, 'Locations')}
      ${kpi(workers,   'Workers')}
      ${kpi(tests,     'Tests')}
    </div>

    <div class="screen-body workspace-grid">

      <div>
        <div class="section-head"><h2>Upcoming Visits</h2></div>
        ${upcomingTable(upcoming, navigate)}
      </div>

      <div>
        <div class="section-head">
          <h2>Returned Results</h2>
          <button class="btn btn-secondary btn-sm" id="review-results-btn" disabled>Review</button>
        </div>
        <div id="result-processing-status"></div>
        <div id="inbox-queue"><p style="color:var(--clr-subtle);font-size:0.875rem">Loading…</p></div>
      </div>

    </div>
  `

  container.querySelector('#review-results-btn')?.addEventListener('click', () => navigate('import'))

  // Result processing is deliberately non-blocking. The dashboard renders
  // immediately, then clean returns are accepted only when this session owns
  // the Office write lock. Ambiguous records remain untouched for review.
  initializeReturnedResults(container, techs, session)
}

async function initializeReturnedResults(container, techs, session) {
  const lockEl = container.querySelector('#lock-status')
  const statusEl = container.querySelector('#result-processing-status')
  const reviewBtn = container.querySelector('#review-results-btn')

  let lock = null
  try { lock = await readLock() } catch { /* processing remains paused */ }

  const ownsLock = !!lock && !lock.stale && lock.owner === session.writerName
  if (lock && !lock.stale && lock.owner && !ownsLock && lockEl) {
    lockEl.innerHTML = `<div class="warning-banner screen-alert">
      <strong>Office is open by ${esc(lock.owner)}</strong>
      — changes and automatic result processing are paused in this session.
    </div>`
  }

  if (ownsLock && techs.length) {
    if (statusEl) {
      statusEl.innerHTML = `<p class="status-text" style="margin:0 0 0.5rem">Checking for completed field visits…</p>`
    }
    try {
      const { results } = await autoImportClean(techs, session.writerName)
      if (statusEl) statusEl.innerHTML = results.length ? processingSummary(results) : ''
    } catch (e) {
      if (statusEl) {
        statusEl.innerHTML = `<div class="warning-banner" style="margin-bottom:0.75rem">
          Automatic result processing paused: ${esc(e?.message || e)}
        </div>`
      }
    }
  } else if (statusEl) {
    statusEl.innerHTML = ownsLock
      ? ''
      : `<p style="color:var(--clr-subtle);font-size:0.8rem;margin:0 0 0.5rem">Automatic processing is paused in this session.</p>`
  }

  await refreshInboxQueue(container, techs)
  if (reviewBtn) reviewBtn.disabled = false
}

async function refreshInboxQueue(container, techs) {
  const el = container.querySelector('#inbox-queue')
  if (!el) return
  try {
    el.innerHTML = await loadInboxQueue(techs)
  } catch {
    el.innerHTML = `<p style="color:var(--clr-subtle);font-size:0.875rem">Could not check returned results.</p>`
  }
}

function processingSummary(results) {
  const accepted = results.filter(r => r.ok)
  const review = results.filter(r => r.skipped)
  const failed = results.filter(r => !r.ok && !r.skipped)
  const tests = accepted.reduce((total, r) => total + (r.imported ?? 0), 0)
  const wsbc = accepted.filter(r => r.wsbcCsv).length

  return `
    ${accepted.length ? `<div class="success-banner" style="margin-bottom:0.5rem">
      ${accepted.length} returned visit${accepted.length !== 1 ? 's' : ''} accepted automatically
      &mdash; ${tests} test${tests !== 1 ? 's' : ''} stored.
    </div>` : ''}
    ${review.length ? `<div class="warning-banner" style="margin-bottom:0.5rem">
      ${review.length} returned visit${review.length !== 1 ? 's need' : ' needs'} review before acceptance.
    </div>` : ''}
    ${failed.length ? `<div class="warning-banner" style="margin-bottom:0.5rem">
      ${failed.length} returned visit${failed.length !== 1 ? 's need' : ' needs'} attention.
    </div>` : ''}
    ${wsbc ? `<p style="color:var(--clr-subtle);font-size:0.8rem;margin:0 0 0.5rem">
      WorkSafeBC export is required for ${wsbc} accepted visit${wsbc !== 1 ? 's' : ''}; use Reports when ready to submit.
    </p>` : ''}
  `
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
    return `<div class="table-card"><div class="table-empty">No returned results are waiting.</div></div>`
  }

  const rows = results.flatMap(({ tech, packets }) => {
    if (!packets?.length) return []
    return packets.map(f => `
      <tr>
        <td style="color:var(--clr-subtle);font-size:0.8rem">${esc(tech.initials ?? tech.name.slice(0,2))}</td>
        <td style="font-size:0.8125rem">Completed field visit</td>
        <td style="font-size:0.75rem;color:var(--clr-subtle)">${f.lastModified ? fmtTs(f.lastModified) : ''}</td>
      </tr>
    `)
  }).join('')

  return `
    <div class="table-card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Tech</th><th>Returned item</th><th>Received</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <p style="font-size:0.8rem;color:var(--clr-subtle);margin-top:0.375rem">
      ${totalFiles} returned visit${totalFiles !== 1 ? 's' : ''} waiting to process.
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
