/**
 * masterdb2/screens/login.js — connect to OneDrive folder + select user
 *
 * State machine:
 *   boot          loadSql (wasm compile)
 *     ↓
 *   connecting    tryConnect() — recall last folder from IndexedDB
 *     ↓ null             ↓ success
 *   needs-folder  loading-db
 *     ↓ (click)          ↓
 *   loading-db    (optional) conflict-warning
 *     ↓                  ↓ continue
 *   user-select ← ── ── ─┘
 *     ↓ (click)
 *   → navigate('dashboard')
 *
 * No imports from app.js — receives navigate + session via params.
 */

import { loadSql, tryConnect, connectWithPicker, query, claimLock, StoreFileNotFoundError } from '../db/db.js'

const WASM = new URL('../../masterdb/vendor/sql-wasm.wasm', import.meta.url).href

export function mount(container, { navigate, session }) {
  const root = document.createElement('div')
  root.className = 'login-screen'
  container.appendChild(root)

  // ── State machine ──────────────────────────────────────────────────────────

  async function boot() {
    render('boot', { message: 'Loading database engine…' })
    try {
      await loadSql(window.initSqlJs, WASM)
      render('connecting', { message: 'Connecting to OneDrive folder…' })
      const result = await tryConnect()
      if (!result) {
        render('needs-folder')
        return
      }
      session.openResult = result
      if (result.conflicts.length) {
        render('conflict-warning', { conflicts: result.conflicts })
      } else {
        showUserSelect()
      }
    } catch (e) {
      if (e instanceof StoreFileNotFoundError) {
        render('db-not-found')
      } else {
        render('error', { message: e.message })
      }
    }
  }

  async function onPickFolder() {
    render('loading-db', { message: 'Opening folder…' })
    try {
      const result = await connectWithPicker()
      session.openResult = result
      if (result.conflicts.length) {
        render('conflict-warning', { conflicts: result.conflicts })
      } else {
        showUserSelect()
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        render('needs-folder')
      } else if (e instanceof StoreFileNotFoundError) {
        render('db-not-found')
      } else {
        render('error', { message: e.message })
      }
    }
  }

  async function onSelectUser(user) {
    session.user       = user
    session.writerName = user.name

    // Claim the write lock for this session (best-effort — if another session
    // holds it, the dashboard will show the lock banner from readLock())
    try { await claimLock(session.writerName) } catch { /* StoreLockError handled in dashboard */ }

    navigate('dashboard')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  // Each state gets a fresh card; event listeners are attached after innerHTML.

  function card(headerHTML, bodyHTML) {
    root.innerHTML = ''
    const el = document.createElement('div')
    el.className = 'login-card'
    el.innerHTML = `
      <div class="login-header">
        <div class="login-logo">MDB</div>
        <h1 class="login-title">MasterDB</h1>
        <p class="login-subtitle">Hearing Conservation Management</p>
      </div>
      <div class="login-body">${headerHTML}${bodyHTML}</div>
    `
    root.appendChild(el)
    return el
  }

  function render(state, data = {}) {
    switch (state) {
      case 'boot':
      case 'connecting':
      case 'loading-db':
        card('', `<div class="spinner"></div><p class="status-text">${esc(data.message)}</p>`)
        break

      case 'needs-folder': {
        const el = card('', `
          <p class="status-text">
            Select the shared OneDrive folder to open MasterDB.
          </p>
          <button class="btn btn-primary btn-block" id="pick-btn">Open OneDrive Folder</button>
          <p class="hint-text">
            Choose: <em>Brothen, Jan&apos;s files &ndash; TechTool</em>
          </p>
        `)
        el.querySelector('#pick-btn').addEventListener('click', onPickFolder)
        break
      }

      case 'conflict-warning': {
        const items = (data.conflicts ?? []).map(f => `<li>${esc(f)}</li>`).join('')
        const el = card('', `
          <div class="warning-banner">
            <strong>Conflict copies detected in db/</strong>
            <ul>${items}</ul>
            <p>These may contain unsaved changes from another session.
               Resolve them in OneDrive before running an import.</p>
          </div>
          <button class="btn btn-primary btn-block" id="continue-btn">Continue Anyway</button>
        `)
        el.querySelector('#continue-btn').addEventListener('click', showUserSelect)
        break
      }

      case 'db-not-found': {
        const el = card('', `
          <div class="warning-banner">
            <strong>masterdb.sqlite not found in that folder.</strong>
            <p>The app expects the database at <code>db/masterdb.sqlite</code>
               inside the root folder you choose.</p>
          </div>
          <ol style="font-size:0.875rem;padding-left:1.25rem;display:flex;flex-direction:column;gap:0.5rem">
            <li>Open the folder you selected in Windows Explorer</li>
            <li>Create a subfolder named <strong>db</strong> if it doesn&apos;t exist</li>
            <li>Copy <code>local-tests\\rebuild\\out\\masterdb.sqlite</code>
                from the repo into that <strong>db</strong> subfolder</li>
            <li>Click <em>Try Again</em> and re-select the same folder</li>
          </ol>
          <button class="btn btn-primary btn-block" id="pick-again-btn">Try Again</button>
        `)
        el.querySelector('#pick-again-btn').addEventListener('click', onPickFolder)
        break
      }

      case 'error': {
        const el = card('', `
          <div class="error-banner"><strong>Error:</strong> ${esc(data.message)}</div>
          <button class="btn btn-secondary btn-block" id="retry-btn">Retry</button>
        `)
        el.querySelector('#retry-btn').addEventListener('click', boot)
        break
      }
    }
  }

  // ── User selection ─────────────────────────────────────────────────────────

  function showUserSelect() {
    let users = []
    try {
      users = query(`SELECT user_id, name, initials, role
                     FROM users WHERE active = 1 ORDER BY name`)
    } catch (e) {
      render('error', { message: `Failed to load users: ${e.message}` })
      return
    }

    root.innerHTML = ''
    const el = document.createElement('div')
    el.className = 'login-card login-card-wide'

    const headerHTML = `
      <div class="login-header">
        <div class="login-logo">MDB</div>
        <h1 class="login-title">MasterDB</h1>
        <p class="login-subtitle">Who&apos;s using MasterDB today?</p>
      </div>
    `

    let bodyHTML
    if (!users.length) {
      bodyHTML = `
        <div class="login-body">
          <p class="status-text">No users found in the database.</p>
          <p class="hint-text">Add users in Settings, or check that the correct folder is open.</p>
          <button class="btn btn-secondary btn-block" id="wrong-folder-btn">Open a Different Folder</button>
        </div>
      `
    } else {
      const tiles = users.map(u => `
        <button class="user-tile" data-uid="${esc(u.user_id)}">
          <div class="user-avatar">${esc(initials(u))}</div>
          <div class="user-tile-name">${esc(u.name)}</div>
          <div class="user-tile-role">${esc(roleLabel(u.role))}</div>
        </button>
      `).join('')
      bodyHTML = `<div class="login-body"><div class="user-grid">${tiles}</div></div>`
    }

    el.innerHTML = headerHTML + bodyHTML
    root.appendChild(el)

    // Wire up tiles
    el.querySelectorAll('.user-tile').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid  = btn.dataset.uid
        const user = users.find(u => String(u.user_id) === uid)
        if (user) onSelectUser(user)
      })
    })

    // Wire up the "wrong folder" button if present
    el.querySelector('#wrong-folder-btn')?.addEventListener('click', onPickFolder)
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  boot()

  return { unmount() { root.innerHTML = '' } }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function initials(user) {
  if (user.initials) return user.initials
  return (user.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?'
}

function roleLabel(role) {
  return { super_admin: 'Super-Admin', admin: 'Admin', lc: 'LC', aud_tech: 'Aud-Tech' }[role] ?? role ?? ''
}
