/**
 * screens/legacy-import.js
 *
 * Imports legacy TechTool Excel packets (.xlsx) into MasterDB.
 *
 * Flow:
 *   1. Drop/browse file → parse Excel
 *   2. Preview table — shows first 10 rows, column mapping info
 *   3. Conflict review — if any employees match by name only (no DOB),
 *      user chooses: Use Existing / Create New / Skip Row
 *   4. Import — runs in a single transaction with decisions applied
 *   5. Result summary
 */

import { run as dbRun, queryOne, query, transaction } from '../db/sqlite.js'

// ---------------------------------------------------------------------------
// Column name → field key mappings
// ---------------------------------------------------------------------------

const COLUMN_MAP = [
  ['firstName',  ['first name', 'firstname', 'first']],
  ['lastName',   ['surname', 'last name', 'lastname', 'last']],
  ['occupation', ['occupation', 'job title', 'jobtitle', 'position']],
  ['dob',        ['birthdate', 'birth date', 'dob', 'date of birth', 'dateofbirth']],
  ['testDate',   ['test date', 'testdate', 'date tested', 'datetested', 'date of test']],
  ['wearHpd',    ['wear hpd', 'hpd worn', 'wears hpd', 'wearhpd', 'hpd use']],
  ['hpdType',    ['type of hpd', 'hpd type', 'hpdtype', 'hpd make', 'hpd model']],
  ['testType',   ['test type', 'testtype', 'type of test', 'typeoftest']],
  ['category',   ['category of test', 'categoryoftest', 'category', 'result', 'classification']],
  ['left_500',   ['left 05 khz', 'left 0.5 khz', 'left 500', 'left 500 hz', 'l500', 'l 500', 'l.5k', 'l0.5k']],
  ['left_1k',    ['left 1 khz', 'left 1khz', 'left 1000', 'left 1000 hz', 'l1k', 'l 1k', 'l1khz']],
  ['left_2k',    ['left 2 khz', 'left 2khz', 'left 2000', 'left 2000 hz', 'l2k', 'l 2k', 'l2khz']],
  ['left_3k',    ['left 3 khz', 'left 3khz', 'left 3000', 'left 3000 hz', 'l3k', 'l 3k', 'l3khz']],
  ['left_4k',    ['left 4 khz', 'left 4khz', 'left 4000', 'left 4000 hz', 'l4k', 'l 4k', 'l4khz']],
  ['left_6k',    ['left 6 khz', 'left 6khz', 'left 6000', 'left 6000 hz', 'l6k', 'l 6k', 'l6khz']],
  ['left_8k',    ['left 8 khz', 'left 8khz', 'left 8000', 'left 8000 hz', 'l8k', 'l 8k', 'l8khz']],
  ['right_500',  ['right 05 khz', 'right 0.5 khz', 'right 500', 'right 500 hz', 'r500', 'r 500', 'r.5k', 'r0.5k']],
  ['right_1k',   ['right 1 khz', 'right 1khz', 'right 1000', 'right 1000 hz', 'r1k', 'r 1k', 'r1khz']],
  ['right_2k',   ['right 2 khz', 'right 2khz', 'right 2000', 'right 2000 hz', 'r2k', 'r 2k', 'r2khz']],
  ['right_3k',   ['right 3 khz', 'right 3khz', 'right 3000', 'right 3000 hz', 'r3k', 'r 3k', 'r3khz']],
  ['right_4k',   ['right 4 khz', 'right 4khz', 'right 4000', 'right 4000 hz', 'r4k', 'r 4k', 'r4khz']],
  ['right_6k',   ['right 6 khz', 'right 6khz', 'right 6000', 'right 6000 hz', 'r6k', 'r 6k', 'r6khz']],
  ['right_8k',   ['right 8 khz', 'right 8khz', 'right 8000', 'right 8000 hz', 'r8k', 'r 8k', 'r8khz']],
]

const ALIAS_LOOKUP = new Map()
for (const [field, aliases] of COLUMN_MAP) {
  for (const alias of aliases) ALIAS_LOOKUP.set(alias, field)
}

const REQUIRED_FIELDS = ['firstName', 'lastName', 'testDate']

// ---------------------------------------------------------------------------
// Render (Updated for Multi-file selection)
// ---------------------------------------------------------------------------

export function renderLegacyImport(container, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Import Legacy Excel</h1>
          <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Import TechTool legacy .xlsx packets into MasterDB</p>
        </div>
      </div>

      <div class="form-card legacy-import-wrap">
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone__icon">📂</div>
          <div class="drop-zone__text">Drop one or more legacy .xlsx files here</div>
          <div class="drop-zone__sub">or <label class="link-btn" for="file-picker">browse</label></div>
          <!-- Added 'multiple' attribute here -->
          <input type="file" id="file-picker" accept=".xlsx,.xls" style="display:none" multiple />
        </div>

        <div id="preview-area"  style="display:none"></div>
        <div id="conflict-area" style="display:none"></div>
        <div id="result-area"   style="display:none"></div>
      </div>
    </div>
  `

  const dropZone   = container.querySelector('#drop-zone')
  const filePicker = container.querySelector('#file-picker')

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drop-zone--over') })
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drop-zone--over'))
  
  dropZone.addEventListener('drop', e => {
    e.preventDefault()
    dropZone.classList.remove('drop-zone--over')
    const files = e.dataTransfer.files // Grab the whole list
    if (files.length > 0) handleFiles(files, container, navigate)
  })

  dropZone.addEventListener('click', () => filePicker.click())

  filePicker.addEventListener('change', e => {
    const files = e.target.files // Grab the whole list
    if (files.length > 0) handleFiles(files, container, navigate)
  })
}

// ---------------------------------------------------------------------------
// File handling (Updated to handle multiple files)
// ---------------------------------------------------------------------------

async function handleFiles(fileList, container, navigate) {
  const files = Array.from(fileList)
  
  let aggregateParsed = {
    rows: [],
    warnings: [],
    missingCols: [], // Added this to fix the 'length' error
    companyName: null,
    companyFromFile: true,
    columnsMapped: false,
    locationName: 'Multiple Files',
    visitDate: null,
    province: 'AB'
  }

  for (const file of files) {
    if (!file.name.match(/\.xlsx?$/i)) {
      aggregateParsed.warnings.push(`Skipped ${file.name}: Not an Excel file.`)
      continue
    }

    const buffer = await file.arrayBuffer()
    try {
      const parsed = parseExcel(buffer, file.name)
      
      if (!aggregateParsed.companyName) {
        aggregateParsed.companyName = parsed.companyName
        aggregateParsed.visitDate = parsed.visitDate
      }
      
      if (parsed.columnsMapped) aggregateParsed.columnsMapped = true

      // Combine rows and keep track of which location they belong to
      const rowsWithLocation = parsed.rows.map(r => ({ 
        ...r, 
        locationName: parsed.locationName 
      }))
      
      aggregateParsed.rows.push(...rowsWithLocation)
      aggregateParsed.warnings.push(...parsed.warnings)
      
      // If any file has missing columns, track them for the preview
      if (parsed.missingCols && parsed.missingCols.length > 0) {
        parsed.missingCols.forEach(col => {
          if (!aggregateParsed.missingCols.includes(col)) {
            aggregateParsed.missingCols.push(col)
          }
        })
      }

    } catch (err) {
      aggregateParsed.warnings.push(`Error parsing ${file.name}: ${err.message}`)
    }
  }

  if (aggregateParsed.rows.length === 0) {
    showError(container, 'No valid data found in any of the selected files.')
    return
  }

  // Now showPreview will have all the properties it needs (including missingCols)
  showPreview(aggregateParsed, `${files.length} files`, container, navigate)
}

// ---------------------------------------------------------------------------
// Excel parsing - Multi-sheet version with Company/Location splitting
// ---------------------------------------------------------------------------

function parseExcel(buffer, filename) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS (XLSX) library not loaded.');

  const wb = XLSX.read(buffer, { type: 'array', raw: true });
  
  // 1. Get all data sheets, ignoring templates
  const dataSheetNames = wb.SheetNames.filter(n => {
    const name = n.toLowerCase();
    if (name.includes('template')) return false;
    const ws = wb.Sheets[n];
    return ws && ws['!ref'];
  });

  if (dataSheetNames.length === 0) throw new Error('No data sheets found.');

  let allRows = [];
  let allWarnings = [];
  let internalNameFromCell = null;
  let columnsMappedGlobally = false;

  // 2. Loop through every valid sheet
  for (const sheetName of dataSheetNames) {
    const ws  = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    // Try to find company name in this sheet cell (e.g., "Company: Kal Tire #022")
    if (!internalNameFromCell) {
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        for (const cell of (raw[i] ?? [])) {
          if (!cell) continue;
          const m = String(cell).match(/Company\s*[/\\]?\s*City\s*:?\s*(.+)/i);
          if (m) { internalNameFromCell = m[1].trim(); break; }
        }
        if (internalNameFromCell) break;
      }
    }

    // Find header row in this sheet
    let headerRowIdx = -1, colIndex = {};
    for (let i = 0; i < raw.length; i++) {
      const attempt = buildColIndex(raw[i] ?? []);
      if (REQUIRED_FIELDS.every(f => f in attempt)) { 
        headerRowIdx = i; 
        colIndex = attempt; 
        columnsMappedGlobally = true;
        break; 
      }
    }

    if (headerRowIdx === -1) continue;

    // Parse data rows for this sheet
    for (let i = headerRowIdx + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!r) continue;
      const firstName = str(r[colIndex.firstName]);
      const lastName  = str(r[colIndex.lastName]);
      if (!firstName && !lastName) continue;

      const testDateRaw = colIndex.testDate != null ? r[colIndex.testDate] : null;
      const testDate    = parseDate(testDateRaw);

      if (!testDate) {
        allWarnings.push(`Sheet "${sheetName}", Row ${i + 1} (${firstName} ${lastName}): unreadable date.`);
        continue;
      }

      const dobRaw = colIndex.dob != null ? r[colIndex.dob] : null;
      allRows.push({
        firstName, lastName,
        occupation:  str(r[colIndex.occupation]),
        dob:         parseDate(dobRaw),
        dobRaw:      str(dobRaw),
        testDate,    testDateRaw: str(testDateRaw),
        wearHpd:     str(r[colIndex.wearHpd]),
        hpdType:     str(r[colIndex.hpdType]),
        testType:    normalizeTestType(str(r[colIndex.testType])),
        category:    str(r[colIndex.category]),
        left_500:  num(r[colIndex.left_500]),  left_1k:  num(r[colIndex.left_1k]),
        left_2k:   num(r[colIndex.left_2k]),   left_3k:  num(r[colIndex.left_3k]),
        left_4k:   num(r[colIndex.left_4k]),   left_6k:  num(r[colIndex.left_6k]),
        left_8k:   num(r[colIndex.left_8k]),
        right_500: num(r[colIndex.right_500]), right_1k: num(r[colIndex.right_1k]),
        right_2k:  num(r[colIndex.right_2k]),  right_3k: num(r[colIndex.right_3k]),
        right_4k:  num(r[colIndex.right_4k]),  right_6k: num(r[colIndex.right_6k]),
        right_8k:  num(r[colIndex.right_8k]),
      });
    }
  }

  // 3. Robust Split Logic (Handles #, Comma, and Dash)
  // Extracts "Kal Tire", "Carrier Forest Products", or "City of Lloydminster" as the Company
  const rawFullName = internalNameFromCell || companyNameFromFilename(filename);
  let companyName = rawFullName;
  let locationName = 'Main Office';

  // Try splitting by # (Kal Tire style)
  if (rawFullName.includes('#')) {
    const parts = rawFullName.split('#');
    companyName = parts[0].trim();
    locationName = '#' + parts.slice(1).join('#').trim();
  } 
  // Try splitting by Comma (Carrier Forest style)
  else if (rawFullName.includes(',')) {
    const parts = rawFullName.split(',');
    companyName = parts[0].trim();
    locationName = parts.slice(1).join(',').trim();
  }
  // Try splitting by Dash (City of Lloydminster style)
  else if (rawFullName.includes(' - ')) {
    const parts = rawFullName.split(' - ');
    companyName = parts[0].trim();
    locationName = parts.slice(1).join(' - ').trim();
  }

  return { 
    columnsMapped: columnsMappedGlobally, 
    companyName, 
    locationName, 
    province: 'AB', 
    companyFromFile: !internalNameFromCell, 
    visitDate: visitDateFromFilename(filename), 
    rows: allRows, 
    warnings: allWarnings, 
    missingCols: [] 
  };
}
// ---------------------------------------------------------------------------
// Build column index
// ---------------------------------------------------------------------------

function buildColIndex(row) {
  const index = {}
  for (let c = 0; c < row.length; c++) {
    if (!row[c]) continue
    const normalised = String(row[c]).toLowerCase().replace(/\n.*/s, '').replace(/\s+/g, ' ').trim()
    const field = ALIAS_LOOKUP.get(normalised)
    if (field && !(field in index)) index[field] = c
  }
  return index
}

// ---------------------------------------------------------------------------
// Step 1 — Preview
// ---------------------------------------------------------------------------

function showPreview(parsed, filename, container, navigate) {
  const { companyName, companyFromFile, visitDate, rows, warnings, missingCols } = parsed

  container.querySelector('#drop-zone').style.display  = 'none'
  const pa = container.querySelector('#preview-area')
  pa.style.display = ''

  const notices = []
  if (missingCols.length > 0) {
    notices.push(`<div class="alert alert-warn" style="margin-bottom:8px">
      ⚠ Frequency columns not found (will be blank):
      <strong>${missingCols.map(c => c.replace('_',' ').replace('k',' kHz')).join(', ')}</strong>
    </div>`)
  }
  notices.push(`<div style="font-size:12px;color:var(--grey-500);margin-bottom:12px">
    ✓ ${14 - missingCols.length}/14 frequency columns mapped
  </div>`)

  const freqCols   = ['500','1k','2k','3k','4k','6k','8k']
  const earCols    = [...freqCols.map(f=>`L${f}`), ...freqCols.map(f=>`R${f}`)]
  const freqFields = [
    'left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
    'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k'
  ]
  const preview = rows.slice(0, 10)

  pa.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(filename)}</div>
      <div style="color:var(--grey-500);font-size:13px">
        Company: <strong>${esc(companyName)}</strong>
        <span style="color:var(--grey-300)">(${companyFromFile ? 'from filename' : 'from file'})</span>
        ${visitDate ? `&nbsp;·&nbsp; Visit: <strong>${visitDate}</strong>` : ''}
        &nbsp;·&nbsp; ${rows.length} record${rows.length !== 1 ? 's' : ''}
      </div>
    </div>
    ${notices.join('')}
    ${warnings.length ? `<div class="alert alert-warn" style="margin-bottom:12px">
      <strong>⚠ ${warnings.length} row${warnings.length !== 1 ? 's' : ''} will be skipped</strong>
      <ul style="margin:6px 0 0 16px;font-size:13px">
        ${warnings.map(w => `<li>${esc(w)}</li>`).join('')}
      </ul>
    </div>` : ''}
    <div style="overflow-x:auto;margin-bottom:16px">
      <table class="data-table">
        <thead>
          <tr>
            <th>Last</th><th>First</th><th>DOB</th>
            <th>Test Date</th><th>Type</th><th>Cat</th>
            ${earCols.map(c => `<th style="font-size:11px">${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${preview.map(r => `
            <tr>
              <td>${esc(r.lastName)}</td><td>${esc(r.firstName)}</td>
              <td>${esc(r.dobRaw)}</td><td>${esc(r.testDateRaw)}</td>
              <td>${esc(r.testType)}</td><td>${esc(r.category)}</td>
              ${freqFields.map(f => `<td>${fmt(r[f])}</td>`).join('')}
            </tr>`).join('')}
          ${rows.length > 10 ? `
            <tr>
              <td colspan="20" style="text-align:center;color:var(--grey-500);font-style:italic;font-size:12px">
                … and ${rows.length - 10} more rows
              </td>
            </tr>` : ''}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" id="btn-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-next">Continue →</button>
    </div>
  `

  pa.querySelector('#btn-cancel').addEventListener('click', () => navigate('dashboard'))
  pa.querySelector('#btn-next').addEventListener('click',   () => checkConflicts(parsed, container, navigate))
}

// ---------------------------------------------------------------------------
// Step 2 — Conflict detection (Updated for Schema 2.0 Hierarchy)
// ---------------------------------------------------------------------------

function checkConflicts(parsed, container, navigate) {
  const { companyName, rows } = parsed

  const company   = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [companyName])
  const companyId = company?.company_id ?? null

  const conflicts = []
  if (companyId) {
    const seen = new Set()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const key = `${row.firstName.toUpperCase()}|${row.lastName.toUpperCase()}`
      if (seen.has(key)) continue

      // Updated SQL: Joining employees to locations to check by company_id
      if (row.dob) {
        const dobMatch = queryOne(
          `SELECT e.employee_id FROM employees e
           JOIN locations l ON e.location_id = l.location_id
           WHERE l.company_id = ? AND e.first_name = ? COLLATE NOCASE
             AND e.last_name = ? COLLATE NOCASE AND e.dob = ?`,
          [companyId, row.firstName, row.lastName, row.dob])
        if (dobMatch) continue
      }

      // Updated SQL: Joining employees to locations to check by company_id
      const nameMatches = query(
        `SELECT e.employee_id, e.first_name, e.last_name, e.dob, e.job_title
         FROM employees e
         JOIN locations l ON e.location_id = l.location_id
         WHERE l.company_id = ? AND e.first_name = ? COLLATE NOCASE AND e.last_name = ? COLLATE NOCASE`,
        [companyId, row.firstName, row.lastName])

      if (nameMatches.length > 0) {
        seen.add(key)
        conflicts.push({ rowIndex: i, row, matches: nameMatches })
      }
    }
  }

  if (conflicts.length === 0) {
    runImport(parsed, {}, container, navigate)
    return
  }

  showConflicts(parsed, conflicts, container, navigate)
}
// ---------------------------------------------------------------------------
// Step 2b — Conflict resolution UI
// ---------------------------------------------------------------------------

function showConflicts(parsed, conflicts, container, navigate) {
  container.querySelector('#preview-area').style.display  = 'none'
  const ca = container.querySelector('#conflict-area')
  ca.style.display = ''

  ca.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:16px;font-weight:600;margin-bottom:4px">⚠ Name Conflicts Found</div>
      <div style="font-size:13px;color:var(--grey-500)">
        ${conflicts.length} employee${conflicts.length !== 1 ? 's' : ''} in this file
        match an existing name at this company but couldn't be confirmed by date of birth.
        Please choose what to do with each one.
      </div>
    </div>
    <div id="conflict-cards" style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px"></div>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" id="btn-back-preview">← Back</button>
      <button class="btn btn-primary" id="btn-confirm-conflicts">Continue with these choices →</button>
    </div>
  `

  const cards = ca.querySelector('#conflict-cards')

  conflicts.forEach((conflict, idx) => {
    const { row, matches } = conflict
    const card = document.createElement('div')
    card.className = 'settings-section'
    card.style.padding = '16px'

    card.innerHTML = `
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">
        ${esc(row.firstName)} ${esc(row.lastName)}
      </div>
      <div style="font-size:12px;color:var(--grey-500);margin-bottom:12px">
        Importing: DOB ${esc(row.dobRaw) || 'unknown'} &nbsp;·&nbsp; ${esc(row.occupation)} &nbsp;·&nbsp; Test date ${esc(row.testDateRaw)}
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--grey-700);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">
        Existing records at this company:
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">
        ${matches.map(m => `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1.5px solid var(--grey-200);border-radius:var(--radius);cursor:pointer;font-size:13px">
            <input type="radio" name="conflict-${idx}" value="existing-${m.employee_id}" style="flex-shrink:0" />
            <span>
              <strong>${esc(m.first_name)} ${esc(m.last_name)}</strong>
              &nbsp;·&nbsp; DOB: ${m.dob || 'unknown'}
              &nbsp;·&nbsp; ${esc(m.job_title || 'No title')}
              <span class="badge badge-neutral" style="margin-left:6px">Use existing</span>
            </span>
          </label>`).join('')}
        <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1.5px solid var(--grey-200);border-radius:var(--radius);cursor:pointer;font-size:13px">
          <input type="radio" name="conflict-${idx}" value="new" style="flex-shrink:0" />
          <span>Create as a <strong>new employee</strong> (different person, same name)</span>
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1.5px solid var(--grey-200);border-radius:var(--radius);cursor:pointer;font-size:13px">
          <input type="radio" name="conflict-${idx}" value="skip" style="flex-shrink:0" />
          <span>Skip all rows for this person in this import</span>
        </label>
      </div>
    `

    card.querySelectorAll(`input[name="conflict-${idx}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        card.querySelectorAll('label').forEach(l => l.style.borderColor = 'var(--grey-200)')
        radio.closest('label').style.borderColor = 'var(--navy-mid)'
      })
    })

    cards.appendChild(card)
  })

  ca.querySelector('#btn-back-preview').addEventListener('click', () => {
    ca.style.display = 'none'
    container.querySelector('#preview-area').style.display = ''
  })

  ca.querySelector('#btn-confirm-conflicts').addEventListener('click', () => {
    const decisions = {}
    let allAnswered = true

    conflicts.forEach((conflict, idx) => {
      const key      = `${conflict.row.firstName.toUpperCase()}|${conflict.row.lastName.toUpperCase()}`
      const selected = ca.querySelector(`input[name="conflict-${idx}"]:checked`)
      if (!selected) { allAnswered = false; return }

      if (selected.value.startsWith('existing-')) {
        decisions[key] = { action: 'existing', employeeId: parseInt(selected.value.replace('existing-', '')) }
      } else if (selected.value === 'new') {
        decisions[key] = { action: 'new' }
      } else {
        decisions[key] = { action: 'skip' }
      }
    })

    if (!allAnswered) {
      showError(container, 'Please make a selection for every conflict before continuing.')
      return
    }

    runImport(parsed, decisions, container, navigate)
  })
}

// ---------------------------------------------------------------------------
// Step 3 — Import
// ---------------------------------------------------------------------------

function runImport(parsed, decisions, container, navigate) {
  container.querySelector('#preview-area').style.display  = 'none'
  container.querySelector('#conflict-area').style.display = 'none'

  let result
  try {
    transaction(({ run }) => {
    result = doImport(parsed.companyName, parsed.locationName, parsed.province, parsed.rows, run, decisions)
    })
  } catch (err) {
    showError(container, `Import failed: ${err.message}`)
    return
  }

  const ra = container.querySelector('#result-area')
  ra.style.display = ''
  ra.innerHTML = `
    <div class="alert alert-success" style="margin-bottom:16px">✓ Import complete</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      ${statCard('Company',        result.companyCreated ? 'Created' : 'Matched')}
      ${statCard('Employees',      `${result.employeesCreated} new · ${result.employeesMatched} matched`)}
      ${statCard('Tests inserted',  result.testsInserted)}
      ${statCard('Baselines set',   result.baselinesSet)}
      ${result.skipped > 0 ? statCard('Skipped', result.skipped) : ''}
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn btn-primary" id="btn-go-company">View Company</button>
      <button class="btn btn-outline"  id="btn-done">Import Another</button>
    </div>
  `

  ra.querySelector('#btn-go-company').addEventListener('click', () =>
    navigate('company-detail', { currentCompany: result.companyId }))
  ra.querySelector('#btn-done').addEventListener('click', () =>
    navigate('legacy-import'))
}

// ---------------------------------------------------------------------------
// Core DB write logic - Bulk Multi-Location Version
// ---------------------------------------------------------------------------

function doImport(companyName, _, defaultProvince, rows, run, decisions) {
  const stats = {
    companyCreated:  false, companyId:  null,
    employeesCreated: 0,   employeesMatched: 0,
    testsInserted: 0,      baselinesSet: 0,
    skipped: 0
  }

  // 1. Find or create the master Company (e.g., "Kal Tire")
  let company = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [companyName])
  if (company) {
    stats.companyId = company.company_id
  } else {
    run(`INSERT INTO companies (name, created_at, updated_at)
         VALUES (?, datetime('now'), datetime('now'))`, [companyName])
    stats.companyId      = queryOne('SELECT last_insert_rowid() AS id').id
    stats.companyCreated = true
  }

  const companyId = stats.companyId
  
  // Create a cache for location IDs so we don't query the DB 500 times for the same site
  const locationCache = {}

  for (const row of rows) {
    // 2. Determine Location for this specific row (based on the filename it came from)
    const locName = row.locationName || 'Main Office'
    
    if (!locationCache[locName]) {
      let location = queryOne(
        'SELECT location_id FROM locations WHERE company_id = ? AND name = ? COLLATE NOCASE',
        [companyId, locName]
      )
      
      if (location) {
        locationCache[locName] = location.location_id
      } else {
        // Create the location if it's new to the database
        run(`INSERT INTO locations (company_id, name, province, created_at, updated_at)
             VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
            [companyId, locName, defaultProvince])
        locationCache[locName] = queryOne('SELECT last_insert_rowid() AS id').id
      }
    }

    const locationId = locationCache[locName]
    const conflictKey = `${row.firstName.toUpperCase()}|${row.lastName.toUpperCase()}`
    const decision    = decisions[conflictKey]

    // 3. Resolve employee
    let employeeId = null

    if (decision?.action === 'skip') {
      stats.skipped++
      continue
    } else if (decision?.action === 'existing') {
      employeeId = decision.employeeId
      stats.employeesMatched++
    } else {
      // Try to find employee at THIS specific location
      let employee = findEmployee(locationId, row)
      if (employee) {
        employeeId = employee.employee_id
        stats.employeesMatched++
      } else {
        run(`INSERT INTO employees (location_id, first_name, last_name, dob, job_title, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`,
            [locationId, row.firstName, row.lastName, row.dob ?? null, row.occupation || null])
        employeeId = queryOne('SELECT last_insert_rowid() AS id').id
        stats.employeesCreated++
      }
    }

    // 4. Skip duplicate test (Avoid importing the same test twice if file is re-uploaded)
    if (queryOne('SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ?',
                 [employeeId, row.testDate])) continue

    // 5. Insert test (22 Columns to match Schema 2.0)
    run(`INSERT INTO tests (
          employee_id, location_id, test_date, test_type, province,
          left_500,  left_1k,  left_2k,  left_3k,  left_4k,  left_6k,  left_8k,
          right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k,
          classification, tech_notes, created_at
        ) VALUES (
          ?, ?, ?, ?, 'AB',
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, datetime('now')
        )`,
        [
          employeeId, 
          locationId, 
          row.testDate, 
          row.testType,
          row.left_500,  row.left_1k,  row.left_2k,  row.left_3k,
          row.left_4k,   row.left_6k,  row.left_8k,
          row.right_500, row.right_1k, row.right_2k, row.right_3k,
          row.right_4k,  row.right_6k, row.right_8k,
          row.category || null,
          row.wearHpd ? `HPD: ${row.hpdType || row.wearHpd}` : null
        ])
    stats.testsInserted++

    // 6. Insert baseline if none exists
    if (row.testType === 'Baseline' &&
        !queryOne('SELECT baseline_id FROM baselines WHERE employee_id = ? AND archived = 0', [employeeId])) {
      run(`INSERT INTO baselines (
            employee_id, location_id, test_date,
            left_500,  left_1k,  left_2k,  left_3k,  left_4k,  left_6k,  left_8k,
            right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            employeeId, 
            locationId,
            row.testDate,
            row.left_500,  row.left_1k,  row.left_2k,  row.left_3k,
            row.left_4k,   row.left_6k,  row.left_8k,
            row.right_500, row.right_1k, row.right_2k, row.right_3k,
            row.right_4k,  row.right_6k, row.right_8k
          ])
      stats.baselinesSet++
    }
  }

  return stats
}

// ---------------------------------------------------------------------------
// Employee matching
// ---------------------------------------------------------------------------

function findEmployee(locationId, row) {
  if (row.dob) {
    const m = queryOne(
      `SELECT employee_id FROM employees
       WHERE location_id = ? AND first_name = ? COLLATE NOCASE
         AND last_name = ? COLLATE NOCASE AND dob = ?`,
      [locationId, row.firstName, row.lastName, row.dob])
    if (m) return m
  }
  return queryOne(
    `SELECT employee_id FROM employees
     WHERE location_id = ? AND first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE`,
    [locationId, row.firstName, row.lastName])
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const MONTHS_PARSE = {
  JAN:'01', JANUARY:'01',   
  FEB:'02', FEBRUARY:'02',
  MAR:'03', MARCH:'03',     
  APR:'04', APRIL:'04',
  MAY:'05',                 
  JUN:'06', JUNE:'06',
  JUL:'07', JULY:'07', JUY:'07', JLY:'07', // Added JUY and JLY typos
  AUG:'08', AUGUST:'08',
  SEP:'09', SEPT:'09', SEPTEMBER:'09',     // Added SEPT
  OCT:'10', OCTOBER:'10',   
  NOV:'11', NOVEMBER:'11',
  DEC:'12', DECEMBER:'12'
}

function parseDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);

  // Clean up Excel noise (.. and ????)
  let s = String(raw).trim().replace(/\.\./g, '01').replace(/\?\?\?\?/g, '1900');
  if (!s) return null;

  // 1. Handle Slash format: 7/31/2025
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }

  // 2. Handle Space format: SEPT 0 1988 or JUY 16 2013
  const upperS = s.toUpperCase();
  const spaceMatch = upperS.match(/^([A-Z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (spaceMatch) {
    const mo = MONTHS_PARSE[spaceMatch[1]];
    if (!mo) return null;
    
    // FIX: If the day is '0', change it to '01'
    let day = spaceMatch[2];
    if (day === '0' || day === '00') day = '01';
    
    return `${spaceMatch[3]}-${mo}-${day.padStart(2,'0')}`;
  }

  // 3. Handle standard ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 4. Handle Excel Serial Numbers
  const n = Number(raw);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  
  return null;
}

  // 2. Handle Space format: SEPT 5 1991 or JUNE 20 1980
  // Note: Added support for SEPT as 4 letters
  const upperS = s.toUpperCase();
  const spaceMatch = upperS.match(/^([A-Z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (spaceMatch) {
    let monthPart = spaceMatch[1];
    if (monthPart === 'SEPT') monthPart = 'SEP'; // Normalize SEPT to SEP
    const mo = MONTHS_PARSE[monthPart];
    if (!mo) return null;
    return `${spaceMatch[3]}-${mo}-${spaceMatch[2].padStart(2,'0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const n = Number(raw);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  
  return null;
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = new Set([
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
  'jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec'
])

function companyNameFromFilename(filename) {
  const tokens = filename.replace(/\.xlsx?$/i, '').replace(/[_\-]+/g, ' ').trim().split(/\s+/)
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1].toLowerCase()
    if (MONTH_NAMES.has(last) || /^\d{4}$/.test(last) || /^\d{1,2}$/.test(last)) tokens.pop()
    else break
  }
  return tokens.join(' ').trim() || filename.replace(/\.xlsx?$/i, '')
}

const MONTH_MAP = {
  january:'01', jan:'01', february:'02', feb:'02', march:'03',    mar:'03',
  april:'04',   apr:'04', may:'05',                june:'06',     jun:'06',
  july:'07',    jul:'07', august:'08',   aug:'08', september:'09',sep:'09', sept:'09',
  october:'10', oct:'10', november:'11', nov:'11', december:'12', dec:'12'
}

function visitDateFromFilename(filename) {
  const tokens = filename.replace(/\.xlsx?$/i, '').replace(/[_\-]+/g, ' ').toLowerCase().split(/\s+/)
  for (let i = 0; i < tokens.length; i++) {
    const mo = MONTH_MAP[tokens[i]]
    if (!mo) continue
    if (i + 2 < tokens.length && /^\d{1,2}$/.test(tokens[i+1]) && /^\d{4}$/.test(tokens[i+2]))
      return `${tokens[i+2]}-${mo}-${tokens[i+1].padStart(2,'0')}`
    if (i + 1 < tokens.length && /^\d{4}$/.test(tokens[i+1]))
      return `${tokens[i+1]}-${mo}-01`
  }
  return null
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function normalizeTestType(raw) {
  const s = (raw ?? '').toUpperCase().trim()
  if (s.includes('BASE'))   return 'Baseline'
  if (s.includes('PERIOD')) return 'Periodic'
  if (s.includes('EXIT'))   return 'Exit'
  if (s.includes('REFER'))  return 'Referral'
  return raw || 'Periodic'
}

function str(v) { return v == null ? '' : String(v).trim() }
function num(v) { const n = Number(v); return isNaN(n) ? null : n }
function fmt(v) { return v == null ? '—' : String(v) }
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function statCard(label, value) {
  return `<div class="ckpi">
    <span class="ckpi-n" style="font-size:18px">${value}</span>
    <span>${label}</span>
  </div>`
}
function showError(container, msg) {
  container.querySelector('.alert-error')?.remove()
  const div = document.createElement('div')
  div.className = 'alert alert-error'
  div.style.marginTop = '12px'
  div.textContent = msg
  container.querySelector('.form-card').appendChild(div)
}
