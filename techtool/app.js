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

function saveStateToSlot() {
  const s = state.slots[state.activeSlot];
  if (!s) return;
  s.screen = state.screen;
  s.currentPacket = state.currentPacket;
  s.currentEmployee = state.currentEmployee;
  s.testData = { ...state.testData };
  s.techNotes = state.techNotes;
  s.scrollPos = document.querySelector('.main-area')?.scrollTop || 0;
}

function loadStateFromSlot() {
  const s = state.slots[state.activeSlot];
  if (!s) return;
  state.screen = s.screen;
  state.currentPacket = s.currentPacket;
  state.currentEmployee = s.currentEmployee;
  state.testData = { ...s.testData };
  state.techNotes = s.techNotes;
  setTimeout(() => {
    const el = document.querySelector('.main-area');
    if (el) el.scrollTop = s.scrollPos || 0;
  }, 0);
}

export function switchSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex > 1) return;
  saveStateToSlot();
  state.activeSlot = slotIndex;
  loadStateFromSlot();

  // If booth is empty, take user to the list to pick someone
  if (!state.slots[state.activeSlot].currentEmployee && state.currentPacket) {
    navigate('employee-list');
  } else {
    paint();
  }
}

export function navigate(screen, params = {}) {
  if (!SCREENS[screen]) return;
  saveStateToSlot();
  state.screen = screen;
  Object.assign(state, params);
  saveStateToSlot();
  paint();
}

function paint() {
  const app = document.getElementById('app');
  const renderFn = SCREENS[state.screen];
  if (!renderFn) return;
  if (state.screen === 'login') { app.innerHTML = ''; renderFn(app, state, navigate); return; }

  const showSwitcher = ['company', 'employee-list', 'test-entry'].includes(state.screen);

  app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-brand">${BrandLogo}</div>
        <ul class="sidebar-nav">
          ${NAV_ITEMS.map(item => `<li><button class="nav-item ${isNavActive(state.screen, item.screen) ? 'nav-item--active' : ''}" data-screen="${item.screen}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></button></li>`).join('')}
        </ul>
      </nav>
      <div class="main-area" style="overflow-y: auto; height: 100vh;">
        ${showSwitcher ? `
          <div class="booth-switcher-bar" style="position:sticky; top:0; z-index:100; display:flex; width:100%; background:white; padding:10px; gap:10px; border-bottom:1px solid #eee;">
            <button class="booth-tab b1 ${state.activeSlot === 0 ? 'active' : ''}" data-slot="0" style="flex:1; display:flex; align-items:center; padding:10px; border-radius:8px; border:1px solid #ddd; cursor:pointer;">
              <span class="booth-indicator">1</span> <div style="margin-left:10px"><b>LEFT BOOTH</b><br><small>${state.slots[0].currentEmployee?.last_name ?? 'Empty'}</small></div>
            </button>
            <button class="booth-tab b2 ${state.activeSlot === 1 ? 'active' : ''}" data-slot="1" style="flex:1; display:flex; align-items:center; padding:10px; border-radius:8px; border:1px solid #ddd; cursor:pointer;">
              <span class="booth-indicator">2</span> <div style="margin-left:10px"><b>RIGHT BOOTH</b><br><small>${state.slots[1].currentEmployee?.last_name ?? 'Empty'}</small></div>
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