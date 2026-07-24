import { renderLogs } from './screens/logs.js'
import { renderDataTools } from './screens/data-tools.js'
import { renderUsers }     from './screens/users.js'
import { renderLogin }     from './screens/login.js'
import { renderTestDetail }from './screens/test-detail.js'
import { initDB, query, queryOne, run, logAction, backupToSyncFolder, exportExcelToSyncFolder, saveToOPFS } from './db/sqlite.js'
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
import { renderIncoming, scanAndImportInbox } from './screens/incoming.js'
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
window._q    = query;
window._r    = run;
window._save = saveToOPFS;

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
    if (role !== ROLES.SUPER_ADMIN && !allowed.includes('*') && !allowed.includes(screen)) {
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
    if (state.user?.role === ROLES.SUPER_ADMIN) return true;
    const p = PERMISSIONS[state.user?.role] || [];
    return p.includes('*') || p.includes(item.screen);
  });

  const pending     = countPendingRows()
  const connected   = !!state.syncFolder
  const syncClass   = connected ? (pending > 0 ? 'folder-pending' : 'folder-ok') : (pending > 0 ? 'folder-pending' : 'folder-none')
  const syncDot     = connected ? '●' : '○'
  const syncBadge   = pending > 0 ? ` <span class="sync-badge">${pending}</span>` : ''

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
          <span class="user-name">${esc(state.user?.name)}</span>
          <span class="user-role-tag">${state.user?.role.toUpperCase()}</span>
          <div id="sync-trigger" class="folder-indicator ${syncClass}">
            ${syncDot} Sync${syncBadge}
          </div>
          <button id="btn-logout" class="btn-logout">⏻ Log Out</button>
        </div>
      </nav>
      <div class="main-area">
        ${!connected ? `
          <div class="pending-sync-banner">
            <span>📂 Sync folder not connected — this browser won't receive updates from other browsers.${pending > 0 ? ` (${pending} local change${pending === 1 ? '' : 's'} also waiting to push.)` : ''} One-time setup per browser.</span>
            <button id="btn-connect-sync">Connect Sync Folder →</button>
          </div>
        ` : ''}
        <div id="main-content" class="main-content"></div>
      </div>
    </div>
  `

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen))
  })

  app.querySelector('#btn-logout').onclick = logout;

  const doConnect = async () => {
    const handle = await getSyncFolder();
    if (handle) {
      state.syncFolder = handle;
      const trigger = document.getElementById('sync-trigger');
      if (trigger) trigger.textContent = '⟳ Syncing…';
      state.cloudTimestamps = await JsonDatabase.syncMaster(state.syncFolder, query, run);
      await JsonDatabase.pushBranding(state.syncFolder, queryOne);
      recordSyncTime();
      startHeartbeat();
      state.isOutofSync = false;
      document.getElementById('sync-warning-banner')?.remove();
      navigate(state.screen, state.params);
    }
    else { const newH = await pickSyncFolder(); if (newH) location.reload(); }
  };
  app.querySelector('#sync-trigger').onclick = doConnect;
  app.querySelector('#btn-connect-sync')?.addEventListener('click', doConnect);

  renderFn(document.getElementById('main-content'), state, navigate)
}

// ---------------------------------------------------------------------------
// Pending-sync tracking
// ---------------------------------------------------------------------------

const MERGE_TABLES = ['companies','locations','employees','tests','baselines','users','packets','hpd_assessments']

function recordSyncTime() {
  try { run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('last_synced_at', datetime('now'))`) } catch {}
}

function countPendingRows() {
  const lastSync = queryOne(`SELECT value FROM settings WHERE key = 'last_synced_at'`)?.value ?? '1970-01-01'
  let total = 0
  for (const t of MERGE_TABLES) {
    try {
      total += queryOne(`SELECT COUNT(*) as n FROM ${t} WHERE updated_at > ?`, [lastSync])?.n ?? 0
    } catch {}
  }
  return total
}

function updateSyncIndicator() {
  const trigger = document.getElementById('sync-trigger')
  if (!trigger) return
  const pending   = countPendingRows()
  const connected = !!state.syncFolder
  trigger.className = `folder-indicator ${connected ? (pending > 0 ? 'folder-pending' : 'folder-ok') : (pending > 0 ? 'folder-pending' : 'folder-none')}`
  trigger.innerHTML = `${connected ? '●' : '○'} Sync${pending > 0 ? ` <span class="sync-badge">${pending}</span>` : ''}`
}

// ---------------------------------------------------------------------------
// System Actions
// ---------------------------------------------------------------------------

export function logout() {
  localStorage.removeItem('masterdb_user_id');
  state.user = null;
  navigate('login');
}

let _heartbeatRunning = false
async function startHeartbeat() {
  if (!state.syncFolder || _heartbeatRunning) return;
  _heartbeatRunning = true;
  setInterval(async () => {
    if (!state.user || state.screen === 'login') return;
    try {
      state.cloudTimestamps = await JsonDatabase.syncMaster(state.syncFolder, query, run);
      await JsonDatabase.pushBranding(state.syncFolder, queryOne);
      await scanAndImportInbox(state.syncFolder);
      recordSyncTime();
      updateSyncIndicator();
    } catch (e) {}
  }, 60000);
}

export function ensureHeartbeat() { startHeartbeat(); }

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

  // Called by the login screen after the user picks the sync folder for the first time.
  state._onSyncConnected = async (handle) => {
    state.syncFolder = handle;
    state.cloudTimestamps = await JsonDatabase.syncMaster(state.syncFolder, query, run);
    await JsonDatabase.pushBranding(state.syncFolder, queryOne);
    try { await scanAndImportInbox(state.syncFolder); } catch {}
    recordSyncTime();
    startHeartbeat();
  };

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
    try { await scanAndImportInbox(state.syncFolder); } catch {}
    recordSyncTime();
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
