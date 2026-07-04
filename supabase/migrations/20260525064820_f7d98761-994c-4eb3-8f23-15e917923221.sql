CREATE OR REPLACE FUNCTION public.enforce_receipt_job_daily_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recent_count INT;
  DAILY_LIMIT CONSTANT INT := 7;
  user_email TEXT;
BEGIN
  SELECT lower(email) INTO user_email
  FROM auth.users
  WHERE id = NEW.participant_id;

  IF user_email = 'liam@charlotte-labs.com' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.receipt_jobs
  WHERE participant_id = NEW.participant_id
    AND created_at >= now() - interval '24 hours';

  IF recent_count >= DAILY_LIMIT THEN
    RAISE EXCEPTION 'Daily workflow generation limit reached (% per 24h)', DAILY_LIMIT
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;