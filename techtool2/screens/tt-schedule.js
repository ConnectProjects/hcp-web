/**
 * techtool2/screens/tt-schedule.js — TechTool month-view schedule
 *
 * Shows this tech's scheduled visits as chips on a calendar.
 * Two layers are merged on each day:
 *   • DB layer  — packets in the `packets` table assigned to this tech
 *   • File layer — JSON files currently in the tech's OneDrive outbox
 *
 * Chip state:
 *   Scheduled (DB only, no file yet) — gray outlined chip, informational only
 *   Not started (file in outbox, 0 tested) — gray filled chip
 *   In progress (some tested) — blue chip
 *   Complete (all tested/skipped) — green chip
 *
 * Clicking any chip with an available file navigates to tt-test.
 */

import { query, listTechPackets, readTechPacket, listInbox, readPacket } from '../../masterdb2/db/db.js'

export function mount(container, { navigate, session }) {
  // ── Resolve this tech in the DB ──────────────────────────────────────────────
  let techRow  = null
  let techErr  = null
  try {
    const rows = query(
      `SELECT t.*, u.name AS user_name
       FROM techs t
       JOIN users u ON LOWER(u.name) = LOWER(t.name)
       WHERE LOWER(t.name) = LOWER(?) AND t.active = 1
       LIMIT 1`,
      [session.user?.name ?? '']
    )
    techRow = rows[0] ?? null
    if (!techRow) {
      // fallback: match by folder name (for cases where names differ slightly)
      const folderRows = query(
        `SELECT * FROM techs WHERE active = 1 AND folder_name IS NOT NULL LIMIT 10`
      )
      // can't determine without a name match — show error below
    }
  } catch (e) {
    techErr = e.message
  }

  // ── Calendar state ───────────────────────────────────────────────────────────
  const now   = new Date()
  let year    = now.getFullYear()
  let month   = now.getMonth()   // 0-based
  let detail  = null             // selected chip data

  // File cache: { [filename]: { packet, total, done } }
  let _fileCache   = null
  let _loadingFiles = false
  let _fileErr      = null

  // ── Boot ─────────────────────────────────────────────────────────────────────

  async function loadFiles() {
    if (!techRow?.folder_name) return
    _loadingFiles = true
    _fileCache    = null
    _fileErr      = null
    render()

    try {
      const files = await listTechPackets(techRow.folder_name)
      const jsons = files.filter(f => f.kind === 'file' && f.name.endsWith('.json'))
      const cache = {}

      await Promise.all(jsons.map(async f => {
        try {
          const pkt   = await readTechPacket(techRow.folder_name, f.name)
          const total = pkt.employees?.length ?? 0
          const done  = pkt.employees?.filter(
            e => (e.completed_tests?.length ?? 0) > 0 || e.skipped_at
          ).length ?? 0
          cache[f.name] = { packet: pkt, total, done, filename: f.name }
        } catch { /* skip unreadable files */ }
      }))

      // Also scan inbox for already-submitted packets
      try {
        const inbox = await listInbox(techRow.folder_name)
        const inboxJsons = inbox.filter(f => f.kind === 'file' && f.name.endsWith('.json'))
        await Promise.all(inboxJsons.map(async f => {
          if (cache[f.name]) return  // outbox copy takes priority
          try {
            const pkt   = await readPacket(techRow.folder_name, f.name)
            const total = pkt.employees?.length ?? 0
            const done  = pkt.employees?.filter(
              e => (e.completed_tests?.length ?? 0) > 0 || e.skipped_at
            ).length ?? 0
            cache[f.name] = { packet: pkt, total, done, filename: f.name, submitted: true }
          } catch { /* skip unreadable */ }
        }))
      } catch { /* inbox folder may not exist yet */ }

      _fileCache    = cache
      _loadingFiles = false
    } catch (e) {
      _fileErr      = e.message
      _loadingFiles = false
    }
    render()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function render() {
    if (techErr || !techRow) {
      container.innerHTML = `
        <div class="screen-header-row"><h1>Schedule</h1></div>
        <div class="screen-body">
          <div class="warning-banner">
            No technician record found for your account.
            Ask your LC to ensure your name in Settings → Techs matches your user record.
            ${techErr ? `<br><code>${esc(techErr)}</code>` : ''}
          </div>
        </div>`
      return
    }

    // Load DB appointments for this month
    const first  = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const last   = lastDayOf(year, month)
    let dbPackets = []
    try {
      dbPackets = query(
        `SELECT p.packet_id, p.filename, p.visit_date, p.status,
                c.name AS company_name, l.name AS location_name, l.city, l.province
         FROM packets p
         JOIN companies c ON c.company_id = p.company_id
         LEFT JOIN locations l ON l.location_id = p.location_id
         WHERE p.tech_id = ? AND p.status != 'cancelled'
           AND p.visit_date BETWEEN ? AND ?
         ORDER BY p.visit_date`,
        [techRow.tech_id, first, last]
      )
    } catch { /* packets table may not exist yet */ }

    // Build a map of all events by date
    const byDay = {}   // { 'YYYY-MM-DD': [{ type, dbRow, fileEntry, displayName, status }] }

    // Add DB-sourced events
    for (const p of dbPackets) {
      const d = p.visit_date?.slice(0, 10)
      if (!d) continue
      const fileEntry = _fileCache ? findFileForPacket(p) : null
      const ev = {
        type:         'db',
        dbRow:        p,
        fileEntry,
        displayName:  p.company_name,
        subline:      p.location_name ?? p.city ?? null,
        status:       fileEntry
          ? fileStatus(fileEntry)
          : (p.status === 'pushed'   ? 'not-started'
           : p.status === 'imported' ? 'imported'
           : 'scheduled'),
      }
      ;(byDay[d] ??= []).push(ev)
    }

    // Add file-sourced events that aren't already matched to a DB row
    if (_fileCache) {
      const dbFilenames = new Set(dbPackets.map(p => p.filename).filter(Boolean))
      for (const [fn, fe] of Object.entries(_fileCache)) {
        if (dbFilenames.has(fn)) continue   // already represented via DB row
        const d = fe.packet?.visit?.visit_date?.slice(0, 10)
        if (!d) continue
        // Check if this month
        if (d.slice(0, 7) !== `${year}-${String(month + 1).padStart(2, '0')}`) continue
        const company = fe.packet?.company?.name ?? fn
        ;(byDay[d] ??= []).push({
          type:        'file-only',
          dbRow:       null,
          fileEntry:   fe,
          displayName: company,
          subline:     fe.packet?.location?.name ?? fe.packet?.location?.city ?? null,
          status:      fileStatus(fe),
        })
      }
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    const calHtml = buildCalendar(year, month, byDay)

    const loadingBadge = _loadingFiles
      ? `<span style="font-size:0.8125rem;color:var(--clr-subtle)">Loading files…</span>`
      : _fileErr
        ? `<span style="font-size:0.8125rem;color:var(--clr-danger)">File error: ${esc(_fileErr)}</span>`
        : `<button class="btn btn-secondary btn-sm" id="refresh-btn">↺ Refresh</button>`

    container.innerHTML = `
      <div class="screen-header-row">
        <h1>Schedule</h1>
        <span class="screen-subtitle">${esc(session.user?.name ?? '')}</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:0.75rem">
          ${loadingBadge}
          <button class="btn btn-primary btn-sm" id="new-visit-btn">+ New Visit</button>
        </div>
      </div>
      <div class="screen-body" style="padding-bottom:0">

        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" id="prev-btn">&lsaquo; Prev</button>
          <h2 style="margin:0;min-width:9rem;text-align:center;font-size:1rem">${monthName(year, month)}</h2>
          <button class="btn btn-secondary btn-sm" id="next-btn">Next &rsaquo;</button>
          <button class="btn btn-secondary btn-sm" id="today-btn" style="margin-left:auto">Today</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr${detail ? ' 260px' : ''};gap:1rem;align-items:start">
          <div>${calHtml}</div>
          ${detail ? detailPanel(detail) : ''}
        </div>

        <div style="display:flex;gap:1rem;margin-top:0.875rem;flex-wrap:wrap;padding-bottom:1rem;font-size:0.8125rem;color:var(--clr-subtle)">
          ${legend('cal-chip-scheduled',  'Scheduled (no file yet)')}
          ${legend('cal-chip-not-started','Ready to test')}
          ${legend('cal-chip-progress',   'In progress')}
          ${legend('cal-chip-complete',   'Complete')}
        </div>
      </div>`

    // Nav
    container.querySelector('#prev-btn').addEventListener('click', () => {
      month--; if (month < 0) { month = 11; year-- }; detail = null; render()
    })
    container.querySelector('#next-btn').addEventListener('click', () => {
      month++; if (month > 11) { month = 0; year++ }; detail = null; render()
    })
    container.querySelector('#today-btn').addEventListener('click', () => {
      year = now.getFullYear(); month = now.getMonth(); detail = null; render()
    })
    container.querySelector('#refresh-btn')?.addEventListener('click', loadFiles)
    container.querySelector('#new-visit-btn')?.addEventListener('click', () => navigate('tt-new-visit'))

    // Chip clicks
    container.querySelectorAll('.cal-chip[data-ev]').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation()
        const idx = Number(chip.dataset.ev)
        const d   = chip.dataset.date
        const ev  = (byDay[d] ?? [])[idx]
        if (!ev) return
        if (ev.fileEntry && ev.status !== 'scheduled' && ev.status !== 'submitted') {
          navigate('tt-test', { filename: ev.fileEntry.filename, techFolder: techRow.folder_name })
        } else {
          detail = ev; render()
        }
      })
    })

    container.querySelector('.cal-grid')?.addEventListener('click', () => {
      detail = null; render()
    })

    container.querySelector('#open-file-btn')?.addEventListener('click', () => {
      if (detail?.fileEntry) {
        navigate('tt-test', { filename: detail.fileEntry.filename, techFolder: techRow.folder_name })
      }
    })
  }

  // ── Calendar HTML ─────────────────────────────────────────────────────────────

  function buildCalendar(year, month, byDay) {
    const first    = new Date(year, month, 1)
    const lastDate = new Date(year, month + 1, 0).getDate()
    const startDow = first.getDay()   // 0=Sun
    const today    = new Date().toISOString().slice(0, 10)

    const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      .map(d => `<div class="cal-dh">${d}</div>`).join('')

    let cells = ''

    for (let i = 0; i < startDow; i++) {
      cells += `<div class="cal-cell cal-cell-out"></div>`
    }

    for (let d = 1; d <= lastDate; d++) {
      const iso    = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const evList = byDay[iso] ?? []
      const isToday = iso === today

      const chips = evList.map((ev, idx) => {
        const chipStatus = (ev.status === 'submitted' || ev.status === 'imported') ? 'complete' : ev.status
        const cls = `cal-chip cal-chip-${chipStatus}`
        return `<div class="${cls}" data-ev="${idx}" data-date="${iso}"
                     title="${esc(ev.displayName)}${ev.subline ? ' — ' + ev.subline : ''}">
                  ${esc(ev.displayName)}
                </div>`
      }).join('')

      cells += `
        <div class="cal-cell ${isToday ? 'cal-cell-today' : ''}">
          <div class="cal-day-num" style="font-size:0.75rem;text-align:right;
               color:${isToday ? 'var(--clr-primary)' : 'var(--clr-subtle)'};
               font-weight:${isToday ? '700' : '400'}">${d}</div>
          ${chips}
        </div>`
    }

    const total    = startDow + lastDate
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7)
    for (let i = 0; i < trailing; i++) {
      cells += `<div class="cal-cell cal-cell-out"></div>`
    }

    return `
      <div class="cal-grid">
        ${dayHeaders}
        ${cells}
      </div>`
  }

  // ── Detail panel ─────────────────────────────────────────────────────────────

  function detailPanel(ev) {
    const p   = ev.dbRow
    const fe  = ev.fileEntry
    const hasFile = !!fe && ev.status !== 'scheduled' && ev.status !== 'submitted'

    const rows = [
      ['Company',  ev.displayName],
      ['Location', ev.subline],
      ['Visit',    fmtDate(p?.visit_date ?? fe?.packet?.visit?.visit_date)],
      ['Status',   statusLabel(ev.status)],
      ['Workers',  fe ? `${fe.done} of ${fe.total} done` : null],
    ].filter(r => r[1]).map(([l, v]) =>
      `<div style="display:flex;gap:0.5rem;margin-bottom:0.25rem;font-size:0.875rem">
        <span style="color:var(--clr-subtle);min-width:5rem">${l}</span>
        <span>${esc(String(v))}</span>
       </div>`
    ).join('')

    return `
      <div class="info-card" style="position:sticky;top:1rem">
        <div style="font-size:0.75rem;color:var(--clr-subtle);margin-bottom:0.625rem">Visit detail</div>
        ${rows}
        ${hasFile
          ? `<button class="btn btn-primary" id="open-file-btn" style="margin-top:1rem;width:100%">Open packet →</button>`
          : ev.status === 'submitted'
            ? `<div style="margin-top:0.75rem;font-size:0.875rem;color:var(--clr-subtle)">
                 Submitted — your LC will import this when they&apos;re back in the office.
               </div>`
            : ev.status === 'imported'
            ? `<div style="margin-top:0.75rem;font-size:0.875rem;color:var(--clr-subtle)">
                 Imported into MasterDB. Results are on file.
               </div>`
            : `<div style="margin-top:0.75rem;font-size:0.875rem;color:var(--clr-subtle)">
                 This packet hasn&apos;t been pushed to your OneDrive folder yet.
                 Check back later or ask your LC.
               </div>`}
      </div>`
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function findFileForPacket(dbRow) {
    if (!_fileCache) return null
    // Match by filename if DB row has one
    if (dbRow.filename && _fileCache[dbRow.filename]) return _fileCache[dbRow.filename]
    // Fallback: match by company name + visit date
    for (const fe of Object.values(_fileCache)) {
      if (fe.packet?.visit?.visit_date?.slice(0, 10) === dbRow.visit_date?.slice(0, 10)
          && (fe.packet?.company?.name ?? '').toLowerCase() === (dbRow.company_name ?? '').toLowerCase()) {
        return fe
      }
    }
    return null
  }

  function fileStatus(fe) {
    if (!fe) return 'scheduled'
    if (fe.submitted) return 'submitted'
    if (fe.total > 0 && fe.done >= fe.total) return 'complete'
    if (fe.done > 0) return 'progress'
    return 'not-started'
  }

  function legend(cls, label) {
    return `<span style="display:inline-flex;align-items:center;gap:0.375rem">
      <span class="cal-chip ${cls}" style="padding:1px 6px;pointer-events:none">ABC</span>
      ${esc(label)}</span>`
  }

  loadFiles()
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function statusLabel(s) {
  return { scheduled: 'Scheduled', 'not-started': 'Ready', progress: 'In progress', complete: 'Complete', submitted: 'Submitted', imported: 'Imported' }[s] ?? s
}

function monthName(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function lastDayOf(year, month) {
  const d = new Date(year, month + 1, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtDate(d) {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-CA',
      { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}
