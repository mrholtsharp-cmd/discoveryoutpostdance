
-- Audit log
CREATE TABLE public.registration_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('verify_requested','verify_failed','verify_succeeded','submit_success','submit_failed')),
  email text,
  ip_address text,
  user_agent text,
  error_message text,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  metadata jsonb
);

GRANT SELECT ON public.registration_audit_log TO authenticated;
GRANT ALL ON public.registration_audit_log TO service_role;

ALTER TABLE public.registration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.registration_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_audit_log_created_at ON public.registration_audit_log (created_at DESC);
CREATE INDEX idx_audit_log_email ON public.registration_audit_log (email);

-- Email verification
CREATE TABLE public.registration_email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verifications_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

GRANT ALL ON public.registration_email_verifications TO service_role;

ALTER TABLE public.registration_email_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to verifications"
  ON public.registration_email_verifications
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX idx_verifications_email ON public.registration_email_verifications (email, created_at DESC);

-- Lock down direct anonymous inserts on registrations; force server function path
DROP POLICY IF EXISTS "Anyone can register" ON public.registrations;

CREATE POLICY "No client inserts on registrations"
  ON public.registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

REVOKE INSERT ON public.registrations FROM anon, authenticated;
