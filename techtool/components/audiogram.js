/**
 * SVG Audiogram Component
 *
 * Renders a clinical audiogram.
 * Left ear: blue × markers, solid lines
 * Right ear: red ○ markers, solid lines
 * Baseline: dashed lines, 60% opacity
 * NR (No Response): downward arrow at bottom of chart
 *
 * Usage:
 *   import { renderAudiogram } from './components/audiogram.js'
 *   const svg = renderAudiogram({ current, baseline, highlightFreqs })
 *   container.appendChild(svg)
 */

const FREQS        = [500, 1000, 2000, 3000, 4000, 6000, 8000]
const FREQ_LABELS  = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
const FREQ_SUFFIX  = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
const DB_MIN       = -10
const DB_MAX       = 110
const DB_STEP      = 10

const MARGIN = { top: 24, right: 16, bottom: 32, left: 46 }
const W      = 540
const H      = 360
const CW     = W - MARGIN.left - MARGIN.right
const CH     = H - MARGIN.top  - MARGIN.bottom

const COLOR_LEFT  = '#1a56a0'
const COLOR_RIGHT = '#c0392b'

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function xPos(i)   { return MARGIN.left + (i / (FREQS.length - 1)) * CW }
function yPos(db)  {
  if (db === null || db === undefined || db === 'NR') return null
  const v = Math.max(DB_MIN, Math.min(DB_MAX, Number(db)))
  return MARGIN.top + ((v - DB_MIN) / (DB_MAX - DB_MIN)) * CH
}

function el(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

function txt(x, y, content, attrs = {}) {
  const node = el('text', { x, y, ...attrs })
  node.textContent = content
  return node
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderAudiogram({ current = {}, baseline = null, highlightFreqs = [] } = {}) {
  const svg = el('svg', {
    viewBox:      `0 0 ${W} ${H}`,
    class:        'audiogram-svg',
    role:         'img',
    'aria-label': 'Audiogram — hearing threshold chart'
  })

  // White background
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }))

  // Highlight STS-flagged frequencies
  for (const freq of highlightFreqs) {
    const i = FREQS.indexOf(freq)
    if (i < 0) continue
    const x    = xPos(i)
    const colW = CW / (FREQS.length - 1)
    svg.appendChild(el('rect', {
      x: x - colW / 2, y: MARGIN.top, width: colW, height: CH,
      fill: '#fff3cd', opacity: '0.6'
    }))
  }

  // Horizontal grid + dB labels
  for (let db = DB_MIN; db <= DB_MAX; db += DB_STEP) {
    const y      = yPos(db)
    svg.appendChild(el('line', {
      x1: MARGIN.left, y1: y, x2: MARGIN.left + CW, y2: y,
      stroke: '#e5e5e5',
      'stroke-width': 1
    }))
    svg.appendChild(txt(MARGIN.left - 5, y + 4, String(db), {
      'text-anchor': 'end', 'font-size': '11', fill: '#666', 'font-family': 'sans-serif'
    }))
  }

  // 25dB reference line
  const y25 = yPos(25)
  svg.appendChild(el('line', {
    x1: MARGIN.left, y1: y25, x2: MARGIN.left + CW, y2: y25,
    stroke: '#999',
    'stroke-width': 1.5,
    'stroke-dasharray': '4,4'
  }))
  svg.appendChild(txt(MARGIN.left + CW + 5, y25 + 4, '25', {
    'text-anchor': 'start', 'font-size': '10', fill: '#999', 'font-family': 'sans-serif', 'font-weight': 'bold'
  }))

  // Y-axis label
  const yLabelEl = el('text', {
    transform: `rotate(-90)`,
    x: -(MARGIN.top + CH / 2), y: 13,
    'text-anchor': 'middle', 'font-size': '11', fill: '#555', 'font-family': 'sans-serif'
  })
  yLabelEl.textContent = 'Hearing Level (dB HL)'
  svg.appendChild(yLabelEl)

  // Vertical frequency lines + labels
  FREQS.forEach((freq, i) => {
    const x = xPos(i)
    svg.appendChild(el('line', {
      x1: x, y1: MARGIN.top, x2: x, y2: MARGIN.top + CH,
      stroke: '#e5e5e5', 'stroke-width': 1
    }))
    svg.appendChild(txt(x, MARGIN.top + CH + 18, FREQ_LABELS[i], {
      'text-anchor': 'middle', 'font-size': '12', fill: '#555', 'font-family': 'sans-serif'
    }))
  })

  // X-axis label
  svg.appendChild(txt(MARGIN.left + CW / 2, H - 2, 'Frequency (Hz)', {
    'text-anchor': 'middle', 'font-size': '11', fill: '#555', 'font-family': 'sans-serif'
  }))

  // Chart border
  svg.appendChild(el('rect', {
    x: MARGIN.left, y: MARGIN.top, width: CW, height: CH,
    fill: 'none', stroke: '#aaa', 'stroke-width': 1.5
  }))

  // Draw baseline (dashed, lighter)
  if (baseline) {
    drawLine(svg, 'left',  baseline, true,  COLOR_LEFT)
    drawLine(svg, 'right', baseline, true,  COLOR_RIGHT)
  }

  // Draw current test (solid, markers)
  if (current && Object.keys(current).some(k => current[k] !== undefined && current[k] !== null)) {
    drawLine(svg,    'left',  current, false, COLOR_LEFT)
    drawLine(svg,    'right', current, false, COLOR_RIGHT)
    drawMarkers(svg, 'left',  current, COLOR_LEFT,  'X')
    drawMarkers(svg, 'right', current, COLOR_RIGHT, 'O')
  }

  const wrap = document.createElement('div')
  wrap.className = 'audiogram-wrap'
  wrap.appendChild(svg)

  const legend = document.createElement('div')
  legend.className = 'audiogram-legend'
  legend.innerHTML = `
    <span class="al-item"><svg width="14" height="14" viewBox="0 0 14 14">
      <text x="7" y="12" text-anchor="middle" font-size="15" font-weight="bold" fill="#1a56a0" font-family="sans-serif">×</text>
    </svg> Left</span>
    <span class="al-item"><svg width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="5" fill="none" stroke="#c0392b" stroke-width="2"/>
    </svg> Right</span>
    ${baseline ? `<span class="al-item"><svg width="22" height="14" viewBox="0 0 22 14">
      <line x1="1" y1="7" x2="21" y2="7" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/>
    </svg> Baseline</span>` : ''}
  `
  wrap.appendChild(legend)
  return wrap
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawLine(svg, ear, data, dashed, color) {
  const prefix = ear === 'left' ? 'left_' : 'right_'
  const pts = []

  FREQS.forEach((_, i) => {
    const key = prefix + FREQ_SUFFIX[i]
    const y   = yPos(data[key])
    if (y !== null) pts.push(`${xPos(i)},${y}`)
  })

  if (pts.length >= 2) {
    svg.appendChild(el('polyline', {
      points:               pts.join(' '),
      fill:                 'none',
      stroke:               color,
      'stroke-width':       dashed ? 1.5 : 2,
      'stroke-dasharray':   dashed ? '5,4' : '',
      opacity:              dashed ? '0.55' : '1'
    }))
  }
}

function drawMarkers(svg, ear, data, color, symbol) {
  const prefix = ear === 'left' ? 'left_' : 'right_'

  FREQS.forEach((_, i) => {
    const key = prefix + FREQ_SUFFIX[i]
    const val = data[key]
    const x   = xPos(i)
    const y   = yPos(val)

    if (y === null) {
      // NR — downward arrow near bottom of chart
      if (val === 'NR') {
        const nrY = MARGIN.top + CH - 6
        svg.appendChild(txt(x, nrY, '↓', {
          'text-anchor': 'middle', 'font-size': '13', fill: color, opacity: '0.6',
          'font-family': 'sans-serif'
        }))
      }
      return
    }

    if (symbol === 'X') {
      svg.appendChild(txt(x, y + 5, '×', {
        'text-anchor': 'middle', 'font-size': '17', 'font-weight': 'bold',
        fill: color, 'font-family': 'sans-serif'
      }))
    } else {
      svg.appendChild(el('circle', {
        cx: x, cy: y, r: 6,
        fill: 'none', stroke: color, 'stroke-width': 2
      }))
    }
  })
}

