import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/**
 * Fires the participant-enrollment-confirmed email after the participant
 * accepts consent for a session. Idempotent on (sessionId, userId).
 */
export const sendEnrollmentConfirmation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { sendTransactionalEmailServer, getUserContact } = await import(
      '../server/email.server'
    )
    const { email, firstName } = await getUserContact(context.userId)
    if (!email) return { ok: false, reason: 'no_email' }
    return sendTransactionalEmailServer({
      templateName: 'participant-enrollment-confirmed',
      recipientEmail: email,
      idempotencyKey: `enrollment-${data.sessionId}-${context.userId}`,
      participantUserId: context.userId,
      templateData: { firstName },
    })
  })

/**
 * Records participant withdrawal from a session. Marks session_participants
 * row(s) as withdrawn and sends the withdrawal-confirmation email.
 */
export const withdrawFromStudy = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sessionId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendTransactionalEmailServer, getUserContact } = await import(
      '../server/email.server'
    )

    const update = supabaseAdmin
      .from('session_participants')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('participant_id', context.userId)
      .is('withdrawn_at', null)
    const { error } = data.sessionId
      ? await update.eq('session_id', data.sessionId)
      : await update
    if (error) throw new Error(error.message)

    // Engine V1: cascade deletion of behavioral signal data
    try {
      const { applyWithdrawalCascade } = await import('@/server/study-lifecycle.server')
      await applyWithdrawalCascade(context.userId)
    } catch (e) {
      console.error('[withdrawal-cascade] import or cascade failed', e)
    }

    const { email, firstName } = await getUserContact(context.userId)
    if (email) {
      // NB: do not pass participantUserId — withdrawal confirmation must be
      // delivered exactly once even though the user is now "withdrawn".
      await sendTransactionalEmailServer({
        templateName: 'participant-withdrawal-confirmed',
        recipientEmail: email,
        idempotencyKey: `withdrawal-${context.userId}-${data.sessionId ?? 'all'}`,
        templateData: { firstName },
      })
    }
    return { ok: true }
  })
