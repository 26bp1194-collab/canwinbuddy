CREATE TABLE public.quiz_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_groups TO authenticated;
GRANT ALL ON public.quiz_groups TO service_role;
ALTER TABLE public.quiz_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own groups" ON public.quiz_groups FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER quiz_groups_updated_at BEFORE UPDATE ON public.quiz_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.quiz_group_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.quiz_groups(id) ON DELETE CASCADE,
  quiz_set_id uuid NOT NULL REFERENCES public.quiz_sets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, quiz_set_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_group_items TO authenticated;
GRANT ALL ON public.quiz_group_items TO service_role;
ALTER TABLE public.quiz_group_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own group items" ON public.quiz_group_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.quiz_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_set_id uuid REFERENCES public.quiz_sets(id) ON DELETE SET NULL,
  title text NOT NULL,
  questions jsonb NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quiz_shares TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_shares TO authenticated;
GRANT ALL ON public.quiz_shares TO service_role;
ALTER TABLE public.quiz_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read shares" ON public.quiz_shares FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users create own shares" ON public.quiz_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own shares" ON public.quiz_shares FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own shares" ON public.quiz_shares FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER quiz_shares_updated_at BEFORE UPDATE ON public.quiz_shares FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();