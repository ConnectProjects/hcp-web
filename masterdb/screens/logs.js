import { query } from '../db/sqlite.js'

export function renderLogs(container, state, navigate) {
  const logs = query("SELECT * FROM system_log ORDER BY created_at DESC LIMIT 500");

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>System Audit Log</h1>
          <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Tracking activity for Admins, LCs, and Billing.</p>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-refresh-logs">🔄 Refresh Log</button>
      </div>

      <div class="data-table-wrap">
        <table class="data-table" style="font-size: 12px;">
          <thead>
            <tr>
              <th style="width: 160px;">Timestamp</th>
              <th style="width: 150px;">User</th>
              <th style="width: 150px;">Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? '<tr><td colspan="4" class="empty-cell">No activity recorded yet.</td></tr>' : 
              logs.map(l => `
              <tr>
                <td style="color:var(--grey-500); font-family: monospace;">${l.created_at}</td>
                <td><strong>${esc(l.user_name)}</strong></td>
                <td><span class="badge" style="text-transform:uppercase; font-size:10px;">${esc(l.action)}</span></td>
                <td class="td-muted">${esc(l.details || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#btn-refresh-logs').onclick = () => renderLogs(container, state, navigate);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}