/**
 * techtool/screens/new-visit.js
 *
 * Creates a local offline packet for field work without a pre-generated packet.
 */

import { savePacket, getAllPackets } from '../db/idb.js'

const PROVINCES = [
  { code: 'BC', name: 'British Columbia' },
  { code: 'AB', name: 'Alberta' },
  { code: 'SK', name: 'Saskatchewan' }
]

export async function renderNewVisit(container, state, navigate) {
  let employees = [];

  // Prefer the richer directory from sync folder; fall back to names extracted from loaded packets
  const companyList = state.companies?.length
    ? state.companies
    : [...new Map(
        (state.packets ?? [])
          .filter(p => p.company?.name)
          .map(p => [p.company.name, { name: p.company.name, province: p.company.province ?? '', locations: [] }])
      ).values()].sort((a, b) => a.name.localeCompare(b.name))

  // Draft state survives employee-list re-renders within the same visit session
  const d = state._nvDraft ?? {}
  const draft = {
    coSelect:     d.coSelect     ?? '__new__',
    locSelect:    d.locSelect    ?? '__new__',
    coName:       d.coName       ?? '',
    locationName: d.locationName ?? '',
    province:     d.province     ?? 'BC',
    visitDate:    d.visitDate    ?? new Date().toISOString().slice(0, 10),
    coNotes:      d.coNotes      ?? ''
  }

  const render = () => {
    const isNewCo   = draft.coSelect === '__new__'
    const selectedCo = companyList.find(c => c.name === draft.coSelect)
    const coLocs     = selectedCo?.locations ?? []
    const isNewLoc   = draft.locSelect === '__new__'

    container.innerHTML = `
      <div class="screen">
        <header class="app-header">
          <button class="btn btn-ghost" id="btn-back">‹ Dashboard</button>
          <h1 class="app-title">New Offline Visit</h1>
        </header>

        <main class="screen-body" style="max-width:700px; padding:20px; margin: 0 auto;">

          <div class="alert alert-warn" style="margin-bottom:20px; background:#fff3cd; color:#856404; padding:15px; border-radius:8px; border:1px solid #ffeeba;">
            <strong>📵 Offline Mode:</strong> This packet is stored locally. You will submit it to the office once you have a connection.
          </div>

          <!-- Site Details -->
          <div class="form-card" style="margin-bottom:20px;">
            <h2 style="color:var(--navy-mid); margin-bottom:15px;">Site Details</h2>

            ${companyList.length > 0 ? `
            <div class="form-group">
              <label>Company</label>
              <select id="nv-co-select">
                <option value="__new__" ${isNewCo ? 'selected' : ''}>— Enter new company —</option>
                ${companyList.map(c =>
                  `<option value="${esc(c.name)}" data-province="${esc(c.province ?? '')}"
                    ${draft.coSelect === c.name ? 'selected' : ''}>${esc(c.name)}</option>`
                ).join('')}
              </select>
            </div>
            ` : ''}

            <div class="form-group" id="nv-co-name-group" ${!isNewCo ? 'style="display:none"' : ''}>
              <label>${companyList.length > 0 ? 'New Company Name *' : 'Company Name *'}</label>
              <input id="nv-co-name" type="text" placeholder="e.g. Sunrise Milling LP"
                value="${esc(draft.coName)}" />
            </div>

            ${(!isNewCo && coLocs.length > 0) ? `
            <div class="form-group" id="nv-loc-group">
              <label>Location / Site</label>
              <select id="nv-loc-select">
                <option value="__new__" ${isNewLoc ? 'selected' : ''}>— Enter new location —</option>
                ${coLocs.map(l =>
                  `<option value="${esc(l.name)}" ${draft.locSelect === l.name ? 'selected' : ''}>${esc(l.name)}</option>`
                ).join('')}
              </select>
            </div>
            ` : ''}

            <div class="form-group" id="nv-loc-name-group" ${(!isNewCo && coLocs.length > 0 && !isNewLoc) ? 'style="display:none"' : ''}>
              <label>Location / Site Name</label>
              <input id="nv-location" type="text" placeholder="e.g. Main Plant, Warehouse B"
                value="${esc(draft.locationName)}" />
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
              <div class="form-group">
                <label>Province *</label>
                <select id="nv-province" class="q-select" style="width:100%">
                  <option value="">— select —</option>
                  ${PROVINCES.map(p =>
                    `<option value="${p.code}" ${draft.province === p.code ? 'selected' : ''}>${p.code} — ${p.name}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Visit Date *</label>
                <input id="nv-date" type="date" value="${draft.visitDate}" />
              </div>
            </div>

            <div class="form-group">
              <label>Notes (Optional)</label>
              <textarea id="nv-co-notes" rows="2" placeholder="e.g. Ask for Bob at the gate">${esc(draft.coNotes)}</textarea>
            </div>
          </div>

          <!-- Workers -->
          <div class="form-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
              <h2 style="margin:0;">Workers <span style="font-size:14px; color:#999;">(${employees.length})</span></h2>
              <button class="btn btn-outline btn-sm" id="btn-add-emp">+ Add Worker</button>
            </div>
            ${employees.length === 0
              ? '<p class="empty-note" style="text-align:center; padding:20px; color:#999; border:1px dashed #ccc; border-radius:8px;">No workers added yet.</p>'
              : `<div class="nv-emp-list">
                  ${employees.map((e, i) => `
                    <div class="nv-emp-row" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;">
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

          <!-- Add worker modal -->
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
          <button class="btn btn-primary btn-block" id="btn-create"
            style="margin-top:20px; padding:15px; font-size:16px; background:var(--navy-mid);">
            📋 Create Manual Visit Packet
          </button>

        </main>
      </div>
    `

    wireEvents()
  }

  function wireEvents() {
    container.querySelector('#btn-back').onclick = () => {
      state._nvDraft = null
      navigate('dashboard')
    }

    // Company dropdown — show/hide new-company input, repopulate location dropdown
    const coSelectEl = container.querySelector('#nv-co-select')
    if (coSelectEl) {
      coSelectEl.onchange = () => {
        const val     = coSelectEl.value
        const nameGrp = container.querySelector('#nv-co-name-group')
        const provSel = container.querySelector('#nv-province')

        draft.coSelect  = val
        draft.locSelect = '__new__'
        draft.locationName = ''

        if (val === '__new__') {
          nameGrp.style.display = ''
        } else {
          nameGrp.style.display = 'none'
          const co = companyList.find(c => c.name === val)
          if (co?.province) provSel.value = co.province
        }
        // Re-render to update the location section for the newly selected company
        saveDraftFromDOM()
        render()
      }
    }

    // Location dropdown — show/hide the location name text input
    const locSelectEl = container.querySelector('#nv-loc-select')
    if (locSelectEl) {
      locSelectEl.onchange = () => {
        const locNameGrp = container.querySelector('#nv-loc-name-group')
        const locInput   = container.querySelector('#nv-location')
        draft.locSelect  = locSelectEl.value
        if (locSelectEl.value === '__new__') {
          locNameGrp.style.display = ''
          locInput.value = ''
          draft.locationName = ''
        } else {
          locNameGrp.style.display = 'none'
          locInput.value = locSelectEl.value
          draft.locationName = locSelectEl.value
        }
      }
    }

    const empModal = container.querySelector('#nv-emp-form')

    container.querySelector('#btn-add-emp').onclick = () => {
      empModal.classList.remove('hidden')
      container.querySelector('#ef-first').focus()
    }

    container.querySelector('#btn-cancel-emp').onclick = () => empModal.classList.add('hidden')

    container.querySelector('#btn-save-emp').onclick = () => {
      const fn = container.querySelector('#ef-first').value.trim()
      const ln = container.querySelector('#ef-last').value.trim()
      if (!fn || !ln) return alert('First and last name are required.')
      employees.push({
        employee_id:     'offline_' + self.crypto.randomUUID().slice(0, 8),
        first_name:      fn,
        last_name:       ln,
        dob:             container.querySelector('#ef-dob').value || null,
        job_title:       container.querySelector('#ef-title').value.trim() || null,
        status:          'active',
        completed_tests: []
      })
      empModal.classList.add('hidden')
      saveDraftFromDOM()
      render()
    }

    container.querySelectorAll('.nv-btn-remove-emp').forEach(btn => {
      btn.onclick = () => {
        employees.splice(Number(btn.dataset.idx), 1)
        saveDraftFromDOM()
        render()
      }
    })

    container.querySelector('#btn-create').onclick = async () => {
      saveDraftFromDOM()

      const coSelectVal  = draft.coSelect
      const isNewCo      = coSelectVal === '__new__'
      const coName       = isNewCo
        ? container.querySelector('#nv-co-name')?.value.trim()
        : coSelectVal

      const locSelectVal = draft.locSelect
      const isNewLoc     = locSelectVal === '__new__'
      const locationName = isNewLoc
        ? (container.querySelector('#nv-location')?.value.trim() || 'Manual Entry')
        : locSelectVal

      const province = draft.province
      const date     = draft.visitDate

      if (!coName)               return alert('Please enter or select a company name.')
      if (!province)             return alert('Please select a province.')
      if (!date)                 return alert('Please enter a visit date.')
      if (employees.length === 0) return alert('Add at least one worker first.')

      const btn = container.querySelector('#btn-create')
      btn.disabled    = true
      btn.textContent = 'Fetching Rules...'

      try {
        const [rulesData, counselData] = await Promise.all([
          fetchJson(`../shared/rules/${province}.json`),
          fetchJson(`../shared/counsel/${province}.json`)
        ])

        const rules   = rulesData?.rules ?? []
        const counsel = counselData?.templates ?? []

        const tech     = state.user
        const initials = tech?.initials ?? 'XX'
        const packetId = `OFFLINE-${province}-${Date.now()}`
        const filename = `OFFLINE_${coName.replace(/\s/g, '_')}_${date}.json`

        // Include known IDs when selecting existing company/location so MasterDB can match exactly
        const selectedCo  = companyList.find(c => c.name === coName)
        const selectedLoc = selectedCo?.locations?.find(l => l.name === locationName)

        const packet = {
          packet_id:         packetId,
          filename,
          status:            'pending',
          _is_offline:       true,
          created_at:        new Date().toISOString(),
          tech:              { tech_id: tech?.user_id, tech_initials: initials },
          visit:             { visit_date: date, province },
          company:           { company_id: selectedCo?.company_id ?? null, name: coName, province },
          location:          selectedLoc ? { location_id: selectedLoc.location_id, name: selectedLoc.name } : null,
          location_name:     locationName,
          rules,
          counsel_templates: counsel,
          employees,
        }

        await savePacket(packet)
        state.packets = await getAllPackets()
        state.slots.forEach(s => { s.currentEmployee = null; s.testData = {} })
        state._nvDraft = null

        alert('Manual Packet Created!')
        navigate('dashboard')
      } catch (e) {
        alert('Error creating packet: ' + e.message)
        btn.disabled    = false
        btn.textContent = '📋 Create Manual Visit Packet'
      }
    }
  }

  function saveDraftFromDOM() {
    draft.province     = container.querySelector('#nv-province')?.value     ?? draft.province
    draft.visitDate    = container.querySelector('#nv-date')?.value         ?? draft.visitDate
    draft.coNotes      = container.querySelector('#nv-co-notes')?.value     ?? draft.coNotes
    draft.coName       = container.querySelector('#nv-co-name')?.value      ?? draft.coName
    draft.locationName = container.querySelector('#nv-location')?.value     ?? draft.locationName
  }

  render()
}

// --- HELPERS ---

async function fetchJson(path) {
  try {
    const res = await fetch(path)
    return res.ok ? await res.json() : null
  } catch { return null }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
