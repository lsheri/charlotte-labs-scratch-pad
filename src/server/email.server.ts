import * as React from 'react'
import { render } from '@react-email/components'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { kickEmailQueue } from '@/server/email-queue-kick.server'

const SITE_NAME = 'Charlotte Labs'
const SENDER_DOMAIN = 'notify.charlotte-labs.com'
const FROM_DOMAIN = 'notify.charlotte-labs.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface SendArgs {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, any>
  /**
   * Optional participant user id. When provided, sending is skipped if the
   * participant has any session_participants row marked withdrawn — enforces
   * the brand-guide rule "no automated emails after a participant withdraws".
   */
  participantUserId?: string
}

/**
 * Server-side transactional email sender. Bypasses the user-JWT auth on the
 * /lovable/email/transactional/send route by enqueuing directly via the
 * service role. Use this from server functions, webhooks, and cron jobs.
 */
export async function sendTransactionalEmailServer(args: SendArgs) {
  const { templateName, recipientEmail, templateData = {}, participantUserId } = args
  const messageId = crypto.randomUUID()
  const idempotencyKey = args.idempotencyKey || messageId

  const template = TEMPLATES[templateName]
  if (!template) {
    console.error('[email] template not found', { templateName })
    return { ok: false, reason: 'template_not_found' as const }
  }

  const recipient = (template.to || recipientEmail || '').toLowerCase()
  if (!recipient) return { ok: false, reason: 'no_recipient' as const }

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', recipient)
    .maybeSingle()
  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'suppressed',
    })
    return { ok: false, reason: 'suppressed' as const }
  }

  // Withdrawal safety
  if (participantUserId) {
    const { data: withdrawn } = await supabaseAdmin
      .from('session_participants')
      .select('id')
      .eq('participant_id', participantUserId)
      .not('withdrawn_at', 'is', null)
      .limit(1)
      .maybeSingle()
    if (withdrawn) {
      await supabaseAdmin.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'suppressed',
        error_message: 'participant withdrawn',
      })
      return { ok: false, reason: 'withdrawn' as const }
    }
  }

  // Unsubscribe token (one per email)
  let unsubscribeToken = ''
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', recipient)
    .maybeSingle()
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token
  } else if (!existing) {
    unsubscribeToken = generateToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: recipient },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', recipient)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  } else {
    return { ok: false, reason: 'suppressed' as const }
  }

  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('[email] enqueue failed', { templateName, error: enqueueError })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: 'enqueue failed',
    })
    return { ok: false, reason: 'enqueue_failed' as const }
  }

  // Fire-and-forget: kick the queue processor so the email leaves within
  // ~1s instead of waiting for the hourly safety-net cron.
  kickEmailQueue()

  return { ok: true as const, messageId }
}

/** Look up a user's email + best-effort first name. */
export async function getUserContact(userId: string): Promise<{
  email: string | null
  firstName: string | null
}> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = data?.user?.email ?? null
  const meta = (data?.user?.user_metadata ?? {}) as Record<string, any>
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  const displayName: string | null =
    profile?.display_name || meta.display_name || meta.name || null
  const firstName = displayName ? displayName.split(/\s+/)[0] : null
  return { email, firstName }
}
