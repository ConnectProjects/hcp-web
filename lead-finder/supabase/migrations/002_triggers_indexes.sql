-- =====================================================
-- Lead Finder — Indexes and Triggers
-- =====================================================

-- Indexes for dashboard filter columns
CREATE INDEX IF NOT EXISTS idx_companies_province     ON companies (province);
CREATE INDEX IF NOT EXISTS idx_companies_naics_code   ON companies (naics_code);
CREATE INDEX IF NOT EXISTS idx_companies_rbs_status   ON companies (rbs_status);
CREATE INDEX IF NOT EXISTS idx_companies_hazard_score ON companies (hazard_score);
CREATE INDEX IF NOT EXISTS idx_companies_deleted_at   ON companies (deleted_at);
CREATE INDEX IF NOT EXISTS idx_companies_created_at   ON companies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_naics_is_noise_hazard  ON naics_reference (is_noise_hazard);

-- ---- Auto-update updated_at --------------------------------
CREATE OR REPLACE FUNCTION companies_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION companies_set_updated_at();

-- ---- Auto-set rbs_submitted_at when status flips -----------
-- Sets the timestamp when status first becomes 'submitted';
-- clears it if status is changed back to 'not_submitted'.
CREATE OR REPLACE FUNCTION companies_handle_rbs_submitted_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rbs_status = 'submitted' AND (OLD.rbs_status IS DISTINCT FROM 'submitted') THEN
    NEW.rbs_submitted_at := now();
  ELSIF NEW.rbs_status <> 'submitted' THEN
    NEW.rbs_submitted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_rbs_submitted_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION companies_handle_rbs_submitted_at();
