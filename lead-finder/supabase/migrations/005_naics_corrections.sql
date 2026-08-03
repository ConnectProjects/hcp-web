-- =====================================================
-- Lead Finder — NAICS Hazard Flag & Score Corrections
-- =====================================================
-- Three categories of fixes:
--   1. Admin score overrides that were set too LOW on
--      genuinely noisy industries (mining, logging, mills)
--   2. Construction specialty trades missing is_noise_hazard
--   3. False positives: office/professional codes incorrectly
--      flagged as noise hazard
-- Ends with a full re-score of all companies.
-- =====================================================


-- -------------------------------------------------------
-- 1. FIX ADMIN SCORES SET TOO LOW
--    These codes have is_noise_hazard = true but admin_score
--    of 3 was overriding the correct sector auto-score of 5.
-- -------------------------------------------------------

-- Logging: chainsaws, feller-bunchers, skidders — among the
-- loudest sustained exposures in BC industry
UPDATE naics_reference SET hazard_score = 5
WHERE code IN ('113311', '113312');

-- Mining, quarrying, drilling: percussion drills, blasting,
-- rock crushers — sector 21 auto-score was already 5
UPDATE naics_reference SET hazard_score = 5
WHERE code IN (
  '211110', '211141', '211142',           -- Oil and gas extraction
  '212114', '212115', '212116',           -- Coal mining
  '212210', '212220',                     -- Iron ore, gold/silver ore mining
  '212231', '212232', '212233',           -- Lead-zinc, nickel-copper, copper-zinc
  '212291', '212299',                     -- Uranium, other metal ore
  '212314', '212315', '212316', '212317', -- Granite, limestone, marble, sandstone quarrying
  '212323', '212326',                     -- Sand/gravel, shale/clay quarrying
  '212392', '212393', '212394',           -- Diamond, salt, asbestos mining
  '212395', '212396', '212397', '212398', -- Gypsum, potash, peat, other non-metallic
  '213111', '213117', '213118', '213119'  -- Contract drilling and mining support
);

-- Sawmills and pulp mills: saws, chippers, debarkers, grinders
UPDATE naics_reference SET hazard_score = 5
WHERE code IN (
  '321111',  -- Sawmills (except shingle and shake mills)
  '321114',  -- Wood preservation
  '322111',  -- Mechanical pulp mills
  '322112'   -- Chemical pulp mills
);

-- Iron and steel mills, foundries, forging:
-- impact hammers, presses, furnace noise
UPDATE naics_reference SET hazard_score = 5
WHERE code IN (
  '331110',  -- Iron and steel mills and ferro-alloy manufacturing
  '331210',  -- Iron and steel pipes and tubes
  '331222',  -- Steel wire drawing
  '331511',  -- Iron foundries
  '331514',  -- Steel foundries
  '332113'   -- Forging
);

-- Ship building: grinding, sandblasting, riveting, cutting
UPDATE naics_reference SET hazard_score = 5
WHERE code = '336611';

-- Highway and bridge construction: jackhammers, pavers, compactors
UPDATE naics_reference SET hazard_score = 5
WHERE code = '237310';

-- Poured concrete and structural steel contractors:
-- concrete vibrators, grinders, air tools
UPDATE naics_reference SET hazard_score = 5
WHERE code IN ('238110', '238120', '238140');

-- Machine shops: CNC machining, grinding, drilling — step up from 3
UPDATE naics_reference SET hazard_score = 4
WHERE code = '332710';

-- Stamping: high-impact noise — step up from auto-score
UPDATE naics_reference SET hazard_score = 5, is_noise_hazard = true
WHERE code = '332118';


-- -------------------------------------------------------
-- 2. FLAG CONSTRUCTION SPECIALTY TRADES AS NOISE HAZARD
--    These all auto-score 5 but is_noise_hazard was false,
--    excluding them from targeted searches.
-- -------------------------------------------------------

UPDATE naics_reference
SET is_noise_hazard = true
WHERE code IN (
  -- General building construction
  '236110',  -- Residential building construction
  '236210',  -- Industrial building and structure construction

  -- Civil / heavy construction
  '237130',  -- Power and communication line and related structures
  '237990',  -- Other heavy and civil engineering construction

  -- Specialty trade contractors
  '238130',  -- Framing contractors
  '238190',  -- Other foundation, structure and building exterior contractors
  '238210',  -- Electrical contractors and other wiring installation
  '238220',  -- Plumbing, heating and air-conditioning contractors
  '238291',  -- Elevator and escalator installation contractors
  '238310',  -- Drywall and insulation contractors
  '238330',  -- Flooring contractors
  '238350',  -- Finish carpentry contractors
  '238390',  -- Other building finishing contractors
  '238990'   -- All other specialty trade contractors
);


-- -------------------------------------------------------
-- 3. CLEAR FALSE POSITIVES
--    Office / professional codes incorrectly flagged
-- -------------------------------------------------------

UPDATE naics_reference
SET is_noise_hazard = false,
    hazard_score    = NULL
WHERE code IN (
  '519130',  -- Internet broadcasting and web search portals
  '524129',  -- Other direct insurance carriers
  '446130',  -- Optical goods stores
  '541320',  -- Landscape architectural services
  '541340',  -- Drafting services
  '541620',  -- Environmental consulting services
  '541710',  -- R&D in the physical, engineering and life sciences
  '621320',  -- Offices of optometrists
  '812922'   -- One-hour photo finishing
);


-- -------------------------------------------------------
-- 4. PROPAGATE: re-score all companies from updated NAICS
-- -------------------------------------------------------

UPDATE companies
SET hazard_score = compute_hazard_score(naics_code)
WHERE naics_code IS NOT NULL;
