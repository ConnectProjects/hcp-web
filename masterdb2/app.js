/**
 * masterdb2/app.js — app shell: boot, router, session, sidebar
 *
 * Startup sequence
 *   1. DOMContentLoaded → navigate('login')
 *   2. Login screen handles: loadSql → tryConnect/pickFolder → user select → navigate('dashboard')
 *   3. All subsequent navigates run through the router below.
 *
 * Screen contract
 *   Each screen lives in screens/<name>.js and exports:
 *     mount(container: HTMLElement, params: object) → void | { unmount() }
 *   Screens receive { navigate, session, ...extra } via params.
 *   Screens do NOT import app.js (avoids circular deps) — everything they need
 *   comes through params or their own imports from db/*.js.
 */

import { releaseLock } from './db/db.js'

// ── Session (shared mutable object — screens receive it via params) ────────────
export const session = {
  user:        null,   // row from users table
  writerName:  null,   // string passed to db.save() / claimLock()
  openResult:  null,   // { saveSeq, lastWriter, savedAt, conflicts } from tryConnect/picker
}

// ── Sidebar nav definitions ───────────────────────────────────────────────────
const MASTERDB_NAV = [
  { name: 'dashboard', label: 'Dashboard'  },
  { name: 'companies', label: 'Companies'  },
  { name: 'workers',   label: 'Workers'    },
  { name: 'schedule',  label: 'Schedule'   },
  { name: 'import',    label: 'Import'     },
  { name: 'reconcile', label: 'Reconcile'  },
  { name: 'reports',   label: 'Reports'    },
  { name: 'users',     label: 'Users'      },
  { name: 'settings',  label: 'Settings'   },
]

const TECHTOOL_NAV = [
  { name: 'tt-schedule', label: 'Schedule' },
  { name: 'tt-settings', label: 'Settings' },
]

function _activeNav() {
  return session.user?.role === 'aud_tech' ? TECHTOOL_NAV : MASTERDB_NAV
}

// ── Router ────────────────────────────────────────────────────────────────────
let _currentScreen = null
let _unmount       = null

export async function navigate(name, params = {}) {
  // Clean up the current screen
  try { _unmount?.() } catch { /* ignore */ }
  _unmount = null

  const container = document.getElementById('screen')
  container.innerHTML = ''
  _currentScreen = name

  const isLogin = name === 'login'
  _setSidebar(!isLogin, name)

  try {
    const path   = name.startsWith('tt-')
      ? `../techtool2/screens/${name}.js`
      : `./screens/${name}.js`
    const mod    = await import(path)
    const result = mod.mount(container, { navigate, session, ...params })
    if (result?.unmount) _unmount = result.unmount
  } catch (e) {
    if (_isModuleNotFound(e)) {
      container.innerHTML = _stub(name)
    } else {
      console.error(`Screen "${name}" threw:`, e)
      container.innerHTML = `<div class="error-card"><h2>Screen error</h2><pre>${_esc(e.message)}</pre></div>`
    }
  }
}

function _isModuleNotFound(e) {
  const m = e?.message ?? ''
  return m.includes('Failed to fetch') ||
         m.includes('Cannot find module') ||
         m.includes('error loading dynamically imported module') ||
         m.includes('404')
}

function _stub(name) {
  const label = _activeNav().find(n => n.name === name)?.label ?? name
  return `<div class="stub"><h2>${_esc(label)}</h2><p>This screen is coming soon.</p></div>`
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function _setSidebar(visible, active) {
  const sidebar = document.getElementById('sidebar')
  const brand   = document.getElementById('brand-corner')
  const app     = document.getElementById('app')
  sidebar.hidden = !visible
  if (brand) brand.hidden = !visible || session.user?.role === 'aud_tech'
  app.classList.toggle('has-sidebar', visible)
  if (visible) _renderSidebar(active)
}

function _renderSidebar(active) {
  const nav    = document.getElementById('sidebar-nav')
  const footer = document.getElementById('sidebar-footer')
  if (!nav) return

  nav.innerHTML = _activeNav().map(({ name, label }) =>
    `<a class="nav-link${name === active ? ' is-active' : ''}" data-screen="${name}" href="#">${_esc(label)}</a>`
  ).join('')

  nav.querySelectorAll('[data-screen]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.screen) })
  )

  const u = session.user
  if (u) {
    const initials = _esc(u.initials ?? (u.name ?? '?')[0])
    const name     = _esc(u.name ?? '')
    const role     = _esc(_roleLabel(u.role))
    footer.innerHTML = `
      <div class="sidebar-user">
        <div class="user-initials">${initials}</div>
        <div>
          <div class="user-name">${name}</div>
          <div class="user-role">${role}</div>
        </div>
      </div>
      <button class="btn-icon" id="signout-btn" title="Sign out">&#x23FB;</button>
    `
    footer.querySelector('#signout-btn')?.addEventListener('click', _signOut)
  } else {
    footer.innerHTML = ''
  }
}

function _roleLabel(role) {
  return { super_admin: 'Super-Admin', admin: 'Admin', lc: 'LC', aud_tech: 'Aud-Tech' }[role] ?? role ?? ''
}

// ── Sign out ──────────────────────────────────────────────────────────────────
async function _signOut() {
  if (session.writerName) {
    await releaseLock(session.writerName).catch(() => {})
  }
  session.user       = null
  session.writerName = null
  session.openResult = null
  navigate('login')
}

// ── Lock release on page hide / close ─────────────────────────────────────────
// Best-effort — async in beforeunload is not guaranteed to complete,
// but the 5-minute staleness on write.lock.json covers us.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && session.writerName) {
    releaseLock(session.writerName).catch(() => {})
  }
})
window.addEventListener('beforeunload', () => {
  if (session.writerName) releaseLock(session.writerName).catch(() => {})
})

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => navigate('login'))
