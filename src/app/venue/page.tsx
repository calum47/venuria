import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import RoomFloorPlanManager from '@/components/venue/RoomFloorPlanManager'
import { DbRoom } from '@/types/db'

export default async function VenuePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">Not signed in.</p>
      </main>
    )
  }

  const { data: venueManager } = await supabase
    .from('venue_managers')
    .select('venue_id, venues(name)')
    .eq('user_id', user.id)
    .maybeSingle()

  const venueId = venueManager?.venue_id as string | undefined
  const venueName = (venueManager as { venues: { name: string } | null } | null)?.venues?.name

  const rooms = venueId
    ? ((
        await supabase.from('rooms').select('*').eq('venue_id', venueId).order('created_at')
      ).data as DbRoom[] | null) ?? []
    : []

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-gray-900">Venue Manager{venueName ? ` — ${venueName}` : ''}</h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Logged in as <span className="font-medium text-gray-900">{user.email}</span>.
        </p>

        {!venueId ? (
          <p className="text-sm text-red-600">
            No venue is linked to this account — contact an admin.
          </p>
        ) : (
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Floor plan &amp; restricted zones</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a floor plan PNG, calibrate its scale, trace the wall boundary, and mark obstacles
              (pillars, columns, planters) that furniture can never overlap. Planners see this
              automatically in every project using this room.
            </p>
            <RoomFloorPlanManager venueId={venueId} rooms={rooms} />
          </section>
        )}
      </div>
    </main>
  )
}
