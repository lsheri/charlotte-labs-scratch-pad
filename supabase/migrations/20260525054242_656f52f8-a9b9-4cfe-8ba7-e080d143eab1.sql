UPDATE public.receipt_jobs
SET status='queued', attempts=0, error=NULL, progress_label='Re-queued after fix', updated_at=now()
WHERE id='2ae510be-ced0-4d58-ae44-26fcdc8fa13f';