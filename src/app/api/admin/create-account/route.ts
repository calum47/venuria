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
  const { targetRole, name, email, password, venueId, rentalCompanyId } = body as {
    targetRole: 'venue_manager' | 'rental_manager' | 'planner'
    name: string
    email: string
    password: string
    venueId?: string
    rentalCompanyId?: string
  }

  if (targetRole !== 'venue_manager' && targetRole !== 'rental_manager' && targetRole !== 'planner') {
    return NextResponse.json(
      { error: 'targetRole must be "venue_manager", "rental_manager", or "planner".' },
      { status: 400 },
    )
  }
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email, and password are required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (targetRole === 'venue_manager' && !venueId) {
    return NextResponse.json(
      { error: 'A venue must be selected for a venue manager account.' },
      { status: 400 },
    )
  }
  if (targetRole === 'rental_manager' && !rentalCompanyId) {
    return NextResponse.json(
      { error: 'A rental company must be selected for a rental manager account.' },
      { status: 400 },
    )
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
    targetRole === 'venue_manager'
      ? await adminClient.from('venue_managers').insert({
          user_id: created.user.id,
          venue_id: venueId,
          name,
          email,
        })
      : targetRole === 'rental_manager'
        ? await adminClient.from('rental_managers').insert({
            user_id: created.user.id,
            rental_company_id: rentalCompanyId,
            name,
            email,
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

    // venue_managers.venue_id / rental_managers.rental_company_id are unique —
    // friendlier messages than the raw Postgres constraint errors when someone
    // tries to double-assign a venue or rental company.
    const message = insertResult.error.message.includes('venue_managers_venue_id_key')
      ? 'That venue already has a manager account assigned.'
      : insertResult.error.message.includes('rental_managers_rental_company_id_key')
        ? 'That rental company already has a manager account assigned.'
        : insertResult.error.message

    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}