
-- 1) invoice_requests: enforce ownership
DELETE FROM public.invoice_requests WHERE parent_id IS NULL;
ALTER TABLE public.invoice_requests ALTER COLUMN parent_id SET NOT NULL;

-- Ensure the WITH CHECK explicitly requires ownership (also blocks NULL implicitly now)
DROP POLICY IF EXISTS "parents create their own invoice requests" ON public.invoice_requests;
CREATE POLICY "parents create their own invoice requests"
  ON public.invoice_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (parent_id IS NOT NULL AND parent_id = auth.uid());

DROP POLICY IF EXISTS "parents see their own invoice requests" ON public.invoice_requests;
CREATE POLICY "parents see their own invoice requests"
  ON public.invoice_requests
  FOR SELECT
  TO authenticated
  USING (parent_id IS NOT NULL AND parent_id = auth.uid());

-- 2) Lock down SECURITY DEFINER email queue helpers to service_role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Keep RLS helper functions callable by authenticated (needed inside policies) but not anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enroll_or_waitlist(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_or_waitlist(uuid, uuid) TO authenticated, service_role;
