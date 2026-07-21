import { getLocation }           from '../db/locations.js'
import { buildPacketEmployees }  from '../db/locations.js'
import { getHPDInventory }       from '../db/locations.js'
import { getTechs, createPacketRecord } from '../db/packets.js'
import { query }                 from '../db/sqlite.js'
import { createPacket }          from '@shared/packet/schema.js'
import { getSyncFolder, pickSyncFolder, writeJsonFile } from '@shared/fs/sync-folder.js'
import { JsonDatabase }          from '@shared/fs/json-database.js'

export function renderGeneratePacket(container, state, navigate) {
  const location = state.currentLocation?.location_id
    ? getLocation(state.currentLocation.location_id)
    : null

  const techs = getTechs()
  const today = new Date().toLocaleDateString('en-CA')

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="breadcrumb">
          <button class="btn btn-link" id="btn-back">
            ${location ? esc(location.name) : 'Companies'}
          </button>
          <span>›</span>
          <span>Generate Packet</span>
        </div>
      </div>

      <div class="form-card">
        <h2>Packet Details</h2>

        <div class="form-grid">
          <div class="form-group span-2">
            <label>Location</label>
            ${location
              ? `<div class="read-only-field">${esc(location.name)} · <span class="province-badge">${esc(location.province)}</span></div>`
              : `<select id="f-location">
                  <option value="">— select location —</option>
                  ${getLocationsOptions()}
                </select>`
            }
          </div>
          <div class="form-group">
            <label>Visit Date *</label>
            <input id="f-visit-date" type="date" value="${today}" />
          </div>
          <div class="form-group">
            <label>Assigned Tech *</label>
            <select id="f-tech">
              <option value="">— select tech —</option>
              ${techs.map(t =>
                `<option value="${esc(t.tech_id)}"
                  data-initials="${esc(t.initials)}"
                  data-folder="${esc(t.folder_name ?? '')}"
                  >${esc(t.name)}${t.folder_name ? '' : ' ⚠ no folder'}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div id="preview-section" class="hidden">
          <h3>Packet Preview</h3>
          <div id="preview-content"></div>
        </div>

        <div id="packet-error"   class="alert alert-error   hidden"></div>
        <div id="packet-success" class="alert alert-success hidden"></div>

        <div class="action-row">
          <button class="btn btn-outline" id="btn-preview">Preview Packet</button>
          <button class="btn btn-primary" id="btn-generate">Generate &amp; Save to Sync Folder</button>
        </div>
      </div>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () =>
    location
      ? navigate('location-detail', { currentLocation: location })
      : navigate('companies')
  )

  container.querySelector('#btn-preview').addEventListener('click',  () => doPreview(container, location, state))
  container.querySelector('#btn-generate').addEventListener('click', () => doGenerate(container, location, state, navigate))
}

function getLocationsOptions() {
  const locations = query(`
    SELECT l.location_id, l.name, l.province, c.name AS company_name
    FROM locations l
    JOIN companies c ON c.company_id = l.company_id
    WHERE l.active = 1
    ORDER BY c.name, l.name
  `)
  return locations.map(l =>
    `<option value="${l.location_id}">${esc(l.company_name)} › ${esc(l.name)} (${esc(l.province)})</option>`
  ).join('')
}

function getFormValues(container, location) {
  const locationId = location?.location_id ?? Number(container.querySelector('#f-location')?.value)
  const visitDate  = container.querySelector('#f-visit-date').value
  const techSelect = container.querySelector('#f-tech')
  const techId     = techSelect?.value
  const techInit   = techSelect?.selectedOptions?.[0]?.dataset?.initials ?? techId?.slice(0,2).toUpperCase()
  const techFolder = techSelect?.selectedOptions?.[0]?.dataset?.folder ?? ''
  return { locationId, visitDate, techId, techInit, techFolder }
}

function doPreview(container, location, state) {
  const { locationId, visitDate, techId } = getFormValues(container, location)
  const errEl = container.querySelector('#packet-error')

  if (!locationId) { errEl.textContent = 'Select a location.';  errEl.classList.remove('hidden'); return }
  if (!visitDate)  { errEl.textContent = 'Select a visit date.'; errEl.classList.remove('hidden'); return }
  errEl.classList.add('hidden')

  const loc       = getLocation(locationId)
  const employees = buildPacketEmployees(locationId)

  const withPrior    = employees.filter(e => e.prior_tests?.length > 0)
  const withBaseline = employees.filter(e => e.baseline)

  // Collect the distinct visit dates actually included across all employees
  const includedDates = [...new Set(employees.flatMap(e => (e.prior_tests ?? []).map(t => t.test_date)))].sort().reverse()

  container.querySelector('#preview-content').innerHTML = `
    <div class="preview-card">
      <div class="preview-row"><span>Location</span><strong>${esc(loc.name)}</strong></div>
      <div class="preview-row"><span>Company</span><strong>${esc(loc.company_name)}</strong></div>
      <div class="preview-row"><span>Province</span><strong>${esc(loc.province)}</strong></div>
      <div class="preview-row"><span>Visit Date</span><strong>${visitDate}</strong></div>
      <div class="preview-row"><span>Employees in packet</span><strong>${employees.length}</strong></div>
      <div class="preview-row"><span>Employees with baseline</span><strong>${withBaseline.length}</strong></div>
      <div class="preview-row"><span>Employees with prior tests</span><strong>${withPrior.length}</strong></div>
      <div class="preview-row"><span>Prior test visit dates</span><strong>${includedDates.length > 0 ? includedDates.join(', ') : '— none —'}</strong></div>
      <div class="preview-row"><span>Tech</span><strong>${techId ? esc(techId) : '— not selected —'}</strong></div>
    </div>
    <div class="preview-emp-list">
      ${employees.slice(0, 10).map(e =>
        `<div class="preview-emp-row">
          <span>${esc(e.last_name)}, ${esc(e.first_name)}</span>
          <span class="td-muted">
            ${e.baseline ? 'Baseline on file' : 'No baseline'}
            ${e.prior_tests?.length ? ` · ${e.prior_tests.length} prior test${e.prior_tests.length > 1 ? 's' : ''}` : ''}
          </span>
        </div>`
      ).join('')}
      ${employees.length > 10 ? `<div class="preview-emp-more">+ ${employees.length - 10} more</div>` : ''}
    </div>
  `
  container.querySelector('#preview-section').classList.remove('hidden')
}

async function doGenerate(container, location, state, navigate) {
  const { locationId, visitDate, techId, techInit, techFolder } = getFormValues(container, location)
  const errEl = container.querySelector('#packet-error')
  const sucEl = container.querySelector('#packet-success')
  const btn   = container.querySelector('#btn-generate')

  errEl.classList.add('hidden')
  sucEl.classList.add('hidden')

  if (!locationId)  { errEl.textContent = 'Select a location.';   errEl.classList.remove('hidden'); return }
  if (!visitDate)   { errEl.textContent = 'Visit date required.'; errEl.classList.remove('hidden'); return }
  if (!techId)      { errEl.textContent = 'Select a tech.';       errEl.classList.remove('hidden'); return }
  if (!techFolder)  {
    errEl.textContent = 'Selected tech has no folder name. Set it in Settings → Technicians.'
    errEl.classList.remove('hidden'); return
  }

  btn.disabled    = true
  btn.textContent = 'Generating…'

  try {
    let folder = state.syncFolder
    if (!folder) {
      btn.textContent = 'Select sync folder…'
      folder = await getSyncFolder()
      if (!folder) folder = await pickSyncFolder()
      state.syncFolder = folder
    }

    btn.textContent = 'Saving packet…'

    const loc       = getLocation(locationId)
    const employees = buildPacketEmployees(locationId)
    const rules     = query('SELECT * FROM classification_rules WHERE province_code = ? ORDER BY priority DESC', [loc.province])
    const counsel   = query('SELECT * FROM counsel_templates    WHERE province_code = ?', [loc.province])
    const hpdInv    = getHPDInventory(locationId)

    // Build a company-compatible object for createPacket
    const companyForPacket = {
      company_id:    loc.company_id,
      name:          loc.company_name,
      province:      loc.province,
      address:       loc.address,
      contact_name:  loc.contact_name,
      contact_phone: loc.contact_phone,
      sticky_notes:  loc.sticky_notes ?? ''
    }

    const packet = createPacket({
      company:          companyForPacket,
      location:         loc,
      employees,
      rules,
      counselTemplates: counsel,
      hpdInventory:     hpdInv,
      techId,
      techInitials:     techInit ?? 'XX',
      visitDate,
      stickyNotes:      loc.sticky_notes ?? ''
    })

    const techSubfolder = `techs/${techFolder}`
    await writeJsonFile(folder, techSubfolder, packet.filename, packet)
    createPacketRecord(packet.packet_id, loc.company_id, locationId, techId, visitDate, packet.filename, state.user?.user_id)
    await JsonDatabase.pushTable(folder, query, 'packets')

    sucEl.textContent = `✓ Packet "${packet.filename}" saved to ConnectHearing/techs/${techFolder}.`
    sucEl.classList.remove('hidden')
    btn.textContent = '✓ Generated'
  } catch (e) {
    if (e.name !== 'AbortError') {
      errEl.textContent = `Failed: ${e.message}`
      errEl.classList.remove('hidden')
    }
    btn.disabled    = false
    btn.textContent = 'Generate & Save to Sync Folder'
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
