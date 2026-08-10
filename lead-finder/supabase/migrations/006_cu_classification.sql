-- =====================================================
-- Lead Finder — Replace NAICS with WorkSafeBC CU numbers
-- =====================================================

-- ---- 1. Drop NAICS-dependent triggers and functions -
--         Must happen before dropping columns/table.

DROP TRIGGER IF EXISTS company_rescore_on_naics ON companies;
DROP TRIGGER IF EXISTS naics_cascade_rescore     ON naics_reference;

DROP FUNCTION IF EXISTS trg_company_rescore()       CASCADE;
DROP FUNCTION IF EXISTS trg_naics_cascade_rescore() CASCADE;
DROP FUNCTION IF EXISTS compute_hazard_score(text)  CASCADE;

-- ---- 2. Create cu_reference table -------------------
CREATE TABLE IF NOT EXISTS cu_reference (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cu_number         text        UNIQUE NOT NULL,   -- 6-digit WorkSafeBC CU (e.g. '711001')
  cu_name           text        NOT NULL,          -- Business undertaking description
  sector            smallint    GENERATED ALWAYS AS (CAST(LEFT(cu_number, 2) AS smallint)) STORED,
  subsector         smallint    GENERATED ALWAYS AS (CAST(LEFT(cu_number, 3) AS smallint)) STORED,
  base_premium_rate numeric(5,2),
  is_noise_hazard   boolean     NOT NULL DEFAULT false,
  hazard_score      smallint    CHECK (hazard_score BETWEEN 1 AND 5),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cu_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cu_reference"
  ON cu_reference FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert cu_reference"
  ON cu_reference FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update cu_reference"
  ON cu_reference FOR UPDATE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cu_is_noise_hazard ON cu_reference (is_noise_hazard);

-- ---- 3. Add CU columns to companies -----------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cu_number     text REFERENCES cu_reference(cu_number),
  ADD COLUMN IF NOT EXISTS cu_confidence text CHECK (cu_confidence IN ('confirmed','inferred','unknown'));

CREATE INDEX IF NOT EXISTS idx_companies_cu_number ON companies (cu_number);

-- ---- 4. Drop old NAICS columns and table ------------
ALTER TABLE companies
  DROP COLUMN IF EXISTS naics_code,
  DROP COLUMN IF EXISTS naics_confidence;

DROP INDEX IF EXISTS idx_companies_naics_code;
DROP INDEX IF EXISTS idx_naics_is_noise_hazard;

DROP TABLE IF EXISTS naics_reference;

-- ---- 5. New CU-based scoring function ---------------
--
-- Priority: admin hazard_score on cu_reference > sector auto-score
--
-- WorkSafeBC sector prefix → noise hazard risk:
--   70 Primary resources (logging, mining, farming)  → 5 Very High
--   72 Construction                                  → 5 Very High
--   71 Manufacturing                                 → 4 High
--   73 Transportation and storage                    → 4 High
--   77 Utilities                                     → 3 Moderate
--   74 Trade (wholesale/retail)                      → 2 Low
--   75 Public sector                                 → 2 Low
--   76 Service                                       → 2 Low

CREATE OR REPLACE FUNCTION compute_hazard_score_from_cu(p_cu_number text)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_admin_score int;
BEGIN
  IF p_cu_number IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT hazard_score INTO v_admin_score
  FROM cu_reference
  WHERE cu_number = p_cu_number;

  IF v_admin_score IS NOT NULL THEN
    RETURN v_admin_score;
  END IF;

  RETURN CASE LEFT(p_cu_number, 2)
    WHEN '70' THEN 5
    WHEN '72' THEN 5
    WHEN '71' THEN 4
    WHEN '73' THEN 4
    WHEN '77' THEN 3
    WHEN '74' THEN 2
    WHEN '75' THEN 2
    WHEN '76' THEN 2
    ELSE            1
  END;
END;
$$;

-- ---- 6. Trigger: score companies on insert / CU change
CREATE OR REPLACE FUNCTION trg_company_rescore_cu()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.hazard_score IS NULL THEN
      NEW.hazard_score := compute_hazard_score_from_cu(NEW.cu_number);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cu_number IS DISTINCT FROM OLD.cu_number THEN
      NEW.hazard_score := compute_hazard_score_from_cu(NEW.cu_number);
    ELSIF NEW.hazard_score IS NULL THEN
      NEW.hazard_score := compute_hazard_score_from_cu(NEW.cu_number);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_rescore_on_cu ON companies;
CREATE TRIGGER company_rescore_on_cu
  BEFORE INSERT OR UPDATE OF cu_number, hazard_score ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_company_rescore_cu();

-- ---- 7. Trigger: cascade CU admin score → companies -
CREATE OR REPLACE FUNCTION trg_cu_cascade_rescore()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.hazard_score IS DISTINCT FROM OLD.hazard_score THEN
    UPDATE companies
    SET    hazard_score = compute_hazard_score_from_cu(cu_number)
    WHERE  cu_number = NEW.cu_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cu_cascade_rescore ON cu_reference;
CREATE TRIGGER cu_cascade_rescore
  AFTER UPDATE OF hazard_score ON cu_reference
  FOR EACH ROW EXECUTE FUNCTION trg_cu_cascade_rescore();
