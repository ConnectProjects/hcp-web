/**
 * techtool/screens/new-visit.js
 *
 * Integrated version: Creates local packets and handles
 * provincial rules for offline field work.
 */

import { savePacket, getAllPackets } from '../db/idb.js'

const PROVINCES = [
  { code: 'BC', name: 'British Columbia' },
  { code: 'AB', name: 'Alberta' },
  { code: 'SK', name: 'Saskatchewan' }
]

export async function renderNewVisit(container, state, navigate) {
  let employees = [];

  // Deduplicated company list from already-loaded packets
  const existingCompanies = [...new Map(
    (state.packets ?? [])
      .filter(p => p.company?.name)
      .map(p => [p.company.name, { name: p.company.name, province: p.company.province ?? '' }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  const render = () => {
    const draft       = state._nvDraft ?? {}
    const coSelect    = draft.coSelect ?? '__new__'
    const isNew       = coSelect === '__new__'
    const defaultProv = draft.province ?? 'BC'

    container.innerHTML = `
      <div class="screen">
        <header class="app-header">
          <button class="btn btn-ghost" id="btn-back">‹ Dashboard</button>
          <h1 class="app-title">New Offline Visit</h1>
        </header>

        <main class="screen-body" style="max-width:700px; padding:20px; margin: 0 auto;">

          <div class="alert alert-warn" style="margin-bottom:20px; background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; border: 1px solid #ffeeba;">
            <strong>📵 Offline Mode:</strong> This packet is stored locally. You will submit it to the office once you have a connection.
          </div>

          <!-- Company / Site section -->
          <div class="form-card" style="margin-bottom: 20px;">
            <h2 style="color: var(--navy-mid); margin-bottom: 15px;">Site Details</h2>

            ${existingCompanies.length > 0 ? `
            <div class="form-group">
              <label>Company</label>
              <select id="nv-co-select">
                <option value="__new__" ${isNew ? 'selected' : ''}>— Enter new company —</option>
                ${existingCompanies.map(c =>
                  `<option value="${esc(c.name)}" data-province="${esc(c.province)}"
                    ${coSelect === c.name ? 'selected' : ''}>${esc(c.name)}</option>`
                ).join('')}
              </select>
            </div>
            ` : ''}

            <div class="form-group" id="nv-co-name-group" ${!isNew ? 'style="display:none"' : ''}>
              <label>Company Name *</label>
              <input id="nv-co-name" type="text" placeholder="e.g. Sunrise Milling LP"
                value="${esc(draft.coName ?? '')}" />
            </div>

            <div class="form-group">
              <label>Location / Site Name</label>
              <input id="nv-location" type="text" placeholder="e.g. Main Plant, Warehouse B, 123 Main St"
                value="${esc(draft.locationName ?? '')}" />
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div class="form-group">
                <label>Province *</label>
                <select id="nv-province" class="q-select" style="width:100%">
                  <option value="">— select —</option>
                  ${PROVINCES.map(p =>
                    `<option value="${p.code}" ${defaultProv === p.code ? 'selected' : ''}>${p.code} — ${p.name}</option>`
                  ).join('')}
                </select>
              </div>

              <div class="form-group">
                <label>Visit Date *</label>
                <input id="nv-date" type="date" value="${draft.visitDate ?? new Date().toISOString().slice(0,10)}" />
              </div>
            </div>

            <div class="form-group">
              <label>Notes (Optional)</label>
              <textarea id="nv-co-notes" rows="2" placeholder="e.g. Ask for Bob at the gate">${esc(draft.coNotes ?? '')}</textarea>
            </div>
          </div>

          <!-- Employees section -->
          <div class="form-card">
            <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h2 style="margin:0;">Workers <span style="font-size:14px; color:#999;">(${employees.length})</span></h2>
              <button class="btn btn-outline btn-sm" id="btn-add-emp">+ Add Worker</button>
            </div>

            ${employees.length === 0
              ? '<p class="empty-note" style="text-align:center; padding:20px; color:#999; border: 1px dashed #ccc; border-radius: 8px;">No workers added yet.</p>'
              : `<div class="nv-emp-list">
                  ${employees.map((e, i) => `
                    <div class="nv-emp-row" style="display:flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; align-items:center;">
                      <div>
                        <div style="font-weight:bold;">${esc(e.last_name)}, ${esc(e.first_name)}</div>
                        <div style="font-size:11px; color:#666;">${esc(e.job_title || 'No Title')}</div>
                      </div>
                      <button class="btn btn-ghost btn-sm nv-btn-remove-emp" data-idx="${i}" style="color:var(--red)">✕</button>
                    </div>
                  `).join('')}
                </div>`
            }
          </div>

          <!-- Add employee modal -->
          <div id="nv-emp-form" class="modal hidden">
            <div class="modal-backdrop"></div>
            <div class="modal-box">
              <div class="modal-header"><h2>New Worker</h2></div>
              <div class="modal-body">
                <div class="form-group"><label>First Name *</label><input id="ef-first" type="text" /></div>
                <div class="form-group"><label>Last Name *</label><input id="ef-last" type="text" /></div>
                <div class="form-group"><label>Date of Birth</label><input id="ef-dob" type="date" /></div>
                <div class="form-group"><label>Job Title</label><input id="ef-title" type="text" /></div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-ghost btn-sm" id="btn-cancel-emp">Cancel</button>
                <button class="btn btn-primary btn-sm" id="btn-save-emp">Add to List</button>
              </div>
            </div>
          </div>

          <div id="nv-msg" class="alert hidden" style="margin-top:20px"></div>
          <button class="btn btn-primary btn-block" id="btn-create" style="margin-top:20px; padding:15px; font-size:16px; background: var(--navy-mid);">
            📋 Create Manual Visit Packet
          </button>

        </main>
      </div>
    `;

    wireEvents();
  };

  function wireEvents() {
    container.querySelector('#btn-back').onclick = () => {
      state._nvDraft = null;
      navigate('dashboard');
    };

    // Company dropdown — toggle new-company text input and auto-fill province
    const coSelectEl = container.querySelector('#nv-co-select');
    if (coSelectEl) {
      coSelectEl.onchange = () => {
        const val      = coSelectEl.value;
        const nameGrp  = container.querySelector('#nv-co-name-group');
        const provSel  = container.querySelector('#nv-province');
        if (val === '__new__') {
          nameGrp.style.display = '';
        } else {
          nameGrp.style.display = 'none';
          const opt = coSelectEl.selectedOptions[0];
          if (opt?.dataset.province) provSel.value = opt.dataset.province;
        }
      };
    }

    const empModal = container.querySelector('#nv-emp-form');

    container.querySelector('#btn-add-emp').onclick = () => {
      empModal.classList.remove('hidden');
      container.querySelector('#ef-first').focus();
    };

    container.querySelector('#btn-cancel-emp').onclick = () => empModal.classList.add('hidden');

    container.querySelector('#btn-save-emp').onclick = () => {
      const fn = container.querySelector('#ef-first').value.trim();
      const ln = container.querySelector('#ef-last').value.trim();
      if (!fn || !ln) return alert('First and last name are required.');

      employees.push({
        employee_id:    'offline_' + self.crypto.randomUUID().slice(0,8),
        first_name:     fn,
        last_name:      ln,
        dob:            container.querySelector('#ef-dob').value || null,
        job_title:      container.querySelector('#ef-title').value.trim() || null,
        status:         'active',
        completed_tests: []
      });
      empModal.classList.add('hidden');
      render();
    };

    container.querySelectorAll('.nv-btn-remove-emp').forEach(btn => {
      btn.onclick = () => {
        employees.splice(Number(btn.dataset.idx), 1);
        render();
      };
    });

    container.querySelector('#btn-create').onclick = async () => {
      const coSelectEl  = container.querySelector('#nv-co-select');
      const coSelectVal = coSelectEl?.value ?? '__new__';
      const coName      = coSelectVal === '__new__'
        ? container.querySelector('#nv-co-name').value.trim()
        : coSelectVal;
      const locationName = container.querySelector('#nv-location').value.trim() || 'Manual Entry';
      const province     = container.querySelector('#nv-province').value;
      const date         = container.querySelector('#nv-date').value;

      if (!coName)    return alert('Please enter or select a company name.');
      if (!province)  return alert('Please select a province.');
      if (!date)      return alert('Please enter a visit date.');
      if (employees.length === 0) return alert('Add at least one worker first.');

      const btn = container.querySelector('#btn-create');
      btn.disabled    = true;
      btn.textContent = 'Fetching Rules...';

      try {
        const [rulesData, counselData] = await Promise.all([
          fetchJson(`../shared/rules/${province}.json`),
          fetchJson(`../shared/counsel/${province}.json`)
        ]);

        const rules   = rulesData?.rules ?? [];
        const counsel = counselData?.templates ?? [];

        const tech      = state.user;
        const initials  = tech?.initials ?? 'XX';
        const packetId  = `OFFLINE-${province}-${Date.now()}`;
        const filename  = `OFFLINE_${coName.replace(/\s/g, '_')}_${date}.json`;

        const packet = {
          packet_id:         packetId,
          filename,
          status:            'pending',
          _is_offline:       true,
          created_at:        new Date().toISOString(),
          tech:              { tech_id: tech?.user_id, tech_initials: initials },
          visit:             { visit_date: date, province },
          company:           { name: coName, province },
          location_name:     locationName,
          rules,
          counsel_templates: counsel,
          employees,
        };

        await savePacket(packet);

        state.packets = await getAllPackets();
        state.slots.forEach(s => { s.currentEmployee = null; s.testData = {}; });
        state._nvDraft = null;

        alert('Manual Packet Created!');
        navigate('dashboard');
      } catch (e) {
        alert('Error creating packet: ' + e.message);
        btn.disabled    = false;
        btn.textContent = '📋 Create Manual Visit Packet';
      }
    };
  }

  render();
}

// --- HELPERS ---

async function fetchJson(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
