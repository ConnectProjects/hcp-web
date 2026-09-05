/**
 * masterdb2/db/schema.js — MasterDB v2, Schema 3.0
 *
 * Single source of truth for the v2 database shape. Consumed by the app's
 * sqlite layer AND by the one-time migration harness (local-tests/rebuild/),
 * so the migrated file and a fresh install can never drift apart.
 *
 * Changes from schema 2.3 (see DESIGN-masterdb-rebuild.md §3):
 *  - employees: identity at PERSON level. location_id is gone; the non-identity
 *    roster pointer current_location_id replaces it. New identity/contact
 *    fields: middle_name, sin_last_4, phone, email.
 *  - employment: dropped (nothing populated it; test location stamps cover it).
 *  - hpd_assessments: pk standardized on assessment_id (what deployed data has;
 *    2.3's schema.js said hpd_id — the fork found during the uid work).
 *  - meta: single-row table carrying save_seq/last_writer/saved_at — the
 *    optimistic-concurrency generation counter for fsa-store saves.
 *  - backup_log: bookkeeping for pre-import snapshots.
 *  - help_content: dropped (docs live in the repo's markdown manuals).
 *  - uid columns + stamp-on-insert triggers kept: uids are the stable external
 *    references packets carry (schema 1.1), even though the single-canonical
 *    architecture no longer needs them for merging.
 */

export const SCHEMA_VERSION = '3.1'

export const SCHEMA_SQL = `
-- 0. CONCURRENCY / IDENTITY OF THE FILE ITSELF
CREATE TABLE IF NOT EXISTS meta (
  id          INTEGER PRIMARY KEY CHECK (id = 1),   -- exactly one row
  schema_version TEXT NOT NULL,
  save_seq    INTEGER NOT NULL DEFAULT 0,   -- incremented on every save; stale-save guard
  last_writer TEXT,                          -- user/machine that produced this save
  saved_at    TEXT
);

-- 1. REFERENCE DATA
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

-- 2. USERS / RBAC
CREATE TABLE IF NOT EXISTS users (
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

-- 3. AUDIT
CREATE TABLE IF NOT EXISTS system_log (
  log_id      TEXT PRIMARY KEY,
  user_id     TEXT,
  user_name   TEXT,
  action      TEXT,
  details     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backup_log (
  backup_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,
  reason      TEXT NOT NULL,           -- 'pre-import:<packet_id>' | 'manual'
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
  sticky_notes           TEXT,
  worksafebc_employer_id TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  uid           TEXT,
  deleted_at    TEXT
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
  uid           TEXT,
  deleted_at    TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (province)   REFERENCES provinces(province_code)
);

-- Person-level identity. current_location_id is a ROSTER POINTER, never part
-- of identity — a worker changing branches is one UPDATE here; their history
-- follows automatically because tests hang off employee_id.
CREATE TABLE IF NOT EXISTS employees (
  employee_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  current_location_id INTEGER,
  first_name    TEXT NOT NULL,
  middle_name   TEXT,
  last_name     TEXT NOT NULL,
  wsbc_worker_id TEXT,
  dob           TEXT,
  sin_last_4    TEXT,
  phone         TEXT,
  email         TEXT,
  hire_date     TEXT,
  job_title     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  uid           TEXT,
  deleted_at    TEXT,
  FOREIGN KEY (current_location_id) REFERENCES locations(location_id)
);

-- 5. DATA (every test is stamped with the location where it happened)
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
  uid                       TEXT,
  deleted_at                TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS hpd_assessments (
  assessment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id            INTEGER NOT NULL,
  hpd_make_model     TEXT,
  rated_nrr          REAL,
  derated_nrr        REAL,
  lex8hr             REAL,
  protected_exposure REAL,
  adequacy           TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  uid                TEXT,
  deleted_at         TEXT,
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
  uid           TEXT,
  deleted_at    TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

-- 6. WORKFLOW
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
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 7. INDEXES
CREATE INDEX IF NOT EXISTS idx_locations_company   ON locations(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_location  ON employees(current_location_id);
CREATE INDEX IF NOT EXISTS idx_employees_name      ON employees(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_tests_employee      ON tests(employee_id);
CREATE INDEX IF NOT EXISTS idx_tests_location      ON tests(location_id);
CREATE INDEX IF NOT EXISTS idx_tests_date          ON tests(test_date);
CREATE INDEX IF NOT EXISTS idx_baselines_employee  ON baselines(employee_id);
CREATE INDEX IF NOT EXISTS idx_hpd_test            ON hpd_assessments(test_id);
`

// Tables whose rows carry a uid (stable external reference used by packets).
export const UID_TABLES = ['companies', 'locations', 'employees', 'tests', 'baselines', 'hpd_assessments']

/** Unique uid indexes + stamp-on-insert triggers (same proven pattern as 2.3). */
export const UID_SETUP_SQL = UID_TABLES.map(t => `
CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_uid ON ${t}(uid);
CREATE TRIGGER IF NOT EXISTS ${t}_set_uid
  AFTER INSERT ON ${t} WHEN NEW.uid IS NULL
  BEGIN
    UPDATE ${t} SET uid = lower(hex(randomblob(16))) WHERE rowid = NEW.rowid;
  END;`).join('\n')

export const PROVINCE_SEED = [
  { code: 'AB', name: 'Alberta',          ref: 'OHS Code Part 16, Schedule 3' },
  { code: 'BC', name: 'British Columbia', ref: 'WorkSafeBC Audiometric Testing Guidelines' },
  { code: 'SK', name: 'Saskatchewan',     ref: 'OHS Regulations 1996, s.113' }
]

/**
 * Schema 3.1 additive migrations — run at DB open time via runMigrations().
 * Each entry: [table, column, column_def]. ALTER TABLE is a no-op in a try/catch
 * if the column already exists, so this is safe to run every open.
 */
export const MIGRATIONS_3_1 = [
  ['companies', 'worksafebc_employer_id', 'TEXT'],
  ['employees', 'wsbc_worker_id',         'TEXT'],
]
