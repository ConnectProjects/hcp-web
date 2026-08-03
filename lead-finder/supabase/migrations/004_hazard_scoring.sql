-- =====================================================
-- Lead Finder — Hazard Scoring (Migration 004)
-- =====================================================
-- companies.hazard_score is computed from:
--   1. naics_reference.hazard_score  (admin-set override, takes precedence)
--   2. NAICS sector prefix           (auto-score fallback, always available)
--
-- Sector scores reflect noise-exposure risk for hearing conservation:
--   5 — Very High   Mining, Construction
--   4 — High        Agriculture/Forestry, Manufacturing, Transportation
--   3 — Moderate    Utilities, Waste Management, Repair Services
--   2 — Low         Wholesale/Retail Trade, Food Services
--   1 — Minimal     Finance, IT, Professional Services, etc.
-- =====================================================

-- ----------------------------------------------------
-- 1. Scoring function
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION compute_hazard_score(p_naics_code text)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_admin_score int;
BEGIN
  IF p_naics_code IS NULL THEN
    RETURN NULL;
  END IF;

  -- Admin override takes precedence
  SELECT hazard_score INTO v_admin_score
  FROM naics_reference
  WHERE code = p_naics_code;

  IF v_admin_score IS NOT NULL THEN
    RETURN v_admin_score;
  END IF;

  -- Auto-score by NAICS sector (first 2 digits)
  RETURN CASE left(p_naics_code, 2)
    WHEN '21' THEN 5   -- Mining, Quarrying, Oil & Gas Extraction
    WHEN '23' THEN 5   -- Construction
    WHEN '11' THEN 4   -- Agriculture, Forestry, Fishing & Hunting
    WHEN '31' THEN 4   -- Manufacturing — Food, Textile, Apparel
    WHEN '32' THEN 4   -- Manufacturing — Paper, Chemical, Plastics, Glass
    WHEN '33' THEN 4   -- Manufacturing — Metal, Machinery, Equipment, Vehicles
    WHEN '48' THEN 4   -- Transportation
    WHEN '49' THEN 4   -- Postal, Courier & Warehousing
    WHEN '22' THEN 3   -- Utilities
    WHEN '56' THEN 3   -- Administrative, Support, Waste & Remediation Services
    WHEN '81' THEN 3   -- Other Services — Repair, Maintenance, Personal
    WHEN '41' THEN 2   -- Wholesale Trade
    WHEN '44' THEN 2   -- Retail Trade
    WHEN '45' THEN 2   -- Retail Trade (continued)
    WHEN '72' THEN 2   -- Accommodation & Food Services
    ELSE               1   -- Finance, IT, Professional, Health, Education, etc.
  END;
END;
$$;

-- ----------------------------------------------------
-- 2. Trigger: score companies on insert / NAICS change
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_company_rescore()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Fill score if none provided
    IF NEW.hazard_score IS NULL THEN
      NEW.hazard_score := compute_hazard_score(NEW.naics_code);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.naics_code IS DISTINCT FROM OLD.naics_code THEN
      -- NAICS code changed: recompute (overrides any prior manual score)
      NEW.hazard_score := compute_hazard_score(NEW.naics_code);
    ELSIF NEW.hazard_score IS NULL THEN
      -- Score cleared: refill from current NAICS
      NEW.hazard_score := compute_hazard_score(NEW.naics_code);
    END IF;
    -- If NAICS unchanged and score is non-null: leave the existing score alone
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_rescore_on_naics ON companies;
CREATE TRIGGER company_rescore_on_naics
  BEFORE INSERT OR UPDATE OF naics_code, hazard_score ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_company_rescore();

-- ----------------------------------------------------
-- 3. Trigger: cascade admin NAICS score → companies
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_naics_cascade_rescore()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.hazard_score IS DISTINCT FROM OLD.hazard_score THEN
    UPDATE companies
    SET    hazard_score = compute_hazard_score(naics_code)
    WHERE  naics_code = NEW.code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS naics_cascade_rescore ON naics_reference;
CREATE TRIGGER naics_cascade_rescore
  AFTER UPDATE OF hazard_score ON naics_reference
  FOR EACH ROW EXECUTE FUNCTION trg_naics_cascade_rescore();

-- ----------------------------------------------------
-- 4. Backfill existing companies
-- ----------------------------------------------------
UPDATE companies
SET    hazard_score = compute_hazard_score(naics_code)
WHERE  naics_code IS NOT NULL;
