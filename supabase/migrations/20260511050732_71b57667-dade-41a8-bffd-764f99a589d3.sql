
-- Ensure prompt_features.turn_id is unique so upsert(onConflict: 'turn_id') is idempotent
CREATE UNIQUE INDEX IF NOT EXISTS prompt_features_turn_id_key
  ON public.prompt_features(turn_id)
  WHERE turn_id IS NOT NULL;

-- Helper for participant_tool_history upsert with atomic session_count increment
CREATE OR REPLACE FUNCTION public.increment_tool_history(
  p_participant_id uuid,
  p_tool tool_id_enum,
  p_first_use timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.participant_tool_history (participant_id, tool, first_use_date, session_count, is_established)
  VALUES (p_participant_id, p_tool, p_first_use, 1, false)
  ON CONFLICT (participant_id, tool) DO UPDATE
    SET session_count = public.participant_tool_history.session_count + 1,
        is_established = (public.participant_tool_history.session_count + 1) >= 10,
        updated_at = now();
END;
$$;
