import type { PlannerRole } from '@/lib/supabase/plannerContext'

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
  /** Shown instead of `body` while they do it (sample project only). */
  instruction: string
  /** Shown once they have done it. */
  done: string
}

export type TourStep = {
  id: string
  /** Route this step lives on, or null to skip the step (e.g. it needs a project and there is none). */
  path: (c: TourCtx) => string | null
  /** data-tour="…" value(s) to spotlight; several are spotlighted as one area. No target = a centred card. */
  target?: string | string[]
  /** With a target: show a centred card instead of skipping when the element isn't on the page. */
  centerIfMissing?: boolean
  title: string
  /** The explanation. On the sample project, an interactive step shows `action.instruction` instead. */
  body: string
  /** Team roles that see this step. Default: all. */
  roles?: PlannerRole[]
  /** Interactive step: only on the sample project; elsewhere it is shown as a plain explanation. */
  action?: TourAction
  /** Only shown for the practice project the tour created. */
  sampleOnly?: boolean
  /** Replaces `body` on the practice project (e.g. to say the content is an example). */
  sampleBody?: string
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
    title: 'Welcome to Venuria',
    body: 'A short tour. Use this menu to move between projects, stock, team and settings; “Last project” returns you to the page you were last on. Esc stops the tour, and you can replay it from Settings.',
  },
  {
    id: 'new-project', path: fixed('/planner'), target: 'new-project',
    title: 'Start a project',
    body: 'Pick the venue, the couple’s names and the event date. New projects are Public: your team can view them, and only people assigned to a project can edit it. Open any project from the list below.',
  },
  {
    id: 'hub', path: project(), target: 'hub',
    title: 'Project hub',
    body: 'Everything for one event: the editor, summary, payments and documents, timetable, run-down list and guest details.',
    sampleBody: 'This is a practice project we created for you, “Alex & Sam (sample)”; delete it any time from the bottom of this page. The hub holds everything for one event: the editor, summary, payments, timetable, run-down and guests.',
  },
  {
    id: 'place-table', path: editor(), target: ['catalog', 'canvas'],
    title: 'Place a table',
    body: 'Drag a table from the catalogue onto the floor plan, then choose how many chairs it gets. Drag empty space to move around the map; scroll or pinch to zoom.',
    action: {
      until: 'object-placed',
      instruction: 'Your turn: drag a table from the Tables section onto the floor plan, then choose how many chairs it gets. Drag empty space to move around the map; scroll or pinch to zoom.',
      done: 'That’s how a layout is built. You can change the chair count later.',
    },
  },
  {
    id: 'canvas', path: editor(), target: 'canvas',
    title: 'Move around the floor plan',
    body: 'Click a table to select it: a panel on the right shows its size, rotation and chairs. Drag a table to move it; Ctrl+drag to select several. Sizes and availability come from the venue and rental catalogues.',
  },
  {
    id: 'rooms-capacity', path: editor(), target: ['rooms', 'capacity'],
    title: 'Rooms and capacity',
    body: 'Switch between the venue’s rooms, and choose whether each is seated or standing to see how close you are to its limit.',
  },
  {
    id: 'auto-arrange', path: editor(), target: 'auto-arrange',
    title: 'Auto-Arrange',
    body: 'Fills the room with dining tables, avoiding obstacles and anything already placed. Nothing existing is moved.',
  },
  {
    id: 'seating', path: editor(), target: 'seating',
    title: 'Seating plan',
    body: 'Turn this on to seat guests: click a chair to assign someone, or drag them from the guest list.',
  },
  {
    id: 'zones', path: editor(), target: 'zones',
    title: 'Zones',
    body: 'Mark areas such as a dance floor. Auto-Arrange keeps tables out of them.',
  },
  {
    id: 'export', path: editor(), target: ['summary-link', 'export-jpg'],
    title: 'Summary and export',
    body: 'Download the room as a JPG, or open the Summary for everything placed, stock shortfalls and the PDF export.',
  },
  {
    id: 'add-guests', path: project('/guests'), target: 'guests-add',
    title: 'Add guests',
    body: 'Add guests one at a time, or import a list from a file. Open a guest to add family, dietary needs, hotel and seat.',
    action: {
      until: 'guest-added',
      instruction: 'Your turn: type a guest’s name and press “Add guest”. Add one or two names.',
      done: 'Added. Open a guest to add family, dietary needs, hotel and seat.',
    },
  },
  {
    id: 'rsvp', path: project('/guests'), target: 'rsvp-panel',
    title: 'RSVP link',
    body: 'Share one link with all your guests so they can answer themselves. Answers appear in your list; new names are flagged “To review”.',
  },
  {
    id: 'payments', path: project('/payments'),
    title: 'Payments & documents',
    body: 'Log each deposit, instalment and balance with its due date; reminders start 7 days before it falls due. Keep contracts and quotes alongside.',
  },
  {
    id: 'timetable', path: project('/timetable'), target: 'timetable-grid', centerIfMissing: true,
    title: 'Timetable',
    body: 'Plan the day hour by hour, across several days if needed, and tag blocks with the vendor responsible.',
    sampleBody: 'An example day, so you can see how it looks. Plan the day hour by hour, across several days if needed, and tag blocks with the vendor responsible.',
  },
  {
    id: 'rundown', path: project('/rundown'), target: 'rundown-list', centerIfMissing: true,
    title: 'Run-down list',
    body: 'A day-of list for the team and vendors, built from the timetable. Print it or save it as a PDF.',
    sampleBody: 'The same example day as a list for the team and vendors. Print it or save it as a PDF.',
  },
  {
    id: 'stock', path: fixed('/planner/stock'),
    title: 'Stock',
    body: 'Your catalogue, purchases and sales, with average cost and margins. Managers and leads edit it; members can view it.',
  },
  {
    id: 'team', path: fixed('/planner/team'), roles: ['manager', 'lead'],
    title: 'Team',
    body: 'Invite colleagues with a one-time link. Members see public projects and their own; Leads see and assign every project.',
  },
  {
    id: 'settings', path: fixed('/planner/settings'), target: 'replay-tour', centerIfMissing: true,
    title: 'That’s the tour',
    body: 'Your name, password and team details live here too. Replay this tour any time with this button.',
  },
]

/** Fired by the Settings button; TourGuide (mounted in the root layout) listens for it. */
export const START_TOUR_EVENT = 'venuria:start-tour'
