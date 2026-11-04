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

export function wsbcDate(value) {
  return String(value ?? '').replace(/-/g, '/')
}

export function wsbcGender(value) {
  const gender = String(value ?? '').trim().toLowerCase()
  if (gender === 'male' || gender === 'm') return 'M'
  if (gender === 'female' || gender === 'f') return 'F'
  return gender ? 'NA' : ''
}

export function wsbcOperatingLocation(location, employer) {
  const name = String(location ?? '').trim()
  const company = String(employer ?? '').trim()
  if (!name || !company || name.toLowerCase().includes(company.toLowerCase())) return name
  return `${name} ${company}`
}
