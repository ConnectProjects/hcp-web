import { openDB, getSetting, setSetting, removeSetting, getAllPackets, savePacket } from './db/idb.js'
import { querySyncFolder }                   from '@shared/fs/sync-folder.js'
import { JsonDatabase }                      from '@shared/fs/json-database.js'
import { BrandLogo }                         from '@shared/components/brand-logo.js'
import { applyTheme, loadThemeColor }        from './theme.js'
import { renderLogin }          from './screens/login.js'
import { renderDashboard }      from './screens/dashboard.js'
import { renderSchedule }       from './screens/schedule.js'
import { renderCalendar }       from './screens/calendar.js'
import { renderCompany }        from './screens/company.js'
import { renderEmployeeList }   from './screens/employee-list.js'
import { renderTestEntry }      from './screens/test-entry.js'
import { renderSync }           from './screens/sync.js'
import { renderSettings }       from './screens/settings.js'
import { renderHelp }           from './screens/help.js'
import { renderTraining }       from './screens/training.js'
import { renderNewVisit }       from './screens/new-visit.js'

export const state = {
  screen: 'login',
  user: null, syncFolder: null, logoUrl: null, packets: [], companies: [], currentPacket: null,
  activeSlot: 0,
  slots: [
    { screen: 'dashboard', currentEmployee: null, testData: {}, techNotes: '' },
    { screen: 'dashboard', currentEmployee: null, testData: {}, techNotes: '' }
  ]
}

// --- SLOT & DATA PERSISTENCE ---

function saveStateToSlot() {
  const s = state.slots[state.activeSlot];
  if (!s) return;
  s.screen = state.screen;

  // SCRAPE DATA: Find the inputs in the ACTIVE viewport and save them to memory
  const activeViewportId = ['employee-list', 'test-entry'].includes(state.screen) 
    ? `viewport-slot-${state.activeSlot}` 
    : 'viewport-global';
  
  const container = document.getElementById(activeViewportId);
  if (container) {
    const inputs = container.querySelectorAll('.q-input, .audio-input, #tech-notes');
    inputs.forEach(el => {
      if (el.id === 'tech-notes') s.techNotes = el.value;
      else s.testData[el.dataset.id] = el.value;
    });
  }
}

export function switchSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex > 1) return;
  if (state.activeSlot === slotIndex) return;

  saveStateToSlot(); // Save current work
  state.activeSlot = slotIndex;
  
  const targetSlot = state.slots[state.activeSlot];
  if (!targetSlot.currentEmployee && state.currentPacket) {
      targetSlot.screen = 'employee-list';
  }
  
  state.screen = targetSlot.screen;
  paint();
}

export function navigate(screen, params = {}) {
  if (!SCREENS[screen]) return;
  saveStateToSlot();
  state.screen = screen;
  if (params.currentPacket) state.currentPacket = params.currentPacket;
  if (params.currentEmployee) state.slots[state.activeSlot].currentEmployee = params.currentEmployee;
  state.slots[state.activeSlot].screen = screen;
  paint();
}

// --- UI PAINT (Multi-Viewport) ---

function paint() {
  const app = document.getElementById('app');
  const renderFn = SCREENS[state.screen];
  if (!renderFn) return;

  if (state.screen === 'login') {
    app.innerHTML = '';
    renderFn(app, state, navigate);
    return;
  }

  if (!document.querySelector('.app-shell')) {
    app.innerHTML = `
      <div class="app-shell">
        <nav class="sidebar" id="sidebar-target"></nav>
        <div class="main-area">
          <div id="switcher-target"></div>
          <div id="viewport-global" class="viewport"></div>
          <div id="viewport-slot-0" class="viewport hidden"></div>
          <div id="viewport-slot-1" class="viewport hidden"></div>
        </div>
      </div>`;
  }

  // Update Sidebar
  document.getElementById('sidebar-target').innerHTML = `
    <div class="sidebar-brand">
      ${state.logoUrl
        ? `<img src="${state.logoUrl}" class="sidebar-logo-img" alt="Logo" />`
        : `<div class="sidebar-logo-img">${BrandLogo}</div>`
      }
    </div>
    <ul class="sidebar-nav">
      ${NAV_ITEMS.map(item => `<li><button class="nav-item ${isNavActive(state.screen, item.screen) ? 'nav-item--active' : ''}" data-screen="${item.screen}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></button></li>`).join('')}
          <li style="padding:8px 8px 2px">
        <button class="nav-item nav-item--offline ${state.screen === 'new-visit' ? 'nav-item--active' : ''}" id="btn-new-visit">
          <span class="nav-icon">📋</span>
          <span class="nav-label">New Offline Visit</span>
        </button>
      </li>
    </ul>
    <div class="sidebar-footer">
      <span class="user-name">${state.user?.name ?? 'Tech'}</span>
      <span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}">${state.syncFolder ? '●' : '○'} Sync</span>
      <button class="btn-logout" id="btn-logout" title="Log out">⏻ Log Out</button>
    </div>`;

  // Update Switcher
  const switcherTarget = document.getElementById('switcher-target');
  const isClinical = ['employee-list', 'test-entry'].includes(state.screen);
  
  if (isClinical) {
    switcherTarget.innerHTML = `
      <div class="booth-switcher-bar">
        <button class="booth-tab b1 ${state.activeSlot === 0 ? 'active' : ''}" data-slot="0">
          <span class="booth-indicator">1</span>
          <div class="booth-info"><span class="booth-label">LEFT BOOTH</span><span class="booth-name">${state.slots[0].currentEmployee?.last_name ?? 'Empty'}</span></div>
        </button>
        <button class="booth-tab b2 ${state.activeSlot === 1 ? 'active' : ''}" data-slot="1">
          <span class="booth-indicator">2</span>
          <div class="booth-info"><span class="booth-label">RIGHT BOOTH</span><span class="booth-name">${state.slots[1].currentEmployee?.last_name ?? 'Empty'}</span></div>
        </button>
      </div>`;
    switcherTarget.querySelectorAll('.booth-tab').forEach(btn => btn.onclick = () => switchSlot(Number(btn.dataset.slot)));
  } else { switcherTarget.innerHTML = ''; }

  // Viewport Management
  const vGlobal = document.getElementById('viewport-global');
  const vSlot0  = document.getElementById('viewport-slot-0');
  const vSlot1  = document.getElementById('viewport-slot-1');
  [vGlobal, vSlot0, vSlot1].forEach(v => v.classList.add('hidden'));

  let activeViewport = isClinical ? (state.activeSlot === 0 ? vSlot0 : vSlot1) : vGlobal;
  activeViewport.classList.remove('hidden');
  
  renderFn(activeViewport, state, navigate);

  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.onclick = () => {
    if (btn.dataset.screen === 'dashboard') state.currentPacket = null;
    navigate(btn.dataset.screen);
  });
  document.getElementById('btn-new-visit')?.addEventListener('click', () => navigate('new-visit'));
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
}

const SCREENS = { 'login': renderLogin, 'dashboard': renderDashboard, 'schedule': renderSchedule, 'calendar': renderCalendar, 'company': renderCompany, 'employee-list': renderEmployeeList, 'test-entry': renderTestEntry, 'sync': renderSync, 'settings': renderSettings, 'help': renderHelp, 'training': renderTraining, 'new-visit': renderNewVisit };
const NAV_ITEMS = [ { screen: 'dashboard', label: 'Dashboard', icon: '⊞' }, { screen: 'schedule', label: 'Packets', icon: '📅' }, { screen: 'settings', label: 'Settings', icon: '⚙' } ];
const NAV_PARENT = { 'company': 'schedule', 'employee-list': 'schedule', 'test-entry': 'schedule', 'new-visit': 'dashboard' };
function isNavActive(current, navScreen) { return current === navScreen || NAV_PARENT[current] === navScreen; }

async function doLogout() {
  if (!confirm('Log out of TechTool?')) return
  await removeSetting('tech_name')
  await removeSetting('tech_folder_name')
  state.user        = null
  state.syncFolder  = null
  state.packets     = []
  state.companies   = []
  state.currentPacket = null
  state.logoUrl     = null
  state.activeSlot  = 0
  state.slots = [
    { screen: 'dashboard', currentEmployee: null, testData: {}, techNotes: '' },
    { screen: 'dashboard', currentEmployee: null, testData: {}, techNotes: '' }
  ]
  navigate('login')
}

async function boot() {
  applyTheme(loadThemeColor());
  const techName = await getSetting('tech_name');
  if (techName) {
    state.user = { name: techName, folder_name: await getSetting('tech_folder_name') };
    state.packets = await getAllPackets();
    state.syncFolder = await querySyncFolder();

    // Apply branding + pull company directory from sync folder
    if (state.syncFolder) {
      const [branding, directory] = await Promise.all([
        JsonDatabase.pullBranding(state.syncFolder),
        JsonDatabase.pullCompanyDirectory(state.syncFolder)
      ]);
      if (branding?.favicon) {
        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
        link.rel = 'icon';
        link.href = branding.favicon;
        document.head.appendChild(link);
      }
      if (branding?.logo) state.logoUrl = branding.logo;
      if (directory?.length) {
        state.companies = directory;
        await setSetting('company_directory', JSON.stringify(directory));
      }
    }

    // Fall back to cached directory when offline
    if (!state.companies.length) {
      const cached = await getSetting('company_directory');
      if (cached) { try { state.companies = JSON.parse(cached); } catch {} }
    }

    navigate('dashboard');
  } else {
    navigate('login');
  }
}

openDB().then(boot);
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
