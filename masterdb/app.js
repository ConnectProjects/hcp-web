import { renderDataTools } from './screens/data-tools.js'
import { renderUsers }     from './screens/users.js'
import { renderLogin }     from './screens/login.js'
import { initDB, query, queryOne, run, backupToSyncFolder, exportExcelToSyncFolder } from './db/sqlite.js'
import { initSchema }         from './db/schema.js'
import { querySyncFolder }    from '@shared/fs/sync-folder.js'
import { JsonDatabase }       from '../shared/fs/json-database.js'
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
  user:            null,
  syncFolder:      null,
  logoUrl:         null,
  orgProfile:      null,
  currentCompany:  null,
  currentEmployee: null,
  pendingPacket:   null,
  params:          {},
  
  // Heartbeat State
  cloudTimestamps: {},
  isOutofSync:     false
}

window.state = state;

// ---------------------------------------------------------------------------
// Sync Actions
// ---------------------------------------------------------------------------

async function startHeartbeat() {
  if (!state.syncFolder) return;

  setInterval(async () => {
    // Only check if we are already logged in and not already showing a warning
    if (!state.user || state.isOutofSync || state.screen === 'login') return;

    try {
      const newTimestamps = await JsonDatabase.getCloudTimestamps(state.syncFolder);
      let changed = false;

      for (const table of JsonDatabase.tables) {
        if (newTimestamps[table] > (state.cloudTimestamps[table] || 0)) {
          changed = true;
          break;
        }
      }

      if (changed) {
        state.isOutofSync = true;
        showSyncWarning();
      }
    } catch (e) {
      console.warn("Heartbeat: OneDrive busy or disconnected.");
    }
  }, 30000); // Check every 30 seconds
}

function showSyncWarning() {
  if (document.getElementById('sync-warning-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sync-warning-banner';
  banner.style = "background:#d9534f; color:white; padding:12px; text-align:center; position:fixed; top:0; left:0; right:0; z-index:9999; font-weight:bold; display:flex; justify-content:center; align-items:center; gap:20px; box-shadow:0 2px 10px rgba(0,0,0,0.2);";
  banner.innerHTML = `
    <span>⚠️ Another user has updated the database on OneDrive.</span>
    <button id="btn-sync-now" style="padding:6px 15px; cursor:pointer; border-radius:4px; border:none; background:white; color:#d9534f; font-weight:bold;">📥 Refresh Data Now</button>
  `;
  document.body.prepend(banner);

  document.getElementById('btn-sync-now').onclick = async () => {
    if (confirm("This will reload all data from OneDrive. Unsaved changes on your current screen will be lost. Continue?")) {
      state.cloudTimestamps = await JsonDatabase.pullMaster(state.syncFolder, run);
      state.isOutofSync = false;
      banner.remove();
      navigate(state.screen, state.params); // Reload current screen
    }
  };
}

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

const NAV_ITEMS = [
  { screen: 'dashboard',    label: 'Dashboard',     icon: '⊞' },
  { screen: 'companies',    label: 'Companies',     icon: '🏭' },
  { screen: 'employees',    label: 'Employees',     icon: '👷' },
  { screen: 'packets',      label: 'Packets',       icon: '📦' },
  { screen: 'reports',      label: 'Reports',       icon: '📊' },
  { screen: 'users',        label: 'Team',          icon: '👥' },
  { screen: 'data-tools',   label: 'Data Tools',    icon: '🛠️' },
  { screen: 'help',         label: 'Help',          icon: '❓' } // Moved here
  // 'legacy-import' removed from here
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
// Navigation & Guards
// ---------------------------------------------------------------------------

export function navigate(screen, params = {}) {
  if (!state.user && screen !== 'login') {
      state.screen = 'login';
      paint();
      return;
  }

  if (state.user && screen !== 'login') {
    const role = state.user.role;
    if (role === ROLES.TECH) {
        alert("Access Denied: Technicians do not have access to MasterDB.");
        logout();
        return;
    }
    if (role === ROLES.LC) {
        const allowed = PERMISSIONS[ROLES.LC];
        if (!allowed.includes(screen)) {
            alert("Access Denied: Restricted Screen.");
            return;
        }
    }
  }

  state.screen = screen;
  state.params = params;
  Object.assign(state, params);
  paint();
}

function paint() {
  const app = document.getElementById('app')
  const renderFn = SCREENS[state.screen]
  
  if (!renderFn) {
    app.innerHTML = `<div class="error-screen"><h2>Unknown screen: ${state.screen}</h2></div>`
    return
  }

  if (state.screen === 'login') {
    app.innerHTML = ''
    renderFn(app, state, navigate)
    return
  }

  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (state.user?.role === ROLES.ADMIN) return true;
    return PERMISSIONS[state.user?.role]?.includes(item.screen);
  });

  app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar" id="sidebar">
        <div class="sidebar-brand">
           <div class="sidebar-logo-img">${BrandLogo}</div>
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
            <span style="font-size:9px; color:rgba(255,255,255,0.5); text-transform:uppercase;">${state.user?.role}</span>
            <button id="btn-logout" style="background:none; border:none; color:rgba(255,255,255,0.5); font-size:10px; text-align:left; cursor:pointer; padding:0; text-decoration:underline;">Logout</button>
          </div>
          <span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}"
            title="${state.syncFolder ? 'Sync folder connected' : 'No sync folder'}">
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
  await initDB()
  await initSchema()

  state.syncFolder = await querySyncFolder()
  state.logoUrl    = queryOne('SELECT value FROM settings WHERE key = ?', ['company_logo'])?.value ?? null

  const savedUserId = localStorage.getItem('masterdb_user_id');
  if (savedUserId) {
      const user = queryOne("SELECT * FROM users WHERE user_id = ?", [savedUserId]);
      if (user && user.active !== 0) state.user = user;
  }

  const orgKeys = ['org_name','org_address','org_city','org_province','org_postal','org_phone','org_email','org_website']
  state.orgProfile = Object.fromEntries(
    orgKeys.map(k => [k, queryOne('SELECT value FROM settings WHERE key = ?', [k])?.value ?? ''])
  )

  applyTheme(loadThemeColor())
  
  if (state.syncFolder) {
    // Initial Pull to get in sync with other users
    state.cloudTimestamps = await JsonDatabase.pullMaster(state.syncFolder, run);
    startHeartbeat();
  }

  if (!state.user) navigate('login');
  else navigate('dashboard');
}

boot().catch(err => {
  document.getElementById('app').innerHTML = `
    <div class="error-screen"><h2>Startup Error</h2><pre>${err.message}</pre></div>
  `
})

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}