import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/**
 * Admin-only: resolve a list of email addresses to {email, userId, roles}.
 * Used by the admin email drill-down to tag each recipient with their role.
 */
export const resolveEmailRoles = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ emails: z.array(z.string()).max(2000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    // Verify admin
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId)
    if (!(callerRoles ?? []).some((r) => r.role === 'admin')) {
      throw new Error('Forbidden: admin only')
    }

    const wanted = new Set(data.emails.map((e) => e.toLowerCase()))
    const emailToUser = new Map<string, string>()

    // Page through auth users (cap to ~5 pages = 1000 users)
    for (let page = 1; page <= 10; page++) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      } as any)
      const users = (list?.users ?? []) as Array<{ id: string; email?: string }>
      if (users.length === 0) break
      for (const u of users) {
        const e = (u.email || '').toLowerCase()
        if (e && wanted.has(e)) emailToUser.set(e, u.id)
      }
      if (users.length < 200) break
    }

    const userIds = Array.from(emailToUser.values())
    const userToRoles = new Map<string, string[]>()
    if (userIds.length > 0) {
      const { data: rolesRows } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds)
      for (const r of (rolesRows ?? []) as { user_id: string; role: string }[]) {
        const list = userToRoles.get(r.user_id) ?? []
        list.push(r.role)
        userToRoles.set(r.user_id, list)
      }
    }

    const result: Record<string, { userId: string | null; roles: string[] }> = {}
    for (const email of wanted) {
      const uid = emailToUser.get(email) ?? null
      result[email] = {
        userId: uid,
        roles: uid ? userToRoles.get(uid) ?? [] : [],
      }
    }
    return result
  })
