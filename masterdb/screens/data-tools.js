import { query, transaction } from '../db/sqlite.js'

export function renderDataTools(container, state, navigate) {
  // 1. Fetch all locations with their company names for the dropdowns
  const locations = query(`
    SELECT l.location_id, l.name as loc_name, c.name as co_name 
    FROM locations l 
    JOIN companies c ON l.company_id = c.company_id 
    WHERE l.active = 1
    ORDER BY c.name, l.name
  `);

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Data Management Tools</h1>
      </div>

      <div class="form-card" style="max-width: 700px; margin: 20px auto;">
        <div style="margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
            <h3 style="color: var(--navy-mid); margin-bottom: 8px;">Bulk Move Employees</h3>
            <p style="font-size: 13px; color: #666;">
                This tool moves all employees and their entire history (Audiograms, Baselines, and Employment records) 
                from one location to another. Use this to correct import errors.
            </p>
        </div>

        <div class="form-grid">
          <div class="form-group span-2">
            <label style="font-weight: 600;">Source Location (Move FROM)</label>
            <select id="move-from" class="search-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="">-- Select the location containing the error --</option>
              ${locations.map(l => `<option value="${l.location_id}">${l.co_name.toUpperCase()} > ${l.loc_name}</option>`).join('')}
            </select>
          </div>

          <div class="span-2" style="text-align: center; padding: 15px; font-size: 24px; color: var(--grey-300);">
            <div style="background: #f8f9fa; display: inline-block; width: 40px; height: 40px; border-radius: 50%; line-height: 40px;">↓</div>
          </div>

          <div class="form-group span-2">
            <label style="font-weight: 600;">Destination Location (Move TO)</label>
            <select id="move-to" class="search-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="">-- Select the correct destination --</option>
              ${locations.map(l => `<option value="${l.location_id}">${l.co_name.toUpperCase()} > ${l.loc_name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <div id="move-stats" style="font-size: 13px; color: var(--grey-500);">
            Select locations to see employee count.
          </div>
          <button class="btn btn-primary" id="btn-execute-move" style="background: #d9534f; border-color: #d43f3a;">
            Execute Bulk Move
          </button>
        </div>
      </div>
    </div>
  `;

  const fromSelect = container.querySelector('#move-from');
  const statsDiv = container.querySelector('#move-stats');

  // Update stats when "From" location changes
  fromSelect.addEventListener('change', () => {
    if (!fromSelect.value) {
        statsDiv.textContent = "";
        return;
    }
    const count = query(`SELECT COUNT(*) as n FROM employees WHERE location_id = ?`, [fromSelect.value])[0].n;
    statsDiv.innerHTML = `Found <strong>${count}</strong> employees to move.`;
  });

  // Execute Move Logic
  container.querySelector('#btn-execute-move').addEventListener('click', () => {
    const fromId = fromSelect.value;
    const toId = container.querySelector('#move-to').value;

    if (!fromId || !toId) {
      alert("Please select both a Source and a Destination.");
      return;
    }

    if (fromId === toId) {
      alert("Source and Destination cannot be the same.");
      return;
    }

    const count = query(`SELECT COUNT(*) as n FROM employees WHERE location_id = ?`, [fromId])[0].n;
    if (count === 0) {
        alert("The source location has 0 employees. Nothing to move.");
        return;
    }

    const fromText = fromSelect.options[fromSelect.selectedIndex].text;
    const toText = container.querySelector('#move-to').options[container.querySelector('#move-to').selectedIndex].text;

    const confirmMsg = `CRITICAL ACTION:\n\nYou are about to move ${count} employees and ALL their test history:\n\nFROM: ${fromText}\nTO: ${toText}\n\nThis action cannot be undone. Proceed?`;

    if (confirm(confirmMsg)) {
      try {
        transaction(({ run }) => {
          // Move Employees
          run("UPDATE employees SET location_id = ? WHERE location_id = ?", [toId, fromId]);
          // Move Tests
          run("UPDATE tests SET location_id = ? WHERE location_id = ?", [toId, fromId]);
          // Move Baselines
          run("UPDATE baselines SET location_id = ? WHERE location_id = ?", [toId, fromId]);
          // Move Employment history records
          run("UPDATE employment SET location_id = ? WHERE location_id = ?", [toId, fromId]);
        });
        
        alert(`Success! ${count} records moved.`);
        navigate('dashboard');
      } catch (err) {
        console.error(err);
        alert("Move failed: " + err.message);
      }
    }
  });
}