/**
 * Create an isolated, synthetic HCP-Web workspace for Windows QA.
 *
 * Usage from the repository root:
 *   node masterdb2/tools/create-synthetic-qa.mjs
 *   node masterdb2/tools/create-synthetic-qa.mjs C:\\path\\to\\hcp-web-windows-qa
 *
 * The command refuses to replace an existing database. All people and company
 * records created here are fictional and must never be submitted to WorkSafeBC.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MIGRATIONS_3_1,
  PROVINCE_SEED,
  SCHEMA_SQL,
  SCHEMA_VERSION,
  UID_SETUP_SQL,
} from '../db/schema.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('../vendor/sql-wasm.js')
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const outputRoot = resolve(process.argv[2] || resolve(repoRoot, 'local-tests', 'windows-qa'))
const dbPath = resolve(outputRoot, 'db', 'masterdb.sqlite')

try {
  await access(dbPath, constants.F_OK)
  throw new Error(`Refusing to replace existing QA database: ${dbPath}`)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const SQL = await initSqlJs({ locateFile: () => resolve(repoRoot, 'masterdb2', 'vendor', 'sql-wasm.wasm') })
const db = new SQL.Database()
db.run('PRAGMA foreign_keys = ON')
db.run(SCHEMA_SQL)
db.run(UID_SETUP_SQL)
for (const [table, column, definition] of MIGRATIONS_3_1) {
  try { db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`) } catch { /* already in base schema */ }
}

db.run(
  `INSERT INTO meta (id, schema_version, save_seq, last_writer, saved_at)
   VALUES (1, ?, 0, 'Synthetic QA Generator', datetime('now'))`,
  [SCHEMA_VERSION]
)

for (const province of PROVINCE_SEED) {
  db.run(
    `INSERT INTO provinces (province_code, province_name, regulation_ref, active)
     VALUES (?, ?, ?, 1)`,
    [province.code, province.name, province.ref]
  )
}

const rulesDoc = JSON.parse(await readFile(resolve(repoRoot, 'shared', 'rules', 'BC.json'), 'utf8'))
for (const rule of rulesDoc.rules) {
  db.run(
    `INSERT INTO classification_rules
       (rule_id, province_code, category_code, category_label, rule_type,
        threshold_db, freq_range_low, freq_range_high, comparison_basis,
        followup_months, requires_referral, priority, effective_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [rule.rule_id, rule.province_code, rule.category_code, rule.category_label,
     rule.rule_type, rule.threshold_db, rule.freq_range_low, rule.freq_range_high,
     rule.comparison_basis, rule.followup_months, rule.requires_referral ? 1 : 0,
     rule.priority, rule.effective_date, rule.notes]
  )
}

const counselDoc = JSON.parse(await readFile(resolve(repoRoot, 'shared', 'counsel', 'BC.json'), 'utf8'))
for (const template of counselDoc.templates) {
  db.run(
    `INSERT INTO counsel_templates
       (template_id, province_code, category_code, category_label, summary_text, tech_notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [template.template_id, template.province_code, template.category_code,
     template.category_label, template.summary_text, template.tech_notes]
  )
}

const officeUserId = 'qa-office-user'
const techUserId = 'qa-field-user'
const techId = 'qa-field-tech'
const techFolder = 'Windows-QA-Technician'

db.run(
  `INSERT INTO users (user_id, name, initials, role, folder_name, active)
   VALUES (?, 'Windows QA Office', 'QO', 'super_admin', NULL, 1)`,
  [officeUserId]
)
db.run(
  `INSERT INTO users (user_id, name, initials, role, folder_name, iat_number, active)
   VALUES (?, 'Windows QA Technician', 'QT', 'aud_tech', ?, '999999', 1)`,
  [techUserId, techFolder]
)
db.run(
  `INSERT INTO techs (tech_id, name, initials, email, role, folder_name, iat_number, active)
   VALUES (?, 'Windows QA Technician', 'QT', 'qa-technician@example.invalid',
           'aud_tech', ?, '999999', 1)`,
  [techId, techFolder]
)

db.run(
  `INSERT INTO companies
     (name, address, city, contact_name, contact_phone, contact_email,
      worksafebc_employer_id, sticky_notes, active)
   VALUES ('Windows QA Synthetic Employer', '100 Test Bench Road', 'Kelowna',
           'Casey Test', '250-555-0100', 'qa-employer@example.invalid',
           '999999', 'SYNTHETIC QA RECORDS ONLY — DO NOT SUBMIT', 1)`
)
const companyId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]

db.run(
  `INSERT INTO locations
     (company_id, name, province, city, address, postal_code, cu_code, active)
   VALUES (?, 'Windows QA Site', 'BC', 'Kelowna', '100 Test Bench Road',
           'V1Y 1A1', '999999', 1)`,
  [companyId]
)
const locationId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]

const workers = [
  ['Winona', 'Testcase', '1990-01-01', 'Synthetic Equipment Operator', '7452'],
  ['Jordan', 'Example', '1988-06-15', 'Synthetic Maintenance Worker', '7241'],
  ['Morgan', 'Sample', '1995-09-20', 'Synthetic Quality Technician', '2233'],
]
for (const [first, last, dob, title, occupation] of workers) {
  db.run(
    `INSERT INTO employees
       (current_location_id, first_name, last_name, dob, job_title,
        occupation_code, gender, status)
     VALUES (?, ?, ?, ?, ?, ?, 'X', 'active')`,
    [locationId, first, last, dob, title, occupation]
  )
}

await mkdir(resolve(outputRoot, 'db', 'backups'), { recursive: true })
for (const subfolder of ['outbox', 'inbox', 'archive']) {
  await mkdir(resolve(outputRoot, 'techs', techFolder, subfolder), { recursive: true })
}
await mkdir(resolve(outputRoot, 'archive'), { recursive: true })
await writeFile(dbPath, Buffer.from(db.export()))
await writeFile(
  resolve(outputRoot, 'SYNTHETIC-QA-ONLY.txt'),
  `HCP-Web Windows QA workspace\n\nAll records are fictional.\nDo not connect or submit this data to WorkSafeBC.\nGenerated: ${new Date().toISOString()}\n`,
  'utf8'
)
db.close()

console.log(`Synthetic QA workspace created:\n${outputRoot}`)
console.log('Office user: Windows QA Office')
console.log('Field user:  Windows QA Technician')
console.log('Select the workspace root above when HCP-Web asks for folder access.')
