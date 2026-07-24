-- =====================================================
-- Lead Finder — Outreach Module
-- =====================================================

-- CASL: track unsubscribes at company level. Never clear once set.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

COMMENT ON COLUMN companies.unsubscribed_at IS
  'CASL unsubscribe timestamp. Any company with this set must be excluded from '
  'all outreach. Set by outreach-unsubscribe Edge Function; never cleared.';

-- ---- outreach -----------------------------------------------
-- One row per contact attempt. token is embedded in the emailed response link.
-- consent_obtained_at + consent_note are the CASL express consent record.

CREATE TABLE outreach (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token               uuid        UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  channel             text        NOT NULL CHECK (channel IN ('phone', 'email', 'in_person')),
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  consent_obtained_at timestamptz,
  consent_note        text,
  drafted_at          timestamptz,
  sent_at             timestamptz,
  first_opened_at     timestamptz,
  responded_at        timestamptz,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now()
);

COMMENT ON TABLE outreach IS
  'Outreach contact attempts. Prefer immutable: do not UPDATE consent fields once set. '
  'If a second contact attempt is needed, insert a new row rather than overwriting.';

CREATE INDEX idx_outreach_token      ON outreach (token);
CREATE INDEX idx_outreach_company_id ON outreach (company_id);

-- ---- outreach_response --------------------------------------

CREATE TABLE outreach_response (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id       uuid        NOT NULL REFERENCES outreach(id) ON DELETE CASCADE,
  noise_exposure    boolean,
  employee_count    integer,
  last_tested       text,
  preferred_contact text,
  preferred_time    text,
  notes             text,
  submitted_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_outreach_response_outreach_id ON outreach_response (outreach_id);

-- ---- RLS ----------------------------------------------------
-- Deny anon entirely. Authenticated users get full access, consistent with
-- the existing naics_reference and companies policies.

ALTER TABLE outreach          ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_response ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access_outreach"
  ON outreach FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_full_access_outreach_response"
  ON outreach_response FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---- Rate limiting for public Edge Function endpoints --------
-- Accessed exclusively by Edge Functions via the service role.
-- No authenticated or anon policies — direct client access is intentionally blocked.

CREATE TABLE edge_rate_limit (
  ip           text        NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count    integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, window_start)
);

ALTER TABLE edge_rate_limit ENABLE ROW LEVEL SECURITY;

-- Atomic increment + threshold check. SECURITY DEFINER so the function can
-- write edge_rate_limit regardless of the caller's role.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip     text,
  p_window timestamptz,
  p_max    integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO edge_rate_limit (ip, window_start, hit_count)
  VALUES (p_ip, p_window, 1)
  ON CONFLICT (ip, window_start)
  DO UPDATE SET hit_count = edge_rate_limit.hit_count + 1
  RETURNING hit_count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- Prevent anon and authenticated roles from calling check_rate_limit directly
-- via the PostgREST /rpc/ endpoint. Only service_role (Edge Functions) may call it.
REVOKE ALL ON FUNCTION check_rate_limit(text, timestamptz, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION check_rate_limit(text, timestamptz, integer) TO service_role;
