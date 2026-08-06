/**
 * masterdb2/screens/dashboard.js — minimal post-login landing page
 * Full dashboard (visit cards, inbox list, lock banner) is Phase 3.
 */

import { scalar, readLock, listBackups } from '../db/db.js'

export function mount(container, { navigate, session }) {
  const u    = session.user
  const or   = session.openResult

  container.innerHTML = `
    <div class="screen-header">
      <h1>Dashboard</h1>
    </div>
    <div class="screen-body" id="dash-body">
      <p style="color:var(--clr-subtle)">Loading status…</p>
    </div>
  `

  const body = container.querySelector('#dash-body')

  async function loadStatus() {
    const companies = scalar('SELECT COUNT(*) FROM companies WHERE active = 1') ?? 0
    const locations = scalar('SELECT COUNT(*) FROM locations WHERE active = 1') ?? 0
    const workers   = scalar("SELECT COUNT(*) FROM employees WHERE status = 'active' AND deleted_at IS NULL") ?? 0
    const tests     = scalar('SELECT COUNT(*) FROM tests WHERE deleted_at IS NULL') ?? 0
    const lock      = await readLock()
    const backups   = await listBackups()

    const lockBanner = lock && !lock.stale && lock.owner !== session.writerName
      ? `<div class="warning-banner" style="margin-bottom:1.25rem">
           <strong>Write lock held by ${esc(lock.owner)}</strong>
           since ${new Date(lock.claimedAt).toLocaleTimeString()}.
           MasterDB is in read-only mode until they finish.
         </div>`
      : ''

    body.innerHTML = `
      ${lockBanner}
      <p style="margin-bottom:1.25rem;color:var(--clr-subtle)">
        Welcome, ${esc(u?.name ?? 'user')}.
        Database loaded — seq&nbsp;${or?.saveSeq ?? '?'}
        ${or?.lastWriter ? `(last saved by&nbsp;<strong>${esc(or.lastWriter)}</strong>)` : ''}.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:2rem">
        ${stat('Companies',  companies)}
        ${stat('Locations',  locations)}
        ${stat('Workers',    workers)}
        ${stat('Tests',      tests)}
        ${stat('Backups',    backups.length)}
      </div>
      <p style="color:var(--clr-subtle);font-size:0.875rem">
        Full dashboard (upcoming visits, inbox queue, packet status) arrives in Phase 3.
        Use the sidebar to navigate.
      </p>
    `
  }

  loadStatus().catch(e => {
    body.innerHTML = `<div class="error-banner"><strong>Error:</strong> ${esc(e.message)}</div>`
  })
}

function stat(label, value) {
  return `
    <div style="background:var(--clr-white);border:1px solid var(--clr-border);border-radius:var(--radius);padding:1rem">
      <div style="font-size:1.75rem;font-weight:700;color:var(--clr-primary)">${value}</div>
      <div style="font-size:0.8125rem;color:var(--clr-subtle);margin-top:0.25rem">${label}</div>
    </div>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
