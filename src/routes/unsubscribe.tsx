import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CharlotteLogo } from '@/components/CharlotteLogo'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === 'string' ? s.token : '',
  }),
  component: UnsubscribePage,
})

type Status = 'loading' | 'valid' | 'already' | 'invalid' | 'success' | 'error'

function UnsubscribePage() {
  const { token } = useSearch({ from: '/unsubscribe' })
  const [status, setStatus] = useState<Status>('loading')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) return setStatus('invalid')
        if (body.valid) return setStatus('valid')
        if (body.reason === 'already_unsubscribed') return setStatus('already')
        setStatus('invalid')
      })
      .catch(() => setStatus('error'))
  }, [token])

  const confirm = async () => {
    setSubmitting(true)
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await r.json().catch(() => ({}))
      if (body.success) setStatus('success')
      else if (body.reason === 'already_unsubscribed') setStatus('already')
      else setStatus('error')
    } catch {
      setStatus('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <CharlotteLogo className="h-10 mx-auto" />
        {status === 'loading' && <p className="text-muted-foreground">Loading…</p>}
        {status === 'valid' && (
          <>
            <h1 className="text-2xl font-semibold">Unsubscribe from Charlotte emails</h1>
            <p className="text-muted-foreground">
              Confirm to stop receiving non-essential emails from the Charlotte
              research platform. Required account and study notifications will
              still be sent.
            </p>
            <Button onClick={confirm} disabled={submitting} size="lg">
              {submitting ? 'Working…' : 'Confirm unsubscribe'}
            </Button>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-semibold">You’re unsubscribed</h1>
            <p className="text-muted-foreground">
              You won’t receive further non-essential emails from Charlotte.
            </p>
          </>
        )}
        {status === 'already' && (
          <>
            <h1 className="text-2xl font-semibold">Already unsubscribed</h1>
            <p className="text-muted-foreground">
              This email address is already off our list.
            </p>
          </>
        )}
        {status === 'invalid' && (
          <>
            <h1 className="text-2xl font-semibold">Link not valid</h1>
            <p className="text-muted-foreground">
              This unsubscribe link is invalid or has expired.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground">Please try again in a moment.</p>
          </>
        )}
      </div>
    </div>
  )
}
