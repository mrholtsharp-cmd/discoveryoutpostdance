-- Revoke client EXECUTE on server-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_enroll_or_waitlist(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_or_waitlist(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_enroll_or_waitlist(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enroll_or_waitlist(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;

-- invoice_counters: explicit service-role-only access, no client access
REVOKE ALL ON TABLE public.invoice_counters FROM anon, authenticated;
GRANT ALL ON TABLE public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages invoice counters" ON public.invoice_counters;
CREATE POLICY "Service role manages invoice counters"
  ON public.invoice_counters FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- email_send_state: explicit service-role-only access (documents fail-closed intent)
REVOKE ALL ON TABLE public.email_send_state FROM anon, authenticated;
GRANT ALL ON TABLE public.email_send_state TO service_role;