import { createFileRoute } from '@tanstack/react-router'

/**
 * Public cron endpoint hit weekly by pg_cron. Auth: shared secret in the
 * `x-cron-secret` header, validated against process.env.CRON_SECRET.
 * `/api/public/*` bypasses app auth so we MUST verify the header here.
 */
export const Route = createFileRoute('/api/public/cron/researcher-digest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET
        const provided = request.headers.get('x-cron-secret')
        if (!expected || !provided || provided !== expected) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        // Researcher weekly progress digest is intentionally disabled. Only
        // critical account-lifecycle emails send automatically right now.
        return Response.json({ ok: true, disabled: true, sent: 0 })
      },
    },
  },
})
