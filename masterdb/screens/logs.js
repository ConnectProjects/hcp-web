import { query } from '../db/sqlite.js'
import { TimeService } from '../../shared/time-utils.js'

export function renderLogs(container, state, navigate) {
  state.logFilters = state.logFilters || { search: '', action: '', dateFrom: '', dateTo: '', page: 0 };
  const PAGE_SIZE = 100;

  const render = () => {
    const f = state.logFilters;

    // Build query dynamically
    const conditions = [];
    const params = [];
    if (f.search) { conditions.push("(user_name LIKE ? OR details LIKE ?)"); params.push(`%${f.search}%`, `%${f.search}%`); }
    if (f.action) { conditions.push("action = ?"); params.push(f.action); }
    if (f.dateFrom) { conditions.push("created_at >= ?"); params.push(f.dateFrom); }
    if (f.dateTo)   { conditions.push("created_at <= ?"); params.push(f.dateTo + 'T23:59:59'); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = query(`SELECT COUNT(*) AS n FROM system_log ${where}`, params)[0]?.n ?? 0;
    const offset = f.page * PAGE_SIZE;
    const logs = query(`SELECT * FROM system_log ${where} ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`, params);

    // Get distinct action types for filter dropdown
    const actions = query("SELECT DISTINCT action FROM system_log ORDER BY action").map(r => r.action);

    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <h1>System Audit Log</h1>
            <p style="color:var(--grey-500);font-size:13px;margin-top:4px">${total} entries</p>
          </div>
          <button class="btn btn-outline btn-sm" id="btn-refresh">🔄 Refresh</button>
        </div>

        <div class="toolbar" style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:10px; margin-bottom:16px;">
          <input id="log-search" type="search" class="search-input" placeholder="Search user or details…" value="${esc(f.search)}" />
          <select id="log-action" class="search-input">
            <option value="">All Actions</option>
            ${actions.map(a => `<option value="${esc(a)}" ${f.action===a?'selected':''}>${esc(a)}</option>`).join('')}
          </select>
          <input id="log-from" type="date" class="search-input" placeholder="From" value="${f.dateFrom}" max="${today}" />
          <input id="log-to"   type="date" class="search-input" placeholder="To"   value="${f.dateTo}"   max="${today}" />
        </div>

        <div class="data-table-wrap">
          <table class="data-table" style="font-size:12px;">
            <thead>
              <tr>
                <th style="width:180px">Date/Time</th>
                <th style="width:150px">User</th>
                <th style="width:150px">Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0
                ? '<tr><td colspan="4" class="empty-cell">No matching log entries.</td></tr>'
                : logs.map(l => `
                  <tr>
                    <td style="color:var(--grey-600);font-family:system-ui,sans-serif">${TimeService.formatNice(l.created_at)}</td>
                    <td><strong>${esc(l.user_name)}</strong></td>
                    <td><span class="badge" style="text-transform:uppercase;font-size:10px">${esc(l.action)}</span></td>
                    <td class="td-muted" style="font-size:11px">${esc(l.details || '—')}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding:8px 0;">
          <span style="font-size:13px;color:#666">
            ${total === 0 ? 'No results' : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline" id="btn-prev" ${f.page === 0 ? 'disabled' : ''}>« Previous</button>
            <button class="btn btn-sm btn-outline" id="btn-next" ${offset + PAGE_SIZE >= total ? 'disabled' : ''}>Next »</button>
          </div>
        </div>
      </div>
    `;

    const update = (key, val) => { state.logFilters[key] = val; state.logFilters.page = 0; render(); };

    container.querySelector('#btn-refresh').onclick = render;
    container.querySelector('#log-search').oninput = e => {
      clearTimeout(window._logTimer);
      window._logTimer = setTimeout(() => update('search', e.target.value.trim()), 300);
    };
    container.querySelector('#log-action').onchange = e => update('action', e.target.value);
    container.querySelector('#log-from').onchange   = e => update('dateFrom', e.target.value);
    container.querySelector('#log-to').onchange     = e => update('dateTo',   e.target.value);
    container.querySelector('#btn-prev').onclick = () => { state.logFilters.page--; render(); };
    container.querySelector('#btn-next').onclick = () => { state.logFilters.page++; render(); };
  };

  render();
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
