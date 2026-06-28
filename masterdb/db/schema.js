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

-- 4. ENTITIES
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

CREATE TABLE IF NOT EXISTS employment (
  employment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL,
  location_id   INTEGER NOT NULL,
  job_title     TEXT,
  start_date    TEXT,
  end_date      TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
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
  referral_given_to_worker  INTEGER DEFAULT 0,
  referral_sent_to_employer INTEGER DEFAULT 0,
  referral_sent_date        TEXT,
  triggering_freq_hz        INTEGER,
  triggering_ear            TEXT,
  shift_db                  REAL,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS hpd_assessments (
  hpd_id             INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id            INTEGER NOT NULL,
  hpd_make_model     TEXT,
  rated_nrr          REAL,
  derated_nrr        REAL,
  lex8hr             REAL,
  protected_exposure REAL,
  adequacy           TEXT,
  FOREIGN KEY (test_id) REFERENCES tests(test_id)
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

CREATE TABLE IF NOT EXISTS help_content (
  section_id TEXT PRIMARY KEY,
  content    TEXT
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
  },

  {
    add: `SELECT 1`, // no-op placeholder, backfill does the real work
    backfill: `
      UPDATE tests SET test_type = 'Baseline'
      WHERE test_id IN (
        SELECT t1.test_id FROM tests t1
        WHERE t1.test_date = (
          SELECT MIN(t2.test_date) FROM tests t2
          WHERE t2.employee_id = t1.employee_id
        )
        AND t1.test_type != 'Baseline'
      )
    `
  },

  // Role assignments — conditional so manual promotions via the UI are never downgraded
  {
    add: `SELECT 1`,
    backfill: `UPDATE users SET role = 'super-admin', updated_at = datetime('now')
               WHERE name IN ('Norm-Super', 'Jan') AND role != 'super-admin'`
  },
  {
    add: `SELECT 1`,
    backfill: `UPDATE users SET role = 'admin', updated_at = datetime('now')
               WHERE name IN ('Heather', 'Judy') AND role NOT IN ('super-admin', 'admin')`
  },
  {
    add: `SELECT 1`,
    backfill: `UPDATE users SET role = 'lc', updated_at = datetime('now')
               WHERE name IN ('Cliff', 'Darren', 'David', 'Logistical Coordinator', 'Paul', 'Tanya')
               AND role NOT IN ('super-admin', 'admin', 'billing', 'lc')`
  }

];

// ---------------------------------------------------------------------------
// Table rebuilds — for tables whose column set has changed across schema
// versions. Each entry's `columns` must match its current CREATE_TABLES
// definition above exactly.
// ---------------------------------------------------------------------------

const REBUILD_DEFS = {
  companies: {
    columns: ['company_id', 'name', 'address', 'city', 'contact_name', 'contact_phone', 'contact_email', 'website', 'sticky_notes', 'active', 'created_at', 'updated_at'],
    sql: `CREATE TABLE companies_new (
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
    )`
  },
  locations: {
    columns: ['location_id', 'company_id', 'name', 'province', 'address', 'city', 'postal_code', 'contact_name', 'contact_phone', 'contact_email', 'cu_code', 'hpd_inventory', 'sticky_notes', 'active', 'created_at', 'updated_at'],
    sql: `CREATE TABLE locations_new (
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
      FOREIGN KEY (company_id) REFERENCES companies(company_id)
    )`
  },
  employees: {
    columns: ['employee_id', 'location_id', 'first_name', 'last_name', 'dob', 'hire_date', 'job_title', 'status', 'created_at', 'updated_at'],
    sql: `CREATE TABLE employees_new (
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
    )`
  },
  tests: {
    columns: [
      'test_id', 'employee_id', 'location_id', 'test_date', 'tech_id', 'test_type', 'province',
      'left_500', 'left_1k', 'left_2k', 'left_3k', 'left_4k', 'left_6k', 'left_8k',
      'right_500', 'right_1k', 'right_2k', 'right_3k', 'right_4k', 'right_6k', 'right_8k',
      'classification', 'triggered_rule_id', 'sts_flag', 'counsel_text', 'tech_notes', 'questionnaire', 'packet_id',
      'referral_given_to_worker', 'referral_sent_to_employer', 'referral_sent_date',
      'triggering_freq_hz', 'triggering_ear', 'shift_db',
      'created_at', 'updated_at'
    ],
    sql: `CREATE TABLE tests_new (
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
      referral_given_to_worker  INTEGER DEFAULT 0,
      referral_sent_to_employer INTEGER DEFAULT 0,
      referral_sent_date        TEXT,
      triggering_freq_hz        INTEGER,
      triggering_ear            TEXT,
      shift_db                  REAL,
      created_at                TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
      FOREIGN KEY (location_id) REFERENCES locations(location_id)
    )`
  },
  baselines: {
    columns: [
      'baseline_id', 'employee_id', 'location_id', 'test_date', 'archived',
      'left_500', 'left_1k', 'left_2k', 'left_3k', 'left_4k', 'left_6k', 'left_8k',
      'right_500', 'right_1k', 'right_2k', 'right_3k', 'right_4k', 'right_6k', 'right_8k',
      'created_at', 'updated_at'
    ],
    sql: `CREATE TABLE baselines_new (
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
    )`
  },
  packets: {
    columns: ['packet_id', 'company_id', 'location_id', 'tech_id', 'visit_date', 'filename', 'status', 'testing_duration', 'created_at', 'updated_at'],
    sql: `CREATE TABLE packets_new (
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
    )`
  },
  users: {
    columns: ['user_id', 'name', 'initials', 'role', 'folder_name', 'pin_hash', 'iat_number', 'active', 'created_at', 'updated_at'],
    sql: `CREATE TABLE users_new (
      user_id       TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      initials      TEXT,
      role          TEXT DEFAULT 'tech',
      folder_name   TEXT,
      pin_hash      TEXT,
      iat_number    TEXT,
      active        INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    )`
  }
}

/**
 * Rebuilds `table` if its actual local columns don't match REBUILD_DEFS,
 * copying over only the columns both sides have. No-op if the table
 * doesn't exist yet (CREATE_TABLES already made it with the current shape)
 * or already matches.
 */
function reconcileTable(table) {
  const def = REBUILD_DEFS[table]
  const localCols = new Set(query(`SELECT name FROM pragma_table_info('${table}')`).map(r => r.name))
  if (localCols.size === 0) return

  const matches = def.columns.length === localCols.size && def.columns.every(c => localCols.has(c))
  if (matches) return

  const copyCols = def.columns.filter(c => localCols.has(c)).join(', ')
  run(def.sql)
  run(`INSERT INTO ${table}_new (${copyCols}) SELECT ${copyCols} FROM ${table}`)
  run(`DROP TABLE ${table}`)
  run(`ALTER TABLE ${table}_new RENAME TO ${table}`)
}

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

  // Reconcile tables whose shape has changed across schema versions (e.g.
  // companies used to carry a NOT NULL province column directly, before
  // that moved to locations; employees used to carry company_id, before
  // that moved to location_id). SQLite can't alter column constraints or
  // drop columns, so any local database older than the current shape
  // needs its table rebuilt — otherwise stale NOT NULL columns the app no
  // longer writes break every insert, including merge-sync rows that omit
  // them.
  for (const table of Object.keys(REBUILD_DEFS)) {
    try {
      reconcileTable(table)
    } catch (e) {
      console.warn(`${table} table migration:`, e)
    }
  }

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
