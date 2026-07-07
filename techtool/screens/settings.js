/**
 * techtool/screens/settings.js
 * 
 * Technician settings and local data management.
 * Features: Profile info, OneDrive connection, and Packet cleanup with cloud-sync.
 */

import { setSetting, deletePacket } from '../db/idb.js'
import { getSyncFolder, pickSyncFolder, deleteJsonFile } from '@shared/fs/sync-folder.js'
import { applyTheme, saveThemeColor, loadThemeColor, DEFAULT_COLOR } from '../theme.js'

export function renderSettings(container, state, navigate) {
  const tech = state.user || {};
  const packets = state.packets || [];

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Settings</h1>
      </div>

      <div class="settings-sections" style="max-width: 800px; margin: 0 auto;">
        
        <!-- 1. User Profile -->
        <section class="form-card" style="margin-bottom: 20px;">
          <h2>Technician Profile</h2>
          <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top:10px;">
            <div class="form-group">
              <label>Name</label>
              <div class="read-only-field" style="padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;">
                ${esc(tech.name || 'Not Logged In')}
              </div>
            </div>
            <div class="form-group">
              <label>Sync Folder Name</label>
              <div class="read-only-field" style="padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;">
                ${esc(tech.folder_name || 'n/a')}
              </div>
            </div>
          </div>
          <p class="help-text" style="margin-top:10px; font-size: 11px; color: #999;">Note: Profile details are managed by the office in MasterDB.</p>
        </section>

        <!-- 2. OneDrive Connection -->
        <section class="form-card" style="margin-bottom: 20px;">
          <h2>Shared Folder (OneDrive)</h2>
          <div style="display:flex; align-items:center; gap:15px; margin: 15px 0;">
            <div class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}" style="font-size: 14px; font-weight: bold;">
              ${state.syncFolder ? '● Connected' : '○ Disconnected'}
            </div>
            <button class="btn btn-outline btn-sm" id="btn-connect-folder">
              ${state.syncFolder ? 'Change Folder' : 'Connect Folder'}
            </button>
          </div>
          <p class="help-text">Connect to the <strong>ConnectHearing</strong> folder to download assignments and submit tests.</p>
        </section>

        <!-- 3. Packet Management (The Cleanup Tool) -->
        <section class="form-card" style="margin-bottom: 20px;">
          <h2>Stored Packets</h2>
          <p class="help-text" style="margin-bottom:15px;">Visits currently stored on this device. Deleting here also removes the assignment from your OneDrive folder.</p>
          
          <div id="packet-manager-list">
            ${packets.length === 0 
              ? '<p class="empty-note">No packets currently on device.</p>' 
              : packets.map(p => `
              <div class="packet-manage-row" style="display:flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee;">
                <div>
                  <div style="font-weight:bold; font-size:14px;">${esc(p.company?.name || 'Unknown Company')}</div>
                  <div style="font-size:11px; color:#999;">${esc(p.filename)}</div>
                </div>
                <button class="btn btn-sm btn-ghost btn-delete-packet" 
                        data-id="${p.packet_id}" 
                        data-file="${p.filename}" 
                        style="color:#d9534f; font-weight:bold;">
                  Delete
                </button>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- 4. Appearance -->
        <section class="form-card">
          <h2>Appearance</h2>
          <div class="form-group" style="margin-top:10px;">
            <label>Theme Color</label>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="color" id="theme-color-input" value="${loadThemeColor()}" style="width:50px; height:35px; border:1px solid #ccc; border-radius:4px; padding:2px; cursor:pointer;" />
              <button class="btn btn-ghost btn-sm" id="btn-reset-color">Reset to Green</button>
            </div>
          </div>
        </section>

      </div>
    </div>
  `;

  // --- HANDLERS ---

  // Folder Connection
  container.querySelector('#btn-connect-folder').onclick = async () => {
    try {
      const handle = await pickSyncFolder();
      if (handle) {
        state.syncFolder = handle;
        renderSettings(container, state, navigate);
      }
    } catch (e) { console.error(e); }
  };

  // Theme Management
  const colorInput = container.querySelector('#theme-color-input');
  colorInput.oninput = () => applyTheme(colorInput.value);
  colorInput.onchange = () => saveThemeColor(colorInput.value);
  
  container.querySelector('#btn-reset-color').onclick = () => {
    applyTheme(DEFAULT_COLOR);
    saveThemeColor(DEFAULT_COLOR);
    renderSettings(container, state, navigate);
  };

  // PACKET DELETION (Local + Cloud)
  container.querySelectorAll('.btn-delete-packet').forEach(btn => {
    btn.onclick = async () => {
      const { id, file } = btn.dataset;
      const techFolder = tech.folder_name;

      const confirmMsg = `Permanently delete this packet?\n\n` +
                         `1. It will be removed from this device.\n` +
                         `2. The file will be deleted from your OneDrive techs folder.\n\n` +
                         `Are you sure?`;

      if (confirm(confirmMsg)) {
        try {
          // 1. Attempt to delete from OneDrive
          if (state.syncFolder && techFolder) {
            const path = `techs/${techFolder}`;
            await deleteJsonFile(state.syncFolder, path, file);
            console.log(`Cloud file ${file} removed from ${path}`);
          }

          // 2. Delete from local IndexedDB
          await deletePacket(id);

          // 3. Update state and refresh
          state.packets = state.packets.filter(p => p.packet_id !== id);
          alert("Packet removed from device and cloud.");
          renderSettings(container, state, navigate);
        } catch (err) {
          console.error(err);
          // If cloud delete fails, still delete local so tech isn't stuck
          alert("Local copy removed. Note: Could not delete cloud file (OneDrive may be locked).");
          await deletePacket(id);
          state.packets = state.packets.filter(p => p.packet_id !== id);
          renderSettings(container, state, navigate);
        }
      }
    };
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}