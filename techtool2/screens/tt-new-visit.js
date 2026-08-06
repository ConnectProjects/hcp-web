/**
 * techtool2/screens/tt-new-visit.js — create an impromptu visit packet
 *
 * 3-step wizard:
 *   1. Company  — search existing or enter new
 *   2. Location — pick from company's locations or enter new
 *   3. Workers  — add one or more with live-search matching
 *
 * On "Create Visit", writes the packet to techs/{folder}/outbox/ and
 * navigates to tt-schedule where the new packet appears immediately.
 */

import { query, writePacket }              from '../../masterdb2/db/db.js'
import { search as searchWorkers }         from '../../masterdb2/db/workers.js'
import { createPacket }                    from '../../shared/packet/schema.js'

const PROVINCES = [
  ['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],
  ['NL','Newfoundland and Labrador'],['NS','Nova Scotia'],['NT','Northwest Territories'],
  ['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island'],
  ['QC','Quebec'],['SK','Saskatchewan'],['YT','Yukon'],
]

export function mount(container, { navigate, session }) {

  // ── Tech lookup ────────────────────────────────────────────────────────────
  let techRow = null
  try {
    techRow = query(
      `SELECT t.* FROM techs t
       JOIN users u ON LOWER(u.name) = LOWER(t.name)
       WHERE LOWER(t.name) = LOWER(?) AND t.active = 1 LIMIT 1`,
      [session.user?.name ?? '']
    )[0] ?? null
  } catch { /* handled in render */ }

  // ── State ──────────────────────────────────────────────────────────────────
  let _step = 1

  // Step 1 — Company
  let _co        = { name:'', city:'', address:'', contact_name:'', contact_phone:'', contact_email:'', website:'' }
  let _coId      = null    // null = new company
  let _coSearch  = ''
  let _coResults = []

  // Step 2 — Location
  let _loc       = { name:'', province:'', city:'', address:'', postal_code:'', contact_name:'', contact_phone:'', contact_email:'', cu_code:'' }
  let _locId     = null    // null = new location
  let _coLocs    = []      // existing active locations of selected company
  let _newLoc    = false   // user chose "+ new location"

  // Step 3 — Workers
  let _workers   = []      // { id, first_name, middle_name, last_name, dob, uid, isNew, baseline, prior_tests }
  let _wSearch   = ''
  let _wResults  = []
  let _wForm     = null    // { first_name, middle_name, last_name, dob } when entering new worker
  let _wAddMode  = false

  let _saving    = false
  let _saveErr   = null

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    container.innerHTML = `
      <div class="screen-header-row">
        <button class="back-link" id="back-btn">← ${_step > 1 ? 'Back' : 'Schedule'}</button>
        <h1>New Visit</h1>
        <span class="screen-subtitle">Step ${_step} of 3</span>
      </div>
      <div class="screen-body" id="step-body">
        ${!techRow
          ? `<div class="error-banner">Your tech profile was not found — ask an admin to configure your tech record.</div>`
          : renderStep()}
      </div>
    `
    container.querySelector('#back-btn').addEventListener('click', () => {
      if (_step > 1) { _step--; render() } else navigate('tt-schedule')
    })
    if (techRow) bindStep()
  }

  function renderStep() {
    if (_step === 1) return renderCompanyStep()
    if (_step === 2) return renderLocationStep()
    return renderWorkersStep()
  }

  // ── Step 1: Company ────────────────────────────────────────────────────────
  function renderCompanyStep() {
    const dropHtml = _coResults.length
      ? `<div class="nv-search-drop" id="co-drop">
           ${_coResults.map(c =>
             `<div class="nv-search-item" data-id="${c.company_id}">
               <strong>${esc(c.name)}</strong>
               ${c.city ? `<span style="color:var(--clr-subtle)"> — ${esc(c.city)}</span>` : ''}
             </div>`
           ).join('')}
           <div class="nv-search-item" data-id="new" style="color:var(--clr-primary)">+ Enter as new company</div>
         </div>`
      : (_coSearch.length >= 2
          ? `<div class="nv-search-drop"><div class="nv-search-item" style="color:var(--clr-subtle)">No matches — fill in below.</div></div>`
          : '')

    return `
      <div class="section-head"><h2>Company</h2></div>

      ${_coId
        ? `<div class="info-card" style="margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between">
             <div>
               <span class="badge badge-green">Matched</span>
               <strong style="margin-left:0.5rem">${esc(_co.name)}</strong>
               ${_co.city ? `<span style="color:var(--clr-subtle)"> — ${esc(_co.city)}</span>` : ''}
             </div>
             <button class="btn btn-secondary btn-sm" id="co-clear">Change</button>
           </div>`
        : `<div class="nv-search-wrap" style="margin-bottom:1rem">
             <input class="search-input" id="co-search" type="search" autocomplete="off"
                    placeholder="Search by company name…" value="${esc(_coSearch)}">
             ${dropHtml}
           </div>
           <div class="nv-form-grid">
             ${fld('co-name',  'Company name *',  _co.name)}
             ${fld('co-city',  'City',            _co.city)}
             ${fld('co-addr',  'Address',         _co.address)}
             ${fld('co-cname', 'Contact name',    _co.contact_name)}
             ${fld('co-phone', 'Contact phone',   _co.contact_phone)}
             ${fld('co-email', 'Contact email',   _co.contact_email)}
             ${fld('co-web',   'Website',         _co.website)}
           </div>`}

      <div style="display:flex;justify-content:flex-end;margin-top:1.25rem">
        <button class="btn btn-primary" id="step1-next" ${!_co.name.trim() ? 'disabled' : ''}>
          Next: Location →
        </button>
      </div>
    `
  }

  // ── Step 2: Location ───────────────────────────────────────────────────────
  function renderLocationStep() {
    const showPicker = _coId && _coLocs.length && !_newLoc
    const showForm   = !showPicker || _newLoc || (_coId && !_locId)

    const pickerHtml = showPicker ? `
      <div class="table-card" style="margin-bottom:1rem">
        ${_coLocs.map(l => `
          <label class="nv-worker-row" style="cursor:pointer">
            <input type="radio" name="loc-pick" value="${l.location_id}"
                   ${_locId === l.location_id ? 'checked' : ''} style="margin-right:0.5rem">
            <span style="flex:1">
              <strong>${esc(l.name)}</strong>
              ${l.city ? ` — ${esc(l.city)}` : ''}
            </span>
            <span class="badge badge-blue">${esc(l.province)}</span>
          </label>`).join('')}
        <label class="nv-worker-row" style="cursor:pointer">
          <input type="radio" name="loc-pick" value="new"
                 ${(!_locId || _newLoc) ? 'checked' : ''} style="margin-right:0.5rem">
          <span style="color:var(--clr-primary)">+ Add new location</span>
        </label>
      </div>` : ''

    const formHtml = (showForm || _newLoc || !_locId) ? `
      <div class="nv-form-grid">
        ${fld('loc-name',   'Location name *', _loc.name)}
        ${provSel('loc-prov', 'Province *',    _loc.province)}
        ${fld('loc-city',   'City',            _loc.city)}
        ${fld('loc-addr',   'Address',         _loc.address)}
        ${fld('loc-postal', 'Postal code',     _loc.postal_code)}
        ${fld('loc-cname',  'Contact name',    _loc.contact_name)}
        ${fld('loc-phone',  'Contact phone',   _loc.contact_phone)}
        ${fld('loc-email',  'Contact email',   _loc.contact_email)}
        ${fld('loc-cu',     'CU code',         _loc.cu_code)}
      </div>` : ''

    return `
      <div class="section-head"><h2>Location</h2></div>
      ${_co.name ? `<p style="color:var(--clr-subtle);margin-bottom:0.75rem;font-size:0.875rem">${esc(_co.name)}</p>` : ''}
      ${pickerHtml}
      ${formHtml}
      <div style="display:flex;justify-content:flex-end;margin-top:1.25rem">
        <button class="btn btn-primary" id="step2-next" ${locReady() ? '' : 'disabled'}>
          Next: Workers →
        </button>
      </div>
    `
  }

  function locReady() {
    if (_locId && !_newLoc) return true
    return !!(_loc.name.trim() && _loc.province)
  }

  // ── Step 3: Workers ────────────────────────────────────────────────────────
  function renderWorkersStep() {
    const locLabel = _locId && !_newLoc
      ? (_coLocs.find(l => l.location_id === _locId)?.name ?? '')
      : _loc.name

    const workerListHtml = _workers.length
      ? `<div class="table-card" style="margin-bottom:1rem">
           ${_workers.map((w, i) => `
             <div class="nv-worker-row">
               <div>
                 <strong>${esc(w.last_name)}, ${esc(w.first_name)}</strong>
                 ${w.dob ? `<span style="color:var(--clr-subtle);font-size:0.8125rem"> — ${esc(w.dob)}</span>` : ''}
                 ${w.isNew ? '' : `<span class="badge badge-green" style="margin-left:0.5rem">Matched</span>`}
               </div>
               <button class="btn btn-secondary btn-sm" data-remove="${i}">✕</button>
             </div>`).join('')}
         </div>`
      : `<p style="color:var(--clr-subtle);font-size:0.875rem;margin-bottom:0.75rem">No workers added yet.</p>`

    const wDropHtml = _wResults.length
      ? `<div class="nv-search-drop" id="w-drop">
           ${_wResults.map(w =>
             `<div class="nv-search-item" data-wid="${w.employee_id}">
               <strong>${esc(w.last_name)}, ${esc(w.first_name)}</strong>
               ${w.dob ? `<span style="color:var(--clr-subtle)"> — ${esc(w.dob)}</span>` : ''}
               ${w.company_name ? `<span style="color:var(--clr-subtle);font-size:0.8125rem"> (${esc(w.company_name)})</span>` : ''}
             </div>`).join('')}
           <div class="nv-search-item" data-wid="new" style="color:var(--clr-primary)">+ Add as new worker</div>
         </div>`
      : (_wSearch.length >= 2 ? `<div class="nv-search-drop"><div class="nv-search-item" style="color:var(--clr-subtle)">No match — fill in below.</div></div>` : '')

    const addPanelHtml = _wAddMode ? `
      <div class="info-card" style="margin-bottom:1rem">
        <div class="nv-search-wrap" style="margin-bottom:0.75rem">
          <input class="search-input" id="w-search" type="search" autocomplete="off"
                 placeholder="Search by name…" value="${esc(_wSearch)}">
          ${wDropHtml}
        </div>
        ${_wForm !== null ? `
          <div class="nv-form-grid">
            ${fld('wf-first',  'First name *',  _wForm.first_name  ?? '')}
            ${fld('wf-last',   'Last name *',   _wForm.last_name   ?? '')}
            ${fld('wf-middle', 'Middle name',   _wForm.middle_name ?? '')}
            ${fld('wf-dob',    'Date of birth', _wForm.dob         ?? '', 'date')}
          </div>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.75rem">
            <button class="btn btn-secondary btn-sm" id="w-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="w-confirm"
              ${_wForm.first_name?.trim() && _wForm.last_name?.trim() ? '' : 'disabled'}>
              Add Worker
            </button>
          </div>` : ''}
      </div>`
      : `<button class="btn btn-secondary" id="w-add-open" style="margin-bottom:1rem">+ Add Worker</button>`

    return `
      <div class="section-head"><h2>Workers</h2></div>
      <p style="color:var(--clr-subtle);font-size:0.875rem;margin-bottom:0.75rem">
        ${esc(_co.name)}${locLabel ? ` — ${esc(locLabel)}` : ''}
      </p>
      ${workerListHtml}
      ${addPanelHtml}
      <div style="display:flex;justify-content:flex-end;margin-top:1.25rem">
        <button class="btn btn-primary" id="create-btn"
          ${_workers.length && !_saving ? '' : 'disabled'}>
          ${_saving ? 'Creating…' : 'Create Visit →'}
        </button>
      </div>
      ${_saveErr ? `<div class="error-banner" style="margin-top:0.75rem">${esc(_saveErr)}</div>` : ''}
    `
  }

  // ── Bind events ────────────────────────────────────────────────────────────
  function bindStep() {
    if (_step === 1) bindCompany()
    else if (_step === 2) bindLocation()
    else bindWorkers()
  }

  function renderBody() {
    const body = container.querySelector('#step-body')
    if (body) { body.innerHTML = renderStep(); bindStep() }
  }

  function bindCompany() {
    const searchEl = container.querySelector('#co-search')
    searchEl?.addEventListener('input', e => {
      _coSearch = e.target.value
      _coResults = _coSearch.length >= 2
        ? query(`SELECT company_id, name, city FROM companies WHERE name LIKE ? AND active = 1 ORDER BY name LIMIT 8`,
                [`%${_coSearch}%`])
        : []
      renderBody()
    })

    container.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault()
        const id = el.dataset.id
        if (id === 'new') {
          _coId = null
          _co = { name: _coSearch.trim(), city:'', address:'', contact_name:'', contact_phone:'', contact_email:'', website:'' }
        } else {
          const co = query('SELECT * FROM companies WHERE company_id = ?', [Number(id)])[0]
          if (!co) return
          _coId = co.company_id
          _co   = { name: co.name, city: co.city ?? '', address: co.address ?? '',
                    contact_name: co.contact_name ?? '', contact_phone: co.contact_phone ?? '',
                    contact_email: co.contact_email ?? '', website: co.website ?? '' }
          _coSearch = co.name
        }
        _coResults = []
        renderBody()
      })
    })

    container.querySelector('#co-clear')?.addEventListener('click', () => {
      _coId = null; _coSearch = ''; _coResults = []
      _co = { name:'', city:'', address:'', contact_name:'', contact_phone:'', contact_email:'', website:'' }
      renderBody()
    })

    const coFieldMap = { 'co-name':'name','co-city':'city','co-addr':'address',
                         'co-cname':'contact_name','co-phone':'contact_phone',
                         'co-email':'contact_email','co-web':'website' }
    Object.entries(coFieldMap).forEach(([id, key]) => {
      container.querySelector(`#${id}`)?.addEventListener('input', e => {
        _co[key] = e.target.value
        const btn = container.querySelector('#step1-next')
        if (btn) btn.disabled = !_co.name.trim()
      })
    })

    container.querySelector('#step1-next')?.addEventListener('click', () => {
      if (!_co.name.trim()) return
      _coLocs  = _coId ? query('SELECT * FROM locations WHERE company_id = ? AND active = 1 ORDER BY name', [_coId]) : []
      _newLoc  = _coLocs.length === 0
      _locId   = null
      _loc     = { name:'', province:'', city:'', address:'', postal_code:'',
                   contact_name:'', contact_phone:'', contact_email:'', cu_code:'' }
      if (_coLocs.length === 1) {
        _locId = _coLocs[0].location_id
        const l = _coLocs[0]
        _loc = { name: l.name, province: l.province, city: l.city ?? '', address: l.address ?? '',
                 postal_code: l.postal_code ?? '', contact_name: l.contact_name ?? '',
                 contact_phone: l.contact_phone ?? '', contact_email: l.contact_email ?? '',
                 cu_code: l.cu_code ?? '' }
      }
      _step = 2; render()
    })
  }

  function bindLocation() {
    container.querySelectorAll('input[name="loc-pick"]').forEach(radio => {
      radio.addEventListener('change', e => {
        const val = e.target.value
        if (val === 'new') {
          _locId = null; _newLoc = true
          _loc = { name:'', province:'', city:'', address:'', postal_code:'',
                   contact_name:'', contact_phone:'', contact_email:'', cu_code:'' }
        } else {
          _locId = Number(val); _newLoc = false
          const l = _coLocs.find(l => l.location_id === _locId)
          if (l) _loc = { name: l.name, province: l.province, city: l.city ?? '', address: l.address ?? '',
                          postal_code: l.postal_code ?? '', contact_name: l.contact_name ?? '',
                          contact_phone: l.contact_phone ?? '', contact_email: l.contact_email ?? '',
                          cu_code: l.cu_code ?? '' }
        }
        renderBody()
      })
    })

    const locFieldMap = { 'loc-name':'name','loc-prov':'province','loc-city':'city',
                          'loc-addr':'address','loc-postal':'postal_code','loc-cname':'contact_name',
                          'loc-phone':'contact_phone','loc-email':'contact_email','loc-cu':'cu_code' }
    Object.entries(locFieldMap).forEach(([id, key]) => {
      container.querySelector(`#${id}`)?.addEventListener('change', e => {
        if (_locId && !_newLoc) return
        _loc[key] = e.target.value
        const btn = container.querySelector('#step2-next')
        if (btn) btn.disabled = !locReady()
      })
      container.querySelector(`#${id}`)?.addEventListener('input', e => {
        if (_locId && !_newLoc) return
        _loc[key] = e.target.value
        const btn = container.querySelector('#step2-next')
        if (btn) btn.disabled = !locReady()
      })
    })

    container.querySelector('#step2-next')?.addEventListener('click', () => {
      if (!locReady()) return
      _step = 3; render()
    })
  }

  function bindWorkers() {
    container.querySelector('#w-add-open')?.addEventListener('click', () => {
      _wAddMode = true; _wSearch = ''; _wResults = []; _wForm = null
      renderBody()
    })

    container.querySelector('#w-search')?.addEventListener('input', e => {
      _wSearch = e.target.value
      if (_wSearch.length >= 2) {
        const all = searchWorkers(_wSearch, { includeInactive: false })
        _wResults = all.filter(r => !_workers.some(w => w.id === r.employee_id)).slice(0, 8)
        if (!_wResults.length) _wForm = { first_name:'', middle_name:'', last_name:'', dob:'' }
      } else {
        _wResults = []; _wForm = null
      }
      renderBody()
    })

    container.querySelectorAll('[data-wid]').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault()
        const wid = el.dataset.wid
        if (wid === 'new') {
          _wForm = { first_name:'', middle_name:'', last_name:'', dob:'' }
          _wResults = []
        } else {
          const emp = query('SELECT * FROM employees WHERE employee_id = ?', [Number(wid)])[0]
          if (!emp) return
          const baseline    = query('SELECT * FROM baselines WHERE employee_id = ? AND archived = 0 LIMIT 1', [emp.employee_id])[0] ?? null
          const prior_tests = query('SELECT * FROM tests WHERE employee_id = ? ORDER BY test_date DESC LIMIT 2', [emp.employee_id])
          _workers.push({ id: emp.employee_id, first_name: emp.first_name, middle_name: emp.middle_name ?? '',
                          last_name: emp.last_name, dob: emp.dob ?? '', uid: emp.uid ?? null,
                          isNew: false, baseline, prior_tests })
          _wAddMode = false; _wSearch = ''; _wResults = []; _wForm = null
        }
        renderBody()
      })
    })

    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        _workers.splice(Number(btn.dataset.remove), 1)
        renderBody()
      })
    })

    container.querySelector('#w-cancel')?.addEventListener('click', () => {
      _wAddMode = false; _wSearch = ''; _wResults = []; _wForm = null
      renderBody()
    })

    const wfMap = { 'wf-first':'first_name','wf-last':'last_name','wf-middle':'middle_name','wf-dob':'dob' }
    Object.entries(wfMap).forEach(([id, key]) => {
      container.querySelector(`#${id}`)?.addEventListener('input', e => {
        if (!_wForm) return
        _wForm[key] = e.target.value
        const btn = container.querySelector('#w-confirm')
        if (btn) btn.disabled = !(_wForm.first_name?.trim() && _wForm.last_name?.trim())
      })
    })

    container.querySelector('#w-confirm')?.addEventListener('click', () => {
      if (!_wForm?.first_name?.trim() || !_wForm?.last_name?.trim()) return
      _workers.push({
        id:          `new_${Date.now()}`,
        first_name:  _wForm.first_name.trim(),
        middle_name: _wForm.middle_name?.trim() ?? '',
        last_name:   _wForm.last_name.trim(),
        dob:         _wForm.dob ?? '',
        uid:         null,
        isNew:       true,
        baseline:    null,
        prior_tests: [],
      })
      _wAddMode = false; _wSearch = ''; _wResults = []; _wForm = null
      renderBody()
    })

    container.querySelector('#create-btn')?.addEventListener('click', createVisit)
  }

  // ── Create packet ──────────────────────────────────────────────────────────
  async function createVisit() {
    if (!techRow?.folder_name) {
      _saveErr = 'No OneDrive folder configured for your tech profile — ask an admin.'
      render(); return
    }
    if (!_workers.length) {
      _saveErr = 'Add at least one worker before creating the visit.'
      render(); return
    }

    _saving = true; _saveErr = null; render()

    const province = (_locId && !_newLoc)
      ? (_coLocs.find(l => l.location_id === _locId)?.province ?? _loc.province)
      : _loc.province

    const companyForPacket = {
      company_id:    _coId ?? null,
      name:          _co.name.trim(),
      address:       _co.address || null,
      city:          _co.city   || null,
      contact_name:  _co.contact_name  || null,
      contact_phone: _co.contact_phone || null,
      contact_email: _co.contact_email || null,
      province,
    }

    const locationForPacket = (_locId && !_newLoc)
      ? _coLocs.find(l => l.location_id === _locId)
      : {
          location_id:   null,
          name:          _loc.name.trim(),
          province,
          address:       _loc.address    || null,
          city:          _loc.city       || null,
          postal_code:   _loc.postal_code || null,
          contact_name:  _loc.contact_name  || null,
          contact_phone: _loc.contact_phone || null,
          contact_email: _loc.contact_email || null,
          cu_code:       _loc.cu_code || null,
        }

    const rules = query(
      `SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC`,
      [province]
    )

    const initials = techRow.initials ?? techRow.name.slice(0, 2).toUpperCase()
    const today    = new Date().toISOString().slice(0, 10)

    let packet
    try {
      packet = createPacket({
        company:          companyForPacket,
        location:         locationForPacket,
        employees:        _workers.map(w => ({
          employee_id:  w.id,
          uid:          w.uid   ?? null,
          first_name:   w.first_name,
          middle_name:  w.middle_name || null,
          last_name:    w.last_name,
          dob:          w.dob  || null,
          status:       'active',
          baseline:     w.baseline    ?? null,
          prior_tests:  w.prior_tests ?? [],
        })),
        rules,
        counselTemplates: [],
        hpdInventory:     [],
        techId:           techRow.tech_id,
        techInitials:     initials,
        visitDate:        today,
      })
    } catch (e) {
      _saving = false; _saveErr = `Packet build failed: ${e.message}`
      render(); return
    }

    try {
      await writePacket(techRow.folder_name, packet.filename, packet)
    } catch (e) {
      _saving = false; _saveErr = `Could not write packet: ${e.message}`
      render(); return
    }

    navigate('tt-schedule')
  }

  // ── HTML helpers ───────────────────────────────────────────────────────────
  function fld(id, label, val = '', type = 'text') {
    return `
      <div class="nv-form-row">
        <label class="field-label" for="${id}">${esc(label)}</label>
        <input class="search-input" id="${id}" type="${type}"
               value="${esc(val)}" autocomplete="off">
      </div>`
  }

  function provSel(id, label, val = '') {
    const opts = PROVINCES.map(([code, name]) =>
      `<option value="${code}" ${val === code ? 'selected' : ''}>${code} — ${esc(name)}</option>`
    ).join('')
    return `
      <div class="nv-form-row">
        <label class="field-label" for="${id}">${esc(label)}</label>
        <select class="form-select" id="${id}" style="width:100%">
          <option value="">Select province…</option>
          ${opts}
        </select>
      </div>`
  }

  render()
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
