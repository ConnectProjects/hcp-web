import { getAllPackets, deletePacketRecord } from '../db/packets.js'
import { deleteJsonFile } from '@shared/fs/sync-folder.js'

export function renderPackets(container, state, navigate) {
  const all       = getAllPackets()
  const pending   = all.filter(p => p.status === 'pending')
  const submitted = all.filter(p => p.status === 'submitted')
  const rejected  = all.filter(p => p.status === 'rejected')
  const recent    = all.filter(p => p.status === 'imported' || p.status === 'archived').slice(0, 15)

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1>Packets</h1>
        <div class="header-actions">
          <button class="btn btn-outline btn-sm" id="btn-rejected">View Rejected</button>
          <button class="btn btn-outline btn-sm" id="btn-check-inbox">↙ Check Inbox</button>
          <button class="btn btn-primary"        id="btn-new-packet">+ New Packet</button>
        </div>
      </div>

      <div class="packets-group">
        <div class="packets-group-head">
          <h2>In the Field <span class="packets-count">${pending.length}</span></h2>
        </div>
        ${pending.length === 0 ? '<p class="empty-note">No packets in the field.</p>' : packetTable(pending, false, state, navigate)}
      </div>

      ${submitted.length > 0 ? `
        <div class="packets-group">
          <div class="packets-group-head">
            <h2>Ready to Import <span class="packets-count packets-count--alert">${submitted.length}</span></h2>
          </div>
          ${packetTable(submitted, true, state, navigate)}
        </div>
      ` : ''}

      ${recent.length > 0 ? `
        <div class="packets-group">
          <div class="packets-group-head">
            <h2>Recently Completed <span class="packets-count packets-count--muted">${recent.length}</span></h2>
          </div>
          ${packetTable(recent, false, state, navigate)}
        </div>
      ` : ''}
    </div>
  `;

  // --- Handlers ---
  container.querySelector('#btn-rejected').onclick = () => navigate('rejected-packets');
  container.querySelector('#btn-new-packet').onclick = () => navigate('generate-packet');
  container.querySelector('#btn-check-inbox').onclick = () => navigate('incoming');

  // Review button handler
  container.querySelectorAll('.btn-review').forEach(btn => {
    btn.onclick = () => navigate('import-confirm', { params: { packetId: btn.dataset.packetId } });
  });

  // DELETE HANDLER
  container.querySelectorAll('.btn-delete-packet').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const { id, file, folder } = btn.dataset;

      if (confirm(`Permanently delete packet "${file}"?\n\nThis removes the record from MasterDB and deletes the file from the tech's folder.`)) {
        try {
          // 1. Delete from OneDrive (if folder is connected)
          if (state.syncFolder && folder && file) {
            await deleteJsonFile(state.syncFolder, `techs/${folder}`, file);
          }
          // 2. Delete from SQLite
          deletePacketRecord(id);
          // 3. Refresh Screen
          renderPackets(container, state, navigate);
        } catch (err) {
          console.error(err);
          alert("Error deleting physical file. The database record was removed, but you may need to delete the file manually from OneDrive.");
          deletePacketRecord(id);
          renderPackets(container, state, navigate);
        }
      }
    };
  });
}

function packetTable(packets, showReview, state, navigate) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Company / Location</th><th>Province</th><th>Visit Date</th>
          <th>Tech</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${packets.map(p => `
          <tr>
            <td>
                <div class="td-primary">${esc(p.company_name)}</div>
                <div class="td-muted" style="font-size:11px">${esc(p.location_name)}</div>
            </td>
            <td><span class="province-badge">${esc(p.province)}</span></td>
            <td>${p.visit_date ?? '—'}</td>
            <td>${esc(p.tech_id ?? '—')}</td>
            <td><span class="packet-status packet-status--${p.status}">${statusLabel(p.status)}</span></td>
            <td style="text-align:right">
              <div style="display:flex; gap:8px; justify-content: flex-end; align-items:center;">
                <button class="btn btn-sm btn-ghost btn-delete-packet" 
                        data-id="${esc(p.packet_id)}" 
                        data-file="${esc(p.filename)}" 
                        data-folder="${esc(p.tech_folder_name || '')}"
                        title="Delete Packet">🗑️</button>
                ${showReview ? `<button class="btn btn-primary btn-sm btn-review" data-packet-id="${esc(p.packet_id)}">Review & Import →</button>` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function statusLabel(s) {
  return { pending: 'In Field', submitted: 'Ready to Import', imported: 'Imported', archived: 'Archived', rejected: 'Rejected' }[s] ?? s;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}