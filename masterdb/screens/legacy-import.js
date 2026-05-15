/**
 * screens/legacy-import.js
 *
 * Imports legacy TechTool Excel packets (.xlsx) into MasterDB.
 * Robust version: Handles multi-file, multi-sheet, and fuzzy dates.
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

const MONTHS_PARSE = {
  JAN:'01', JANUARY:'01',   FEB:'02', FEBRUARY:'02',
  MAR:'03', MARCH:'03',     APR:'04', APRIL:'04',
  MAY:'05',                 JUN:'06', JUNE:'06',
  JUL:'07', JULY:'07', JUY:'07', JLY:'07',
  AUG:'08', AUGUST:'08',
  SEP:'09', SEPT:'09', SEPTEMBER:'09',
  OCT:'10', OCTOBER:'10',   NOV:'11', NOVEMBER:'11',
  DEC:'12', DECEMBER:'12'
}

// ---------------------------------------------------------------------------
// Render
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
    const files = e.dataTransfer.files
    if (files.length > 0) handleFiles(files, container, navigate)
  })

  dropZone.addEventListener('click', () => filePicker.click())

  filePicker.addEventListener('change', e => {
    const files = e.target.files
    if (files.length > 0) handleFiles(files, container, navigate)
  })
}

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------

async function handleFiles(fileList, container, navigate) {
  const files = Array.from(fileList)
  
  let aggregateParsed = {
    rows: [],
    warnings: [],
    missingCols: [],
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

      const rowsWithLocation = parsed.rows.map(r => ({ 
        ...r, 
        locationName: parsed.locationName 
      }))
      
      aggregateParsed.rows.push(...rowsWithLocation)
      aggregateParsed.warnings.push(...parsed.warnings)
      
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

  showPreview(aggregateParsed, `${files.length} files`, container, navigate)
}

// ---------------------------------------------------------------------------
// Excel parsing
// ---------------------------------------------------------------------------

function parseExcel(buffer, filename) {
  const XLSX = window.XLSX;
  const wb = XLSX.read(buffer, { type: 'array', raw: true });
  
  // 1. Get data sheets (ignore templates)
  const dataSheetNames = wb.SheetNames.filter(n => !n.toLowerCase().includes('template'));
  if (dataSheetNames.length === 0) throw new Error('No data sheets found.');

  let allRows = [];
  let allWarnings = [];

  // 2. Loop through every valid sheet
  for (const sheetName of dataSheetNames) {
    const ws  = wb.Sheets[sheetName];
    // We use header: 1 to get a raw array of rows
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // --- STEP A: GET COMPANY FROM CELL A1 ---
    // The macro set A1 to "Company: [Name]"
    let sheetCompany = 'Unknown Company';
    const cellA1 = raw[0]?.[0] || ''; 
    if (String(cellA1).toLowerCase().includes('company')) {
        sheetCompany = String(cellA1).replace(/^Company\s*:\s*/i, '').trim();
    } else {
        // Fallback: Check if it's in A2 or B1 just in case
        const altCell = raw[1]?.[0] || raw[0]?.[1] || '';
        if (String(altCell).toLowerCase().includes('company')) {
            sheetCompany = String(altCell).replace(/^Company\s*:\s*/i, '').trim();
        }
    }

    // --- STEP B: GET LOCATION FROM TAB NAME ---
    // The macro renamed the tab to the Location
    const sheetLocation = sheetName.trim();

    // --- STEP C: FIND HEADERS & PARSE DATA ---
    let hrIdx = -1, colIdx = {};
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const attempt = buildColIndex(raw[i] ?? []);
      if (REQUIRED_FIELDS.every(f => f in attempt)) { 
        hrIdx = i; 
        colIdx = attempt; 
        break; 
      }
    }
    
    if (hrIdx === -1) continue;

    for (let i = hrIdx + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!r) continue;
      
      const firstName = str(r[colIdx.firstName]);
      const lastName  = str(r[colIdx.lastName]);
      if (!firstName && !lastName) continue;

      const testDate = parseDate(r[colIdx.testDate]);
      if (!testDate) { 
        allWarnings.push(`${sheetName}: Row ${i+1} (${firstName}) skipped - unreadable date.`); 
        continue; 
      }

      allRows.push({
        firstName, lastName,
        rowCompany:  sheetCompany,  // Hard-assigned from A1
        rowLocation: sheetLocation, // Hard-assigned from Tab Name
        occupation:  str(r[colIdx.occupation]),
        dob:         parseDate(r[colIdx.dob]),
        testDate,    
        testType: normalizeTestType(str(r[colIdx.testType])),
        category:    str(r[colIdx.category]),
        left_500: num(r[colIdx.left_500]), left_1k: num(r[colIdx.left_1k]), left_2k: num(r[colIdx.left_2k]), left_3k: num(r[colIdx.left_3k]), left_4k: num(r[colIdx.left_4k]), left_6k: num(r[colIdx.left_6k]), left_8k: num(r[colIdx.left_8k]),
        right_500: num(r[colIdx.right_500]), right_1k: num(r[colIdx.right_1k]), right_2k: num(r[colIdx.right_2k]), right_3k: num(r[colIdx.right_3k]), right_4k: num(r[colIdx.right_4k]), right_6k: num(r[colIdx.right_6k]), right_8k: num(r[colIdx.right_8k]),
      });
    }
  }

  // Return with a generic company name because doImport will use row-level data
  return { 
    columnsMapped: true, 
    companyName: 'Master Batch', 
    rows: allRows, 
    warnings: allWarnings 
  };
}

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
// Preview & Conflicts
// ---------------------------------------------------------------------------

function showPreview(parsed, filename, container, navigate) {
  const { rows, warnings } = parsed;

  container.querySelector('#drop-zone').style.display = 'none';
  const pa = container.querySelector('#preview-area');
  pa.style.display = '';

  // Only show the first 10 rows for speed
  const preview = rows.slice(0, 15);

  pa.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(filename)}</div>
      <div style="color:var(--grey-500);font-size:13px">
        ✓ ${rows.length} records detected across all sheets.
      </div>
    </div>

    ${warnings.length ? `
    <div class="alert alert-warn" style="margin-bottom:12px; max-height: 100px; overflow-y: auto;">
      <strong>⚠ ${warnings.length} rows had issues</strong>
      <ul style="margin:6px 0 0 16px;font-size:12px">
        ${warnings.slice(0,5).map(w => `<li>${esc(w)}</li>`).join('')}
        ${warnings.length > 5 ? `<li>...and ${warnings.length - 5} more</li>` : ''}
      </ul>
    </div>` : ''}

    <div style="overflow-x:auto;margin-bottom:16px; border: 1px solid #eee; border-radius: 8px;">
      <table class="data-table" style="font-size: 12px;">
        <thead style="background: #f9fafb;">
          <tr>
            <th>Company (From Cell A1)</th>
            <th>Location (From Tab)</th>
            <th>Employee</th>
            <th>Test Date</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${preview.map(r => `
            <tr>
              <td style="color: #0056b3; font-weight: 600;">${esc(r.rowCompany)}</td>
              <td style="color: #666;">${esc(r.rowLocation)}</td>
              <td><strong>${esc(r.lastName)}</strong>, ${esc(r.firstName)}</td>
              <td>${esc(r.testDate)}</td>
              <td><span class="badge">${esc(r.testType)}</span></td>
            </tr>`).join('')}
          ${rows.length > 15 ? `
            <tr>
              <td colspan="5" style="text-align:center;color:var(--grey-400);padding:10px;font-style:italic">
                ... showing first 15 of ${rows.length} rows ...
              </td>
            </tr>` : ''}
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" id="btn-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-next">Looks Good - Import All →</button>
    </div>
  `;

  pa.querySelector('#btn-cancel').addEventListener('click', () => navigate('dashboard'));
  pa.querySelector('#btn-next').addEventListener('click', () => checkConflicts(parsed, container, navigate));
}

function checkConflicts(parsed, container, navigate) {
  const { companyName, rows } = parsed
  const company = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [companyName])
  const companyId = company?.company_id ?? null

  const conflicts = []
  if (companyId) {
    const seen = new Set()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const key = `${row.firstName.toUpperCase()}|${row.lastName.toUpperCase()}`
      if (seen.has(key)) continue

      if (row.dob) {
        const dobMatch = queryOne(
          `SELECT e.employee_id FROM employees e JOIN locations l ON e.location_id = l.location_id
           WHERE l.company_id = ? AND e.first_name = ? COLLATE NOCASE AND e.last_name = ? COLLATE NOCASE AND e.dob = ?`,
          [companyId, row.firstName, row.lastName, row.dob])
        if (dobMatch) continue
      }

      const nameMatches = query(
        `SELECT e.employee_id, e.first_name, e.last_name, e.dob, e.job_title
         FROM employees e JOIN locations l ON e.location_id = l.location_id
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
  } else {
    showConflicts(parsed, conflicts, container, navigate)
  }
}

function showConflicts(parsed, conflicts, container, navigate) {
  container.querySelector('#preview-area').style.display  = 'none'
  const ca = container.querySelector('#conflict-area')
  ca.style.display = ''

  ca.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:16px;font-weight:600;margin-bottom:4px">⚠ Name Conflicts Found</div>
    </div>
    <div id="conflict-cards" style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px"></div>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-primary" id="btn-confirm-conflicts">Continue →</button>
    </div>
  `

  const cards = ca.querySelector('#conflict-cards')
  conflicts.forEach((conflict, idx) => {
    const { row, matches } = conflict
    const card = document.createElement('div')
    card.className = 'settings-section'
    card.style.padding = '16px'
    card.innerHTML = `
      <div style="font-weight:600;margin-bottom:12px">${esc(row.firstName)} ${esc(row.lastName)}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${matches.map(m => `<label><input type="radio" name="conflict-${idx}" value="existing-${m.employee_id}" /> Match Existing (DOB: ${m.dob || '??'})</label>`).join('')}
        <label><input type="radio" name="conflict-${idx}" value="new" /> Create New</label>
        <label><input type="radio" name="conflict-${idx}" value="skip" /> Skip</label>
      </div>
    `
    cards.appendChild(card)
  })

  ca.querySelector('#btn-confirm-conflicts').addEventListener('click', () => {
    const decisions = {}
    conflicts.forEach((conflict, idx) => {
      const key = `${conflict.row.firstName.toUpperCase()}|${conflict.row.lastName.toUpperCase()}`
      const selected = ca.querySelector(`input[name="conflict-${idx}"]:checked`)
      if (selected) {
        if (selected.value.startsWith('existing-')) {
          decisions[key] = { action: 'existing', employeeId: parseInt(selected.value.replace('existing-', '')) }
        } else {
          decisions[key] = { action: selected.value }
        }
      }
    })
    runImport(parsed, decisions, container, navigate)
  })
}

// ---------------------------------------------------------------------------
// DB Import Execution
// ---------------------------------------------------------------------------

function runImport(parsed, decisions, container, navigate) {
  container.querySelector('#preview-area').style.display  = 'none'
  container.querySelector('#conflict-area').style.display = 'none'

  let result
  try {
    transaction(({ run }) => {
      result = doImport(parsed.companyName, null, parsed.province, parsed.rows, run, decisions)
    })
  } catch (err) {
    showError(container, `Import failed: ${err.message}`)
    return
  }

  const ra = container.querySelector('#result-area')
  ra.style.display = ''
  ra.innerHTML = `
    <div class="alert alert-success">✓ Import complete</div>
    <div style="display:flex;gap:12px;margin:20px 0">
      ${statCard('Tests', result.testsInserted)}
      ${statCard('Employees', result.employeesCreated)}
    </div>
    <button class="btn btn-primary" id="btn-done">Done</button>
  `
  ra.querySelector('#btn-done').addEventListener('click', () => navigate('dashboard'))
}

function doImport(companyName, _, defaultProvince, rows, run, decisions) {
  const stats = { companyId: null, employeesCreated: 0, employeesMatched: 0, testsInserted: 0, skipped: 0 }

  let company = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [companyName])
  if (company) {
    stats.companyId = company.company_id
  } else {
    run(`INSERT INTO companies (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))`, [companyName])
    stats.companyId = queryOne('SELECT last_insert_rowid() AS id').id
  }

  const locationCache = {}

  for (const row of rows) {
    const locName = row.locationName || 'Main Office'
    if (!locationCache[locName]) {
      let loc = queryOne('SELECT location_id FROM locations WHERE company_id = ? AND name = ? COLLATE NOCASE', [stats.companyId, locName])
      if (loc) {
        locationCache[locName] = loc.location_id
      } else {
        run(`INSERT INTO locations (company_id, name, province, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`, [stats.companyId, locName, defaultProvince])
        locationCache[locName] = queryOne('SELECT last_insert_rowid() AS id').id
      }
    }
    const locationId = locationCache[locName]

    const conflictKey = `${row.firstName.toUpperCase()}|${row.lastName.toUpperCase()}`
    const decision = decisions[conflictKey]

    let employeeId = null
    if (decision?.action === 'skip') { stats.skipped++; continue; }
    else if (decision?.action === 'existing') { employeeId = decision.employeeId; stats.employeesMatched++; }
    else {
      let employee = findEmployee(locationId, row)
      if (employee) { employeeId = employee.employee_id; stats.employeesMatched++; }
      else {
        run(`INSERT INTO employees (location_id, first_name, last_name, dob, job_title, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`,
          [locationId, row.firstName, row.lastName, row.dob ?? null, row.occupation || null])
        employeeId = queryOne('SELECT last_insert_rowid() AS id').id
        stats.employeesCreated++
      }
    }

    if (!queryOne('SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ?', [employeeId, row.testDate])) {
      run(`INSERT INTO tests (
        employee_id, location_id, test_date, test_type, province,
        left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k,
        right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k,
        classification, tech_notes, created_at
      ) VALUES (?, ?, ?, ?, 'AB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          employeeId, locationId, row.testDate, row.testType,
          row.left_500, row.left_1k, row.left_2k, row.left_3k, row.left_4k, row.left_6k, row.left_8k,
          row.right_500, row.right_1k, row.right_2k, row.right_3k, row.right_4k, row.right_6k, row.right_8k,
          row.category || null,
          row.wearHpd ? `HPD: ${row.hpdType || row.wearHpd}` : null
        ])
      stats.testsInserted++
    }
  }
  return stats
}

// ---------------------------------------------------------------------------
// Helper Utils
// ---------------------------------------------------------------------------

function findEmployee(locationId, row) {
  if (row.dob) {
    return queryOne(`SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE AND dob = ?`,
      [locationId, row.firstName, row.lastName, row.dob])
  }
  return queryOne(`SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE`,
    [locationId, row.firstName, row.lastName])
}

function parseDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  let s = String(raw).trim().replace(/\.\./g, '01').replace(/\?\?\?\?/g, '1900');
  if (!s) return null;
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  const upperS = s.toUpperCase();
  const spaceMatch = upperS.match(/^([A-Z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (spaceMatch) {
    const mo = MONTHS_PARSE[spaceMatch[1]];
    if (!mo) return null;
    let day = spaceMatch[2] === '0' ? '01' : spaceMatch[2].padStart(2, '0');
    return `${spaceMatch[3]}-${mo}-${day}`;
  }
  return (/^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null;
}

function companyNameFromFilename(filename) {
  return filename.replace(/\.xlsx?$/i, '').replace(/[_\-]+/g, ' ').trim();
}

function visitDateFromFilename(filename) {
  const tokens = filename.toLowerCase().split(/[\s_\-]+/);
  for (let i = 0; i < tokens.length; i++) {
    const mo = MONTHS_PARSE[tokens[i].toUpperCase()];
    if (mo && i + 2 < tokens.length && /^\d{4}$/.test(tokens[i+2])) return `${tokens[i+2]}-${mo}-${tokens[i+1].padStart(2,'0')}`;
  }
  return null;
}

function normalizeTestType(raw) {
  const s = (raw ?? '').toUpperCase();
  if (s.includes('BASE')) return 'Baseline';
  if (s.includes('EXIT')) return 'Exit';
  return 'Periodic';
}

function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) { const n = Number(v); return isNaN(n) ? null : n; }
function fmt(v) { return v == null ? '—' : String(v); }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function statCard(label, value) { return `<div class="ckpi"><span class="ckpi-n">${value}</span><span>${label}</span></div>`; }
function showError(container, msg) {
  const div = document.createElement('div');
  div.className = 'alert alert-error';
  div.textContent = msg;
  container.querySelector('.form-card').appendChild(div);
}