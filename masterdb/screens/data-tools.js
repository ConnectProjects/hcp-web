import { query, transaction } from '../db/sqlite.js'

export function renderDataTools(container, state, navigate) {
  const companies = query("SELECT company_id, name FROM companies WHERE active = 1 ORDER BY name ASC");

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Data Management Tools</h1>
      </div>

      <div class="tabs" style="display: flex; gap: 20px; margin-bottom: 20px; border-bottom: 2px solid #eee;">
        <button class="tab-btn active" data-tab="move-emp" style="padding: 10px; border: none; background: none; cursor: pointer; font-weight: bold; border-bottom: 2px solid var(--navy-mid);">Move Employees</button>
        <button class="tab-btn" data-tab="move-loc" style="padding: 10px; border: none; background: none; cursor: pointer; font-weight: bold;">Move Locations</button>
      </div>

      <!-- TAB 1: MOVE EMPLOYEES -->
      <div id="tab-move-emp" class="tab-content">
        <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
          
          <!-- SOURCE -->
          <div class="form-card">
            <h3 style="color: var(--navy-mid);">Source</h3>
            <div class="form-group">
              <label>From Company</label>
              <select id="emp-src-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>From Location</label>
              <select id="emp-src-loc" class="search-input" disabled>
                <option value="">-- Select Location --</option>
              </select>
            </div>
            
            <div id="employee-list-wrap" style="margin-top: 15px; border: 1px solid #eee; border-radius: 4px; max-height: 300px; overflow-y: auto; display:none;">
                <table class="data-table" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th style="width: 30px;"><input type="checkbox" id="select-all-emp"></th>
                            <th>Employee Name</th>
                        </tr>
                    </thead>
                    <tbody id="employee-list-tbody"></tbody>
                </table>
            </div>
          </div>

          <!-- DESTINATION -->
          <div class="form-card">
            <h3 style="color: #28a745;">Destination</h3>
            <div class="form-group">
              <label>To Company</label>
              <select id="emp-dest-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>To Location</label>
              <select id="emp-dest-loc" class="search-input" disabled>
                <option value="">-- Select Location --</option>
              </select>
            </div>
            
            <div style="margin-top: 100px; text-align: right;">
                <button class="btn btn-primary" id="btn-move-selected-emp" disabled>Move Selected Employees</button>
            </div>
          </div>

        </div>
      </div>

      <!-- TAB 2: MOVE LOCATIONS -->
      <div id="tab-move-loc" class="tab-content" style="display:none;">
        <div class="form-card" style="max-width: 600px;">
          <h3 style="color: var(--navy-mid);">Re-parent a Location</h3>
          <p style="font-size: 12px; color: #666; margin-bottom: 20px;">Moves an entire location (and everyone in it) to a different company.</p>
          
          <div class="form-group">
            <label>Select Company (Current Owner)</label>
            <select id="loc-src-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>Select Location to Move</label>
            <select id="loc-to-move" class="search-input" disabled>
                <option value="">-- Select Location --</option>
            </select>
          </div>

          <div style="text-align: center; padding: 10px;">⬇ Move To ⬇</div>

          <div class="form-group">
            <label>Target Company (New Owner)</label>
            <select id="loc-dest-co" class="search-input">
                <option value="">-- Select Company --</option>
                ${companies.map(c => `<option value="${c.company_id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <button class="btn btn-primary" id="btn-execute-loc-move" style="width: 100%; margin-top: 20px;">Move Entire Location</button>
        </div>
      </div>

    </div>
  `;

  // --- TAB LOGIC ---
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('active');
          b.style.borderBottom = "none";
      });
      btn.classList.add('active');
      btn.style.borderBottom = "2px solid var(--navy-mid)";
      
      container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      container.querySelector(`#tab-${btn.dataset.tab}`).style.display = 'block';
    });
  });

  // --- HELPER: Load Locations into a Select ---
  const updateLocDropdown = (coId, selectId) => {
    const select = container.querySelector(`#${selectId}`);
    if (!coId) {
      select.innerHTML = '<option value="">-- Select Location --</option>';
      select.disabled = true;
      return;
    }
    const locs = query("SELECT location_id, name FROM locations WHERE company_id = ? AND active = 1", [coId]);
    select.innerHTML = '<option value="">-- Select Location --</option>' + 
      locs.map(l => `<option value="${l.location_id}">${l.name}</option>`).join('');
    select.disabled = false;
  };

  // --- EMPLOYEE MOVE LOGIC ---
  const empSrcCo = container.querySelector('#emp-src-co');
  const empSrcLoc = container.querySelector('#emp-src-loc');
  const empDestCo = container.querySelector('#emp-dest-co');
  const empDestLoc = container.querySelector('#emp-dest-loc');
  const empListWrap = container.querySelector('#employee-list-wrap');
  const empTbody = container.querySelector('#employee-list-tbody');
  const btnMoveEmp = container.querySelector('#btn-move-selected-emp');

  empSrcCo.addEventListener('change', () => updateLocDropdown(empSrcCo.value, 'emp-src-loc'));
  empDestCo.addEventListener('change', () => updateLocDropdown(empDestCo.value, 'emp-dest-loc'));

  empSrcLoc.addEventListener('change', () => {
    if (!empSrcLoc.value) {
        empListWrap.style.display = 'none';
        return;
    }
    const emps = query("SELECT employee_id, first_name, last_name FROM employees WHERE location_id = ? ORDER BY last_name, first_name", [empSrcLoc.value]);
    empTbody.innerHTML = emps.map(e => `
        <tr>
            <td><input type="checkbox" class="emp-chk" value="${e.employee_id}"></td>
            <td>${e.last_name}, ${e.first_name}</td>
        </tr>
    `).join('');
    empListWrap.style.display = 'block';
    btnMoveEmp.disabled = false;
  });

  container.querySelector('#select-all-emp').addEventListener('change', (e) => {
    container.querySelectorAll('.emp-chk').forEach(chk => chk.checked = e.target.checked);
  });

  btnMoveEmp.addEventListener('click', () => {
    const targetLocId = empDestLoc.value;
    const selectedIds = Array.from(container.querySelectorAll('.emp-chk:checked')).map(chk => chk.value);

    if (!targetLocId) return alert("Please select a destination location.");
    if (selectedIds.length === 0) return alert("Please select at least one employee.");

    if (confirm(`Move ${selectedIds.length} employees to the new location?`)) {
        try {
            transaction(({ run }) => {
                const ids = selectedIds.join(',');
                run(`UPDATE employees SET location_id = ? WHERE employee_id IN (${ids})`, [targetLocId]);
                run(`UPDATE tests SET location_id = ? WHERE employee_id IN (${ids})`, [targetLocId]);
                run(`UPDATE baselines SET location_id = ? WHERE employee_id IN (${ids})`, [targetLocId]);
                run(`UPDATE employment SET location_id = ? WHERE employee_id IN (${ids})`, [targetLocId]);
            });
            alert("Employees moved successfully.");
            navigate('dashboard');
        } catch (e) { alert(e.message); }
    }
  });

  // --- LOCATION MOVE LOGIC ---
  const locSrcCo = container.querySelector('#loc-src-co');
  const locToMove = container.querySelector('#loc-to-move');
  const locDestCo = container.querySelector('#loc-dest-co');

  locSrcCo.addEventListener('change', () => updateLocDropdown(locSrcCo.value, 'loc-to-move'));

  container.querySelector('#btn-execute-loc-move').addEventListener('click', () => {
    const locId = locToMove.value;
    const newCoId = locDestCo.value;

    if (!locId || !newCoId) return alert("Select a location and a target company.");
    
    const locName = locToMove.options[locToMove.selectedIndex].text;
    const coName = locDestCo.options[locDestCo.selectedIndex].text;

    if (confirm(`Move the entire location "${locName}" to "${coName}"?`)) {
        try {
            transaction(({ run }) => {
                // Update the location's parent company
                run("UPDATE locations SET company_id = ? WHERE location_id = ?", [newCoId, locId]);
                // Update any packets or schedules tied to this location to reflect the new company parent
                run("UPDATE packets SET company_id = ? WHERE location_id = ?", [newCoId, locId]);
                run("UPDATE schedules SET company_id = ? WHERE location_id = ?", [newCoId, locId]);
            });
            alert("Location moved successfully.");
            navigate('dashboard');
        } catch (e) { alert(e.message); }
    }
  });
}