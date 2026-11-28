'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { projectTitle } from '@/lib/projectTitle'
import { getTranslations } from 'next-intl/server'

/** Private buckets whose files live under `{team_id}/{project_id}/…` and are not removed by the database cascade. */
const PROJECT_BUCKETS = ['guest-photos', 'project-documents', 'rsvp-media'] as const

type StorageAdmin = ReturnType<typeof createAdminClient>['storage']

/** Every file path under a prefix (Storage lists one level at a time; folders have no id). */
async function listAll(storage: StorageAdmin, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return []
  const out: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: 100, offset })
    if (error || !data || data.length === 0) break
    for (const e of data) {
      if (e.id) out.push(`${prefix}/${e.name}`)
      else out.push(...(await listAll(storage, bucket, `${prefix}/${e.name}`, depth + 1)))
    }
    if (data.length < 100) break
  }
  return out
}

/**
 * Permanently deletes a project. The database removes guests, layout, payments,
 * RSVP data etc. by cascade; uploaded files are removed here afterwards.
 *
 * Who may delete is decided by the database (migration 031: the creator, or a
 * manager/lead of the team). The typed title is a guard against a mis-click,
 * not a security check.
 */
export async function deleteProject(formData: FormData): Promise<{ error?: string; warning?: string; ok?: boolean }> {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t('notAuthenticated') }

  const projectId = formData.get('projectId') as string
  const typed = ((formData.get('confirm') as string | null) ?? '').trim().toLowerCase()
  if (!projectId) return { error: t('missingProject') }

  const { data: project } = await supabase
    .from('projects')
    .select('id, team_id, couple_names, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { error: t('projectNotFoundOrYou2') }

  const title = projectTitle(project.couple_names, (project.venues as unknown as { name: string } | null)?.name ?? '')
  if (!typed || typed !== title.trim().toLowerCase()) return { error: t('theNameYouTypedDoes') }

  const { data: deleted, error } = await supabase.from('projects').delete().eq('id', projectId).select('id')
  if (error) return { error: error.message }
  if (!deleted || deleted.length === 0) {
    return { error: t('onlyThePlannerWhoCreated') }
  }

  // The row is gone; now remove the files. A failure here must not undo or hide the delete.
  let leftover = 0
  try {
    const storage = createAdminClient().storage
    for (const bucket of PROJECT_BUCKETS) {
      const paths = await listAll(storage, bucket, `${project.team_id}/${projectId}`)
      for (let i = 0; i < paths.length; i += 100) {
        const { error: rmErr } = await storage.from(bucket).remove(paths.slice(i, i + 100))
        if (rmErr) leftover += paths.slice(i, i + 100).length
      }
    }
  } catch {
    leftover = -1
  }

  revalidatePath('/planner')
  revalidatePath('/planner/stock')
  return leftover === 0 ? { ok: true } : { ok: true, warning: t('theProjectWasDeletedBut') }
}
