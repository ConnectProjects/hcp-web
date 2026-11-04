import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const context = vm.createContext({ Date })
let dbRows = []
const modules = new Map()
async function load(path) {
  if (modules.has(path)) return modules.get(path)
  const source = path === 'masterdb2/db/db.js'
    ? 'export const query = globalThis.query'
    : await readFile(new URL(path, root), 'utf8')
  const mod = new vm.SourceTextModule(source, { context, identifier: path })
  modules.set(path, mod)
  await mod.link((specifier, parent) => {
    const resolved = new URL(specifier, new URL(parent.identifier, root))
    return load(resolved.pathname.slice(root.pathname.length))
  })
  return mod
}
context.query = () => dbRows
const exporter = await load('masterdb2/db/wsbc-export.js')
await exporter.evaluate()
const helpers = modules.get('shared/wsbc-export-values.js').namespace
const { generateWsbcCsv, validateWsbcExport } = exporter.namespace
const fields = ['500', '1k', '2k', '3k', '4k', '6k', '8k']
const thresholds = Object.fromEntries(['left', 'right'].flatMap(ear =>
  fields.map(f => [`${ear}_${f}`, ['6k', '8k'].includes(f) ? 'NR' : 5])))
const questionnaire = {
  wear_hpd: true, noise_2h: false, employer_info: true,
  ear_infection: false, ear_surgery: false, dizziness: false,
  head_injury: false, childhood_loss: false, tinnitus: false,
  blast_exposure: false, firearms: false, years_in_occupation: 1,
}
function fixture(overrides = {}) {
  return { test_id: 1, test_date: '2026-11-01', first_name: 'Sample',
    last_name: 'Worker', dob: '1990-01-01', gender: 'M',
    occupation_code: '72401', job_title: '', worksafebc_employer_id: '123',
    employer_name: 'Fictional Employer', cu_code: '123456', wsbc_tech_id: '123',
    questionnaire: JSON.stringify(questionnaire), ...thresholds, ...overrides }
}
// Parse quoted commas in the broad occupation descriptions as well.
function parseCsv(csv) {
  const rows = []; let row = [], value = '', quoted = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { value += '"'; i++ }
      else quoted = !quoted
    } else if (c === ',' && !quoted) { row.push(value); value = '' }
    else if (c === '\r' && csv[i + 1] === '\n' && !quoted) {
      row.push(value); rows.push(row); row = []; value = ''; i++
    } else value += c
  }
  row.push(value); rows.push(row); return rows
}

test('MasterDB exports portal-compatible fields without changing stored data', () => {
  dbRows = [fixture()]
  const before = JSON.stringify(dbRows)
  const [headers, values] = parseCsv(generateWsbcCsv([1]).csv)
  assert.equal(headers.length, 59)
  assert.equal(values.length, 59)
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]))
  assert.equal(row['Occupation Job Title'], 'Heavy-duty equipment mechanics')
  assert.equal(row.WhyNotWearHearingProtReg, 'N/A')
  for (const ear of ['Left', 'Right']) {
    for (const f of ['6', '8']) assert.equal(row[`${ear}Ear${f}khz`], '90')
  }
  assert.equal(row.LeftEar05khz, '5')
  assert.equal(JSON.stringify(dbRows), before)
  assert.equal(validateWsbcExport([1]).valid, true)
})

test('existing titles and actual non-use reasons are retained', () => {
  dbRows = [fixture({ job_title: 'Specific mechanic', questionnaire:
    JSON.stringify({ ...questionnaire, wear_hpd: false, hpd_no_reason: 'NONOISE' }) })]
  const [h, v] = parseCsv(generateWsbcCsv([1]).csv)
  assert.equal(v[h.indexOf('Occupation Job Title')], 'Specific mechanic')
  assert.equal(v[h.indexOf('WhyNotWearHearingProtReg')], 'NONOISE')
  assert.equal(validateWsbcExport([1]).valid, true)
})

test('unresolved titles and missing non-use reasons require correction', () => {
  dbRows = [fixture({ occupation_code: 'unknown', questionnaire:
    JSON.stringify({ ...questionnaire, wear_hpd: false, hpd_no_reason: 'N/A' }) })]
  const result = validateWsbcExport([1])
  assert.equal(result.valid, false)
  assert.ok(result.groups.worker[0].fields.includes('Occupation job title'))
  assert.ok(result.groups.test.some(s => s.includes('no reason')))
})

test('conversion preserves numeric zero, missing values, and existing titles', () => {
  assert.equal(helpers.wsbcThreshold(0), '0')
  assert.equal(helpers.wsbcThreshold(null), '')
  assert.equal(helpers.wsbcThreshold(100), '100')
  assert.equal(helpers.wsbcOccupationTitle('Custom role', 'unknown'), 'Custom role')
  assert.equal(helpers.wsbcOccupationTitle('', 'unknown'), '')
})

test('TechTool actual CSV builder uses the same upload conversions', async () => {
  const source = await readFile(new URL('techtool2/screens/tt-test.js', root), 'utf8')
  const start = source.indexOf('  function exportWorksafeBCCsv()')
  const end = source.indexOf('  // ── Print', start)
  const support = source.slice(source.indexOf('function boolToYN('))
  const packet = { tech: { tech_id: 'internal_123', tech_iat: '123456' },
    company: { name: 'Fictional Employer' }, location: { name: '001' },
    employees: [{ first_name: 'Sample', occupation_code: '93100',
    wsbc_worker_id: '987654', dob: '1990-01-01', gender: 'Female',
    completed_tests: [{ test_date: '2026-11-04', questionnaire, thresholds }] }] }
  const before = JSON.stringify(packet)
  let exported
  const sandbox = vm.createContext({ _packet: packet, session: {},
    ...Object.fromEntries(['wsbcThreshold', 'wsbcOccupationTitle', 'wsbcDate', 'wsbcGender', 'wsbcOperatingLocation'].map(k => [k, helpers[k]])),
    captureCsv: (_, rows) => { exported = rows } })
  vm.runInContext(`${support}\ndownloadCsv = captureCsv\n${source.slice(start, end)}\nexportWorksafeBCCsv()`, sandbox)
  const [h, v] = exported
  assert.equal(v.length, 59)
  assert.equal(v[h.indexOf('Technician ID')], '123456')
  assert.equal(v[h.indexOf('Worker ID')], '987654')
  assert.equal(v[h.indexOf('Test Date')], '2026/11/04')
  assert.equal(v[h.indexOf('Birth Date')], '1990/01/01')
  assert.equal(v[h.indexOf('Gender')], 'F')
  assert.equal(v[h.indexOf('Operating Location')], '001 Fictional Employer')
  assert.equal(v[h.indexOf('WhyNotWearHearingProtReg')], 'N/A')
  assert.equal(v[h.indexOf('Occupation Job Title')],
    'Central control and process operators, mineral and metal processing')
  for (const ear of ['Left', 'Right']) for (const f of ['6', '8'])
    assert.equal(v[h.indexOf(`${ear}Ear${f}khz`)], '90')
  assert.equal(JSON.stringify(packet), before)
  packet.tech.tech_iat = null
  exported = null
  sandbox.render = () => {}
  vm.runInContext('exportWorksafeBCCsv()', sandbox)
  assert.equal(exported, null)
  assert.match(sandbox._status.msg, /IAT number/)
})


test('outbound packets preserve known WSBC worker IDs and occupation codes', async () => {
  const schema = await load('shared/packet/schema.js')
  await schema.evaluate()
  const packet = schema.namespace.createPacket({
    company: { name: 'Fictional Employer', province: 'BC' },
    employees: [{ employee_id: 1, wsbc_worker_id: '987654', occupation_code: '72401' },
      { employee_id: 2 }], techId: 'internal_123', techIat: '123456',
    techInitials: 'ST', visitDate: '2026-11-04',
  })
  assert.equal(packet.employees[0].wsbc_worker_id, '987654')
  assert.equal(packet.employees[0].occupation_code, '72401')
  assert.equal(packet.employees[1].wsbc_worker_id, null)
  assert.equal(packet.tech.tech_iat, '123456')
})
