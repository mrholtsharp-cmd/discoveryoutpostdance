-- 1) Drop no-op ALL true/true policy on invoice_counters (service_role bypasses RLS)
DROP POLICY IF EXISTS "svc only counters" ON public.invoice_counters;

-- 2) Tighten public INSERT policy on contact_submissions
DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;
CREATE POLICY "Anyone can submit contact form"
  ON public.contact_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(btrim(name)) BETWEEN 1 AND 100
    AND length(btrim(email)) BETWEEN 3 AND 255
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND length(btrim(subject)) BETWEEN 1 AND 200
    AND length(btrim(message)) BETWEEN 1 AND 5000
    AND (phone IS NULL OR length(phone) <= 40)
    AND status = 'new'
    AND admin_reply IS NULL
    AND replied_at IS NULL
  );

-- 3) Tighten public INSERT policy on registrations
DROP POLICY IF EXISTS "Public can submit registrations" ON public.registrations;
CREATE POLICY "Public can submit registrations"
  ON public.registrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(btrim(student_name)) BETWEEN 1 AND 120
    AND length(btrim(parent_name)) BETWEEN 1 AND 120
    AND length(btrim(email)) BETWEEN 3 AND 255
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND length(btrim(phone)) BETWEEN 5 AND 40
    AND age BETWEEN 0 AND 120
    AND length(btrim(desired_class)) BETWEEN 1 AND 200
    AND length(btrim(experience_level)) BETWEEN 1 AND 60
    AND length(btrim(emergency_contact)) BETWEEN 1 AND 200
    AND (medical_notes IS NULL OR length(medical_notes) <= 5000)
    AND (admin_notes IS NULL OR length(admin_notes) <= 5000)
    AND approval_status = 'pending'
    AND payment_status = 'pending'
    AND approved_at IS NULL
    AND approved_by IS NULL
    AND paid_at IS NULL
    AND stripe_payment_intent_id IS NULL
    AND stripe_charge_id IS NULL
    AND refunded_amount_cents IS NULL
    AND payment_failure_flagged = false
    AND payment_failure_count = 0
  );

-- 4) Restrict SECURITY DEFINER helper `has_role` from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;