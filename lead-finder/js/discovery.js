import { db } from './supabase.js';
import { requireAuth, renderUserEmail, logout } from './auth.js';
import { showToast } from './toast.js';
import { GOOGLE_PLACES_API_KEY } from '../config.js';

// Google Places Text Search (New) REST endpoint — supports CORS from browser
const PLACES_API = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.types',
  'places.location',
  'places.shortFormattedAddress',
].join(',');

// ---- Boot ---------------------------------------------------
const session = await requireAuth();
if (!session) throw new Error('unauthenticated');
renderUserEmail(session);
document.getElementById('logout-btn').addEventListener('click', logout);

// Load noise-hazard NAICS for chips + matching
const { data: naicsList = [] } = await db
  .from('naics_reference')
  .select('code, descriptor')
  .eq('is_noise_hazard', true)
  .order('code');

renderNaicsChips();

// Track places already in our DB to show duplicate warnings
let existingPlaceIds = new Set();
await loadExistingPlaceIds();

// ---- NAICS keyword chips ------------------------------------
let selectedNaicsCodes = new Set();

function renderNaicsChips() {
  const container = document.getElementById('naics-chips');
  if (!naicsList.length) {
    container.innerHTML = '<span class="text-muted text-small">No noise-hazard NAICS loaded — run the seed script and review in Admin.</span>';
    return;
  }
  container.innerHTML = naicsList.map(n => `
    <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;padding:4px 10px;border-radius:100px;border:1px solid var(--grey-300);background:#fff;font-size:12px;transition:all .1s" data-code="${esc(n.code)}">
      <input type="checkbox" value="${esc(n.code)}" style="accent-color:var(--brand)">
      <span>${esc(n.code)} — ${esc(n.descriptor.slice(0, 40))}</span>
    </label>
  `).join('');

  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const label = cb.closest('label');
      if (cb.checked) {
        selectedNaicsCodes.add(cb.value);
        label.style.background = 'var(--brand-light)';
        label.style.borderColor = 'var(--brand)';
      } else {
        selectedNaicsCodes.delete(cb.value);
        label.style.background = '#fff';
        label.style.borderColor = 'var(--grey-300)';
      }
      updateNaicsBadge();
    });
  });
}

function updateNaicsBadge() {
  const badge = document.getElementById('naics-selected-count');
  const n = selectedNaicsCodes.size;
  if (n > 0) {
    badge.textContent = `${n} selected`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function loadExistingPlaceIds() {
  const { data } = await db.from('companies').select('google_place_id').not('google_place_id', 'is', null);
  existingPlaceIds = new Set((data ?? []).map(r => r.google_place_id));
}

// ---- Search -------------------------------------------------
let searchResults = [];
let nextPageToken = null;

document.getElementById('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  await runSearch();
});

async function fetchPlaces(body) {
  const res = await fetch(PLACES_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': PLACES_FIELDS,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Places API ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function runSearch() {
  const query    = document.getElementById('search-query').value.trim();
  const location = document.getElementById('search-location').value.trim();
  const status   = document.getElementById('search-status');
  const btn      = document.getElementById('search-btn');

  if (!GOOGLE_PLACES_API_KEY || GOOGLE_PLACES_API_KEY.startsWith('AIza...')) {
    showToast('Google Places API key not configured in config.js', 'error');
    return;
  }

  // Build text query — append selected NAICS descriptors as context
  let textQuery = `${query} ${location} Canada`;
  if (selectedNaicsCodes.size > 0) {
    const descs = [...selectedNaicsCodes].map(code => {
      const n = naicsList.find(x => x.code === code);
      return n?.descriptor?.split(' ')[0] ?? '';  // just first word for brevity
    }).filter(Boolean).slice(0, 3);
    if (descs.length) textQuery += ' ' + descs.join(' ');
  }

  btn.disabled = true;
  btn.textContent = 'Searching…';
  status.textContent = `Querying: "${textQuery}"`;

  try {
    const data = await fetchPlaces({ textQuery, maxResultCount: 20, languageCode: 'en' });
    searchResults = data.places ?? [];
    nextPageToken = data.nextPageToken ?? null;

    status.textContent = `Found ${searchResults.length} result(s)${nextPageToken ? ' — more available' : ''}`;
    renderResults();
  } catch (err) {
    showToast('Search failed: ' + err.message, 'error');
    status.textContent = 'Search failed — see toast';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search Google Places';
  }
}

document.getElementById('load-more-btn').addEventListener('click', async () => {
  if (!nextPageToken) return;
  const btn    = document.getElementById('load-more-btn');
  const lmStatus = document.getElementById('load-more-status');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  lmStatus.textContent = '';
  try {
    const data = await fetchPlaces({ pageToken: nextPageToken });
    const newPlaces = data.places ?? [];
    searchResults = [...searchResults, ...newPlaces];
    nextPageToken = data.nextPageToken ?? null;
    document.getElementById('search-status').textContent =
      `Found ${searchResults.length} result(s)${nextPageToken ? ' — more available' : ''}`;
    renderResults();
  } catch (err) {
    showToast('Load more failed: ' + err.message, 'error');
    lmStatus.textContent = 'Failed — try again';
    btn.disabled = false;
    btn.textContent = 'Load more results';
  }
});

// ---- Render results -----------------------------------------
function updateLoadMoreBtn() {
  const wrap = document.getElementById('load-more-wrap');
  const btn  = document.getElementById('load-more-btn');
  if (nextPageToken) {
    wrap.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Load more results';
  } else {
    wrap.classList.add('hidden');
  }
}

function renderResults() {
  const wrap = document.getElementById('results-wrap');
  const tbody = document.getElementById('results-tbody');
  const heading = document.getElementById('results-heading');
  const alreadyCount = document.getElementById('already-count');

  if (searchResults.length === 0) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  heading.textContent = `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`;

  const alreadyN = searchResults.filter(p => existingPlaceIds.has(p.id)).length;
  alreadyCount.textContent = alreadyN > 0 ? `${alreadyN} already in your leads` : '';

  updateLoadMoreBtn();

  tbody.innerHTML = searchResults.map((place, i) => {
    const name    = place.displayName?.text ?? '';
    const address = place.formattedAddress ?? '';
    const phone   = place.nationalPhoneNumber ?? '';
    const website = place.websiteUri ?? '';
    const types   = (place.types ?? []).filter(t => !['point_of_interest','establishment','geocode'].includes(t)).slice(0, 2).join(', ');
    const alreadyIn = existingPlaceIds.has(place.id);
    const naicsGuess = guessNaics(name, place.types ?? []);

    return `<tr class="result-row${alreadyIn ? ' text-muted' : ''}" data-index="${i}">
      <td><input type="checkbox" class="result-check" data-index="${i}" ${alreadyIn ? 'disabled' : ''}></td>
      <td class="cell-name">${esc(name)}</td>
      <td class="text-small">${esc(address)}</td>
      <td class="cell-phone text-small nowrap">${phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : '—'}</td>
      <td class="text-small">${website ? `<a href="${esc(website)}" target="_blank" rel="noopener">↗</a>` : '—'}</td>
      <td class="text-small text-muted">${esc(types) || '—'}</td>
      <td class="text-small">${naicsGuess ? `<span title="${esc(naicsGuess.descriptor)}">${esc(naicsGuess.code)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="text-small">${alreadyIn ? '<span class="badge badge-submitted" style="font-size:10px">Already added</span>' : ''}</td>
    </tr>`;
  }).join('');

  updateImportBtn();
}

// ---- Select all checkbox ------------------------------------
document.getElementById('select-all-check').addEventListener('change', e => {
  document.querySelectorAll('.result-check:not(:disabled)').forEach(cb => {
    cb.checked = e.target.checked;
  });
  updateImportBtn();
});

document.getElementById('select-all-btn').addEventListener('click', () => {
  const allEnabled = document.querySelectorAll('.result-check:not(:disabled)');
  const allChecked = [...allEnabled].every(cb => cb.checked);
  allEnabled.forEach(cb => cb.checked = !allChecked);
  updateImportBtn();
});

document.getElementById('results-tbody').addEventListener('change', e => {
  if (e.target.classList.contains('result-check')) updateImportBtn();
});

function updateImportBtn() {
  const n = document.querySelectorAll('.result-check:checked').length;
  const btn = document.getElementById('import-btn');
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `Import ${n} selected` : 'Import selected';
}

// ---- NAICS guessing from Places data ------------------------
function guessNaics(businessName, types) {
  const combined = (businessName + ' ' + types.join(' ')).toLowerCase();
  // Walk noise-hazard NAICS by descriptor keyword match
  for (const n of naicsList) {
    const kw = n.descriptor.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    if (kw.some(w => combined.includes(w))) return n;
  }
  return null;
}

// ---- Import -------------------------------------------------
document.getElementById('import-btn').addEventListener('click', async () => {
  const checked = [...document.querySelectorAll('.result-check:checked')];
  if (!checked.length) return;

  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  btn.textContent = 'Importing…';

  const toInsert = checked.map(cb => {
    const place = searchResults[parseInt(cb.dataset.index)];
    const name    = place.displayName?.text ?? 'Unknown';
    const address = place.formattedAddress ?? '';
    const phone   = place.nationalPhoneNumber ?? null;
    const website = place.websiteUri ?? null;

    // Parse province from address (last chunk before country, e.g. "Surrey, BC V3T 0A1, Canada")
    const province = parseProvince(address);
    const city     = parseCity(address);

    const naicsGuess = guessNaics(name, place.types ?? []);

    return {
      name,
      address:          address || null,
      city:             city    || null,
      province:         province || null,
      phone,
      website,
      google_place_id:  place.id,
      latitude:         place.location?.latitude  ?? null,
      longitude:        place.location?.longitude ?? null,
      naics_code:       naicsGuess?.code ?? null,
      naics_confidence: naicsGuess ? 'inferred' : 'unknown',
      hazard_score:     naicsGuess?.hazard_score ?? null,
      source:           'discovered',
      rbs_status:       'not_submitted',
    };
  });

  // Upsert (on_conflict = google_place_id) to handle re-search duplicates gracefully
  const { data: inserted, error } = await db
    .from('companies')
    .upsert(toInsert, { onConflict: 'google_place_id', ignoreDuplicates: true })
    .select('id');

  btn.disabled = false;

  if (error) {
    showToast('Import failed: ' + error.message, 'error');
    btn.textContent = 'Import selected';
    return;
  }

  const importedCount = inserted?.length ?? toInsert.length;
  showToast(`Imported ${importedCount} lead${importedCount !== 1 ? 's' : ''} — visit Dashboard to review`, 'success');

  // Mark imported place IDs so re-render shows "Already added"
  toInsert.forEach(r => existingPlaceIds.add(r.google_place_id));
  checked.forEach(cb => {
    cb.checked = false;
    cb.disabled = true;
    // Update status cell
    const row = cb.closest('tr');
    row.cells[7].innerHTML = '<span class="badge badge-submitted" style="font-size:10px">Just imported</span>';
  });

  updateImportBtn();
});

// ---- Address parsing helpers --------------------------------
function parseProvince(address) {
  // Canadian addresses end like "… BC V1A 2B3, Canada" or "… BC, Canada"
  const m = address.match(/\b([A-Z]{2})\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d/);
  if (m) return m[1];
  // Fallback: look for known province codes near end of string
  const codes = ['BC','AB','SK','MB','ON','QC','NB','NS','PE','NL','NT','YT','NU'];
  for (const code of codes) {
    if (new RegExp(`\\b${code}\\b`).test(address)) return code;
  }
  return null;
}

function parseCity(address) {
  // "123 Industrial Ave, Surrey, BC V3T 0A1, Canada"
  const parts = address.split(',').map(s => s.trim());
  // City is usually the second-to-last segment before province+postal
  if (parts.length >= 3) return parts[parts.length - 3] || null;
  if (parts.length === 2) return parts[0] || null;
  return null;
}

// ---- Utilities ----------------------------------------------
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
