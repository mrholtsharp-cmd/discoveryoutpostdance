
-- 1. Prevent role enumeration: revoke has_role EXECUTE from signed-in users.
--    RLS policies still evaluate has_role because it is SECURITY DEFINER
--    (runs as owner) — caller EXECUTE is only required for direct RPC calls.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, PUBLIC;

-- 2. Harden messages insert policy to bind sender_user_id to auth.uid().
DROP POLICY IF EXISTS "messages: parents insert own" ON public.messages;
CREATE POLICY "messages: parents insert own"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = 'parent'
  AND sender_user_id = auth.uid()
  AND thread_id IN (
    SELECT mt.id FROM public.message_threads mt
    WHERE mt.parent_id IN (
      SELECT p.id FROM public.parents p WHERE p.auth_user_id = auth.uid()
    )
  )
);
