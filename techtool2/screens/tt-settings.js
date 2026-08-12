import { query } from '../../masterdb2/db/db.js'

export function mount(container, { navigate, session }) {
  const user = session.user

  let techRow = null
  try {
    techRow = query(
      `SELECT folder_name FROM techs WHERE LOWER(name) = LOWER(?) AND active = 1 LIMIT 1`,
      [user?.name ?? '']
    )[0] ?? null
  } catch { /* db not ready */ }

  const folder = techRow?.folder_name ?? null

  container.innerHTML = `
    <div class="screen-header-row"><h1>Settings</h1></div>
    <div class="screen-body">

      <div class="section-head"><h2>My Profile</h2></div>
      <div class="info-card">
        <dl>
          <dt>Name</dt>
          <dd>${esc(user?.name ?? '—')}</dd>

          <dt>Initials</dt>
          <dd>${esc(user?.initials ?? '—')}</dd>

          <dt>OneDrive folder</dt>
          <dd>${folder
            ? esc(folder)
            : `<span style="color:var(--clr-subtle)">Not configured — ask your LC to set your folder in Settings.</span>`
          }</dd>
        </dl>
      </div>

      <div class="section-head" style="margin-top:1.5rem"><h2>Session</h2></div>
      <div class="info-card" style="display:flex;align-items:center;justify-content:space-between;gap:1rem">
        <span style="font-size:0.875rem;color:var(--clr-subtle)">
          Signed in as <strong>${esc(user?.name ?? '—')}</strong>
        </span>
        <button class="btn btn-secondary" id="signout-btn">Sign out</button>
      </div>

    </div>
  `

  container.querySelector('#signout-btn').addEventListener('click', () => navigate('login'))
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
