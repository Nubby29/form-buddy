CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  default_mode TEXT NOT NULL DEFAULT 'fill_only',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX targets_user_idx ON public.targets(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.targets TO authenticated;
GRANT ALL ON public.targets TO service_role;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own targets" ON public.targets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_id UUID REFERENCES public.targets(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fill_only',
  status TEXT NOT NULL DEFAULT 'queued',
  outcome TEXT,
  passed BOOLEAN,
  page_title TEXT,
  form_selector TEXT,
  fields_found INTEGER NOT NULL DEFAULT 0,
  fields_filled INTEGER NOT NULL DEFAULT 0,
  filled_shot_path TEXT,
  result_shot_path TEXT,
  result_text TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  share_token UUID NOT NULL DEFAULT gen_random_uuid(),
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX runs_share_token_idx ON public.runs(share_token);
CREATE INDEX runs_user_idx ON public.runs(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runs TO authenticated;
GRANT ALL ON public.runs TO service_role;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.runs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.run_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  label TEXT,
  selector TEXT,
  field_type TEXT,
  value_used TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  filled BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX run_fields_run_idx ON public.run_fields(run_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_fields TO authenticated;
GRANT ALL ON public.run_fields TO service_role;
ALTER TABLE public.run_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own run fields" ON public.run_fields FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read own shots" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'shots' AND (storage.foldername(name))[1] = auth.uid()::text);