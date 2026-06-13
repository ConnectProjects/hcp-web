import { openDB, getSetting, getAllPackets } from './db/idb.js'
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
    { screen: 'dashboard', currentPacket: null, currentEmployee: null, testData: {}, techNotes: '', scrollPos: 0 },
    { screen: 'dashboard', currentPacket: null, currentEmployee: null, testData: {}, techNotes: '', scrollPos: 0 }
  ]
}

// --- SLOT PERSISTENCE ENGINE ---

function saveStateToSlot() {
  const s = state.slots[state.activeSlot];
  if (!s) return;

  s.screen = state.screen;

  // 1. Scrape live data from the current form
  const inputs = document.querySelectorAll('.q-input, .audio-input, #tech-notes');
  inputs.forEach(el => {
    if (el.id === 'tech-notes') s.techNotes = el.value;
    else if (el.classList.contains('q-input')) s.testData[el.dataset.id] = el.value;
    else if (el.classList.contains('audio-input')) {
      s.testData[(el.dataset.ear === 'L' ? 'l' : 'r') + el.dataset.freq] = el.value;
    }
  });

  // 2. Capture Scroll Position of the .main-area
  const mainArea = document.querySelector('.main-area');
  if (mainArea) {
    s.scrollPos = mainArea.scrollTop;
  }
}

function loadStateFromSlot() {
  const s = state.slots[state.activeSlot];
  state.screen = s.screen;
  state.currentEmployee = s.currentEmployee;

  // Render the page
  paint();

  // 3. Restore Scroll Position
  // We use requestAnimationFrame to wait for the browser to finish the "Paint"
  requestAnimationFrame(() => {
    const mainArea = document.querySelector('.main-area');
    if (mainArea) {
        mainArea.scrollTop = s.scrollPos || 0;
    }
  });
}

export function switchSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex > 1) return;
  if (state.activeSlot === slotIndex) return;

  saveStateToSlot(); 
  state.activeSlot = slotIndex;
  
  const targetSlot = state.slots[state.activeSlot];
  if (!targetSlot.currentEmployee && state.currentPacket) {
      targetSlot.screen = 'employee-list';
  }
  
  loadStateFromSlot();
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

// --- UI PAINT ---

function paint() {
  const app = document.getElementById('app');
  const renderFn = SCREENS[state.screen];
  if (!renderFn) return;
  if (state.screen === 'login') { app.innerHTML = ''; renderFn(app, state, navigate); return; }

  const showSwitcher = ['employee-list', 'test-entry'].includes(state.screen);

  app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-brand">${state.logoUrl ? `<img src="${state.logoUrl}" class="sidebar-logo-img" />` : `<div class="sidebar-logo-img">${BrandLogo}</div>`}</div>
        <ul class="sidebar-nav">
          ${NAV_ITEMS.map(item => `<li><button class="nav-item ${isNavActive(state.screen, item.screen) ? 'nav-item--active' : ''}" data-screen="${item.screen}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></button></li>`).join('')}
        </ul>
      </nav>
      <!-- Ensure .main-area is the scrollable container -->
      <div class="main-area" id="main-scroll-container">
        ${showSwitcher ? `
          <div class="booth-switcher-bar">
            <button class="booth-tab b1 ${state.activeSlot === 0 ? 'active' : ''}" data-slot="0">
              <span class="booth-indicator">1</span>
              <div class="booth-info"><span class="booth-label">LEFT BOOTH</span><span class="booth-name">${state.slots[0].currentEmployee?.last_name ?? 'Empty'}</span></div>
            </button>
            <button class="booth-tab b2 ${state.activeSlot === 1 ? 'active' : ''}" data-slot="1">
              <span class="booth-indicator">2</span>
              <div class="booth-info"><span class="booth-label">RIGHT BOOTH</span><span class="booth-name">${state.slots[1].currentEmployee?.last_name ?? 'Empty'}</span></div>
            </button>
          </div>` : ''}
        <div id="main-content" class="main-content"></div>
      </div>
    </div>`;

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.onclick = () => navigate(btn.dataset.screen));
  app.querySelectorAll('.booth-tab').forEach(btn => btn.onclick = () => switchSlot(Number(btn.dataset.slot)));
  renderFn(document.getElementById('main-content'), state, navigate);
}

const SCREENS = { 'login': renderLogin, 'dashboard': renderDashboard, 'schedule': renderSchedule, 'calendar': renderCalendar, 'company': renderCompany, 'employee-list': renderEmployeeList, 'test-entry': renderTestEntry, 'sync': renderSync, 'settings': renderSettings, 'help': renderHelp, 'training': renderTraining, 'new-visit': renderNewVisit };
const NAV_ITEMS = [ { screen: 'dashboard', label: 'Dashboard', icon: '⊞' }, { screen: 'schedule', label: 'Packets', icon: '📅' }, { screen: 'settings', label: 'Settings', icon: '⚙' } ];
const NAV_PARENT = { 'company': 'schedule', 'employee-list': 'schedule', 'test-entry': 'schedule', 'new-visit': 'dashboard' };
function isNavActive(current, navScreen) { return current === navScreen || NAV_PARENT[current] === navScreen; }
async function boot() { applyTheme(loadThemeColor()); const techName = await getSetting('tech_name'); if (techName) { state.user = { name: techName, folder_name: await getSetting('tech_folder_name') }; state.packets = await getAllPackets(); state.syncFolder = await querySyncFolder(); navigate('dashboard'); } else { navigate('login'); } }
openDB().then(boot);
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }