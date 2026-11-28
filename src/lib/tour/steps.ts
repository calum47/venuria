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
    body: 'A short tour. Use this menu to move between Projects, Stock, Team and Settings; “Last project” returns you to the page you were last on. Esc stops the tour, and you can replay it from Settings.',
  },
  {
    id: 'new-project', path: fixed('/planner'), target: ['new-project', 'project-list'],
    title: 'Start a project',
    body: 'Pick the venue, the couple’s names and the event date. New projects are Public: your team can view them, but only people assigned to a project can edit it. You can also create Private projects, which only assigned people can view. Every project visible to you is listed below.',
  },
  {
    id: 'hub', path: project(), target: 'hub',
    title: 'Project hub',
    body: 'Everything for one event: the editor, summary, payments and documents, timetable, run-down list and guest list.',
    sampleBody: 'This is a practice project we created for you, “Alex & Sam (sample)”. You can delete it at any time from the bottom of this page. The hub holds everything for one event: the editor, summary, payments and documents, timetable, run-down list and guest list.',
  },
  {
    id: 'place-table', path: editor(), target: ['catalog', 'canvas'],
    title: 'Place a table',
    body: 'Click and drag anywhere on the map to move around it; scroll or pinch to zoom. Drag a table from the catalogue onto the floor plan, then choose how many chairs it gets.',
    action: {
      until: 'object-placed',
      instruction: 'Click and drag anywhere on the map to move around it; scroll or pinch to zoom. Try it out: drag a table from the Tables section onto the floor plan, then choose how many chairs it gets.',
      done: 'That’s how a layout is built. Tables can’t be placed outside the room’s border or over fixed objects. These restrictions are created and modified by the venue. You can change the chair count later. We’ll go over more details next.',
    },
  },
  {
    id: 'canvas', path: editor(), target: 'canvas',
    title: 'Move around the floor plan',
    body: 'Click a table to select it. A panel on the right shows its rotation and chairs. Drag a table to move it, or Ctrl + left-click and drag to select several objects. Sizes and availability come from the venue and rental catalogues.',
  },
  {
    id: 'rooms-capacity', path: editor(), target: ['rooms', 'capacity'],
    title: 'Rooms and capacity',
    body: 'Switch between the venue’s rooms and areas. Each area has its own guest limit, set by the venue, for Standing or Seated use. Choose how an area will be used to see how many people it holds.',
  },
  {
    id: 'auto-arrange', path: editor(), target: 'auto-arrange',
    title: 'Auto-Arrange',
    body: 'Fills the room with dining tables, avoiding the room’s border, fixed objects and anything already placed. Nothing existing is moved or deleted.',
  },
  {
    id: 'seating-zones', path: editor(), target: ['seating', 'zones'],
    title: 'Seating plan and zones',
    body: 'Turn on the seating plan to seat guests. Click a chair to assign someone, or drag them from the guest list on the right of your screen. Use Zones to mark areas such as a dance floor. Auto-Arrange keeps tables out of them.',
  },
  {
    id: 'export', path: editor(), target: ['summary-link', 'export-jpg'],
    title: 'Summary and export',
    body: 'Download the room as a JPG, or open the Summary for a list of everything placed, stock shortfalls and a PDF export of that list.',
  },
  {
    id: 'add-guests', path: project('/guests'), target: 'guests-add',
    title: 'Add guests',
    body: 'Add guests one at a time, or upload a file with a list of guests. Select a guest to link family members and add dietary needs, hotel details and more.',
    action: {
      until: 'guest-added',
      instruction: 'Try it out: type a guest’s name and press “Add guest”. You can also upload a file with a list of guests.',
      done: 'Added. Select a guest to link family members and add dietary needs, hotel details and more.',
    },
  },
  {
    id: 'rsvp', path: project('/guests'), target: 'rsvp-panel',
    title: 'RSVP link',
    body: 'Share one link with all your guests so they can answer themselves. Answers appear automatically in your list, and new names are flagged “To review”.',
  },
  {
    id: 'payments', path: project('/payments'),
    title: 'Payments & documents',
    body: 'Log each deposit, instalment and balance with its due date. Reminders start 7 days before a payment falls due. You can also add contracts and quotes, and use “Update” on each one to keep track of its versions.',
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
    body: 'Your timetable also appears here as a list for the team and vendors. It’s easier to read, and you can print it or save it as a PDF.',
    sampleBody: 'The same example day appears here as a list for the team and vendors. It’s easier to read, and you can print it or save it as a PDF.',
  },
  {
    id: 'stock', path: fixed('/planner/stock'),
    title: 'Stock',
    body: 'Your catalogue, purchases and sales, with average cost and margins. Managers and leads can edit it. Members can view it and add sales. You can also add one-time orders to keep track of them.',
  },
  {
    id: 'team', path: fixed('/planner/team'), roles: ['manager', 'lead'],
    title: 'Team',
    body: 'Invite colleagues with a one-time link so they can create their own account. Members see public projects and the ones assigned to them. Leads see and can assign every project.',
  },
  {
    id: 'settings', path: fixed('/planner/settings'), target: 'replay-tour', centerIfMissing: true,
    title: 'That’s the tour',
    body: 'Your name, password and company details live here too. You can also change the style of your PDFs from here before you download them. Replay this tour any time with this button.',
  },
]

/** Fired by the Settings button; TourGuide (mounted in the root layout) listens for it. */
export const START_TOUR_EVENT = 'venuria:start-tour'
