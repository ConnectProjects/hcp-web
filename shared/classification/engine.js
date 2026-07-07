import { FREQ_KEYS, FREQ_KEY_TO_HZ, toNumeric } from '../validation/thresholds.js'

// Frequencies used in STS / average shift calculation
const STS_FREQS = [2000, 3000, 4000]

// Adjacent frequency pairs (500–6K) used by the adjacent_freq rule type
const ADJACENT_PAIRS = [[500, 1000], [1000, 2000], [2000, 3000], [3000, 4000], [4000, 6000]]

/**
 * Classify a hearing test against a set of province rules.
 *
 * @param {object} current   - Current test object with left_N/right_N threshold fields
 * @param {object} baseline  - Baseline test object, or null if no baseline exists
 * @param {Array}  rules     - Array of rule objects sorted by priority DESC (highest first)
 *
 * Rule comparison_basis values:
 *   'always'   — fires regardless of whether a baseline exists (AB absolute thresholds)
 *   'current'  — fires ONLY when there is NO baseline (BC/SK baseline-test rules)
 *   'baseline' — fires ONLY when a baseline EXISTS (all shift-based rules, BC/SK periodic rules)
 *
 * Rule types:
 *   'absolute_threshold' — fires when any single threshold in range exceeds threshold_db
 *   'average_threshold'  — fires when the average threshold across range >= threshold_db (SK baseline)
 *   'single_freq'        — fires when any single frequency shift >= threshold_db in range
 *   'adjacent_freq'      — fires when two consecutive frequencies both shift >= threshold_db
 *   'asymmetry'          — fires when per-ear averages in range differ by > threshold_db
 *   'notch'              — fires when high-freq threshold is >= threshold_db above min(1K,2K) anchor
 *   'default'            — always fires (used as a fallback category, e.g. BC NC)
 *
 * @returns {object} result
 *   result.category              - 'N'/'EW'/'A' or province-specific variant (e.g. 'NC'/'EWC'/'AC')
 *   result.triggered_rule_id     - rule_id that determined the category, or null for N
 *   result.sts_calculated        - boolean
 *   result.sts_value             - average STS in dB, or null
 *   result.triggering_freq_hz    - Hz value or label (e.g. '2000–4000'), or null
 *   result.triggering_ear        - 'left' or 'right', or null
 *   result.shift_db              - shift or threshold value at triggering freq, or null
 *   result.no_baseline           - true if no baseline was provided
 */
export function classify(current, baseline, rules) {
  const noBaseline = !baseline
  const shifts     = baseline ? calculateShifts(current, baseline) : null
  const sts        = shifts   ? calculateSTS(shifts) : null

  // Sort rules highest priority first (defensive — callers should pre-sort)
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    const basis = rule.comparison_basis

    if (noBaseline && basis === 'baseline') continue
    if (!noBaseline && basis === 'current')  continue

    const triggered = evaluateRule(
      rule, current,
      shifts ?? { left: {}, right: {} },
      sts    ?? { left: null, right: null }
    )

    if (triggered) {
      return {
        category:           rule.category_code,
        triggered_rule_id:  rule.rule_id,
        followup_months:    rule.followup_months   ?? null,
        requires_referral:  rule.requires_referral ? true : false,
        sts_calculated:     !!(sts && (sts.left !== null || sts.right !== null)),
        sts_value:          triggered.sts_value    ?? null,
        triggering_freq_hz: triggered.freq_hz      ?? null,
        triggering_ear:     triggered.ear          ?? null,
        shift_db:           triggered.shift_db     ?? null,
        no_baseline:        noBaseline
      }
    }
  }

  return {
    category:           'N',
    triggered_rule_id:  null,
    sts_calculated:     !!(sts && (sts.left !== null || sts.right !== null)),
    sts_value:          null,
    triggering_freq_hz: null,
    triggering_ear:     null,
    shift_db:           null,
    no_baseline:        noBaseline
  }
}

// ---------------------------------------------------------------------------
// Shift calculations
// ---------------------------------------------------------------------------

function calculateShifts(current, baseline) {
  const result = { left: {}, right: {} }
  for (const ear of ['left', 'right']) {
    for (const key of FREQ_KEYS[ear]) {
      const hz   = FREQ_KEY_TO_HZ[key]
      const cur  = toNumeric(current[key])
      const base = toNumeric(baseline[key])
      result[ear][hz] = (cur !== null && base !== null) ? cur - base : null
    }
  }
  return result
}

function calculateSTS(shifts) {
  const result = {}
  for (const ear of ['left', 'right']) {
    const values = STS_FREQS.map(hz => shifts[ear][hz])
    result[ear] = values.some(v => v === null)
      ? null
      : values.reduce((sum, v) => sum + v, 0) / values.length
  }
  return result
}

// ---------------------------------------------------------------------------
// Rule dispatch
// ---------------------------------------------------------------------------

function evaluateRule(rule, current, shifts, sts) {
  switch (rule.rule_type) {
    case 'STS':                return evaluateSTS(rule, sts)
    case 'single_freq':        return evaluateSingleFreq(rule, shifts)
    case 'absolute_threshold': return evaluateAbsoluteThreshold(rule, current)
    case 'average_threshold':  return evaluateAverageThreshold(rule, current)
    case 'adjacent_freq':      return evaluateAdjacentFreq(rule, shifts)
    case 'asymmetry':          return evaluateAsymmetry(rule, current)
    case 'notch':              return evaluateNotch(rule, current)
    case 'default':            return { ear: null, freq_hz: null, shift_db: null, sts_value: null }
    default:                   return null
  }
}

/**
 * STS rule: fires when the average shift at 2K+3K+4K >= threshold_db in either ear.
 */
function evaluateSTS(rule, sts) {
  for (const ear of ['left', 'right']) {
    if (sts[ear] !== null && sts[ear] >= rule.threshold_db) {
      return { ear, sts_value: sts[ear], freq_hz: '2000–4000', shift_db: sts[ear] }
    }
  }
  return null
}

/**
 * Single-frequency shift rule: fires when any single frequency shift >= threshold_db
 * within the specified frequency range (worsening only).
 * Returns the frequency with the LARGEST qualifying shift.
 */
function evaluateSingleFreq(rule, shifts) {
  let best = null

  for (const ear of ['left', 'right']) {
    for (const [hzStr, shift] of Object.entries(shifts[ear])) {
      const hz = Number(hzStr)
      if (hz < rule.freq_range_low || hz > rule.freq_range_high) continue
      if (shift === null || shift <= 0 || shift < rule.threshold_db) continue
      if (!best || shift > best.shift_db || (shift === best.shift_db && hz > best.freq_hz)) {
        best = { ear, freq_hz: hz, shift_db: shift }
      }
    }
  }

  return best ? { ...best, sts_value: null } : null
}

/**
 * Absolute threshold rule: fires when any single threshold in range EXCEEDS threshold_db.
 * threshold_db is the exclusive lower bound (e.g. threshold_db=25 → fires when val > 25).
 */
function evaluateAbsoluteThreshold(rule, current) {
  let worst = null

  for (const ear of ['left', 'right']) {
    for (const key of FREQ_KEYS[ear]) {
      const hz  = FREQ_KEY_TO_HZ[key]
      if (hz < rule.freq_range_low || hz > rule.freq_range_high) continue
      const val = toNumeric(current[key])
      if (val === null || val <= rule.threshold_db) continue
      if (!worst || val > worst.val || (val === worst.val && hz > worst.freq_hz)) {
        worst = { ear, freq_hz: hz, val }
      }
    }
  }

  return worst ? { ear: worst.ear, freq_hz: worst.freq_hz, shift_db: worst.val, sts_value: null } : null
}

/**
 * Average threshold rule: fires when the average of all non-NR thresholds in the frequency
 * range is >= threshold_db in either ear.
 * Used for SK Baseline A: average >= 25 dB HL at 500–6000 Hz.
 */
function evaluateAverageThreshold(rule, current) {
  for (const ear of ['left', 'right']) {
    const vals = []
    for (const key of FREQ_KEYS[ear]) {
      const hz = FREQ_KEY_TO_HZ[key]
      if (hz < rule.freq_range_low || hz > rule.freq_range_high) continue
      const val = toNumeric(current[key])
      if (val === null) continue // skip NR
      vals.push(val)
    }
    if (vals.length === 0) continue
    const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length
    if (avg >= rule.threshold_db) {
      return {
        ear,
        freq_hz:   `${rule.freq_range_low}–${rule.freq_range_high}`,
        shift_db:  parseFloat(avg.toFixed(1)),
        sts_value: null
      }
    }
  }
  return null
}

/**
 * Adjacent-frequency shift rule: fires when TWO consecutive frequencies in range BOTH
 * shift >= threshold_db (worsening direction only).
 */
function evaluateAdjacentFreq(rule, shifts) {
  let best = null

  for (const ear of ['left', 'right']) {
    for (const [hz1, hz2] of ADJACENT_PAIRS) {
      if (hz1 < rule.freq_range_low || hz2 > rule.freq_range_high) continue
      const s1 = shifts[ear][hz1]
      const s2 = shifts[ear][hz2]
      if (s1 === null || s2 === null) continue
      if (s1 <= 0 || s2 <= 0) continue
      if (s1 < rule.threshold_db || s2 < rule.threshold_db) continue
      const minShift = Math.min(s1, s2)
      if (!best || minShift > best.minShift || (minShift === best.minShift && hz2 > best.freq_hz)) {
        best = { ear, freq_hz: hz2, shift_db: minShift, minShift }
      }
    }
  }

  return best ? { ear: best.ear, freq_hz: best.freq_hz, shift_db: best.shift_db, sts_value: null } : null
}

/**
 * Notch rule: fires when any high-frequency threshold is >= threshold_db above
 * the best (lowest) threshold at the anchor frequencies (1K and 2K Hz).
 * Used for BC Baseline EW: notch >= 15 dB at 3K/4K/6K.
 */
function evaluateNotch(rule, current) {
  const ANCHOR_HZ = [1000, 2000]

  for (const ear of ['left', 'right']) {
    const anchorVals = ANCHOR_HZ.map(hz => {
      const key = FREQ_KEYS[ear].find(k => FREQ_KEY_TO_HZ[k] === hz)
      return key ? toNumeric(current[key]) : null
    }).filter(v => v !== null)

    if (anchorVals.length === 0) continue
    const anchorMin = Math.min(...anchorVals)

    let worst = null
    for (const key of FREQ_KEYS[ear]) {
      const hz  = FREQ_KEY_TO_HZ[key]
      if (hz < rule.freq_range_low || hz > rule.freq_range_high) continue
      const val = toNumeric(current[key])
      if (val === null) continue
      const depth = val - anchorMin
      if (depth >= rule.threshold_db) {
        if (!worst || depth > worst.depth || (depth === worst.depth && hz > worst.freq_hz)) {
          worst = { freq_hz: hz, depth }
        }
      }
    }

    if (worst) {
      return { ear, freq_hz: worst.freq_hz, shift_db: worst.depth, sts_value: null }
    }
  }

  return null
}

/**
 * Asymmetry rule: fires when the absolute difference between per-ear averages
 * at the specified frequencies EXCEEDS threshold_db.
 * Used for AB Abnormal: average at 3K/4K/6K differs by > 30 dB between ears.
 */
function evaluateAsymmetry(rule, current) {
  const earAvg = {}
  for (const ear of ['left', 'right']) {
    const vals = []
    for (const key of FREQ_KEYS[ear]) {
      const hz = FREQ_KEY_TO_HZ[key]
      if (hz < rule.freq_range_low || hz > rule.freq_range_high) continue
      const val = toNumeric(current[key])
      if (val === null) { vals.push(null); break }
      vals.push(val)
    }
    earAvg[ear] = vals.length > 0 && !vals.some(v => v === null)
      ? vals.reduce((sum, v) => sum + v, 0) / vals.length
      : null
  }

  if (earAvg.left === null || earAvg.right === null) return null

  const diff = Math.abs(earAvg.left - earAvg.right)
  if (diff <= rule.threshold_db) return null

  const worseEar = earAvg.left > earAvg.right ? 'left' : 'right'
  return {
    ear:       worseEar,
    freq_hz:   `${rule.freq_range_low}–${rule.freq_range_high}`,
    shift_db:  parseFloat(diff.toFixed(1)),
    sts_value: null
  }
}

// ---------------------------------------------------------------------------
// Counsel rendering
// ---------------------------------------------------------------------------

/**
 * Render counsel template text by replacing tokens with actual values.
 * Templates already contain unit suffixes — do NOT append units here.
 *
 * @param {string} templateText
 * @param {object} tokens  — { freq, ear, date, shift }
 * @returns {string}
 */
export function renderCounsel(templateText, tokens) {
  const shiftStr = tokens.shift != null
    ? (Number.isInteger(tokens.shift) ? String(tokens.shift) : Number(tokens.shift).toFixed(1))
    : ''
  return templateText
    .replace(/\[freq\]/g,  tokens.freq  != null ? String(tokens.freq) : '')
    .replace(/\[ear\]/g,   tokens.ear   ?? '')
    .replace(/\[date\]/g,  tokens.date  ?? '')
    .replace(/\[shift\]/g, shiftStr)
}

export { calculateShifts, calculateSTS }
