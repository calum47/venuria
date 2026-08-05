import { redirect } from 'next/navigation'

// No more anonymous project creation — every account (Admin, Venue, Planner,
// Client) is provisioned by someone above them, so there's nothing to do at
// the root except send people to sign in.
export default function Home() {
  redirect('/login')
}
