import { run as dbRun, queryOne, query, transaction } from '../db/sqlite.js'

// ---------------------------------------------------------------------------
// THE MASTER TRANSLATION MAP (Generated from your list)
// ---------------------------------------------------------------------------
const IMPORT_MAP = {
  // Tab Name : { company: "Clean Name", location: "Clean Name" }
  "Main Office": { company: "AUTO", location: "Main Office" }, // Will be handled by row-level logic
  "Edmonton": { company: "Alternate Technologies", location: "Edmonton" },
  "Edson": { company: "Bannister Chevrolet", location: "Edson" },
  "Sherwood": { company: "Baseline Collision Repair", location: "Sherwood Park" },
  "Boiler Makers Union Local 555": { company: "Boilermakers Union Local 555", location: "Main Office" },
  "#676 Edmonton": { company: "Canadian Tire", location: "#676 Edmonton" },
  "Fire Dep": { company: "City of Lloydminster", location: "Fire Dept" },
  "Innisfail": { company: "CSN", location: "Innisfail" },
  "Red Deer": { company: "CSN", location: "Red Deer" },
  "Herbers - Edmonton": { company: "CSN", location: "Herbers - Edmonton" },
  "32 Ave NE - Calgary": { company: "CSN", location: "32 Ave NE - Calgary" },
  "Absolute Collision - Stony Plain": { company: "CSN", location: "Absolute Collision - Stony Plain" },
  "Autotech - Lacombe AB": { company: "CSN", location: "Autotech - Lacombe AB" },
  "Avalon - Slave Lake": { company: "CSN", location: "Avalon - Slave Lake" },
  "Auto Shoppe": { company: "CSN", location: "Auto Shoppe" },
  "Sherwood Park": { company: "CSN", location: "Sherwood Park" },
  "Burnsland - Calgary": { company: "CSN", location: "Burnsland - Calgary" },
  "Brennan Collision - Stettler": { company: "CSN", location: "Brennan Collision - Stettler" },
  "Cascade Collision - Hinton": { company: "CSN", location: "Cascade Collision - Hinton" },
  "Downtown - Calgary": { company: "CSN", location: "Downtown - Calgary" },
  "Eastgate - Calgary": { company: "CSN", location: "Eastgate - Calgary" },
  "Caliber - Red Deer": { company: "CSN", location: "Caliber - Red Deer" },
  "Sunridge - Calgary": { company: "CSN", location: "Sunridge - Calgary" },
  "Collision NE": { company: "Craftsman", location: "Collision NE" },
  "Collision SW": { company: "Craftsman", location: "Collision SW" },
  "#12 - Calgary": { company: "Fountain Tire", location: "#12 - Calgary" },
  "#20 - Edmonton": { company: "Fountain Tire", location: "#20 - Edmonton" },
  "#56 -High Prairie": { company: "Fountain Tire", location: "#56 - High Prairie" },
  "#59 - Lloydminister": { company: "Fountain Tire", location: "#59 - Lloydminister" },
  "#63 - Edmonton": { company: "Fountain Tire", location: "#63 - Edmonton" },
  "#66 - Calgary": { company: "Fountain Tire", location: "#66 - Calgary" },
  "#084 - Westaskiwin": { company: "Fountain Tire", location: "#084 - Westaskiwin" },
  "#096 - Calgary AB": { company: "Fountain Tire", location: "#096 - Calgary AB" },
  "#097 - St Paul": { company: "Fountain Tire", location: "#097 - St Paul" },
  "East - Edmonton": { company: "Herbers", location: "East - Edmonton" },
  "Grande Prairie": { company: "Herbers", location: "Grande Prairie" },
  "Grand Prairie North": { company: "Herbers", location: "Grand Prairie North" },
  "Leduc": { company: "Herbers", location: "Leduc" },
  "North - Edmonton": { company: "Herbers", location: "North - Edmonton" },
  "South - Edmonton": { company: "Herbers", location: "South - Edmonton" },
  "West - Edmonton": { company: "Herbers", location: "West - Edmonton" },
  "Hinton": { company: "Integra Tire", location: "Hinton" },
  "Ponoka": { company: "Integra Tire", location: "Ponoka" },
  "Taber": { company: "Integra Tire", location: "Taber" },
  "Wainwright": { company: "Integra Tire", location: "Wainwright" },
  "Alberta": { company: "Local 146", location: "Alberta" },
  "Calgary AB": { company: "MB Autoworks", location: "Calgary AB" },
  "Medicine Hat": { company: "Moduline Industries Canada Ltd", location: "Medicine Hat" },
  "Linden AB": { company: "Tank Traders", location: "Linden AB" },
  "Edson AB": { company: "Trans Mountain Pipeline", location: "Edson AB" },
  "Gainford AB": { company: "Trans Mountain Pipeline", location: "Gainford AB" },
  "Hardisty": { company: "Trans Mountain Pipeline", location: "Hardisty" },
  "Jasper AB": { company: "Trans Mountain Pipeline", location: "Jasper AB" },
  "Sherwood Park AB": { company: "Trans Mountain Pipeline", location: "Sherwood Park AB" },
  "Tofield Tire & Battery": { company: "Treadpro", location: "Tofield Tire & Battery" },
  "Calgary": { company: "Union Tractor", location: "Calgary" },
  "Grand Prairie": { company: "Union Tractor", location: "Grand Prairie" },
  "Acheson AB": { company: "Wajax Industries", location: "Acheson AB" },
  "Thorsby AB": { company: "Westower Communications", location: "Thorsby AB" }
};

// ---------------------------------------------------------------------------
// Column Mappings
// ---------------------------------------------------------------------------
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
        <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Smart Mapper: Uses the IMPORT_MAP for perfect sorting.</p>
      </div>
      <div class="form-card legacy-import-wrap">
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone__icon">📂</div>
          <div class="drop-zone__text">Drop your Masterfile .xlsx here</div>
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
    showError(container, "Failed: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Excel Parsing with Translation Map
// ---------------------------------------------------------------------------
function parseExcel(buffer, filename) {
  const XLSX = window.XLSX;
  const wb = XLSX.read(buffer, { type: 'array', raw: true });
  const dataSheets = wb.SheetNames.filter(n => !n.toLowerCase().includes('template') && n !== 'IMPORT_MAP');
  
  let allRows = [], allWarnings = [];

  for (const sheetName of dataSheets) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // --- SMART MAP LOOKUP ---
    let sheetCompany = "";
    let sheetLocation = "";

    const mapping = IMPORT_MAP[sheetName];
    if (mapping) {
        sheetCompany = mapping.company;
        sheetLocation = mapping.location;
    } else {
        // Fallback if sheet not in map: Scan row 1
        for (let i = 0; i < 5; i++) {
            const cell = raw[i]?.[0];
            if (cell && String(cell).toLowerCase().includes('company:')) {
                sheetCompany = String(cell).replace(/^Company\s*:\s*/i, '').trim();
                break;
            }
        }
        sheetCompany = sheetCompany || "Unknown Company";
        sheetLocation = sheetName;
    }

    let hrIdx = -1, colIdx = {};
    for (let i = 0; i < Math.min(raw.length, 25); i++) {
      const attempt = buildColIndex(raw[i] ?? []);
      if (REQUIRED_FIELDS.every(f => f in attempt)) { hrIdx = i; colIdx = attempt; break; }
    }
    if (hrIdx === -1) continue;

    for (let i = hrIdx + 1; i < raw.length; i++) {
      const r = raw[i]; if (!r) continue;
      const firstName = str(r[colIdx.firstName]), lastName = str(r[colIdx.lastName]);
      if (!firstName && !lastName) continue;

      const testDate = parseDate(r[colIdx.testDate]);
      if (!testDate) continue;

      allRows.push({
        firstName, lastName,
        rowCompany:  sheetCompany, 
        rowLocation: sheetLocation,
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
    <div style="margin-bottom:16px"><strong>${filename}</strong> · ${rows.length} rows</div>
    <div style="max-height: 400px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px;">
      <table class="data-table" style="font-size: 11px; width: 100%;">
        <thead style="position: sticky; top: 0; background: #eee;">
          <tr><th>Company</th><th>Location</th><th>Employee</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${rows.slice(0, 100).map(r => `
            <tr>
              <td style="color:blue; font-weight:bold;">${esc(r.rowCompany)}</td>
              <td>${esc(r.rowLocation)}</td>
              <td>${esc(r.lastName)}, ${esc(r.firstName)}</td>
              <td>${esc(r.testDate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn btn-primary" id="btn-run-import">Looks Perfect - Import All →</button>
  `;
  pa.querySelector('#btn-run-import').addEventListener('click', () => runImport(parsed, container, navigate));
}

function runImport(parsed, container, navigate) {
  try {
    transaction(({ run }) => {
      const stats = doImport(parsed.rows, run);
      alert(`Success! Imported ${stats.testsInserted} tests.`);
      navigate('dashboard');
    });
  } catch (err) {
    alert("Import failed: " + err.message);
  }
}

function doImport(rows, run) {
  const coCache = {}, locCache = {}, stats = { testsInserted: 0 };
  for (const row of rows) {
    if (!coCache[row.rowCompany]) {
      let co = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [row.rowCompany]);
      if (!co) {
        run("INSERT INTO companies (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))", [row.rowCompany]);
        co = { company_id: queryOne('SELECT last_insert_rowid() AS id').id };
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
// Utils
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
  const iso = s.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return s;
  const n = Number(raw);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return null;
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
function showError(container, msg) {
  const div = document.createElement('div');
  div.className = 'alert alert-error';
  div.textContent = msg;
  container.querySelector('.form-card').appendChild(div);
}