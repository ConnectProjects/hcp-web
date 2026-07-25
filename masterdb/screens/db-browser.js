import { query, run, queryOne } from '../db/sqlite.js'
import { JsonDatabase } from '../../shared/fs/json-database.js'

const PAGE_SIZE = 200

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderDbBrowser(container, state, navigate) {
  const tables = query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)

  let activeTable = null
  let currentPage = 0
  let totalRows   = 0

  container.innerHTML = `
    <div class="screen-header">
      <h1>DB Browser</h1>
    </div>
    <div style="display:flex;height:calc(100vh - 110px);overflow:hidden;gap:0">

      <!-- Table list -->
      <div style="width:170px;min-width:130px;border-right:1px solid #ddd;overflow-y:auto;
                  background:#f8f8f8;padding:6px 0;flex-shrink:0">
        ${tables.map(t => `
          <button class="dbb-tbl" data-table="${esc(t.name)}"
            style="display:block;width:100%;text-align:left;padding:6px 14px;border:none;
                   background:none;cursor:pointer;font-size:12px;font-family:monospace;color:#333;
                   white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${esc(t.name)}
          </button>
        `).join('')}
      </div>

      <!-- Right panel -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:10px;gap:6px;min-width:0">

        <!-- SQL bar -->
        <div style="display:flex;gap:6px;align-items:flex-start">
          <textarea id="dbb-sql" spellcheck="false"
            style="flex:1;height:72px;font-family:monospace;font-size:12px;padding:7px;
                   border:1px solid #ccc;border-radius:4px;resize:vertical;min-width:0"
            placeholder="SELECT * FROM companies LIMIT 50"></textarea>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="btn btn-primary btn-sm" id="dbb-run">▶ Run</button>
            <button class="btn btn-outline btn-sm" id="dbb-push">☁ Sync</button>
            <button class="btn btn-ghost btn-sm" id="dbb-csv">⬇ CSV</button>
          </div>
        </div>

        <!-- Status -->
        <div id="dbb-status" style="font-size:11px;color:#666;min-height:16px"></div>

        <!-- Grid -->
        <div id="dbb-grid" style="flex:1;overflow:auto;border:1px solid #e0e0e0;border-radius:4px;background:#fff"></div>

        <!-- Pager -->
        <div id="dbb-pager" style="display:flex;gap:8px;align-items:center;font-size:12px;min-height:28px"></div>
      </div>
    </div>
  `

  const sqlEl    = container.querySelector('#dbb-sql')
  const statusEl = container.querySelector('#dbb-status')
  const gridEl   = container.querySelector('#dbb-grid')
  const pagerEl  = container.querySelector('#dbb-pager')

  function status(msg, color = '#666') {
    statusEl.innerHTML = `<span style="color:${color}">${msg}</span>`
  }

  function renderGrid(cols, rows, editTable = null) {
    if (!rows.length) {
      gridEl.innerHTML = '<p style="padding:14px;color:#888;font-size:13px">No rows.</p>'
      return
    }
    const displayCols = cols.filter(c => c !== 'rowid')
    gridEl.innerHTML = `
      <table style="border-collapse:collapse;font-size:12px;font-family:monospace;width:100%">
        <thead style="position:sticky;top:0;z-index:1;background:#f0f4f8">
          <tr>
            ${editTable ? '<th style="width:24px;padding:4px 2px"></th>' : ''}
            ${displayCols.map(c =>
              `<th style="padding:5px 10px;text-align:left;border-bottom:2px solid #d0d7de;
                          white-space:nowrap;font-weight:600;font-size:11px;color:#444">${esc(c)}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, ri) => `
            <tr style="${ri % 2 === 0 ? '' : 'background:#fafafa'}">
              ${editTable ? `
                <td style="padding:0 4px;text-align:center">
                  <button class="dbb-del" data-rowid="${esc(String(row.rowid ?? ''))}"
                    title="Delete row"
                    style="border:none;background:none;cursor:pointer;color:#c00;
                           font-size:12px;padding:2px 3px;line-height:1">✕</button>
                </td>` : ''}
              ${displayCols.map(c => {
                const val = String(row[c] ?? '')
                return `<td class="${editTable ? 'dbb-cell' : ''}"
                    data-col="${esc(c)}"
                    data-rowid="${esc(String(row.rowid ?? ''))}"
                    data-val="${esc(val)}"
                    title="${esc(val)}"
                    style="padding:4px 10px;border-bottom:1px solid #f0f0f0;
                           max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                           cursor:${editTable ? 'text' : 'default'}"
                    >${esc(val)}</td>`
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `

    if (!editTable) return

    // Inline cell editing (double-click)
    gridEl.querySelectorAll('.dbb-cell').forEach(td => {
      td.addEventListener('dblclick', () => {
        if (td.querySelector('input')) return
        const orig  = td.dataset.val
        const col   = td.dataset.col
        const rowid = td.dataset.rowid
        td.innerHTML = `<input type="text" value="${esc(orig)}"
          style="width:100%;font-family:monospace;font-size:12px;border:1px solid #4a90d9;
                 border-radius:2px;padding:2px 4px;box-sizing:border-box">`
        const inp = td.querySelector('input')
        inp.focus(); inp.select()

        const commit = () => {
          const newVal = inp.value
          if (newVal === orig) { td.textContent = orig; td.dataset.val = orig; return }
          try {
            run(`UPDATE "${editTable}" SET "${col}" = ? WHERE rowid = ?`, [newVal, rowid])
            td.textContent  = newVal
            td.title        = newVal
            td.dataset.val  = newVal
            status(`✓ Updated ${editTable}.${col} (rowid ${rowid})`, 'green')
          } catch (e) {
            td.textContent = orig
            status(`Error: ${e.message}`, '#c00')
          }
        }
        inp.addEventListener('blur',    commit)
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter')  { e.preventDefault(); inp.blur() }
          if (e.key === 'Escape') { td.textContent = orig; td.dataset.val = orig }
        })
      })
    })

    // Delete row
    gridEl.querySelectorAll('.dbb-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowid = btn.dataset.rowid
        if (!confirm(`Delete row (rowid ${rowid}) from ${editTable}?`)) return
        try {
          run(`DELETE FROM "${editTable}" WHERE rowid = ?`, [rowid])
          btn.closest('tr').remove()
          totalRows--
          status(`✓ Deleted rowid ${rowid} from ${editTable}`, 'green')
        } catch (e) {
          status(`Error: ${e.message}`, '#c00')
        }
      })
    })
  }

  function renderPager(tableName, page, total) {
    const pages = Math.ceil(total / PAGE_SIZE)
    if (pages <= 1) { pagerEl.innerHTML = ''; return }
    pagerEl.innerHTML = `
      <button class="btn btn-outline btn-sm" id="dbb-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
      <span style="color:#555">Page ${page + 1} of ${pages}</span>
      <button class="btn btn-outline btn-sm" id="dbb-next" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>
    `
    pagerEl.querySelector('#dbb-prev')?.addEventListener('click', () => loadTable(tableName, page - 1))
    pagerEl.querySelector('#dbb-next')?.addEventListener('click', () => loadTable(tableName, page + 1))
  }

  function loadTable(tableName, page = 0) {
    activeTable  = tableName
    currentPage  = page
    const offset = page * PAGE_SIZE

    container.querySelectorAll('.dbb-tbl').forEach(b => {
      const active = b.dataset.table === tableName
      b.style.background = active ? '#e0eaff' : 'none'
      b.style.fontWeight = active ? '600' : 'normal'
      b.style.color      = active ? '#1a4cc0' : '#333'
    })

    const countRow = queryOne(`SELECT COUNT(*) AS n FROM "${tableName}"`)
    totalRows = countRow?.n ?? 0

    const rows = query(`SELECT rowid, * FROM "${tableName}" LIMIT ? OFFSET ?`, [PAGE_SIZE, offset])
    const cols = rows.length ? Object.keys(rows[0]) : ['rowid']

    sqlEl.value = `SELECT * FROM "${tableName}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`
    renderGrid(cols, rows, tableName)
    renderPager(tableName, page, totalRows)

    const from = offset + 1
    const to   = Math.min(offset + PAGE_SIZE, totalRows)
    status(totalRows > PAGE_SIZE
      ? `${tableName} — ${totalRows.toLocaleString()} rows · showing ${from}–${to} · double-click a cell to edit`
      : `${tableName} — ${totalRows.toLocaleString()} row${totalRows !== 1 ? 's' : ''} · double-click a cell to edit`)
  }

  // Table list clicks
  container.querySelectorAll('.dbb-tbl').forEach(btn => {
    btn.addEventListener('click', () => loadTable(btn.dataset.table))
  })

  // Run SQL
  container.querySelector('#dbb-run').addEventListener('click', () => {
    const sql = sqlEl.value.trim()
    if (!sql) return
    pagerEl.innerHTML = ''
    try {
      if (/^\s*SELECT/i.test(sql)) {
        const rows = query(sql)
        const cols = rows.length ? Object.keys(rows[0]) : []
        renderGrid(cols, rows, null)
        status(`${rows.length.toLocaleString()} row${rows.length !== 1 ? 's' : ''}`)
      } else {
        run(sql)
        status('✓ Executed.', 'green')
        if (activeTable) loadTable(activeTable, currentPage)
      }
    } catch (e) {
      status(`Error: ${e.message}`, '#c00')
    }
  })

  // Sync to Cloud
  container.querySelector('#dbb-push').addEventListener('click', async () => {
    if (!state.syncFolder) { status('Not connected to OneDrive — go to Settings to connect.', '#c00'); return }
    const btn = container.querySelector('#dbb-push')
    btn.disabled = true; btn.textContent = '…'
    try {
      await JsonDatabase.pushMaster(state.syncFolder, query)
      status('✓ Pushed to OneDrive. Changes are live.', 'green')
    } catch (e) {
      status(`Push failed: ${e.message}`, '#c00')
    } finally {
      btn.disabled = false; btn.textContent = '☁ Sync'
    }
  })

  // Export CSV
  container.querySelector('#dbb-csv').addEventListener('click', () => {
    const tbl = gridEl.querySelector('table')
    if (!tbl) { status('Nothing to export.', '#888'); return }
    const headers  = [...tbl.querySelectorAll('thead th')].map(th => th.textContent.trim()).filter(Boolean)
    const dataRows = [...tbl.querySelectorAll('tbody tr')].map(tr =>
      [...tr.querySelectorAll('td.dbb-cell, td:not(.dbb-del)')].map(td =>
        `"${(td.dataset.val ?? td.textContent.trim()).replace(/"/g, '""')}"`
      )
    )
    const csv = [headers.map(h => `"${h}"`), ...dataRows].map(r => r.join(',')).join('\n')
    const a   = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `${activeTable ?? 'query'}-${new Date().toISOString().slice(0, 10)}.csv`
    })
    a.click(); URL.revokeObjectURL(a.href)
    status(`✓ Exported ${activeTable ?? 'results'}.csv`)
  })

  // Load first table on open
  if (tables.length) loadTable(tables[0].name)
}
