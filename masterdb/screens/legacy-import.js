import { run as dbRun, queryOne, query, transaction } from '../db/sqlite.js'

// ---------------------------------------------------------------------------
// THE COMPANY CLEANER (Fixes messy names found in Row 1)
// ---------------------------------------------------------------------------
const COMPANY_CLEANER = {
  "Collision Repair": "Baseline Collision Repair",
  "Boiler Makers Union Local 555": "Boilermakers Union Local 555",
  "City of Lloydminster - Lloyd Fire Dept": "City of Lloydminster",
  "CSB": "CSN",
  "Herberes": "Herbers",
  "Westower Commuications": "Westower Communications",
  // Add any others here as you see them in the preview
};

// ---------------------------------------------------------------------------
// THE LOCATION CLEANER (Fixes messy Tab names)
// ---------------------------------------------------------------------------
const LOCATION_CLEANER = {
  "Fire Dep": "Fire Dept",
  "Sherwood": "Sherwood Park",
  "Westaskiwin": "Wetaskiwin",
  // Add any others here...
};

const COLUMN_MAP = [
  ['firstName',  ['first name', 'firstname', 'first']],
  ['lastName',   ['surname', 'last name', 'lastname', 'last', 'last name (surname)']],
  ['occupation', ['occupation', 'job title', 'jobtitle', 'position']],
  ['dob',        ['birthdate', 'birth date', 'dob', 'date of birth', 'dateofbirth', 'birthdate mmddyyyy']],
  ['testDate',   ['test date', 'testdate', 'date tested', 'datetested', 'date of test', 'test date mmddyyyy']],
  ['wearHpd',    ['wear hpd', 'hpd worn', 'wears hpd', 'wearhpd', 'hpd use', 'wear hpi']],
  ['hpdType',    ['type of hpd', 'hpd type', 'hpdtype', 'hpd make', 'hpd model', 'type of hpi']],
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
];

const ALIAS_LOOKUP = new Map();
for (const [field, aliases] of COLUMN_MAP) {
  for (const alias of aliases) ALIAS_LOOKUP.set(alias, field);
}

const REQUIRED_FIELDS = ['firstName', 'lastName', 'testDate'];

const MONTHS_PARSE = {
  JAN:'01', JANUARY:'01', FEB:'02', FEBRUARY:'02', MAR:'03', MARCH:'03',
  APR:'04', APRIL:'04', MAY:'05', JUN:'06', JUNE:'06',
  JUL:'07', JULY:'07', JUY:'07', JLY:'07', AUG:'08', AUGUST:'08',
  SEP:'09', SEPT:'09', SEPTEMBER:'09', OCT:'10', OCTOBER:'10',
  NOV:'11', NOVEMBER:'11', DEC:'12', DECEMBER:'12'
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export function renderLegacyImport(container, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Import Legacy Excel</h1>
        <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Ready to import the Masterfile.</p>
      </div>
      <div class="form-card legacy-import-wrap">
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone__icon">📂</div>
          <div class="drop-zone__text">Drop your Masterfile here</div>
          <input type="file" id="file-picker" accept=".xlsx,.xls" style="display:none" />
        </div>
        <div id="preview-area"  style="display:none"></div>
        <div id="conflict-area" style="display:none"></div>
        <div id="result-area"   style="display:none"></div>
      </div>
    </div>
  `;
  const dropZone = container.querySelector('#drop-zone');
  const filePicker = container.querySelector('#file-picker');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drop-zone--over') });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-zone--over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drop-zone--over');
    const files = e.dataTransfer.files; if (files.length > 0) handleFiles(files, container, navigate);
  });
  dropZone.addEventListener('click', () => filePicker.click());
  filePicker.addEventListener('change', e => {
    const files = e.target.files; if (files.length > 0) handleFiles(files, container, navigate);
  });
}

async function handleFiles(fileList, container, navigate) {
  const file = fileList[0];
  const buffer = await file.arrayBuffer();
  try {
    const parsed = parseExcel(buffer, file.name);
    showPreview(parsed, file.name, container, navigate);
  } catch (err) {
    alert("Parsing failed: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Excel Parsing (Row 1 Priority)
// ---------------------------------------------------------------------------
function parseExcel(buffer, filename) {
  const XLSX = window.XLSX;
  const wb = XLSX.read(buffer, { type: 'array', raw: true });
  const dataSheets = wb.SheetNames.filter(n => !n.toLowerCase().includes('template') && n !== 'IMPORT_MAP');
  
  let allRows = [], allWarnings = [];

  for (const sheetName of dataSheets) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // 1. Extract Company from Row 1
    let rawCoName = "";
    for (let i = 0; i < 5; i++) {
        const cell = raw[i]?.[0];
        if (cell && String(cell).toLowerCase().includes('company:')) {
            rawCoName = String(cell).replace(/^Company\s*:\s*/i, '').trim();
            break;
        }
    }
    rawCoName = rawCoName || "Unknown Company";

    // 2. Clean Company & Location
    const finalCo = COMPANY_CLEANER[rawCoName] || rawCoName;
    let finalLoc = LOCATION_CLEANER[sheetName] || sheetName;
    
    // If Tab Name is just a repeat of Company, set to Main Office
    if (finalLoc.toLowerCase() === finalCo.toLowerCase() || finalLoc === "Main Office") {
        finalLoc = "Main Office";
    }

    // 3. Find Header
    let hrIdx = -1, colIdx = {};
    for (let i = 0; i < Math.min(raw.length, 30); i++) {
      const attempt = buildColIndex(raw[i] ?? []);
      if (REQUIRED_FIELDS.every(f => f in attempt)) { hrIdx = i; colIdx = attempt; break; }
    }
    if (hrIdx === -1) continue;

    // 4. Parse rows
    for (let i = hrIdx + 1; i < raw.length; i++) {
      const r = raw[i]; if (!r) continue;
      const firstName = str(r[colIdx.firstName]), lastName = str(r[colIdx.lastName]);
      if (!firstName && !lastName) continue;

      const testDate = parseDate(r[colIdx.testDate]);
      if (!testDate) continue;

      allRows.push({
        firstName, lastName,
        rowCompany:  finalCo, 
        rowLocation: finalLoc,
        occupation:  str(r[colIdx.occupation]),
        dob:         parseDate(r[colIdx.dob]),
        testDate,    testType: normalizeTestType(str(r[colIdx.testType])),
        category:    str(r[colIdx.category]),
        left_500: num(r[colIdx.left_500]), left_1k: num(r[colIdx.left_1k]), left_2k: num(r[colIdx.left_2k]), left_3k: num(r[colIdx.left_3k]), left_4k: num(r[colIdx.left_4k]), left_6k: num(r[colIdx.left_6k]), left_8k: num(r[colIdx.left_8k]),
        right_500: num(r[colIdx.right_500]), right_1k: num(r[colIdx.right_1k]), right_2k: num(r[colIdx.right_2k]), right_3k: num(r[colIdx.right_3k]), right_4k: num(r[colIdx.right_4k]), right_6k: num(r[colIdx.right_6k]), right_8k: num(r[colIdx.right_8k]),
      });
    }
  }

  return { rows: allRows, warnings: allWarnings };
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
// UI Preview
// ---------------------------------------------------------------------------
function showPreview(parsed, filename, container, navigate) {
  const { rows } = parsed;
  container.querySelector('#drop-zone').style.display = 'none';
  const pa = container.querySelector('#preview-area');
  pa.style.display = '';
  pa.innerHTML = `
    <div style="margin-bottom:16px"><strong>${filename}</strong> · ${rows.length} records found.</div>
    <div style="max-height: 450px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px;">
      <table class="data-table" style="font-size: 11px; width: 100%;">
        <thead style="position: sticky; top: 0; background: #eee;">
          <tr><th>Company</th><th>Location</th><th>Employee</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${rows.slice(0, 150).map(r => `
            <tr>
              <td style="color:#0056b3; font-weight:bold;">${esc(r.rowCompany)}</td>
              <td>${esc(r.rowLocation)}</td>
              <td>${esc(r.lastName)}, ${esc(r.firstName)}</td>
              <td>${esc(r.testDate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-outline" onclick="location.reload()">Cancel</button>
        <button class="btn btn-primary" id="btn-run-import">Everything looks correct - Import →</button>
    </div>
  `;
  pa.querySelector('#btn-run-import').addEventListener('click', () => runImport(parsed, container, navigate));
}

function runImport(parsed, container, navigate) {
  try {
    transaction(({ run }) => {
      const stats = doImport(parsed.rows, run);
      alert(`Success! Imported ${stats.testsInserted} tests into ${stats.companiesCreated} companies.`);
      navigate('dashboard');
    });
  } catch (err) {
    alert("Import failed: " + err.message);
  }
}

function doImport(rows, run) {
  const coCache = {}, locCache = {};
  const stats = { testsInserted: 0, employeesCreated: 0, companiesCreated: 0 };

  for (const row of rows) {
    if (!coCache[row.rowCompany]) {
      let co = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [row.rowCompany]);
      if (!co) {
        run("INSERT INTO companies (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))", [row.rowCompany]);
        co = { company_id: queryOne('SELECT last_insert_rowid() AS id').id };
        stats.companiesCreated++;
      }
      coCache[row.rowCompany] = co.company_id;
    }
    const companyId = coCache[row.rowCompany];

    const locKey = `${companyId}|${row.rowLocation}`;
    if (!locCache[locKey]) {
      let loc = queryOne('SELECT location_id FROM locations WHERE company_id = ? AND name = ? COLLATE NOCASE', [companyId, row.rowLocation]);
      if (!loc) {
        run("INSERT INTO locations (company_id, name, province, created_at, updated_at) VALUES (?, ?, 'AB', datetime('now'), datetime('now'))", [companyId, row.rowLocation]);
        loc = { location_id: queryOne('SELECT last_insert_rowid() AS id').id };
      }
      locCache[locKey] = loc.location_id;
    }
    const locationId = locCache[locKey];

    let emp = queryOne('SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE', [locationId, row.firstName, row.lastName]);
    let eid = emp ? emp.employee_id : null;
    if (!eid) {
      run("INSERT INTO employees (location_id, first_name, last_name, dob, job_title, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))", [locationId, row.firstName, row.lastName, row.dob, row.occupation]);
      eid = queryOne('SELECT last_insert_rowid() AS id').id;
      stats.employeesCreated++;
    }

    if (!queryOne('SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ?', [eid, row.testDate])) {
      run(`INSERT INTO tests (employee_id, location_id, test_date, test_type, province, left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k, right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k, classification, created_at) 
           VALUES (?, ?, ?, ?, 'AB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, 
           [eid, locationId, row.testDate, row.testType, row.left_500, row.left_1k, row.left_2k, row.left_3k, row.left_4k, row.left_6k, row.left_8k, row.right_500, row.right_1k, row.right_2k, row.right_3k, row.right_4k, row.right_6k, row.right_8k, row.category]);
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
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) { 
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v); return isNaN(n) ? null : n; 
}
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function normalizeTestType(s) { 
    s = (s || '').toUpperCase(); if (s.includes('BASE')) return 'Baseline'; if (s.includes('EXIT')) return 'Exit'; return 'Periodic'; 
}
function showError(container, msg) {
  const div = document.createElement('div');
  div.className = 'alert alert-error';
  div.textContent = msg;
  container.querySelector('.form-card').appendChild(div);
}