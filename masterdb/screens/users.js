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
                <td><span class="badge">${u.role.toUpperCase()}</span></td>
                <td><code>techs/${esc(u.folder_name)}</code></td>
                <td>${u.active ? '✅ Active' : '<span style="color:red">Inactive</span>'}</td>
                <td>
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
        <div class="modal-header"><h2>Add New User</h2></div>
        <div class="modal-body">
          <div class="form-group"><label>Full Name</label><input id="u-name" type="text" placeholder="e.g. Norm Robichaud" /></div>
          <div class="form-group"><label>Initials</label><input id="u-init" type="text" maxlength="4" /></div>
          <div class="form-group"><label>Role</label>
            <select id="u-role"><option value="tech">Technician</option><option value="admin">Administrator</option></select>
          </div>
          <div class="form-group"><label>OneDrive Folder Name</label><input id="u-folder" type="text" placeholder="e.g. Norm" /></div>
          <div class="form-group"><label>Initial PIN (4 digits)</label><input id="u-pin" type="password" maxlength="4" /></div>
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
  container.querySelector('#btn-add-user').onclick = () => modal.classList.remove('hidden');
  container.querySelector('#btn-user-cancel').onclick = () => modal.classList.add('hidden');

  container.querySelector('#btn-user-save').onclick = async () => {
    const data = {
      name: container.querySelector('#u-name').value,
      initials: container.querySelector('#u-init').value.toUpperCase(),
      role: container.querySelector('#u-role').value,
      folder_name: container.querySelector('#u-folder').value,
      pin: container.querySelector('#u-pin').value
    };

    if (!data.name || data.pin.length < 4) return alert("Name and 4-digit PIN required.");

    await createUser(data, state.syncFolder);
    alert("User created and synced to OneDrive.");
    renderUsers(container, state, navigate);
  };

  container.querySelectorAll('.btn-reset').forEach(btn => {
    btn.onclick = async () => {
      const newPin = prompt("Enter new 4-digit PIN for this user:");
      if (newPin && newPin.length === 4) {
        await resetUserPin(btn.dataset.id, newPin, state.syncFolder);
        alert("PIN updated.");
      }
    };
  });
}

function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }