-- =====================================================
-- Lead Finder — Email Fork
-- =====================================================
-- Adds contact_email (auto-discovered from website) and
-- email_fork (which outreach path a lead takes).
--
-- email_fork values:
--   'pending' — not yet checked for a contact email
--   'email'   — contact email found; Norman handles outreach
--   'phone'   — no public email found; goes to LC phone report

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS email_fork    text NOT NULL DEFAULT 'pending'
    CHECK (email_fork IN ('pending', 'email', 'phone'));

CREATE INDEX IF NOT EXISTS idx_companies_email_fork ON companies (email_fork);

COMMENT ON COLUMN companies.contact_email IS
  'Public contact email discovered from the company website by the find-email Edge Function.';

COMMENT ON COLUMN companies.email_fork IS
  'pending = not yet checked; email = outreach goes by email (Norman); phone = no email found, goes to LC cold-call report.';
