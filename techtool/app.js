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

// ---------------------------------------------------------------------------
// App state — single mutable object passed to all screens
// ---------------------------------------------------------------------------

export const state = {
  screen:             'login',
  user:               null,       
  syncFolder:         null,       
  logoUrl:            null,       
  packets:            [],         
  currentPacket:      null,       
  
  // Dual booth support
  activeSlot:         0,          // 0 = Slot A, 1 = Slot B
  slots: [
    {
      screen:             'dashboard',
      currentPacket:      null,
      currentEmployee:    null,
      testData:           {},
      techNotes:          ''
    },
    {
      screen:             'dashboard',
      currentPacket:      null,
      currentEmployee:    null,
      testData:           {},
      techNotes:          ''
    }
  ],

  // Convenience pointers for active slot
  currentEmployee:    null,
  testData:           {},
  techNotes:          '',

  lastSync:           null,       
  helpReturnScreen:   null,       

  // Practice mode
  _inPracticeMode:    false,
  _realPackets:       null,
  _realUser:          null,
  practiceHintsSeen:  {},
  practiceCompleted:  false
}

// ---------------------------------------------------------------------------
// Screen registry (Consolidated to one 'test-entry' screen)
// ---------------------------------------------------------------------------

const SCREENS = {
  'login':          renderLogin,
  'dashboard':      renderDashboard,
  'schedule':       renderSchedule,
  'calendar':       renderCalendar,
  'company':        renderCompany,
  'employee-list':  renderEmployeeList,
  'test-entry':     renderTestEntry, // Consolidated Screen
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

// ---------------------------------------------------------------------------
// Slot Management
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function navigate(screen, params = {}) {
  console.log(`Navigating to: ${screen}`, params);
  
  if (!SCREENS[screen]) {
    console.error('Unknown screen:', screen)
    return
  }
  
  if (screen === 'help') {
    state.helpReturnScreen = state.screen
  }
  
  saveStateToSlot()

  // Reset per-employee state when moving to a new test entry
  if (screen === 'test-entry') {
    state.testData               = {}
    state.techNotes              = ''
    const s = state.slots[state.activeSlot]
    s.testData = {}
    s.techNotes = ''
  }

  state.screen = screen
  Object.assign(state, params)

  saveStateToSlot()
  paint()
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

  const techName = state.user?.name ?? 'Tech'
  const contextScreens = ['company', 'employee-list', 'test-entry']
  const showSwitcher = contextScreens.includes(state.screen)

  app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          ${state.logoUrl
            ? `<img src="${state.logoUrl}" class="sidebar-logo-img" alt="Company logo" />`
            : `<div class="sidebar-logo-img">${BrandLogo}</div>`
          }
        </div>
        
        ${showSwitcher ? `
          <div class="booth-switcher">
            <button class="booth-btn ${state.activeSlot === 0 ? 'booth-btn--active' : ''}" data-slot="0">
              <span class="booth-num">1</span>
              <div class="booth-info">
                <span class="booth-label">Booth 1</span>
                <span class="booth-name">${state.slots[0].currentEmployee?.last_name ?? 'Empty'}</span>
              </div>
            </button>
            <button class="booth-btn ${state.activeSlot === 1 ? 'booth-btn--active' : ''}" data-slot="1">
              <span class="booth-num">2</span>
              <div class="booth-info">
                <span class="booth-label">Booth 2</span>
                <span class="booth-name">${state.slots[1].currentEmployee?.last_name ?? 'Empty'}</span>
              </div>
            </button>
          </div>
        ` : ''}

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
          <li style="padding:8px 8px 2px">
            <button class="nav-item nav-item--offline ${state.screen === 'new-visit' ? 'nav-item--active' : ''}"
              id="btn-new-visit">
              <span class="nav-icon">📋</span>
              <span class="nav-label">New Offline Visit</span>
            </button>
          </li>
        </ul>
        <div class="sidebar-footer">
          <span class="user-name">${techName}</span>
          ${state._inPracticeMode
            ? `<span class="folder-indicator" style="color:#7dd3fc">🎓 Practice</span>`
            : `<span class="folder-indicator ${state.syncFolder ? 'folder-ok' : 'folder-none'}"
                title="${state.syncFolder ? 'Sync folder connected' : 'No sync folder — go to Settings'}">
                ${state.syncFolder ? '●' : '○'} Sync
              </span>`
          }
        </div>
      </nav>
      <div class="main-area">
        <div id="main-content" class="main-content"></div>
      </div>
    </div>
  `

  app.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (state._inPracticeMode && !['settings','help'].includes(btn.dataset.screen)) {
        if (!confirm('Exit practice mode? Your progress will be lost.')) return
        const { exitPracticeMode } = await import('./screens/practice-overlay.js')
        exitPracticeMode(state, navigate)
        return
      }
      navigate(btn.dataset.screen)
    })
  })

  app.querySelector('#btn-new-visit')?.addEventListener('click', () => navigate('new-visit'))

  app.querySelectorAll('.booth-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchSlot(Number(btn.dataset.slot))
    })
  })

  renderFn(document.getElementById('main-content'), state, navigate)
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  const techName       = await getSetting('tech_name')
  const techInitials   = await getSetting('tech_initials')
  const techFolderName = await getSetting('tech_folder_name')
  const techIatNumber  = await getSetting('tech_iat_number')

  state.logoUrl = (await getSetting('logo_url')) ?? null
  await loadAndApplyTheme()

  if (techName && techInitials) {
    state.user = {
      name:        techName,
      initials:    techInitials,
      tech_id:     techInitials,
      folder_name: techFolderName ?? null,
      iat_number:  techIatNumber  ?? null
    }
    state.packets    = await getAllPackets()
    state.syncFolder = await querySyncFolder()
    navigate('dashboard')
  } else {
    navigate('login')
  }
}

function setBootMsg(msg) {
  const el = document.getElementById('boot-msg')
  if (el) el.textContent = msg
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e =>
    console.warn('SW registration failed:', e)
  )
}

openDB().then(boot).catch(err => {
  document.getElementById('app').innerHTML = `
    <div class="error-screen">
      <h2>Startup Error</h2>
      <p>TechTool could not initialize.</p>
      <pre>${err.message}</pre>
    </div>
  `
})

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}