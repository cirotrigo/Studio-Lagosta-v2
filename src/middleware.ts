import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define public routes (accessible without authentication)
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
  '/api/webhooks(.*)',
  '/api/cron(.*)', // Allow Vercel Cron jobs (authenticated via Bearer token in route handler)
  '/google-drive-callback(.*)',
  // CMS dynamic pages (catch-all for non-protected routes)
  '/about(.*)',
  '/pricing(.*)',
  '/contact(.*)',
  '/blog(.*)',
  '/privacy-policy(.*)',
  '/[slug]', // Single level dynamic pages
])

// Define admin routes (require authentication only - detailed checks in layout)
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  const { pathname } = req.nextUrl

  // Allow public routes (logged users can also access public pages)
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Protect admin routes - require authentication (role check happens in admin layout)
  if (isAdminRoute(req)) {
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', pathname)
      return NextResponse.redirect(signInUrl)
    }
    // Let the admin layout handle the actual admin permission check
    return NextResponse.next()
  }

  // For all other protected routes, require authentication
  if (!userId && !isPublicRoute(req)) {
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
