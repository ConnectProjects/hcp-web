import { openDB, getSetting, setSetting, removeSetting, getAllPackets } from './db/idb.js'
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

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

export const state = {
  screen:             'login',
  user:               null,       
  syncFolder:         null,       
  logoUrl:            null,       
  packets:            [],         
  currentPacket:      null,       
  activeSlot:         0, 
  slots: [
    { screen: 'dashboard', currentPacket: null, currentEmployee: null, testData: {}, techNotes: '' },
    { screen: 'dashboard', currentPacket: null, currentEmployee: null, testData: {}, techNotes: '' }
  ],
  currentEmployee:    null,
  testData:           {},
  techNotes:          '',
  lastSync:           null,       
  helpReturnScreen:   null,       
  _inPracticeMode:    false
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function logout() {
  if (!confirm("Are you sure you want to logout?")) return;

  // 1. Clear local persistent settings
  await removeSetting('tech_name');
  await removeSetting('tech_initials');
  await removeSetting('tech_folder_name');

  // 2. Clear app state
  state.user = null;
  state.packets = [];
  state.slots.forEach(s => {
    s.currentEmployee = null;
    s.testData = {};
  });

  // 3. Go to login
  navigate('login');
}

// ---------------------------------------------------------------------------
// Screens & Navigation
// ---------------------------------------------------------------------------

const SCREENS = {
  'login':          renderLogin,
  'dashboard':      renderDashboard,
  'schedule':       renderSchedule,
  'calendar':       renderCalendar,
  'company':        renderCompany,
  'employee-list':  renderEmployeeList,
  'test-entry':     renderTestEntry,
  'sync':           renderSync,
  'settings':       renderSettings,
  'help':           renderHelp,
  'training':       renderTraining,
  'new-visit':      renderNewVisit
}

const NAV_ITEMS = [
  { screen: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { screen: 'schedule',  label: 'Packets',   icon: '📅' },
  { screen: 'calendar',  label: 'Calendar',  icon: '🗓' },
  { screen: 'settings',  label: 'Settings',  icon: '⚙'  },
  { screen: 'help',      label: 'Help',      icon: '?'  }
]

const NAV_PARENT = {
  'company':        'schedule',
  'employee-list':  'schedule',
  'test-entry':     'schedule',
  'sync':           'schedule',
  'training':       'settings',
  'new-visit':      'new-visit'
}

function isNavActive(current, navScreen) {
  return current === navScreen || NAV_PARENT[current] === navScreen
}

function saveStateToSlot() {
  const s = state.slots[state.activeSlot]
  s.screen            = state.screen
  s.currentPacket     = state.currentPacket
  s.currentEmployee   = state.currentEmployee
  s.testData          = state.testData
  s.techNotes         = state.techNotes
}

function loadStateFromSlot() {
  const s = state.slots[state.activeSlot]
  state.screen            = s.screen
  state.currentPacket     = s.currentPacket
  state.currentEmployee   = s.currentEmployee
  state.testData          = s.testData
  state.techNotes         = s.techNotes
}

export function switchSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex > 1) return
  if (state.activeSlot === slotIndex) return
  saveStateToSlot()
  state.activeSlot = slotIndex
  loadStateFromSlot()
  paint()
}

export function navigate(screen, params = {}) {
  if (!SCREENS[screen]) return;
  saveStateToSlot()
  if (screen === 'test-entry' && !params.keepData) {
    state.testData = {}; state.techNotes = '';
  }
  state.screen = screen
  Object.assign(state, params)
  saveStateToSlot()
  paint()
}

function paint() {
  const app = document.getElementById('app')
  const renderFn = SCREENS[state.screen]

  if (state.screen === 'login') {
    app.innerHTML = ''
    renderFn(app, state, navigate)
    return
  }

  const techName = state.user?.name ?? 'Tech'
  const contextScreens = ['company', 'employee-list', 'test-entry']
  const showSwitcher = contextScreens.includes(state.screen)

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
          <div style="display:flex; flex-direction:column; gap:4px">
            <span class="user-name">${techName}</span>
            <button id="btn-logout" style="background:none; border:none; color:rgba(255,255,255,0.6); font-size:11px; text-align:left; cursor:pointer; padding:0; text-decoration:underline;">Logout</button>
          </div>
          <span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}">
            ${state.syncFolder ? '●' : '○'} Sync
          </span>
        </div>
      </nav>

      <div class="main-area">
        ${showSwitcher ? `
          <div class="booth-switcher-bar">
            <button class="booth-tab ${state.activeSlot === 0 ? 'active' : ''}" data-slot="0">
              <span class="booth-indicator">1</span>
              <span class="booth-name">${state.slots[0].currentEmployee?.last_name ?? 'Empty'}</span>
            </button>
            <button class="booth-tab ${state.activeSlot === 1 ? 'active' : ''}" data-slot="1">
              <span class="booth-indicator">2</span>
              <span class="booth-name">${state.slots[1].currentEmployee?.last_name ?? 'Empty'}</span>
            </button>
          </div>
        ` : ''}
        <div id="main-content" class="main-content"></div>
      </div>
    </div>
  `

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen))
  })

  app.querySelectorAll('.booth-tab').forEach(btn => {
    btn.addEventListener('click', () => switchSlot(Number(btn.dataset.slot)))
  })

  // NEW: Logout listener
  app.querySelector('#btn-logout').addEventListener('click', logout);

  renderFn(document.getElementById('main-content'), state, navigate)
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  const techName = await getSetting('tech_name')
  const techInitials = await getSetting('tech_initials')
  state.logoUrl = (await getSetting('logo_url')) ?? null
  await loadAndApplyTheme()

  if (techName && techInitials) {
    state.user = { 
      name: techName, 
      initials: techInitials, 
      tech_id: techInitials, 
      folder_name: await getSetting('tech_folder_name') 
    }
    state.packets = await getAllPackets()
    state.syncFolder = await querySyncFolder()
    navigate('dashboard')
  } else {
    navigate('login')
  }
}

openDB().then(boot);

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}