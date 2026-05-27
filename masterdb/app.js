import { renderDataTools } from './screens/data-tools.js'
import { renderUsers }     from './screens/users.js'
import { renderLogin }     from './screens/login.js'
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
import { ROLES, PERMISSIONS } from '../shared/auth-utils.js'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const state = {
  screen:          'login',
  user:            null, // { user_id, name, role, ... }
  syncFolder:      null,
  logoUrl:         null,
  orgProfile:      null,
  currentCompany:  null,
  currentEmployee: null,
  pendingPacket:   null,
  params:          {}
}

// Expose state for console debugging and initialization scripts
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
// Screen Registry
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

// ---------------------------------------------------------------------------
// Navigation Items (Sidebar)
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { screen: 'dashboard',    label: 'Dashboard',     icon: '⊞' },
  { screen: 'companies',    label: 'Companies',     icon: '🏭' },
  { screen: 'employees',    label: 'Employees',     icon: '👷' },
  { screen: 'packets',      label: 'Packets',       icon: '📦' },
  { screen: 'reports',      label: 'Reports',       icon: '📊' },
  { screen: 'users',        label: 'Team',          icon: '👥' },
  { screen: 'settings',     label: 'Settings',      icon: '⚙' },
  { screen: 'legacy-import',label: 'Import Legacy', icon: '📥' },
  { screen: 'data-tools',   label: 'Data Tools',    icon: '🛠️' }
]

const NAV_PARENT = {
  'company-detail':  'companies',
  'employee-detail': 'employees',
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
// Navigation & Permission Guard
// ---------------------------------------------------------------------------

export function navigate(screen, params = {}) {
  // 1. If trying to go anywhere but login without a user, force login
  if (!state.user && screen !== 'login') {
      state.screen = 'login';
      paint();
      return;
  }

  // 2. Role-Based Permission Check
  if (state.user && screen !== 'login') {
    const role = state.user.role;
    
    // Technicians (aud-tech) are blocked from ALL MasterDB screens
    if (role === ROLES.TECH) {
        alert("Access Denied: Technicians do not have access to the MasterDB platform.");
        logout();
        return;
    }

    // Logistical Coordinators (LC) have a restricted list
    if (role === ROLES.LC) {
        const allowed = PERMISSIONS[ROLES.LC];
        if (!allowed.includes(screen)) {
            alert("Access Denied: You do not have permission to access this administrative tool.");
            return;
        }
    }
    // Admins fall through and are allowed everywhere
  }

  state.screen = screen;
  state.params = params;
  Object.assign(state, params);
  paint();
}

// ---------------------------------------------------------------------------
// UI Rendering
// ---------------------------------------------------------------------------

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

  // Filter Sidebar based on Permissions
  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (state.user?.role === ROLES.ADMIN) return true;
    return PERMISSIONS[state.user?.role]?.includes(item.screen);
  });

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
          ${filteredNavItems.map(item => `
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
            <span class="user-name">${esc(state.user?.name)}</span>
            <span style="font-size:9px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px;">${state.user?.role}</span>
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
// Boot Sequence
// ---------------------------------------------------------------------------

async function boot() {
  await initDB()
  await initSchema()

  state.syncFolder = await querySyncFolder()
  state.logoUrl    = queryOne('SELECT value FROM settings WHERE key = ?', ['company_logo'])?.value ?? null

  // 1. Session Restoration
  const savedUserId = localStorage.getItem('masterdb_user_id');
  if (savedUserId) {
      const user = queryOne("SELECT * FROM users WHERE user_id = ?", [savedUserId]);
      if (user && user.active !== 0) state.user = user;
  }

  // 2. Load Org Profile
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

  // 3. Initial Navigation
  if (!state.user) {
      navigate('login');
  } else {
      navigate('dashboard');
  }
}

boot().catch(err => {
  document.getElementById('app').innerHTML = `
    <div class="error-screen"><h2>Startup Error</h2><pre>${err.message}</pre></div>
  `
})

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}