
-- Restrict EXECUTE on has_role: RLS policies still work (definer), but signed-in users can't invoke it directly via the API
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- Explicit deny policies on user_roles to prevent privilege escalation even if a permissive policy is added later
CREATE POLICY "No client inserts on user_roles"
  ON public.user_roles FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates on user_roles"
  ON public.user_roles FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on user_roles"
  ON public.user_roles FOR DELETE TO anon, authenticated
  USING (false);
