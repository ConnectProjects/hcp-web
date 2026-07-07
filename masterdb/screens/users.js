import { getAllUsers, createUser, updateUser, deactivateUser, resetUserPin } from '../db/users.js'
import { ROLES } from '../../shared/auth-utils.js'

export function renderUsers(container, state, navigate) {
  const users       = getAllUsers()
  const isSuperAdmin = state.user?.role === ROLES.SUPER_ADMIN

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>User Management</h1>
        <button class="btn btn-primary" id="btn-add-user">+ Add Team Member</button>
      </div>

      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Folder</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong>${esc(u.name)}</strong>${u.initials ? ` <span style="color:var(--grey-500)">(${esc(u.initials)})</span>` : ''}</td>
                <td><span class="role-badge role-${esc(u.role)}">${roleName(u.role)}</span></td>
                <td><code>${u.folder_name ? `techs/${esc(u.folder_name)}` : '—'}</code></td>
                <td>${u.active ? '✅ Active' : '<span style="color:var(--red)">Inactive</span>'}</td>
                <td style="text-align:right; white-space:nowrap; display:flex; gap:6px; justify-content:flex-end;">
                  <button class="btn btn-sm btn-outline btn-edit-user"
                    data-id="${esc(u.user_id)}"
                    data-name="${esc(u.name)}"
                    data-initials="${esc(u.initials ?? '')}"
                    data-role="${esc(u.role)}"
                    data-folder="${esc(u.folder_name ?? '')}">Edit</button>
                  <button class="btn btn-sm btn-ghost btn-reset" data-id="${esc(u.user_id)}">Reset PIN</button>
                  ${u.active ? `<button class="btn btn-sm btn-ghost btn-deactivate" data-id="${esc(u.user_id)}"
                    style="color:var(--red)">Deactivate</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add User Modal -->
    <div id="modal-add-user" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h2>Add New User</h2>
          <button class="modal-close" id="btn-close-add">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Full Name *</label>
            <input id="u-name" type="text" placeholder="e.g. Jane Doe" />
          </div>
          <div class="form-group">
            <label>Initials</label>
            <input id="u-init" type="text" maxlength="4" placeholder="JD" />
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="u-role">${roleOptions(isSuperAdmin, 'aud-tech')}</select>
          </div>
          <div class="form-group">
            <label>OneDrive Folder Name</label>
            <input id="u-folder" type="text" placeholder="e.g. Jane" />
            <p class="help-text">For TechTool packet delivery — must match the subfolder name exactly.</p>
          </div>
          <div class="form-group">
            <label>Initial PIN (4 digits) *</label>
            <input id="u-pin" type="password" maxlength="4" placeholder="••••" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-add-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-add-save">Save &amp; Sync</button>
        </div>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div id="modal-edit-user" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h2>Edit User</h2>
          <button class="modal-close" id="btn-close-edit">✕</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="e-id" />
          <div class="form-group">
            <label>Full Name *</label>
            <input id="e-name" type="text" />
          </div>
          <div class="form-group">
            <label>Initials</label>
            <input id="e-init" type="text" maxlength="4" />
          </div>
          <div class="form-group">
            <label>Role</label>
            ${isSuperAdmin
              ? `<select id="e-role">${roleOptions(true, '')}</select>`
              : `<div id="e-role-display" class="read-only-field" style="font-weight:600"></div>
                 <input type="hidden" id="e-role" />`
            }
            ${!isSuperAdmin ? '<p class="help-text">Only Super-Admins can change user roles.</p>' : ''}
          </div>
          <div class="form-group">
            <label>OneDrive Folder Name</label>
            <input id="e-folder" type="text" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-edit-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-edit-save">Save Changes</button>
        </div>
      </div>
    </div>
  `

  // --- Add modal ---
  const addModal  = container.querySelector('#modal-add-user')
  const editModal = container.querySelector('#modal-edit-user')

  container.querySelector('#btn-add-user').onclick    = () => addModal.classList.remove('hidden')
  container.querySelector('#btn-close-add').onclick   = () => addModal.classList.add('hidden')
  container.querySelector('#btn-add-cancel').onclick  = () => addModal.classList.add('hidden')

  container.querySelector('#btn-add-save').onclick = async () => {
    const data = {
      name:        container.querySelector('#u-name').value.trim(),
      initials:    container.querySelector('#u-init').value.trim().toUpperCase(),
      role:        container.querySelector('#u-role').value,
      folder_name: container.querySelector('#u-folder').value.trim(),
      pin:         container.querySelector('#u-pin').value.trim()
    }
    if (!data.name || data.pin.length < 4) {
      alert('Full Name and a 4-digit PIN are required.')
      return
    }
    const btn = container.querySelector('#btn-add-save')
    btn.disabled = true; btn.textContent = 'Saving…'
    try {
      await createUser(data, state.syncFolder)
      addModal.classList.add('hidden')
      renderUsers(container, state, navigate)
    } catch (e) {
      alert('Error: ' + e.message)
      btn.disabled = false; btn.textContent = 'Save & Sync'
    }
  }

  // --- Edit modal ---
  container.querySelector('#btn-close-edit').onclick  = () => editModal.classList.add('hidden')
  container.querySelector('#btn-edit-cancel').onclick = () => editModal.classList.add('hidden')

  container.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.onclick = () => {
      container.querySelector('#e-id').value      = btn.dataset.id
      container.querySelector('#e-name').value    = btn.dataset.name
      container.querySelector('#e-init').value    = btn.dataset.initials
      container.querySelector('#e-folder').value  = btn.dataset.folder
      container.querySelector('#e-role').value    = btn.dataset.role
      const display = container.querySelector('#e-role-display')
      if (display) display.textContent = roleName(btn.dataset.role)
      editModal.classList.remove('hidden')
    }
  })

  container.querySelector('#btn-edit-save').onclick = async () => {
    const userId = container.querySelector('#e-id').value
    const data = {
      name:        container.querySelector('#e-name').value.trim(),
      initials:    container.querySelector('#e-init').value.trim().toUpperCase(),
      role:        container.querySelector('#e-role').value,
      folder_name: container.querySelector('#e-folder').value.trim()
    }
    if (!data.name) { alert('Name is required.'); return }
    const btn = container.querySelector('#btn-edit-save')
    btn.disabled = true; btn.textContent = 'Saving…'
    try {
      await updateUser(userId, data, state.syncFolder)
      editModal.classList.add('hidden')
      renderUsers(container, state, navigate)
    } catch (e) {
      alert('Error: ' + e.message)
      btn.disabled = false; btn.textContent = 'Save Changes'
    }
  }

  // --- Reset PIN ---
  container.querySelectorAll('.btn-reset').forEach(btn => {
    btn.onclick = async () => {
      const newPin = prompt('Enter new 4-digit PIN for this user:')
      if (!newPin) return
      if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        alert('PIN must be exactly 4 digits.')
        return
      }
      await resetUserPin(btn.dataset.id, newPin, state.syncFolder)
      alert('PIN updated and synced.')
    }
  })

  // --- Deactivate ---
  container.querySelectorAll('.btn-deactivate').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Deactivate this user? They will no longer be able to log in.')) {
        await deactivateUser(btn.dataset.id, state.syncFolder)
        renderUsers(container, state, navigate)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleOptions(isSuperAdmin, selected) {
  const opts = [
    { value: 'aud-tech',    label: 'Technician — TechTool only' },
    { value: 'lc',          label: 'Logistical Coordinator' },
    { value: 'admin',       label: 'Administrator' },
  ]
  if (isSuperAdmin) opts.push({ value: 'super-admin', label: 'Super Administrator' })
  return opts.map(o =>
    `<option value="${o.value}"${selected === o.value ? ' selected' : ''}>${o.label}</option>`
  ).join('')
}

function roleName(role) {
  return {
    'super-admin': 'Super-Admin',
    'admin':       'Admin',
    'lc':          'LC',
    'aud-tech':    'Technician',
    'billing':     'Billing'
  }[role] ?? role
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
