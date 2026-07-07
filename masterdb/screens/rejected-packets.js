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
        <div class="empty-state">
          <p>No rejected packets.</p>
        </div>
      ` : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Company</th><th>Province</th><th>Visit Date</th>
              <th>Tech</th><th>Note</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rejected.map(p => `
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
        </table>
      `}
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('packets'))

  container.querySelectorAll('.btn-review').forEach(btn => {
    btn.addEventListener('click', () =>
      navigate('import-confirm', { params: { packetId: btn.dataset.packetId } })
    )
  })

  container.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Restore this packet to "Ready to Import"?')) {
        updatePacketStatus(btn.dataset.packetId, 'submitted')
        navigate('rejected-packets')
      }
    })
  })
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
