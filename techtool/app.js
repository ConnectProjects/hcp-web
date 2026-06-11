import { TimeService }         from '../../shared/time-utils.js'
import { openDB, getSetting, getAllPackets } from './db/idb.js'
import { querySyncFolder }                   from '@shared/fs/sync-folder.js'
import { BrandLogo }                         from '@shared/components/brand-logo.js'
import { loadAndApplyTheme }                 from './theme.js'
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
  user: null,       
  syncFolder: null,       
  logoUrl: null,       
  packets: [],         
  currentPacket: null,       
  activeSlot: 0, 
  slots: [
    { screen: 'dashboard', currentPacket: null, currentEmployee: null, testData: {}, techNotes: '', scrollPos: 0 },
    { screen: 'dashboard', currentPacket: null, currentEmployee: null, testData: {}, techNotes: '', scrollPos: 0 }
  ],
  currentEmployee: null,
  testData: {},
  techNotes: '',
  lastSync: null,       
  helpReturnScreen: null,       
  _inPracticeMode: false
}

export function switchSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex > 1) return;
  if (state.activeSlot === slotIndex) return;

  saveStateToSlot();
  state.activeSlot = slotIndex;
  loadStateFromSlot();

  // FIX: If switching to an empty booth, go to employee list to pick someone
  if (!state.slots[state.activeSlot].currentEmployee && state.currentPacket) {
      navigate('employee-list');
  } else {
      paint();
  }
}

function saveStateToSlot() {
  const s = state.slots[state.activeSlot];
  s.screen = state.screen;
  s.currentPacket = state.currentPacket;
  s.currentEmployee = state.currentEmployee;
  s.testData = state.testData;
  s.techNotes = state.techNotes;
  // Save the current scroll position
  s.scrollPos = document.querySelector('.main-area')?.scrollTop || 0;
}

function loadStateFromSlot() {
  const s = state.slots[state.activeSlot];
  state.screen = s.screen;
  state.currentPacket = s.currentPacket;
  state.currentEmployee = s.currentEmployee;
  state.testData = s.testData;
  state.techNotes = s.techNotes;

  // Restore the scroll position after the page is painted
  setTimeout(() => {
      const el = document.querySelector('.main-area');
      if (el) el.scrollTop = s.scrollPos || 0;
  }, 0);
}

export function navigate(screen, params = {}) {
  console.log(`🚀 Navigating to: ${screen}`, params);
  
  if (!SCREENS[screen]) return;
  
  // 1. Save whatever is currently happening in the active booth
  saveStateToSlot();

  // 2. Update the main state with the new screen and parameters
  state.screen = screen;
  state.params = params;
  Object.assign(state, params);

  // 3. CRITICAL: If we are going to a test, make sure the active booth slot
  // is immediately updated with the new employee.
  if (screen === 'test-entry' && params.currentEmployee) {
    const slot = state.slots[state.activeSlot];
    slot.currentEmployee = params.currentEmployee;
    slot.currentPacket   = state.currentPacket;
    // Reset data for a fresh test unless 'keepData' is specified
    if (!params.keepData) {
        slot.testData = {};
        slot.techNotes = '';
    }
  }

  // 4. Draw the UI
  paint();
}

// ... rest of paint() and boot() remain the same as your previous working version ...
function paint() {
  const app = document.getElementById('app');
  const renderFn = SCREENS[state.screen];
  if (!renderFn) return;
  if (state.screen === 'login') { app.innerHTML = ''; renderFn(app, state, navigate); return; }
  const techName = state.user?.name ?? 'Tech';
  const contextScreens = ['company', 'employee-list', 'test-entry'];
  const showSwitcher = contextScreens.includes(state.screen);

  app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar" id="sidebar">
        <div class="sidebar-brand">${state.logoUrl ? `<img src="${state.logoUrl}" class="sidebar-logo-img" />` : `<div class="sidebar-logo-img">${BrandLogo}</div>`}</div>
        <ul class="sidebar-nav">
          ${NAV_ITEMS.map(item => `<li><button class="nav-item ${isNavActive(state.screen, item.screen) ? 'nav-item--active' : ''}" data-screen="${item.screen}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></button></li>`).join('')}
        </ul>
        <div class="sidebar-footer"><span class="user-name">${techName}</span><span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}">${state.syncFolder ? '●' : '○'} Sync</span></div>
      </nav>
      <div class="main-area" style="overflow-y: auto;">
        ${showSwitcher ? `<div class="booth-switcher-bar"><button class="booth-tab b1 ${state.activeSlot === 0 ? 'active' : ''}" data-slot="0"><span class="booth-indicator">1</span><div class="booth-info"><span class="booth-label">LEFT BOOTH</span><span class="booth-name">${state.slots[0].currentEmployee?.last_name ?? 'Empty'}</span></div></button><button class="booth-tab b2 ${state.activeSlot === 1 ? 'active' : ''}" data-slot="1"><span class="booth-indicator">2</span><div class="booth-info"><span class="booth-label">RIGHT BOOTH</span><span class="booth-name">${state.slots[1].currentEmployee?.last_name ?? 'Empty'}</span></div></button></div>` : ''}
        <div id="main-content" class="main-content"></div>
      </div>
    </div>`;

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.onclick = () => navigate(btn.dataset.screen));
  app.querySelectorAll('.booth-tab').forEach(btn => btn.onclick = () => switchSlot(Number(btn.dataset.slot)));
  renderFn(document.getElementById('main-content'), state, navigate);
}

const SCREENS = { 'login': renderLogin, 'dashboard': renderDashboard, 'schedule': renderSchedule, 'calendar': renderCalendar, 'company': renderCompany, 'employee-list': renderEmployeeList, 'test-entry': renderTestEntry, 'sync': renderSync, 'settings': renderSettings, 'help': renderHelp, 'training': renderTraining, 'new-visit': renderNewVisit };
const NAV_ITEMS = [ { screen: 'dashboard', label: 'Dashboard', icon: '⊞' }, { screen: 'schedule', label: 'Packets', icon: '📅' }, { screen: 'calendar', label: 'Calendar', icon: '🗓' }, { screen: 'settings', label: 'Settings', icon: '⚙' }, { screen: 'help', label: 'Help', icon: '?' } ];
const NAV_PARENT = { 'company': 'schedule', 'employee-list': 'schedule', 'test-entry': 'schedule', 'sync': 'schedule', 'training': 'settings', 'new-visit': 'new-visit' };
function isNavActive(current, navScreen) { return current === navScreen || NAV_PARENT[current] === navScreen; }
async function boot() { await TimeService.sync(); const techName = await getSetting('tech_name'); const techInitials = await getSetting('tech_initials'); state.logoUrl = (await getSetting('logo_url')) ?? null; await loadAndApplyTheme(); if (techName && techInitials) { state.user = { name: techName, initials: techInitials, tech_id: techInitials, folder_name: await getSetting('tech_folder_name') }; state.packets = await getAllPackets(); state.syncFolder = await querySyncFolder(); navigate('dashboard'); } else { navigate('login'); } }
openDB().then(boot);
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }