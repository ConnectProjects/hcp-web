import { db } from './supabase.js';
import { requireAuth, renderUserEmail, logout } from './auth.js';
import { showToast } from './toast.js';
import { createDraft } from './graph-draft.js';

// ---- Boot ---------------------------------------------------
const session = await requireAuth();
if (!session) throw new Error('unauthenticated');
renderUserEmail(session);
document.getElementById('logout-btn').addEventListener('click', logout);

// ---- State --------------------------------------------------
let allCompanies = [];
let naicsList    = [];

const REFRESH_INTERVAL = 60_000;

const filters = {
  province: '', rbs_status: '', score_min: '', score_max: '',
  naics_code: '', source: '', outreach: '', search: '',
};
let sortKey = 'hazard_score';
let sortDir = 'desc';

// Call panel state
const callPanel = {
  companyId:  null,
  outreachId: null,
  token:      null,
};

const OUTREACH_LABELS = {
  not_contacted: 'Not contacted',
  contacted:     'Contacted',
  opened:        'Opened',
  responded:     'Responded',
};

// ---- Boot load ----------------------------------------------
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
    .select('*, naics_reference(code, descriptor, hazard_score), outreach(id, token, channel, contact_name, contact_email, contact_phone, consent_obtained_at, drafted_at, sent_at, first_opened_at, responded_at, created_at)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) { showToast('Failed to load leads: ' + error.message, 'error'); return; }

  allCompanies = (data ?? []).map(c => ({
    ...c,
    _latest_outreach: latestOutreach(c),
    _outreach_status: deriveOutreachStatus(c),
  }));
}

async function loadNaics() {
  const { data } = await db
    .from('naics_reference')
    .select('code, descriptor, hazard_score, is_noise_hazard')
    .order('code');
  naicsList = data ?? [];
}

// ---- Outreach helpers ---------------------------------------
function latestOutreach(company) {
  const rows = company.outreach ?? [];
  if (!rows.length) return null;
  return rows.reduce((a, b) =>
    new Date(a.created_at) > new Date(b.created_at) ? a : b,
  );
}

function deriveOutreachStatus(company) {
  const o = latestOutreach(company);
  if (!o) return 'not_contacted';
  if (o.responded_at)    return 'responded';
  if (o.first_opened_at) return 'opened';
  return 'contacted';
}

// ---- Filter + sort ------------------------------------------
function applyFilters() {
  let rows = [...allCompanies];

  if (filters.province)   rows = rows.filter(c => c.province === filters.province);
  if (filters.rbs_status) rows = rows.filter(c => c.rbs_status === filters.rbs_status);
  if (filters.source)     rows = rows.filter(c => c.source === filters.source);
  if (filters.naics_code) rows = rows.filter(c => c.naics_code === filters.naics_code);
  if (filters.outreach)   rows = rows.filter(c => c._outreach_status === filters.outreach);

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
      (c.phone  ?? '').toLowerCase().includes(q),
    );
  }

  rows.sort((a, b) => {
    let va, vb;

    if (sortKey === 'responded_at') {
      va = a._latest_outreach?.responded_at ?? '';
      vb = b._latest_outreach?.responded_at ?? '';
    } else {
      va = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      vb = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    }

    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 :  1;
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
  document.getElementById('stat-contacted').textContent     = rows.filter(c => c._outreach_status !== 'not_contacted').length;
  document.getElementById('stat-responded').textContent     = rows.filter(c => c._outreach_status === 'responded').length;

  const byProv = {};
  for (const c of rows) {
    const p = c.province || 'Unknown';
    byProv[p] = (byProv[p] ?? 0) + 1;
  }
  const sorted = Object.entries(byProv).sort(([, a], [, b]) => b - a);
  document.getElementById('stat-by-province').innerHTML =
    sorted.map(([p, n]) => `<span style="display:inline-block;margin-right:10px"><b>${p}</b> ${n}</span>`).join('') || '—';
}

function renderTable() {
  const rows  = applyFilters();
  const tbody = document.getElementById('companies-tbody');
  document.getElementById('table-count').textContent = `${rows.length} lead${rows.length !== 1 ? 's' : ''}`;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--grey-400)">No leads match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(c => {
    const score      = c.hazard_score ?? null;
    const scoreClass = score ? `badge-score-${score}` : 'badge-score-none';
    const scoreText  = score ?? '—';
    const rbsClass   = c.rbs_status === 'submitted' ? 'badge-submitted' : 'badge-not-submitted';
    const rbsLabel   = c.rbs_status === 'submitted' ? 'Submitted' : 'Not submitted';
    const naicsDesc  = c.naics_reference?.descriptor ?? (c.naics_code ? c.naics_code : '—');
    const naicsShort = naicsDesc.length > 32 ? naicsDesc.slice(0, 32) + '…' : naicsDesc;
    const added      = c.created_at
      ? new Date(c.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';

    const os          = c._outreach_status;
    const outreachLabel = OUTREACH_LABELS[os] ?? os;
    const outreachClass = `badge badge-outreach-${os}`;

    // Show responded_at date in badge for responded leads
    const o = c._latest_outreach;
    const respondedDate = (os === 'responded' && o?.responded_at)
      ? `<div class="cell-sub">${new Date(o.responded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</div>`
      : '';

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
        <span class="${outreachClass}">${outreachLabel}</span>
        ${respondedDate}
      </td>
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
          <button class="btn btn-ghost btn-xs call-btn" data-id="${c.id}" title="Call / outreach">📞</button>
          <button class="btn btn-ghost btn-xs edit-btn" data-id="${c.id}" title="Edit lead">✏️</button>
          <button class="btn btn-ghost btn-xs delete-btn" data-id="${c.id}" title="Archive lead">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ---- Filter dropdowns --------------------------------------
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

  const modalSel = document.getElementById('edit-naics-code');
  modalSel.innerHTML = '<option value="">— Unknown —</option>' +
    naicsList.map(n => `<option value="${esc(n.code)}">${esc(n.code)} — ${esc(n.descriptor.slice(0, 50))}</option>`).join('');
}

// ---- Filter events -----------------------------------------
document.getElementById('f-province').addEventListener('change', e => { filters.province   = e.target.value; renderTable(); });
document.getElementById('f-rbs').addEventListener('change',      e => { filters.rbs_status = e.target.value; renderTable(); });
document.getElementById('f-score-min').addEventListener('change',e => { filters.score_min  = e.target.value; renderTable(); });
document.getElementById('f-score-max').addEventListener('change',e => { filters.score_max  = e.target.value; renderTable(); });
document.getElementById('f-naics').addEventListener('change',    e => { filters.naics_code = e.target.value; renderTable(); });
document.getElementById('f-source').addEventListener('change',   e => { filters.source     = e.target.value; renderTable(); });
document.getElementById('f-outreach').addEventListener('change', e => { filters.outreach   = e.target.value; renderTable(); });
document.getElementById('f-search').addEventListener('input',    e => { filters.search     = e.target.value; renderTable(); });

document.getElementById('clear-filters-btn').addEventListener('click', () => {
  Object.keys(filters).forEach(k => filters[k] = '');
  document.querySelectorAll('.filter-bar select, .filter-bar input').forEach(el => el.value = '');
  renderTable();
});

// ---- Sort --------------------------------------------------
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

// ---- Table row delegation ----------------------------------
document.getElementById('companies-tbody').addEventListener('click', async e => {
  const callBtn   = e.target.closest('.call-btn');
  const rbsBtn    = e.target.closest('.rbs-toggle-btn');
  const editBtn   = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (callBtn)   return openCallPanel(callBtn.dataset.id);
  if (rbsBtn)    return toggleRbs(rbsBtn.dataset.id, rbsBtn.dataset.status);
  if (editBtn)   return openEditModal(editBtn.dataset.id);
  if (deleteBtn) return archiveLead(deleteBtn.dataset.id);
});

// ================================================================
// CALL PANEL
// ================================================================

function openCallPanel(companyId) {
  const company = allCompanies.find(c => c.id === companyId);
  if (!company) return;

  callPanel.companyId  = companyId;

  // Most recent outreach that hasn't been responded to yet
  const existing = company._latest_outreach && !company._latest_outreach.responded_at
    ? company._latest_outreach
    : null;

  callPanel.outreachId = existing?.id   ?? null;
  callPanel.token      = existing?.token ?? null;

  // Modal title
  document.getElementById('call-modal-title').textContent = company.name;

  // Phone
  document.getElementById('call-phone-display').innerHTML = company.phone
    ? `<a href="tel:${esc(company.phone)}" class="call-phone-link">${esc(company.phone)}</a>`
    : `<span class="text-muted text-small">No phone on file — check edit modal</span>`;

  // Unsubscribe warning
  document.getElementById('call-unsub-warning').classList.toggle(
    'hidden', !company.unsubscribed_at,
  );

  // Pre-fill from existing outreach
  document.getElementById('call-contact-name').value  = existing?.contact_name  ?? '';
  document.getElementById('call-contact-phone').value = existing?.contact_phone ?? '';
  document.getElementById('call-contact-email').value = existing?.contact_email ?? '';
  document.getElementById('call-consent-check').checked = !!existing?.consent_obtained_at;

  // Status bar
  renderCallStatusBar(company, existing);

  // Footer button state
  refreshCallFooter(company);

  document.getElementById('call-modal').classList.remove('hidden');
  document.getElementById('call-contact-name').focus();
}

function closeCallPanel() {
  document.getElementById('call-modal').classList.add('hidden');
  callPanel.companyId  = null;
  callPanel.outreachId = null;
  callPanel.token      = null;
}

function renderCallStatusBar(company, outreach) {
  const bar = document.getElementById('call-status-bar');
  if (!outreach) { bar.classList.add('hidden'); return; }

  const fmt = ts => ts ? new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const parts = [];
  if (outreach.consent_obtained_at) parts.push(`Consent obtained <strong>${fmt(outreach.consent_obtained_at)}</strong>`);
  if (outreach.drafted_at)          parts.push(`Draft created <strong>${fmt(outreach.drafted_at)}</strong>`);
  if (outreach.sent_at)             parts.push(`Marked sent <strong>${fmt(outreach.sent_at)}</strong>`);
  if (outreach.first_opened_at)     parts.push(`Email opened <strong>${fmt(outreach.first_opened_at)}</strong>`);
  if (outreach.responded_at)        parts.push(`Responded <strong>${fmt(outreach.responded_at)}</strong>`);

  bar.innerHTML = parts.join('<span style="color:var(--grey-300)">|</span>');
  bar.classList.toggle('hidden', parts.length === 0);
}

function refreshCallFooter(company) {
  const email    = document.getElementById('call-contact-email').value.trim();
  const consent  = document.getElementById('call-consent-check').checked;
  const unsub    = !!(company ?? allCompanies.find(c => c.id === callPanel.companyId))?.unsubscribed_at;
  const draftBtn = document.getElementById('call-draft-btn');
  const sentBtn  = document.getElementById('call-mark-sent-btn');

  // Draft: need consent + email + not unsubscribed
  draftBtn.disabled = unsub || !(consent && email);

  // Mark as sent: visible when drafted but not yet sent
  const o = allCompanies.find(c => c.id === callPanel.companyId)?._latest_outreach;
  const showSent = !!(o?.drafted_at && !o?.sent_at && callPanel.outreachId);
  sentBtn.classList.toggle('hidden', !showSent);
}

// Live footer refresh as the form changes
['call-contact-email', 'call-consent-check'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => refreshCallFooter());
  document.getElementById(id).addEventListener('input',  () => refreshCallFooter());
});

document.getElementById('call-modal-close-btn').addEventListener('click', closeCallPanel);
document.getElementById('call-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('call-modal')) closeCallPanel();
});

// ---- Save contact info -------------------------------------
document.getElementById('call-save-btn').addEventListener('click', saveCallPanel);

async function saveCallPanel() {
  const company = allCompanies.find(c => c.id === callPanel.companyId);
  if (!company) return;

  const contactName  = document.getElementById('call-contact-name').value.trim();
  const contactPhone = document.getElementById('call-contact-phone').value.trim();
  const contactEmail = document.getElementById('call-contact-email').value.trim();
  const consent      = document.getElementById('call-consent-check').checked;

  const saveBtn = document.getElementById('call-save-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  // CASL: never clear consent_obtained_at once set
  const existingConsent = company._latest_outreach?.consent_obtained_at ?? null;
  const consentTimestamp = consent
    ? (existingConsent || new Date().toISOString())
    : existingConsent;  // if unchecked, preserve existing timestamp

  const consentNote = consent && !existingConsent
    ? 'Verbal consent obtained during phone call'
    : (company._latest_outreach?.consent_note ?? null);

  let error, data;

  if (callPanel.outreachId) {
    ({ error } = await db.from('outreach').update({
      contact_name:        contactName  || null,
      contact_phone:       contactPhone || null,
      contact_email:       contactEmail || null,
      consent_obtained_at: consentTimestamp,
      consent_note:        consentNote,
    }).eq('id', callPanel.outreachId));
  } else {
    ({ data, error } = await db.from('outreach').insert([{
      company_id:          callPanel.companyId,
      channel:             'phone',
      contact_name:        contactName  || null,
      contact_phone:       contactPhone || null,
      contact_email:       contactEmail || null,
      consent_obtained_at: consentTimestamp,
      consent_note:        consentNote,
      created_by:          session.user.id,
    }]).select('id, token').single());

    if (!error && data) {
      callPanel.outreachId = data.id;
      callPanel.token      = data.token;
    }
  }

  saveBtn.disabled    = false;
  saveBtn.textContent = 'Save contact info';

  if (error) { showToast('Save failed: ' + error.message, 'error'); return; }

  showToast('Contact info saved', 'success');
  await loadCompanies();
  renderTable();
  renderStats();

  // Refresh status bar
  const updated = allCompanies.find(c => c.id === callPanel.companyId);
  const updatedO = callPanel.outreachId
    ? updated?._latest_outreach
    : null;
  renderCallStatusBar(updated, updatedO);
  refreshCallFooter(updated);
}

// ---- Draft email in Outlook --------------------------------
document.getElementById('call-draft-btn').addEventListener('click', async () => {
  // Ensure contact info is saved first (gets us a token)
  await saveCallPanel();
  if (!callPanel.token) return;

  const company      = allCompanies.find(c => c.id === callPanel.companyId);
  const contactEmail = document.getElementById('call-contact-email').value.trim();
  const contactName  = document.getElementById('call-contact-name').value.trim();

  const draftBtn = document.getElementById('call-draft-btn');
  draftBtn.disabled    = true;
  draftBtn.textContent = 'Opening email…';

  try {
    const result = await createDraft({
      outreach: { token: callPanel.token, contact_email: contactEmail, contact_name: contactName },
      company,
      session,
    });

    // Stamp drafted_at regardless of Graph vs mailto: path
    await db.from('outreach').update({ drafted_at: new Date().toISOString() }).eq('id', callPanel.outreachId);

    if (result.success) {
      if (result.webLink) window.open(result.webLink, '_blank');
      showToast('Draft created — check your Outlook Drafts', 'success');
    } else {
      window.location.href = result.fallback;
      showToast('Email opened in your mail client', 'success');
    }

    await loadCompanies();
    renderTable();
    renderStats();
    const updated = allCompanies.find(c => c.id === callPanel.companyId);
    renderCallStatusBar(updated, updated?._latest_outreach);
    refreshCallFooter(updated);
  } catch (err) {
    showToast('Draft failed: ' + err.message, 'error');
  } finally {
    draftBtn.disabled    = false;
    draftBtn.textContent = 'Prepare email';
  }
});

// ---- Mark as sent ------------------------------------------
document.getElementById('call-mark-sent-btn').addEventListener('click', async () => {
  if (!callPanel.outreachId) return;

  const { error } = await db.from('outreach')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', callPanel.outreachId);

  if (error) { showToast('Update failed: ' + error.message, 'error'); return; }

  showToast('Marked as sent', 'success');
  await loadCompanies();
  renderTable();
  renderStats();
  const updated = allCompanies.find(c => c.id === callPanel.companyId);
  renderCallStatusBar(updated, updated?._latest_outreach);
  refreshCallFooter(updated);
});

// ================================================================
// EXISTING FEATURES (unchanged behaviour, colspan updated to 9)
// ================================================================

// ---- RBS toggle ---------------------------------------------
async function toggleRbs(id, currentStatus) {
  const newStatus = currentStatus === 'submitted' ? 'not_submitted' : 'submitted';
  const { error } = await db.from('companies').update({ rbs_status: newStatus }).eq('id', id);

  if (error) { showToast('Update failed: ' + error.message, 'error'); return; }

  const company = allCompanies.find(c => c.id === id);
  if (company) company.rbs_status = newStatus;

  renderTable();
  renderStats();
  showToast(newStatus === 'submitted' ? 'Marked as submitted to RBS' : 'Marked as not submitted', 'success');
}

// ---- Archive ------------------------------------------------
async function archiveLead(id) {
  const company = allCompanies.find(c => c.id === id);
  if (!company) return;

  const confirmed = window.confirm(`Archive "${company.name}"?\n\nThis hides the lead from the dashboard but does not permanently delete it.`);
  if (!confirmed) return;

  const { error } = await db.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('Archive failed: ' + error.message, 'error'); return; }

  allCompanies = allCompanies.filter(c => c.id !== id);
  renderTable();
  renderStats();
  showToast('Lead archived', 'info');
}

// ---- Edit modal ---------------------------------------------
function openEditModal(id) {
  const company = id === 'new' ? null : allCompanies.find(c => c.id === id);
  document.getElementById('modal-title').textContent          = company ? 'Edit Lead' : 'Add Lead';
  document.getElementById('edit-id').value                    = id;
  document.getElementById('edit-name').value                  = company?.name       ?? '';
  document.getElementById('edit-address').value               = company?.address    ?? '';
  document.getElementById('edit-city').value                  = company?.city       ?? '';
  document.getElementById('edit-province').value              = company?.province   ?? '';
  document.getElementById('edit-phone').value                 = company?.phone      ?? '';
  document.getElementById('edit-email').value                 = company?.email      ?? '';
  document.getElementById('edit-website').value               = company?.website    ?? '';
  document.getElementById('edit-naics-code').value            = company?.naics_code ?? '';
  document.getElementById('edit-naics-confidence').value      = company?.naics_confidence ?? 'unknown';
  document.getElementById('edit-hazard-score').value          = company?.hazard_score ?? '';
  document.getElementById('edit-notes').value                 = company?.notes      ?? '';
  document.getElementById('modal-delete-btn').classList.toggle('hidden', !company);
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-name').focus();
}

document.getElementById('add-btn').addEventListener('click', () => openEditModal('new'));

function closeModal() { document.getElementById('edit-modal').classList.add('hidden'); }
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
    address:          document.getElementById('edit-address').value.trim()               || null,
    city:             document.getElementById('edit-city').value.trim()                   || null,
    province:         document.getElementById('edit-province').value.trim().toUpperCase() || null,
    phone:            document.getElementById('edit-phone').value.trim()                  || null,
    email:            document.getElementById('edit-email').value.trim()                  || null,
    website:          document.getElementById('edit-website').value.trim()                || null,
    naics_code:       document.getElementById('edit-naics-code').value                    || null,
    naics_confidence: document.getElementById('edit-naics-confidence').value,
    hazard_score:     parseInt(document.getElementById('edit-hazard-score').value)        || null,
    notes:            document.getElementById('edit-notes').value.trim()                  || null,
  };

  if (!payload.hazard_score && payload.naics_code) {
    const naics = naicsList.find(n => n.code === payload.naics_code);
    payload.hazard_score = naics?.hazard_score ?? null;
  }

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  let error, data;
  if (id === 'new') {
    ({ error, data } = await db.from('companies').insert([payload]).select('*, naics_reference(code, descriptor, hazard_score)').single());
    if (!error && data) allCompanies.unshift({ ...data, outreach: [], _latest_outreach: null, _outreach_status: 'not_contacted' });
  } else {
    ({ error } = await db.from('companies').update(payload).eq('id', id));
    if (!error) {
      const idx = allCompanies.findIndex(c => c.id === id);
      if (idx >= 0) Object.assign(allCompanies[idx], payload);
    }
  }

  saveBtn.disabled    = false;
  saveBtn.textContent = 'Save';

  if (error) { showToast('Save failed: ' + error.message, 'error'); return; }

  closeModal();
  renderTable();
  renderStats();
  showToast(id === 'new' ? 'Lead added' : 'Lead updated', 'success');
});

// ---- Auto-refresh ------------------------------------------
function stampLastUpdated() {
  const el = document.getElementById('last-updated');
  if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

async function doRefresh() {
  if (!document.getElementById('edit-modal').classList.contains('hidden')) return;
  if (!document.getElementById('call-modal').classList.contains('hidden')) return;
  await loadCompanies();
  buildProvinceFilter();
  renderStats();
  renderTable();
  stampLastUpdated();
}

function startAutoRefresh() { setInterval(doRefresh, REFRESH_INTERVAL); }

document.getElementById('refresh-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '…';
  btn.disabled    = true;
  await doRefresh();
  btn.textContent = '↺';
  btn.disabled    = false;
});

// ---- Utilities ---------------------------------------------
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
