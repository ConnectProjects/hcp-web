import { db } from './supabase.js';
import { requireAuth, renderUserEmail, logout } from './auth.js';
import { showToast } from './toast.js';

// ---- Boot ---------------------------------------------------
const session = await requireAuth();
if (!session) throw new Error('unauthenticated');
renderUserEmail(session);
document.getElementById('logout-btn').addEventListener('click', logout);

// ---- State --------------------------------------------------
let allRows = [];       // full list from DB
let pendingChanges = {};  // { id: { is_noise_hazard?, hazard_score? } }

await loadNaics();

// ---- Load ---------------------------------------------------
async function loadNaics() {
  const { data, error } = await db
    .from('naics_reference')
    .select('id, code, descriptor, level_depth, is_noise_hazard, hazard_score')
    .order('code');

  if (error) { showToast('Failed to load NAICS: ' + error.message, 'error'); return; }
  allRows = data ?? [];
  renderTable();
}

// ---- Filter -------------------------------------------------
function getFilteredRows() {
  const showNoise = document.querySelector('input[name=show-filter]:checked')?.value === 'noise';
  const search    = document.getElementById('admin-search').value.trim().toLowerCase();

  return allRows.filter(row => {
    if (showNoise && !row.is_noise_hazard) return false;
    if (search && !row.code.includes(search) && !row.descriptor.toLowerCase().includes(search)) return false;
    return true;
  });
}

// ---- Render -------------------------------------------------
function renderTable() {
  const rows  = getFilteredRows();
  const tbody = document.getElementById('admin-tbody');
  document.getElementById('admin-count').textContent = `${rows.length} code${rows.length !== 1 ? 's' : ''}`;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--grey-400)">No codes match.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const pending = pendingChanges[row.id] ?? {};
    const isNoise = pending.is_noise_hazard ?? row.is_noise_hazard;
    const score   = pending.hazard_score !== undefined ? pending.hazard_score : row.hazard_score;
    const isDirty = row.id in pendingChanges;

    return `<tr data-id="${row.id}" class="${isDirty ? 'dirty-row' : ''}">
      <td class="nowrap" style="font-family:monospace;font-size:12px">${esc(row.code)}</td>
      <td>${esc(row.descriptor)}</td>
      <td class="text-muted text-small">${row.level_depth ?? '—'}</td>
      <td>
        <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13px">
          <input type="checkbox" class="noise-check" data-id="${row.id}" ${isNoise ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--brand);cursor:pointer">
          <span style="color:${isNoise ? 'var(--green)' : 'var(--grey-400)'}">${isNoise ? 'Yes' : 'No'}</span>
        </label>
      </td>
      <td>
        <input type="number" class="inline-score" data-id="${row.id}"
               min="1" max="5" step="1"
               value="${score ?? ''}"
               placeholder="—"
               ${!isNoise ? 'disabled style="opacity:.4"' : ''}>
      </td>
    </tr>`;
  }).join('');

  // Dirty row style
  if (Object.keys(pendingChanges).length > 0) {
    document.getElementById('save-all-btn').classList.add('btn-primary');
    document.getElementById('save-all-btn').classList.remove('btn-secondary');
  }
}

// Highlight dirty rows with a subtle left border
const style = document.createElement('style');
style.textContent = '.dirty-row td:first-child { border-left: 3px solid var(--brand); }';
document.head.appendChild(style);

// ---- Inline change handling ---------------------------------
document.getElementById('admin-tbody').addEventListener('change', e => {
  const check = e.target.closest('.noise-check');
  const score = e.target.closest('.inline-score');

  if (check) {
    const id      = check.dataset.id;
    const checked = check.checked;
    pendingChanges[id] = { ...(pendingChanges[id] ?? {}), is_noise_hazard: checked };

    // Update the label text immediately
    const label = check.nextElementSibling;
    if (label) {
      label.textContent = checked ? 'Yes' : 'No';
      label.style.color = checked ? 'var(--green)' : 'var(--grey-400)';
    }

    // Enable/disable the score input in the same row
    const row       = check.closest('tr');
    const scoreInput = row?.querySelector('.inline-score');
    if (scoreInput) {
      scoreInput.disabled = !checked;
      scoreInput.style.opacity = checked ? '1' : '.4';
    }

    renderDirtyIndicator(id);
  }

  if (score) {
    const id  = score.dataset.id;
    const val = parseInt(score.value);
    pendingChanges[id] = {
      ...(pendingChanges[id] ?? {}),
      hazard_score: isNaN(val) ? null : Math.min(5, Math.max(1, val)),
    };
    renderDirtyIndicator(id);
  }
});

function renderDirtyIndicator(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) row.classList.add('dirty-row');
  document.getElementById('save-all-btn').classList.add('btn-primary');
  document.getElementById('save-all-btn').classList.remove('btn-secondary');
}

// ---- Save all pending changes --------------------------------
document.getElementById('save-all-btn').addEventListener('click', async () => {
  const ids = Object.keys(pendingChanges);
  if (ids.length === 0) { showToast('No changes to save', 'info'); return; }

  const btn = document.getElementById('save-all-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  let errorCount = 0;
  for (const id of ids) {
    const { error } = await db
      .from('naics_reference')
      .update(pendingChanges[id])
      .eq('id', id);
    if (error) {
      console.error('Save error for', id, error);
      errorCount++;
    } else {
      // Apply locally
      const row = allRows.find(r => r.id === id);
      if (row) Object.assign(row, pendingChanges[id]);
      delete pendingChanges[id];
    }
  }

  btn.disabled = false;
  btn.textContent = 'Save all changes';
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-secondary');

  if (errorCount > 0) {
    showToast(`${errorCount} save(s) failed — check console`, 'error');
  } else {
    showToast(`Saved ${ids.length} change${ids.length !== 1 ? 's' : ''}`, 'success');
  }

  renderTable();
});

// ---- Filter listeners ---------------------------------------
document.querySelectorAll('input[name=show-filter]').forEach(r =>
  r.addEventListener('change', renderTable)
);

document.getElementById('admin-search').addEventListener('input', renderTable);

// ---- Utilities ----------------------------------------------
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
