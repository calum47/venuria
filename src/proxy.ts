import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { resolveUserRoles, type AuthRole } from '@/lib/supabase/role'

// Route prefix → the role(s) allowed to access it.
const PROTECTED_PREFIXES: Record<string, AuthRole[]> = {
  '/admin': ['admin'],
  '/venue': ['venue'],
  '/rental': ['rental'],
  '/planner': ['planner'],
  '/client': ['client'],
  // Planners build the layout, clients view it + manage guests — both need in.
  '/editor': ['planner', 'client'],
}

export async function proxy(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  const matchedPrefix = Object.keys(PROTECTED_PREFIXES).find((prefix) =>
    path.startsWith(prefix),
  )
  if (!matchedPrefix) return supabaseResponse

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', path)
    return NextResponse.redirect(url)
  }

  const allowedRoles = PROTECTED_PREFIXES[matchedPrefix]
  // Someone can hold several roles (a planner who is also a Vendor): any one of them is enough.
  const roles = await resolveUserRoles(supabase, user.id)

  if (!roles.some((r) => allowedRoles.includes(r))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/venue/:path*', '/rental/:path*', '/planner/:path*', '/client/:path*', '/editor/:path*'],
}
