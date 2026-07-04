-- Backfill: ensure every researcher also has participant access
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'participant'::app_role
FROM public.user_roles ur
WHERE ur.role = 'researcher'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'participant'
  );

-- Backend-only helper to promote a user to researcher by email.
-- Idempotent. Also ensures participant role is present.
CREATE OR REPLACE FUNCTION public.grant_researcher_role(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email = _email LIMIT 1;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', _email;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'researcher'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'participant'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Lock the function down: only service_role / postgres may call it.
REVOKE ALL ON FUNCTION public.grant_researcher_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_researcher_role(text) TO service_role;