// Version 2.1 - Cache Buster: Multi-Mode Data Tools
import { query, transaction } from '../db/sqlite.js'

export function renderDataTools(container, state, navigate) {
  const companies = query("SELECT company_id, name FROM companies WHERE active = 1 ORDER BY name ASC");

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Data Management Tools</h1>
      </div>

      <div class="tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #ddd;">
        <button class="tab-btn active" data-tab="move-emp" style="padding: 10px 20px; border: none; background: none; cursor: pointer; border-bottom: 3px solid var(--navy-mid); font-weight: bold;">Move Employees</button>
        <button class="tab-btn" data-tab="move-loc" style="padding: 10px 20px; border: none; background: none; cursor: pointer; font-weight: bold; color: #666;">Move Locations</button>
      </div>

      <!-- TAB 1: MOVE EMPLOYEES -->
      <div id="tab-move-emp" class="tab-content">
        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          
          <div class="form-card">
            <h3 style="margin-top:0">1. Source (Move FROM)</h3>
            <div class="form-group">
              <label>Company</label>
              <select id="emp-src-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Location</label>
              <select id="emp-src-loc" class="search-input" disabled>
                <option value="">-- Select Location --</option>
              </select>
            </div>
            
            <div id="emp-list-container" style="margin-top: 15px; border: 1px solid #eee; border-radius: 4px; max-height: 250px; overflow-y: auto; display:none;">
                <table class="data-table" style="font-size: 12px; width: 100%;">
                    <thead style="position: sticky; top:0; background: #f9f9f9;">
                        <tr>
                            <th style="width: 30px;"><input type="checkbox" id="select-all-emp"></th>
                            <th>Employee Name</th>
                        </tr>
                    </thead>
                    <tbody id="emp-list-tbody"></tbody>
                </table>
            </div>
          </div>

          <div class="form-card">
            <h3 style="margin-top:0">2. Destination (Move TO)</h3>
            <div class="form-group">
              <label>Company</label>
              <select id="emp-dest-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Location</label>
              <select id="emp-dest-loc" class="search-input" disabled>
                <option value="">-- Select Location --</option>
              </select>
            </div>
            
            <div style="margin-top: 50px; text-align: right;">
                <button class="btn btn-primary" id="btn-move-selected-emp" disabled>Execute Employee Move</button>
            </div>
          </div>

        </div>
      </div>

      <!-- TAB 2: MOVE LOCATIONS -->
      <div id="tab-move-loc" class="tab-content" style="display:none;">
        <div class="form-card" style="max-width: 500px;">
          <h3 style="margin-top:0">Re-parent Entire Location</h3>
          <p style="font-size: 12px; color: #666; margin-bottom: 20px;">Move a location and all its employees to a different company.</p>
          
          <div class="form-group">
            <label>Source Company</label>
            <select id="loc-src-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>Location to Move</label>
            <select id="loc-to-move" class="search-input" disabled>
                <option value="">-- Select Location --</option>
            </select>
          </div>

          <div style="text-align: center; padding: 10px; color: #ccc;">▼</div>

          <div class="form-group">
            <label>New Parent Company</label>
            <select id="loc-dest-co" class="search-input">
                <option value="">-- Select Target Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <button class="btn btn-primary" id="btn-execute-loc-move" style="width: 100%; margin-top: 10px; background: #d9534f;">Move Entire Location</button>
        </div>
      </div>
    </div>
  `;

  // --- TAB NAVIGATION ---
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => {
          b.style.borderBottom = "none";
          b.style.color = "#666";
      });
      btn.style.borderBottom = "3px solid var(--navy-mid)";
      btn.style.color = "black";
      
      container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      container.querySelector(`#tab-${btn.dataset.tab}`).style.display = 'block';
    });
  });

  // --- HELPER: Update Location Dropdowns ---
  const updateLocs = (coId, selectId) => {
    const select = container.querySelector(`#${selectId}`);
    if (!coId) { select.innerHTML = '<option value="">-- Select --</option>'; select.disabled = true; return; }
    const locs = query("SELECT location_id, name FROM locations WHERE company_id = ? AND active = 1", [coId]);
    select.innerHTML = '<option value="">-- Select Location --</option>' + locs.map(l => `<option value="${l.location_id}">${l.name}</option>`).join('');
    select.disabled = false;
  };

  // --- EMPLOYEE LOGIC ---
  const eSrcCo = container.querySelector('#emp-src-co');
  const eSrcLoc = container.querySelector('#emp-src-loc');
  const eDestCo = container.querySelector('#emp-dest-co');
  const eDestLoc = container.querySelector('#emp-dest-loc');
  const btnMoveEmp = container.querySelector('#btn-move-selected-emp');

  eSrcCo.addEventListener('change', () => updateLocs(eSrcCo.value, 'emp-src-loc'));
  eDestCo.addEventListener('change', () => updateLocs(eDestCo.value, 'emp-dest-loc'));

  eSrcLoc.addEventListener('change', () => {
    const tbody = container.querySelector('#emp-list-tbody');
    const wrap = container.querySelector('#emp-list-container');
    if (!eSrcLoc.value) { wrap.style.display = 'none'; return; }
    
    const emps = query("SELECT employee_id, first_name, last_name FROM employees WHERE location_id = ? ORDER BY last_name", [eSrcLoc.value]);
    tbody.innerHTML = emps.map(e => `<tr><td><input type="checkbox" class="emp-chk" value="${e.employee_id}"></td><td>${e.last_name}, ${e.first_name}</td></tr>`).join('');
    wrap.style.display = 'block';
    btnMoveEmp.disabled = false;
  });

  container.querySelector('#select-all-emp').addEventListener('change', (e) => {
    container.querySelectorAll('.emp-chk').forEach(c => c.checked = e.target.checked);
  });

  btnMoveEmp.addEventListener('click', () => {
    const selected = Array.from(container.querySelectorAll('.emp-chk:checked')).map(c => c.value);
    if (!eDestLoc.value) return alert("Pick a destination location.");
    if (selected.length === 0) return alert("Pick at least one employee.");

    if (confirm(`Move ${selected.length} employees?`)) {
        transaction(({ run }) => {
            const ids = selected.join(',');
            run(`UPDATE employees SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
            run(`UPDATE tests SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
            run(`UPDATE baselines SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
            run(`UPDATE employment SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
        });
        alert("Moved successfully.");
        navigate('dashboard');
    }
  });

  // --- LOCATION LOGIC ---
  const lSrcCo = container.querySelector('#loc-src-co');
  const lToMove = container.querySelector('#loc-to-move');
  const lDestCo = container.querySelector('#loc-dest-co');

  lSrcCo.addEventListener('change', () => updateLocs(lSrcCo.value, 'loc-to-move'));

  container.querySelector('#btn-execute-loc-move').addEventListener('click', () => {
    if (!lToMove.value || !lDestCo.value) return alert("Select a location and a target company.");
    if (confirm(`Move this entire location to a new company?`)) {
        transaction(({ run }) => {
            run("UPDATE locations SET company_id = ? WHERE location_id = ?", [lDestCo.value, lToMove.value]);
            run("UPDATE packets SET company_id = ? WHERE location_id = ?", [lDestCo.value, lToMove.value]);
        });
        alert("Location re-parented successfully.");
        navigate('dashboard');
    }
  });
}