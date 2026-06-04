import { getAllUsers } from '../db/users.js'
import { hashPin }     from '../../shared/auth-utils.js'
import { pickSyncFolder, readJsonFile } from '../../shared/fs/sync-folder.js'

export async function renderLogin(container, state, navigate) {
  
  // 1. If folder is NOT connected, show the "Connection Required" view
  if (!state.syncFolder) {
    container.innerHTML = `
      <div class="screen screen-login" style="display:flex; align-items:center; justify-content:center; height:100vh; background:#f3f4f6;">
        <div class="form-card" style="width:100%; max-width:400px; padding:40px; text-align:center;">
          <h1 style="color:#76B214; margin-bottom:10px;">MasterDB</h1>
          <p style="color:#666; margin-bottom:30px;">OneDrive Connection Required</p>
          
          <div class="alert alert-info" style="margin-bottom: 20px; font-size: 13px;">
            To see the list of authorized users, please connect to the shared <strong>ConnectHearing</strong> folder.
          </div>

          <button class="btn btn-primary btn-block" id="btn-connect-login" style="padding: 15px;">
            📂 Connect OneDrive Folder
          </button>
        </div>
      </div>
    `;

    container.querySelector('#btn-connect-login').onclick = async () => {
      try {
        const handle = await pickSyncFolder();
        if (handle) {
            state.syncFolder = handle;
            // Refresh this screen now that we have the handle
            renderLogin(container, state, navigate);
        }
      } catch (e) {
        alert("Connection failed: " + e.message);
      }
    };
    return;
  }

  // 2. If folder IS connected, load users from the JSON file
  let users = [];
  try {
    // We fetch fresh from OneDrive to ensure we see new team members
    users = await readJsonFile(state.syncFolder, '', 'users.json');
  } catch (e) {
    console.error("User load failed", e);
  }

  // Fallback to local DB if OneDrive file is missing (unlikely but safe)
  if (users.length === 0) {
    users = getAllUsers();
  }

  const activeUsers = users.filter(u => u.active !== 0);

  container.innerHTML = `
    <div class="screen screen-login" style="display:flex; align-items:center; justify-content:center; height:100vh; background:#f3f4f6;">
      <div class="form-card" style="width:100%; max-width:400px; padding:40px; text-align:center;">
        <h1 style="color:#76B214; margin-bottom:10px;">MasterDB</h1>
        <p style="color:#666; margin-bottom:30px;">Authorized Staff Login</p>

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
                 style="width:100%; text-align:center; letter-spacing:15px; font-size:24px; height: 50px;" />
        </div>

        <button class="btn btn-primary btn-block" id="btn-login" style="margin-top:20px; padding: 12px;">Login</button>
        
        <div style="margin-top: 25px;">
            <button class="btn btn-link btn-sm" id="btn-change-folder" style="color: #999; font-size: 11px;">Change OneDrive Folder</button>
        </div>

        <div id="login-error" class="alert alert-error hidden" style="margin-top:20px;"></div>
      </div>
    </div>
  `;

  const errorEl = container.querySelector('#login-error');

  container.querySelector('#btn-login').onclick = async () => {
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