import type { AuthRole } from '@/lib/supabase/role'

/**
 * User-facing release notes, shown by WhatsNewModal on the first visit after
 * a new entry ships.
 *
 * Lives in the repo on purpose: an entry is added in the same commit as the
 * feature it describes, so the notes can never get ahead of (or behind) what
 * is actually deployed. If non-technical editing is ever needed, move this
 * array to a table — the modal only cares about the array.
 *
 * Rules:
 * - `id` must be unique and must never change once shipped — it's what the
 *   "seen" marker stores. Convention: YYYY-MM-DD-slug.
 * - Newest entry FIRST. The modal treats index 0 as the latest.
 * - `roles` restricts who sees an entry. Omit it for everyone. A Venue user
 *   doesn't need to hear about a Planner-only editor feature.
 * - Write for the person using the app, not for the changelog in Notion —
 *   no table names, migration numbers, or internals.
 */
export type ChangelogEntry = {
  id: string
  date: string // ISO date, display only
  title: string
  items: string[]
  roles?: Exclude<AuthRole, null>[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-09-18-stock-tracking',
    date: '2026-09-18',
    title: 'My Stock — your own inventory',
    roles: ['planner', 'admin'],
    items: [
      'New My Stock page — a place for your own retail inventory (welcome bags, favours, personalized items) completely separate from the floor-plan catalog.',
      'Catalogue tab: add products with an emoji or photo, cost/sell price, low-stock alert, and optional "On Demand" for made-to-order items with no stock count.',
      'Purchases and Sales tabs log stock in and out and keep your stock counts up to date automatically. A sale can optionally be tagged to one of your weddings.',
      'Orders tab is one place for everything you\'ve ordered in, with a simple pending/received status.',
      'Shared with your whole team — everyone sees and can edit the same inventory, no separate copies.',
    ],
  },
  {
    id: '2026-09-18-project-sharing',
    date: '2026-09-18',
    title: 'Team projects, assignment and privacy',
    roles: ['planner', 'admin'],
    items: [
      'Projects are now shared with your team. Your dashboard shows Mine (created by or assigned to you) and Team projects (everything public from your colleagues).',
      'Managers and Leads can assign a project to a teammate from the row\'s Edit panel. Assigned projects show up under Mine for that person.',
      'Any project can be made private by its creator (or a Manager/Lead). Private projects are only seen by the creator, the assignee, and Managers/Leads.',
      'Opening a project someone else has worked on shows what changed since you last opened it.',
    ],
  },
  {
    id: '2026-09-18-team-invites',
    date: '2026-09-18',
    title: 'Invite colleagues to your team',
    roles: ['planner', 'admin'],
    items: [
      'Team managers can now create invite links from My team. Send the link to a colleague; they set up their own login and land straight in your team.',
      'Choose whether they join as a Member (sees public projects and their own) or a Lead (sees and assigns every project).',
      'Links are one-time and expire after 7 days. Pending links can be revoked from My team.',
      'Managers can change a teammate\'s role or remove them. Removing someone moves them to their own team — nothing of theirs is deleted.',
    ],
  },
  {
    id: '2026-09-18-teams-nav',
    date: '2026-09-18',
    title: 'Navigation, Settings and Teams',
    roles: ['planner', 'admin'],
    items: [
      'A navigation bar now sits on every planner screen: Last project, My projects, My team, Settings. In the editor, click ☰ Venuria for the same links.',
      'You now belong to a team. Solo planners are a team of one, so nothing changes day to day — but this is the foundation for working with colleagues, which is coming next.',
      'New Settings page: update your name, change your password, and (as team manager) rename the team and set its currency.',
      'New My team page showing who is on your team and their role.',
      'The login page has a "Remember me" box. Untick it and you\'ll be signed out when the browser closes.',
    ],
  },
  {
    id: '2026-09-18-event-dates',
    date: '2026-09-18',
    title: 'Event dates and due-by',
    roles: ['planner', 'admin'],
    items: [
      'Every new project now has an event date. Your dashboard sorts projects soonest-first with a countdown, and past events drop to the bottom.',
      'Each project also gets a "due by" date — the day the layout should be locked with the venue and rental companies. It defaults to two weeks before the event and you can change it.',
      'Edit either date from the dashboard with "Edit dates".',
    ],
  },
  {
    id: '2026-09-18-zones',
    date: '2026-09-18',
    title: 'Zone colour-coding',
    roles: ['planner', 'admin'],
    items: [
      'New 🎨 Zones button in the editor: paint named areas onto a room — Dance Floor, Bar, Ceremony, Buffet, Photo Booth, Stage/DJ, Lounge, or your own.',
      'Draw a rectangle by dragging, or a freeform shape by clicking corners and double-clicking to finish. Drag a zone to move it, drag its handles to reshape it.',
      'Zones show under your tables all the time; turn Zones on only when you want to edit them.',
      'Auto-Arrange now keeps tables out of every zone — draw the dance floor first and it will fill the rest of the room around it.',
      'The project summary lists every zone per room with its size.',
    ],
  },
  {
    id: '2026-09-18-auto-arrange',
    date: '2026-09-18',
    title: 'Auto-Arrange and the Sweetheart Table',
    roles: ['planner', 'admin'],
    items: [
      'New ✨ Auto-Arrange button in the editor toolbar: pick how many of each table you want and Venuria lays them out inside the room for you — clear of walls, obstacles and anything you\'ve already placed, with walking space between tables.',
      'The seat total has to match your guest list exactly before it will run, so you can\'t accidentally plan for the wrong number.',
      'New Sweetheart Table in the catalog — a two-seat table for the couple, with both chairs together on one side.',
      'Turn on "Balance around Sweetheart Table" to mirror your tables either side of it. An odd table sits on the centre line.',
      'Everything Auto-Arrange places is a normal table: move it, rotate it, change its chairs or delete it as usual.',
    ],
  },
]

/** Newest entry visible to this role, or null if nothing applies. */
export function latestEntryForRole(role: AuthRole): ChangelogEntry | null {
  return entriesForRole(role)[0] ?? null
}

export function entriesForRole(role: AuthRole): ChangelogEntry[] {
  return CHANGELOG.filter((e) => !e.roles || (role !== null && e.roles.includes(role)))
}

/**
 * Entries this role hasn't seen. `lastSeenId` is the id stored on the user;
 * entries newer than it (earlier in the array) are unseen. With no marker at
 * all (first ever visit, or an account that predates this feature) only the
 * latest entry is returned — dumping the whole backlog on someone is noise.
 */
export function unseenEntries(role: AuthRole, lastSeenId: string | null | undefined): ChangelogEntry[] {
  const visible = entriesForRole(role)
  if (!lastSeenId) return visible.slice(0, 1)
  const idx = visible.findIndex((e) => e.id === lastSeenId)
  // Marker points at an entry that's no longer visible (removed, or role
  // changed): treat as caught up rather than re-showing everything.
  if (idx === -1) return CHANGELOG.some((e) => e.id === lastSeenId) ? [] : visible.slice(0, 1)
  return visible.slice(0, idx)
}
