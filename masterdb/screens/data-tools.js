/**
 * screens/data-tools.js
 * 
 * Central maintenance hub for MasterDB.
 * Features: Employee/Location transfers, Duplicate Detection, and Legacy Import.
 */

import { query, queryOne, run, transaction } from '../db/sqlite.js'
import { JsonDatabase } from '../../shared/fs/json-database.js'
import { createTest } from '../db/tests.js'
import { createBaseline } from '../db/employees.js'

export function renderDataTools(container, state, navigate) {
  // 1. Initial Data Fetch
  const companies = query("SELECT company_id, name FROM companies WHERE active = 1 ORDER BY name ASC");

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Data Management Tools</h1>
      </div>

      <div class="tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #ddd;">
        <button class="tab-btn active" data-tab="move-emp">Move Employees</button>
        <button class="tab-btn" data-tab="move-loc">Transfer Locations</button>
        <button class="tab-btn" data-tab="cleanup">Intelligent Cleanup</button>
        <button class="tab-btn" data-tab="import">Legacy Import</button>
      </div>

      <!-- TAB 1: MOVE EMPLOYEES -->
      <div id="tab-move-emp" class="tab-content">
        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-card">
            <h3>Source (From)</h3>
            <div class="form-group">
              <label>Company</label>
              <select id="emp-src-co" class="search-input">
                <option value="">-- Select --</option>
                ${companies.map(c => `<option value="${c.company_id}">${esc(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Location</label>
              <select id="emp-src-loc" class="search-input" disabled></select>
            </div>
            <div id="emp-list-container" style="margin-top:15px; border:1px solid #eee; max-height:200px; overflow-y:auto; display:none;">
                <table class="data-table" style="font-size:11px;">
                    <thead><tr><th style="width:20px"><input type="checkbox" id="chk-all-emp"></th><th>Name</th></tr></thead>
                    <tbody id="emp-list-tbody"></tbody>
                </table>
            </div>
          </div>
          <div class="form-card">
            <h3>Destination (To)</h3>
            <div class="form-group">
              <label>Company</label>
              <select id="emp-dest-co" class="search-input">
                <option value="">-- Select --</option>
                ${companies.map(c => `<option value="${c.company_id}">${esc(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Location</label>
              <select id="emp-dest-loc" class="search-input" disabled></select>
            </div>
            <button class="btn btn-primary btn-block" id="btn-do-move-emp" style="margin-top:40px" disabled>Execute Employee Move</button>
          </div>
        </div>
      </div>

      <!-- TAB 2: TRANSFER LOCATIONS -->
      <div id="tab-move-loc" class="tab-content" style="display:none">
        <div class="form-card" style="max-width:500px">
          <h3>Re-parent Location</h3>
          <p class="help-text">Move an entire location (and all its employees) to a different company.</p>
          <div class="form-group">
            <label>Source Company</label>
            <select id="loc-src-co" class="search-input">
                <option value="">-- Select --</option>
                ${companies.map(c => `<option value="${c.company_id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Location to Move</label>
            <select id="loc-to-move" class="search-input" disabled></select>
          </div>
          <div class="form-group">
            <label>Target Parent Company</label>
            <select id="loc-dest-co" class="search-input">
                <option value="">-- Select --</option>
                ${companies.map(c => `<option value="${c.company_id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary btn-block" id="btn-do-move-loc" style="background:#d9534f">Transfer Entire Location</button>
        </div>
      </div>

      <!-- TAB 3: INTELLIGENT CLEANUP -->
      <div id="tab-cleanup" class="tab-content" style="display:none">
        <div class="form-card">
          <h3>Duplicate Detection</h3>
          <p class="help-text">Scanning for potential name matches across different IDs.</p>
          <button class="btn btn-outline" id="btn-scan-dupes">🔍 Scan for Duplicates</button>
          <div id="dupe-results" style="margin-top:20px"></div>
        </div>
      </div>

      <!-- TAB 4: LEGACY IMPORT -->
      <div id="tab-import" class="tab-content" style="display:none">
        <div class="form-card">
          <h3>Surgical CSV Import</h3>
          <div class="drop-zone" id="drop-zone" style="border:2px dashed #ccc; padding:40px; text-align:center; cursor:pointer;">
            <strong>Drop MASTER_IMPORT_CLEAN.csv here</strong>
            <input type="file" id="file-picker" accept=".csv" style="display:none" />
          </div>
          <div id="import-preview" class="hidden" style="margin-top:20px">
            <div id="preview-count" style="font-weight:bold; margin-bottom:10px"></div>
            <div style="max-height:300px; overflow:auto; border:1px solid #eee">
                <table class="data-table" style="font-size:11px">
                    <tbody id="preview-tbody"></tbody>
                </table>
            </div>
            <button class="btn btn-primary" id="btn-run-import" style="margin-top:15px">Confirm & Import All</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- TAB LOGIC ---
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      btn.classList.add('active');
      container.querySelector(`#tab-${btn.dataset.tab}`).style.display = 'block';
    };
  });

  const updateLocs = (coId, selectId) => {
    const select = container.querySelector(`#${selectId}`);
    if (!coId) { select.disabled = true; return; }
    const locs = query("SELECT location_id, name FROM locations WHERE company_id = ?", [coId]);
    select.innerHTML = '<option value="">-- Select --</option>' + locs.map(l => `<option value="${l.location_id}">${esc(l.name)}</option>`).join('');
    select.disabled = false;
  };

  // --- EMPLOYEE MOVE HANDLERS ---
  const eSrcCo = container.querySelector('#emp-src-co');
  const eSrcLoc = container.querySelector('#emp-src-loc');
  const eDestCo = container.querySelector('#emp-dest-co');
  const eDestLoc = container.querySelector('#emp-dest-loc');
  const btnMoveEmp = container.querySelector('#btn-do-move-emp');

  eSrcCo.onchange = () => updateLocs(eSrcCo.value, 'emp-src-loc');
  eDestCo.onchange = () => updateLocs(eDestCo.value, 'emp-dest-loc');
  eSrcLoc.onchange = () => {
    const emps = query("SELECT employee_id, first_name, last_name FROM employees WHERE location_id = ? ORDER BY last_name", [eSrcLoc.value]);
    container.querySelector('#emp-list-tbody').innerHTML = emps.map(e => `<tr><td><input type="checkbox" class="emp-chk" value="${e.employee_id}"></td><td>${esc(e.last_name)}, ${esc(e.first_name)}</td></tr>`).join('');
    container.querySelector('#emp-list-container').style.display = 'block';
    btnMoveEmp.disabled = false;
  };

  btnMoveEmp.onclick = async () => {
    const selected = Array.from(container.querySelectorAll('.emp-chk:checked')).map(c => c.value);
    if (!eDestLoc.value || selected.length === 0) return alert("Select destination and employees.");
    if (confirm(`Move ${selected.length} employees?`)) {
      transaction(({ run }) => {
        const ids = selected.join(',');
        run(`UPDATE employees SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
        run(`UPDATE tests SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
        run(`UPDATE baselines SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
      });
      await JsonDatabase.pushMaster(state.syncFolder, query);
      alert("Employees moved and synced.");
      navigate('dashboard');
    }
  };

  // --- LOCATION TRANSFER HANDLER ---
  const lSrcCo = container.querySelector('#loc-src-co');
  const lToMove = container.querySelector('#loc-to-move');
  const lDestCo = container.querySelector('#loc-dest-co');

  lSrcCo.onchange = () => updateLocs(lSrcCo.value, 'loc-to-move');
  container.querySelector('#btn-do-move-loc').onclick = async () => {
    if (!lToMove.value || !lDestCo.value) return alert("Select source location and target company.");
    if (confirm("Move entire location and all its employees?")) {
      run("UPDATE locations SET company_id = ? WHERE location_id = ?", [lDestCo.value, lToMove.value]);
      await JsonDatabase.pushMaster(state.syncFolder, query);
      alert("Location transferred.");
      navigate('dashboard');
    }
  };

  // --- DUPLICATE SCANNER ---
  container.querySelector('#btn-scan-dupes').onclick = () => {
    const dupes = query(`
        SELECT first_name, last_name, COUNT(*) as count 
        FROM employees 
        GROUP BY first_name, last_name 
        HAVING count > 1
    `);
    const res = container.querySelector('#dupe-results');
    if (dupes.length === 0) { res.innerHTML = "<p>No exact name duplicates found.</p>"; return; }
    
    res.innerHTML = `<h4>Potential Employee Duplicates</h4>` + dupes.map(d => `
        <div class="alert alert-warn" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px">
            <span>${esc(d.last_name)}, ${esc(d.first_name)} (${d.count} records)</span>
            <button class="btn btn-sm btn-primary" onclick="alert('Search for this name in Employees to resolve manually.')">View</button>
        </div>
    `).join('');
  };

  // --- LEGACY IMPORT LOGIC ---
  const picker = container.querySelector('#file-picker');
  container.querySelector('#drop-zone').onclick = () => picker.click();
  
  let parsedRows = [];
  picker.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    parsedRows = parseSurgicalCSV(text);
    container.querySelector('#preview-count').textContent = `${parsedRows.length} records detected.`;
    container.querySelector('#preview-tbody').innerHTML = parsedRows.slice(0, 10).map(r => `<tr><td>${esc(r.rowCompany)}</td><td>${esc(r.lastName)}</td><td>${r.testDate}</td></tr>`).join('');
    container.querySelector('#import-preview').classList.remove('hidden');
    container.querySelector('#drop-zone').classList.add('hidden');
  };

  container.querySelector('#btn-run-import').onclick = async () => {
    const btn = container.querySelector('#btn-run-import');
    btn.disabled = true; btn.textContent = "Processing...";

    try {
        transaction(() => {
            for (const row of parsedRows) {
                let co = queryOne("SELECT company_id FROM companies WHERE name = ? COLLATE NOCASE", [row.rowCompany]);
                if (!co) {
                    run("INSERT INTO companies (name, active) VALUES (?, 1)", [row.rowCompany]);
                    co = { company_id: queryOne("SELECT last_insert_rowid() as id").id };
                }
                let loc = queryOne("SELECT location_id FROM locations WHERE company_id = ? AND name = ? COLLATE NOCASE", [co.company_id, row.rowLocation]);
                if (!loc) {
                    run("INSERT INTO locations (company_id, name, province, active) VALUES (?, ?, ?, 1)", [co.company_id, row.rowLocation, row.province]);
                    loc = { location_id: queryOne("SELECT last_insert_rowid() as id").id };
                }
                let emp = queryOne("SELECT employee_id FROM employees WHERE location_id = ? AND first_name = ? AND last_name = ?", [loc.location_id, row.firstName, row.lastName]);
                if (!emp) {
                    run("INSERT INTO employees (location_id, first_name, last_name, dob, job_title, status) VALUES (?, ?, ?, ?, ?, 'active')", 
                        [loc.location_id, row.firstName, row.lastName, row.dob, row.occupation]);
                    emp = { employee_id: queryOne("SELECT last_insert_rowid() as id").id };
                }
                createTest({ ...row, test_date: row.testDate, test_type: row.testType, employee_id: emp.employee_id, location_id: loc.location_id });
                
                // AUTO-BASELINE: If this is the first test for this employee ID, set it as baseline
                const tCount = queryOne("SELECT COUNT(*) as n FROM tests WHERE employee_id = ?", [emp.employee_id]).n;
                if (tCount === 1) createBaseline(emp.employee_id, loc.location_id, row.testDate, row);
            }
        });
        await JsonDatabase.pushMaster(state.syncFolder, query);
        alert("Import complete and synced!");
        navigate('dashboard');
    } catch (err) { alert(err.message); btn.disabled = false; }
  };
}

// --- SHARED UTILS ---
function parseSurgicalCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const allRows = [];
  let currentCo = "Unknown Company", currentLoc = "Main Office", currentProv = "AB", parsingData = false;

  const splitSafe = (line) => {
    const result = []; let current = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(',,,')) continue;
    if (line.includes("### RECORD ###")) {
      parsingData = false;
      const m = splitSafe(lines[i + 2] || "");
      if (m.length >= 2) {
        currentCo  = m[0].replace(/^"|"$/g, '') || "Unknown Company";
        currentLoc = m[1].replace(/^"|"$/g, '') || "Main Office";
        currentProv = m[2] || "AB";
      }
      i += 2; continue;
    }
    if (line.toLowerCase().startsWith("first name,surname")) { parsingData = true; continue; }
    if (parsingData) {
      const r = splitSafe(line);
      if (r.length < 5 || r[0].toLowerCase() === "first name" || r[0].includes("MMDDYYYY")) continue;
      const testDate = parseDate(r[4]);
      if (!testDate) continue;
      allRows.push({
        firstName: r[0], lastName: r[1], occupation: r[2],
        dob: parseDate(r[3]), testDate,
        rowCompany: currentCo, rowLocation: currentLoc, province: currentProv,
        wearHpd: r[5], hpdType: r[6],
        testType: (r[7] || '').toUpperCase().includes('BASE') ? 'Baseline' : 'Periodic',
        category: r[8],
        left_500:  num(r[9]),  left_1k:  num(r[10]), left_2k:  num(r[11]), left_3k:  num(r[12]),
        left_4k:   num(r[13]), left_6k:  num(r[14]), left_8k:  num(r[15]),
        right_500: num(r[16]), right_1k: num(r[17]), right_2k: num(r[18]), right_3k: num(r[19]),
        right_4k:  num(r[20]), right_6k: num(r[21]), right_8k: num(r[22])
      });
    }
  }
  return allRows;
}

function parseDate(raw) {
  if (!raw || raw === "?") return null;
  let s = String(raw).trim().toUpperCase().replace(/-/g, ' ');
  const MONTHS = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',SEPT:'09',JULY:'07',JUNE:'06'};
  const spaceMatch = s.match(/^([A-Z]+)\s+(\d{1,4})(\s+(\d{4}))?$/);
  if (spaceMatch) {
    const mo = MONTHS[spaceMatch[1]]; if (!mo) return null;
    let day = spaceMatch[2].padStart(2, '0'), year = spaceMatch[4];
    if (!year && day.length === 2) { year = parseInt(day) > 30 ? "19" + day : "20" + day; day = "01"; }
    if (!year) year = "1900";
    return `${year}-${mo}-${day.substring(0, 2)}`;
  }
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function num(v) { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? null : n; }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
