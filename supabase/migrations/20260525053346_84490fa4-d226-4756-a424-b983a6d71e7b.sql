CREATE OR REPLACE FUNCTION public.enforce_receipt_job_daily_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  recent_count INT;
  DAILY_LIMIT CONSTANT INT := 7;
BEGIN
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