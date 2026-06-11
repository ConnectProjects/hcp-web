/**
 * screens/logs.js
 * 
 * System Audit Log Viewer.
 * Displays formatted timestamps and user actions.
 */

import { query } from '../db/sqlite.js'
import { TimeService } from '../../shared/time-utils.js'

export function renderLogs(container, state, navigate) {
  // Fetch the latest 500 actions
  const logs = query("SELECT * FROM system_log ORDER BY created_at DESC LIMIT 500");

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>System Audit Log</h1>
          <p style="color:var(--grey-500);font-size:13px;margin-top:4px">Audit trail for office and field actions.</p>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-refresh-logs">🔄 Refresh Log</button>
      </div>

      <div class="data-table-wrap">
        <table class="data-table" style="font-size: 12px;">
          <thead>
            <tr>
              <th style="width: 180px;">Date/Time</th>
              <th style="width: 150px;">User</th>
              <th style="width: 150px;">Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="logs-tbody">
            ${logs.length === 0 ? '<tr><td colspan="4" class="empty-cell">No activity recorded yet.</td></tr>' : 
              logs.map(l => `
              <tr>
                <td style="color:var(--grey-600); font-family: system-ui, sans-serif;">
                    ${TimeService.formatNice(l.created_at)}
                </td>
                <td><strong>${esc(l.user_name)}</strong></td>
                <td><span class="badge" style="text-transform:uppercase; font-size:10px;">${esc(l.action)}</span></td>
                <td class="td-muted" style="font-size:11px;">${esc(l.details || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach refresh handler
  container.querySelector('#btn-refresh-logs').onclick = () => {
      renderLogs(container, state, navigate);
  };
}

// Helper: Escape HTML to prevent XSS
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}