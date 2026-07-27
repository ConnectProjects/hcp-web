import { query, run, queryOne } from '../db/sqlite.js'
import { JsonDatabase } from '../../shared/fs/json-database.js'

const PAGE_SIZE = 200

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const PRESETS = [
  {
    label: '⚠ Tests in Inactive Locations',
    sql:
`SELECT l.name AS location, e.first_name, e.last_name,
  t.test_date, t.packet_id, t.test_id
FROM tests t
JOIN employees e ON e.employee_id = t.employee_id
JOIN locations l ON l.location_id = e.location_id
WHERE l.active = 0
ORDER BY l.name, t.test_date DESC`
  },
  {
    label: '⚠ Employees in Inactive Locations',
    sql:
`SELECT l.name AS location, e.employee_id,
  e.first_name, e.last_name
FROM employees e
JOIN locations l ON l.location_id = e.location_id
WHERE l.active = 0
ORDER BY l.name, e.last_name`
  },
  {
    label: '📍 All Locations',
    sql:
`SELECT l.location_id, l.name, l.active,
  c.name AS company,
  COUNT(e.employee_id) AS employees
FROM locations l
JOIN companies c ON c.company_id = l.company_id
LEFT JOIN employees e ON e.location_id = l.location_id
GROUP BY l.location_id
ORDER BY c.name, l.active DESC, l.name`
  },
  {
    label: '🔧 Fix SK-suffix Locations',
    sql:
`-- This moves employees and tests from inactive ", SK" locations
-- to their correct active counterparts (e.g. "#711 North Battleford, SK" → "#711 North Battleford").
-- Review the SELECT below first, then delete it and click Run for each UPDATE.

-- Step 1 – preview the mapping:
SELECT bad.name AS wrong_location, good.name AS correct_location,
  bad.location_id AS wrong_id, good.location_id AS correct_id
FROM locations bad
JOIN locations good
  ON good.company_id = bad.company_id
  AND good.active = 1
  AND TRIM(good.name) = TRIM(REPLACE(bad.name, ', SK', ''))
WHERE bad.active = 0 AND bad.name LIKE '%, SK'

-- Step 2 – move employees (delete the SELECT above, run this):
-- UPDATE employees
-- SET location_id = (
--   SELECT good.location_id FROM locations bad
--   JOIN locations good ON good.company_id = bad.company_id
--     AND good.active = 1
--     AND TRIM(good.name) = TRIM(REPLACE(bad.name, ', SK', ''))
--   WHERE bad.location_id = employees.location_id AND bad.active = 0
-- )
-- WHERE location_id IN (
--   SELECT location_id FROM locations WHERE active = 0 AND name LIKE '%, SK'
-- )

-- Step 3 – move tests (run this next):
-- UPDATE tests
-- SET location_id = (
--   SELECT good.location_id FROM locations bad
--   JOIN locations good ON good.company_id = bad.company_id
--     AND good.active = 1
--     AND TRIM(good.name) = TRIM(REPLACE(bad.name, ', SK', ''))
--   WHERE bad.location_id = tests.location_id AND bad.active = 0
-- )
-- WHERE location_id IN (
--   SELECT location_id FROM locations WHERE active = 0 AND name LIKE '%, SK'
-- )

-- Step 4 – click ☁ Sync to push changes to OneDrive.`
  }
]

export function renderDbBrowser(container, state, navigate) {
  const tables = query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )

  // Row counts for sidebar
  const counts = {}
  for (const t of tables) {
    counts[t.name] = queryOne(`SELECT COUNT(*) AS n FROM "${t.name}"`)?.n ?? 0
  }

  let activeTable = null
  let currentPage = 0
  let totalRows   = 0
  let allRows     = []     // full page loaded from DB
  let displayCols = []
  let editTable   = null
  let sortCol     = null
  let sortAsc     = true

  container.innerHTML = `
    <div class="screen-header"><h1>DB Browser</h1></div>
    <div style="display:flex;height:calc(100vh - 110px);overflow:hidden">

      <!-- Sidebar -->
      <div style="width:190px;min-width:140px;border-right:1px solid #ddd;overflow-y:auto;
                  background:#f8f8f8;padding:6px 0;flex-shrink:0">
        <div style="padding:5px 14px 3px;font-size:10px;font-weight:700;color:#999;
                    letter-spacing:.06em;text-transform:uppercase">Tables</div>
        ${tables.map(t => `
          <button class="dbb-tbl" data-table="${esc(t.name)}"
            style="display:flex;justify-content:space-between;align-items:center;
                   width:100%;padding:6px 10px 6px 14px;border:none;background:none;
                   cursor:pointer;font-size:12px;font-family:monospace;color:#333;gap:6px;
                   text-align:left">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span>
            <span class="dbb-count" style="font-size:10px;color:#888;background:#e4e4e4;
                   border-radius:9px;padding:1px 6px;flex-shrink:0">${counts[t.name]}</span>
          </button>
        `).join('')}
      </div>

      <!-- Main panel -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:10px;gap:6px;min-width:0">

        <!-- Presets -->
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${PRESETS.map((p, i) => `
            <button class="btn btn-outline btn-sm dbb-preset" data-idx="${i}"
              style="font-size:11px">${esc(p.label)}</button>
          `).join('')}
        </div>

        <!-- SQL editor row -->
        <div style="display:flex;gap:6px;align-items:flex-start">
          <textarea id="dbb-sql" spellcheck="false"
            style="flex:1;height:70px;font-family:monospace;font-size:12px;padding:7px;
                   border:1px solid #ccc;border-radius:4px;resize:vertical;min-width:0"
            placeholder="SELECT * FROM companies LIMIT 50"></textarea>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="btn btn-primary btn-sm" id="dbb-run">▶ Run</button>
            <button class="btn btn-outline btn-sm" id="dbb-push">☁ Sync</button>
            <button class="btn btn-ghost btn-sm" id="dbb-csv">⬇ CSV</button>
          </div>
        </div>

        <!-- Search + status -->
        <div style="display:flex;gap:8px;align-items:center">
          <input id="dbb-search" type="search" placeholder="Filter rows by keyword…"
            style="width:240px;padding:4px 8px;font-size:12px;
                   border:1px solid #ccc;border-radius:4px">
          <div id="dbb-status" style="font-size:11px;color:#666;flex:1"></div>
        </div>

        <!-- Grid -->
        <div id="dbb-grid"
          style="flex:1;overflow:auto;border:1px solid #e0e0e0;border-radius:4px;background:#fff"></div>

        <!-- Pager -->
        <div id="dbb-pager" style="display:flex;gap:8px;align-items:center;font-size:12px;min-height:26px"></div>
      </div>
    </div>
  `

  const sqlEl    = container.querySelector('#dbb-sql')
  const statusEl = container.querySelector('#dbb-status')
  const gridEl   = container.querySelector('#dbb-grid')
  const pagerEl  = container.querySelector('#dbb-pager')
  const searchEl = container.querySelector('#dbb-search')

  function status(msg, color = '#666') {
    statusEl.innerHTML = `<span style="color:${color}">${msg}</span>`
  }

  function filteredRows() {
    const term = searchEl.value.trim().toLowerCase()
    if (!term) return allRows
    return allRows.filter(r =>
      Object.values(r).some(v => String(v ?? '').toLowerCase().includes(term))
    )
  }

  function sortedRows(rows) {
    if (!sortCol) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      const na = Number(av), nb = Number(bv)
      const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
  }

  function setRows(cols, rows, tbl) {
    allRows     = rows
    displayCols = cols.filter(c => c !== 'rowid')
    editTable   = tbl
    applyView()
  }

  function applyView() {
    const term = searchEl.value.trim()
    const rows = sortedRows(filteredRows())
    paintGrid(displayCols, rows, editTable)
    const n = allRows.length, shown = rows.length
    status(
      term ? `${shown} of ${n} rows match "${term}"` : `${n.toLocaleString()} row${n !== 1 ? 's' : ''}`,
      '#555'
    )
    if (editTable && !term) statusEl.innerHTML += ' &nbsp;·&nbsp; <span style="color:#888">double-click a cell to edit</span>'
  }

  function paintGrid(cols, rows, tbl) {
    if (!rows.length) {
      gridEl.innerHTML = '<p style="padding:16px;color:#888;font-size:13px">No rows.</p>'
      return
    }
    gridEl.innerHTML = `
      <table style="border-collapse:collapse;font-size:12px;font-family:monospace;width:100%">
        <thead style="position:sticky;top:0;z-index:1;background:#eef2f7">
          <tr>
            ${tbl ? '<th style="width:26px"></th>' : ''}
            ${cols.map(c => {
              const arrow = c === sortCol ? (sortAsc ? ' ▲' : ' ▼') : ''
              return `<th class="dbb-th" data-col="${esc(c)}"
                style="padding:5px 10px;text-align:left;border-bottom:2px solid #c8d4e3;
                       white-space:nowrap;font-size:11px;font-weight:700;color:#445;
                       cursor:pointer;user-select:none" title="Click to sort"
                >${esc(c)}${arrow}</th>`
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, ri) => `
            <tr style="${ri % 2 ? 'background:#fafafa' : ''}">
              ${tbl ? `<td style="padding:0 2px;text-align:center">
                <button class="dbb-del" data-rowid="${esc(String(row.rowid ?? ''))}"
                  style="border:none;background:none;cursor:pointer;color:#b00;
                         font-size:12px;padding:2px 5px;line-height:1" title="Delete row">✕</button>
              </td>` : ''}
              ${cols.map(c => {
                const val = String(row[c] ?? '')
                return `<td class="${tbl ? 'dbb-cell' : ''}"
                  data-col="${esc(c)}" data-rowid="${esc(String(row.rowid ?? ''))}"
                  data-val="${esc(val)}" title="${esc(val)}"
                  style="padding:4px 10px;border-bottom:1px solid #f0f0f0;max-width:300px;
                         overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                         cursor:${tbl ? 'text' : 'default'}">${esc(val)}</td>`
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `

    // Column sort
    gridEl.querySelectorAll('.dbb-th').forEach(th =>
      th.addEventListener('click', () => {
        const col = th.dataset.col
        if (sortCol === col) sortAsc = !sortAsc
        else { sortCol = col; sortAsc = true }
        if (tbl) loadTable(tbl, 0)   // re-query DB with ORDER BY from page 1
        else applyView()              // custom SQL: client-side sort is fine (smaller result set)
      })
    )

    if (!tbl) return

    // Inline cell editing
    gridEl.querySelectorAll('.dbb-cell').forEach(td =>
      td.addEventListener('dblclick', () => {
        if (td.querySelector('input')) return
        const orig = td.dataset.val, col = td.dataset.col, rowid = td.dataset.rowid
        td.innerHTML = `<input type="text" value="${esc(orig)}"
          style="width:100%;font-family:monospace;font-size:12px;padding:2px 4px;
                 border:1px solid #4a90d9;border-radius:2px;box-sizing:border-box">`
        const inp = td.querySelector('input')
        inp.focus(); inp.select()
        const commit = () => {
          const v = inp.value
          if (v === orig) { td.textContent = orig; td.dataset.val = orig; return }
          try {
            run(`UPDATE "${tbl}" SET "${col}" = ? WHERE rowid = ?`, [v, rowid])
            td.textContent = v; td.title = v; td.dataset.val = v
            const r = allRows.find(r => String(r.rowid) === rowid)
            if (r) r[col] = v
            status(`✓ Updated ${tbl}.${col}`, 'green')
          } catch (e) {
            td.textContent = orig; td.dataset.val = orig
            status(`Error: ${e.message}`, '#c00')
          }
        }
        inp.addEventListener('blur', commit)
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter')  { e.preventDefault(); inp.blur() }
          if (e.key === 'Escape') { td.textContent = orig; td.dataset.val = orig }
        })
      })
    )

    // Delete row
    gridEl.querySelectorAll('.dbb-del').forEach(btn =>
      btn.addEventListener('click', () => {
        const rowid = btn.dataset.rowid
        if (!confirm(`Delete this row from "${tbl}"?`)) return
        try {
          run(`DELETE FROM "${tbl}" WHERE rowid = ?`, [rowid])
          allRows = allRows.filter(r => String(r.rowid) !== rowid)
          const countEl = container.querySelector(`.dbb-tbl[data-table="${tbl}"] .dbb-count`)
          if (countEl) countEl.textContent = allRows.length
          btn.closest('tr').remove()
          status(`✓ Deleted row from ${tbl}`, 'green')
        } catch (e) { status(`Error: ${e.message}`, '#c00') }
      })
    )
  }

  function renderPager(tbl, page, total) {
    const pages = Math.ceil(total / PAGE_SIZE)
    if (pages <= 1) { pagerEl.innerHTML = ''; return }
    pagerEl.innerHTML = `
      <button class="btn btn-outline btn-sm" id="dbb-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
      <span style="color:#555">Page ${page + 1} / ${pages} &nbsp;(${total.toLocaleString()} rows total)</span>
      <button class="btn btn-outline btn-sm" id="dbb-next" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>
    `
    pagerEl.querySelector('#dbb-prev')?.addEventListener('click', () => loadTable(tbl, page - 1))
    pagerEl.querySelector('#dbb-next')?.addEventListener('click', () => loadTable(tbl, page + 1))
  }

  function loadTable(tbl, page = 0) {
    activeTable  = tbl
    currentPage  = page
    searchEl.value = ''
    pagerEl.innerHTML = ''

    const offset  = page * PAGE_SIZE
    const orderBy = sortCol ? `ORDER BY "${sortCol}" ${sortAsc ? 'ASC' : 'DESC'}` : ''

    container.querySelectorAll('.dbb-tbl').forEach(b => {
      const on = b.dataset.table === tbl
      b.style.background = on ? '#dce8ff' : 'none'
      b.style.fontWeight = on ? '700' : 'normal'
      b.style.color      = on ? '#1a4cc0' : '#333'
    })

    const countRow = queryOne(`SELECT COUNT(*) AS n FROM "${tbl}"`)
    totalRows = countRow?.n ?? 0

    const rows = query(`SELECT rowid, * FROM "${tbl}" ${orderBy} LIMIT ? OFFSET ?`, [PAGE_SIZE, offset])
    const cols = rows.length ? Object.keys(rows[0]) : []
    sqlEl.value = `SELECT * FROM "${tbl}" ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`.replace(/\s+/g, ' ').trim()
    setRows(cols, rows, tbl)
    renderPager(tbl, page, totalRows)
  }

  function execSql(sql) {
    pagerEl.innerHTML = ''
    sortCol = null; sortAsc = true; searchEl.value = ''
    try {
      if (/^\s*SELECT/i.test(sql)) {
        const rows = query(sql)
        const cols = rows.length ? Object.keys(rows[0]) : []
        setRows(cols, rows, null)
      } else {
        run(sql)
        status('✓ Executed.', 'green')
        if (activeTable) loadTable(activeTable, currentPage)
      }
    } catch (e) {
      status(`Error: ${e.message}`, '#c00')
      gridEl.innerHTML = ''
    }
  }

  // Preset buttons — auto-run SELECTs, load others for review
  container.querySelectorAll('.dbb-preset').forEach(btn =>
    btn.addEventListener('click', () => {
      const p = PRESETS[+btn.dataset.idx]
      sqlEl.value = p.sql
      if (/^\s*SELECT/i.test(p.sql)) {
        execSql(p.sql)
      } else {
        status('Query loaded. Review it, then click ▶ Run.', '#e67e22')
      }
    })
  )

  // Run button
  container.querySelector('#dbb-run').addEventListener('click', () => {
    const sql = sqlEl.value.trim()
    if (sql) execSql(sql)
  })

  // Search filter
  searchEl.addEventListener('input', applyView)

  // Sync to Cloud
  container.querySelector('#dbb-push').addEventListener('click', async () => {
    if (!state.syncFolder) { status('Not connected — go to Settings to connect OneDrive.', '#c00'); return }
    const btn = container.querySelector('#dbb-push')
    btn.disabled = true; btn.textContent = '…'
    try {
      await JsonDatabase.pushMaster(state.syncFolder, query)
      status('✓ Pushed to OneDrive — changes are live on all browsers.', 'green')
    } catch (e) {
      status(`Push failed: ${e.message}`, '#c00')
    } finally {
      btn.disabled = false; btn.textContent = '☁ Sync'
    }
  })

  // CSV export
  container.querySelector('#dbb-csv').addEventListener('click', () => {
    const rows = sortedRows(filteredRows())
    if (!rows.length) { status('Nothing to export.', '#888'); return }
    const cols = displayCols.length ? displayCols : Object.keys(rows[0]).filter(c => c !== 'rowid')
    const csv  = [
      cols.map(c => `"${c}"`).join(','),
      ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `${activeTable ?? 'query'}-${new Date().toISOString().slice(0, 10)}.csv`
    })
    a.click(); URL.revokeObjectURL(a.href)
    status(`✓ Exported ${rows.length} rows`)
  })

  // Table list clicks — reset sort when switching to a new table
  container.querySelectorAll('.dbb-tbl').forEach(btn =>
    btn.addEventListener('click', () => {
      sortCol = null; sortAsc = true
      loadTable(btn.dataset.table)
    })
  )

  // Load first table on open
  if (tables.length) loadTable(tables[0].name)
}
