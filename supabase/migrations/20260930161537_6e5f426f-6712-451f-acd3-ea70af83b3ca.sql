CREATE TABLE public.worksheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  subject text NOT NULL DEFAULT '',
  age integer NOT NULL DEFAULT 12,
  curriculum text NOT NULL DEFAULT '',
  topics text NOT NULL DEFAULT '',
  source_text text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  answer_key jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksheets TO authenticated;
GRANT ALL ON public.worksheets TO service_role;
ALTER TABLE public.worksheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own worksheets" ON public.worksheets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX worksheets_user_idx ON public.worksheets(user_id, created_at DESC);
CREATE TRIGGER worksheets_updated_at BEFORE UPDATE ON public.worksheets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();