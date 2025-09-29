import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
])

const isAdminRoute = createRouteMatcher(['/admin(.*)'])

const E2E_BYPASS = process.env.E2E_AUTH_BYPASS === '1'

export default E2E_BYPASS
  ? function middleware() {
      return NextResponse.next()
    }
  : clerkMiddleware(async (auth, request) => {
  // Allow public routes
  if (isPublicRoute(request)) {
    // Server-side redirect for authenticated users from "/" to "/dashboard"
    const authResult = await auth()
    if (authResult.userId && request.nextUrl.pathname === "/") {
      const url = new URL("/dashboard", request.url)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }
  
  // Quick guard for admin routes to reduce UI flash
  if (isAdminRoute(request)) {
    const authResult = await auth()
    if (!authResult.userId) {
      const url = new URL('/sign-in', request.url)
      return NextResponse.redirect(url)
    }
    // Optional: only enforce ADMIN_USER_IDS here to avoid extra lookups
    const adminUserIds = process.env.ADMIN_USER_IDS?.split(',').filter(Boolean) || []
    if (adminUserIds.length > 0 && !adminUserIds.includes(authResult.userId)) {
      const url = new URL('/dashboard', request.url)
      return NextResponse.redirect(url)
    }
  }

  // For all other routes, the auth() call in the route handler will handle protection
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
