import { getSetting } from '../db/idb.js'

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cachedEvents = null
let cacheUrl     = null

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function renderCalendar(container, state, navigate) {
  const icalUrl = await getSetting('ical_url')

  // Anchor to start of current week (Monday)
  if (!state.calWeekStart) {
    state.calWeekStart = getWeekStart(new Date())
  }

  if (!icalUrl) {
    renderNoUrl(container, navigate)
    return
  }

  renderShell(container, state, navigate, icalUrl)

  if (cachedEvents && cacheUrl === icalUrl) {
    renderWeek(container, state)
  } else {
    fetchAndRender(container, state, icalUrl)
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function renderShell(container, state, navigate, icalUrl) {
  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <div class="cal-week-header">
          <div class="cal-nav-row">
            <button class="btn btn-ghost btn-sm" id="cal-prev">‹</button>
            <button class="btn btn-outline btn-sm" id="cal-today">This Week</button>
            <button class="btn btn-ghost btn-sm" id="cal-next">›</button>
          </div>
          <span class="cal-week-label" id="cal-week-label"></span>
          <button class="btn btn-ghost btn-sm" id="cal-refresh" title="Refresh calendar">⟳</button>
        </div>
      </header>

      <div id="cal-status" class="alert hidden" style="margin:8px 16px 0"></div>

      <div class="cal-week-wrap" id="cal-week-wrap">
        <div class="cal-loading">Loading calendar…</div>
      </div>

      <div id="cal-event-modal" class="cal-event-modal hidden"></div>
    </div>
  `

  updateWeekLabel(container, state)

  container.querySelector('#cal-prev').addEventListener('click', () => {
    state.calWeekStart = addDays(state.calWeekStart, -7)
    updateWeekLabel(container, state)
    renderWeek(container, state)
  })

  container.querySelector('#cal-next').addEventListener('click', () => {
    state.calWeekStart = addDays(state.calWeekStart, 7)
    updateWeekLabel(container, state)
    renderWeek(container, state)
  })

  container.querySelector('#cal-today').addEventListener('click', () => {
    state.calWeekStart = getWeekStart(new Date())
    updateWeekLabel(container, state)
    renderWeek(container, state)
  })

  container.querySelector('#cal-refresh').addEventListener('click', () => {
    cachedEvents = null
    cacheUrl     = null
    fetchAndRender(container, state, icalUrl)
  })
}

function updateWeekLabel(container, state) {
  const start = state.calWeekStart
  const end   = addDays(start, 6)
  const opts  = { month: 'short', day: 'numeric' }
  const label = start.getMonth() === end.getMonth()
    ? `${start.toLocaleDateString('en-CA', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
    : `${start.toLocaleDateString('en-CA', opts)} – ${end.toLocaleDateString('en-CA', opts)}, ${end.getFullYear()}`
  const el = container.querySelector('#cal-week-label')
  if (el) el.textContent = label
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

// Proxy chain — tried in order until one returns valid iCal
const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
]

async function fetchIcalText(rawUrl) {
  const url = rawUrl.replace(/^webcals?:\/\//i, 'https://')

  // Try direct first
  try {
    const res = await fetch(url)
    if (res.ok) {
      const text = await res.text()
      if (text.includes('BEGIN:VCALENDAR')) return text
    }
  } catch { /* CORS — fall through */ }

  // Try each proxy
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url))
      if (!res.ok) continue
      const text = await res.text()
      if (text.includes('BEGIN:VCALENDAR')) return text
    } catch { /* try next */ }
  }
  throw new Error('Calendar could not be loaded. Check that the iCal URL is correct and publicly accessible.')
}

async function fetchAndRender(container, state, url) {
  const statusEl = container.querySelector('#cal-status')
  showStatus(statusEl, 'info', 'Fetching calendar…')
  try {
    const text   = await fetchIcalText(url)
    cachedEvents = parseIcal(text)
    cacheUrl     = url
    hideStatus(statusEl)
    renderWeek(container, state)
  } catch (e) {
    showStatus(statusEl, 'error', `Could not load calendar: ${e.message}`)
    container.querySelector('#cal-week-wrap').innerHTML =
      '<div class="cal-loading" style="color:var(--red)">Failed to load events.</div>'
  }
}

// ---------------------------------------------------------------------------
// Week renderer
// ---------------------------------------------------------------------------

const TIMELINE_HOURS = 18   // window height in hours
const MIN_BEFORE     = 30   // minutes before first event

function renderWeek(container, state) {
  const wrap   = container.querySelector('#cal-week-wrap')
  if (!wrap) return
  const events = cachedEvents ?? []
  const week   = Array.from({ length: 7 }, (_, i) => addDays(state.calWeekStart, i))
  const today  = new Date()

  // Collect this week's events
  const weekEvents = week.map(day =>
    events.filter(e => e.start && isSameDay(e.start, day))
  )

  // Find the earliest timed event this week to anchor the window
  let windowStart = null
  for (const dayEvts of weekEvents) {
    for (const e of dayEvts) {
      if (!e.allDay && e.start) {
        const mins = e.start.getHours() * 60 + e.start.getMinutes()
        if (windowStart === null || mins < windowStart) windowStart = mins
      }
    }
  }

  // Default to 7:00 if no timed events; subtract MIN_BEFORE and snap to 30-min boundary
  if (windowStart === null) windowStart = 7 * 60
  windowStart = Math.max(0, Math.floor((windowStart - MIN_BEFORE) / 30) * 30)
  const windowEnd = windowStart + TIMELINE_HOURS * 60  // in minutes from midnight

  // Build hour labels (every 60 mins)
  const hourLabels = []
  for (let m = windowStart; m <= windowEnd; m += 60) {
    hourLabels.push(m)
  }

  const PX_PER_MIN = 1.8   // pixels per minute — controls total height

  // All-day events per day
  const allDayRows = week.map(day =>
    events.filter(e => e.allDay && isSameDay(e.start, day))
  )
  const hasAllDay = allDayRows.some(r => r.length > 0)

  wrap.innerHTML = `
    <div class="cal-week-grid">

      <!-- Day header row -->
      <div class="cal-week-day-headers">
        <div class="cal-time-gutter"></div>
        ${week.map((day, i) => {
          const isToday = isSameDay(day, today)
          return `<div class="cal-week-day-header ${isToday ? 'cal-week-day-header--today' : ''}">
            <span class="cal-dow-short">${day.toLocaleDateString('en-CA', { weekday: 'short' })}</span>
            <span class="cal-dom ${isToday ? 'cal-dom--today' : ''}">${day.getDate()}</span>
          </div>`
        }).join('')}
      </div>

      <!-- All-day banner (only if any all-day events) -->
      ${hasAllDay ? `
        <div class="cal-allday-row">
          <div class="cal-time-gutter cal-time-gutter--allday">all-day</div>
          ${week.map((day, i) => `
            <div class="cal-allday-cell">
              ${allDayRows[i].map(e => `
                <div class="cal-allday-pill" data-cat="${categorize(e.summary ?? '')}"
                  data-uid="${esc(e.uid ?? e.summary ?? '')}" title="${esc(e.summary ?? '')}">
                  ${esc(pillLabel(e))}
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Scrollable time grid -->
      <div class="cal-timegrid-scroll">
        <div class="cal-timegrid" style="height:${TIMELINE_HOURS * 60 * PX_PER_MIN}px">

          <!-- Hour lines + labels -->
          <div class="cal-time-gutter cal-time-gutter--times">
            ${hourLabels.map(m => `
              <div class="cal-hour-label" style="top:${(m - windowStart) * PX_PER_MIN}px">
                ${formatHour(m)}
              </div>
            `).join('')}
          </div>

          <!-- Hour lines across grid -->
          <div class="cal-hour-lines">
            ${hourLabels.map(m => `
              <div class="cal-hour-line" style="top:${(m - windowStart) * PX_PER_MIN}px"></div>
            `).join('')}
            <!-- Half-hour lines -->
            ${hourLabels.slice(0, -1).map(m => `
              <div class="cal-hour-line cal-hour-line--half" style="top:${(m - windowStart + 30) * PX_PER_MIN}px"></div>
            `).join('')}
          </div>

          <!-- Day columns -->
          <div class="cal-day-columns">
            ${week.map((day, i) => {
              const isToday = isSameDay(day, today)
              const timedEvts = weekEvents[i].filter(e => !e.allDay)

              const blocks = timedEvts.map(e => {
                const startMin = e.start.getHours() * 60 + e.start.getMinutes()
                const endMin   = e.end
                  ? e.end.getHours() * 60 + e.end.getMinutes()
                  : startMin + 60   // default 1 hour if no end
                const clampedStart = Math.max(startMin, windowStart)
                const clampedEnd   = Math.min(endMin,   windowEnd)
                if (clampedEnd <= clampedStart) return ''  // outside window

                const top    = (clampedStart - windowStart) * PX_PER_MIN
                const height = Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 20)
                const durationMins = clampedEnd - clampedStart
                const cat    = categorize(e.summary ?? '')
                const label  = pillLabel(e)
                const short  = durationMins < 45

                return `<div class="cal-event-block ${short ? 'cal-event-block--short' : ''}"
                  data-cat="${cat}"
                  data-uid="${esc(e.uid ?? e.summary ?? '')}"
                  style="top:${top}px;height:${height}px"
                  title="${esc(e.summary ?? '')}">
                  ${short
                    ? `<span class="cal-block-title-short">${esc(shortLabel(e))}</span>`
                    : `<span class="cal-block-title">${esc(label)}</span>
                       ${durationMins >= 60 ? `<span class="cal-block-time">${formatHour(startMin)}${e.end ? ' – ' + formatHour(endMin) : ''}</span>` : ''}`
                  }
                </div>`
              }).join('')

              return `<div class="cal-day-col ${isToday ? 'cal-day-col--today' : ''}"
                data-day="${i}">
                ${blocks}
              </div>`
            }).join('')}
          </div>

          <!-- Now indicator -->
          ${isSameWeek(today, state.calWeekStart) ? (() => {
            const nowMin = today.getHours() * 60 + today.getMinutes()
            if (nowMin < windowStart || nowMin > windowEnd) return ''
            const top = (nowMin - windowStart) * PX_PER_MIN
            const dayIndex = ((today.getDay() + 6) % 7)  // Mon=0
            return `<div class="cal-now-line" style="top:${top}px;left:calc(var(--gutter-w) + ${dayIndex} * (100% - var(--gutter-w)) / 7)"></div>`
          })() : ''}

        </div>
      </div>
    </div>
  `

  // Wire event block clicks
  wrap.querySelectorAll('.cal-event-block, .cal-allday-pill').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      const uid = el.dataset.uid
      const evt = events.find(ev => (ev.uid ?? ev.summary ?? '') === uid)
      if (evt) showEventModal(container, evt)
    })
  })
}

// ---------------------------------------------------------------------------
// Event modal
// ---------------------------------------------------------------------------

function showEventModal(container, evt) {
  const modal = container.querySelector('#cal-event-modal')
  if (!modal) return

  const dateStr = evt.start
    ? evt.start.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const timeStr = (!evt.allDay && evt.start && evt.start.getHours() !== 0)
    ? formatHour(evt.start.getHours() * 60 + evt.start.getMinutes()) +
      (evt.end ? ' – ' + formatHour(evt.end.getHours() * 60 + evt.end.getMinutes()) : '')
    : ''

  const cat   = categorize(evt.summary ?? '')
  const label = pillLabel(evt)

  // Clean up description — remove the first line (it's the label) and strip trailing dashes
  const descLines = (evt.description ?? '').split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== '--' && l !== '-')
  // Remove first line if it matches the pill label
  if (descLines[0] && pillLabel(evt) && descLines[0].startsWith(pillLabel(evt).slice(0, 10))) {
    descLines.shift()
  }
  const desc = descLines.join('\n').trim()

  modal.innerHTML = `
    <div class="cal-modal-backdrop"></div>
    <div class="cal-modal-card" data-cat="${cat}">
      <div class="cal-modal-header">
        <div class="cal-modal-title">${esc(label)}</div>
        <button class="btn btn-ghost btn-sm cal-modal-close">✕</button>
      </div>
      <div class="cal-modal-date">
        <span>📅</span> ${esc(dateStr)}${timeStr ? ` · ${esc(timeStr)}` : ''}
      </div>
      ${evt.location ? `<div class="cal-modal-loc"><span>📍</span> ${esc(evt.location)}</div>` : ''}
      ${desc ? `<div class="cal-modal-desc">${esc(desc)}</div>` : ''}
    </div>
  `
  modal.classList.remove('hidden')

  modal.querySelector('.cal-modal-close').addEventListener('click', e => {
    e.stopPropagation()
    modal.classList.add('hidden')
  })
  modal.querySelector('.cal-modal-backdrop').addEventListener('click', () => {
    modal.classList.add('hidden')
  })
}

// ---------------------------------------------------------------------------
// No URL state
// ---------------------------------------------------------------------------

function renderNoUrl(container, navigate) {
  container.innerHTML = `
    <div class="screen">
      <header class="app-header"><h1 class="app-title">Calendar</h1></header>
      <main class="screen-body">
        <div class="empty-state" style="padding-top:60px">
          <div style="font-size:40px;margin-bottom:12px">🗓</div>
          <p>No calendar URL configured.</p>
          <p style="font-size:13px;margin-top:6px;margin-bottom:20px">
            Add a public iCal (.ics) URL in Settings to subscribe to your schedule.
          </p>
          <button class="btn btn-primary" id="btn-go-settings">Go to Settings →</button>
        </div>
      </main>
    </div>
  `
  container.querySelector('#btn-go-settings').addEventListener('click', () => navigate('settings'))
}

// ---------------------------------------------------------------------------
// iCal parser
// ---------------------------------------------------------------------------

function parseIcal(raw) {
  const text  = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '')
  const lines = text.split('\n')
  const events = []
  let cur = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.start) {
        cur.allDay = !!(cur._dtstart && cur._dtstart.length === 8)
        events.push(cur)
      }
      cur = null
      continue
    }
    if (!cur) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue
    const rawKey = line.slice(0, colon)
    const val    = line.slice(colon + 1).trim()
    const key    = rawKey.split(';')[0]

    switch (key) {
      case 'SUMMARY':     cur.summary     = icalText(val); break
      case 'DESCRIPTION': cur.description = icalText(val); break
      case 'LOCATION':    cur.location    = icalText(val); break
      case 'UID':         cur.uid         = val;           break
      case 'DTSTART':
        cur._dtstart = val.replace(/[TZ:-]/g, '').slice(0, 15)
        cur.start    = icalDate(val)
        break
      case 'DTEND':
        cur.end = icalDate(val)
        break
    }
  }

  return events
    .filter(e => e.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

function icalDate(val) {
  const isUTC = val.endsWith('Z')
  const v = val.replace('Z', '').replace(/-/g, '').replace(/:/g, '')
  if (v.length < 8) return null
  const yr = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, dy = +v.slice(6, 8)
  if (v.length === 8) return new Date(yr, mo, dy)   // date-only — treat as local
  const hr = +v.slice(9, 11), mi = +v.slice(11, 13), sc = +v.slice(13, 15)
  // UTC times — let JS handle the timezone conversion via Date.UTC
  if (isUTC) return new Date(Date.UTC(yr, mo, dy, hr, mi, sc))
  // Floating times (no Z, no TZID) — treat as local
  return new Date(yr, mo, dy, hr, mi, sc)
}

function icalText(s) {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// ---------------------------------------------------------------------------
// Label extraction
// ---------------------------------------------------------------------------

/**
 * Extract the meaningful label from an event.
 * Prefers the first description line (stripped of trailing codes)
 * over the summary.
 */
function pillLabel(evt) {
  const firstLine = firstDescLine(evt)
  if (firstLine) return cleanLabel(firstLine)
  return cleanLabel(evt.summary ?? '')
}

/**
 * Short label for cramped blocks — just City - Company
 */
function shortLabel(evt) {
  const full = pillLabel(evt)
  // If format is "City - Company (N)..." just return "City - Company"
  const m = full.match(/^(.+?)\s*\(\d+\)/)
  return m ? m[1].trim() : full.slice(0, 30)
}

/**
 * Strip trailing test-count codes like "(3)3 C", "D C", "QLFT C", "* C"
 */
function cleanLabel(s) {
  return s
    .replace(/\(\d+\)\d*\s*[A-Z*\s]*$/i, '')  // (3)3 C, (4) D C etc.
    .replace(/\s+[A-Z*]+\s*C\s*$/i, '')         // trailing " D C", " QLFT C"
    .replace(/\s*\*\s*$/, '')                    // trailing asterisk
    .trim()
}

function firstDescLine(evt) {
  if (!evt.description) return null
  const lines = evt.description.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (t && t !== '--' && t !== '-') return t
  }
  return null
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

function categorize(summary) {
  const s = (summary ?? '').toLowerCase()
  if (/drive|driving|travel|\bkm\b|transit/.test(s))           return 'drive'
  if (/lunch\s*break|not working|day off|holiday|stat/.test(s)) return 'off'
  if (/\bbreak\b|off until/.test(s))                            return 'break'
  if (/biological|calibrat|bio\s*cal/.test(s))                  return 'bio'
  if (/observe|admin|\bhts\b|gps|dashcam|interior comm/.test(s)) return 'admin'
  return 'work'
}

// ---------------------------------------------------------------------------
// Date/time helpers
// ---------------------------------------------------------------------------

function getWeekStart(date) {
  const d = new Date(date)
  const dow = (d.getDay() + 6) % 7  // Mon=0
  d.setDate(d.getDate() - dow)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

function isSameWeek(date, weekStart) {
  const d = new Date(date); d.setHours(0,0,0,0)
  const ws = new Date(weekStart)
  const we = addDays(ws, 6)
  return d >= ws && d <= we
}

function formatHour(totalMins) {
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const period = h >= 12 ? 'pm' : 'am'
  const h12    = h % 12 || 12
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2,'0')}${period}`
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showStatus(el, type, msg) {
  if (!el) return
  el.className   = `alert alert-${type}`
  el.textContent = msg
  el.classList.remove('hidden')
}

function hideStatus(el) {
  if (el) el.classList.add('hidden')
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
