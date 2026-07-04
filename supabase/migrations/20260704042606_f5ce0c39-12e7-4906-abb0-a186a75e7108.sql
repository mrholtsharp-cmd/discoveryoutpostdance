
-- 1. contact_submissions: allow public form inserts
CREATE POLICY "Anyone can submit contact form"
  ON public.contact_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 2. registrations: replace deny-all client insert with permissive insert
DROP POLICY IF EXISTS "No client inserts on registrations" ON public.registrations;
CREATE POLICY "Public can submit registrations"
  ON public.registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Lock down SECURITY DEFINER functions still executable by anon/authenticated.
--    has_role stays executable because RLS policies invoke it as the caller.
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_enroll_or_waitlist(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_or_waitlist(uuid, uuid) FROM PUBLIC, anon, authenticated;
