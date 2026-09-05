/**
 * masterdb2/db/wsbc-export.js — WorkSafeBC File_Upload_Template CSV generator
 *
 * generateWsbcCsv(locationId, testIds)
 *   Generate a File_Upload_Template CSV from DB records for the given location and tests.
 *   testIds: array of test_id values to include (from a just-imported packet or a
 *            Reports-screen export).
 *
 * Returns { csv: string, filename: string } — caller triggers browser download.
 *
 * Column order matches the official WSBC File_Upload_Template exactly.
 */

import { query } from './db.js'

const WSBC_HEADERS = [
  'Submitted by user',
  'Test Date',
  'Technician ID',
  'Technician First Name',
  'Technician Last Name',
  'Worker ID',
  'Worker First Name',
  'Worker Middle Name',
  'Worker Last Name',
  'Worker Abbr Name',
  'Birth Date',
  'Gender',
  '4 digits SIN',
  'Years in Occupation',
  'Employer ID',
  'Employer Name',
  'Operating Location',
  'CU Code',
  'CU Description',
  'Occupation Code',
  'Occupation Job Title',
  'Comment',
  'LeftEar05khz',
  'LeftEar1khz',
  'LeftEar2khz',
  'LeftEar3khz',
  'LeftEar4khz',
  'LeftEar6khz',
  'LeftEar8khz',
  'RightEar05khz',
  'RightEar1khz',
  'RightEar2khz',
  'RightEar3khz',
  'RightEar4khz',
  'RightEar6khz',
  'RightEar8khz',
  'ExposedToNoiseInLastHours',
  'HowManyHoursExposedToNoise',
  'RegularlyWearHearingProt',
  'ClassOfHearingProtWornReg',
  'StyleOfHearingProtWornReg',
  'WhyNotWearHearingProtReg',
  'HaveReceivedEducationAboutNoiseAndLostInLastYear',
  'HadSevereEarInfection',
  'HadEarSurgery',
  'HadDizzinessOrBalanceProblems',
  'HadSeriousHeadInjury',
  'HadHearingLossInChildhood',
  'HasRingingInEars',
  'WhichEar',
  'WhenFirstNoticed',
  'HadExposureToLoudBlast',
  'HasUsedFirearms',
  'FromWhichShoulderShoot',
  'NumYearsShootingFirearms',
  'I confirm that technician who conducted the test determined the test category for this worker',
  'I confirm that technician who conducted the test appropriately counselled the worker on both test results and hearing protection',
  'Worker Email',
  'Worker Phone Number',
]

function csvCell(v) {
  const s = String(v ?? '')
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function isoToWsbc(d) {
  if (!d) return ''
  return d.replace(/-/g, '/')
}

function dbThreshold(row, col) {
  const v = row[col]
  return v != null ? String(v) : ''
}

/**
 * Generate WSBC CSV for a set of test IDs.
 *
 * testIds: array of test_id integers
 * Returns { csv, filename } or throws.
 */
export function generateWsbcCsv(testIds) {
  if (!testIds?.length) throw new Error('No test IDs provided')

  const placeholders = testIds.map(() => '?').join(',')
  const rows = query(`
    SELECT
      te.test_id,
      te.test_date,
      te.left_500, te.left_1k, te.left_2k, te.left_3k, te.left_4k, te.left_6k, te.left_8k,
      te.right_500, te.right_1k, te.right_2k, te.right_3k, te.right_4k, te.right_6k, te.right_8k,
      te.questionnaire,
      e.first_name, e.middle_name, e.last_name, e.dob, e.sin_last_4, e.phone AS worker_phone, e.email AS worker_email,
      e.wsbc_worker_id, e.job_title, e.occupation_code,
      c.name AS employer_name, c.worksafebc_employer_id,
      l.name AS location_number, l.cu_code,
      tk.name AS tech_name, tk.iat_number AS wsbc_tech_id
    FROM tests te
    JOIN employees e ON e.employee_id = te.employee_id
    JOIN locations l ON l.location_id = te.location_id
    JOIN companies c ON c.company_id  = l.company_id
    LEFT JOIN techs tk ON tk.tech_id = te.tech_id
    WHERE te.test_id IN (${placeholders}) AND te.deleted_at IS NULL
    ORDER BY te.test_date, e.last_name, e.first_name
  `, testIds)

  const dataRows = rows.map(row => {
    let q = {}
    try { if (row.questionnaire) q = JSON.parse(row.questionnaire) } catch { /* ignore */ }

    const [techFirst, ...techRest] = (row.tech_name ?? '').split(' ')
    const techLast = techRest.join(' ')

    const operatingLocation = row.worksafebc_employer_id
      ? `${row.location_number} ${row.employer_name}`.trim()
      : row.location_number ?? ''

    return [
      '',                              // Submitted by user (left blank)
      isoToWsbc(row.test_date),
      row.wsbc_tech_id ?? '',          // Technician ID (IAT number used as WSBC ID)
      techFirst ?? '',
      techLast  ?? '',
      row.wsbc_worker_id ?? '',
      row.first_name  ?? '',
      row.middle_name ?? '',
      row.last_name   ?? '',
      '',                              // Worker Abbr Name
      isoToWsbc(row.dob),
      '',                              // Gender
      row.sin_last_4  ?? '',
      '',                              // Years in Occupation
      row.worksafebc_employer_id ?? '',
      row.employer_name ?? '',
      operatingLocation,
      row.cu_code ?? '',
      '',                              // CU Description
      row.occupation_code ?? '',
      row.job_title       ?? '',
      '',                              // Comment
      dbThreshold(row, 'left_500'),
      dbThreshold(row, 'left_1k'),
      dbThreshold(row, 'left_2k'),
      dbThreshold(row, 'left_3k'),
      dbThreshold(row, 'left_4k'),
      dbThreshold(row, 'left_6k'),
      dbThreshold(row, 'left_8k'),
      dbThreshold(row, 'right_500'),
      dbThreshold(row, 'right_1k'),
      dbThreshold(row, 'right_2k'),
      dbThreshold(row, 'right_3k'),
      dbThreshold(row, 'right_4k'),
      dbThreshold(row, 'right_6k'),
      dbThreshold(row, 'right_8k'),
      q.exposed_noise_last_hours       ?? '',
      q.hours_noise_exposure           ?? '',
      q.regularly_wear_hpd             ?? '',
      q.hpd_class                      ?? '',
      q.hpd_style                      ?? '',
      q.why_not_wear_hpd               ?? '',
      '',                              // HaveReceivedEducation (not captured in TechTool)
      q.ear_infection                  ?? '',
      q.ear_surgery                    ?? '',
      q.dizziness                      ?? '',
      q.head_injury                    ?? '',
      q.childhood_hearing_loss         ?? '',
      q.tinnitus                       ?? '',
      q.tinnitus_ear                   ?? '',
      '',                              // WhenFirstNoticed
      q.blast_exposure                 ?? '',
      q.firearms                       ?? '',
      '',                              // FromWhichShoulderShoot
      '',                              // NumYearsShootingFirearms
      'Yes',                           // confirm tech determined category
      'Yes',                           // confirm tech counselled worker
      row.worker_email                 ?? '',
      row.worker_phone                 ?? '',
    ]
  })

  const csv = [WSBC_HEADERS, ...dataRows]
    .map(r => r.map(csvCell).join(','))
    .join('\r\n')

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `WSBC_File_Upload_${date}.csv`

  return { csv, filename }
}

/**
 * Generate WSBC CSV for all BC tests in a location within a date range.
 * Used by the Reports screen export button.
 */
export function generateWsbcCsvForLocation(locationId, fromDate, toDate) {
  const rows = query(
    `SELECT te.test_id FROM tests te
     JOIN locations l ON l.location_id = te.location_id
     WHERE te.location_id = ? AND te.deleted_at IS NULL
       AND te.test_date >= ? AND te.test_date <= ?
     ORDER BY te.test_date`,
    [locationId, fromDate, toDate]
  )
  const testIds = rows.map(r => r.test_id)
  if (!testIds.length) throw new Error('No tests found for this location in the selected date range')
  return generateWsbcCsv(testIds)
}
