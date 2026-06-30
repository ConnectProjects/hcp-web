import { setSetting, getSetting, getAllPackets, savePacket, deletePacket } from '../db/idb.js'
import { pickSyncFolder, readJsonFile } from '@shared/fs/sync-folder.js'
import { BrandLogo }      from '@shared/components/brand-logo.js'
import { hashPin }        from '@shared/auth-utils.js'

export async function renderLogin(container, state, navigate) {
  
  // 1. Initial State: If no folder is connected, we must connect first to see users
  if (!state.syncFolder) {
    renderFolderConnectView(container, state, navigate);
    return;
  }

  // 2. Load the Master User list from OneDrive
  let users = [];
  try {
    users = await readJsonFile(state.syncFolder, '', 'users.json');
  } catch (e) {
    renderErrorView(container, "Could not find 'users.json' on OneDrive. Please contact your administrator.");
    return;
  }

  const activeTechs = users.filter(u => u.active !== 0);

  container.innerHTML = `
    <div class="screen screen-login">
      <div class="login-card">
        <div class="login-brand" style="background: #76B214; padding: 20px; border-radius: var(--radius); margin-bottom: 24px;">
          <div style="display: flex; justify-content: center;">
            ${BrandLogo}
          </div>
          <p class="login-sub" style="color: rgba(255,255,255,.8); margin-top: 10px;">Hearing Conservation Platform</p>
        </div>

        <div id="section-login">
          <h2>Technician Login</h2>
          <p class="help-text">Select your name and enter your 4-digit PIN.</p>

          <form id="login-form" autocomplete="off" novalidate>
            <div class="form-group">
              <label for="user-select">Your Name</label>
              <select id="user-select" class="search-input" style="width: 100%; height: 44px;">
                <option value="">-- Select --</option>
                ${activeTechs.map(u => `<option value="${u.user_id}">${esc(u.name)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="user-pin">PIN</label>
              <input id="user-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4"
                     autocomplete="current-password"
                     placeholder="0 0 0 0" style="text-align: center; letter-spacing: 10px; font-size: 20px;" />
            </div>

            <button type="submit" class="btn btn-primary btn-block" id="btn-login">Login</button>
          </form>

          <div style="margin-top: 20px; text-align: center;">
            <button class="btn btn-link btn-sm" id="btn-switch-folder">Change Sync Folder</button>
          </div>
        </div>

        <div id="login-error" class="alert alert-error hidden" style="margin-top: 15px;"></div>
      </div>
    </div>
  `;

  // --- EVENT LISTENERS ---

  const errorEl = container.querySelector('#login-error');
  const showError = (msg) => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };

  container.querySelector('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const userId = container.querySelector('#user-select').value;
    const pin = container.querySelector('#user-pin').value;
    const btn = container.querySelector('#btn-login');

    if (!userId) return showError("Please select your name.");
    if (pin.length < 4) return showError("Please enter your 4-digit PIN.");

    btn.disabled = true;
    btn.textContent = "Verifying...";

    const user = activeTechs.find(u => u.user_id === userId);
    
    // Generate the hash of the input PIN using the user_id as a salt
    const inputHash = await hashPin(pin, userId);

    if (user && user.pin_hash === inputHash) {
        // If a different tech was logged in before, purge their packets from IndexedDB.
        // They will re-download their own packets from OneDrive when they log back in.
        const prevUserId = await getSetting('tech_user_id');
        if (prevUserId && prevUserId !== user.user_id) {
          const all = await getAllPackets();
          await Promise.all(
            all.filter(p => p.tech?.tech_id && p.tech.tech_id !== user.user_id)
               .map(p => deletePacket(p.packet_id))
          );
        }

        state.user = user;
        await setSetting('tech_name', user.name);
        await setSetting('tech_user_id', user.user_id);
        await setSetting('tech_initials', user.initials || user.name.substring(0,2).toUpperCase());
        await setSetting('tech_folder_name', user.folder_name || user.name.split(' ')[0]);

        state.packets = (await getAllPackets()).filter(p => p.tech?.tech_id === user.user_id);
        navigate('dashboard');
    } else {
        showError("Invalid PIN. Please try again.");
        btn.disabled = false;
        btn.textContent = "Login";
    }
  };

  container.querySelector('#btn-switch-folder').onclick = () => {
    state.syncFolder = null;
    renderLogin(container, state, navigate);
  };
}

// --- SUB-VIEWS ---

function renderFolderConnectView(container, state, navigate) {
    container.innerHTML = `
    <div class="screen screen-login">
      <div class="login-card">
        <div class="login-brand" style="background: #1e3a5f; padding: 20px; border-radius: var(--radius); margin-bottom: 24px;">
          <div style="display: flex; justify-content: center;">${BrandLogo}</div>
        </div>
        <h2>Connect OneDrive</h2>
        <p class="help-text">To log in, please select the shared <strong>ConnectHearing</strong> folder on your OneDrive.</p>
        <button class="btn btn-primary btn-block" id="btn-pick-folder" style="padding: 15px;">Connect Folder</button>
        <div class="demo-divider" style="margin-top: 20px; text-align: center;">
          <button class="btn btn-link btn-sm" id="btn-demo">Try Demo Mode (Offline)</button>
        </div>
      </div>
    </div>`;

    container.querySelector('#btn-pick-folder').onclick = async () => {
        try {
            state.syncFolder = await pickSyncFolder();
            renderLogin(container, state, navigate);
        } catch (e) { alert("Connection failed: " + e.message); }
    };
    
    container.querySelector('#btn-demo').onclick = () => runDemoMode(state, navigate);
}

function renderErrorView(container, msg) {
    container.innerHTML = `<div class="screen screen-login"><div class="login-card"><div class="alert alert-error">${msg}</div><button class="btn btn-block" onclick="location.reload()">Retry</button></div></div>`;
}

// --- HELPERS ---

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function runDemoMode(state, navigate) {
    // Keep your existing Demo logic here...
    const today = new Date().toISOString().slice(0, 10);
    state.user = { name: 'Demo Tech', initials: 'DT', tech_id: 'DT', folder_name: null };
    state.packets = []; // Add demo packets if desired
    navigate('dashboard');
}