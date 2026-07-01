
-- 1. Rewrite invoice_requests parent policies to compare via parents.auth_user_id
DROP POLICY IF EXISTS "parents see their own invoice requests" ON public.invoice_requests;
DROP POLICY IF EXISTS "parents create their own invoice requests" ON public.invoice_requests;

CREATE POLICY "parents see their own invoice requests"
  ON public.invoice_requests
  FOR SELECT
  TO authenticated
  USING (
    parent_id IS NOT NULL
    AND parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "parents create their own invoice requests"
  ON public.invoice_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    parent_id IS NOT NULL
    AND parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- 2. Lock down SECURITY DEFINER functions to service_role only,
--    except has_role and enroll_or_waitlist which RLS policies / app flows require.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
