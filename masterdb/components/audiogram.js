/**
 * Display-only SVG audiogram for MasterDB reports.
 * Threshold keys match DB column names: left_500, left_1k, right_500, etc.
 * Right ear: open circle (○), red. Left ear: × cross, blue.
 * Baseline: dashed lines (no markers). NR: downward arrow.
 */

const FREQ_COLS = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
const FREQS_HZ  = [500, 1000, 2000, 3000, 4000, 6000, 8000]

const W = 460, H = 300
const ML = 46, MR = 18, MT = 28, MB = 24
const PW = W - ML - MR
const PH = H - MT - MB
const DB_MIN = -10, DB_MAX = 110

function xFor(i)  { return ML + (i / (FREQ_COLS.length - 1)) * PW }
function yFor(db) { return MT + ((db - DB_MIN) / (DB_MAX - DB_MIN)) * PH }
function fx(n)    { return n.toFixed(1) }

export function renderAudiogram({ current = {}, baseline = null }) {
  const parts = []

  // Grid
  for (let db = DB_MIN; db <= DB_MAX; db += 10) {
    const y = yFor(db)
    parts.push(`<line x1="${ML}" y1="${fx(y)}" x2="${W - MR}" y2="${fx(y)}" stroke="${db % 20 === 0 ? '#ccc' : '#ebebeb'}" stroke-width="1"/>`)
    if (db >= 0 && db <= 110) {
      parts.push(`<text x="${ML - 6}" y="${fx(y + 4)}" text-anchor="end" font-size="10" fill="#666">${db}</text>`)
    }
  }
  for (let i = 0; i < FREQ_COLS.length; i++) {
    const x = xFor(i)
    parts.push(`<line x1="${fx(x)}" y1="${MT}" x2="${fx(x)}" y2="${H - MB}" stroke="#ddd" stroke-width="1"/>`)
    const label = FREQS_HZ[i] >= 1000 ? (FREQS_HZ[i] / 1000) + 'k' : String(FREQS_HZ[i])
    parts.push(`<text x="${fx(x)}" y="${MT - 8}" text-anchor="middle" font-size="10" fill="#555">${label}</text>`)
  }

  // Border + axis label
  parts.push(`<rect x="${ML}" y="${MT}" width="${PW}" height="${PH}" fill="none" stroke="#aaa" stroke-width="1.5"/>`)
  const lblX = ML - 36, lblY = MT + PH / 2
  parts.push(`<text x="${lblX}" y="${lblY}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-90 ${fx(lblX)} ${fx(lblY)})">dB HL</text>`)

  // Baseline (dashed lines only)
  if (baseline) {
    for (const side of ['right', 'left']) {
      const color = side === 'right' ? '#c0392b' : '#1a56a0'
      const pts = []
      for (let i = 0; i < FREQ_COLS.length; i++) {
        const val = baseline[side + '_' + FREQ_COLS[i]]
        if (val == null || val === '' || String(val).toUpperCase() === 'NR') continue
        const db = Number(val)
        if (isNaN(db)) continue
        pts.push({ x: xFor(i), y: yFor(db), i })
      }
      for (let j = 1; j < pts.length; j++) {
        if (pts[j].i - pts[j - 1].i === 1) {
          parts.push(`<line x1="${fx(pts[j-1].x)}" y1="${fx(pts[j-1].y)}" x2="${fx(pts[j].x)}" y2="${fx(pts[j].y)}" stroke="${color}" stroke-width="1" stroke-dasharray="4,3" opacity="0.5"/>`)
        }
      }
    }
  }

  // Current markers + connecting lines
  for (const side of ['right', 'left']) {
    const color  = side === 'right' ? '#c0392b' : '#1a56a0'
    const isLeft = side === 'left'
    const pts = []

    for (let i = 0; i < FREQ_COLS.length; i++) {
      const val = current[side + '_' + FREQ_COLS[i]]
      if (val == null || val === '') continue
      const x = xFor(i)
      if (String(val).toUpperCase() === 'NR') {
        parts.push(`<text x="${fx(x)}" y="${fx(H - MB - 4)}" text-anchor="middle" font-size="13" fill="${color}">↓</text>`)
        continue
      }
      const db = Number(val)
      if (isNaN(db)) continue
      const y = yFor(db)
      pts.push({ x, y, i })

      if (isLeft) {
        const s = 5
        parts.push(`<line x1="${fx(x-s)}" y1="${fx(y-s)}" x2="${fx(x+s)}" y2="${fx(y+s)}" stroke="${color}" stroke-width="2"/>`)
        parts.push(`<line x1="${fx(x+s)}" y1="${fx(y-s)}" x2="${fx(x-s)}" y2="${fx(y+s)}" stroke="${color}" stroke-width="2"/>`)
      } else {
        parts.push(`<circle cx="${fx(x)}" cy="${fx(y)}" r="5.5" fill="none" stroke="${color}" stroke-width="2"/>`)
      }
    }

    for (let j = 1; j < pts.length; j++) {
      if (pts[j].i - pts[j - 1].i === 1) {
        parts.push(`<line x1="${fx(pts[j-1].x)}" y1="${fx(pts[j-1].y)}" x2="${fx(pts[j].x)}" y2="${fx(pts[j].y)}" stroke="${color}" stroke-width="1.5" opacity="0.65"/>`)
      }
    }
  }

  const legendItems = [
    `<span class="al-item"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#c0392b" stroke-width="2"/></svg> Right</span>`,
    `<span class="al-item"><svg width="14" height="14" viewBox="0 0 14 14"><text x="7" y="12" text-anchor="middle" font-size="15" font-weight="bold" fill="#1a56a0" font-family="sans-serif">×</text></svg> Left</span>`,
    baseline ? `<span class="al-item"><svg width="22" height="14" viewBox="0 0 22 14"><line x1="1" y1="7" x2="21" y2="7" stroke="#888" stroke-width="1.5" stroke-dasharray="5,3"/></svg> Baseline</span>` : ''
  ].filter(Boolean).join('\n    ')

  return `<div class="audiogram-wrap"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;max-width:100%">
  ${parts.join('\n  ')}
</svg><div class="audiogram-legend">
    ${legendItems}
  </div></div>`
}
