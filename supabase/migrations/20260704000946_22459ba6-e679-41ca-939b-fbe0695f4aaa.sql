-- Restore EXECUTE permission on has_role() so signed-in users (and the auth middleware) can call it.
-- has_role is SECURITY DEFINER and only reads user_roles, so granting execute is safe.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
-- Also grant to anon for any public code path that checks roles (returns false for non-auth users).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;