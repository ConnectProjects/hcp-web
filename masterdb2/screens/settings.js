/**
 * masterdb2/screens/settings.js — DB status, conflict copies, backups, tech management
 *
 * Techs drive the import screen (folder_name) and packet generation, so they
 * live here rather than in the Users screen.
 */

import { query, run, scalar, save, listBackups, checkConflictCopies } from '../db/db.js'

// ── Seed: known staff ─────────────────────────────────────────────────────────
const SEED_USERS = [
  { name: 'Cal Scanland',     initials: 'CS',  role: 'aud_tech',    folder_name: 'Cal'    },
  { name: 'Darren Martin',    initials: 'DM',  role: 'aud_tech',    folder_name: 'Darren' },
  { name: 'Trevor Dufresne',  initials: 'TD',  role: 'aud_tech',    folder_name: 'Trevor' },
  { name: 'Mike Otto',        initials: 'MO',  role: 'aud_tech',    folder_name: 'Mike'   },
  { name: 'Andre St. Pierre', initials: 'AP',  role: 'aud_tech',    folder_name: 'Andre'  },
  { name: 'Tanya Kotsyuba',   initials: 'TK',  role: 'lc',          folder_name: null      },
  { name: 'Paul Schreve',     initials: 'PS',  role: 'lc',          folder_name: null      },
  { name: 'David Heron',      initials: 'DH',  role: 'lc',          folder_name: null      },
  { name: 'Cliff Stevens',    initials: 'CS2', role: 'lc',          folder_name: null      },
  { name: 'Heather Wiebe',    initials: 'HW',  role: 'admin',       folder_name: null      },
  { name: 'Judy Whitley',     initials: 'JW',  role: 'admin',       folder_name: null      },
  { name: 'Jan Brothen',      initials: 'JB',  role: 'super_admin', folder_name: 'Jan'    },
  { name: 'Norman Robichaud', initials: 'NR',  role: 'super_admin', folder_name: 'Norman' },
]

export function mount(container, { session }) {
  // State
  let _editingId  = null    // tech_id being edited, or 'new', or null
  let _statusMsg  = ''
  let _backups    = []
  let _conflicts  = []
  let _asyncDone  = false

  let _seedMsg = null

  render()

  // Async: load file-system info (backups + conflict copies)
  Promise.all([listBackups(), checkConflictCopies()])
    .then(([backups, conflicts]) => {
      _backups   = backups
      _conflicts = conflicts
      _asyncDone = true
      renderDbSection()
    })
    .catch(() => { _asyncDone = true; renderDbSection() })

  // ── Main render ───────────────────────────────────────────────────────────

  function render() {
    container.innerHTML = `
      <div class="screen-header-row"><h1>Settings</h1></div>
      <div class="screen-body">
        <div id="s-db"></div>
        <div id="s-seed"></div>
        <div id="s-techs"></div>
      </div>
    `
    renderDbSection()
    renderSeed()
    renderTechs()
  }

  // ── DB Status section ─────────────────────────────────────────────────────

  function renderDbSection() {
    const el = container.querySelector('#s-db')
    if (!el) return

    const meta = query('SELECT save_seq, last_writer, saved_at FROM meta')[0] ?? {}

    const conflictHTML = !_asyncDone
      ? `<p style="color:var(--clr-subtle)">Checking…</p>`
      : _conflicts.length
        ? _conflicts.map(f => `<div class="badge badge-red" style="margin-bottom:0.25rem">${esc(f)}</div>`).join('')
        : `<span style="color:var(--clr-subtle)">None</span>`

    const backupHTML = !_asyncDone
      ? `<p style="color:var(--clr-subtle)">Loading…</p>`
      : !_backups.length
        ? `<span style="color:var(--clr-subtle)">No backups yet.</span>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>File</th><th style="text-align:right">Size</th><th>Modified</th></tr></thead>
            <tbody>
              ${_backups.slice(0, 20).map(b => `
                <tr>
                  <td style="font-size:0.8rem">${esc(b.name)}</td>
                  <td style="text-align:right;font-size:0.8rem">${b.size != null ? fmtSize(b.size) : ''}</td>
                  <td style="font-size:0.8rem;color:var(--clr-subtle)">${b.lastModified ? fmtTs(b.lastModified) : ''}</td>
                </tr>
              `).join('')}
              ${_backups.length > 20 ? `<tr><td colspan="3" style="color:var(--clr-subtle);font-size:0.8rem">… and ${_backups.length - 20} more</td></tr>` : ''}
            </tbody>
          </table></div>`

    el.innerHTML = `
      <div class="section-head"><h2>Database</h2></div>
      <div class="info-card" style="margin-bottom:1.5rem">
        <dl>
          ${row('Save sequence', meta.save_seq ?? '?')}
          ${row('Last writer',   meta.last_writer ?? '—')}
          ${row('Last saved at', meta.saved_at ? fmtTs(meta.saved_at) : '—')}
          ${row('Current user',  session.writerName ?? '—')}
        </dl>
      </div>

      <div class="section-head"><h2>Conflict Copies</h2></div>
      <div class="info-card" style="margin-bottom:1.5rem">
        <p style="font-size:0.8125rem;color:var(--clr-subtle);margin-bottom:0.5rem">
          Conflict copies appear when OneDrive syncs from two machines simultaneously.
          Resolve them in OneDrive before running an import.
        </p>
        ${conflictHTML}
      </div>

      <div class="section-head"><h2>Pre-Import Snapshots (${_asyncDone ? _backups.length : '…'})</h2></div>
      <div class="table-card" style="margin-bottom:2rem">
        <div style="padding:0.75rem">${backupHTML}</div>
      </div>
    `
  }

  // ── Seed section ──────────────────────────────────────────────────────────

  function renderSeed() {
    const el = container.querySelector('#s-seed')
    if (!el) return
    el.innerHTML = `
      <div class="section-head"><h2>Seed Data</h2></div>
      ${_seedMsg ? `<div class="${_seedMsg.ok ? 'success-banner' : 'error-banner'}" style="margin-bottom:0.75rem">${esc(_seedMsg.message)}</div>` : ''}
      <div class="info-card" style="margin-bottom:2rem">
        <p style="font-size:0.8125rem;color:var(--clr-subtle);margin-bottom:1rem">
          These buttons are safe to run multiple times — they skip records that already exist.
        </p>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
          <button class="btn btn-secondary" id="seed-users-btn">Seed Staff Users</button>
          <button class="btn btn-secondary" id="seed-test-btn">Seed Test Company</button>
        </div>
      </div>
    `
    el.querySelector('#seed-users-btn').addEventListener('click', seedUsers)
    el.querySelector('#seed-test-btn').addEventListener('click', seedTestCompany)
  }

  async function seedUsers() {
    try {
      let added = 0, updated = 0
      for (const u of SEED_USERS) {
        const exists = scalar('SELECT COUNT(*) FROM users WHERE name = ?', [u.name])
        if (exists) {
          // Always sync role, initials, folder_name — fixes stale roles from earlier builds
          run(
            `UPDATE users SET role = ?, initials = ?, folder_name = ? WHERE name = ?`,
            [u.role, u.initials, u.folder_name, u.name]
          )
          updated++
        } else {
          const uid = crypto.randomUUID()
          run(
            `INSERT INTO users (user_id, name, initials, role, folder_name, active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [uid, u.name, u.initials, u.role, u.folder_name]
          )
          added++
        }
        // Aud-techs also go into techs table for packet/import workflow
        if (u.role === 'aud_tech' && u.folder_name) {
          const techExists = scalar('SELECT COUNT(*) FROM techs WHERE name = ?', [u.name])
          if (!techExists) {
            const tid = crypto.randomUUID()
            run(
              `INSERT INTO techs (tech_id, name, initials, role, folder_name, active)
               VALUES (?, ?, ?, 'aud_tech', ?, 1)`,
              [tid, u.name, u.initials, u.folder_name]
            )
          } else {
            run(
              `UPDATE techs SET role = 'aud_tech', initials = ?, folder_name = ? WHERE name = ?`,
              [u.initials, u.folder_name, u.name]
            )
          }
        }
      }
      await save(session.writerName)
      _seedMsg = { ok: true, message: `Seed complete: ${added} added, ${updated} updated.` }
    } catch (e) {
      _seedMsg = { ok: false, message: `Seed failed: ${e.message}` }
    }
    renderSeed()
  }

  async function seedTestCompany() {
    try {
      // Idempotency check
      const exists = scalar("SELECT COUNT(*) FROM companies WHERE name = 'ACME Manufacturing Ltd.'")
      if (exists) {
        _seedMsg = { ok: true, message: 'Test company already exists.' }
        renderSeed(); return
      }

      // Company
      run(`INSERT INTO companies (name, city, address, contact_name, contact_phone, active)
           VALUES ('ACME Manufacturing Ltd.', 'Saskatoon', '100 Industrial Ave', 'Bob Manager', '306-555-0100', 1)`)
      const coId = scalar('SELECT last_insert_rowid()')

      // Location
      run(`INSERT INTO locations (company_id, name, province, city, address, postal_code, cu_code, active)
           VALUES (?, 'ACME - Main Plant', 'SK', 'Saskatoon', '100 Industrial Ave', 'S7K 1A1', 'SK-9999', 1)`,
        [coId])
      const locId = scalar('SELECT last_insert_rowid()')

      // Workers
      const workers = [
        ['John',   null,    'Smith',    '1975-03-15', 'Machine Operator', '2010-06-01'],
        ['Jane',   null,    'Doe',      '1980-06-22', 'Line Supervisor',  '2012-04-15'],
        ['Robert', null,    'Johnson',  '1968-11-08', 'Maintenance Tech', '2005-01-20'],
        ['Sarah',  null,    'Williams', '1990-04-30', 'Quality Control',  '2018-09-01'],
        ['David',  'James', 'Thompson', '1985-09-12', 'Welder',          '2023-03-01'],
      ]
      const empIds = []
      for (const [first, mid, last, dob, title, hire] of workers) {
        run(`INSERT INTO employees (current_location_id, first_name, middle_name, last_name, dob, job_title, hire_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
          [locId, first, mid, last, dob, title, hire])
        empIds.push(scalar('SELECT last_insert_rowid()'))
      }

      // Baselines and tests (Smith — normal)
      run(`INSERT INTO baselines (employee_id, location_id, test_date, archived,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,?,0, 10,10,10,10,10,15,15, 10,10,10,10,15,15,20)`,
        [empIds[0], locId, '2020-03-10'])
      run(`INSERT INTO tests (employee_id,location_id,test_date,test_type,province,classification,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,'2022-03-15','Periodic','SK','Normal',
           15,15,15,15,15,20,20, 15,15,15,15,20,20,25)`,
        [empIds[0], locId])
      run(`INSERT INTO tests (employee_id,location_id,test_date,test_type,province,classification,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,'2024-03-12','Periodic','SK','Normal',
           15,20,20,20,20,20,25, 20,20,20,20,25,25,30)`,
        [empIds[0], locId])

      // Doe — STS on last test
      run(`INSERT INTO baselines (employee_id,location_id,test_date,archived,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,?,0, 15,15,15,15,15,15,15, 15,15,15,15,15,15,15)`,
        [empIds[1], locId, '2019-05-20'])
      run(`INSERT INTO tests (employee_id,location_id,test_date,test_type,province,classification,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,'2022-05-18','Periodic','SK','Normal',
           15,20,20,20,25,25,25, 20,20,25,25,30,30,35)`,
        [empIds[1], locId])
      run(`INSERT INTO tests (employee_id,location_id,test_date,test_type,province,classification,
           sts_flag,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,'2024-05-14','Periodic','SK','STS',1,
           25,25,30,30,35,35,40, 25,30,35,35,40,40,45)`,
        [empIds[1], locId])

      // Johnson — referral
      run(`INSERT INTO baselines (employee_id,location_id,test_date,archived,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,?,0, 25,30,35,40,45,50,55, 30,35,40,45,50,55,60)`,
        [empIds[2], locId, '2018-02-14'])
      run(`INSERT INTO tests (employee_id,location_id,test_date,test_type,province,classification,
           sts_flag,referral_given_to_worker,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,'2024-02-20','Periodic','SK','Refer',1,1,
           35,40,45,55,60,65,70, 35,45,50,60,65,70,75)`,
        [empIds[2], locId])

      // Williams — baseline only (2024, normal hearing)
      run(`INSERT INTO baselines (employee_id,location_id,test_date,archived,
           left_500,left_1k,left_2k,left_3k,left_4k,left_6k,left_8k,
           right_500,right_1k,right_2k,right_3k,right_4k,right_6k,right_8k)
           VALUES (?,?,?,0, 10,10,10,10,10,10,10, 10,10,10,15,15,15,15)`,
        [empIds[3], locId, '2024-09-05'])

      // Thompson — new hire, no tests yet (no insert needed)

      await save(session.writerName)
      _seedMsg = { ok: true, message: `Test company "ACME Manufacturing Ltd." created with 5 workers and sample test history.` }
    } catch (e) {
      _seedMsg = { ok: false, message: `Seed failed: ${e.message}` }
    }
    renderSeed()
  }

  // ── Techs section ──────────────────────────────────────────────────────────

  function renderTechs() {
    const el = container.querySelector('#s-techs')
    if (!el) return

    const techs = query(`SELECT * FROM techs ORDER BY name`)

    const statusHTML = _statusMsg
      ? `<div class="success-banner" style="margin-bottom:0.75rem">${esc(_statusMsg)}</div>`
      : ''

    const techRows = techs.map(t => {
      if (t.tech_id === _editingId) return techEditRow(t)
      return `
        <tr>
          <td><strong>${esc(t.name)}</strong></td>
          <td>${esc(t.initials ?? '—')}</td>
          <td><code style="font-size:0.8rem">${esc(t.folder_name ?? '—')}</code></td>
          <td>${esc(t.iat_number ?? '—')}</td>
          <td>${t.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
          <td>
            <button class="btn btn-secondary" style="padding:0.25rem 0.625rem;font-size:0.8rem"
                    data-edit="${esc(t.tech_id)}">Edit</button>
          </td>
        </tr>
      `
    }).join('') || `<tr><td colspan="6" class="table-empty">No technicians yet.</td></tr>`

    const newFormHTML = _editingId === 'new' ? `
      <div class="info-card" style="margin-bottom:1rem">
        <h3 style="margin-bottom:0.75rem;font-size:0.9375rem">Add Technician</h3>
        ${techForm(null)}
      </div>
    ` : `
      <div style="margin-bottom:0.75rem">
        <button class="btn btn-secondary" id="s-add-tech">+ Add Technician</button>
      </div>
    `

    el.innerHTML = `
      <div class="section-head"><h2>Technicians</h2></div>
      ${statusHTML}
      ${newFormHTML}
      <div class="table-card" style="margin-bottom:2rem">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Initials</th><th>Folder Name</th>
                <th>IAT #</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>${techRows}</tbody>
          </table>
        </div>
      </div>
    `

    el.querySelector('#s-add-tech')?.addEventListener('click', () => {
      _editingId = 'new'; _statusMsg = ''; renderTechs()
    })

    el.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        _editingId = btn.dataset.edit; _statusMsg = ''; renderTechs()
      })
    )

    el.querySelector('#s-tech-cancel')?.addEventListener('click', () => {
      _editingId = null; renderTechs()
    })

    el.querySelector('#s-tech-save')?.addEventListener('click', () => saveTech(techs))
  }

  function techEditRow(t) {
    return `
      <tr>
        <td colspan="6" style="padding:0.75rem;background:var(--clr-surface)">
          ${techForm(t)}
        </td>
      </tr>
    `
  }

  function techForm(t) {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div>
          <label style="font-size:0.75rem;color:var(--clr-subtle)">Name *</label>
          <input class="search-input" id="tf-name" value="${esc(t?.name ?? '')}" placeholder="Full name">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--clr-subtle)">Initials</label>
          <input class="search-input" id="tf-initials" value="${esc(t?.initials ?? '')}" placeholder="NR" maxlength="4">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--clr-subtle)">Folder Name *</label>
          <input class="search-input" id="tf-folder" value="${esc(t?.folder_name ?? '')}" placeholder="Norman">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--clr-subtle)">IAT Number</label>
          <input class="search-input" id="tf-iat" value="${esc(t?.iat_number ?? '')}" placeholder="12345">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--clr-subtle)">Email</label>
          <input class="search-input" id="tf-email" value="${esc(t?.email ?? '')}" placeholder="tech@example.com">
        </div>
        <div style="display:flex;align-items:flex-end;gap:0.375rem;padding-bottom:1px">
          <input type="checkbox" id="tf-active" ${(t == null || t.active) ? 'checked' : ''}>
          <label for="tf-active" style="font-size:0.875rem">Active</label>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-primary" id="s-tech-save">Save</button>
        <button class="btn btn-secondary" id="s-tech-cancel">Cancel</button>
        ${t ? `<span id="s-tech-err" style="color:var(--clr-error-text);font-size:0.875rem;align-self:center"></span>` : ''}
      </div>
      ${t == null ? `<span id="s-tech-err" style="display:block;margin-top:0.375rem;color:var(--clr-error-text);font-size:0.875rem"></span>` : ''}
    `
  }

  async function saveTech(existingTechs) {
    const nameEl   = container.querySelector('#tf-name')
    const initEl   = container.querySelector('#tf-initials')
    const foldEl   = container.querySelector('#tf-folder')
    const iatEl    = container.querySelector('#tf-iat')
    const emailEl  = container.querySelector('#tf-email')
    const activeEl = container.querySelector('#tf-active')
    const errEl    = container.querySelector('#s-tech-err')

    const name        = nameEl?.value.trim()
    const folder_name = foldEl?.value.trim()

    if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return }
    if (!folder_name) { if (errEl) errEl.textContent = 'Folder name is required.'; return }

    const fields = {
      name,
      initials:    initEl?.value.trim()  || null,
      folder_name,
      iat_number:  iatEl?.value.trim()   || null,
      email:       emailEl?.value.trim() || null,
      active:      activeEl?.checked ? 1 : 0,
    }

    try {
      if (_editingId === 'new') {
        const newId = crypto.randomUUID()
        run(
          `INSERT INTO techs (tech_id, name, initials, folder_name, iat_number, email, active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newId, fields.name, fields.initials, fields.folder_name,
           fields.iat_number, fields.email, fields.active]
        )
        _statusMsg = `Technician "${fields.name}" added.`
      } else {
        run(
          `UPDATE techs SET name=?, initials=?, folder_name=?, iat_number=?, email=?, active=? WHERE tech_id=?`,
          [fields.name, fields.initials, fields.folder_name, fields.iat_number,
           fields.email, fields.active, _editingId]
        )
        _statusMsg = `"${fields.name}" updated.`
      }
      await save(session.writerName)
      _editingId = null
      renderTechs()
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function row(label, value) {
  if (value == null || value === '') return ''
  return `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtTs(ts) {
  try { return new Date(ts).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return String(ts) }
}

function fmtSize(bytes) {
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
