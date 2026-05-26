import { renderDataTools } from './screens/data-tools.js'
import { renderUsers }     from './screens/users.js'
import { renderLogin }     from './screens/login.js' // NEW
import { initDB, query, queryOne, backupToSyncFolder, exportExcelToSyncFolder } from './db/sqlite.js'
import { initSchema }         from './db/schema.js'
import { querySyncFolder }    from '@shared/fs/sync-folder.js'
import { BrandLogo }          from '@shared/components/brand-logo.js'
import { applyTheme, loadThemeColor } from './theme.js'
import { renderLegacyImport } from './screens/legacy-import.js'
import { renderDashboard }    from './screens/dashboard.js'
import { renderCompanies }    from './screens/companies.js'
import { renderCompanyDetail }from './screens/company-detail.js'
import { renderEmployeeDetail}from './screens/employee-detail.js'
import { renderEmployees }    from './screens/employees.js'
import { renderGeneratePacket}from './screens/generate-packet.js'
import { renderPackets }      from './screens/packets.js'
import { renderIncoming }     from './screens/incoming.js'
import { renderRejectedPackets } from './screens/rejected-packets.js'
import { renderImportConfirm }from './screens/import-confirm.js'
import { renderSettings }     from './screens/settings.js'
import { renderProvinceRules }from './screens/province-rules.js'
import { renderReports }      from './screens/reports.js'
import { renderHelp }         from './screens/help.js'
import { renderLocationDetail } from './screens/location-detail.js'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const state = {
  screen:          'login',
  user:            null,
  syncFolder:      null,
  logoUrl:         null,
  orgProfile:      null,
  currentCompany:  null,
  currentEmployee: null,
  pendingPacket:   null,
  params:          {}
}

window.state = state;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function logout() {
  if (confirm("Logout of MasterDB?")) {
    localStorage.removeItem('masterdb_user_id');
    state.user = null;
    navigate('login');
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const SCREENS = {
  login:             renderLogin,
  dashboard:         renderDashboard,
  companies:         renderCompanies,
  'company-detail':  renderCompanyDetail,
  'employee-detail': renderEmployeeDetail,
  employees:         renderEmployees,
  'generate-packet': renderGeneratePacket,
  packets:           renderPackets,
  incoming:          renderIncoming,
  'rejected-packets': renderRejectedPackets,
  'import-confirm':  renderImportConfirm,
  settings:          renderSettings,
  'province-rules':  renderProvinceRules,
  reports:           renderReports,
  'legacy-import':   renderLegacyImport,
  help:              renderHelp,
  'location-detail': renderLocationDetail,
  'data-tools':      renderDataTools,
  'users':           renderUsers,
}

const NAV_ITEMS = [
  { screen: 'dashboard',    label: 'Dashboard',     icon: '⊞' },
  { screen: 'companies',    label: 'Companies',     icon: '🏭' },
  { screen: 'employees',    label: 'Employees',     icon: '👷' },
  { screen: 'packets',      label: 'Packets',       icon: '📦' },
  { screen: 'users',        label: 'Team',          icon: '👥' },
  { screen: 'reports',      label: 'Reports',       icon: '📊' },
  { screen: 'settings',     label: 'Settings',      icon: '⚙' },
  { screen: 'legacy-import',label: 'Import Legacy', icon: '📥' },
  { screen: 'data-tools',   label: 'Data Tools',    icon: '🛠️' }
]

const NAV_PARENT = {
  'company-detail':  'companies',
  'employee-detail': 'companies',
  'generate-packet': 'companies',
  'incoming':        'packets',
  'rejected-packets': 'packets',
  'import-confirm':  'packets',
  'province-rules':  'settings',
  'location-detail': 'companies',
  'data-tools':      'data-tools',
  'users':           'users'
}

function isNavActive(current, navScreen) {
  return current === navScreen || NAV_PARENT[current] === navScreen
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function navigate(screen, params = {}) {
  state.screen = screen
  state.params = params
  Object.assign(state, params)
  paint()
}

function paint() {
  const app = document.getElementById('app')
  const renderFn = SCREENS[state.screen]
  
  if (!renderFn) {
    app.innerHTML = `<div class="error-screen"><h2>Unknown screen: ${state.screen}</h2></div>`
    return
  }

  // Login renders full-screen
  if (state.screen === 'login') {
    app.innerHTML = ''
    renderFn(app, state, navigate)
    return
  }

  app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          ${state.logoUrl
            ? `<img src="${state.logoUrl}" class="sidebar-logo-img" alt="Logo" />`
            : `<div class="sidebar-logo-img">${BrandLogo}</div>`
          }
        </div>
        <ul class="sidebar-nav">
          ${NAV_ITEMS.map(item => `
            <li>
              <button class="nav-item ${isNavActive(state.screen, item.screen) ? 'nav-item--active' : ''}"
                data-screen="${item.screen}">
                <span class="nav-icon">${item.icon}</span>
                <span class="nav-label">${item.label}</span>
              </button>
            </li>
          `).join('')}
        </ul>
        <div class="sidebar-footer">
          <div style="display:flex; flex-direction:column; gap:2px; margin-bottom:8px;">
            <span class="user-name">${state.user?.name || 'Admin'}</span>
            <button id="btn-logout" style="background:none; border:none; color:rgba(255,255,255,0.5); font-size:10px; text-align:left; cursor:pointer; padding:0; text-decoration:underline;">Logout</button>
          </div>
          <span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}"
            title="${state.syncFolder ? 'Sync folder connected' : 'No sync folder — go to Settings'}">
            ${state.syncFolder ? '●' : '○'} Sync
          </span>
        </div>
      </nav>
      <div class="main-area">
        <button class="help-btn" id="btn-help" title="Help">?</button>
        <div id="main-content" class="main-content"></div>
      </div>
    </div>
  `

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen))
  })

  app.querySelector('#btn-logout').onclick = logout;

  app.querySelector('#btn-help')?.addEventListener('click', () => {
    state.helpReturnScreen = state.screen
    navigate('help')
  })

  renderFn(document.getElementById('main-content'), state, navigate)
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  setBootMsg('Loading database…')
  await initDB()
  await initSchema()

  state.syncFolder = await querySyncFolder()
  state.logoUrl    = queryOne('SELECT value FROM settings WHERE key = ?', ['company_logo'])?.value ?? null

  // Restore user session if it exists
  const savedUserId = localStorage.getItem('masterdb_user_id');
  if (savedUserId) {
      const user = queryOne("SELECT * FROM users WHERE user_id = ?", [savedUserId]);
      if (user && user.active !== 0) state.user = user;
  }

  // Load org profile
  const orgKeys = ['org_name','org_address','org_city','org_province','org_postal','org_phone','org_email','org_website']
  state.orgProfile = Object.fromEntries(
    orgKeys.map(k => [k, queryOne('SELECT value FROM settings WHERE key = ?', [k])?.value ?? ''])
  )

  applyTheme(loadThemeColor())
  
  if (state.syncFolder) {
    setInterval(() => {
      backupToSyncFolder(state.syncFolder)
      exportExcelToSyncFolder(state.syncFolder)
    }, 5 * 60 * 1000)
    backupToSyncFolder(state.syncFolder)
    exportExcelToSyncFolder(state.syncFolder)
  }

  setBootMsg('Ready.')
  
  // If no user, force login
  if (!state.user) {
      navigate('login');
  } else {
      navigate('dashboard');
  }
}

function setBootMsg(msg) {
  const el = document.getElementById('boot-msg')
  if (el) el.textContent = msg
}

boot().catch(err => {
  document.getElementById('app').innerHTML = `
    <div class="error-screen">
      <h2>Startup Error</h2>
      <pre>${err.message}</pre>
    </div>
  `
})