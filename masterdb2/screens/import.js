/**
 * masterdb2/screens/import.js — exception-only review
 *
 * Clean packets are imported in the background by db/background-sync.js.
 * This screen shows only the visits that could not be imported automatically,
 * then runs the existing preview → decisions → commit → result flow.
 */

import { query, readPacket }                   from '../db/db.js'
import { previewImport, commitImport }         from '../db/import-packet.js'
import { getLastResult, subscribe, refreshNow } from '../db/background-sync.js'

export function mount(container, { navigate, session }) {
  // ── Module state ──────────────────────────────────────────────────────────
  let _folders    = new Map()   // tech name → folder name
  let _techFolder = null
  let _filename   = null
  let _packet     = null
  let _preview    = null
  let _decisions  = null        // { locationId?, employees: {} }
  let _locOpts    = []
  let _result     = null
  let _mode       = 'list'      // list | preview | result

  // ── Boot ──────────────────────────────────────────────────────────────────
  try {
    query(`SELECT name, folder_name FROM techs WHERE active = 1 AND folder_name IS NOT NULL`)
      .forEach(t => _folders.set(t.name, t.folder_name))
  } catch (e) {
    renderError(e.message)
    return
  }

  renderQueue(getLastResult())
  const unsubscribe = subscribe(result => {
    if (_mode === 'list') renderQueue(result)
  })
  return { unmount: unsubscribe }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderError(msg) {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Needs Review</h1></div>
      <div class="screen-body">
        <div class="error-banner"><strong>Error:</strong> ${esc(msg)}</div>
      </div>
    `
  }

  function renderQueue(result) {
    _mode = 'list'
    const items = (result?.results ?? []).filter(r => r.skipped || !r.ok)
    const checked = result?.at ? fmtTs(result.at) : null

    const rows = items.map((r, i) => `
      <tr>
        <td style="font-size:0.8125rem">${esc(r.company ?? '—')}</td>
        <td style="font-size:0.8125rem">${esc(r.tech ?? '—')}</td>
        <td style="font-size:0.8125rem">${esc(r.visitDate ?? '—')}</td>
        <td style="font-size:0.8125rem">${esc(r.reason ?? 'Import failed')}</td>
        <td><button class="btn btn-secondary btn-sm" data-review-index="${i}">Review</button></td>
      </tr>
    `).join('')

    container.innerHTML = `
      <div class="screen-header-row"><h1>Needs Review</h1></div>
      <div class="screen-body">
        <p style="margin:0 0 1rem;color:var(--clr-subtle)">
          Completed visits import automatically. These need a decision before they can be saved.
          ${checked ? `Last checked ${esc(checked)}.` : ''}
        </p>
        ${result?.error ? `<div class="warning-banner" style="margin-bottom:1rem">
          <strong>Auto-import is having trouble:</strong> ${esc(result.error)}
          <button class="btn btn-secondary btn-sm" id="retry-btn" style="margin-left:0.5rem">Retry</button>
        </div>` : ''}
        <div id="inbox-area">
          ${items.length ? `
            <div class="table-card">
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Company</th><th>Tech</th><th>Visit</th><th>Why</th><th></th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>` : `
            <div class="table-card"><div class="table-empty">
              No visits need review right now.
            </div></div>`}
        </div>
      </div>
    `

    container.querySelector('#retry-btn')?.addEventListener('click', () => refreshNow())
    container.querySelectorAll('[data-review-index]').forEach(btn =>
      btn.addEventListener('click', () => {
        const item = items[Number(btn.dataset.reviewIndex)]
        const folder = _folders.get(item?.tech)
        if (!folder) {
          renderError(`No OneDrive folder is configured for ${item?.tech ?? 'that tech'}.`)
          return
        }
        _techFolder = folder
        loadPreview(item.filename)
      })
    )
  }

  async function loadPreview(filename) {
    _mode = 'preview'
    _filename = filename
    const area = container.querySelector('#inbox-area')
    area.innerHTML = `<div class="spinner"></div><p class="status-text">Analysing ${esc(filename)}…</p>`

    try {
      _packet  = await readPacket(_techFolder, filename)
      _preview = previewImport(_packet)
    } catch (e) {
      area.innerHTML = `
        <button class="back-link" id="back-inbox">&larr; Back to review list</button>
        <div class="error-banner" style="margin:1rem 0"><strong>Preview failed:</strong> ${esc(e.message)}</div>
      `
      area.querySelector('#back-inbox').addEventListener('click', () => renderQueue(getLastResult()))
      return
    }

    // Build initial decisions (auto-populate resolved matches)
    _decisions = { employees: {} }
    for (const { packetEmp, match } of _preview.employees) {
      const key = String(packetEmp.employee_id)
      if (match.type === 'new') {
        _decisions.employees[key] = { action: 'create_new' }
      } else if (match.employee && !match.needsConfirmation) {
        _decisions.employees[key] = { action: 'use_existing', employeeId: match.employee.employee_id }
      }
    }

    // Pre-load location options if unknown
    _locOpts = []
    if (_preview.location.status === 'unknown' && _preview.company.id) {
      _locOpts = query(
        `SELECT location_id, name, city, province FROM locations WHERE company_id = ? AND active = 1 ORDER BY name`,
        [_preview.company.id]
      )
    }

    renderPreview()
  }

  function renderPreview() {
    const p   = _preview
    const d   = _decisions
    const area = container.querySelector('#inbox-area')

    // ── Location bar ──
    let locBar
    if (p.location.status === 'resolved') {
      const l = p.location.row
      locBar = `<div class="info-card" style="display:flex;align-items:center;gap:0.75rem">
        <span class="badge badge-green">Location resolved</span>
        <span>${esc(l.name)}${l.city ? `, ${esc(l.city)}` : ''}${l.province ? ` (${esc(l.province)})` : ''}</span>
      </div>`
    } else if (_locOpts.length) {
      const opts = _locOpts.map(l =>
        `<option value="${l.location_id}"${d.locationId === l.location_id ? ' selected' : ''}>
          ${esc(l.name)}${l.city ? `, ${esc(l.city)}` : ''}
        </option>`
      ).join('')
      locBar = `<div class="warning-banner" style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
        <span>Location <strong>${esc(p.location.packetLocationName ?? '?')}</strong> not found — assign:</span>
        <select class="form-select" id="loc-picker">
          <option value="">Select location…</option>${opts}
        </select>
      </div>`
    } else {
      locBar = `<div class="error-banner">
        Location <strong>${esc(p.location.packetLocationName ?? '?')}</strong> not found and no locations exist for this company.
        Add the location in the Companies screen first.
      </div>`
    }

    // ── Employee table ──
    const empRows = p.employees.map(({ packetEmp, match, completedTests }) => {
      const key      = String(packetEmp.employee_id)
      const decided  = d.employees[key]
      const tests    = completedTests.filter(t => !t.isEmpty)
      const dups     = completedTests.filter(t => t.isDuplicate).length
      const bls      = completedTests.filter(t => t.wouldBaseline).length

      const matchBadge = {
        exact_uid: '<span class="badge badge-green">UID</span>',
        exact_id:  '<span class="badge badge-green">ID</span>',
        strong:    '<span class="badge badge-blue">Strong</span>',
        weak:      '<span class="badge badge-yellow">Weak</span>',
        new:       '<span class="badge badge-gray">New</span>',
      }[match.type] ?? ''

      let nameCell = `${esc(packetEmp.last_name ?? '')}, ${esc(packetEmp.first_name ?? '')}`
      if (match.employee && decided?.action === 'use_existing') {
        nameCell += `<br><span style="font-size:0.75rem;color:var(--clr-subtle)">→ ${esc(match.employee.last_name)}, ${esc(match.employee.first_name)}</span>`
      } else if (decided?.action === 'create_new' && match.type !== 'new') {
        nameCell += `<br><span style="font-size:0.75rem;color:var(--clr-subtle)">→ Create new person</span>`
      }

      const blCell = bls > 0 ? `<span class="badge badge-blue">Baseline</span>` : ''
      const dupCell = dups > 0 ? `<span style="color:var(--clr-subtle)">${dups} dup</span>` : ''

      return `<tr>
        <td>${nameCell}</td>
        <td>${matchBadge}</td>
        <td style="text-align:right">${tests.length}</td>
        <td>${dupCell}</td>
        <td>${blCell}</td>
      </tr>`
    }).join('') || `<tr><td colspan="5" class="table-empty">No employees with tests.</td></tr>`

    // ── Confirm boxes ──
    const needsConfirm = p.employees.filter(e => e.match.needsConfirmation && !d.employees[String(e.packetEmp.employee_id)])
    const confirmHTML = needsConfirm.map(({ packetEmp, match }) => {
      const key = String(packetEmp.employee_id)
      const cand = match.employee
      return `<div class="confirm-box" data-key="${esc(key)}">
        <strong>Confirm match:</strong> ${esc(packetEmp.last_name)}, ${esc(packetEmp.first_name)}
        ${packetEmp.dob ? `(${esc(packetEmp.dob)})` : ''}
        <br>
        Best candidate: <strong>${esc(cand?.last_name ?? '?')}, ${esc(cand?.first_name ?? '?')}</strong>
        ${cand?.dob ? `(${esc(cand.dob)})` : ''}
        — ${esc(match.reason ?? '')}
        <div class="confirm-actions">
          <button class="btn btn-secondary" data-confirm-key="${esc(key)}" data-action="use">
            Use this person
          </button>
          <button class="btn btn-secondary" data-confirm-key="${esc(key)}" data-action="new">
            Create as new person
          </button>
        </div>
      </div>`
    }).join('')

    // ── Counts bar ──
    const c = p.counts
    const countsBar = `
      <div class="import-counts">
        ${countItem(c.toImport,   'To Import')}
        ${countItem(c.duplicates, 'Duplicates')}
        ${countItem(c.empty,      'Empty Tests')}
        ${countItem(c.newPersons, 'New Workers')}
        ${countItem(c.unconfirmed,'Need Confirm')}
      </div>
    `

    // ── Warnings ──
    const warnHTML = p.warnings.length
      ? `<div class="warning-banner" style="margin-bottom:1rem">
           ${p.warnings.map(w => `<div>${esc(w)}</div>`).join('')}
         </div>`
      : ''

    // ── Ready check ──
    const locReady  = p.location.status === 'resolved' || d.locationId != null
    const allDecided = p.employees.every(e =>
      !e.match.needsConfirmation || d.employees[String(e.packetEmp.employee_id)]
    )
    const canCommit = locReady && allDecided
    const companyOk = !!p.company.id

    area.innerHTML = `
      <button class="back-link" id="back-inbox">&larr; Back to inbox</button>
      <div style="margin:0.75rem 0">
        <strong>${esc(p.company.name ?? 'Unknown company')}</strong>
        &nbsp;&mdash;&nbsp;
        ${p.visitDate ? fmtDate(p.visitDate) : 'No date'}
        &nbsp;&mdash;&nbsp;
        <span style="color:var(--clr-subtle)">${esc(_filename)}</span>
      </div>
      ${warnHTML}
      ${locBar}
      ${countsBar}
      ${needsConfirm.length ? `<div id="confirm-section" style="margin-bottom:1rem">${confirmHTML}</div>` : ''}
      <div class="table-card" style="margin-bottom:1.25rem">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Match</th>
                <th style="text-align:right">Tests</th>
                <th>Dups</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>${empRows}</tbody>
          </table>
        </div>
      </div>
      ${!companyOk ? `<div class="error-banner" style="margin-bottom:1rem">Company not found in DB — cannot import.</div>` : ''}
      <div style="display:flex;gap:0.75rem">
        <button class="btn btn-primary" id="commit-btn" ${canCommit && companyOk ? '' : 'disabled'}>
          Commit Import
        </button>
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
      </div>
    `

    // ── Events ──
    area.querySelector('#back-inbox').addEventListener('click', () => renderQueue(getLastResult()))
    area.querySelector('#cancel-btn').addEventListener('click', () => renderQueue(getLastResult()))

    area.querySelector('#loc-picker')?.addEventListener('change', e => {
      const val = Number(e.target.value)
      _decisions.locationId = val || undefined
      renderPreview()
    })

    area.querySelectorAll('[data-confirm-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.confirmKey
        const match = p.employees.find(e => String(e.packetEmp.employee_id) === key)?.match
        if (btn.dataset.action === 'use' && match?.employee) {
          _decisions.employees[key] = { action: 'use_existing', employeeId: match.employee.employee_id }
        } else {
          _decisions.employees[key] = { action: 'create_new' }
        }
        renderPreview()
      })
    })

    area.querySelector('#commit-btn')?.addEventListener('click', runCommit)
  }

  async function runCommit() {
    const area = container.querySelector('#inbox-area')
    area.innerHTML = `<div class="spinner"></div><p class="status-text">Importing…</p>`
    try {
      _result = await commitImport(_packet, _decisions, session.writerName, {
        techFolder: _techFolder,
        filename:   _filename,
      })
      renderResult()
    } catch (e) {
      const msg = e?.message || e?.toString() || 'Unknown error'
      area.innerHTML = `
        <button class="back-link" id="back-preview">&larr; Back to preview</button>
        <div class="error-banner" style="margin:1rem 0">
          <strong>Import failed:</strong> ${esc(msg)}
        </div>
      `
      area.querySelector('#back-preview').addEventListener('click', renderPreview)
    }
  }

  function renderResult() {
    _mode = 'result'
    const r    = _result
    const area = container.querySelector('#inbox-area')
    area.innerHTML = `
      <div class="success-banner">
        <strong>Import complete</strong>
        ${r.imported} test${r.imported !== 1 ? 's' : ''} imported
        &mdash; ${r.newPersons} new worker${r.newPersons !== 1 ? 's' : ''} created
        &mdash; ${r.duplicates} duplicate${r.duplicates !== 1 ? 's' : ''} skipped.
      </div>
      ${r.backupFile ? `<p style="font-size:0.8rem;color:var(--clr-subtle);margin-bottom:1rem">A recovery snapshot was saved before this import.</p>` : ''}
      ${r.archiveWarning ? `<div class="warning-banner" style="margin-bottom:1rem">Results were saved, but cleanup of the completed visit failed (${esc(r.archiveWarning)}). No action needed right now.</div>` : ''}
      ${r.wsbcCsv ? `
        <div class="warning-banner" style="margin-bottom:1rem;border-color:var(--clr-warning,#f59e0b)">
          <strong>WorkSafeBC submission required</strong><br>
          This was a BC location — you must submit the test data to the WSBC portal as soon as possible.
          Download the file below and upload it at
          <a href="https://www.worksafebc.com/en/health-safety/occupational-disease/hearing-loss/hearing-testing-portal"
             target="_blank" rel="noopener">worksafebc.com → Hearing Testing Portal</a>.
          <div style="margin-top:0.75rem">
            <button class="btn btn-primary" id="wsbc-dl-btn">Download WSBC File_Upload CSV</button>
          </div>
        </div>` : ''}
      <div style="display:flex;gap:0.75rem">
        <button class="btn btn-primary"   id="another-btn">Import Another</button>
        <button class="btn btn-secondary" id="companies-btn">Go to Companies</button>
      </div>
    `
    if (r.wsbcCsv) {
      area.querySelector('#wsbc-dl-btn').addEventListener('click', () => {
        triggerCsvDownload(r.wsbcCsv.csv, r.wsbcCsv.filename)
      })
    }
    area.querySelector('#another-btn').addEventListener('click', () => {
      _filename = null; _packet = null; _preview = null; _decisions = null; _result = null
      refreshNow()
      renderQueue(getLastResult())
    })
    area.querySelector('#companies-btn').addEventListener('click', () => navigate('companies'))
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function countItem(n, label) {
    return `<div class="import-count"><span class="num">${n}</span><span class="lbl">${label}</span></div>`
  }
}

function triggerCsvDownload(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-CA') } catch { return d }
}

function fmtTs(ts) {
  try { return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
