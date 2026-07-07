export const FREQUENCIES = [500, 1000, 2000, 3000, 4000, 6000, 8000]

export const FREQ_KEYS = {
  left:  ['left_500', 'left_1k', 'left_2k', 'left_3k', 'left_4k', 'left_6k', 'left_8k'],
  right: ['right_500', 'right_1k', 'right_2k', 'right_3k', 'right_4k', 'right_6k', 'right_8k']
}

export const FREQ_KEY_TO_HZ = {
  left_500: 500,  left_1k: 1000,  left_2k: 2000,  left_3k: 3000,
  left_4k: 4000,  left_6k: 6000,  left_8k: 8000,
  right_500: 500, right_1k: 1000, right_2k: 2000, right_3k: 3000,
  right_4k: 4000, right_6k: 6000, right_8k: 8000
}

export const NR = 'NR'

/**
 * Returns true if a single threshold value is valid.
 * Valid: integer 0–100 in multiples of 5, or the string 'NR'.
 */
export function isValidThreshold(value) {
  if (value === NR) return true
  if (typeof value !== 'number') return false
  if (!Number.isInteger(value)) return false
  if (value < 0 || value > 100) return false
  if (value % 5 !== 0) return false
  return true
}

/**
 * Validates all threshold fields on a test object.
 * Returns { valid: true } or { valid: false, errors: ['field: reason', ...] }
 */
export function validateThresholds(test) {
  const errors = []
  const allKeys = [...FREQ_KEYS.left, ...FREQ_KEYS.right]

  for (const key of allKeys) {
    const value = test[key]
    if (value === null || value === undefined) continue
    if (!isValidThreshold(value)) {
      errors.push(`${key}: "${value}" is not valid — must be 0–100 in multiples of 5, or "NR"`)
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

/**
 * Returns true if an ear has at least one non-null, non-undefined threshold entered.
 */
export function earHasData(test, ear) {
  return FREQ_KEYS[ear].some(key => test[key] !== null && test[key] !== undefined)
}

/**
 * Returns true if an ear is fully entered (all 7 frequencies have a value).
 */
export function earIsComplete(test, ear) {
  return FREQ_KEYS[ear].every(key => test[key] !== null && test[key] !== undefined)
}

/**
 * Given a threshold value, returns the numeric dB value or null if NR.
 */
export function toNumeric(value) {
  if (value === NR || value === null || value === undefined) return null
  return Number(value)
}
