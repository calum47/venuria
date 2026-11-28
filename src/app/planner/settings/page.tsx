import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import SettingsForms from './SettingsForms'
import { normalizePdfStyle } from '@/lib/pdfExport/style'
import { projectTitle } from '@/lib/projectTitle'
import { getTranslations } from 'next-intl/server'

/** Settings (Phase 22a): name, password, team name + currency (manager). The rest of the spec's fields land in 22d. */
export default async function SettingsPage() {
  const t = await getTranslations('Settings')
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">{t('noPlannerAccountLinkedTo')}</p>
      </main>
    )
  }

  // Export look + preview projects: the manager edits them, everyone else just uses them.
  let exports: React.ComponentProps<typeof SettingsForms>['exports'] = null
  if (ctx.planner.role === 'manager') {
    const [{ data: teamRow }, { data: projectRows }] = await Promise.all([
      supabase.from('teams').select('export_style, logo_path').eq('id', ctx.team.id).maybeSingle(),
      supabase
        .from('projects')
        .select('id, couple_names, venues(name)')
        .eq('team_id', ctx.team.id)
        .order('event_date', { ascending: false, nullsFirst: false })
        .limit(50),
    ])
    exports = {
      style: normalizePdfStyle((teamRow as { export_style?: unknown } | null)?.export_style),
      logoPath: (teamRow as { logo_path?: string | null } | null)?.logo_path ?? null,
      projects: (projectRows ?? []).map((p) => ({
        id: p.id as string,
        title: projectTitle(p.couple_names as string | null, (p.venues as unknown as { name: string } | null)?.name ?? t('project')),
      })),
    }
  }

  return (
    <main className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-semibold text-gray-900">{t('settings')}</h1>
        <SettingsForms
          plannerName={ctx.planner.name}
          email={ctx.email}
          plannerCode={ctx.planner.plannerCode}
          role={ctx.planner.role}
          team={ctx.team}
          exports={exports}
        />
      </div>
    </main>
  )
}
