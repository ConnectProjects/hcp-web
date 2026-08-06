/**
 * techtool2/screens/tt-inbox.js — TechTool packet inbox
 *
 * Lists packets queued for this tech (in their outbox folder on the shared
 * OneDrive drive). Each card shows company, location, visit date, and
 * how many workers have been tested. Clicking a card opens tt-test.
 */

import { query, listTechPackets, readTechPacket } from '../../masterdb2/db/db.js'

export function mount(container, { navigate, session }) {
  let _tech    = null   // { folder_name } from techs table
  let _packets = []     // [{ filename, packet, total, done, lastModified }]
  let _loading = true
  let _error   = null

  // Resolve this tech's OneDrive folder from the techs table
  try {
    const rows = query(
      `SELECT folder_name FROM techs WHERE name = ? AND active = 1 LIMIT 1`,
      [session.user?.name ?? '']
    )
    _tech = rows[0] ?? null
  } catch (e) {
    _error = e.message
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  async function load() {
    if (_error || !_tech?.folder_name) { render(); return }
    _loading = true
    render()

    try {
      const files = await listTechPackets(_tech.folder_name)
      const jsons = files.filter(f => f.kind === 'file' && f.name.endsWith('.json'))

      const rows = await Promise.all(jsons.map(async f => {
        try {
          const pkt   = await readTechPacket(_tech.folder_name, f.name)
          const total = pkt.employees?.length ?? 0
          const done  = pkt.employees?.filter(
            e => (e.completed_tests?.length ?? 0) > 0 || e.skipped_at
          ).length ?? 0
          return { filename: f.name, packet: pkt, total, done, lastModified: f.lastModified }
        } catch {
          return { filename: f.name, packet: null, total: 0, done: 0, badRead: true }
        }
      }))

      // Newest visit date first
      rows.sort((a, b) => {
        const da = a.packet?.visit?.visit_date ?? ''
        const db = b.packet?.visit?.visit_date ?? ''
        return db.localeCompare(da)
      })

      _packets = rows
      _loading = false
    } catch (e) {
      _error   = e.message
      _loading = false
    }
    render()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function render() {
    const techName = session.user?.name ?? ''

    if (_error) {
      container.innerHTML = `
        <div class="screen-header-row"><h1>Inbox</h1></div>
        <div class="screen-body">
          <div class="error-banner"><strong>Error:</strong> ${esc(_error)}</div>
        </div>`
      return
    }

    if (!_tech?.folder_name) {
      container.innerHTML = `
        <div class="screen-header-row"><h1>Inbox</h1></div>
        <div class="screen-body">
          <div class="warning-banner">
            No OneDrive folder is configured for your account.
            Ask your LC to set your folder name in Settings.
          </div>
        </div>`
      return
    }

    let bodyHTML
    if (_loading) {
      bodyHTML = `<div class="spinner"></div>`
    } else if (_packets.length === 0) {
      bodyHTML = `
        <div style="text-align:center;padding:4rem 1rem;color:var(--clr-subtle)">
          <div style="font-size:2.5rem;margin-bottom:0.75rem">✓</div>
          <div style="font-size:1rem;font-weight:500">Inbox is empty</div>
          <div style="font-size:0.875rem;margin-top:0.25rem">No packets waiting — you're all caught up.</div>
        </div>`
    } else {
      bodyHTML = _packets.map(p => packetCard(p)).join('')
    }

    container.innerHTML = `
      <div class="screen-header-row">
        <h1>Inbox</h1>
        <span class="screen-subtitle">${esc(techName)}</span>
        <button class="btn btn-secondary btn-sm" id="refresh-btn" style="margin-left:auto">↺ Refresh</button>
      </div>
      <div class="screen-body">${bodyHTML}</div>`

    container.querySelector('#refresh-btn')?.addEventListener('click', load)

    container.querySelectorAll('.packet-card[data-filename]').forEach(card => {
      card.addEventListener('click', () => {
        navigate('tt-test', { filename: card.dataset.filename, techFolder: _tech.folder_name })
      })
    })
  }

  // ── Packet card ─────────────────────────────────────────────────────────────

  function packetCard({ filename, packet, total, done, badRead }) {
    if (badRead || !packet) {
      return `
        <div class="packet-card packet-card-error">
          <div class="packet-company">${esc(filename)}</div>
          <div class="packet-loc" style="color:var(--clr-danger)">Could not read this packet file.</div>
        </div>`
    }

    const company = packet.company?.name ?? 'Unknown company'
    const locName = packet.location?.name ?? ''
    const city    = packet.location?.city ?? packet.location?.address ?? ''
    const prov    = packet.location?.province ?? packet.visit?.province ?? ''
    const locLine = [locName, city, prov].filter(Boolean).join(' · ')
    const date    = packet.visit?.visit_date ? fmtDate(packet.visit.visit_date) : '—'
    const notes   = packet.company?.sticky_notes?.trim()

    const isComplete = total > 0 && done >= total
    const inProgress = done > 0 && !isComplete

    let badge
    if (isComplete) {
      badge = `<span class="badge badge-green">Complete — ready to submit</span>`
    } else if (inProgress) {
      badge = `<span class="badge badge-blue">${done} of ${total} tested</span>`
    } else {
      badge = `<span class="badge badge-gray">${total} worker${total !== 1 ? 's' : ''}</span>`
    }

    return `
      <div class="packet-card" data-filename="${esc(filename)}">
        <div class="packet-header">
          <div>
            <div class="packet-company">${esc(company)}</div>
            ${locLine ? `<div class="packet-loc">${esc(locLine)}</div>` : ''}
          </div>
          <div class="packet-date">${esc(date)}</div>
        </div>
        ${notes ? `<div class="packet-note">${esc(notes)}</div>` : ''}
        <div class="packet-footer">${badge}</div>
      </div>`
  }

  load()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(d) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    })
  } catch { return d }
}
