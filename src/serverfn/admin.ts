import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/**
 * Admin-only: promote a user to researcher (also keeps participant role) and
 * send the researcher-account-promoted welcome email.
 */
export const promoteToResearcher = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendTransactionalEmailServer, getUserContact } = await import(
      '../server/email.server'
    )

    // Verify caller is admin
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId)
    if (!(callerRoles ?? []).some((r) => r.role === 'admin')) {
      throw new Error('Forbidden: admin only')
    }

    const { error } = await supabaseAdmin.rpc('grant_researcher_role', {
      _email: data.email,
    })
    if (error) throw new Error(error.message)

    // Look up the promoted user to send the email
    const { data: lookup } = await (supabaseAdmin.auth.admin as any).getUserByEmail(data.email)
    const promoted = lookup?.user ?? null
    if (promoted) {
      const { firstName } = await getUserContact(promoted.id)
      await sendTransactionalEmailServer({
        templateName: 'researcher-account-promoted',
        recipientEmail: data.email,
        idempotencyKey: `promoted-researcher-${promoted.id}`,
        templateData: { firstName },
      })
    }
    return { ok: true }
  })
