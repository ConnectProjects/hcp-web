/**
 * screens/data-tools.js
 * 
 * Central maintenance hub for MasterDB.
 * Features: Employee/Location transfers, Duplicate Detection, and Legacy Import.
 */

import { query, queryOne, run, transaction, logAction } from '../db/sqlite.js'
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
          <h3>Duplicate Employee Detection</h3>
          <p class="help-text">Finds employees sharing the same name. Select which record to keep — all tests and baselines from duplicates will be merged onto it.</p>
          <button class="btn btn-outline" id="btn-scan-dupes">🔍 Scan for Duplicates</button>
          <div id="dupe-results" style="margin-top:20px"></div>
        </div>

        <div class="form-card" style="margin-top:20px">
          <h3>Duplicate Location Cleanup</h3>
          <p class="help-text">Finds locations where one name is a variant of another: a comma-province suffix ("#719 Saskatoon, SK"), a bare province suffix ("#097 Red Deer AB"), or an extra " - " separator ("#091 - Red Deer"). In each case the variant is merged into the canonical name — employees matched by full name + DOB are merged, unmatched employees are moved.</p>
          <button class="btn btn-outline" id="btn-scan-loc-dupes">🔍 Scan for Duplicate Locations</button>
          <div id="loc-dupe-results" style="margin-top:20px"></div>
        </div>

        <div class="form-card" style="margin-top:20px">
          <h3>Baseline Integrity Fix</h3>
          <p class="help-text">Ensures each employee has exactly one Baseline test (the earliest by date). In the baselines table, only the earliest record per employee+location remains active — any extras are archived. Run this after a location merge.</p>
          <button class="btn btn-outline" id="btn-scan-baselines">🔍 Scan for Baseline Issues</button>
          <div id="baseline-results" style="margin-top:20px"></div>
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
      const destLoc = queryOne('SELECT l.name, c.name AS company_name FROM locations l JOIN companies c ON c.company_id = l.company_id WHERE l.location_id = ?', [eDestLoc.value]);
      transaction(({ run }) => {
        const ids = selected.join(',');
        run(`UPDATE employees SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
        run(`UPDATE tests SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
        run(`UPDATE baselines SET location_id = ? WHERE employee_id IN (${ids})`, [eDestLoc.value]);
      });
      logAction(state, 'MOVE_EMPLOYEES', `Moved ${selected.length} employee(s) to "${destLoc?.name}" at "${destLoc?.company_name}"`)
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
      const loc = queryOne('SELECT name FROM locations WHERE location_id = ?', [lToMove.value]);
      const destCo = queryOne('SELECT name FROM companies WHERE company_id = ?', [lDestCo.value]);
      run("UPDATE locations SET company_id = ? WHERE location_id = ?", [lDestCo.value, lToMove.value]);
      logAction(state, 'TRANSFER_LOCATION', `Transferred location "${loc?.name}" to company "${destCo?.name}"`)
      await JsonDatabase.pushMaster(state.syncFolder, query);
      alert("Location transferred.");
      navigate('dashboard');
    }
  };

  // --- DUPLICATE SCANNER ---
  container.querySelector('#btn-scan-dupes').onclick = () => {
    const dupeNames = query(`
      SELECT LOWER(first_name) AS fn, LOWER(last_name) AS ln, location_id, COUNT(*) AS cnt
      FROM employees
      GROUP BY LOWER(first_name), LOWER(last_name), location_id
      HAVING cnt > 1
      ORDER BY ln, fn
    `);

    const res = container.querySelector('#dupe-results');
    if (dupeNames.length === 0) {
      res.innerHTML = '<p style="color:green">✓ No duplicate employee names found.</p>';
      return;
    }

    let html = `<p style="margin-bottom:16px"><strong>${dupeNames.length} duplicate name(s) found.</strong> Select which record to keep per group, then click Merge.</p>`;

    for (const d of dupeNames) {
      const records = query(`
        SELECT e.employee_id, e.first_name, e.last_name, e.dob, e.job_title,
               l.name AS location_name, l.province,
               c.name AS company_name,
               (SELECT COUNT(*) FROM tests t WHERE t.employee_id = e.employee_id) AS test_count,
               (SELECT COUNT(*) FROM baselines b WHERE b.employee_id = e.employee_id) AS baseline_count
        FROM employees e
        LEFT JOIN locations l ON l.location_id = e.location_id
        LEFT JOIN companies c ON c.company_id = l.company_id
        WHERE LOWER(e.first_name) = ? AND LOWER(e.last_name) = ? AND e.location_id = ?
        ORDER BY test_count DESC
      `, [d.fn, d.ln, d.location_id]);

      const groupId = `grp-${records[0].employee_id}`;
      html += `
        <div class="form-card" style="margin-bottom:16px; border-left:4px solid #f0ad4e">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
            <strong>${esc(records[0].last_name)}, ${esc(records[0].first_name)}</strong>
            <button class="btn btn-sm btn-primary" data-group="${groupId}" id="btn-merge-${groupId}">Merge & Keep Selected →</button>
          </div>
          <table class="data-table" style="font-size:12px; width:100%">
            <thead>
              <tr>
                <th style="width:30px">Keep</th>
                <th>Company</th>
                <th>Location</th>
                <th>DOB</th>
                <th>Job Title</th>
                <th>Tests</th>
                <th>Baselines</th>
              </tr>
            </thead>
            <tbody>
              ${records.map((r, idx) => `
                <tr style="${idx === 0 ? 'background:#f0fff0' : ''}">
                  <td style="text-align:center">
                    <input type="radio" name="${groupId}" value="${r.employee_id}" ${idx === 0 ? 'checked' : ''}>
                  </td>
                  <td>${esc(r.company_name || '—')}</td>
                  <td>${esc(r.location_name || '—')} ${r.province ? `(${r.province})` : ''}</td>
                  <td>${esc(r.dob || '—')}</td>
                  <td>${esc(r.job_title || '—')}</td>
                  <td><strong>${r.test_count}</strong></td>
                  <td>${r.baseline_count}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    res.innerHTML = html;

    // Wire up merge buttons
    res.querySelectorAll('[id^="btn-merge-"]').forEach(btn => {
      btn.onclick = () => {
        const groupId = btn.dataset.group;
        const keepId = parseInt(res.querySelector(`input[name="${groupId}"]:checked`).value);
        const allIds = Array.from(res.querySelectorAll(`input[name="${groupId}"]`)).map(r => parseInt(r.value));
        const deleteIds = allIds.filter(id => id !== keepId);

        const keepEmp = queryOne('SELECT first_name, last_name FROM employees WHERE employee_id = ?', [keepId]);
        const totalTests = deleteIds.reduce((sum, id) => {
          return sum + (queryOne('SELECT COUNT(*) AS n FROM tests WHERE employee_id = ?', [id])?.n ?? 0);
        }, 0);
        const totalBaselines = deleteIds.reduce((sum, id) => {
          return sum + (queryOne('SELECT COUNT(*) AS n FROM baselines WHERE employee_id = ?', [id])?.n ?? 0);
        }, 0);

        if (!confirm(`Merge ${deleteIds.length} duplicate(s) into the selected record?\n\n${totalTests} test(s) and ${totalBaselines} baseline(s) will be reassigned. The duplicates will be permanently deleted.`)) return;

        try {
          transaction(({ run }) => {
            for (const dupId of deleteIds) {
              run('UPDATE tests     SET employee_id = ? WHERE employee_id = ?', [keepId, dupId]);
              run('UPDATE baselines SET employee_id = ? WHERE employee_id = ?', [keepId, dupId]);
              run('DELETE FROM employees WHERE employee_id = ?', [dupId]);
            }
          });
          logAction(state, 'MERGE_EMPLOYEES', `Merged ${deleteIds.length} duplicate(s) of "${keepEmp?.last_name}, ${keepEmp?.first_name}" — ${totalTests} test(s) and ${totalBaselines} baseline(s) reassigned`)
          btn.closest('.form-card').innerHTML = `<p style="color:green">✓ Merged successfully — ${deleteIds.length} duplicate(s) removed, ${totalTests} test(s) reassigned.</p>`;
        } catch (err) {
          alert('Merge failed: ' + err.message);
        }
      };
    });
  };

  // --- LOCATION DUPLICATE CLEANUP ---
  container.querySelector('#btn-scan-loc-dupes').onclick = () => {
    const pairs = query(`
      SELECT
        l_good.location_id AS canonical_id,
        l_good.name        AS canonical_name,
        l_bad.location_id  AS bad_id,
        l_bad.name         AS bad_name,
        c.name             AS company_name,
        (SELECT COUNT(*) FROM employees WHERE location_id = l_bad.location_id)  AS bad_emp_count,
        (SELECT COUNT(*) FROM tests     WHERE location_id = l_bad.location_id)  AS bad_test_count,
        (SELECT COUNT(*) FROM employees WHERE location_id = l_good.location_id) AS good_emp_count,
        (SELECT COUNT(*) FROM tests     WHERE location_id = l_good.location_id) AS good_test_count
      FROM locations l_bad
      JOIN locations l_good
        ON  l_bad.company_id  = l_good.company_id
        AND l_bad.location_id != l_good.location_id
        AND (
              l_bad.name = l_good.name || ', SK' OR
              l_bad.name = l_good.name || ', AB' OR
              l_bad.name = l_good.name || ', BC' OR
              (l_bad.name LIKE '% - %' AND REPLACE(l_bad.name, ' - ', ' ') = l_good.name) OR
              (
                (l_bad.name LIKE '% AB' OR l_bad.name LIKE '% SK' OR l_bad.name LIKE '% BC')
                AND SUBSTR(l_bad.name, 1, LENGTH(l_bad.name) - 3) = l_good.name
              ) OR
              (
                (l_bad.name LIKE '% - % AB' OR l_bad.name LIKE '% - % SK' OR l_bad.name LIKE '% - % BC')
                AND REPLACE(SUBSTR(l_bad.name, 1, LENGTH(l_bad.name) - 3), ' - ', ' ') = l_good.name
              )
            )
      JOIN companies c ON c.company_id = l_bad.company_id
      WHERE l_bad.active = 1 AND l_good.active = 1
      ORDER BY c.name, l_good.name
    `);

    const res = container.querySelector('#loc-dupe-results');
    if (pairs.length === 0) {
      res.innerHTML = '<p style="color:green">✓ No duplicate location names found.</p>';
      return;
    }

    let html = `<p style="margin-bottom:16px"><strong>${pairs.length} duplicate location pair(s) found.</strong> Review below, then merge individually or all at once.</p>`;
    html += `<button class="btn" id="btn-merge-all-locs" style="margin-bottom:20px; background:#d9534f; color:#fff">⚠ Merge All ${pairs.length} Pairs</button>`;

    for (const p of pairs) {
      html += `
        <div class="form-card" style="margin-bottom:16px; border-left:4px solid #d9534f">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
            <strong>${esc(p.company_name)}</strong>
            <button class="btn btn-sm btn-primary btn-merge-loc-pair"
              data-canonical="${p.canonical_id}"
              data-bad="${p.bad_id}"
              data-label="${esc(p.canonical_name)}">Merge This Pair →</button>
          </div>
          <table class="data-table" style="font-size:12px; width:100%">
            <thead><tr><th>Role</th><th>Location Name</th><th>Employees</th><th>Tests</th></tr></thead>
            <tbody>
              <tr style="background:#f0fff0">
                <td><strong>Keep</strong></td><td>${esc(p.canonical_name)}</td>
                <td>${p.good_emp_count}</td><td>${p.good_test_count}</td>
              </tr>
              <tr style="background:#fff0f0">
                <td><strong>Remove</strong></td><td>${esc(p.bad_name)}</td>
                <td>${p.bad_emp_count}</td><td>${p.bad_test_count}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }

    res.innerHTML = html;

    // Executes one canonical←bad location merge; returns counts for logging.
    const doMerge = (canonicalId, badId, label) => {
      const badEmps = query('SELECT * FROM employees WHERE location_id = ?', [badId]);

      const toMerge = [], toMove = [];
      for (const e of badEmps) {
        const match = queryOne(
          `SELECT employee_id FROM employees
            WHERE location_id = ?
              AND LOWER(first_name) = LOWER(?)
              AND LOWER(last_name)  = LOWER(?)
              AND (dob = ? OR (dob IS NULL AND ? IS NULL))`,
          [canonicalId, e.first_name, e.last_name, e.dob, e.dob]
        );
        if (match) toMerge.push({ badEmpId: e.employee_id, canonicalEmpId: match.employee_id });
        else        toMove.push(e.employee_id);
      }

      transaction(({ run }) => {
        for (const { badEmpId, canonicalEmpId } of toMerge) {
          run('UPDATE tests       SET employee_id = ? WHERE employee_id = ?', [canonicalEmpId, badEmpId]);
          run('UPDATE baselines   SET employee_id = ? WHERE employee_id = ?', [canonicalEmpId, badEmpId]);
          run('UPDATE employment  SET employee_id = ? WHERE employee_id = ?', [canonicalEmpId, badEmpId]);
          run('DELETE FROM employees WHERE employee_id = ?', [badEmpId]);
        }
        for (const id of toMove) {
          run("UPDATE employees SET location_id = ?, updated_at = datetime('now') WHERE employee_id = ?", [canonicalId, id]);
        }
        run('UPDATE tests      SET location_id = ? WHERE location_id = ?', [canonicalId, badId]);
        run('UPDATE baselines  SET location_id = ? WHERE location_id = ?', [canonicalId, badId]);
        run('UPDATE packets    SET location_id = ? WHERE location_id = ?', [canonicalId, badId]);
        run('UPDATE schedules  SET location_id = ? WHERE location_id = ?', [canonicalId, badId]);
        run('UPDATE employment SET location_id = ? WHERE location_id = ?', [canonicalId, badId]);
        run("UPDATE locations SET active = 0, updated_at = datetime('now') WHERE location_id = ?", [badId]);
      });

      logAction(state, 'MERGE_LOCATIONS',
        `Merged location id=${badId} into "${label}" (id=${canonicalId}): ${toMerge.length} emp(s) merged by DOB match, ${toMove.length} emp(s) moved`);
      return { merged: toMerge.length, moved: toMove.length };
    };

    res.querySelectorAll('.btn-merge-loc-pair').forEach(btn => {
      btn.onclick = async () => {
        const canonicalId = parseInt(btn.dataset.canonical);
        const badId       = parseInt(btn.dataset.bad);
        const label       = btn.dataset.label;
        if (!confirm(`Merge location pair for "${label}"?\n\nEmployees and tests from the province-suffixed location will be merged or moved into the canonical one. This cannot be undone.`)) return;
        try {
          const { merged, moved } = doMerge(canonicalId, badId, label);
          await JsonDatabase.pushMaster(state.syncFolder, query);
          btn.closest('.form-card').innerHTML = `<p style="color:green">✓ Done: ${merged} employee(s) merged, ${moved} moved. Synced to OneDrive.</p>`;
        } catch (err) {
          alert('Merge failed: ' + err.message);
        }
      };
    });

    res.querySelector('#btn-merge-all-locs').onclick = async () => {
      if (!confirm(`Merge all ${pairs.length} location pairs across all companies?\n\nProvince-suffixed duplicates will be merged into their canonical counterparts. This cannot be undone.`)) return;
      let totalMerged = 0, totalMoved = 0, errors = 0;
      for (const p of pairs) {
        try {
          const { merged, moved } = doMerge(p.canonical_id, p.bad_id, p.canonical_name);
          totalMerged += merged;
          totalMoved  += moved;
        } catch (err) {
          errors++;
          console.error(`Failed to merge location ${p.bad_id} → ${p.canonical_id}:`, err);
        }
      }
      try { await JsonDatabase.pushMaster(state.syncFolder, query); } catch (e) { console.error('Sync failed:', e); }
      res.innerHTML = `<p style="color:green">✓ All pairs merged: ${totalMerged} employee(s) merged by DOB match, ${totalMoved} moved across ${pairs.length} location pairs.${errors > 0 ? ` ⚠ ${errors} pair(s) failed — check console.` : ''} Synced to OneDrive.</p>`;
    };
  };

  // --- BASELINE INTEGRITY FIX ---
  container.querySelector('#btn-scan-baselines').onclick = () => {
    const dupTestRows = query(`
      SELECT employee_id, COUNT(*) AS cnt
      FROM tests
      WHERE test_type = 'Baseline'
      GROUP BY employee_id
      HAVING cnt > 1
    `);
    const dupBaselineRows = query(`
      SELECT employee_id, location_id, COUNT(*) AS cnt
      FROM baselines
      WHERE archived = 0
      GROUP BY employee_id, location_id
      HAVING cnt > 1
    `);

    const res = container.querySelector('#baseline-results');
    if (dupTestRows.length === 0 && dupBaselineRows.length === 0) {
      res.innerHTML = '<p style="color:green">✓ No baseline integrity issues found.</p>';
      return;
    }

    res.innerHTML = `
      <p>
        ${dupTestRows.length} employee(s) have more than one test marked as Baseline.<br>
        ${dupBaselineRows.length} employee–location pair(s) have more than one active baseline record.
      </p>
      <button class="btn btn-primary" id="btn-fix-baselines">Fix Baseline Integrity</button>
    `;

    res.querySelector('#btn-fix-baselines').onclick = async () => {
      if (!confirm(
        `Fix baseline integrity?\n\n` +
        `• Each employee's earliest test will be kept as Baseline; all others set to Periodic.\n` +
        `• In the baselines table, only the earliest record per employee+location stays active — extras are archived.\n\n` +
        `This cannot be undone.`
      )) return;

      try {
        transaction(({ run }) => {
          // Demote any Baseline test that isn't the employee's earliest
          run(`
            UPDATE tests SET test_type = 'Periodic', updated_at = datetime('now')
            WHERE test_type = 'Baseline'
              AND test_id NOT IN (
                SELECT MIN(t.test_id)
                FROM tests t
                JOIN (
                  SELECT employee_id, MIN(test_date) AS min_date
                  FROM tests GROUP BY employee_id
                ) e ON e.employee_id = t.employee_id AND t.test_date = e.min_date
                GROUP BY t.employee_id
              )
          `);
          // Promote the earliest test to Baseline if it isn't already
          run(`
            UPDATE tests SET test_type = 'Baseline', updated_at = datetime('now')
            WHERE test_type != 'Baseline'
              AND test_id IN (
                SELECT MIN(t.test_id)
                FROM tests t
                JOIN (
                  SELECT employee_id, MIN(test_date) AS min_date
                  FROM tests GROUP BY employee_id
                ) e ON e.employee_id = t.employee_id AND t.test_date = e.min_date
                GROUP BY t.employee_id
              )
          `);
          // Archive duplicate active baselines — keep only the earliest per employee+location
          run(`
            UPDATE baselines SET archived = 1, updated_at = datetime('now')
            WHERE archived = 0
              AND baseline_id NOT IN (
                SELECT MIN(b.baseline_id)
                FROM baselines b
                JOIN (
                  SELECT employee_id, location_id, MIN(test_date) AS min_date
                  FROM baselines WHERE archived = 0
                  GROUP BY employee_id, location_id
                ) e ON e.employee_id = b.employee_id
                   AND (b.location_id = e.location_id OR (b.location_id IS NULL AND e.location_id IS NULL))
                   AND b.test_date = e.min_date
                GROUP BY b.employee_id, b.location_id
              )
          `);
        });

        logAction(state, 'FIX_BASELINES',
          `Baseline integrity fix: ${dupTestRows.length} employee(s) had extra Baseline tests demoted to Periodic; ${dupBaselineRows.length} employee-location pair(s) had duplicate baseline records archived`);
        await JsonDatabase.pushMaster(state.syncFolder, query);
        res.innerHTML = `<p style="color:green">✓ Fixed: ${dupTestRows.length} employee(s) corrected in tests table; ${dupBaselineRows.length} employee–location pair(s) had duplicates archived. Synced to OneDrive.</p>`;
      } catch (err) {
        alert('Fix failed: ' + err.message);
      }
    };
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
      logAction(state, 'LEGACY_IMPORT', `Imported ${parsedRows.length} test record(s) from CSV`)
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
