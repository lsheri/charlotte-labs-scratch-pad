// Fire-and-forget kick to the email queue processor.
//
// Why this exists: pg_cron polls /lovable/email/queue/process for retry
// safety, but to keep that cron cheap we run it hourly instead of every 5s.
// To preserve fast send latency, every place that enqueues an email also
// calls kickEmailQueue() right after — the email goes out in ~1–2s instead
// of waiting up to an hour for the next cron tick.
//
// The kick is intentionally fire-and-forget:
//   - We don't await it (don't slow down the caller's response).
//   - We swallow errors (if the kick fails, the hourly cron picks it up).
//   - The processor is idempotent (pgmq visibility timeouts handle races
//     with the cron or other concurrent kicks).

const QUEUE_PROCESS_URL =
  'https://project--587b3636-dac3-4081-bfb6-e7028ae194bd.lovable.app/lovable/email/queue/process';

export function kickEmailQueue(): void {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;

  const promise = fetch(QUEUE_PROCESS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: '{}',
  }).catch((err) => {
    // Best-effort — cron will catch anything we miss.
    console.warn('[email-queue-kick] failed (will retry via cron)', err?.message ?? err);
  });

  // CRITICAL: On Cloudflare Workers, the request isolate terminates as soon
  // as the server function returns. Without waitUntil, the subrequest above
  // is cancelled before it ever lands at the queue processor.
  void (async () => {
    try {
      const modName = 'cloudflare:workers';
      const mod: any = await import(/* @vite-ignore */ modName);
      mod.waitUntil(promise);
    } catch {
      // Not on Cloudflare — dev mode, promise still runs to completion.
    }
  })();
}
