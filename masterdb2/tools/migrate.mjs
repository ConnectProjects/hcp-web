/**
 * masterdb2/tools/migrate.mjs — Phase 1b: one-time migration to MasterDB v2
 * (DESIGN-masterdb-rebuild.md §9). Node + sql.js, runs ONLY on copies in
 * local-tests/rebuild/input/ (git-ignored).
 *
 *   node masterdb2/tools/migrate.mjs   (run from repo root)
 *
 * Reads:  input/*.json                (canonical wire snapshot — copies)
 *         input/remediated-final.sqlite (reference tables: provinces,
 *                                        classification_rules, counsel_templates)
 * Writes: out/masterdb.sqlite          (schema 3.0, person-level identity)
 *         out/review-*.json            (everything a human should eyeball)
 *
 * Person-identity dedup rules (decision log 2026-08-05):
 *  - group within COMPANY by normalized (first, last); cluster by DOB:
 *      one distinct dob  -> merge all (null dobs absorbed, flagged)
 *      all dobs null     -> merge, flagged for review
 *      >=2 distinct dobs -> each dob its own person; null-dob rows stay
 *                           separate people, flagged (never guess)
 *  - survivor = most tests, then earliest created_at, then lowest id
 *  - cross-COMPANY same-name+dob people are NEVER merged, only listed
 *  - after merge: exact-duplicate baselines dropped; if a person has >1
 *    active baseline, the EARLIEST stays active, later ones archived
 * The whole run is deterministic — same input, same output.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { SCHEMA_SQL, UID_SETUP_SQL, PROVINCE_SEED, SCHEMA_VERSION } from '../db/schema.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('../../local-tests/import-packet/node_modules/sql.js')

const THR = ['left_500','left_1k','left_2k','left_3k','left_4k','left_6k','left_8k',
             'right_500','right_1k','right_2k','right_3k','right_4k','right_6k','right_8k']

const readJson = t => JSON.parse(readFileSync(new URL(`../../local-tests/rebuild/input/${t}.json`, import.meta.url), 'utf8'))
const live = rows => rows.filter(r => !r.deleted_at)
const norm = s => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

const summary = []
const say = m => { console.log(m); summary.push(m) }
const fail = m => { console.error(`VERIFY FAIL: ${m}`); process.exitCode = 1; throw new Error(m) }

// ---------------------------------------------------------------------------
// Load input
// ---------------------------------------------------------------------------
const IN = {}
for (const t of ['companies','locations','employees','tests','baselines','hpd_assessments','users','techs','packets','schedules'])
  IN[t] = readJson(t)

const companies = live(IN.companies)
const locations = live(IN.locations)
const employees = live(IN.employees)
const tests     = live(IN.tests)
const baselines = live(IN.baselines)

say(`input (live rows): companies ${companies.length}, locations ${locations.length}, ` +
    `employees ${employees.length}, tests ${tests.length}, baselines ${baselines.length}, ` +
    `tombstoned skipped: ${IN.employees.length - employees.length + IN.tests.length - tests.length + IN.baselines.length - baselines.length}`)

const locById = new Map(locations.map(l => [l.location_id, l]))
const companyOfLoc = id => locById.get(id)?.company_id ?? null

// tests per employee (for survivor choice + current-location derivation)
const testsByEmp = new Map()
for (const t of tests) {
  if (!testsByEmp.has(t.employee_id)) testsByEmp.set(t.employee_id, [])
  testsByEmp.get(t.employee_id).push(t)
}

// ---------------------------------------------------------------------------
// Person-identity dedup
// ---------------------------------------------------------------------------
const groups = new Map()   // company|first|last -> employee rows
const noCompany = []
for (const e of employees) {
  const cid = companyOfLoc(e.location_id)
  if (cid == null) { noCompany.push(e); continue }   // dangling location — keep as own person
  const key = `${cid}|${norm(e.first_name)}|${norm(e.last_name)}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(e)
}

const clusters = []        // arrays of employee rows to merge into one person
const review = { allNullDobMerges: [], nullAbsorbed: [], ambiguousNullDob: [], crossCompany: [], orphanTests: [], baselineArchived: [] }

for (const e of noCompany) clusters.push([e])
for (const [, members] of groups) {
  if (members.length === 1) { clusters.push(members); continue }
  const byDob = new Map(); const nulls = []
  for (const m of members) (m.dob ? (byDob.get(m.dob) ?? byDob.set(m.dob, []).get(m.dob)).push(m) : nulls.push(m))
  const distinct = byDob.size
  if (distinct === 0) {
    clusters.push(nulls)
    if (nulls.length > 1) review.allNullDobMerges.push(desc(nulls))
  } else if (distinct === 1) {
    const all = [...byDob.values()][0].concat(nulls)
    clusters.push(all)
    if (nulls.length && all.length > nulls.length) review.nullAbsorbed.push(desc(all))
  } else {
    for (const same of byDob.values()) clusters.push(same)
    for (const n of nulls) { clusters.push([n]); }
    if (nulls.length) review.ambiguousNullDob.push(desc(members))
  }
}
function desc(rows) {
  return rows.map(r => ({ employee_id: r.employee_id, name: `${r.last_name}, ${r.first_name}`, dob: r.dob ?? null,
                          location_id: r.location_id, tests: testsByEmp.get(r.employee_id)?.length ?? 0 }))
}

// survivor + id mapping
const idMap = new Map()          // old employee_id -> surviving employee_id
const persons = []               // { survivor, members }
for (const c of clusters) {
  const survivor = [...c].sort((a, b) =>
    (testsByEmp.get(b.employee_id)?.length ?? 0) - (testsByEmp.get(a.employee_id)?.length ?? 0) ||
    String(a.created_at).localeCompare(String(b.created_at)) ||
    a.employee_id - b.employee_id)[0]
  for (const m of c) idMap.set(m.employee_id, survivor.employee_id)
  persons.push({ survivor, members: c })
}
const mergedAway = employees.length - persons.length
say(`dedup: ${employees.length} employee rows -> ${persons.length} persons (${mergedAway} duplicate records merged)`)
say(`review: all-null-dob merges ${review.allNullDobMerges.length}, null-dob absorbed ${review.nullAbsorbed.length}, ambiguous (>=2 dobs + nulls kept separate) ${review.ambiguousNullDob.length}`)

// cross-company same-name+dob (list only, never merged)
const xc = new Map()
for (const p of persons) {
  const s = p.survivor
  const key = `${norm(s.first_name)}|${norm(s.last_name)}|${s.dob ?? 'null'}`
  if (!xc.has(key)) xc.set(key, [])
  xc.get(key).push(p)
}
for (const [, ps] of xc) {
  const comps = new Set(ps.map(p => companyOfLoc(p.survivor.location_id)))
  if (ps.length > 1 && comps.size > 1)
    review.crossCompany.push(ps.map(p => ({ employee_id: p.survivor.employee_id, name: `${p.survivor.last_name}, ${p.survivor.first_name}`,
                                            dob: p.survivor.dob ?? null, company_id: companyOfLoc(p.survivor.location_id) })))
}
say(`review: cross-company same-name+dob groups (NOT merged): ${review.crossCompany.length}`)

// ---------------------------------------------------------------------------
// Build the v2 database
// ---------------------------------------------------------------------------
const SQL = await initSqlJs()
const db = new SQL.Database()
db.exec('PRAGMA foreign_keys = OFF')       // we insert in dependency order anyway; keep parity with sql.js defaults
db.exec(SCHEMA_SQL)

const ins = (table, cols) => {
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
  return row => { stmt.run(cols.map(c => row[c] ?? null)); }
}

// reference tables from the remediated snapshot
const ref = new SQL.Database(readFileSync(new URL('../../local-tests/rebuild/input/remediated-final.sqlite', import.meta.url)))
const refRows = sql => { const r = ref.exec(sql); return r.length ? r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : [] }
const provs = refRows('SELECT * FROM provinces')
const rules = refRows('SELECT * FROM classification_rules')
const counsel = refRows('SELECT * FROM counsel_templates')
if (!provs.length) for (const p of PROVINCE_SEED) db.run('INSERT INTO provinces (province_code, province_name, regulation_ref) VALUES (?,?,?)', [p.code, p.name, p.ref])
else provs.forEach(ins('provinces', ['province_code','province_name','regulation_ref','active']))
rules.forEach(ins('classification_rules', ['rule_id','province_code','category_code','category_label','rule_type','threshold_db','freq_range_low','freq_range_high','comparison_basis','followup_months','requires_referral','priority','effective_date','notes']))
counsel.forEach(ins('counsel_templates', ['template_id','province_code','category_code','category_label','summary_text','tech_notes']))
say(`reference: provinces ${provs.length || PROVINCE_SEED.length}, classification_rules ${rules.length}, counsel_templates ${counsel.length}`)
if (!rules.length) fail('no classification_rules in reference snapshot — import would classify nothing')

companies.forEach(ins('companies', ['company_id','name','address','city','contact_name','contact_phone','contact_email','website','sticky_notes','active','created_at','updated_at','uid']))
locations.forEach(ins('locations', ['location_id','company_id','name','province','address','city','postal_code','contact_name','contact_phone','contact_email','cu_code','hpd_inventory','sticky_notes','active','created_at','updated_at','uid']))

// persons: survivor keeps id/uid; merged fields coalesced; current location =
// site of most recent test across ALL merged members, else survivor's old home
const insEmp = ins('employees', ['employee_id','current_location_id','first_name','middle_name','last_name','dob','sin_last_4','phone','email','hire_date','job_title','status','created_at','updated_at','uid'])
for (const p of persons) {
  const s = p.survivor
  const allTests = p.members.flatMap(m => testsByEmp.get(m.employee_id) ?? [])
  const latest = allTests.sort((a, b) => String(b.test_date).localeCompare(String(a.test_date)) || String(b.created_at).localeCompare(String(a.created_at)))[0]
  const nn = f => p.members.map(m => m[f]).find(v => v != null) ?? null
  insEmp({
    ...s,
    dob: s.dob ?? nn('dob'),
    current_location_id: latest?.location_id ?? s.location_id ?? null,
    middle_name: null, sin_last_4: null, phone: null, email: null,
    hire_date: p.members.map(m => m.hire_date).filter(Boolean).sort()[0] ?? null,
    job_title: s.job_title ?? nn('job_title'),
    status: s.status ?? 'active'
  })
}

// tests: remap employee_id; orphans (employee never existed in input) excluded + reported
const empIds = new Set(employees.map(e => e.employee_id))
const insTest = ins('tests', ['test_id','employee_id','location_id','test_date','tech_id','test_type','province', ...THR,
  'classification','triggered_rule_id','sts_flag','counsel_text','tech_notes','questionnaire','packet_id',
  'referral_given_to_worker','referral_sent_to_employer','referral_sent_date','triggering_freq_hz','triggering_ear','shift_db',
  'created_at','updated_at','uid'])
let testCount = 0
for (const t of tests) {
  if (!empIds.has(t.employee_id)) { review.orphanTests.push({ test_id: t.test_id, employee_id: t.employee_id, test_date: t.test_date }); continue }
  insTest({ ...t, employee_id: idMap.get(t.employee_id) ?? t.employee_id, sts_flag: t.sts_flag ?? 0 })
  testCount++
}
say(`tests: ${testCount} migrated, ${review.orphanTests.length} orphans excluded (see review file)`)

// baselines: remap, drop exact dupes, enforce one ACTIVE baseline per person (earliest)
const seen = new Map()   // person|date|thresholds -> true
const byPerson = new Map()
let dupBaselines = 0
for (const b of [...baselines].sort((a, b) => a.baseline_id - b.baseline_id)) {
  if (!empIds.has(b.employee_id)) { dupBaselines; continue }
  const pid = idMap.get(b.employee_id) ?? b.employee_id
  const key = `${pid}|${b.test_date}|${THR.map(f => b[f] ?? '').join(',')}`
  if (seen.has(key)) { dupBaselines++; continue }
  seen.set(key, true)
  if (!byPerson.has(pid)) byPerson.set(pid, [])
  byPerson.get(pid).push({ ...b, employee_id: pid })
}
const insBl = ins('baselines', ['baseline_id','employee_id','location_id','test_date','archived', ...THR, 'created_at','updated_at','uid'])
let blCount = 0, blArchived = 0
for (const [pid, bls] of byPerson) {
  const actives = bls.filter(b => !b.archived).sort((a, b) => String(a.test_date).localeCompare(String(b.test_date)))
  for (let i = 1; i < actives.length; i++) {
    actives[i].archived = 1; blArchived++
    review.baselineArchived.push({ employee_id: pid, kept_active: actives[0].test_date, archived: actives[i].test_date })
  }
  for (const b of bls) { insBl({ ...b, archived: b.archived ? 1 : 0 }); blCount++ }
}
say(`baselines: ${blCount} migrated, ${dupBaselines} exact duplicates dropped, ${blArchived} extra actives archived (earliest stays active)`)

// remaining tables
live(IN.hpd_assessments).forEach(h => ins('hpd_assessments', ['assessment_id','test_id','hpd_make_model','rated_nrr','derated_nrr','lex8hr','protected_exposure','adequacy','uid'])({ ...h, assessment_id: h.assessment_id ?? h.hpd_id }))
IN.users.forEach(ins('users', ['user_id','name','initials','role','folder_name','pin_hash','iat_number','active','created_at','updated_at']))
IN.techs.forEach(ins('techs', ['tech_id','name','initials','email','role','folder_name','iat_number','active','created_at']))
IN.packets.forEach(ins('packets', ['packet_id','company_id','location_id','tech_id','visit_date','filename','status','testing_duration','created_by','created_at','updated_at']))
IN.schedules.forEach(ins('schedules', ['schedule_id','company_id','location_id','tech_id','visit_date','notes','completed','created_at']))

db.exec(UID_SETUP_SQL)
db.run('INSERT INTO meta (id, schema_version, save_seq, last_writer, saved_at) VALUES (1, ?, 1, ?, ?)',
  [SCHEMA_VERSION, 'migration-phase1b', new Date().toISOString()])

// ---------------------------------------------------------------------------
// Verification — every check throws on failure
// ---------------------------------------------------------------------------
const one = sql => db.exec(sql)[0].values[0][0]

const checks = [
  ['companies preserved',  () => one('SELECT COUNT(*) FROM companies') === companies.length],
  ['locations preserved',  () => one('SELECT COUNT(*) FROM locations') === locations.length],
  ['persons = employees - merged', () => one('SELECT COUNT(*) FROM employees') === employees.length - mergedAway],
  ['tests = live - orphans', () => one('SELECT COUNT(*) FROM tests') === tests.length - review.orphanTests.length],
  ['no test without person', () => one('SELECT COUNT(*) FROM tests t LEFT JOIN employees e ON e.employee_id = t.employee_id WHERE e.employee_id IS NULL') === 0],
  ['no baseline without person', () => one('SELECT COUNT(*) FROM baselines b LEFT JOIN employees e ON e.employee_id = b.employee_id WHERE e.employee_id IS NULL') === 0],
  ['one active baseline per person', () => one('SELECT COUNT(*) FROM (SELECT employee_id FROM baselines WHERE archived = 0 GROUP BY employee_id HAVING COUNT(*) > 1)') === 0],
  ['no remaining same-company name+dob duplicate persons', () => one(`
      SELECT COUNT(*) FROM (
        SELECT l.company_id, lower(trim(e.first_name)), lower(trim(e.last_name)), e.dob
        FROM employees e JOIN locations l ON l.location_id = e.current_location_id
        WHERE e.dob IS NOT NULL
        GROUP BY 1,2,3,4 HAVING COUNT(*) > 1)`) === 0],
  ['uid unique per table', () => ['companies','locations','employees','tests','baselines'].every(t =>
      one(`SELECT COUNT(*) - COUNT(DISTINCT uid) FROM ${t}`) === 0)],
  ['every person current_location exists', () => one('SELECT COUNT(*) FROM employees e LEFT JOIN locations l ON l.location_id = e.current_location_id WHERE e.current_location_id IS NOT NULL AND l.location_id IS NULL') === 0],
  ['test history conserved per person', () => {
      // sum of member test counts must equal the person's migrated test count
      for (const p of persons) {
        const want = p.members.reduce((n, m) => n + (testsByEmp.get(m.employee_id)?.length ?? 0), 0)
        const got = one(`SELECT COUNT(*) FROM tests WHERE employee_id = ${p.survivor.employee_id}`)
        if (want !== got) return false
      }
      return true
    }],
  ['classification rules present', () => one('SELECT COUNT(*) FROM classification_rules') > 0]
]
let passed = 0
for (const [name, fn] of checks) {
  if (fn()) { console.log(`  ✓ ${name}`); passed++ }
  else fail(name)
}
say(`verification: ${passed}/${checks.length} checks passed`)

// cross-location persons — the payoff stat for the PoC pitch
const xloc = one(`SELECT COUNT(*) FROM (SELECT employee_id FROM tests GROUP BY employee_id HAVING COUNT(DISTINCT location_id) > 1)`)
say(`persons with test history spanning >1 location (previously split records): ${xloc}`)

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
writeFileSync(new URL('../../local-tests/rebuild/out/masterdb.sqlite', import.meta.url), Buffer.from(db.export()))
for (const [name, data] of Object.entries(review))
  writeFileSync(new URL(`../../local-tests/rebuild/out/review-${name}.json`, import.meta.url), JSON.stringify(data, null, 2))
writeFileSync(new URL('../../local-tests/rebuild/out/summary.txt', import.meta.url), summary.join('\n'))
console.log(`\nWrote out/masterdb.sqlite (${(db.export().length / 1e6).toFixed(1)} MB) + ${Object.keys(review).length} review files`)
