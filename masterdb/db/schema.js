/**
 * Database schema initialization.
 * 
 * Schema version: 2.2
 * Changes:
 *   - Added updated_at to employees, tests, baselines, users for sync merge support.
 */

import { getDB, run, query } from './sqlite.js'

const CREATE_TABLES = `

-- 1. PROVINCES & RULES
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

-- 2. USER MANAGEMENT (RBAC)
CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  initials      TEXT,
  role          TEXT DEFAULT 'tech',
  folder_name   TEXT,
  pin_hash      TEXT,
  iat_number    TEXT,
  active        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 3. AUDIT LOGGING
CREATE TABLE IF NOT EXISTS system_log (
  log_id      TEXT PRIMARY KEY,
  user_id     TEXT,
  user_name   TEXT,
  action      TEXT,
  details     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 4. ENTITIES (Pruned for Schema 2.1)
CREATE TABLE IF NOT EXISTS companies (
  company_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  location_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  province      TEXT NOT NULL,
  hpd_inventory TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (province)   REFERENCES provinces(province_code)
);

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
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

-- 5. DATA
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
  sts_flag                  INTEGER NOT NULL DEFAULT 0,
  counsel_text              TEXT,
  tech_notes                TEXT,
  questionnaire             TEXT,
  packet_id                 TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

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
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS techs (
  tech_id      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  initials     TEXT,
  email        TEXT,
  role         TEXT NOT NULL DEFAULT 'tech',
  folder_name  TEXT,
  iat_number   TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
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
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`

// ---------------------------------------------------------------------------
// Migrations — runs once, silently skips if column already exists
// ---------------------------------------------------------------------------

const MIGRATIONS = [
  {
    add: `ALTER TABLE employees ADD COLUMN updated_at TEXT DEFAULT ''`,
    backfill: `UPDATE employees SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL`
  },
  {
    add: `ALTER TABLE tests ADD COLUMN updated_at TEXT DEFAULT ''`,
    backfill: `UPDATE tests SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL`
  },
  {
    add: `ALTER TABLE baselines ADD COLUMN updated_at TEXT DEFAULT ''`,
    backfill: `UPDATE baselines SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL`
  },
  {
    add: `ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT ''`,
    backfill: `UPDATE users SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL`
  }
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initSchema() {
  const db = getDB()
  db.run(CREATE_TABLES)

  // Run migrations (safe to re-run — ALTER TABLE fails silently if column exists)
  for (const m of MIGRATIONS) {
    try {
      run(m.add);
      run(m.backfill);
    } catch (e) {
      // Column already exists — skip
    }
  }

  // employees — drop legacy company_id NOT NULL column, replaced by location_id.
  // SQLite can't alter column constraints, so recreate the table.
  // Older locally-created databases predating the location_id refactor still
  // carry this column, which breaks inserts/merge-sync rows that omit it.
  try {
    const hasCo = query(`SELECT * FROM pragma_table_info('employees') WHERE name = 'company_id'`).length > 0
    if (hasCo) {
      db.run(`CREATE TABLE employees_new (
        employee_id   INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id   INTEGER,
        first_name    TEXT NOT NULL,
        last_name     TEXT NOT NULL,
        dob           TEXT,
        hire_date     TEXT,
        job_title     TEXT,
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (location_id) REFERENCES locations(location_id)
      )`)
      db.run(`INSERT INTO employees_new
        (employee_id, location_id, first_name, last_name, dob, hire_date, job_title, status, created_at, updated_at)
        SELECT employee_id, location_id, first_name, last_name, dob, hire_date, job_title, status, created_at, updated_at
        FROM employees`)
      db.run(`DROP TABLE employees`)
      db.run(`ALTER TABLE employees_new RENAME TO employees`)
    }
  } catch (e) { console.warn('employees table migration:', e) }

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
  }
}