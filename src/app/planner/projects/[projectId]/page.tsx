import Link from 'next/link'
import { needsSeat } from '@/lib/guests'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { countdownLabel, formatDate } from '@/lib/projectDates'
import { projectTitle } from '@/lib/projectTitle'
import ProjectNameEditor from './ProjectNameEditor'
import DeleteProjectSection from './DeleteProjectSection'
import { paymentStatus } from '@/lib/payments'
import { areaHint, summariseAreas } from '@/lib/hubAreas'
import { capacityLine } from '@/lib/capacity'
import type { DbProjectRoomSetting } from '@/types/db'
import ProjectOrders from './ProjectOrders'
import { getProjectAccess } from '@/lib/projectAccess'
import ViewOnlyBanner from '@/components/ViewOnlyBanner'
import { HubCard, hubCardClass as card } from '@/components/brand/HubCard'
import type { DbStockOrder } from '@/types/db'

type Params = { projectId: string }

/**
 * The project's landing page: what you see after clicking a project in My
 * Projects, before choosing where to go. It is deliberately only a
 * navigation/aggregation layer (see "Project Hub" in the Ideas doc) — each
 * card links to a screen that owns its own data, so new sections (Timetable,
 * Music, Invoices…) are one more card, not a rewrite.
 *
 * Lives under /planner so proxy.ts already restricts it to planners and the
 * planner nav wraps it. Access is whatever RLS lets this planner read; a
 * project they cannot see is indistinguishable from one that does not exist.
 */
export default async function ProjectHubPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params
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
    .select('id, status, event_date, venue_id, planner_id, couple_names, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()
  // 'view' = a Member looking at a Public project they are not assigned to (migration 038).
  const viewOnly = (await getProjectAccess(supabase, projectId)) === 'view'

  const { data: payments } = await supabase
    .from('project_payments')
    .select('due_date, paid_at')
    .eq('project_id', projectId)

  const { data: guestRows } = await supabase
    .from('guests')
    .select('id, is_vip, age_group, seat_dismissed_at, rsvp_status')
    .eq('project_id', projectId)
  const { data: seatRows } = await supabase
    .from('seat_assignments')
    .select('guest_id')
    .eq('project_id', projectId)
  const seated = new Set((seatRows ?? []).map((s) => s.guest_id))
  const needSeat = (guestRows ?? []).filter((g) => needsSeat(g, seated.has(g.id) ? 1 : 0)).length
  const declined = (guestRows ?? []).filter((g) => g.rsvp_status === 'declined').length
  const guestCount = (guestRows?.length ?? 0) - declined
  const vipCount = (guestRows ?? []).filter((g) => g.is_vip).length
  const guestsHint =
    (guestRows?.length ?? 0) === 0
      ? 'No guests yet — photos, families, dietary needs, hotel per night'
      : `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}${vipCount > 0 ? ` · ${vipCount} VIP` : ''}${declined > 0 ? ` · ${declined} declined` : ''}${needSeat > 0 ? ` · ${needSeat} still ${needSeat === 1 ? 'needs' : 'need'} a seat` : ''}`

  const { count: blockCount } = await supabase
    .from('timetable_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  const timetableHint =
    !blockCount ? 'Hourly schedule per event day, tagged by vendor' : `${blockCount} ${blockCount === 1 ? 'block' : 'blocks'} scheduled`

  // Areas: every room of the venue, with what this project has placed in it.
  const [{ data: roomRows }, { data: objectRows }, { data: assignRows }, { data: orderRows }, { data: itemRows }, { data: settingRows }, { count: guestTotal }] = await Promise.all([
    supabase.from('rooms').select('id, name, type, capacity_seated, capacity_standing').eq('venue_id', project.venue_id).order('name'),
    supabase.from('layout_objects').select('id, room_id, catalog_item_id').eq('project_id', projectId),
    supabase.from('seat_assignments').select('layout_object_id').eq('project_id', projectId),
    supabase.from('stock_orders').select('*').eq('project_id', projectId).order('ordered_at', { ascending: false }).limit(200),
    supabase.rpc('stock_items_for_me').select('id, name').order('name'),
    supabase.from('project_room_settings').select('*').eq('project_id', projectId),
    supabase.from('guests').select('id', { count: 'exact', head: true }).eq('project_id', projectId).or('rsvp_status.is.null,rsvp_status.neq.declined'),
  ])
  const settingByRoom = new Map(((settingRows ?? []) as DbProjectRoomSetting[]).map((s) => [s.room_id, s]))
  const roomById = new Map((roomRows ?? []).map((r) => [r.id, r]))
  const usedItemIds = [...new Set((objectRows ?? []).map((o) => o.catalog_item_id).filter((x): x is string => !!x))]
  const { data: catRows } = usedItemIds.length
    ? await supabase.from('catalog_items').select('id, category').in('id', usedItemIds)
    : { data: [] as { id: string; category: string }[] }
  const areas = summariseAreas(
    roomRows ?? [],
    objectRows ?? [],
    new Map((catRows ?? []).map((c) => [c.id, c.category])),
    assignRows ?? [],
  )

  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'
  const all = payments ?? []
  const overdue = all.filter((p) => paymentStatus(p).kind === 'overdue').length
  const unpaid = all.filter((p) => !p.paid_at).length
  const paymentsHint =
    all.length === 0
      ? 'No payments added yet'
      : overdue > 0
        ? `${overdue} overdue · ${unpaid} unpaid of ${all.length}`
        : unpaid > 0
          ? `${unpaid} unpaid of ${all.length}`
          : `All ${all.length} paid`

  return (
    <main className="px-4 sm:px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <Link href="/planner" className="text-sm text-gray-500 hover:text-gray-900">← My projects</Link>
          <h1 className="mt-3 text-4xl font-semibold text-gray-900">{projectTitle(project.couple_names, venueName)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {project.couple_names?.trim() ? `${venueName} · ` : ''}{project.event_date ? `${formatDate(project.event_date)} · ${countdownLabel(project.event_date)}` : 'No event date set'}
            {project.status ? ` · ${project.status}` : ''}
          </p>
          {!viewOnly && <ProjectNameEditor projectId={projectId} coupleNames={project.couple_names} />}
        </div>

        {viewOnly && <ViewOnlyBanner />}

        <div data-tour="hub" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HubCard href={`/editor/${projectId}`} icon="editor" title="Project editor" hint="Floor plan, seating and 3D view" />
          <HubCard href={`/editor/${projectId}/summary`} icon="summary" title="Layout summary" hint="Everything placed, stock shortfalls and zones" />
          {!viewOnly && <HubCard href={`/planner/projects/${projectId}/payments`} icon="payments" title="Payments & documents" hint={paymentsHint} hintClass={overdue > 0 ? 'text-red-600' : 'text-gray-500'} />}
          <HubCard href={`/planner/projects/${projectId}/timetable`} icon="timetable" title="Timetable" hint={timetableHint} />
          <HubCard href={`/planner/projects/${projectId}/rundown`} icon="rundown" title="Run-down list" hint="Day-of list for the team and vendors — print or save as PDF" />
          <HubCard href={`/planner/projects/${projectId}/guests`} icon="guests" title="Guest list details" hint={guestsHint} hintClass={needSeat > 0 ? 'text-amber-700' : 'text-gray-500'} />
        </div>

        <section data-tour="areas" className="space-y-2" aria-labelledby="areas-h">
          <h2 id="areas-h" className="text-xl font-medium text-gray-900">Areas of the venue</h2>
          {areas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">This venue has no areas set up yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((a) => (
                <Link key={a.id} href={`/editor/${projectId}?room=${a.id}`} className={card}>
                  <p className="font-medium text-gray-900">{a.name}</p>
                  <p className="mt-1 text-sm text-gray-500">{areaHint(a)}</p>
                  {(() => {
                    const room = roomById.get(a.id)
                    const setting = settingByRoom.get(a.id)
                    const line = room
                      ? capacityLine(room, setting?.mode ?? null, a.chairs, guestTotal ?? 0, setting?.override_load ?? null)
                      : null
                    if (!line) return null
                    const tone = line.state === 'over' ? 'text-red-600' : line.state === 'acknowledged' || line.state === 'near' ? 'text-amber-700' : 'text-gray-500'
                    return <p className={`mt-1 text-xs ${tone}`}>{line.text}</p>
                  })()}
                  <p className="mt-2 text-xs text-gray-400">Open in the editor →</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {!viewOnly && <ProjectOrders
          projectId={projectId}
          teamId={ctx.team.id}
          items={(itemRows ?? []) as { id: string; name: string }[]}
          initialOrders={(orderRows ?? []) as DbStockOrder[]}
        />}

        {!viewOnly && (project.planner_id === ctx.planner.id || ctx.planner.role === 'manager' || ctx.planner.role === 'lead') && (
          <DeleteProjectSection projectId={projectId} title={projectTitle(project.couple_names, venueName)} />
        )}
      </div>
    </main>
  )
}
