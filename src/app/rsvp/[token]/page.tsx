import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlausibleToken, rsvpOpen } from '@/lib/rsvp'
import { TEXT, pickLang } from '@/lib/rsvpText'
import RsvpForm from './RsvpForm'

export const dynamic = 'force-dynamic'
// Link-only page: keep it out of search engines.
export const metadata = { title: 'RSVP', robots: { index: false, follow: false } }

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string | string[] }> }

/**
 * Public RSVP page (migration 025). Not under proxy.ts protection: guests have no
 * account. Reads with the service-role client, and only ever exposes what the
 * guest needs: the venue name, the event date, the planner's welcome text, the
 * deadline and whether a plus-one may be added. A wrong, switched-off or expired
 * link all show the same "closed" page, so the page cannot be used to probe tokens.
 */
export default async function RsvpPage({ params, searchParams }: Props) {
  const { token } = await params
  const sp = await searchParams
  const h = await headers()
  const lang = pickLang(h.get('accept-language'), typeof sp.lang === 'string' ? sp.lang : null)
  const t = TEXT[lang]

  let cfg: { project_id: string; welcome_message: string | null; deadline: string | null; allow_plus_one: boolean } | null = null
  let venueName: string | null = null
  let eventDate: string | null = null

  if (isPlausibleToken(token)) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('project_rsvp')
      .select('project_id, welcome_message, deadline, allow_plus_one, enabled')
      .eq('token', token)
      .maybeSingle()
    if (data && data.enabled && rsvpOpen(data.deadline)) {
      cfg = data
      const { data: project } = await admin.from('projects').select('event_date, venues(name)').eq('id', data.project_id).maybeSingle()
      venueName = (project?.venues as unknown as { name: string } | null)?.name ?? null
      eventDate = project?.event_date ?? null
    }
  }

  return (
    <main className="flex min-h-screen w-full items-start justify-center bg-gray-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        {!cfg ? (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-gray-900">{t.closedTitle}</h1>
            <p className="text-sm text-gray-500">{t.closedBody}</p>
          </div>
        ) : (
          <RsvpForm
            token={token}
            initialLang={lang}
            welcome={cfg.welcome_message}
            deadline={cfg.deadline}
            allowPlusOne={cfg.allow_plus_one}
            venueName={venueName}
            eventDate={eventDate}
          />
        )}
      </div>
    </main>
  )
}
