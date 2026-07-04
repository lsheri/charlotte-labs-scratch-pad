// Fire-and-forget kick to the thread-jobs sweeper. See receipt-queue-kick.server.ts
// for the full rationale on why `waitUntil` is required on Cloudflare Workers.
const URL = 'https://project--992dda35-bf38-49fe-ae5a-117a3bd97346-dev.lovable.app/api/public/hooks/process-thread-jobs';

export function kickThreadQueue(): void {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!key) return;

  const promise = fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: '{}',
  }).catch((err) => {
    console.warn('[thread-queue-kick] failed (cron will retry)', err?.message ?? err);
  });

  void (async () => {
    try {
      const modName = 'cloudflare:workers';
      const mod: any = await import(/* @vite-ignore */ modName);
      mod.waitUntil(promise);
    } catch {
      // Not on Cloudflare — dev mode, promise still runs.
    }
  })();
}
