const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** The project pages "Last project" can return to: hub, editor, summary, guests, payments, timetable, run-down. */
const PROJECT_PAGE = new RegExp(
  `^/(?:planner/projects/(${UUID})(?:/(?:guests|payments|timetable|rundown))?|editor/(${UUID})(?:/summary)?)$`,
  'i',
)

/** Which project a pathname belongs to, if it is one of the pages above; otherwise null. */
export function projectPageOf(pathname: string): { projectId: string; path: string } | null {
  const m = PROJECT_PAGE.exec(pathname)
  if (!m) return null
  return { projectId: (m[1] ?? m[2]).toLowerCase(), path: pathname }
}

/**
 * Where "Last project" should go. The stored path is user-writable, so it is only used when it is
 * one of the known project pages AND belongs to the stored project; anything else falls back to the hub.
 */
export function lastPageHref(projectId: string, storedPath: string | null): string {
  const hub = `/planner/projects/${projectId}`
  if (!storedPath) return hub
  const page = projectPageOf(storedPath)
  return page && page.projectId === projectId.toLowerCase() ? storedPath : hub
}
