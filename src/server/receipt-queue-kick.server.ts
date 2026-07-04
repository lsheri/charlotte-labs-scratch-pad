// Fire-and-forget kick to the receipt-jobs sweeper.
//
// CRITICAL: On Cloudflare Workers, a bare `fetch().catch()` after the server
// function returns gets cancelled when the request isolate terminates — the
// subrequest never reaches the sweeper. We MUST register the promise with
// `waitUntil` so the runtime keeps the isolate alive until the kick lands.
//
// Cron is a pure safety net (every 30 min) that catches the rare case where
// waitUntil itself is unavailable (e.g. dev server) or the kick HTTP call fails.
const URL = 'https://project--992dda35-bf38-49fe-ae5a-117a3bd97346-dev.lovable.app/api/public/hooks/process-receipt-jobs';

export function kickReceiptQueue(): void {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!key) return;

  const promise = fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: '{}',
  }).catch((err) => {
    console.warn('[receipt-queue-kick] failed (cron will retry)', err?.message ?? err);
  });

  // Keep the Worker isolate alive until the subrequest completes. Dynamic
  // import so non-Cloudflare environments (local dev, tests) don't blow up.
  void (async () => {
    try {
      const modName = 'cloudflare:workers';
      const mod: any = await import(/* @vite-ignore */ modName);
      mod.waitUntil(promise);
    } catch {
      // Not on Cloudflare — promise still runs to completion in dev.
    }
  })();
}
