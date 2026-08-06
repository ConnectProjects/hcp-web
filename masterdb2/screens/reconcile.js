/**
 * masterdb2/screens/reconcile.js — archive vs DB reconciliation
 *
 * Reads every .json packet in the root archive/ folder, counts the
 * completed tests with threshold data, and compares against the tests
 * table (matched by packet_id). Flags any packet whose test count in
 * the DB differs from what the packet file says.
 */

import { scalar, listRootArchive, readRootArchivePacket } from '../db/db.js'

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

      // Count completed tests with threshold data
      let expected = 0
      for (const emp of packet.employees ?? []) {
        for (const t of emp.completed_tests ?? []) {
          if (t && hasData(t.thresholds)) expected++
        }
      }

      // Count matching rows in the DB
      const found = scalar(
        `SELECT COUNT(*) FROM tests WHERE packet_id = ? AND deleted_at IS NULL`,
        [packet.packet_id]
      ) ?? 0

      totalExpected += expected
      totalFound    += found

      results.push({
        filename:  f.name,
        packetId:  packet.packet_id,
        company:   packet.company?.name ?? '?',
        visitDate: packet.visit?.visit_date ?? '?',
        tech:      packet.tech?.tech_initials ?? '?',
        expected,
        found,
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

    const rows = results.map(r => {
      if (r.error) {
        return `<tr>
          <td colspan="5" style="color:var(--clr-subtle);font-size:0.8125rem">${esc(r.filename)}</td>
          <td colspan="2" style="color:var(--clr-danger)">${esc(r.error)}</td>
        </tr>`
      }
      const diff   = r.found - r.expected
      let statusHtml
      if (diff === 0) {
        statusHtml = `<span class="badge badge-green">✓ Match</span>`
      } else if (diff < 0) {
        statusHtml = `<span class="badge badge-red">Missing ${Math.abs(diff)}</span>`
      } else {
        statusHtml = `<span class="badge badge-yellow">+${diff} extra</span>`
      }
      return `<tr${diff !== 0 ? ' style="background:var(--clr-warning-bg)"' : ''}>
        <td>${esc(r.company)}</td>
        <td>${esc(r.visitDate)}</td>
        <td style="font-size:0.75rem;color:var(--clr-subtle)">${esc(r.tech)}</td>
        <td style="text-align:right">${r.expected}</td>
        <td style="text-align:right">${r.found}</td>
        <td>${statusHtml}</td>
      </tr>`
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
                  <td colspan="3">Total</td>
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

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
