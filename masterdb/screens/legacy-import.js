import { run as dbRun, queryOne, query, transaction } from '../db/sqlite.js'

// ---------------------------------------------------------------------------
// UI Rendering
// ---------------------------------------------------------------------------

export function renderLegacyImport(container, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Import Standardized Masterfile</h1>
        <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Optimized for Surgical CSV Export.</p>
      </div>
      <div class="form-card legacy-import-wrap">
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone__icon">📄</div>
          <div class="drop-zone__text">Drop MASTER_IMPORT_CLEAN.csv here</div>
          <input type="file" id="file-picker" accept=".csv" style="display:none" />
        </div>
        <div id="preview-area"  style="display:none"></div>
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
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const text = e.target.result;
    try {
      const parsedRows = parseSurgicalCSV(text);
      showPreview(parsedRows, file.name, container, navigate);
    } catch (err) {
      alert("Error: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// SURGICAL CSV PARSER (Matches the VBA Macro Output)
// ---------------------------------------------------------------------------

function parseSurgicalCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const allRows = [];
  
  let currentCo = "Unknown Company";
  let currentLoc = "Main Office";
  let currentProv = "AB";
  let parsingData = false;

  // Helper to split CSV lines while respecting quotes (e.g., "Hall, Michael")
  const splitCSV = (text) => {
    const result = [];
    let cur = '', inQuote = false;
    for (let char of text) {
      if (char === '"') inQuote = !inQuote;
      else if (char === ',' && !inQuote) { result.push(cur); cur = ''; }
      else cur += char;
    }
    result.push(cur);
    return result;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Metadata Detection (More robust search)
    if (line.includes("### RECORD ###") || line.toLowerCase().startsWith("company,location")) {
        parsingData = false;
        // Look at the next 2 lines to find the actual names
        for (let j = i; j < i + 3; j++) {
            if (!lines[j]) continue;
            const parts = splitCSV(lines[j]);
            // If this line isn't a header and has content, it's our Company info
            if (parts[0] && !parts[0].toLowerCase().includes("company") && !parts[0].includes("###")) {
                currentCo = parts[0].replace(/^"|"$/g, '').trim();
                currentLoc = (parts[1] || "Main Office").replace(/^"|"$/g, '').trim();
                currentProv = (parts[2] || "AB").replace(/^"|"$/g, '').trim();
                i = j; // Advance main loop
                break;
            }
        }
        continue;
    }

    // 2. Data Header Detection
    if (line.toLowerCase().startsWith("first name")) {
        parsingData = true;
        continue;
    }

    // 3. Process Data Rows
    if (parsingData) {
        const r = splitCSV(line);
        const clean = (val) => val ? val.replace(/^"|"$/g, '').trim() : "";

        // Skip labels, headers, or empty names
        if (!r[0] || clean(r[0]) === "" || clean(r[0]).includes("MMDDYYYY") || clean(r[0]).toLowerCase() === "first name") continue;

        allRows.push({
          firstName:   clean(r[0]),
          lastName:    clean(r[1]),
          occupation:  clean(r[2]),
          dob:         parseDate(clean(r[3])),
          testDate:    parseDate(clean(r[4])),
          rowCompany:  currentCo,
          rowLocation: currentLoc,
          province:    currentProv,
          wearHpd:     clean(r[5]),
          hpdType:     clean(r[6]),
          testType:    normalizeTestType(clean(r[7])),
          category:    clean(r[8]),
          l500: num(r[9]),  l1k: num(r[10]), l2k: num(r[11]), l3k: num(r[12]), l4k: num(r[13]), l6k: num(r[14]), l8k: num(r[15]),
          r500: num(r[16]), r1k: num(r[17]), r2k: num(r[18]), r3k: num(r[19]), r4k: num(r[20]), r6k: num(r[21]), r8k: num(r[22])
        });
    }
  }
  return allRows;
}

// ---------------------------------------------------------------------------
// Preview & DB Execution
// ---------------------------------------------------------------------------

function showPreview(rows, filename, container, navigate) {
  container.querySelector('#drop-zone').style.display = 'none';
  const pa = container.querySelector('#preview-area');
  pa.style.display = '';
  pa.innerHTML = `
    <div style="margin-bottom:16px"><strong>${filename}</strong> · ${rows.length} records processed</div>
    <div style="max-height: 400px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px;">
      <table class="data-table" style="font-size: 11px; width: 100%;">
        <thead style="position: sticky; top: 0; background: #eee; z-index:10;">
          <tr><th>Company</th><th>Location</th><th>Employee</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${rows.slice(0, 100).map(r => `
            <tr>
              <td style="color:#0056b3; font-weight:bold;">${esc(r.rowCompany)}</td>
              <td>${esc(r.rowLocation)}</td>
              <td>${esc(r.lastName)}, ${esc(r.firstName)}</td>
              <td>${esc(r.testDate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex; gap:10px; justify-content: flex-end;">
       <button class="btn btn-outline" onclick="location.reload()">Cancel</button>
       <button class="btn btn-primary" id="btn-run-import">Everything looks correct - Import All →</button>
    </div>
  `;
  pa.querySelector('#btn-run-import').addEventListener('click', () => runImport(rows, container, navigate));
}

function runImport(rows, container, navigate) {
  try {
    transaction(({ run }) => {
      const coCache = {}, locCache = {};
      let count = 0;

      for (const row of rows) {
        // 1. Company
        if (!coCache[row.rowCompany]) {
          let co = queryOne('SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE', [row.rowCompany]);
          if (!co) {
            run("INSERT INTO companies (name) VALUES (?)", [row.rowCompany]);
            co = { company_id: queryOne('SELECT last_insert_rowid() AS id').id };
          }
          coCache[row.rowCompany] = co.company_id;
        }
        const companyId = coCache[row.rowCompany];

        // 2. Location
        const locKey = `${companyId}|${row.rowLocation}`;
        if (!locCache[locKey]) {
          let loc = queryOne('SELECT location_id FROM locations WHERE company_id = ? AND name = ? COLLATE NOCASE', [companyId, row.rowLocation]);
          if (!loc) {
            run("INSERT INTO locations (company_id, name, province) VALUES (?, ?, ?)", [companyId, row.rowLocation, row.province]);
            loc = { location_id: queryOne('SELECT last_insert_rowid() AS id').id };
          }
          locCache[locKey] = loc.location_id;
        }
        const locationId = locCache[locKey];

        // 3. Employee
        let emp = queryOne('SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE', [locationId, row.firstName, row.lastName]);
        let eid = emp ? emp.employee_id : null;
        if (!eid) {
          run("INSERT INTO employees (location_id, first_name, last_name, dob, job_title) VALUES (?, ?, ?, ?, ?)", [locationId, row.firstName, row.lastName, row.dob, row.occupation]);
          eid = queryOne('SELECT last_insert_rowid() AS id').id;
        }

        // 4. Test (Matches 22 column schema + created_at)
        if (!queryOne('SELECT test_id FROM tests WHERE employee_id = ? AND test_date = ?', [eid, row.testDate])) {
          const hpdNote = row.wearHpd ? `HPD: ${row.wearHpd} (${row.hpdType})` : null;
          run(`INSERT INTO tests (employee_id, location_id, test_date, test_type, province, 
               left_500, left_1k, left_2k, left_3k, left_4k, left_6k, left_8k, 
               right_500, right_1k, right_2k, right_3k, right_4k, right_6k, right_8k, 
               classification, tech_notes, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, 
               [eid, locationId, row.testDate, row.testType, row.province, 
                row.l500, row.l1k, row.l2k, row.l3k, row.l4k, row.l6k, row.l8k, 
                row.r500, row.r1k, row.r2k, row.r3k, row.r4k, row.r6k, row.r8k, 
                row.category, hpdNote]);
          count++;
        }
      }
      alert(`Success! Imported ${count} tests.`);
      navigate('dashboard');
    });
  } catch (err) {
    alert("Import failed: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toUpperCase();
    const MONTHS = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',SEPT:'09',JULY:'07',JUNE:'06'};
    
    // Handles MAR 2 2021
    const spaceMatch = s.match(/^([A-Z]+)\s+(\d{1,2})\s+(\d{4})$/);
    if (spaceMatch) {
        const mo = MONTHS[spaceMatch[1]];
        if (!mo) return null;
        return `${spaceMatch[3]}-${mo}-${spaceMatch[2].padStart(2,'0')}`;
    }
    // Handles 3/2/2021
    const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) return `${slashMatch[3]}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`;
    
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function num(v) { 
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, '')); 
  return isNaN(n) ? null : n; 
}
function str(v) { return v == null ? '' : String(v).trim(); }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function normalizeTestType(s) { 
    s = (s || '').toUpperCase(); 
    if (s.includes('BASE')) return 'Baseline'; 
    return 'Periodic'; 
}