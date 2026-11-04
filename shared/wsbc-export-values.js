import { WSBC_OCCUPATION_DESCRIPTIONS } from './wsbc-occupation-descriptions.js'

// WSBC upload compatibility, confirmed by a successful portal upload.
// Convert only on export; retain NR in stored tests and worker reports.
export function wsbcThreshold(value) {
  if (String(value ?? '').trim().toUpperCase() === 'NR') return '90'
  return value == null ? '' : String(value)
}

export function wsbcOccupationTitle(title, code) {
  return String(title ?? '').trim() || WSBC_OCCUPATION_DESCRIPTIONS[String(code ?? '').trim()] || ''
}
