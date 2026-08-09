-- 1) app_settings: restrict reads to admins only
DROP POLICY IF EXISTS "signed in can read settings" ON public.app_settings;

CREATE POLICY "admins read settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.app_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- 2) user_roles: explicitly deny client-side role assignment (writes go through the
--    service-role admin path only). Read policies stay as-is.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY "no client role inserts"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "no client role updates"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "no client role deletes"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- 3) SECURITY DEFINER trigger functions must not be directly callable by API roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- has_role stays callable by signed-in users: RLS policies and the admin dashboard
-- rely on it, and it only reveals the caller-supplied user's role membership.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;