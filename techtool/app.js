import { openDB, getSetting, getAllPackets, savePacket } from './db/idb.js'
import { querySyncFolder }                   from '@shared/fs/sync-folder.js'
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
  user: null, syncFolder: null, logoUrl: null, packets: [], currentPacket: null,
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
    <div class="sidebar-brand">${BrandLogo}</div>
    <ul class="sidebar-nav">
      ${NAV_ITEMS.map(item => `<li><button class="nav-item ${isNavActive(state.screen, item.screen) ? 'nav-item--active' : ''}" data-screen="${item.screen}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></button></li>`).join('')}
    </ul>
    <div class="sidebar-footer">
      <span class="user-name">${state.user?.name ?? 'Tech'}</span>
      <span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}">${state.syncFolder ? '●' : '○'} Sync</span>
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
}

const SCREENS = { 'login': renderLogin, 'dashboard': renderDashboard, 'schedule': renderSchedule, 'calendar': renderCalendar, 'company': renderCompany, 'employee-list': renderEmployeeList, 'test-entry': renderTestEntry, 'sync': renderSync, 'settings': renderSettings, 'help': renderHelp, 'training': renderTraining, 'new-visit': renderNewVisit };
const NAV_ITEMS = [ { screen: 'dashboard', label: 'Dashboard', icon: '⊞' }, { screen: 'schedule', label: 'Packets', icon: '📅' }, { screen: 'settings', label: 'Settings', icon: '⚙' } ];
const NAV_PARENT = { 'company': 'schedule', 'employee-list': 'schedule', 'test-entry': 'schedule', 'new-visit': 'dashboard' };
function isNavActive(current, navScreen) { return current === navScreen || NAV_PARENT[current] === navScreen; }
async function boot() { applyTheme(loadThemeColor()); const techName = await getSetting('tech_name'); if (techName) { state.user = { name: techName, folder_name: await getSetting('tech_folder_name') }; state.packets = await getAllPackets(); state.syncFolder = await querySyncFolder(); navigate('dashboard'); } else { navigate('login'); } }
openDB().then(boot);
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }