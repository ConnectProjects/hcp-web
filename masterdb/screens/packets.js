import { getAllPackets, createPacketRecord, deletePacketRecord } from '../db/packets.js'
import { deleteJsonFile, listSubdirectories, listJsonFiles, readJsonFile } from '@shared/fs/sync-folder.js'
import { queryOne } from '../db/sqlite.js'

export function renderPackets(container, state, navigate) {
  state.packetFilters = state.packetFilters || { search: '', status: 'all', sort: 'desc' };

  const render = () => {
    const f = state.packetFilters;
    let all = getAllPackets();

    // Search
    if (f.search) {
      const q = f.search.toLowerCase();
      all = all.filter(p =>
        (p.company_name  || '').toLowerCase().includes(q) ||
        (p.location_name || '').toLowerCase().includes(q) ||
        (p.tech_id       || '').toLowerCase().includes(q) ||
        (p.visit_date    || '').includes(q)
      );
    }

    // Status filter
    if (f.status !== 'all') {
      const map = {
        pending:         p => p.status === 'pending' || p.status === 'active',
        submitted:       p => p.status === 'submitted',
        imported:        p => p.status === 'imported' || p.status === 'archived',
        rejected:        p => p.status === 'rejected',
        removed_by_tech: p => p.status === 'removed_by_tech',
      };
      if (map[f.status]) all = all.filter(map[f.status]);
    }

    // Sort by visit date
    all = [...all].sort((a, b) => {
      const da = a.visit_date ?? '', db = b.visit_date ?? '';
      return f.sort === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

    const pending        = all.filter(p => p.status === 'pending' || p.status === 'active');
    const submitted      = all.filter(p => p.status === 'submitted');
    const rejected       = all.filter(p => p.status === 'rejected');
    const removedByTech  = all.filter(p => p.status === 'removed_by_tech');
    const recent         = all.filter(p => p.status === 'imported' || p.status === 'archived');

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>Packets</h1>
          <div class="header-actions">
            <button class="btn btn-outline btn-sm" id="btn-rejected">View Rejected</button>
            <button class="btn btn-outline btn-sm" id="btn-scan-folder">↺ Scan Folder</button>
            <button class="btn btn-outline btn-sm" id="btn-check-inbox">↙ Check Inbox</button>
            <button class="btn btn-primary"        id="btn-new-packet">+ New Packet</button>
          </div>
        </div>

        <div class="toolbar" style="display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:10px; margin-bottom:20px;">
          <input id="pkt-search" type="search" class="search-input" placeholder="Search company, location, tech…" value="${esc(f.search)}" />
          <select id="pkt-status" class="search-input">
            <option value="all"             ${f.status==='all'             ?'selected':''}>All Statuses</option>
            <option value="pending"         ${f.status==='pending'         ?'selected':''}>In the Field</option>
            <option value="submitted"       ${f.status==='submitted'       ?'selected':''}>Ready to Import</option>
            <option value="imported"        ${f.status==='imported'        ?'selected':''}>Completed</option>
            <option value="rejected"        ${f.status==='rejected'        ?'selected':''}>Rejected</option>
            <option value="removed_by_tech" ${f.status==='removed_by_tech' ?'selected':''}>Removed by Technician</option>
          </select>
          <select id="pkt-sort" class="search-input">
            <option value="desc" ${f.sort==='desc'?'selected':''}>Newest First</option>
            <option value="asc"  ${f.sort==='asc' ?'selected':''}>Oldest First</option>
          </select>
          <span class="result-count" style="line-height:36px">${all.length} packet${all.length!==1?'s':''}</span>
        </div>

        ${f.status === 'all' || f.status === 'submitted' ? submitted.length > 0 ? `
          <div class="packets-group">
            <div class="packets-group-head">
              <h2>Ready to Import <span class="packets-count packets-count--alert">${submitted.length}</span></h2>
            </div>
            ${packetTable(submitted, true, navigate)}
          </div>
        ` : '' : ''}

        ${f.status === 'all' || f.status === 'pending' ? `
          <div class="packets-group">
            <div class="packets-group-head">
              <h2>In the Field <span class="packets-count">${pending.length}</span></h2>
            </div>
            ${pending.length === 0 ? '<p class="empty-note">No packets.</p>' : packetTable(pending, false, navigate)}
          </div>
        ` : ''}

        ${f.status === 'all' || f.status === 'imported' ? recent.length > 0 ? `
          <div class="packets-group">
            <div class="packets-group-head">
              <h2>Recently Completed <span class="packets-count packets-count--muted">${recent.length}</span></h2>
            </div>
            ${packetTable(recent, false, navigate)}
          </div>
        ` : '' : ''}

        ${f.status === 'rejected' ? `
          <div class="packets-group">
            <div class="packets-group-head">
              <h2>Rejected <span class="packets-count">${rejected.length}</span></h2>
            </div>
            ${rejected.length === 0 ? '<p class="empty-note">No rejected packets.</p>' : packetTable(rejected, false, navigate)}
          </div>
        ` : ''}

        ${f.status === 'all' || f.status === 'removed_by_tech' ? removedByTech.length > 0 ? `
          <div class="packets-group">
            <div class="packets-group-head">
              <h2>Removed by Technician <span class="packets-count packets-count--warn">${removedByTech.length}</span></h2>
            </div>
            ${packetTable(removedByTech, false, navigate)}
          </div>
        ` : (f.status === 'removed_by_tech' ? '<p class="empty-note">No packets removed by technician.</p>' : '') : ''}

        ${all.length === 0 ? '<p class="empty-note" style="padding:40px;text-align:center;color:#999">No packets match your filters.</p>' : ''}
      </div>
    `;

    container.querySelector('#pkt-search').oninput = e => {
      clearTimeout(window._pktTimer);
      window._pktTimer = setTimeout(() => { state.packetFilters.search = e.target.value; render(); }, 250);
    };
    container.querySelector('#pkt-status').onchange = e => { state.packetFilters.status = e.target.value; render(); };
    container.querySelector('#pkt-sort').onchange   = e => { state.packetFilters.sort   = e.target.value; render(); };

    container.querySelector('#btn-rejected').onclick   = () => navigate('rejected-packets');
    container.querySelector('#btn-new-packet').onclick  = () => navigate('generate-packet');
    container.querySelector('#btn-check-inbox').onclick = () => navigate('incoming');

    container.querySelector('#btn-scan-folder').onclick = async () => {
      if (!state.syncFolder) {
        alert('No sync folder connected. Go to Settings → OneDrive Sync first.')
        return
      }
      const btn = container.querySelector('#btn-scan-folder')
      btn.disabled = true
      btn.textContent = 'Scanning…'
      try {
        let recovered = 0
        let scanned   = 0
        const techDirs = await listSubdirectories(state.syncFolder, 'techs').catch(() => [])
        for (const dir of techDirs) {
          const files = await listJsonFiles(state.syncFolder, `techs/${dir}`).catch(() => [])
          for (const { name } of files) {
            try {
              const packet = await readJsonFile(state.syncFolder, `techs/${dir}`, name)
              if (!packet?.packet_id) continue
              scanned++
              const exists = queryOne('SELECT 1 FROM packets WHERE packet_id = ?', [packet.packet_id])
              if (!exists) {
                const companyId = packet.company?.company_id
                const visitDate = packet.visit?.visit_date
                const filename  = packet.filename ?? name
                if (!companyId || !visitDate) continue
                createPacketRecord(
                  packet.packet_id,
                  companyId,
                  packet.location?.location_id ?? null,
                  packet.tech?.tech_id ?? null,
                  visitDate,
                  filename,
                  null
                )
                recovered++
              }
            } catch { /* skip malformed files */ }
          }
        }
        alert(`Scan complete — ${scanned} packet file${scanned !== 1 ? 's' : ''} checked, ${recovered} recovered.`)
        render()
      } catch (e) {
        alert(`Scan failed: ${e.message}`)
      } finally {
        btn.disabled = false
        btn.textContent = '↺ Scan Folder'
      }
    };

    container.querySelectorAll('.btn-review').forEach(btn => {
      btn.onclick = () => navigate('import-confirm', { params: { packetId: btn.dataset.packetId } });
    });

    container.querySelectorAll('.btn-delete-packet').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const { id, file, folder } = btn.dataset;
        if (confirm(`Permanently delete packet "${file}"?\n\nThis removes the record from MasterDB and deletes the file from the tech's folder.`)) {
          try {
            if (state.syncFolder && folder && file) await deleteJsonFile(state.syncFolder, `techs/${folder}`, file);
            deletePacketRecord(id);
            render();
          } catch (err) {
            console.error(err);
            alert("Error deleting physical file. The database record was removed, but you may need to delete the file manually from OneDrive.");
            deletePacketRecord(id);
            render();
          }
        }
      };
    });
  };

  render();
}

function packetTable(packets, showReview, navigate) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Company</th><th>Location</th><th>Province</th><th>Visit Date</th>
          <th>Tech</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${packets.map(p => `
          <tr>
            <td>${esc(p.company_name)}</td>
            <td>${esc(p.location_name) || '—'}</td>
            <td><span class="province-badge">${esc(p.province)}</span></td>
            <td>${p.visit_date ?? '—'}</td>
            <td>${esc(p.tech_name || p.tech_id || '—')}</td>
            <td><span class="packet-status packet-status--${p.status}">${statusLabel(p.status)}</span></td>
            <td style="text-align:right">
              <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
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
  return {
    pending:         'In Field',
    active:          'In Field',
    submitted:       'Ready to Import',
    imported:        'Imported',
    archived:        'Archived',
    rejected:        'Rejected',
    removed_by_tech: 'Removed by Technician',
  }[s] ?? s;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
