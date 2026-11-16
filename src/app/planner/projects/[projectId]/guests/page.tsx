import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { formatDate } from '@/lib/projectDates'
import { GUEST_PHOTOS_BUCKET, buildSeatIndex } from '@/lib/guests'
import type { DbGuest, DbGuestFamily, DbGuestStay } from '@/types/db'
import GuestsApp from './GuestsApp'

type Params = { projectId: string }

/**
 * Guest list details (migration 016): one row per guest with photo, family,
 * dietary needs, speech/VIP flags, seat per room and hotel per night. Planner
 * team only. Seats are read-only here — they are placed in the editor.
 *
 * Photos live in a private bucket, so the server signs one URL per photo up
 * front (1 hour) instead of every thumbnail making its own round trip.
 */
export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ guest?: string | string[] }>
}) {
  const { projectId } = await params
  const { guest: guestParam } = await searchParams
  const preselect = typeof guestParam === 'string' ? guestParam : null
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
      </main>
    )
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, event_date, venue_id, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()

  const [guestsRes, familiesRes, staysRes, assignRes, objectsRes, roomsRes] = await Promise.all([
    supabase.from('guests').select('*').eq('project_id', projectId).order('name'),
    supabase.from('guest_families').select('*').eq('project_id', projectId).order('name'),
    supabase.from('guest_stays').select('*').eq('project_id', projectId).order('night'),
    supabase.from('seat_assignments').select('guest_id, layout_object_id').eq('project_id', projectId),
    supabase.from('layout_objects').select('id, room_id, catalog_item_id, extra_data').eq('project_id', projectId),
    project.venue_id
      ? supabase.from('rooms').select('id, name').eq('venue_id', project.venue_id)
      : Promise.resolve({ data: [], error: null }),
  ])

  const objects = objectsRes.data ?? []
  const catalogIds = [...new Set(objects.map((o) => o.catalog_item_id))]
  const catalogRes = catalogIds.length
    ? await supabase.from('catalog_items').select('id, name').in('id', catalogIds)
    : { data: [], error: null }

  const roomNames = Object.fromEntries((roomsRes.data ?? []).map((r) => [r.id, r.name as string]))
  const catalogNames = Object.fromEntries((catalogRes.data ?? []).map((c) => [c.id, c.name as string]))
  const seats = buildSeatIndex(objects, assignRes.data ?? [], roomNames, catalogNames)

  const guests = (guestsRes.data ?? []) as DbGuest[]
  const paths = guests.map((g) => g.photo_path).filter((p): p is string => !!p)
  const photoUrls: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(GUEST_PHOTOS_BUCKET).createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) photoUrls[s.path] = s.signedUrl
  }

  const loadError =
    guestsRes.error ?? familiesRes.error ?? staysRes.error ?? assignRes.error ?? objectsRes.error ?? roomsRes.error ?? catalogRes.error
  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'

  return (
    <main className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link href={`/planner/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">← {venueName}</Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">Guest list details</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {venueName}
            {project.event_date ? ` · ${formatDate(project.event_date)}` : ''} · visible to your team only
          </p>
        </div>

        {loadError && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Could not load everything: {loadError.message}
          </p>
        )}

        <GuestsApp
          projectId={projectId}
          teamId={ctx.team.id}
          eventDate={project.event_date}
          initialGuests={guests}
          initialFamilies={(familiesRes.data ?? []) as DbGuestFamily[]}
          initialStays={(staysRes.data ?? []) as DbGuestStay[]}
          seats={seats}
          initialSelectedId={guests.some((g) => g.id === preselect) ? preselect : null}
          initialPhotoUrls={photoUrls}
        />
      </div>
    </main>
  )
}
