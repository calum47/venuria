import type { PlannerRole } from '@/lib/supabase/plannerContext'
import type { Tr } from '@/i18n/types'

/**
 * What the tour needs to know to build its route.
 * `sample` is true only when the tour just created a practice project for a planner who had none:
 * only then are "do it yourself" steps interactive. On a planner's real project they are explained, never performed.
 */
export type TourCtx = { role: PlannerRole; projectId: string | null; sample: boolean }

/** What the planner has to do to finish an interactive step. */
export type TourAction = {
  /** object-placed: something new appears on the floor plan. guest-added: the project's guest count goes up. */
  until: 'object-placed' | 'guest-added'
}

export type TourStep = {
  id: string
  /** Route this step lives on, or null to skip the step (e.g. it needs a project and there is none). */
  path: (c: TourCtx) => string | null
  /** data-tour="…" value(s) to spotlight; several are spotlighted as one area. No target = a centred card. */
  target?: string | string[]
  /** With a target: show a centred card instead of skipping when the element isn't on the page. */
  centerIfMissing?: boolean
  /** Team roles that see this step. Default: all. */
  roles?: PlannerRole[]
  /** Interactive step: only on the sample project; elsewhere it is shown as a plain explanation. */
  action?: TourAction
  /** Only shown for the practice project the tour created. */
  sampleOnly?: boolean
  /** The practice project has its own wording for this step (e.g. to say the content is an example). */
  hasSampleBody?: boolean
}

/**
 * The words of a step live in messages (namespace "Tour"), under keys built from the step id:
 * `<id>Title`, `<id>Body`, `<id>Sample` (practice-project wording), `<id>Do` / `<id>Done` (interactive steps).
 */
export function tourText(t: Tr, step: TourStep, opts: { sample: boolean; interactive: boolean; actionDone: boolean }) {
  const title = t(`${step.id}Title`)
  if (opts.interactive && step.action) return { title, text: t(opts.actionDone ? `${step.id}Done` : `${step.id}Do`) }
  if (opts.sample && step.hasSampleBody) return { title, text: t(`${step.id}Sample`) }
  return { title, text: t(`${step.id}Body`) }
}

const project = (rest = '') => (c: TourCtx) => (c.projectId ? `/planner/projects/${c.projectId}${rest}` : null)
const editor = (rest = '') => (c: TourCtx) => (c.projectId ? `/editor/${c.projectId}${rest}` : null)
const fixed = (p: string) => () => p

/**
 * The planner tour, in order. A step whose target isn't on screen (for example the catalogue
 * for a view-only project) is skipped, so the tour never points at something that isn't there.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome', path: fixed('/planner'), target: 'nav',
  },
  {
    id: 'newProject', path: fixed('/planner'), target: ['new-project', 'project-list'],
  },
  {
    id: 'hub', path: project(), target: 'hub',
    hasSampleBody: true,
  },
  {
    id: 'placeTable', path: editor(), target: ['catalog', 'canvas'],
    action: {
      until: 'object-placed',
    },
  },
  {
    id: 'canvas', path: editor(), target: 'canvas',
  },
  {
    id: 'roomsCapacity', path: editor(), target: ['rooms', 'capacity'],
  },
  {
    id: 'autoArrange', path: editor(), target: 'auto-arrange',
  },
  {
    id: 'seatingZones', path: editor(), target: ['seating', 'zones'],
  },
  {
    id: 'export', path: editor(), target: ['summary-link', 'export-jpg'],
  },
  {
    id: 'addGuests', path: project('/guests'), target: 'guests-add',
    action: {
      until: 'guest-added',
    },
  },
  {
    id: 'rsvp', path: project('/guests'), target: 'rsvp-panel',
  },
  {
    id: 'payments', path: project('/payments'),
  },
  {
    id: 'timetable', path: project('/timetable'), target: 'timetable-grid', centerIfMissing: true,
    hasSampleBody: true,
  },
  {
    id: 'rundown', path: project('/rundown'), target: 'rundown-list', centerIfMissing: true,
    hasSampleBody: true,
  },
  {
    id: 'stock', path: fixed('/planner/stock'),
  },
  {
    id: 'team', path: fixed('/planner/team'), roles: ['manager', 'lead'],
  },
  {
    id: 'settings', path: fixed('/planner/settings'), target: 'replay-tour', centerIfMissing: true,
  },
]

/** Fired by the Settings button; TourGuide (mounted in the root layout) listens for it. */
export const START_TOUR_EVENT = 'venuria:start-tour'
