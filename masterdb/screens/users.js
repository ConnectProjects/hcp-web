import { getAllUsers, createUser, deactivateUser, resetUserPin } from '../db/users.js'

export function renderUsers(container, state, navigate) {
  const users = getAllUsers();

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
                <td><strong>${esc(u.name)}</strong> (${esc(u.initials)})</td>
                <td><span class="badge" style="text-transform: uppercase; font-size: 10px;">${esc(u.role)}</span></td>
                <td><code>techs/${esc(u.folder_name || 'n/a')}</code></td>
                <td>${u.active ? '✅ Active' : '<span style="color:var(--red)">Inactive</span>'}</td>
                <td style="text-align:right;">
                  <button class="btn btn-sm btn-outline btn-reset" data-id="${u.user_id}">Reset PIN</button>
                  ${u.active ? `<button class="btn btn-sm btn-ghost btn-deactivate" data-id="${u.user_id}">Deactivate</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add User Modal -->
    <div id="modal-user" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h2>Add New User</h2>
          <button class="modal-close" id="btn-close-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Full Name</label>
            <input id="u-name" type="text" placeholder="e.g. Jane Doe" />
          </div>
          <div class="form-group">
            <label>Initials</label>
            <input id="u-init" type="text" maxlength="4" placeholder="JD" />
          </div>
          <div class="form-group">
            <label>Role / Permissions</label>
            <select id="u-role" class="search-input">
              <option value="aud-tech">Technician (TechTool Only)</option>
              <option value="lc">Logistical Coordinator (Office Limited)</option>
              <option value="admin">Administrator (Full Access)</option>
            </select>
          </div>
          <div class="form-group">
            <label>OneDrive Folder Name</label>
            <input id="u-folder" type="text" placeholder="e.g. Jane" />
            <p class="help-text">Used for TechTool packet delivery (case sensitive).</p>
          </div>
          <div class="form-group">
            <label>Initial PIN (4 digits)</label>
            <input id="u-pin" type="password" maxlength="4" placeholder="1234" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-user-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-user-save">Save User & Sync</button>
        </div>
      </div>
    </div>
  `;

  // --- Handlers ---
  const modal = container.querySelector('#modal-user');
  const closeModal = () => modal.classList.add('hidden');

  container.querySelector('#btn-add-user').onclick = () => modal.classList.remove('hidden');
  container.querySelector('#btn-user-cancel').onclick = closeModal;
  container.querySelector('#btn-close-modal').onclick = closeModal;

  container.querySelector('#btn-user-save').onclick = async () => {
    const data = {
      name: container.querySelector('#u-name').value.trim(),
      initials: container.querySelector('#u-init').value.trim().toUpperCase(),
      role: container.querySelector('#u-role').value,
      folder_name: container.querySelector('#u-folder').value.trim(),
      pin: container.querySelector('#u-pin').value.trim()
    };

    if (!data.name || data.pin.length < 4) {
        alert("Full Name and a 4-digit PIN are required.");
        return;
    }

    const btn = container.querySelector('#btn-user-save');
    btn.disabled = true;
    btn.textContent = "Hashing & Syncing...";

    try {
        await createUser(data, state.syncFolder);
        alert("User created successfully and synced to OneDrive.");
        closeModal();
        renderUsers(container, state, navigate);
    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.textContent = "Save User & Sync";
    }
  };

  container.querySelectorAll('.btn-reset').forEach(btn => {
    btn.onclick = async () => {
      const newPin = prompt("Enter new 4-digit PIN for this user:");
      if (newPin && newPin.length === 4) {
        await resetUserPin(btn.dataset.id, newPin, state.syncFolder);
        alert("PIN updated and synced.");
      } else if (newPin) {
        alert("PIN must be exactly 4 digits.");
      }
    };
  });

  container.querySelectorAll('.btn-deactivate').forEach(btn => {
    btn.onclick = async () => {
        if (confirm("Deactivate this user? They will no longer be able to log in.")) {
            await deactivateUser(btn.dataset.id, state.syncFolder);
            renderUsers(container, state, navigate);
        }
    };
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}