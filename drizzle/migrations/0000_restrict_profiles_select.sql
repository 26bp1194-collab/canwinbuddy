DROP POLICY IF EXISTS "Profiles readable by anyone" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);