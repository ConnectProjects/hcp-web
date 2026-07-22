import { getPacketsByStatus, updatePacketStatus } from '../db/packets.js'

export function renderRejectedPackets(container, state, navigate) {
  const rejected = getPacketsByStatus('rejected')

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="header-left">
          <button class="btn btn-ghost" id="btn-back">← Back to Packets</button>
          <h1>Rejected Packets</h1>
        </div>
      </div>

      <p class="section-desc">These packets were previously rejected. You can review them again or restore them to 'Ready to Import' status.</p>

      ${rejected.length === 0 ? `
        <div class="empty-state"><p>No rejected packets.</p></div>
      ` : `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <input type="search" class="search-input" id="rej-search"
            placeholder="Search by company…" style="flex:1;min-width:160px" />
          <select class="search-input" id="rej-sort" style="width:auto">
            <option value="date_desc">Date ↓ (newest)</option>
            <option value="date_asc">Date ↑ (oldest)</option>
            <option value="company_asc">Company A→Z</option>
            <option value="company_desc">Company Z→A</option>
          </select>
        </div>
        <div id="rej-table-wrap"></div>
      `}
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('packets'))

  if (rejected.length === 0) return

  const rejF = { search: '', sort: 'date_desc' }

  const rerenderTable = () => {
    const wrap = container.querySelector('#rej-table-wrap')
    if (!wrap) return
    let rows = rejected
    if (rejF.search) {
      const q = rejF.search.toLowerCase()
      rows = rows.filter(p =>
        (p.company_name ?? '').toLowerCase().includes(q) ||
        (p.tech_id ?? '').toLowerCase().includes(q)
      )
    }
    rows = [...rows].sort((a, b) => {
      if (rejF.sort === 'date_asc')     return (a.visit_date ?? '').localeCompare(b.visit_date ?? '')
      if (rejF.sort === 'company_asc')  return (a.company_name ?? '').localeCompare(b.company_name ?? '')
      if (rejF.sort === 'company_desc') return (b.company_name ?? '').localeCompare(a.company_name ?? '')
      return (b.visit_date ?? '').localeCompare(a.visit_date ?? '')  // date_desc default
    })

    if (rows.length === 0) {
      wrap.innerHTML = '<p class="empty-note">No packets match your search.</p>'
      return
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Company</th><th>Province</th><th>Visit Date</th>
            <th>Tech</th><th>Note</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(p => `
            <tr>
              <td class="td-primary">${esc(p.company_name)}</td>
              <td><span class="province-badge">${esc(p.province)}</span></td>
              <td>${p.visit_date ?? '—'}</td>
              <td>${esc(p.tech_id ?? '—')}</td>
              <td class="muted">${esc(p.status_note ?? '')}</td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-sm btn-outline btn-restore" data-packet-id="${esc(p.packet_id)}">Restore</button>
                  <button class="btn btn-sm btn-primary btn-review" data-packet-id="${esc(p.packet_id)}">Review →</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`

    wrap.querySelectorAll('.btn-review').forEach(btn => {
      btn.addEventListener('click', () =>
        navigate('import-confirm', { params: { packetId: btn.dataset.packetId } })
      )
    })
    wrap.querySelectorAll('.btn-restore').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Restore this packet to "Ready to Import"?')) {
          updatePacketStatus(btn.dataset.packetId, 'submitted')
          navigate('rejected-packets')
        }
      })
    })
  }

  rerenderTable()

  container.querySelector('#rej-search').addEventListener('input', e => {
    rejF.search = e.target.value
    rerenderTable()
  })
  container.querySelector('#rej-sort').addEventListener('change', e => {
    rejF.sort = e.target.value
    rerenderTable()
  })
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
