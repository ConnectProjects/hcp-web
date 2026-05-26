/**
 * Database schema initialization and province seed data.
 * Call initSchema() once after initDB() on first boot.
 * Safe to call on subsequent boots — all statements use IF NOT EXISTS.
 *
 * Schema version: 2.0
 * Changes from 1.x:
 *   - Added locations table (province, CU code, contact info per location)
 *   - Added employment table (employee ↔ location history)
 *   - Added location_id to employees, tests, baselines, packets
 *   - companies.province removed (province now lives on location)
 */

import { getDB, run, query, transaction } from './sqlite.js'

const CREATE_TABLES = `

CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  initials      TEXT,
  role          TEXT DEFAULT 'tech',
  folder_name   TEXT,
  pin_hash      TEXT,
  active        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provinces (
  province_code  TEXT PRIMARY KEY,
  province_name  TEXT NOT NULL,
  regulation_ref TEXT,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS classification_rules (
  rule_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  province_code    TEXT NOT NULL,
  category_code    TEXT NOT NULL,
  category_label   TEXT NOT NULL,
  rule_type        TEXT NOT NULL,
  threshold_db     REAL NOT NULL,
  freq_range_low   INTEGER,
  freq_range_high  INTEGER,
  comparison_basis TEXT NOT NULL DEFAULT 'baseline',
  followup_months  INTEGER,
  requires_referral INTEGER NOT NULL DEFAULT 0,
  priority         INTEGER NOT NULL DEFAULT 50,
  effective_date   TEXT,
  notes            TEXT,
  FOREIGN KEY (province_code) REFERENCES provinces(province_code)
);

CREATE TABLE IF NOT EXISTS counsel_templates (
  template_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  province_code  TEXT NOT NULL,
  category_code  TEXT NOT NULL,
  category_label TEXT NOT NULL,
  summary_text   TEXT NOT NULL,
  tech_notes     TEXT,
  FOREIGN KEY (province_code) REFERENCES provinces(province_code)
);

CREATE TABLE IF NOT EXISTS techs (
  tech_id      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  initials     TEXT NOT NULL,
  email        TEXT,
  role         TEXT NOT NULL DEFAULT 'tech',
  folder_name  TEXT,
  iat_number   TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Companies — umbrella entity, HQ contact info only
-- Province lives on locations, not here
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  company_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website       TEXT,
  sticky_notes  TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Locations — a physical site belonging to a company
-- Has its own province, contact info, and CU code
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS locations (
  location_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  province      TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  postal_code   TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  cu_code       TEXT,
  hpd_inventory TEXT NOT NULL DEFAULT '[]',
  sticky_notes  TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (province)   REFERENCES provinces(province_code)
);

-- ----------------------------------------------------------------------------
-- Employees — independent records, not permanently tied to one location
-- location_id here is a convenience pointer to their current primary location
-- Full history is in the employment table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employees (
  employee_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  dob           TEXT,
  hire_date     TEXT,
  job_title     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

-- ----------------------------------------------------------------------------
-- Employment — tracks which locations an employee has worked at and when
-- An employee can have multiple active records (e.g. two concurrent employers)
-- end_date NULL means currently active at that location
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employment (
  employment_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    INTEGER NOT NULL,
  location_id    INTEGER NOT NULL,
  job_title      TEXT,
  start_date     TEXT,
  end_date       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

-- ----------------------------------------------------------------------------
-- Baselines — tied to employee AND location
-- Each employer/location owns their baseline for the employee (AB OHS req)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS baselines (
  baseline_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL,
  location_id   INTEGER,
  test_date     TEXT NOT NULL,
  archived      INTEGER NOT NULL DEFAULT 0,
  left_500      REAL, left_1k  REAL, left_2k  REAL, left_3k  REAL,
  left_4k       REAL, left_6k  REAL, left_8k  REAL,
  right_500     REAL, right_1k REAL, right_2k REAL, right_3k REAL,
  right_4k      REAL, right_6k REAL, right_8k REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

-- ----------------------------------------------------------------------------
-- Tests — snapshot includes location and province at time of test
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tests (
  test_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id          INTEGER NOT NULL,
  location_id          INTEGER,
  test_date            TEXT NOT NULL,
  tech_id              TEXT,
  test_type            TEXT NOT NULL DEFAULT 'Periodic',
  province             TEXT NOT NULL,
  left_500   REAL, left_1k  REAL, left_2k  REAL, left_3k  REAL,
  left_4k    REAL, left_6k  REAL, left_8k  REAL,
  right_500  REAL, right_1k REAL, right_2k REAL, right_3k REAL,
  right_4k   REAL, right_6k REAL, right_8k REAL,
  classification            TEXT,
  triggered_rule_id         INTEGER,
  triggering_freq_hz        TEXT,
  triggering_ear            TEXT,
  shift_db                  REAL,
  sts_flag                  INTEGER NOT NULL DEFAULT 0,
  referral_given_to_worker  INTEGER NOT NULL DEFAULT 0,
  referral_sent_to_employer INTEGER NOT NULL DEFAULT 0,
  referral_sent_date        TEXT,
  counsel_text              TEXT,
  tech_notes                TEXT,
  questionnaire             TEXT,
  packet_id                 TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS hpd_assessments (
  assessment_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id             INTEGER NOT NULL,
  hpd_make_model      TEXT,
  rated_nrr           REAL,
  derated_nrr         REAL,
  lex8hr              REAL,
  protected_exposure  REAL,
  adequacy            TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (test_id) REFERENCES tests(test_id)
);

-- ----------------------------------------------------------------------------
-- Packets — now reference a location instead of just a company
-- company_id kept for quick rollup queries without joining through location
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS packets (
  packet_id     TEXT PRIMARY KEY,
  company_id    INTEGER NOT NULL,
  location_id   INTEGER,
  tech_id       TEXT,
  visit_date    TEXT NOT NULL,
  filename      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  testing_duration TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id)  REFERENCES companies(company_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL,
  location_id   INTEGER,
  tech_id       TEXT,
  visit_date    TEXT NOT NULL,
  notes         TEXT,
  completed     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id)  REFERENCES companies(company_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

`

export async function initSchema() {
  const db = getDB()
  db.run(CREATE_TABLES)

  // --------------------------------------------------------------------------
  // Column migrations — safe to run on every boot
  // --------------------------------------------------------------------------

  // techs
  try { db.run('ALTER TABLE techs ADD COLUMN folder_name TEXT') }  catch { /* exists */ }
  try { db.run('ALTER TABLE techs ADD COLUMN iat_number  TEXT') }  catch { /* exists */ }

  // tests
  try { db.run('ALTER TABLE tests ADD COLUMN location_id INTEGER REFERENCES locations(location_id)') } catch { /* exists */ }
  try { db.run('ALTER TABLE tests ADD COLUMN referral_given_to_worker  INTEGER NOT NULL DEFAULT 0') }   catch { /* exists */ }
  try { db.run('ALTER TABLE tests ADD COLUMN referral_sent_to_employer INTEGER NOT NULL DEFAULT 0') }   catch { /* exists */ }
  try { db.run('ALTER TABLE tests ADD COLUMN referral_sent_date TEXT') }                                catch { /* exists */ }
  try { db.run('ALTER TABLE tests ADD COLUMN questionnaire TEXT') }                                     catch { /* exists */ }

  // baselines
  try { db.run('ALTER TABLE baselines ADD COLUMN location_id INTEGER REFERENCES locations(location_id)') } catch { /* exists */ }

  // employees
  try { db.run('ALTER TABLE employees ADD COLUMN location_id INTEGER REFERENCES locations(location_id)') } catch { /* exists */ }

  // packets
  try { db.run('ALTER TABLE packets ADD COLUMN location_id INTEGER REFERENCES locations(location_id)') } catch { /* exists */ }
  try { db.run('ALTER TABLE packets ADD COLUMN testing_duration TEXT') }                                  catch { /* exists */ }

  // companies — city and website may not exist on older installs
  try { db.run('ALTER TABLE companies ADD COLUMN city    TEXT') } catch { /* exists */ }
  try { db.run('ALTER TABLE companies ADD COLUMN website TEXT') } catch { /* exists */ }

  // schedules
  try { db.run('ALTER TABLE schedules ADD COLUMN location_id INTEGER REFERENCES locations(location_id)') } catch { /* exists */ }

  // --------------------------------------------------------------------------
  // Table migrations — recreate tables that had structural constraint changes
  // --------------------------------------------------------------------------

  // employees — drop company_id NOT NULL constraint, replace with location_id
  // SQLite cannot alter column constraints so we recreate the table
  try {
    db.run(`CREATE TABLE IF NOT EXISTS employees_new (
      employee_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id   INTEGER,
      first_name    TEXT NOT NULL,
      last_name     TEXT NOT NULL,
      dob           TEXT,
      hire_date     TEXT,
      job_title     TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(location_id)
    )`)
    db.run(`INSERT OR IGNORE INTO employees_new
      (employee_id, location_id, first_name, last_name, dob, hire_date, job_title, status, created_at)
      SELECT employee_id, location_id, first_name, last_name, dob, hire_date, job_title, status, created_at
      FROM employees`)
    db.run(`DROP TABLE employees`)
    db.run(`ALTER TABLE employees_new RENAME TO employees`)
  } catch (e) { console.warn('employees table migration:', e) }

  // companies — drop province NOT NULL constraint
try {
  const hasProvince = query(`SELECT * FROM pragma_table_info('companies') WHERE name = 'province'`).length > 0
  if (hasProvince) {
    db.run(`CREATE TABLE IF NOT EXISTS companies_new (
      company_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      address       TEXT,
      city          TEXT,
      contact_name  TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      website       TEXT,
      sticky_notes  TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    db.run(`INSERT INTO companies_new
      (company_id, name, address, city, contact_name, contact_phone, contact_email, website, sticky_notes, active, created_at, updated_at)
      SELECT company_id, name, address, city, contact_name, contact_phone, contact_email, website, sticky_notes, active, created_at, updated_at
      FROM companies`)
    db.run(`DROP TABLE companies`)
    db.run(`ALTER TABLE companies_new RENAME TO companies`)
  }
} catch (e) { console.warn('companies table migration:', e) }

  // --------------------------------------------------------------------------
  // Data migrations
  // --------------------------------------------------------------------------

  // AB Rule 5 — Standard Threshold Shift (STS)
  try {
    run(`INSERT OR IGNORE INTO classification_rules
      (rule_id, province_code, category_code, category_label, rule_type,
       threshold_db, freq_range_low, freq_range_high, comparison_basis,
       followup_months, requires_referral, priority, effective_date, notes)
      VALUES (5, 'AB', 'EW', 'Standard Threshold Shift', 'STS',
       10, 2000, 4000, 'baseline', null, 0, 60, '2020-01-01',
       'STS: average shift >= 10 dB at 2000, 3000, 4000 Hz in either ear — OHS Code Part 16.')`)
  } catch { /* safe */ }

  // AB EW counsel template
  try {
    run(`INSERT OR IGNORE INTO counsel_templates
      (template_id, province_code, category_code, category_label, summary_text, tech_notes)
      VALUES (3, 'AB', 'EW', 'Standard Threshold Shift',
       'Your hearing test today shows a Standard Threshold Shift (STS) of [shift] dB averaged at 2000, 3000, and 4000 Hz in your [ear] ear compared to your baseline. Under Alberta OHS Code Part 16, this result must be recorded and the findings must be forwarded to a physician or audiologist for review within 30 days. Please ensure you are wearing your hearing protection correctly and consistently in all noisy work areas.',
       'STS detected — average shift of [shift] dB at 2K+3K+4K Hz ([ear] ear) vs baseline. Required actions under AB OHS Code Part 16:

1. Advise worker of results within 30 days.
2. Forward results, medical history, and baseline audiogram to designated physician or audiologist for assessment.
3. Physician/audiologist must advise worker of confirmation within 30 days of receiving results.

Discuss HPD fit, type, and consistent use. Document any tinnitus complaints. Next test follows normal schedule (annual or biennial as applicable).')`)
  } catch { /* safe */ }

  // Keep AB EW counsel text current
  try {
    run(`UPDATE counsel_templates
         SET summary_text = 'Your hearing test today shows a Standard Threshold Shift (STS) of [shift] dB averaged at 2000, 3000, and 4000 Hz in your [ear] ear compared to your baseline. Under Alberta OHS Code Part 16, this result must be recorded and the findings must be forwarded to a physician or audiologist for review within 30 days. Please ensure you are wearing your hearing protection correctly and consistently in all noisy work areas.',
             tech_notes   = 'STS detected — average shift of [shift] dB at 2K+3K+4K Hz ([ear] ear) vs baseline. Required actions under AB OHS Code Part 16:

1. Advise worker of results within 30 days.
2. Forward results, medical history, and baseline audiogram to designated physician or audiologist for assessment.
3. Physician/audiologist must advise worker of confirmation within 30 days of receiving results.

Discuss HPD fit, type, and consistent use. Document any tinnitus complaints. Next test follows normal schedule (annual or biennial as applicable).'
         WHERE template_id = 3 AND province_code = 'AB'`)
  } catch { /* safe */ }

  // BC NC label fixes
  try { run(`UPDATE classification_rules SET category_label = 'Normal Change' WHERE rule_id = 105 AND province_code = 'BC'`) } catch { /* safe */ }
  try { run(`UPDATE counsel_templates SET category_label = 'Normal Change (Periodic)' WHERE template_id = 13 AND province_code = 'BC'`) } catch { /* safe */ }

  // BC N display rule
  try {
    run(`INSERT OR IGNORE INTO classification_rules
      (rule_id, province_code, category_code, category_label, rule_type,
       threshold_db, freq_range_low, freq_range_high, comparison_basis,
       followup_months, requires_referral, priority, effective_date, notes)
      VALUES (106, 'BC', 'N', 'Normal', 'default', 0, null, null, 'current',
       null, 0, 1, '2020-01-01', 'Baseline N fallback — display only.')`)
  } catch { /* safe */ }

  // Seed provinces if empty
  const existing = query('SELECT COUNT(*) AS n FROM provinces')[0]?.n ?? 0
  if (existing === 0) await seedProvinces()
}

async function seedProvinces() {
  const provinces = [
    { code: 'AB', name: 'Alberta',         ref: 'OHS Code Part 16, Schedule 3' },
    { code: 'BC', name: 'British Columbia', ref: 'WorkSafeBC Audiometric Testing Guidelines' },
    { code: 'SK', name: 'Saskatchewan',     ref: 'OHS Regulations 1996, s.113' }
  ]

  for (const p of provinces) {
    run('INSERT OR IGNORE INTO provinces (province_code, province_name, regulation_ref) VALUES (?, ?, ?)',
      [p.code, p.name, p.ref])

    try {
      const rulesResp = await fetch(`../shared/rules/${p.code}.json`)
      const rulesData = await rulesResp.json()
      for (const r of rulesData.rules) {
        run(`INSERT OR IGNORE INTO classification_rules
          (rule_id, province_code, category_code, category_label, rule_type,
           threshold_db, freq_range_low, freq_range_high, comparison_basis,
           followup_months, requires_referral, priority, effective_date, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.rule_id, r.province_code, r.category_code, r.category_label,
           r.rule_type, r.threshold_db, r.freq_range_low ?? null, r.freq_range_high ?? null,
           r.comparison_basis, r.followup_months ?? null, r.requires_referral ? 1 : 0,
           r.priority, r.effective_date ?? null, r.notes ?? null])
      }
    } catch (e) { console.warn(`Could not seed rules for ${p.code}:`, e) }

    try {
      const counselResp = await fetch(`../shared/counsel/${p.code}.json`)
      const counselData = await counselResp.json()
      for (const t of counselData.templates) {
        run(`INSERT OR IGNORE INTO counsel_templates
          (template_id, province_code, category_code, category_label, summary_text, tech_notes)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [t.template_id, t.province_code, t.category_code, t.category_label,
           t.summary_text, t.tech_notes ?? null])
      }
    } catch (e) { console.warn(`Could not seed counsel for ${p.code}:`, e) }
  }
}
