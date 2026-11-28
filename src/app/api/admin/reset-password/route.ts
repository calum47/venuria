import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserRole } from '@/lib/supabase/role'
import { passwordProblem } from '@/lib/passwordPolicy'
import { getTranslations } from 'next-intl/server'

/**
 * Admin sets a temporary password on someone else's login (forgotten password, locked out).
 *
 * The caller's own session is checked first: the service-role client used below bypasses RLS, so this
 * check is the only thing between "any signed-in user" and "change anyone's password".
 * The password is only ever used for this one Auth call: it is not stored, logged or returned.
 * Supabase Auth keeps only a one-way hash of it, like for every other password.
 */
export async function POST(request: Request) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('notAuthenticated') }, { status: 401 })

  const { role } = await resolveUserRole(supabase, user.id)
  if (role !== 'admin') return NextResponse.json({ error: t('adminAccessRequired') }, { status: 403 })

  const body = (await request.json().catch(() => null)) as { userId?: string; password?: string } | null
  const userId = body?.userId?.trim() ?? ''
  const password = body?.password ?? ''
  if (!userId || !password) return NextResponse.json({ error: t('chooseAnAccountAndType') }, { status: 400 })

  const issue = passwordProblem(password, await getTranslations('Password'))
  if (issue) return NextResponse.json({ error: issue }, { status: 400 })

  const adminClient = createAdminClient()

  // Only logins that belong to a Venuria account (planner, venue manager, rental manager) can be reset
  // here, never an arbitrary Auth user id.
  const owners = await Promise.all(
    ['planners', 'venue_managers', 'rental_managers'].map((table) =>
      adminClient.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ),
  )
  if (!owners.some((o) => (o.count ?? 0) > 0)) {
    return NextResponse.json({ error: t('thatLoginDoesNotBelong') }, { status: 404 })
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
