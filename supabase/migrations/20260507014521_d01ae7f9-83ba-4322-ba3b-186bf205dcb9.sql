
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('researcher', 'participant');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  organization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Session status enum
CREATE TYPE public.session_status AS ENUM ('draft', 'active', 'closed');

-- Research sessions
CREATE TABLE public.research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  join_code TEXT NOT NULL UNIQUE,
  consent_text TEXT NOT NULL,
  status public.session_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.research_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER research_sessions_updated_at BEFORE UPDATE ON public.research_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Generate 6-char join code
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Session participants
CREATE TABLE public.session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_accepted_at TIMESTAMPTZ,
  UNIQUE (session_id, participant_id)
);
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

-- Helper: is current user the researcher who owns this session
CREATE OR REPLACE FUNCTION public.owns_session(_session_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.research_sessions WHERE id = _session_id AND researcher_id = auth.uid())
$$;

-- Helper: is current user a participant in this session
CREATE OR REPLACE FUNCTION public.is_session_participant(_session_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.session_participants WHERE session_id = _session_id AND participant_id = auth.uid())
$$;

-- Research sessions policies
CREATE POLICY "Researchers manage own sessions" ON public.research_sessions
  FOR ALL TO authenticated USING (researcher_id = auth.uid()) WITH CHECK (researcher_id = auth.uid());
CREATE POLICY "Participants read joined sessions" ON public.research_sessions
  FOR SELECT TO authenticated USING (public.is_session_participant(id));

-- Session participants policies
CREATE POLICY "Researchers see participants in own sessions" ON public.session_participants
  FOR SELECT TO authenticated USING (public.owns_session(session_id));
CREATE POLICY "Participants see own membership" ON public.session_participants
  FOR SELECT TO authenticated USING (participant_id = auth.uid());
CREATE POLICY "Participants join sessions" ON public.session_participants
  FOR INSERT TO authenticated WITH CHECK (participant_id = auth.uid());
CREATE POLICY "Participants update own membership" ON public.session_participants
  FOR UPDATE TO authenticated USING (participant_id = auth.uid());
CREATE POLICY "Participants leave sessions" ON public.session_participants
  FOR DELETE TO authenticated USING (participant_id = auth.uid());

-- AI conversations
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'extension',
  title TEXT,
  url TEXT,
  prompt_text TEXT NOT NULL,
  ai_summary TEXT,
  raw_payload JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_conversations_session_idx ON public.ai_conversations(session_id);
CREATE INDEX ai_conversations_participant_idx ON public.ai_conversations(participant_id);

CREATE POLICY "Participants manage own conversations" ON public.ai_conversations
  FOR ALL TO authenticated USING (participant_id = auth.uid()) WITH CHECK (participant_id = auth.uid());
CREATE POLICY "Researchers read conversations in own sessions" ON public.ai_conversations
  FOR SELECT TO authenticated USING (public.owns_session(session_id));

-- Conversation turns
CREATE TABLE public.conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_turns ENABLE ROW LEVEL SECURITY;
CREATE INDEX conversation_turns_conv_idx ON public.conversation_turns(conversation_id, idx);

CREATE OR REPLACE FUNCTION public.can_access_conversation(_conv_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = _conv_id
      AND (c.participant_id = auth.uid() OR public.owns_session(c.session_id))
  )
$$;

CREATE POLICY "Read turns if can access conversation" ON public.conversation_turns
  FOR SELECT TO authenticated USING (public.can_access_conversation(conversation_id));
CREATE POLICY "Participants insert own turns" ON public.conversation_turns
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.participant_id = auth.uid())
  );

-- Extension tokens
CREATE TABLE public.extension_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX extension_tokens_participant_idx ON public.extension_tokens(participant_id);

CREATE POLICY "Participants manage own tokens" ON public.extension_tokens
  FOR ALL TO authenticated USING (participant_id = auth.uid()) WITH CHECK (participant_id = auth.uid());
