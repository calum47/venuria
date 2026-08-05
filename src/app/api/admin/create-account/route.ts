import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserRole } from '@/lib/supabase/role'

function generatePlannerCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(request: Request) {
  // Check the CALLER's own session/role first — the service-role client
  // used below bypasses RLS, so this check is the only thing standing
  // between "any authenticated user" and "create arbitrary accounts".
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { role } = await resolveUserRole(supabase, user.id)
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const body = await request.json()
  const { targetRole, name, email, password, maxCapacityPersons } = body as {
    targetRole: 'venue' | 'planner'
    name: string
    email: string
    password: string
    maxCapacityPersons?: number
  }

  if (targetRole !== 'venue' && targetRole !== 'planner') {
    return NextResponse.json({ error: 'targetRole must be "venue" or "planner".' }, { status: 400 })
  }
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email, and password are required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: created, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification — admin is vouching for this account directly
  })

  if (createUserError || !created.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? 'Failed to create the login.' },
      { status: 400 },
    )
  }

  const insertResult =
    targetRole === 'venue'
      ? await adminClient.from('venues').insert({
          user_id: created.user.id,
          name,
          max_capacity_persons: maxCapacityPersons ?? null,
        })
      : await adminClient.from('planners').insert({
          user_id: created.user.id,
          name,
          email,
          planner_code: generatePlannerCode(),
        })

  if (insertResult.error) {
    // Roll back the auth user so we don't leave an orphaned login with no
    // role row — resolveUserRole would otherwise treat them as "no role"
    // forever, a login that goes nowhere.
    await adminClient.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: insertResult.error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
