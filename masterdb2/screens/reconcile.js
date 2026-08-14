/**
 * masterdb2/screens/reconcile.js — archive vs DB reconciliation
 *
 * Reads every .json packet in the root archive/ folder, counts the
 * completed tests with threshold data, and compares against the tests
 * table (matched by packet_id). Flags any packet whose test count in
 * the DB differs from what the packet file says.
 */

import { scalar, query, listRootArchive, readRootArchivePacket } from '../db/db.js'

const THR_KEYS = [
  'left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
  'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k',
]
const hasData = th => th && THR_KEYS.some(k => th[k] != null && th[k] !== '')

export function mount(container, { session }) {
  if (session.user?.role === 'aud_tech') {
    container.innerHTML = `<div class="error-card"><h2>Access denied</h2></div>`
    return
  }

  renderIdle()

  function renderIdle() {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Archive Reconciliation</h1></div>
      <div class="screen-body">
        <div class="info-card" style="margin-bottom:1.5rem">
          <p style="margin:0 0 0.5rem">
            Reads every packet in the root <strong>archive/</strong> folder and
            verifies that its completed tests exist in the database (matched by
            <code>packet_id</code>). Run this before merging to production.
          </p>
          <p style="margin:0;color:var(--clr-subtle);font-size:0.875rem">
            Only tests with threshold data are counted — empty/skipped workers
            are not imported and are not expected in the DB.
          </p>
        </div>
        <button class="btn btn-primary" id="run-btn">Run Check →</button>
      </div>
    `
    container.querySelector('#run-btn').addEventListener('click', runCheck)
  }

  async function runCheck() {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Archive Reconciliation</h1></div>
      <div class="screen-body">
        <div class="spinner"></div>
        <p class="status-text" id="progress">Listing archive…</p>
      </div>
    `
    const prog = () => container.querySelector('#progress')

    let files
    try {
      const all = await listRootArchive()
      files = all.filter(f => f.kind === 'file' && f.name.endsWith('.json'))
    } catch (e) {
      renderError(`Could not read archive/ folder: ${e.message}`)
      return
    }

    if (!files.length) {
      renderError('No .json packets found in the archive/ folder.')
      return
    }

    const results = []
    let totalExpected = 0
    let totalFound    = 0

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (prog()) prog().textContent = `Checking ${i + 1} / ${files.length}: ${f.name}…`

      let packet
      try {
        packet = await readRootArchivePacket(f.name)
      } catch (e) {
        results.push({ filename: f.name, error: `Read failed: ${e.message}` })
        continue
      }

      // Count completed tests with threshold data, per worker
      const workerExpected = []
      for (const emp of packet.employees ?? []) {
        let n = 0
        for (const t of emp.completed_tests ?? []) {
          if (t && hasData(t.thresholds)) n++
        }
        if (n > 0) workerExpected.push({ name: `${emp.last_name}, ${emp.first_name}`, count: n })
      }
      const expected = workerExpected.reduce((s, w) => s + w.count, 0)

      // Count matching rows in the DB, per worker
      const dbRows = query(
        `SELECT e.last_name, e.first_name, COUNT(*) AS n
         FROM tests t
         JOIN employees e ON e.employee_id = t.employee_id
         WHERE t.packet_id = ? AND t.deleted_at IS NULL
         GROUP BY t.employee_id
         ORDER BY e.last_name`,
        [packet.packet_id]
      )
      const found = dbRows.reduce((s, r) => s + r.n, 0)

      totalExpected += expected
      totalFound    += found

      results.push({
        filename:     f.name,
        packetId:     packet.packet_id,
        company:      packet.company?.name ?? '?',
        location:     packet.location?.name ?? '—',
        visitDate:    packet.visit?.visit_date ?? '?',
        tech:         packet.tech?.tech_initials ?? '?',
        expected,
        found,
        workerExpected,
        dbRows,
      })
    }

    renderResults(results, totalExpected, totalFound)
  }

  function renderResults(results, totalExpected, totalFound) {
    const missing  = results.filter(r => !r.error && r.found < r.expected)
    const extra    = results.filter(r => !r.error && r.found > r.expected)
    const matched  = results.filter(r => !r.error && r.found === r.expected)
    const errored  = results.filter(r => r.error)

    const allGood  = !missing.length && !extra.length && !errored.length

    const summaryClass = allGood ? 'success-banner' : 'warning-banner'
    const summaryText  = allGood
      ? `✓ All ${results.length} packets matched — ${totalFound} / ${totalExpected} tests accounted for.`
      : `${matched.length} / ${results.length} packets matched · ${totalFound} of ${totalExpected} tests found`
        + (missing.length  ? ` · <strong>${missing.length} packet(s) short</strong>` : '')
        + (extra.length    ? ` · ${extra.length} packet(s) have extra DB rows` : '')
        + (errored.length  ? ` · ${errored.length} read error(s)` : '')

    const rows = results.flatMap(r => {
      if (r.error) {
        return [`<tr>
          <td colspan="6" style="color:var(--clr-subtle);font-size:0.8125rem">${esc(r.filename)}</td>
          <td style="color:var(--clr-danger)">${esc(r.error)}</td>
        </tr>`]
      }
      const diff = r.found - r.expected
      let statusHtml
      if (diff === 0) {
        statusHtml = `<span class="badge badge-green">✓ Match</span>`
      } else if (diff < 0) {
        statusHtml = `<span class="badge badge-red">Missing ${Math.abs(diff)}</span>`
      } else {
        statusHtml = `<span class="badge badge-yellow">+${diff} extra</span>`
      }

      const mainRow = `<tr${diff !== 0 ? ' style="background:var(--clr-warning-bg)"' : ''}>
        <td>${esc(r.company)}</td>
        <td style="font-size:0.8125rem;color:var(--clr-subtle)">${esc(r.location)}</td>
        <td>${esc(r.visitDate)}</td>
        <td style="font-size:0.75rem;color:var(--clr-subtle)">${esc(r.tech)}</td>
        <td style="text-align:right">${r.expected}</td>
        <td style="text-align:right">${r.found}</td>
        <td>${statusHtml}</td>
      </tr>`

      if (diff === 0) return [mainRow]

      // Drill-down: merge packet workers + DB workers
      const allNames = new Set([
        ...r.workerExpected.map(w => w.name),
        ...r.dbRows.map(w => `${w.last_name}, ${w.first_name}`),
      ])
      const detailRows = [...allNames].map(name => {
        const inPkt = r.workerExpected.find(w => w.name === name)?.count ?? 0
        const inDb  = r.dbRows.find(w => `${w.last_name}, ${w.first_name}` === name)?.n ?? 0
        const wDiff = inDb - inPkt
        const wStyle = wDiff !== 0 ? 'color:var(--clr-danger);font-weight:600' : 'color:var(--clr-subtle)'
        return `<tr style="background:var(--clr-surface);font-size:0.8125rem">
          <td style="padding-left:2rem;color:var(--clr-subtle)" colspan="4">${esc(name)}</td>
          <td style="text-align:right;color:var(--clr-subtle)">${inPkt || '—'}</td>
          <td style="text-align:right;${wStyle}">${inDb || '—'}</td>
          <td style="${wStyle}">${wDiff > 0 ? `+${wDiff} extra` : wDiff < 0 ? `missing ${Math.abs(wDiff)}` : ''}</td>
        </tr>`
      })

      return [mainRow, ...detailRows]
    }).join('')

    container.innerHTML = `
      <div class="screen-header-row">
        <h1>Archive Reconciliation</h1>
        <button class="btn btn-secondary btn-sm" id="rerun-btn" style="margin-left:auto">↺ Run Again</button>
      </div>
      <div class="screen-body">
        <div class="${summaryClass}" style="margin-bottom:1.5rem">${summaryText}</div>
        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Visit date</th>
                  <th>Tech</th>
                  <th style="text-align:right">In packet</th>
                  <th style="text-align:right">In DB</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr style="font-weight:600;border-top:2px solid var(--clr-border)">
                  <td colspan="4">Total</td>
                  <td style="text-align:right">${totalExpected}</td>
                  <td style="text-align:right">${totalFound}</td>
                  <td>${allGood ? '<span class="badge badge-green">✓</span>' : ''}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `
    container.querySelector('#rerun-btn').addEventListener('click', runCheck)
  }

  function renderError(msg) {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Archive Reconciliation</h1></div>
      <div class="screen-body">
        <div class="error-banner">${esc(msg)}</div>
        <button class="btn btn-secondary" id="back-btn" style="margin-top:1rem">← Try Again</button>
      </div>
    `
    container.querySelector('#back-btn').addEventListener('click', renderIdle)
  }
}

// ── Section-level mount (used by Settings screen) ─────────────────────────────
// Renders the reconcile tool into a sub-div without a screen-level header.

export function mountSection(container, { session }) {
  if (session.user?.role === 'aud_tech') return

  renderIdle()

  function renderIdle() {
    container.innerHTML = `
      <div class="info-card" style="margin-bottom:1rem">
        <p style="margin:0 0 0.5rem">
          Reads every packet in the root <strong>archive/</strong> folder and
          verifies that its completed tests exist in the database (matched by
          <code>packet_id</code>). Run this before merging to production.
        </p>
        <p style="margin:0 0 1rem;color:var(--clr-subtle);font-size:0.875rem">
          Only tests with threshold data are counted — empty/skipped workers
          are not imported and are not expected in the DB.
        </p>
        <button class="btn btn-primary" id="rec-run-btn">Run Check →</button>
      </div>
    `
    container.querySelector('#rec-run-btn').addEventListener('click', runCheck)
  }

  async function runCheck() {
    container.innerHTML = `
      <div class="info-card">
        <div class="spinner"></div>
        <p class="status-text" id="rec-progress">Listing archive…</p>
      </div>
    `
    const prog = () => container.querySelector('#rec-progress')

    let files
    try {
      const all = await listRootArchive()
      files = all.filter(f => f.kind === 'file' && f.name.endsWith('.json'))
    } catch (e) {
      renderError(`Could not read archive/ folder: ${e.message}`)
      return
    }

    if (!files.length) {
      renderError('No .json packets found in the archive/ folder.')
      return
    }

    const results = []
    let totalExpected = 0
    let totalFound    = 0

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (prog()) prog().textContent = `Checking ${i + 1} / ${files.length}: ${f.name}…`

      let packet
      try {
        packet = await readRootArchivePacket(f.name)
      } catch (e) {
        results.push({ filename: f.name, error: `Read failed: ${e.message}` })
        continue
      }

      const workerExpected = []
      for (const emp of packet.employees ?? []) {
        let n = 0
        for (const t of emp.completed_tests ?? []) {
          if (t && hasData(t.thresholds)) n++
        }
        if (n > 0) workerExpected.push({ name: `${emp.last_name}, ${emp.first_name}`, count: n })
      }
      const expected = workerExpected.reduce((s, w) => s + w.count, 0)

      const dbRows = query(
        `SELECT e.last_name, e.first_name, COUNT(*) AS n
         FROM tests t
         JOIN employees e ON e.employee_id = t.employee_id
         WHERE t.packet_id = ? AND t.deleted_at IS NULL
         GROUP BY t.employee_id
         ORDER BY e.last_name`,
        [packet.packet_id]
      )
      const found = dbRows.reduce((s, r) => s + r.n, 0)

      totalExpected += expected
      totalFound    += found

      results.push({
        filename: f.name, packetId: packet.packet_id,
        company:  packet.company?.name ?? '?',
        location: packet.location?.name ?? '—',
        visitDate: packet.visit?.visit_date ?? '?',
        tech:     packet.tech?.tech_initials ?? '?',
        expected, found, workerExpected, dbRows,
      })
    }

    renderResults(results, totalExpected, totalFound)
  }

  function renderResults(results, totalExpected, totalFound) {
    const missing = results.filter(r => !r.error && r.found < r.expected)
    const extra   = results.filter(r => !r.error && r.found > r.expected)
    const matched = results.filter(r => !r.error && r.found === r.expected)
    const errored = results.filter(r => r.error)
    const allGood = !missing.length && !extra.length && !errored.length

    const summaryClass = allGood ? 'success-banner' : 'warning-banner'
    const summaryText  = allGood
      ? `✓ All ${results.length} packets matched — ${totalFound} / ${totalExpected} tests accounted for.`
      : `${matched.length} / ${results.length} packets matched · ${totalFound} of ${totalExpected} tests found`
        + (missing.length ? ` · <strong>${missing.length} packet(s) short</strong>` : '')
        + (extra.length   ? ` · ${extra.length} packet(s) have extra DB rows` : '')
        + (errored.length ? ` · ${errored.length} read error(s)` : '')

    const rows = results.flatMap(r => {
      if (r.error) {
        return [`<tr>
          <td colspan="6" style="color:var(--clr-subtle);font-size:0.8125rem">${esc(r.filename)}</td>
          <td style="color:var(--clr-danger)">${esc(r.error)}</td>
        </tr>`]
      }
      const diff = r.found - r.expected
      let statusHtml
      if (diff === 0)      statusHtml = `<span class="badge badge-green">✓ Match</span>`
      else if (diff < 0)   statusHtml = `<span class="badge badge-red">Missing ${Math.abs(diff)}</span>`
      else                 statusHtml = `<span class="badge badge-yellow">+${diff} extra</span>`

      const mainRow = `<tr${diff !== 0 ? ' style="background:var(--clr-warning-bg)"' : ''}>
        <td>${esc(r.company)}</td>
        <td style="font-size:0.8125rem;color:var(--clr-subtle)">${esc(r.location)}</td>
        <td>${esc(r.visitDate)}</td>
        <td style="font-size:0.75rem;color:var(--clr-subtle)">${esc(r.tech)}</td>
        <td style="text-align:right">${r.expected}</td>
        <td style="text-align:right">${r.found}</td>
        <td>${statusHtml}</td>
      </tr>`

      if (diff === 0) return [mainRow]

      const allNames = new Set([
        ...r.workerExpected.map(w => w.name),
        ...r.dbRows.map(w => `${w.last_name}, ${w.first_name}`),
      ])
      const detailRows = [...allNames].map(name => {
        const inPkt = r.workerExpected.find(w => w.name === name)?.count ?? 0
        const inDb  = r.dbRows.find(w => `${w.last_name}, ${w.first_name}` === name)?.n ?? 0
        const wDiff = inDb - inPkt
        const wStyle = wDiff !== 0 ? 'color:var(--clr-danger);font-weight:600' : 'color:var(--clr-subtle)'
        return `<tr style="background:var(--clr-surface);font-size:0.8125rem">
          <td style="padding-left:2rem;color:var(--clr-subtle)" colspan="4">${esc(name)}</td>
          <td style="text-align:right;color:var(--clr-subtle)">${inPkt || '—'}</td>
          <td style="text-align:right;${wStyle}">${inDb || '—'}</td>
          <td style="${wStyle}">${wDiff > 0 ? `+${wDiff} extra` : wDiff < 0 ? `missing ${Math.abs(wDiff)}` : ''}</td>
        </tr>`
      })

      return [mainRow, ...detailRows]
    }).join('')

    container.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:1rem;margin-bottom:1rem">
        <div class="${summaryClass}" style="flex:1;margin:0">${summaryText}</div>
        <button class="btn btn-secondary btn-sm" id="rec-rerun-btn" style="flex-shrink:0">↺ Run Again</button>
      </div>
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Company</th><th>Location</th><th>Visit date</th><th>Tech</th>
                <th style="text-align:right">In packet</th>
                <th style="text-align:right">In DB</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="font-weight:600;border-top:2px solid var(--clr-border)">
                <td colspan="4">Total</td>
                <td style="text-align:right">${totalExpected}</td>
                <td style="text-align:right">${totalFound}</td>
                <td>${allGood ? '<span class="badge badge-green">✓</span>' : ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `
    container.querySelector('#rec-rerun-btn').addEventListener('click', runCheck)
  }

  function renderError(msg) {
    container.innerHTML = `
      <div class="error-banner" style="margin-bottom:0.75rem">${esc(msg)}</div>
      <button class="btn btn-secondary" id="rec-back-btn">← Try Again</button>
    `
    container.querySelector('#rec-back-btn').addEventListener('click', renderIdle)
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
