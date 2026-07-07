-- =====================================================
-- Lead Finder — Initial Schema
-- =====================================================

-- NAICS reference data (seeded once from Statistics Canada RDaaS)
CREATE TABLE IF NOT EXISTS naics_reference (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        UNIQUE NOT NULL,
  descriptor    text        NOT NULL,
  definition    text,
  level_depth   int,
  is_noise_hazard boolean   DEFAULT false,
  hazard_score  int         CHECK (hazard_score BETWEEN 1 AND 5),
  created_at    timestamptz DEFAULT now()
);

COMMENT ON TABLE naics_reference IS
  'NAICS code lookup seeded from Statistics Canada RDaaS. '
  'is_noise_hazard and hazard_score are manually curated by admin.';

-- Core leads table
CREATE TABLE IF NOT EXISTS companies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  address          text,
  city             text,
  province         text,
  phone            text,
  email            text,
  website          text,
  naics_code       text        REFERENCES naics_reference(code),
  naics_confidence text        DEFAULT 'unknown'
                               CHECK (naics_confidence IN ('confirmed', 'inferred', 'unknown')),
  hazard_score     int         CHECK (hazard_score BETWEEN 1 AND 5),
  source           text        NOT NULL DEFAULT 'discovered'
                               CHECK (source IN ('discovered', 'field_capture')),
  rbs_status       text        NOT NULL DEFAULT 'not_submitted'
                               CHECK (rbs_status IN ('not_submitted', 'submitted')),
  rbs_submitted_at timestamptz,
  notes            text,
  latitude         numeric(10,7),
  longitude        numeric(10,7),
  google_place_id  text        UNIQUE,
  deleted_at       timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

COMMENT ON TABLE companies IS
  'Lead companies discovered via Google Places or future field capture. '
  'Soft-delete via deleted_at; hard deletes are avoided.';

COMMENT ON COLUMN companies.rbs_status IS
  'Tracks whether this lead has been submitted to the external RBS/CRM system. '
  'This app does not replicate RBS — it only stores this one flag.';

COMMENT ON COLUMN companies.source IS
  '''discovered'' = imported via Google Places search. '
  '''field_capture'' = reserved for future mobile phase.';

-- ---- Row Level Security ------------------------------------
ALTER TABLE naics_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;

-- Authenticated users have full access (single-tier auth for POC)
CREATE POLICY "auth_full_access_naics"
  ON naics_reference FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_full_access_companies"
  ON companies FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
