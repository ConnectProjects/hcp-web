import { db } from './supabase.js';
import { requireAuth, renderUserEmail, logout } from './auth.js';
import { showToast } from './toast.js';

// ---- State --------------------------------------------------
let allCompanies = [];   // all non-deleted companies from DB
let naicsList    = [];   // all noise-hazard NAICS for filter/modal

const REFRESH_INTERVAL = 60_000; // 1 minute

const filters = {
  province: '', rbs_status: '', score_min: '', score_max: '',
  naics_code: '', source: '', search: ''
};
let sortKey = 'hazard_score';
let sortDir = 'desc';

// ---- Boot ---------------------------------------------------
const session = await requireAuth();
if (!session) throw new Error('unauthenticated');
renderUserEmail(session);

document.getElementById('logout-btn').addEventListener('click', logout);

await Promise.all([loadNaics(), loadCompanies()]);
buildProvinceFilter();
buildNaicsFilter();
renderStats();
renderTable();
stampLastUpdated();
startAutoRefresh();

// ---- Data loading -------------------------------------------
async function loadCompanies() {
  const { data, error } = await db
    .from('companies')
    .select('*, naics_reference(code, descriptor, hazard_score)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) { showToast('Failed to load leads: ' + error.message, 'error'); return; }
  allCompanies = data ?? [];
}

async function loadNaics() {
  const { data } = await db
    .from('naics_reference')
    .select('code, descriptor, hazard_score, is_noise_hazard')
    .order('code');
  naicsList = data ?? [];
}

// ---- Filter + sort (client-side) ----------------------------
function applyFilters() {
  let rows = [...allCompanies];

  if (filters.province)   rows = rows.filter(c => c.province === filters.province);
  if (filters.rbs_status) rows = rows.filter(c => c.rbs_status === filters.rbs_status);
  if (filters.source)     rows = rows.filter(c => c.source === filters.source);
  if (filters.naics_code) rows = rows.filter(c => c.naics_code === filters.naics_code);

  if (filters.score_min) {
    const min = parseInt(filters.score_min);
    rows = rows.filter(c => (c.hazard_score ?? 0) >= min);
  }
  if (filters.score_max) {
    const max = parseInt(filters.score_max);
    rows = rows.filter(c => (c.hazard_score ?? 99) <= max);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(c =>
      (c.name   ?? '').toLowerCase().includes(q) ||
      (c.city   ?? '').toLowerCase().includes(q) ||
      (c.phone  ?? '').toLowerCase().includes(q)
    );
  }

  // Sort
  rows.sort((a, b) => {
    let va = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    let vb = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return rows;
}

// ---- Render -------------------------------------------------
function renderStats() {
  const rows = allCompanies;
  document.getElementById('stat-total').textContent         = rows.length;
  document.getElementById('stat-not-submitted').textContent = rows.filter(c => c.rbs_status === 'not_submitted').length;
  document.getElementById('stat-submitted').textContent     = rows.filter(c => c.rbs_status === 'submitted').length;
  document.getElementById('stat-high-hazard').textContent   = rows.filter(c => (c.hazard_score ?? 0) >= 4).length;

  const byProv = {};
  for (const c of rows) {
    const p = c.province || 'Unknown';
    byProv[p] = (byProv[p] ?? 0) + 1;
  }
  const sorted = Object.entries(byProv).sort(([,a],[,b]) => b - a);
  document.getElementById('stat-by-province').innerHTML =
    sorted.map(([p, n]) => `<span style="display:inline-block;margin-right:10px"><b>${p}</b> ${n}</span>`).join('') || '—';
}

function renderTable() {
  const rows = applyFilters();
  const tbody = document.getElementById('companies-tbody');
  document.getElementById('table-count').textContent = `${rows.length} lead${rows.length !== 1 ? 's' : ''}`;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--grey-400)">No leads match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(c => {
    const score       = c.hazard_score ?? null;
    const scoreClass  = score ? `badge-score-${score}` : 'badge-score-none';
    const scoreText   = score ?? '—';
    const rbsClass    = c.rbs_status === 'submitted' ? 'badge-submitted' : 'badge-not-submitted';
    const rbsLabel    = c.rbs_status === 'submitted' ? 'Submitted' : 'Not submitted';
    const naicsDesc   = c.naics_reference?.descriptor ?? (c.naics_code ? c.naics_code : '—');
    const naicsShort  = naicsDesc.length > 32 ? naicsDesc.slice(0, 32) + '…' : naicsDesc;
    const added       = c.created_at ? new Date(c.created_at).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' }) : '—';

    return `<tr data-id="${c.id}">
      <td>
        <div class="cell-name">${esc(c.name)}</div>
        ${c.notes ? `<div class="notes-preview" title="${esc(c.notes)}">${esc(c.notes)}</div>` : ''}
      </td>
      <td class="nowrap">${esc(c.province ?? '')}${c.city ? `<div class="cell-sub">${esc(c.city)}</div>` : ''}</td>
      <td class="cell-phone nowrap">${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '<span class="text-muted">—</span>'}</td>
      <td class="nowrap"><span class="badge ${scoreClass}">${scoreText}</span></td>
      <td title="${esc(naicsDesc)}">${esc(naicsShort)}</td>
      <td class="nowrap">
        <button class="btn btn-xs ${c.rbs_status === 'submitted' ? 'badge-submitted btn-secondary' : 'btn-secondary'} rbs-toggle-btn"
                data-id="${c.id}" data-status="${c.rbs_status}"
                style="border-radius:100px;border:1px solid ${c.rbs_status === 'submitted' ? 'var(--green-bd)' : 'var(--grey-300)'};background:${c.rbs_status === 'submitted' ? 'var(--green-bg)' : '#fff'};color:${c.rbs_status === 'submitted' ? 'var(--green)' : 'var(--grey-500)'}">
          ${c.rbs_status === 'submitted' ? '✓ ' : ''}${rbsLabel}
        </button>
      </td>
      <td class="text-muted text-small nowrap">${added}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-xs edit-btn" data-id="${c.id}" title="Edit lead">✏️</button>
          <button class="btn btn-ghost btn-xs delete-btn" data-id="${c.id}" title="Archive lead">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ---- Build filter dropdowns --------------------------------
function buildProvinceFilter() {
  const provinces = [...new Set(allCompanies.map(c => c.province).filter(Boolean))].sort();
  const sel = document.getElementById('f-province');
  sel.innerHTML = '<option value="">All provinces</option>' +
    provinces.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
}

function buildNaicsFilter() {
  const noiseCodes = naicsList.filter(n => n.is_noise_hazard);
  const sel = document.getElementById('f-naics');
  sel.innerHTML = '<option value="">All categories</option>' +
    noiseCodes.map(n => {
      const label = `${n.code} — ${n.descriptor.slice(0, 40)}${n.descriptor.length > 40 ? '…' : ''}`;
      return `<option value="${esc(n.code)}">${esc(label)}</option>`;
    }).join('');

  // Also populate modal NAICS select
  const modalSel = document.getElementById('edit-naics-code');
  modalSel.innerHTML = '<option value="">— Unknown —</option>' +
    naicsList.map(n => `<option value="${esc(n.code)}">${esc(n.code)} — ${esc(n.descriptor.slice(0, 50))}</option>`).join('');
}

// ---- Filter event listeners --------------------------------
document.getElementById('f-province').addEventListener('change', e => { filters.province   = e.target.value; renderTable(); });
document.getElementById('f-rbs').addEventListener('change',      e => { filters.rbs_status = e.target.value; renderTable(); });
document.getElementById('f-score-min').addEventListener('change',e => { filters.score_min  = e.target.value; renderTable(); });
document.getElementById('f-score-max').addEventListener('change',e => { filters.score_max  = e.target.value; renderTable(); });
document.getElementById('f-naics').addEventListener('change',    e => { filters.naics_code = e.target.value; renderTable(); });
document.getElementById('f-source').addEventListener('change',   e => { filters.source     = e.target.value; renderTable(); });
document.getElementById('f-search').addEventListener('input',    e => { filters.search     = e.target.value; renderTable(); });

document.getElementById('clear-filters-btn').addEventListener('click', () => {
  Object.keys(filters).forEach(k => filters[k] = '');
  document.querySelectorAll('.filter-bar select, .filter-bar input').forEach(el => el.value = '');
  renderTable();
});

// ---- Sort via column headers --------------------------------
document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = key === 'name' || key === 'province' ? 'asc' : 'desc';
    }
    document.querySelectorAll('.data-table th').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    renderTable();
  });
});

document.getElementById('sort-select').addEventListener('change', e => {
  const [key, dir] = e.target.value.split('-');
  sortKey = key;
  sortDir = dir;
  renderTable();
});

// ---- Table event delegation ---------------------------------
document.getElementById('companies-tbody').addEventListener('click', async e => {
  const rbsBtn    = e.target.closest('.rbs-toggle-btn');
  const editBtn   = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (rbsBtn)    return toggleRbs(rbsBtn.dataset.id, rbsBtn.dataset.status);
  if (editBtn)   return openEditModal(editBtn.dataset.id);
  if (deleteBtn) return archiveLead(deleteBtn.dataset.id);
});

// ---- RBS toggle ---------------------------------------------
async function toggleRbs(id, currentStatus) {
  const newStatus = currentStatus === 'submitted' ? 'not_submitted' : 'submitted';
  const { error } = await db
    .from('companies')
    .update({ rbs_status: newStatus })
    .eq('id', id);

  if (error) { showToast('Update failed: ' + error.message, 'error'); return; }

  const company = allCompanies.find(c => c.id === id);
  if (company) company.rbs_status = newStatus;

  renderTable();
  renderStats();
  showToast(
    newStatus === 'submitted' ? 'Marked as submitted to RBS' : 'Marked as not submitted',
    'success'
  );
}

// ---- Archive (soft delete) ----------------------------------
async function archiveLead(id) {
  const company = allCompanies.find(c => c.id === id);
  if (!company) return;

  const confirmed = window.confirm(`Archive "${company.name}"?\n\nThis hides the lead from the dashboard but does not permanently delete it.`);
  if (!confirmed) return;

  const { error } = await db
    .from('companies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) { showToast('Archive failed: ' + error.message, 'error'); return; }

  allCompanies = allCompanies.filter(c => c.id !== id);
  renderTable();
  renderStats();
  showToast('Lead archived', 'info');
}

// ---- Edit modal ---------------------------------------------
function openEditModal(id) {
  const company = id === 'new' ? null : allCompanies.find(c => c.id === id);
  document.getElementById('modal-title').textContent = company ? 'Edit Lead' : 'Add Lead';
  document.getElementById('edit-id').value               = id;
  document.getElementById('edit-name').value             = company?.name       ?? '';
  document.getElementById('edit-address').value          = company?.address    ?? '';
  document.getElementById('edit-city').value             = company?.city       ?? '';
  document.getElementById('edit-province').value         = company?.province   ?? '';
  document.getElementById('edit-phone').value            = company?.phone      ?? '';
  document.getElementById('edit-email').value            = company?.email      ?? '';
  document.getElementById('edit-website').value          = company?.website    ?? '';
  document.getElementById('edit-naics-code').value       = company?.naics_code ?? '';
  document.getElementById('edit-naics-confidence').value = company?.naics_confidence ?? 'unknown';
  document.getElementById('edit-hazard-score').value     = company?.hazard_score ?? '';
  document.getElementById('edit-notes').value            = company?.notes      ?? '';
  document.getElementById('modal-delete-btn').classList.toggle('hidden', !company);
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-name').focus();
}

document.getElementById('add-btn').addEventListener('click', () => openEditModal('new'));

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);

document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeModal();
});

document.getElementById('modal-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('edit-id').value;
  closeModal();
  await archiveLead(id);
});

document.getElementById('modal-save-btn').addEventListener('click', async () => {
  const id   = document.getElementById('edit-id').value;
  const name = document.getElementById('edit-name').value.trim();
  if (!name) { showToast('Company name is required', 'error'); return; }

  const payload = {
    name,
    address:          document.getElementById('edit-address').value.trim()          || null,
    city:             document.getElementById('edit-city').value.trim()              || null,
    province:         document.getElementById('edit-province').value.trim().toUpperCase() || null,
    phone:            document.getElementById('edit-phone').value.trim()             || null,
    email:            document.getElementById('edit-email').value.trim()             || null,
    website:          document.getElementById('edit-website').value.trim()           || null,
    naics_code:       document.getElementById('edit-naics-code').value               || null,
    naics_confidence: document.getElementById('edit-naics-confidence').value,
    hazard_score:     parseInt(document.getElementById('edit-hazard-score').value)   || null,
    notes:            document.getElementById('edit-notes').value.trim()             || null,
  };

  // Derive hazard_score from NAICS if not overridden
  if (!payload.hazard_score && payload.naics_code) {
    const naics = naicsList.find(n => n.code === payload.naics_code);
    payload.hazard_score = naics?.hazard_score ?? null;
  }

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  let error, data;

  if (id === 'new') {
    ({ error, data } = await db.from('companies').insert([payload]).select('*, naics_reference(code, descriptor, hazard_score)').single());
    if (!error && data) allCompanies.unshift(data);
  } else {
    ({ error } = await db.from('companies').update(payload).eq('id', id));
    if (!error) {
      const idx = allCompanies.findIndex(c => c.id === id);
      if (idx >= 0) Object.assign(allCompanies[idx], payload);
    }
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save';

  if (error) { showToast('Save failed: ' + error.message, 'error'); return; }

  closeModal();
  renderTable();
  renderStats();
  showToast(id === 'new' ? 'Lead added' : 'Lead updated', 'success');
});

// ---- Auto-refresh -------------------------------------------
function stampLastUpdated() {
  const el = document.getElementById('last-updated');
  if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

async function doRefresh() {
  // Don't refresh while the edit modal is open — would discard unsaved changes
  if (!document.getElementById('edit-modal').classList.contains('hidden')) return;

  await loadCompanies();
  buildProvinceFilter();
  renderStats();
  renderTable();
  stampLastUpdated();
}

function startAutoRefresh() {
  setInterval(doRefresh, REFRESH_INTERVAL);
}

document.getElementById('refresh-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '…';
  btn.disabled = true;
  await doRefresh();
  btn.textContent = '↺';
  btn.disabled = false;
});

// ---- Utilities ----------------------------------------------
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
