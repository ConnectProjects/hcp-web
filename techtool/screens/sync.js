import { getSyncFolder, pickSyncFolder, listJsonFiles, readJsonFile } from '@shared/fs/sync-folder.js'
import { savePacket } from '../db/idb.js'

export function renderSync(container, state, navigate) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Cloud Sync</h1>
      </div>

      <div class="form-card">
        <div id="sync-status-area" style="text-align:center; padding: 20px;">
            <div id="folder-icon" style="font-size: 48px; margin-bottom: 10px;">📡</div>
            <h3 id="status-text">Checking Connection...</h3>
            <p id="status-subtext" style="color: #666; font-size: 13px;"></p>
        </div>

        <div id="sync-actions" style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
            <button class="btn btn-primary" id="btn-connect-folder" style="display:none;">Connect OneDrive Folder</button>
            <button class="btn btn-primary" id="btn-start-sync" style="display:none;">Download New Packets</button>
            <button class="btn btn-outline" id="btn-return">Return to Dashboard</button>
        </div>

        <div id="sync-log" style="margin-top: 30px; font-size: 12px; font-family: monospace; background: #f4f4f4; padding: 15px; border-radius: 4px; max-height: 200px; overflow-y: auto; display:none;">
        </div>
      </div>
    </div>
  `;

  const statusText = container.querySelector('#status-text');
  const statusSub = container.querySelector('#status-subtext');
  const logArea = container.querySelector('#sync-log');
  const btnConnect = container.querySelector('#btn-connect-folder');
  const btnSync = container.querySelector('#btn-start-sync');

  const addLog = (msg) => {
    logArea.style.display = 'block';
    logArea.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    logArea.scrollTop = logArea.scrollHeight;
  };

  const updateUI = () => {
    if (!state.syncFolder) {
        statusText.textContent = "OneDrive Disconnected";
        statusSub.textContent = "The browser needs permission to access your shared folder.";
        btnConnect.style.display = "block";
        btnSync.style.display = "none";
    } else {
        statusText.textContent = "Connected to OneDrive";
        statusSub.textContent = `Syncing for: techs/${state.user.folder_name}`;
        btnConnect.style.display = "none";
        btnSync.style.display = "block";
    }
  };

  // --- HANDLERS ---

  btnConnect.onclick = async () => {
    try {
        let handle = await getSyncFolder(); // Try to reload existing handle
        if (!handle) handle = await pickSyncFolder(); // If none, show picker
        state.syncFolder = handle;
        updateUI();
        addLog("✅ Folder connection established.");
    } catch (e) {
        addLog("❌ Connection failed: " + e.message);
    }
  };

  btnSync.onclick = async () => {
    btnSync.disabled = true;
    btnSync.textContent = "Syncing...";
    addLog("Starting download...");

    try {
        // 1. Locate the tech's specific subfolder (e.g., techs/Norm)
        const subfolder = `techs/${state.user.folder_name}`;
        addLog(`Scanning ${subfolder}...`);

        const files = await listJsonFiles(state.syncFolder, subfolder);
        addLog(`Found ${files.length} packets in cloud.`);

        let newCount = 0;
        for (const file of files) {
            try {
                const packetData = await readJsonFile(state.syncFolder, subfolder, file.name);
                const pid = packetData?.packet_id;
                if (!pid) { addLog(`Skipped ${file.name}: no packet_id`); continue; }

                const exists = state.packets.find(p => p.packet_id === pid);
                if (!exists) {
                    await savePacket(packetData);
                    state.packets.push(packetData);
                    newCount++;
                    addLog(`Downloaded ${file.name}`);
                }
            } catch (e) {
                addLog(`Skipped ${file.name}: ${e.message}`);
            }
        }

        addLog(`✅ Sync complete. ${newCount} new packets added.`);
        statusText.textContent = "Sync Complete!";
        statusSub.textContent = `${newCount} new visits downloaded.`;
        btnSync.textContent = "Sync Again";
        btnSync.disabled = false;
        
    } catch (e) {
        addLog("❌ Sync error: " + e.message);
        btnSync.disabled = false;
        btnSync.textContent = "Retry Sync";
    }
  };

  container.querySelector('#btn-return').onclick = () => navigate('dashboard');

  updateUI();
}