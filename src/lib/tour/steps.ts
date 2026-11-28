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
    id: 'welcome', path: fixed('/planner'),
    title: 'Welcome to Venuria',
    body: 'A short tour of the main pages. Use Next and Back, or press Esc to stop. You can replay it any time from Settings.',
  },
  {
    id: 'nav', path: fixed('/planner'), target: 'nav',
    title: 'Main menu',
    body: 'Move between your projects, stock, team and settings. “Last project” takes you back to the page you were last on.',
  },
  {
    id: 'new-project', path: fixed('/planner'), target: 'new-project',
    title: 'Start a project',
    body: 'Pick the venue, add the couple’s names and the event date. New projects are Public: your team can view them, and only people assigned to a project can edit it.',
  },
  {
    id: 'project-list', path: fixed('/planner'), target: 'project-list',
    title: 'Your projects',
    body: 'Open a project to reach its floor plan, guests, payments and timetable.',
  },
  {
    id: 'payments-overview', path: fixed('/planner'), target: 'payments-overview',
    title: 'Payments overview',
    body: 'Payments across the projects you can edit, so nothing gets missed.',
  },
  {
    id: 'sample-note', path: project(), sampleOnly: true,
    title: 'Your practice project',
    body: 'We created “Alex & Sam (sample)” so you can try things out without touching real work. Its rooms are set to seated. Delete it any time from the bottom of its project page.',
  },
  {
    id: 'hub', path: project(), target: 'hub',
    title: 'Project hub',
    body: 'Everything for one event: the editor, a layout summary, payments and documents, the timetable, the run-down list and guest details.',
  },
  {
    id: 'areas', path: project(), target: 'areas',
    title: 'Areas of the venue',
    body: 'Each room with its chair count and capacity. Click one to open it in the editor.',
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
    id: 'snap', path: editor(), target: 'snap',
    title: 'Snap to grid',
    body: 'Keeps things neatly aligned while you drag. Turn it off for free placement.',
  },
  {
    id: 'rooms', path: editor(), target: 'rooms',
    title: 'Rooms',
    body: 'Switch between the venue’s rooms. Each has its own layout.',
  },
  {
    id: 'capacity', path: editor(), target: 'capacity',
    title: 'Capacity',
    body: 'Choose whether the room is seated or standing and see how close you are to the venue’s limit.',
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
    id: 'view-3d', path: editor(), target: 'view-3d',
    title: '3D view',
    body: 'See the room as guests will: walk through your layout in 3D.',
  },
  {
    id: 'export-jpg', path: editor(), target: 'export-jpg',
    title: 'Export an image',
    body: 'Download the current room as a JPG to share with the couple or the venue.',
  },
  {
    id: 'summary-link', path: editor(), target: 'summary-link',
    title: 'Layout summary',
    body: 'Everything placed in the project, any stock shortfalls to rent, and the PDF export for clients and vendors.',
  },
  {
    id: 'save-status', path: editor(), target: 'save-status',
    title: 'Saved automatically',
    body: 'Changes save as you go. This shows when the last save happened.',
  },
  {
    id: 'add-guests', path: project('/guests'), target: 'guests-add',
    title: 'Add guests',
    body: 'Add guests one at a time here, or import a list from a file.',
    action: {
      until: 'guest-added',
      instruction: 'Your turn: type a guest’s name and press “Add guest”. Add one or two names.',
      done: 'Added. Each guest gets their own row.',
    },
  },
  {
    id: 'guest-list', path: project('/guests'), target: 'guest-list', centerIfMissing: true,
    title: 'Your guest list',
    body: 'Open a guest to add family, dietary needs, hotel, a photo and their seat. Use the search and filters above the list to find people quickly.',
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
    id: 'timetable', path: project('/timetable'),
    title: 'Timetable',
    body: 'Plan the day hour by hour, across several days if needed. Tag blocks with the vendor responsible.',
  },
  {
    id: 'rundown', path: project('/rundown'),
    title: 'Run-down list',
    body: 'A day-of list for the team and vendors, built from the timetable. Print it or save it as a PDF.',
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
