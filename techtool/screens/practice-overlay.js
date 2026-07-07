/**
 * techtool/screens/practice-overlay.js
 *
 * Shared utility for practice mode overlays.
 *
 * Call showPracticeHint(container, state, screenKey) at the top of any
 * screen's render function. It checks whether practice mode is active and
 * whether this hint has been seen before, and if not, injects a dismissible
 * overlay into the container.
 *
 * Hint data lives in practice-packet.js (PRACTICE_HINTS).
 */

import { PRACTICE_HINTS, PRACTICE_SUGGESTED_THRESHOLDS } from '../data/practice-packet.js'

/**
 * Show a one-time dismissible overlay hint for the given screen key.
 * Does nothing if not in practice mode or hint already seen.
 *
 * @param {HTMLElement} container
 * @param {object}      state
 * @param {string}      screenKey  — key into PRACTICE_HINTS
 * @param {object}      [extra]    — optional { empId } for per-employee hints
 */
export function showPracticeHint(container, state, screenKey, extra = {}) {
  if (!state._inPracticeMode) return

  state.practiceHintsSeen = state.practiceHintsSeen ?? {}
  const seenKey = extra.empId ? `${screenKey}-${extra.empId}` : screenKey
  if (state.practiceHintsSeen[seenKey]) return

  const hint = PRACTICE_HINTS[screenKey]
  if (!hint) return

  // Employee-specific training hint if available
  const empHint = extra.empId
    ? state.currentPacket?.employees?.find(e => e.employee_id === extra.empId)?._training_hint
    : null

  // Suggested thresholds hint for test-entry screen
  const suggested = (screenKey === 'test-entry' && extra.empId)
    ? PRACTICE_SUGGESTED_THRESHOLDS[extra.empId]
    : null

  const overlay = document.createElement('div')
  overlay.className = 'practice-overlay'
  overlay.innerHTML = `
    <div class="practice-overlay-inner">
      <div class="practice-overlay-header">
        <span class="practice-overlay-badge">🎓 Practice Mode</span>
        <button class="practice-overlay-close" id="pov-close">Got it ✓</button>
      </div>
      <div class="practice-overlay-title">${esc(hint.title)}</div>
      <div class="practice-overlay-body">${esc(hint.body)}</div>
      ${empHint ? `
        <div class="practice-overlay-emp-hint">
          <strong>This employee:</strong> ${esc(empHint)}
        </div>
      ` : ''}
      ${suggested ? `
        <div class="practice-overlay-suggested">
          <strong>Suggested thresholds for ${esc(suggested.label)}:</strong>
          <div class="practice-thresh-grid">
            <div class="practice-thresh-row">
              <span class="practice-thresh-ear">R</span>
              ${Object.entries(suggested.right).map(([hz, val]) =>
                `<span class="practice-thresh-cell"><span class="practice-thresh-freq">${hz >= 1000 ? hz/1000+'K' : hz}</span><span class="practice-thresh-val">${val}</span></span>`
              ).join('')}
            </div>
            <div class="practice-thresh-row">
              <span class="practice-thresh-ear">L</span>
              ${Object.entries(suggested.left).map(([hz, val]) =>
                `<span class="practice-thresh-cell"><span class="practice-thresh-freq">${hz >= 1000 ? hz/1000+'K' : hz}</span><span class="practice-thresh-val">${val}</span></span>`
              ).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `

  // Insert at top of screen body, or directly in container
  const body = container.querySelector('.screen-body') ?? container
  body.insertBefore(overlay, body.firstChild)

  overlay.querySelector('#pov-close').addEventListener('click', () => {
    overlay.remove()
    state.practiceHintsSeen[seenKey] = true
  })
}

/**
 * Show the practice mode banner (persistent, non-dismissible) at the top
 * of any screen while practice mode is active.
 */
export function showPracticeBanner(container, state, navigate) {
  if (!state._inPracticeMode) return

  const banner = document.createElement('div')
  banner.className = 'practice-banner'
  banner.innerHTML = `
    <span class="practice-banner-label">🎓 Practice Mode</span>
    <span class="practice-banner-hint">Training Co. (Practice) · No real data is saved</span>
    <button class="practice-banner-exit" id="pbn-exit">Exit Practice</button>
  `

  const header = container.querySelector('.app-header')
  if (header) {
    header.insertAdjacentElement('afterend', banner)
  } else {
    container.insertBefore(banner, container.firstChild)
  }

  banner.querySelector('#pbn-exit').addEventListener('click', () => {
    exitPracticeMode(state, navigate)
  })
}

/**
 * Exit practice mode — restore real state and navigate to dashboard.
 */
export function exitPracticeMode(state, navigate) {
  state.packets          = state._realPackets  ?? []
  state.user             = state._realUser     ?? state.user
  state.currentPacket    = null
  state.currentEmployee  = null
  state._inPracticeMode  = false
  state._realPackets     = null
  state._realUser        = null
  state.practiceHintsSeen= {}
  state.practiceCompleted= true
  navigate('settings')
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
