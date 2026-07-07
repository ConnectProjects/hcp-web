/**
 * CSA Z94.2-14 HPD Adequacy Calculation
 *
 * Derating (WorkSafeBC / CSA Z94.2-14):
 *   Earplugs:  Derated NRR = Rated NRR × 0.50
 *   Earmuffs:  Derated NRR = Rated NRR × 0.70  (30% derating)
 *   Dual:      Derated NRR = higher + (lower × 0.50)
 *
 * dBA correction: NRR is measured in dBC; subtract 3 dB for dBA environments.
 *   Effective reduction = Derated NRR − 3
 *   Protected exposure  = LEX-8hr − Effective reduction
 *
 * Adequacy thresholds:
 *   Adequate:   protected exposure ≤ 85 dB(A)
 *   Marginal:   85 < protected exposure ≤ 90 dB(A)
 *   Inadequate: protected exposure > 90 dB(A)
 */

const DBA_CORRECTION  = 3    // dBC→dBA correction
const LIMIT_ADEQUATE  = 85
const LIMIT_MARGINAL  = 90

/**
 * @param {number|string} ratedNRR   - Rated NRR from HPD packaging (dB)
 * @param {number|string} lex8hr     - Worker noise exposure (dB(A))
 * @param {'earplug'|'earmuff'|'dual'} [type='earplug']
 * @param {number|string|null} [nrr2=null] - Second NRR for dual protection
 * @returns {object} result
 */
export function calcHPD(ratedNRR, lex8hr, type = 'earplug', nrr2 = null) {
  const nrr = Number(ratedNRR)
  const lex = Number(lex8hr)

  if (!Number.isFinite(nrr) || nrr < 0) return { valid: false, error: 'Invalid NRR' }
  if (!Number.isFinite(lex) || lex < 0)  return { valid: false, error: 'Invalid LEX-8hr' }

  let deratedNRR, deratingLabel

  if (type === 'earmuff') {
    deratedNRR    = nrr * 0.70
    deratingLabel = 'NRR × 0.7 (30% derating)'
  } else if (type === 'dual') {
    const n2 = Number(nrr2)
    if (!Number.isFinite(n2) || n2 < 0) return { valid: false, error: 'Invalid second NRR for dual' }
    const higher = Math.max(nrr, n2)
    const lower  = Math.min(nrr, n2)
    deratedNRR    = higher + (lower * 0.50)
    deratingLabel = `${higher} + (${lower} × 0.5) — dual`
  } else if (type === 'custom') {
    deratedNRR    = nrr * 0.50
    deratingLabel = 'NRR × 0.5 (50% derating) — custom'
  } else {
    // earplug (default)
    deratedNRR    = nrr * 0.50
    deratingLabel = 'NRR × 0.5 (50% derating)'
  }

  deratedNRR = parseFloat(deratedNRR.toFixed(1))

  const effectiveReduction = parseFloat((deratedNRR - DBA_CORRECTION).toFixed(1))
  const protectedExposure  = parseFloat((lex - effectiveReduction).toFixed(1))

  let adequacy
  if      (protectedExposure <= LIMIT_ADEQUATE) adequacy = 'Adequate'
  else if (protectedExposure <= LIMIT_MARGINAL) adequacy = 'Marginal'
  else                                          adequacy = 'Inadequate'

  return {
    valid:               true,
    type,
    rated_nrr:           nrr,
    derated_nrr:         deratedNRR,
    derating_label:      deratingLabel,
    effective_reduction: effectiveReduction,
    lex8hr:              lex,
    protected_exposure:  protectedExposure,
    adequacy
  }
}
