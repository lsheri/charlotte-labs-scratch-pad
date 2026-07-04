
-- 1. Add kind column to research_sessions
ALTER TABLE public.research_sessions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'research'
  CHECK (kind IN ('research', 'personal'));

-- 2. Partial unique index: at most one personal workspace per researcher_id
CREATE UNIQUE INDEX IF NOT EXISTS research_sessions_one_personal_per_user
  ON public.research_sessions (researcher_id)
  WHERE kind = 'personal';

-- 3. Function to ensure a personal workspace exists for a user
CREATE OR REPLACE FUNCTION public.ensure_personal_workspace(_uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws_id uuid;
BEGIN
  SELECT id INTO _ws_id
  FROM public.research_sessions
  WHERE researcher_id = _uid AND kind = 'personal'
  LIMIT 1;

  IF _ws_id IS NULL THEN
    INSERT INTO public.research_sessions
      (researcher_id, name, description, kind, status, consent_text, join_code)
    VALUES
      (_uid,
       'Personal Workspace',
       'Your personal AI work — not part of any research study.',
       'personal',
       'active',
       'This is your private personal workspace. No researcher has access to its contents.',
       'PERSONAL-' || substr(replace(_uid::text, '-', ''), 1, 8))
    RETURNING id INTO _ws_id;
  END IF;

  -- Ensure auto-consented membership
  INSERT INTO public.session_participants
    (session_id, participant_id, consent_accepted_at)
  VALUES
    (_ws_id, _uid, now())
  ON CONFLICT DO NOTHING;

  RETURN _ws_id;
END;
$$;

-- 4. Trigger on auth.users to auto-create personal workspace
CREATE OR REPLACE FUNCTION public.handle_new_user_personal_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_personal_workspace(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block signup if this fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_personal_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_personal_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_personal_workspace();

-- 5. Backfill: ensure personal workspace for every existing user with a profile
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_personal_workspace(u.id);
  END LOOP;
END $$;
