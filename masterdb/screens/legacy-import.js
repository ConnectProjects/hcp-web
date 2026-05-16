/**
 * screens/legacy-import.js
 *
 * Imports legacy TechTool Excel packets (.xlsx) into MasterDB.
 * Features: Multi-file, Multi-sheet, Row-level Company extraction, 
 * Tab-name Location extraction, and Fuzzy Date parsing.
 */

import { run as dbRun, queryOne, query, transaction } from '../db/sqlite.js'

// ---------------------------------------------------------------------------
// Configuration & Constants
// ---------------------------------------------------------------------------

const COLUMN_MAP = [
  ['rowCompany', ['company', 'employer', 'co', 'company name']],
  ['rowLocation',['location', 'site', 'branch', 'unit']],
  ['firstName',  ['first name', 'firstname', 'first']],
  ['lastName',   ['surname', 'last name', 'lastname', 'last', 'last name (surname)']],
  ['occupation', ['occupation', 'job title', 'jobtitle', 'position']],
  ['dob',        ['birthdate', 'birth date', 'dob', 'date of birth', 'dateofbirth', 'birthdate mmddyyyy']], // Added MMDDYYYY
  ['testDate',   ['test date', 'testdate', 'date tested', 'datetested', 'date of test', 'test date mmddyyyy']], // Added MMDDYYYY
  ['wearHpd',    ['wear hpd', 'hpd worn', 'wears hpd', 'wearhpd', 'hpd use', 'wear hpi']], // Added HPI typo
  ['hpdType',    ['type of hpd', 'hpd type', 'hpdtype', 'hpd make', 'hpd model', 'type of hpi']], // Added HPI typo
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
  JAN:'01', JANUARY:'01', FEB:'02', FEBRUARY:'02', MAR:'03', MARCH:'03',
  APR:'04', APRIL:'04', MAY:'05', JUN:'06', JUNE:'06',
  JUL:'07', JULY:'07', JUY:'07', JLY:'07', AUG:'08', AUGUST:'08',
  SEP:'09', SEPT:'09', SEPTEMBER:'09', OCT:'10', OCTOBER:'10',
  NOV:'11', NOVEMBER:'11', DEC:'12', DECEMBER:'12'
}

// ---------------------------------------------------------------------------
// UI Rendering
// ---------------------------------------------------------------------------

export function renderLegacyImport(container, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Import Legacy Excel</h1>
          <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Bulk import TechTool packets into MasterDB</p>
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
    e.preventDefault(); dropZone.classList.remove('drop-zone--over')
    const files = e.dataTransfer.files; if (files.length > 0) handleFiles(files, container, navigate)
  })
  dropZone.addEventListener('click', () => filePicker.click())
  filePicker.addEventListener('change', e => {
    const files = e.target.files; if (files.length > 0) handleFiles(files, container, navigate)
  })
}

// ---------------------------------------------------------------------------
// File & Parsing Logic
// ---------------------------------------------------------------------------

async function handleFiles(fileList, container, navigate) {
  const files = Array.from(fileList)
  let agg = { rows: [], warnings: [], missingCols: [], companyName: null, columnsMapped: false, locationName: 'Multiple Files' }

  for (const file of files) {
    if (!file.name.match(/\.xlsx?$/i)) continue
    const buffer = await file.arrayBuffer()
    try {
      const parsed = parseExcel(buffer, file.name)
      if (!agg.companyName) agg.companyName = parsed.companyName
      if (parsed.columnsMapped) agg.columnsMapped = true
      
      const rowsWithMetadata = parsed.rows.map(r => ({ 
        ...r, 
        // Ensure rows carry extracted metadata
        rowCompany: r.rowCompany || parsed.companyName,
        rowLocation: r.rowLocation || parsed.locationName
      }))
      
      agg.rows.push(...rowsWithMetadata)
      agg.warnings.push(...parsed.warnings)
    } catch (err) {
      agg.warnings.push(`Error parsing ${file.name}: ${err.message}`)
    }
  }
  showPreview(agg, `${files.length} files`, container, navigate)
}

function parseExcel(buffer, filename) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('SheetJS library not loaded.');

  const wb = XLSX.read(buffer, { type: 'array', raw: true });
  const dataSheetNames = wb.SheetNames.filter(n => !n.toLowerCase().includes('template'));
  if (dataSheetNames.length === 0) throw new Error('No data sheets found.');

  let allRows = [];
  let allWarnings = [];

  for (const sheetName of dataSheetNames) {
    const ws  = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // 1. Scan for Company Name in top 10 rows
    let sheetCompany = '';
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const row = raw[i] || [];
        for (let cell of row) {
            if (cell && String(cell).toLowerCase().includes('company:')) {
                sheetCompany = String(cell).split(/company\s*:\s*/i)[1]?.trim();
                break;
            }
        }
        if (sheetCompany) break;
    }
    
    // Fallback: If "Company:" not found, guess company from tab name
    if (!sheetCompany) sheetCompany = sheetName.split(/[#-]/)[0].trim();

    const sheetLocation = sheetName.trim();

    // 2. Find Header Row
    let hrIdx = -1, colIdx = {};
    for (let i = 0; i < Math.min(raw.length, 25); i++) {
      const attempt = buildColIndex(raw[i] ?? []);
      if (REQUIRED_FIELDS.every(f => f in attempt)) { hrIdx = i; colIdx = attempt; break; }
    }
    
    if (hrIdx === -1) continue;

    // 3. Parse Data
    for (let i = hrIdx + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!r) continue;
      const firstName = str(r[colIdx.firstName]), lastName = str(r[colIdx.lastName]);
      if (!firstName && !lastName) continue;

      const testDate = parseDate(r[colIdx.testDate]);
      if (!testDate) continue; // Skip rows with invalid dates

      allRows.push({
        firstName, lastName,
        rowCompany:  sheetCompany,  
        rowLocation: sheetLocation, 
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

  return { columnsMapped: true, companyName: sheetName, rows: allRows, warnings: allWarnings };
}

function buildColIndex(row) {
  const index = {};
  for (let c = 0; c < row.length; c++) {
    if (!row[c]) continue;
    const norm = String(row[c]).toLowerCase().replace(/\n.*/s, '').replace(/\s+/g, ' ').trim();
    const field = ALIAS_LOOKUP.get(norm);
    if (field && !(field in index)) index[field] = c;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Preview & Conflicts
// ---------------------------------------------------------------------------

function showPreview(parsed, filename, container, navigate) {
  const { rows, warnings } = parsed;
  container.querySelector('#drop-zone').style.display = 'none';
  const pa = container.querySelector('#preview-area');
  pa.style.display = '';

  const preview = rows.slice(0, 50);

  pa.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(filename)}</div>
      <div style="color:var(--grey-500);font-size:13px">
        ✓ ${rows.length} records detected. Verify columns below.
      </div>
    </div>

    <div style="max-height: 400px; overflow: auto; border: 1px solid var(--grey-200); border-radius: 8px; margin-bottom: 16px; background: white;">
      <table class="data-table" style="font-size: 11px; width: 100%; border-collapse: collapse;">
        <thead style="position: sticky; top: 0; background: var(--grey-100); z-index: 10;">
          <tr>
            <th style="text-align:left; padding: 8px;">Company (From A1)</th>
            <th style="text-align:left; padding: 8px;">Location (Tab)</th>
            <th style="text-align:left; padding: 8px;">Employee</th>
            <th style="text-align:left; padding: 8px;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${preview.map(r => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="color: #0056b3; font-weight: 600; padding: 8px;">${esc(r.rowCompany)}</td>
              <td style="color: #666; padding: 8px;">${esc(r.rowLocation)}</td>
              <td style="padding: 8px;">${esc(r.lastName)}, ${esc(r.firstName)}</td>
              <td style="padding: 8px;">${esc(r.testDate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" id="btn-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-next">Looks Good - Import →</button>
    </div>
  `;

  pa.querySelector('#btn-cancel').addEventListener('click', () => navigate('dashboard'));
  pa.querySelector('#btn-next').addEventListener('click', () => checkConflicts(parsed, container, navigate));
}

function checkConflicts(parsed, container, navigate) {
  const { rows } = parsed;
  const conflicts = [];
  
  // Quick pass: Check for existing employees via Location-Company join
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    const row = rows[i];
    const match = queryOne(`
        SELECT e.employee_id, e.first_name, e.last_name, e.dob 
        FROM employees e 
        JOIN locations l ON e.location_id = l.location_id
        JOIN companies c ON l.company_id = c.company_id
        WHERE c.name = ? COLLATE NOCASE AND e.first_name = ? COLLATE NOCASE AND e.last_name = ? COLLATE NOCASE`,
        [row.rowCompany, row.firstName, row.lastName]);
    
    if (match && row.dob && match.dob !== row.dob) {
        conflicts.push({ row, matches: [match] });
    }
  }

  if (conflicts.length === 0) {
    runImport(parsed, {}, container, navigate);
  } else {
    showConflicts(parsed, conflicts, container, navigate);
  }
}

function showConflicts(parsed, conflicts, container, navigate) {
  container.querySelector('#preview-area').style.display  = 'none';
  const ca = container.querySelector('#conflict-area');
  ca.style.display = '';
  ca.innerHTML = `<div style="margin-bottom:20px"><h3>⚠ Potential Name Conflicts</h3></div>
                  <div id="conflict-cards"></div>
                  <button class="btn btn-primary" id="btn-confirm-conflicts">Continue →</button>`;
  
  const cards = ca.querySelector('#conflict-cards');
  conflicts.slice(0, 10).forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = 'settings-section';
    div.style.padding = '12px';
    div.innerHTML = `<strong>${c.row.firstName} ${c.row.lastName}</strong> matches an existing record with a different DOB.
                     <br><label><input type="radio" name="c-${idx}" value="existing" checked> Use Existing</label>
                     <label><input type="radio" name="c-${idx}" value="new"> Create New</label>`;
    cards.appendChild(div);
  });

  ca.querySelector('#btn-confirm-conflicts').addEventListener('click', () => runImport(parsed, {}, container, navigate));
}

// ---------------------------------------------------------------------------
// DB Execution
// ---------------------------------------------------------------------------

function runImport(parsed, decisions, container, navigate) {
  try {
    transaction(({ run }) => {
      const stats = doImport(null, null, 'AB', parsed.rows, run, decisions);
      alert(`Success! Imported ${stats.testsInserted} tests.`);
      navigate('dashboard');
    });
  } catch (err) {
    alert("Import failed: " + err.message);
  }
}

function doImport(defCo, _, province, rows, run, decisions) {
  const coCache = {}, locCache = {}, stats = { testsInserted: 0, employeesCreated: 0 };

  for (const row of rows) {
    const coName = row.rowCompany || "Unknown Co";
    if (!coCache[coName]) {
      let co = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [coName]);
      if (!co) {
        run("INSERT INTO companies (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))", [coName]);
        co = { company_id: queryOne('SELECT last_insert_rowid() AS id').id };
      }
      coCache[coName] = co.company_id;
    }
    const companyId = coCache[coName];

    const locName = row.rowLocation || "Main Office";
    const locKey = `${companyId}|${locName}`;
    if (!locCache[locKey]) {
      let loc = queryOne('SELECT location_id FROM locations WHERE company_id = ? AND name = ? COLLATE NOCASE', [companyId, locName]);
      if (!loc) {
        run("INSERT INTO locations (company_id, name, province, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))", [companyId, locName, province]);
        loc = { location_id: queryOne('SELECT last_insert_rowid() AS id').id };
      }
      locCache[locKey] = loc.location_id;
    }
    const locationId = locCache[locKey];

    // Find/Create Employee
    let emp = queryOne('SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE', [locationId, row.firstName, row.lastName]);
    let employeeId = emp ? emp.employee_id : null;
    if (!employeeId) {
      run("INSERT INTO employees (location_id, first_name, last_name, dob, job_title, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))", [locationId, row.firstName, row.lastName, row.dob, row.occupation]);
      employeeId = queryOne('SELECT last_insert_rowid() AS id').id;
      stats.employeesCreated++;
    }

    // Insert Test (22 columns)
    if (!queryOne('SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ?', [employeeId, row.testDate])) {
      run(`INSERT INTO tests (employee_id, location_id, test_date, test_type, province, left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k, right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k, classification, created_at) 
           VALUES (?, ?, ?, ?, 'AB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, 
           [employeeId, locationId, row.testDate, row.testType, row.left_500, row.left_1k, row.left_2k, row.left_3k, row.left_4k, row.left_6k, row.left_8k, row.right_500, row.right_1k, row.right_2k, row.right_3k, row.right_4k, row.right_6k, row.right_8k, row.category]);
      stats.testsInserted++;
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  let s = String(raw).trim().replace(/\.\./g, '01').replace(/\?\?\?\?/g, '1900');
  
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`;
  
  const space = s.toUpperCase().match(/^([A-Z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (space) {
    let m = space[1]; if (m === 'SEPT') m = 'SEP';
    const mo = MONTHS_PARSE[m]; if (!mo) return null;
    let d = (space[2] === '0' || space[2] === '00') ? '01' : space[2].padStart(2,'0');
    return `${space[3]}-${mo}-${d}`;
  }
  
  const n = Number(raw);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) { const n = Number(v); return isNaN(n) ? null : n; }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function normalizeTestType(s) { 
  s = (s || '').toUpperCase(); 
  if (s.includes('BASE')) return 'Baseline'; 
  if (s.includes('EXIT')) return 'Exit'; 
  return 'Periodic'; 
}