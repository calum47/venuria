import type { AuthRole } from '@/lib/supabase/role'
import type { Locale } from '@/i18n/config'
import { CHANGELOG_ES } from '@/lib/changelogEs'

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
    id: '2026-11-28-editor-back-and-settings',
    date: '2026-11-28',
    title: 'Back to the project hub from the 2D editor',
    roles: ['planner'],
    items: [
      'The 2D editor toolbar has a "← Project" link that takes you straight back to the project hub.',
      'If your login also manages a vendor company, its contact details (contact person, phone, email, Instagram accounts) are in your Settings page.',
    ],
  },
  {
    id: '2026-11-28-item-sources',
    date: '2026-11-28',
    title: 'Choose where each item is rented from',
    roles: ['planner'],
    items: [
      'In the project summary you now pick how many of each item (chairs, tables, plates…) to rent from each vendor. Whatever you don\'t rent comes from the venue.',
      'Each vendor shows how many are still free on your event date, after what it has already promised to other events on that same date.',
    ],
  },
  {
    id: '2026-11-28-map-fit-and-instagrams',
    date: '2026-11-28',
    title: 'The 2D map opens fitted to the screen; several Instagram accounts',
    roles: ['planner', 'rental'],
    items: [
      'The 2D map now opens zoomed out so the whole room is centred on screen. The zoom percentage button fits it again.',
      'Vendors can list several Instagram accounts in Settings and mark one as the main company account.',
    ],
  },
  {
    id: '2026-11-28-vendor-contacts-planner',
    date: '2026-11-28',
    title: 'Vendors you add appear in your timetable with their contact details',
    roles: ['planner'],
    items: [
      'A vendor you add to a project now appears in your vendor list, ready to tag on timetable blocks. Their contact details are filled in from what the vendor entered in their own Settings, and update automatically when they change them.',
      'Vendors who don\'t have a Venuria account are still added the same way as before, with "+ New vendor".',
    ],
  },
  {
    id: '2026-11-28-vendor-contacts-vendor',
    date: '2026-11-28',
    title: 'Settings: your contact details',
    roles: ['rental'],
    items: [
      'The new Settings page holds your contact person, phone, email and Instagram. Planners who add you to a project see them automatically in their timetable and run-down, and they stay up to date when you change them.',
    ],
  },
  {
    id: '2026-11-28-vendors-on-projects-planner',
    date: '2026-11-28',
    title: 'Add vendors to a project',
    roles: ['planner'],
    items: [
      'On a project page, "Vendors on this project" lets you add the vendors who are helping on that event. An added vendor can look at the materials, the 2D map, the timetable and the run-down, read-only. They never see guests, payments or documents.',
      'Remove a vendor at any time and their access ends straight away.',
      'If you are also a vendor yourself, a "Vendor projects" link in this menu shows the projects you have been added to.',
    ],
  },
  {
    id: '2026-11-28-vendors-on-projects-vendor',
    date: '2026-11-28',
    title: 'See the projects you are working on',
    roles: ['rental'],
    items: [
      'When a planner adds you to a project, it appears under "Projects you’re on" (a "Vendor projects" link in the planner menu, or on your Vendor page). You can look at its materials, the 2D map, the timetable and the run-down, read-only.',
    ],
  },
  {
    id: '2026-11-28-3d-hidden-shorter-tour',
    date: '2026-11-28',
    title: '3D view hidden for now; shorter tour',
    roles: ['planner'],
    items: [
      '"View in 3D" has been removed from the editor while the feature is finished. It will come back later.',
      'The guided tour is shorter (18 steps instead of 29), and the practice project now includes an example timetable and run-down so you can see how they look.',
    ],
  },
  {
    id: '2026-11-28-last-page-and-practice-project',
    date: '2026-11-28',
    title: '"Last project" remembers the page; tour gets a practice project',
    roles: ['planner'],
    items: [
      '"Last project" in the menu now takes you back to the page you were last on in that project (editor, guests, payments, timetable, run-down or summary), not just the project overview.',
      'The guided tour (Settings → Tutorial) now includes the editor. A planner with no projects gets a practice project, "Alex & Sam (sample)", to place a table and add guests in. Planners who already have projects only get explanations: the tour never changes real work.',
    ],
  },
  {
    id: '2026-11-28-guided-tour',
    date: '2026-11-28',
    title: 'Guided tour for planners',
    roles: ['planner'],
    items: [
      'A step-by-step tour now walks through the main pages: projects, the editor, guests and RSVP, payments, timetable, stock, team and settings. Start it any time from Settings → Tutorial.',
    ],
  },
  {
    id: '2026-11-28-stronger-passwords',
    date: '2026-11-28',
    title: 'Stronger passwords',
    items: [
      'New and changed passwords need at least 8 characters, with one upper-case letter, one number and one special character (for example ! @ # $ % &). Your current password keeps working.',
      'Forgot your password? Ask your Venuria admin for a temporary one, then change it in Settings.',
    ],
  },
  {
    id: '2026-11-28-new-projects-public',
    date: '2026-11-28',
    title: 'New projects are visible to your team',
    roles: ['planner'],
    items: [
      'New projects now start as Public: everyone on your team can open them to look, while only the creator, the people assigned, and leads and managers can edit. Use "Public — make private" on a project to restrict it.',
    ],
  },
  {
    id: '2026-11-27-auto-arrange-dining-only',
    date: '2026-11-27',
    title: 'Auto-Arrange only offers dining tables',
    roles: ['planner'],
    items: [
      'Cocktail tables and tall tables no longer appear in Auto-Arrange — it lays out the dinner seating, so only dining tables can be picked.',
    ],
  },
  {
    id: '2026-11-27-auto-arrange-even-spread',
    date: '2026-11-27',
    title: 'Auto-Arrange spreads tables evenly',
    roles: ['planner'],
    items: [
      'Tables are now spread evenly across the free floor instead of being bunched around the middle of the room.',
      'With "Balance around Sweetheart Table" on, the tables are placed in mirrored pairs on either side of the line through the Sweetheart Table, an odd one out sitting on the line itself.',
    ],
  },
  {
    id: '2026-11-27-auto-arrange-flexible',
    date: '2026-11-27',
    title: 'Auto-Arrange no longer needs the seats to match your guest list',
    roles: ['planner'],
    items: [
      'Pick any mix of tables and press Arrange — fewer or more seats than guests is fine. The seat count still shows how you compare, as a hint only.',
      'Every table is placed with its maximum chairs, so you can then remove the ones you do not need.',
      'Click a chair or table and press Delete (Backspace on a Mac) to remove it. Removing a chair leaves the rest of the table as it was.',
      'Clicking an empty part of the floor plan now deselects again.',
    ],
  },
  {
    id: '2026-11-27-rotation-and-seating',
    date: '2026-11-27',
    title: 'Editor: rotation and seating in one place',
    roles: ['planner'],
    items: [
      'The Placement box is now "Rotation and seating". Rotate a table or item to any of 8 angles, including the diagonals (45°, 135°, 225°, 315°).',
      'Chair sides, adding chairs and mirror drag now sit in the same box, right under the rotation buttons.',
      'The X / Y position boxes are gone — drag items on the plan to place them.',
    ],
  },
  {
    id: '2026-11-27-editor-pan-select',
    date: '2026-11-27',
    title: 'Editor: easier to move around on a trackpad',
    roles: ['planner'],
    items: [
      'Drag on an empty part of the floor plan to move around it — no right-click needed.',
      'To select several tables or chairs, hold Ctrl (or ⌘ / Shift) and drag a box around them.',
      'Pinch or scroll to zoom.',
    ],
  },
  {
    id: '2026-11-27-stock-tiles',
    date: '2026-11-27',
    title: 'My stock: clearer numbers',
    roles: ['planner', 'rental'],
    items: [
      'The top of My stock now shows what your stock cost you (at average cost), the profit on everything sold so far, products running low, and how many reusable items are out with clients.',
      'Every product shows its own average cost, selling price, margin and how many you have sold.',
    ],
  },
  {
    id: '2026-11-27-vendor-account',
    date: '2026-11-27',
    title: 'Planner and Vendor on one login',
    roles: ['planner', 'rental'],
    items: [
      'If you are a planner and also run a vendor business (rentable tables and chairs, products you sell), your account can now do both. Use the Planner ⇄ Vendor switch at the top to move between them, with the same email and password.',
      'On the Vendor side you manage what you can rent out and see your stock of products, which is the same stock as My stock on the planner side: a sale logged on one shows on the other.',
      'Other planners can find your rentable tables and chairs when they plan. Your products and prices stay private to your team.',
    ],
  },
  {
    id: '2026-11-27-projects-assignees-payments',
    date: '2026-11-27',
    title: 'Assign several people, and see every payment',
    roles: ['planner', 'admin'],
    items: [
      'A project can now be assigned to as many teammates as you like. Leads and Managers set this under Edit on My projects, and can filter the whole list by teammate.',
      'My projects now shows every payment, paid and pending, as a calendar (the default) or a list. It covers the projects you created or are assigned to; Leads and Managers see the whole team.',
      'New projects start as Private. A Public project can be opened by any teammate, but if you are not assigned to it you can look at it without changing anything, and Payments & documents stay hidden.',
    ],
  },
  {
    id: '2026-11-27-export-look-and-logo',
    date: '2026-11-27',
    title: 'Your own look and logo on exports',
    roles: ['planner', 'admin'],
    items: [
      'Managers can now style the team’s exported PDFs in Settings: font (seven to choose from), title and text size, accent colour, spacing and the footer text, with a live preview built from one of your real projects.',
      'Upload your logo once and it is printed on every page of the PDF, at the bottom left or centre and in the size you choose. The floor plan JPG gets it too. Venuria’s own mark is always printed at the bottom right.',
      'Everyone on the team’s exports use the saved look automatically.',
    ],
  },
  {
    id: '2026-11-26-plan-export-jpg',
    date: '2026-11-26',
    title: 'Floor plan export is now a JPG',
    roles: ['planner', 'admin'],
    items: [
      'The editor’s “Export” button now downloads the room as a JPG with a white background, instead of a PNG. JPGs are smaller and open anywhere.',
    ],
  },
  {
    id: '2026-11-26-stock-avg-cost-member-privacy',
    date: '2026-11-26',
    title: 'My Stock: average cost, and prices hidden from Members',
    roles: ['planner', 'admin'],
    items: [
      'A product’s cost is now an average (“Avg cost”): every purchase blends its price into the cost, weighted by quantity. Buying 10 at €1.10 and then 30 at €0.80 gives €0.875.',
      'New products ask for the selling price when you create them; you can still change it later.',
      'Members no longer see costs, selling prices, margins or profit anywhere in My Stock, and the Purchases tab is for managers and leads only. A Member’s sale is priced automatically.',
    ],
  },
  {
    id: '2026-11-26-guest-multi-select',
    date: '2026-11-26',
    title: 'Select and delete several guests at once',
    roles: ['planner', 'admin'],
    items: [
      'On the guest list details page, tick guests with the new checkboxes, or use the box at the top of the table to tick everyone shown.',
      'A bar appears with “Delete selected…”. It asks you to confirm first, and asks you to type DELETE if you are removing every guest in the project.',
    ],
  },
  {
    id: '2026-11-21-table-settings-summary',
    date: '2026-11-21',
    title: 'Plates, glasses and candles in the summary',
    roles: ['planner', 'admin'],
    items: [
      'The project summary now counts what your table settings need — plates, cutlery, glasses, candles, flowers — alongside tables and chairs, and shows what is short against the venue and rental companies’ stock.',
      'Items that come from table settings are marked “on tables”.',
    ],
  },
  {
    id: '2026-11-21-table-settings-on-plan',
    date: '2026-11-21',
    title: 'Table settings now show on the floor plan',
    roles: ['planner', 'admin'],
    items: [
      'Plates, cutlery and glasses are drawn at each chair, and candles, vases and runners down the middle of the table. Zoom in to see the detail.',
      'The properties panel is tidier: sections you can fold away, +/− buttons for quantities and items grouped by type.',
    ],
  },
  {
    id: '2026-11-21-table-settings',
    date: '2026-11-21',
    title: 'Table settings: plates, glasses, candles and flowers',
    roles: ['planner', 'admin'],
    items: [
      'Select a table and use the new Table setting section to choose what goes on it: plates, cutlery, glasses, candles, flowers.',
      'Save your usual combinations as templates, shared with your whole team, and apply one to a single table or to every table in the room. Sweetheart, cocktail and tall tables are set one by one.',
      'After applying, you can change any table on its own without affecting the others. Items for each seat are counted by the chairs at that table.',
    ],
  },
  {
    id: '2026-11-21-rsvp-data-controller',
    date: '2026-11-21',
    title: 'Your company name and contact on the RSVP page',
    roles: ['planner', 'admin'],
    items: [
      'In Settings → Team the manager can now add the company name and a contact email. Guests see them next to the consent box on the RSVP page, as the party responsible for their data and the address for requests to see or delete it.',
      'Without a company name, the team name is shown. The RSVP settings remind you while no contact email is set.',
    ],
  },
  {
    id: '2026-11-21-project-names-and-delete',
    date: '2026-11-21',
    title: 'Couple names, deleting projects, and RSVP settings',
    roles: ['planner', 'admin'],
    items: [
      'Projects are now titled by the couple\'s names. Add or change them from the project list or the project page; projects without names still show the venue.',
      'You can delete a project from its page (at the bottom). It is permanent, and only the planner who created it, or a manager or lead, can do it.',
      'In the RSVP settings you can choose the language the page opens in, and move the sections (details, answer form, area, hotels) up or down.',
      'In the planner, the top bar of the editor now starts with the Venuria menu, and "Guest mode" is called "Seating plan".',
    ],
  },
  {
    id: '2026-11-21-rsvp-wedding-look',
    date: '2026-11-21',
    title: 'A more wedding-like RSVP page',
    roles: ['planner', 'admin'],
    items: [
      'The guest RSVP page is now photo-led: your cover photo fills the top with the names over it, followed by a welcome note, the schedule, your questions, the area and hotels.',
      'The names at the top come from the project\'s couple\'s names. Without them, the venue name is shown instead.',
      'The welcome note now sits under the names, so you no longer need to type the names into it.',
    ],
  },
  {
    id: '2026-11-21-fresh-look',
    date: '2026-11-21',
    title: 'A fresh, softer look',
    items: [
      'Venuria has a new look: warm ivory backgrounds, soft rounded corners, a dusty mauve accent and an elegant serif for page titles.',
      'The top bar now has the Venuria logo and works on phones: the links move to their own row that you can swipe.',
      'Buttons, selected tabs and highlights all use the new accent colour. Nothing has moved or been renamed.',
    ],
  },
  {
    id: '2026-11-21-notification-bell',
    date: '2026-11-21',
    title: 'Notification bell',
    roles: ['planner', 'admin'],
    items: [
      'A bell in the top bar now shows what needs your attention. No emails are sent.',
      'RSVPs: guests who answered through the link and were not on your list (or who came as a plus-one) are listed per wedding until you mark them as reviewed.',
      'Payments: from 7 days before the due date, every unpaid payment appears in the bell, and it keeps appearing every day, also after the due date, until you mark it as paid. The red number comes back once a day, and clears when you open the bell.',
    ],
  },
  {
    id: '2026-11-21-rsvp-page-content',
    date: '2026-11-21',
    title: 'Make the RSVP page your own',
    roles: ['planner', 'admin'],
    items: [
      'The guest RSVP page can now have a cover photo, a schedule, a dress code and a map link.',
      'Add a "Getting there & the area" section with your own text and up to 6 photos with captions, and list up to 8 recommended hotels with address, website, a booking note, a short description and a photo.',
      'Every section can be switched off without losing what you typed, and sections with nothing in them are not shown. Use "Preview the page" to see exactly what guests see, even before you switch the link on.',
    ],
  },
  {
    id: '2026-11-20-rsvp-link',
    date: '2026-11-20',
    title: 'Guest RSVP link',
    roles: ['planner', 'admin'],
    items: [
      'Each project now has one RSVP link you can send to all your guests. Open the guest list and look for "Guest RSVP link" at the top to switch it on, set a last day to answer, add a welcome text and copy the link.',
      'Guests type their name, we match it with your list, and they answer in Spanish, English or French: coming, not coming or maybe, plus dietary needs and an optional plus-one. Nobody needs an account.',
      'The guest list shows each answer, and you can filter by Attending, Declined, Maybe or Pending. Guests who are not on your list, and plus-ones, are added and marked "To review".',
      'The link only takes a guest\'s first answer. To change an answer, edit it in the guest\'s details. Guests who decline no longer count as needing a seat or towards room capacity.',
    ],
  },
  {
    id: '2026-11-20-capacity-vendors-reusable',
    date: '2026-11-20',
    title: 'Room capacity, payments with vendors, and reusable stock',
    roles: ['planner', 'admin'],
    items: [
      'Rooms now have their own capacity. The first time you open a room in a project you choose whether it is Seated or Standing there, and the toolbar shows how many seats (or guests) you are using against the venue\'s limit. Going over only shows a warning: you can continue after writing a note, and the note appears in the project\'s "what changed" summary.',
      'The project page shows each area\'s capacity next to what you have placed in it.',
      'Payments can now use your team\'s vendor list. Start typing a vendor name and pick it from the list; names that match a vendor are linked automatically, and anything else stays as typed text with a "not in vendor list" note.',
      'My Stock: mark a product as Reusable if it comes back after each wedding. A sale takes the items out; later, a manager or lead confirms how many came back, so losses are recorded and you can see what is out with clients.',
    ],
  },
  {
    id: '2026-11-20-venue-capacity',
    date: '2026-11-20',
    title: 'Set the capacity of each room',
    roles: ['venue'],
    items: [
      'In your room settings you can now enter how many people each room holds when set up seated and when standing. Planners see the matching limit in their projects and get a warning if they go over it.',
    ],
  },
  {
    id: '2026-11-16-timetable-rundown',
    date: '2026-11-16',
    title: 'Timetable and run-down list',
    roles: ['planner', 'admin'],
    items: [
      'New Timetable on the project page: an hourly calendar for each event day. Add a day for the wedding, the welcome party, the brunch, and switch between them with the tabs.',
      'Click an empty slot to add a block, drag a block up or down to shift it, drag its bottom edge to change its length, or click it to type exact times. Blocks can run past midnight, and overlapping blocks sit side by side.',
      'Tag each block with a vendor from your team\'s vendor list. Each vendor has a colour, contact details and Instagram handle, shared by everyone on your team.',
      'New Run-down list: the same schedule as a list for the day itself, with the vendor\'s contact details, the person in charge, notes and a materials list. Times come straight from the timetable, so you never type them twice.',
      'Choose per entry whether the vendor, their contact and their Instagram show, pick one vendor or several to list, and print it or save it as a PDF.',
      'Timetable changes show up in the \"what changed\" summary for your teammates.',
    ],
  },
  {
    id: '2026-11-16-stock-roles-seats-png',
    date: '2026-11-16',
    title: 'Stock permissions, seat reminders and PNG export',
    roles: ['planner', 'admin'],
    items: [
      'My Stock now follows team roles: managers and leads can do everything; members can see the stock, add orders and record items used on a wedding.',
      'Guests without a seat are now flagged "Needs a seat" on the guest list and on the project page. Babies are never flagged. If someone will not sit, dismiss the flag and say why; you can bring it back any time.',
      'In the editor\'s guest list, hover a guest and click "Edit details" to open their full details in a new tab.',
      'New Export PNG button in the editor toolbar downloads the current room as an image, just as drawn: tables, chairs, zones and labels, without the grid or selection handles.',
    ],
  },
  {
    id: '2026-11-16-guest-list-details',
    date: '2026-11-16',
    title: 'Guest list details',
    roles: ['planner', 'admin'],
    items: [
      'New Guest list details page on the project page: every guest in one table with their photo, family, dietary needs, seat and hotel. Search it, or filter to VIPs, speeches, dietary needs or guests without a seat.',
      'Click a guest to edit them: add a photo (resized on your device and kept private to your team), mark them as a VIP or as giving a speech, and write down allergies and dietary needs.',
      'Link families together: put parents and their children or babies in one family, then sort "families together" to see them side by side.',
      'Record where each guest sleeps night by night, with a range for several nights at once.',
      'Seats are shown here but still placed in the editor. Changes to guests appear in the "what changed" summary (hotel stays are not logged yet).',
    ],
  },
  {
    id: '2026-11-16-project-page-payments',
    date: '2026-11-16',
    title: 'Project page and payment tracker',
    roles: ['planner', 'admin'],
    items: [
      'Clicking a project in My projects now opens a project page first, with a card for each part of the project: the editor, the layout summary and payments.',
      'New Payments & documents page: add each payment with its vendor, amount and due date, mark it paid with the date it was paid, and see what is due, overdue or paid at a glance.',
      'Attach a PDF receipt to any payment, and keep draft contracts or other PDFs (up to 10 MB each) with the project. Files are private to your team.',
      'Switch the payments between a list and a month calendar: each payment sits on its due date, coloured by paid, overdue or due soon, and clicking a day shows that day\'s payments to edit.',
      'The "Last project" button in the top bar now opens the project page too.',
      'Payment changes show up in the "what changed" summary for your teammates (labels only, never amounts).',
    ],
  },
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

/** The entry's title and items in the user's language (English until a translation exists). */
export function localizedEntry(entry: ChangelogEntry, locale: Locale): { title: string; items: string[] } {
  if (locale === 'es') {
    const es = CHANGELOG_ES[entry.id]
    if (es) return es
  }
  return { title: entry.title, items: entry.items }
}

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

/**
 * Pages where the "What's new" pop-up may open: only the signed-in app areas.
 * It must never appear on the login page, the invite page, the home redirect or
 * the guest RSVP pages — even when an old session is still stored in the browser
 * — so it is an allow-list, not a deny-list. Skipping does not mark anything as
 * seen, so the notes still show on the next signed-in page.
 */
const WHATS_NEW_PREFIXES = ['/planner', '/venue', '/rental', '/admin', '/client', '/editor']

export function whatsNewAllowedOn(pathname: string | null): boolean {
  if (!pathname) return false
  return WHATS_NEW_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))
}
