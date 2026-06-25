import { renderLogs } from './screens/logs.js'
import { renderDataTools } from './screens/data-tools.js'
import { renderUsers }     from './screens/users.js'
import { renderLogin }     from './screens/login.js'
import { renderTestDetail }from './screens/test-detail.js'
import { initDB, query, queryOne, run, logAction, backupToSyncFolder, exportExcelToSyncFolder } from './db/sqlite.js'
import { initSchema }         from './db/schema.js'
import { getSyncFolder, querySyncFolder, pickSyncFolder } from '@shared/fs/sync-folder.js'
import { JsonDatabase }       from '@shared/fs/json-database.js'
import { TimeService }        from '../shared/time-utils.js'
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
// App state
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
  cloudTimestamps: {},
  isOutofSync:     false
}

window.state = state;

// ---------------------------------------------------------------------------
// Navigation & Guard
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
        alert("Access Denied: Technicians restricted to TechTool.");
        logout();
        return;
    }
    const allowed = PERMISSIONS[role] || [];
    if (role !== ROLES.SUPER_ADMIN && role !== ROLES.ADMIN && !allowed.includes('*') && !allowed.includes(screen)) {
        alert("Access Denied.");
        return;
    }
  }

  state.screen = screen;
  state.params = params;
  Object.assign(state, params);
  
  if (state.user) {
    logAction(state, "NAVIGATE", `Viewed ${screen}`);
  }

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
    if (state.user?.role === ROLES.SUPER_ADMIN || state.user?.role === ROLES.ADMIN) return true;
    const p = PERMISSIONS[state.user?.role] || [];
return p.includes('*') || p.includes(item.screen);
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
            <span class="user-role-tag">${state.user?.role.toUpperCase()}</span>
            <button id="btn-logout" class="logout-link">Logout</button>
          </div>
          <div id="sync-trigger" class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}">
            ${state.syncFolder ? '●' : '○'} Sync
          </div>
        </div>
      </nav>
      <div class="main-area">
        <div id="main-content" class="main-content"></div>
      </div>
    </div>
  `

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen))
  })

  app.querySelector('#btn-logout').onclick = logout;

  app.querySelector('#sync-trigger').onclick = async () => {
    const handle = await getSyncFolder();
    if (handle) {
      state.syncFolder = handle;
      const trigger = document.getElementById('sync-trigger');
      if (trigger) trigger.textContent = '⟳ Syncing…';
      state.cloudTimestamps = await JsonDatabase.syncMaster(state.syncFolder, query, run);
      await JsonDatabase.pushBranding(state.syncFolder, queryOne);
      state.isOutofSync = false;
      document.getElementById('sync-warning-banner')?.remove();
      navigate(state.screen, state.params);
    }
    else { const newH = await pickSyncFolder(); if (newH) location.reload(); }
  };

  renderFn(document.getElementById('main-content'), state, navigate)
}

// ---------------------------------------------------------------------------
// System Actions
// ---------------------------------------------------------------------------

export function logout() {
  localStorage.removeItem('masterdb_user_id');
  state.user = null;
  navigate('login');
}

async function startHeartbeat() {
  if (!state.syncFolder) return;
  setInterval(async () => {
    if (!state.user || state.screen === 'login') return;
    try {
      state.cloudTimestamps = await JsonDatabase.syncMaster(state.syncFolder, query, run);
      await JsonDatabase.pushBranding(state.syncFolder, queryOne);
    } catch (e) {}
  }, 60000);
}

function showSyncWarning() {
  if (document.getElementById('sync-warning-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'sync-warning-banner';
  banner.className = 'sync-alert-banner';
  banner.innerHTML = `<span>⚠️ Database updated by another user.</span><button id="btn-sync-now">Refresh Now</button>`;
  document.body.prepend(banner);
  document.getElementById('btn-sync-now').onclick = () => location.reload();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  await TimeService.sync();
  await initDB();
  await initSchema();

  state.syncFolder = await querySyncFolder();
  state.logoUrl    = queryOne('SELECT value FROM settings WHERE key = ?', ['company_logo'])?.value ?? null;

  // FAVICON BOOT LOGIC
  const customFavicon = queryOne('SELECT value FROM settings WHERE key = ?', ['company_favicon'])?.value;
  if (customFavicon) {
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = customFavicon;
    document.head.appendChild(link);
  }

  const savedUserId = localStorage.getItem('masterdb_user_id');
  if (savedUserId) {
      const user = queryOne("SELECT * FROM users WHERE user_id = ?", [savedUserId]);
      if (user && user.active !== 0) state.user = user;
  }

  const orgKeys = ['org_name','org_phone','org_email']
  state.orgProfile = Object.fromEntries(
    orgKeys.map(k => [k, queryOne('SELECT value FROM settings WHERE key = ?', [k])?.value ?? ''])
  );

  applyTheme(loadThemeColor());
  
  if (state.syncFolder) {
    state.cloudTimestamps = await JsonDatabase.syncMaster(state.syncFolder, query, run);
    await JsonDatabase.pushBranding(state.syncFolder, queryOne);
    startHeartbeat();
  }

  if (!state.user) navigate('login');
  else navigate('dashboard');
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SCREENS = {
  login: renderLogin, dashboard: renderDashboard, companies: renderCompanies,
  'company-detail': renderCompanyDetail, 'location-detail': renderLocationDetail,
  employees: renderEmployees, 'employee-detail': renderEmployeeDetail,
  'test-detail': renderTestDetail, packets: renderPackets,
  incoming: renderIncoming, 'import-confirm': renderImportConfirm,
  reports: renderReports, settings: renderSettings,
  users: renderUsers, logs: renderLogs, 'data-tools': renderDataTools,
  'legacy-import': renderLegacyImport, help: renderHelp,
  'generate-packet': renderGeneratePacket, 'rejected-packets': renderRejectedPackets,
  'province-rules': renderProvinceRules,
};

const NAV_ITEMS = [
  { screen: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { screen: 'companies', label: 'Companies', icon: '🏭' },
  { screen: 'employees', label: 'Employees', icon: '👷' },
  { screen: 'packets',   label: 'Packets',   icon: '📦' },
  { screen: 'reports',   label: 'Reports',   icon: '📊' },
  { screen: 'users',     label: 'Team',      icon: '👥' },
  { screen: 'settings',  label: 'Settings',  icon: '⚙️' },
  { screen: 'data-tools',label: 'Data Tools',icon: '🛠️' },
  { screen: 'logs',      label: 'Logs',      icon: '📜' },
  { screen: 'help',      label: 'Help',      icon: '❓' }
];

const NAV_PARENT = {
  'company-detail': 'companies', 'location-detail': 'companies',
  'employee-detail': 'employees', 'test-detail': 'employees',
  'incoming': 'packets', 'legacy-import': 'data-tools',
  'import-confirm': 'packets', 'generate-packet': 'packets',
  'rejected-packets': 'packets', 'province-rules': 'settings'
};

function isNavActive(current, navScreen) { return current === navScreen || NAV_PARENT[current] === navScreen; }

boot().catch(err => {
  document.getElementById('app').innerHTML = `<div class="error-screen"><h2>Startup Error</h2><pre>${err.message}</pre></div>`;
});

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
