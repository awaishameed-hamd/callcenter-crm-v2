import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login']

const ROLE_PREFIXES: Record<string, string> = {
  ADMIN:    '/admin',
  DIRECTOR: '/director',
  MANAGER:  '/manager',
  AGENT:    '/agent',
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Token is in sessionStorage (client-side only) — middleware can't read it.
  // AuthContext handles role-based redirect; middleware only handles root redirect.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
