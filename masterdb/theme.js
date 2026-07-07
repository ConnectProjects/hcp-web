/**
 * Theme color management.
 *
 * The primary brand color is stored in the SQLite settings table.
 * At boot (and whenever changed) it is applied as CSS variable overrides on
 * document.documentElement, so every --navy-mid / --navy / --navy-light
 * reference in the stylesheet picks up the new values without a reload.
 *
 * Dark variant  → sidebar background, report headers  (55% of original lightness)
 * Mid  variant  → buttons, links, active states        (the chosen color itself)
 * Light variant → hover backgrounds, info tints        (94% lightness, muted sat)
 */

import { run, queryOne } from './db/sqlite.js'

export const DEFAULT_COLOR = '#76B214'

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

export function loadThemeColor() {
  return queryOne('SELECT value FROM settings WHERE key = ?', ['theme_color'])?.value ?? DEFAULT_COLOR
}

export function saveThemeColor(hex) {
  run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('theme_color', ?)`, [hex])
}

// ---------------------------------------------------------------------------
// Apply to DOM
// ---------------------------------------------------------------------------

export function applyTheme(hex) {
  const [h, s, l] = hexToHsl(hex)
  // Use the color itself for the sidebar/header background to match brand logos exactly
  const light = hslToHex(h, Math.min(s * 0.5, 55), 94)
  const root  = document.documentElement.style
  root.setProperty('--navy-mid',   hex)
  root.setProperty('--navy',       hex)
  root.setProperty('--navy-light', light)
}

// ---------------------------------------------------------------------------
// Colour math
// ---------------------------------------------------------------------------

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255
  let g = parseInt(hex.slice(3, 5), 16) / 255
  let b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6;               break
      case b: h = ((r - g) / d + 4) / 6;               break
    }
  }

  return [h * 360, s * 100, l * 100]
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  let r, g, b

  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return '#' + [r, g, b]
    .map(x => Math.round(x * 255).toString(16).padStart(2, '0'))
    .join('')
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}
