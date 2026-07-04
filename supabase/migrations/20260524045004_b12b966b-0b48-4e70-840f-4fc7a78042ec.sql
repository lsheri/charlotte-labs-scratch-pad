
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'process-receipt-jobs-every-minute')::bigint, '0 */6 * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'process-thread-jobs')::bigint, '0 */6 * * *');
