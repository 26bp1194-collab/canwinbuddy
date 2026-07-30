DROP POLICY IF EXISTS "Anyone can read shares" ON public.quiz_shares;

CREATE POLICY "Users read own shares"
ON public.quiz_shares
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE SELECT ON public.quiz_shares FROM anon;

CREATE OR REPLACE FUNCTION public.get_shared_quiz(share_id uuid)
RETURNS TABLE (title text, questions jsonb, question_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.title, s.questions, s.question_count
  FROM public.quiz_shares s
  WHERE s.id = share_id
$$;

REVOKE ALL ON FUNCTION public.get_shared_quiz(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_quiz(uuid) TO anon, authenticated;
GRANT ALL ON public.quiz_shares TO service_role;