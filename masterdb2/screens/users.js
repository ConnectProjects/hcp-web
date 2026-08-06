/**
 * masterdb2/screens/users.js — MasterDB user management
 *
 * Users are the people who appear on the login tile grid.
 * Roles: super_admin, admin, lc, aud_tech
 */

import { query, run, save } from '../db/db.js'

const ROLES = [
  { value: 'super_admin', label: 'Super-Admin' },
  { value: 'admin',       label: 'Admin'        },
  { value: 'lc',          label: 'LC'           },
  { value: 'aud_tech',    label: 'Aud-Tech'     },
]

export function mount(container, { session }) {
  let _editingId    = null   // user_id, 'new', or null
  let _showInactive = false
  let _statusMsg    = ''
  let _confirmDel   = false  // show inline confirm for "delete all inactive"

  render()

  function render() {
    const active   = query(`SELECT * FROM users WHERE active = 1 ORDER BY name`)
    const inactive = query(`SELECT * FROM users WHERE active = 0 ORDER BY name`)

    const allUsers = _showInactive ? [...active, ...inactive] : active

    const statusHTML = _statusMsg
      ? `<div class="success-banner" style="margin-bottom:0.75rem">${esc(_statusMsg)}</div>`
      : ''

    const newFormHTML = _editingId === 'new'
      ? `<div class="info-card" style="margin-bottom:1rem">
           <h3 style="margin-bottom:0.75rem;font-size:0.9375rem">Add User</h3>
           ${userForm(null)}
         </div>`
      : `<div style="margin-bottom:0.75rem">
           <button class="btn btn-secondary" id="add-user-btn">+ Add User</button>
         </div>`

    const userRows = allUsers.map(u => {
      if (u.user_id === _editingId) {
        return `<tr><td colspan="5" style="padding:0.75rem;background:var(--clr-surface)">${userForm(u)}</td></tr>`
      }
      const deletBtn = !u.active
        ? `<button class="btn btn-danger btn-sm" data-del="${esc(u.user_id)}" style="margin-left:0.25rem">Delete</button>`
        : ''
      return `
        <tr${!u.active ? ' style="opacity:0.6"' : ''}>
          <td>
            <div style="display:flex;align-items:center;gap:0.625rem">
              <div class="user-initials" style="width:1.75rem;height:1.75rem;font-size:0.75rem;flex-shrink:0">
                ${esc(u.initials ?? (u.name[0] ?? '?').toUpperCase())}
              </div>
              <strong>${esc(u.name)}</strong>
            </div>
          </td>
          <td>${esc(u.initials ?? '—')}</td>
          <td>${roleLabel(u.role)}</td>
          <td>${u.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-secondary btn-sm" data-edit="${esc(u.user_id)}">Edit</button>
            ${deletBtn}
          </td>
        </tr>
      `
    }).join('') || `<tr><td colspan="5" class="table-empty">No users found.</td></tr>`

    let inactiveFooter = ''
    if (inactive.length > 0) {
      if (_confirmDel) {
        inactiveFooter = `
          <div style="margin-top:1rem;display:flex;align-items:center;gap:0.75rem;font-size:0.875rem">
            <span>Delete all ${inactive.length} inactive user${inactive.length !== 1 ? 's' : ''}?</span>
            <button class="btn btn-danger btn-sm" id="confirm-del-all">Yes, delete them</button>
            <button class="btn btn-secondary btn-sm" id="cancel-del-all">Cancel</button>
          </div>`
      } else {
        inactiveFooter = `
          <div style="margin-top:1rem;font-size:0.8125rem;color:var(--clr-subtle);display:flex;align-items:center;gap:1rem">
            <button class="btn btn-secondary btn-sm" id="toggle-inactive-btn">
              ${_showInactive ? 'Hide' : 'Show'} ${inactive.length} inactive
            </button>
            ${_showInactive ? `<button class="btn btn-danger btn-sm" id="del-all-inactive-btn">Delete all inactive</button>` : ''}
          </div>`
      }
    }

    container.innerHTML = `
      <div class="screen-header-row"><h1>Users</h1></div>
      <div class="screen-body">
        ${statusHTML}
        ${newFormHTML}
        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>Name</th><th>Initials</th><th>Role</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>${userRows}</tbody>
            </table>
          </div>
        </div>
        ${inactiveFooter}
      </div>
    `

    container.querySelector('#add-user-btn')?.addEventListener('click', () => {
      _editingId = 'new'; _statusMsg = ''; render()
    })
    container.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => { _editingId = btn.dataset.edit; _statusMsg = ''; render() })
    )
    container.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', () => deleteUser(btn.dataset.del))
    )
    container.querySelector('#u-cancel')?.addEventListener('click', () => { _editingId = null; render() })
    container.querySelector('#u-save')?.addEventListener('click', () => saveUser(allUsers))
    container.querySelector('#toggle-inactive-btn')?.addEventListener('click', () => {
      _showInactive = !_showInactive; _confirmDel = false; render()
    })
    container.querySelector('#del-all-inactive-btn')?.addEventListener('click', () => {
      _confirmDel = true; render()
    })
    container.querySelector('#confirm-del-all')?.addEventListener('click', deleteAllInactive)
    container.querySelector('#cancel-del-all')?.addEventListener('click', () => {
      _confirmDel = false; render()
    })
  }

  function userForm(u) {
    const roleOpts = ROLES.map(r =>
      `<option value="${r.value}" ${u?.role === r.value ? 'selected' : ''}>${r.label}</option>`
    ).join('')

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0.625rem;margin-bottom:0.75rem">
        <div>
          <label class="field-label">Name *</label>
          <input class="search-input" id="uf-name" value="${esc(u?.name ?? '')}" placeholder="Full name">
        </div>
        <div>
          <label class="field-label">Initials</label>
          <input class="search-input" id="uf-initials" value="${esc(u?.initials ?? '')}" placeholder="NR" maxlength="4">
        </div>
        <div>
          <label class="field-label">Role</label>
          <select class="form-select" id="uf-role" style="width:100%">
            ${roleOpts}
          </select>
        </div>
        <div style="display:flex;align-items:flex-end;gap:0.375rem;padding-bottom:1px">
          <input type="checkbox" id="uf-active" ${(u == null || u.active) ? 'checked' : ''}>
          <label for="uf-active" style="font-size:0.875rem">Active</label>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-primary" id="u-save">Save</button>
        <button class="btn btn-secondary" id="u-cancel">Cancel</button>
        <span id="u-err" style="color:var(--clr-error-text);font-size:0.875rem"></span>
      </div>
    `
  }

  async function deleteUser(userId) {
    try {
      run(`DELETE FROM users WHERE user_id = ?`, [userId])
      await save(session.writerName)
      _statusMsg = 'User deleted.'
      render()
    } catch (e) {
      _statusMsg = `Delete failed: ${e.message}`
      render()
    }
  }

  async function deleteAllInactive() {
    try {
      const { count } = query(`SELECT COUNT(*) AS count FROM users WHERE active = 0`)[0]
      run(`DELETE FROM users WHERE active = 0`)
      await save(session.writerName)
      _showInactive = false
      _confirmDel   = false
      _statusMsg    = `${count} inactive user${count !== 1 ? 's' : ''} deleted.`
      render()
    } catch (e) {
      _confirmDel = false
      _statusMsg  = `Delete failed: ${e.message}`
      render()
    }
  }

  async function saveUser(existingUsers) {
    const nameEl    = container.querySelector('#uf-name')
    const initialsEl = container.querySelector('#uf-initials')
    const roleEl    = container.querySelector('#uf-role')
    const activeEl  = container.querySelector('#uf-active')
    const errEl     = container.querySelector('#u-err')

    const name     = nameEl?.value.trim()
    const initials = initialsEl?.value.trim() || null
    const role     = roleEl?.value || 'aud_tech'
    const active   = activeEl?.checked ? 1 : 0

    if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return }

    try {
      if (_editingId === 'new') {
        const newId = crypto.randomUUID()
        run(
          `INSERT INTO users (user_id, name, initials, role, active) VALUES (?, ?, ?, ?, ?)`,
          [newId, name, initials, role, active]
        )
        _statusMsg = `User "${name}" added.`
      } else {
        run(
          `UPDATE users SET name=?, initials=?, role=?, active=?, updated_at=datetime('now') WHERE user_id=?`,
          [name, initials, role, active, _editingId]
        )
        _statusMsg = `"${name}" updated.`
      }
      await save(session.writerName)
      _editingId = null
      render()
    } catch (e) {
      if (errEl) errEl.textContent = `Save failed: ${e.message}`
    }
  }
}

function roleLabel(role) {
  return ROLES.find(r => r.value === role)?.label ?? esc(role ?? '—')
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
