import { normalizeSectionOrder } from '@/lib/rsvpSections'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isPlausibleToken, rsvpOpen } from '@/lib/rsvp'
import { RSVP_MEDIA_BUCKET, buildPublicContent } from '@/lib/rsvpContent'
import { TEXT, pickLang } from '@/lib/rsvpText'
import type { DbProjectRsvp, DbRsvpHotel, DbRsvpPhoto } from '@/types/db'
import RsvpForm from './RsvpForm'

export const dynamic = 'force-dynamic'
// Link-only page: keep it out of search engines.
export const metadata = { title: 'RSVP', robots: { index: false, follow: false } }

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ lang?: string | string[]; preview?: string | string[] }>
}

/**
 * Public RSVP page (migrations 025 + 026). Not under proxy.ts protection: guests
 * have no account. Reads with the service-role client, and only ever exposes
 * what the guest needs: venue name, event date, the planner's welcome text and
 * page content, the deadline and whether a plus-one may be added. Images come
 * from a private bucket as 1-hour signed URLs. A wrong, switched-off or expired
 * link all show the same "closed" page, so the page cannot be used to probe tokens.
 *
 * ?preview=1 lets a signed-in planner with access to the project see the page
 * even while the link is off or past its deadline (a banner says so). Anyone
 * else gets exactly what a guest gets.
 */
export default async function RsvpPage({ params, searchParams }: Props) {
  const { token } = await params
  const sp = await searchParams
  const admin = createAdminClient()
  let cfg: DbProjectRsvp | null = null
  if (isPlausibleToken(token)) {
    const { data } = await admin.from('project_rsvp').select('*').eq('token', token).maybeSingle()
    cfg = (data as DbProjectRsvp | null) ?? null
  }
  // A guest's own choice (?lang=) wins; otherwise the language the planner picked.
  const lang = pickLang(typeof sp.lang === 'string' ? sp.lang : null, cfg?.default_lang)
  const t = TEXT[lang]

  const live = !!cfg && cfg.enabled && rsvpOpen(cfg.deadline)
  const previewOk = !!cfg && sp.preview === '1' ? await plannerCanPreview(cfg.project_id) : false

  if (!cfg || (!live && !previewOk)) {
    return (
      <main className="flex min-h-screen w-full items-start justify-center bg-gray-50 px-4 py-10 sm:items-center">
        <div className="w-full max-w-xl space-y-2 rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900">{t.closedTitle}</h1>
          <p className="text-sm text-gray-500">{t.closedBody}</p>
        </div>
      </main>
    )
  }

  const [{ data: project }, { data: photoRows }, { data: hotelRows }] = await Promise.all([
    admin.from('projects').select('event_date, couple_names, venues(name)').eq('id', cfg.project_id).maybeSingle(),
    admin.from('project_rsvp_photos').select('*').eq('project_id', cfg.project_id).order('position').order('created_at'),
    admin.from('project_rsvp_hotels').select('*').eq('project_id', cfg.project_id).order('position').order('created_at'),
  ])
  const photos = (photoRows ?? []) as DbRsvpPhoto[]
  const hotels = (hotelRows ?? []) as DbRsvpHotel[]

  const paths = [cfg.cover_path, ...photos.map((p) => p.path), ...hotels.map((x) => x.image_path)].filter((p): p is string => !!p)
  const urls: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: signed } = await admin.storage.from(RSVP_MEDIA_BUCKET).createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl
  }

  const venueName = (project?.venues as unknown as { name: string } | null)?.name ?? null

  return (
    <main className="flex min-h-screen w-full items-start justify-center bg-gradient-to-b from-brand-50 via-gray-50 to-gray-50 px-3 py-4 sm:px-4 sm:py-10">
      <div className="w-full max-w-2xl">
        <RsvpForm
          token={token}
          initialLang={lang}
          welcome={cfg.welcome_message}
          coupleNames={project?.couple_names ?? null}
          deadline={cfg.deadline}
          allowPlusOne={cfg.allow_plus_one}
          venueName={venueName}
          eventDate={project?.event_date ?? null}
          content={buildPublicContent(cfg, photos, hotels, urls)}
          preview={previewOk ? (live ? 'live' : 'off') : null}
          sectionOrder={normalizeSectionOrder(cfg.section_order)}
        />
      </div>
    </main>
  )
}

/** A signed-in planner who can open this project. Anyone else (including guests) is never a previewer. */
async function plannerCanPreview(projectId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    const { data } = await supabase.rpc('planner_can_access_project', { pid: projectId })
    return data === true
  } catch {
    return false
  }
}
