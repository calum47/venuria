import type { PlannerRole } from '@/lib/supabase/plannerContext'

/** What the tour needs to know to build its route: the planner's team role and a project they can open. */
export type TourCtx = { role: PlannerRole; projectId: string | null }

export type TourStep = {
  id: string
  /** Route this step lives on, or null to skip the step (e.g. it needs a project and there is none). */
  path: (c: TourCtx) => string | null
  /** Value of a data-tour="…" attribute to spotlight. No target = a centred card. */
  target?: string
  /** With a target: show a centred card instead of skipping when the element isn't on the page. */
  centerIfMissing?: boolean
  title: string
  body: string
  /** Team roles that see this step. Default: all. */
  roles?: PlannerRole[]
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
    body: 'Move between your projects, stock, team and settings. “Last project” takes you back to what you were working on.',
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
    id: 'catalog', path: editor(), target: 'catalog',
    title: 'Catalogue',
    body: 'Drag tables, chairs and decorations onto the floor plan. Sizes and availability come from the venue and rental catalogues.',
  },
  {
    id: 'canvas', path: editor(), target: 'canvas',
    title: 'Floor plan',
    body: 'Drag to pan, scroll or pinch to zoom, Ctrl+drag to select several items. Click an item to see its properties.',
  },
  {
    id: 'rooms', path: editor(), target: 'rooms',
    title: 'Rooms',
    body: 'Switch between the venue’s rooms. Each has its own layout.',
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
    id: 'summary', path: editor('/summary'),
    title: 'Layout summary',
    body: 'Everything placed in the project, any stock shortfalls to rent, and the PDF export for clients and vendors.',
  },
  {
    id: 'guests', path: project('/guests'), target: 'guests-add',
    title: 'Guest list',
    body: 'Add guests one by one or import a list from a file. Open a guest for family, dietary needs, hotel and seat.',
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
