import { getAllUsers } from '../db/users.js'
import { hashPin }     from '../../shared/auth-utils.js'
import { pickSyncFolder, readJsonFile, DB_SUBDIR } from '../../shared/fs/sync-folder.js'

export async function renderLogin(container, state, navigate, offline = false) {

  // 1. If folder is NOT connected (and not entering offline), show the "Connection Required" view
  if (!state.syncFolder && !offline) {
    container.innerHTML = `
      <div class="screen screen-login" style="display:flex; align-items:center; justify-content:center; height:100vh; background:#f3f4f6;">
        <div class="form-card" style="width:100%; max-width:400px; padding:40px; text-align:center;">
          <h1 style="color:#76B214; margin-bottom:10px;">MasterDB</h1>
          <p style="color:#666; margin-bottom:30px;">OneDrive Connection Required</p>

          <div class="alert alert-info" style="margin-bottom: 20px; font-size: 13px; text-align:left;">
            This browser hasn't been set up yet. Click below to connect the shared
            <strong>ConnectHearing</strong> OneDrive folder — this only needs to be done
            once per browser. After connecting, all data will sync automatically.
          </div>

          <button class="btn btn-primary btn-block" id="btn-connect-login" style="padding: 15px;">
            📂 Connect &amp; Sync
          </button>
          <div id="sync-status" style="margin-top:16px; font-size:13px; color:#666; min-height:20px;"></div>

          <div style="margin-top:24px; border-top:1px solid #eee; padding-top:16px;">
            <button class="btn btn-link btn-sm" id="btn-offline-login" style="color:#999; font-size:12px;">
              Continue offline (no sync) →
            </button>
            <div style="color:#aaa; font-size:11px; margin-top:4px;">Work on this browser's local data only. Connect the folder later to sync.</div>
          </div>
          <div style="color:#c9c9c9; font-size:11px; margin-top:14px;">MasterDB ${window.MASTERDB_VERSION || ''}</div>
        </div>
      </div>
    `;

    container.querySelector('#btn-connect-login').onclick = async () => {
      const btn = container.querySelector('#btn-connect-login');
      const status = container.querySelector('#sync-status');
      try {
        const handle = await pickSyncFolder();
        if (!handle) return;
        btn.disabled = true;
        btn.textContent = '⟳ Syncing database…';
        status.textContent = 'Downloading latest data from OneDrive…';
        await state._onSyncConnected(handle);
        status.textContent = '✓ Sync complete. Loading login…';
        renderLogin(container, state, navigate);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '📂 Connect & Sync';
        status.style.color = '#c0392b';
        status.textContent = 'Connection failed: ' + e.message;
      }
    };
    container.querySelector('#btn-offline-login').onclick = () => renderLogin(container, state, navigate, true);
    return;
  }

  // 2. Load users — from OneDrive when connected, otherwise from this browser's local DB (offline)
  let users = [];
  if (state.syncFolder) {
    try {
      // We fetch fresh from OneDrive to ensure we see new team members
      users = await readJsonFile(state.syncFolder, DB_SUBDIR, 'users.json');
    } catch (e) {
      console.error("User load failed", e);
    }
  }

  // Local DB when offline, or fallback if the OneDrive file is missing
  if (users.length === 0) {
    users = getAllUsers();
  }

  const activeUsers = users.filter(u => u.active !== 0);

  container.innerHTML = `
    <div class="screen screen-login" style="display:flex; align-items:center; justify-content:center; height:100vh; background:#f3f4f6;">
      <div class="form-card" style="width:100%; max-width:400px; padding:40px; text-align:center;">
        <h1 style="color:#76B214; margin-bottom:10px;">MasterDB</h1>
        <p style="color:#666; margin-bottom:${offline ? '12' : '30'}px;">Authorized Staff Login</p>
        ${offline ? `<div class="alert alert-info" style="margin-bottom:20px; font-size:12px; text-align:left;">⚠ <strong>Offline mode</strong> — this browser's local data only, not syncing. Use “Connect Sync Folder” inside the app to sync.</div>` : ''}

        <form id="login-form" autocomplete="off" novalidate>
          <div class="form-group" style="text-align:left;">
            <label>Select Your Name</label>
            <select id="user-select" class="search-input" style="width:100%; margin-bottom:20px; height: 40px;">
              <option value="">-- Select --</option>
              ${activeUsers.map(u => `<option value="${u.user_id}">${esc(u.name)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="text-align:left;">
            <label>Enter 4-Digit PIN</label>
            <input id="user-pin" type="password" maxlength="4" placeholder="· · · ·"
                   autocomplete="current-password"
                   style="width:100%; text-align:center; letter-spacing:15px; font-size:24px; height: 50px;" />
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="btn-login" style="margin-top:20px; padding: 12px;">Login</button>
        </form>
        
        <div style="margin-top: 25px;">
            <button class="btn btn-link btn-sm" id="btn-change-folder" style="color: #999; font-size: 11px;">Change OneDrive Folder</button>
        </div>
        <div style="color:#c9c9c9; font-size:11px; margin-top:10px;">MasterDB ${window.MASTERDB_VERSION || ''}</div>

        <div id="login-error" class="alert alert-error hidden" style="margin-top:20px;"></div>
      </div>
    </div>
  `;

  const errorEl = container.querySelector('#login-error');

  container.querySelector('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const userId = container.querySelector('#user-select').value;
    const pin = container.querySelector('#user-pin').value;

    if (!userId || pin.length < 4) {
      errorEl.textContent = "Please select a user and enter your PIN.";
      errorEl.classList.remove('hidden');
      return;
    }

    const user = activeUsers.find(u => u.user_id === userId);
    const inputHash = await hashPin(pin, userId);

    if (user && user.pin_hash === inputHash) {
      state.user = user;
      localStorage.setItem('masterdb_user_id', userId);
      navigate('dashboard');
    } else {
      errorEl.textContent = "Invalid PIN. Access denied.";
      errorEl.classList.remove('hidden');
    }
  };

  container.querySelector('#btn-change-folder').onclick = async () => {
      state.syncFolder = null;
      renderLogin(container, state, navigate);
  };
}

function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }