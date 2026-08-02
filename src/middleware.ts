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
  '/api/external(.*)', // Service-to-service API (authenticated via EXTERNAL_API_SECRET in route handler)
  '/api/mcp(.*)', // Remote MCP endpoint (authenticated via EXTERNAL_API_SECRET or OAuth token in route handler)
  '/envio(.*)', // Página de envio de foto do chat (auth = token cuid com validade na própria URL)
  '/api/chat-upload(.*)', // Recebe os bytes da página de envio (mesmo token)
  // Descoberta e registro OAuth do conector MCP: precisam responder sem sessão.
  // A tela de consentimento (/oauth/authorize) fica de fora de propósito — ela
  // exige login, e é lá que o acesso é concedido.
  '/.well-known(.*)',
  '/api/oauth/metadata(.*)',
  '/api/oauth/register',
  '/api/oauth/token',
  // Faz a própria checagem de sessão e responde 401 em JSON — redirecionar uma
  // chamada de API para o sign-in devolveria HTML para um fetch
  '/api/oauth/authorize/approve',
  '/google-drive-callback(.*)',
  // CMS dynamic pages (catch-all for non-protected routes)
  '/about(.*)',
  '/pricing(.*)',
  '/contact(.*)',
  '/blog(.*)',
  '/privacy-policy(.*)',
  '/terms-of-service(.*)',
  '/[slug]', // Single level dynamic pages
])

// Define admin routes (require authentication only - detailed checks in layout)
const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  const { pathname, search } = req.nextUrl
  // Volta para a URL inteira: a tela de consentimento do OAuth carrega
  // client_id/redirect_uri/PKCE na query, e perdê-los no login inutiliza o link
  const destinoAposLogin = `${pathname}${search}`

  // Allow public routes (logged users can also access public pages)
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Protect admin routes - require authentication (role check happens in admin layout)
  if (isAdminRoute(req)) {
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', destinoAposLogin)
      return NextResponse.redirect(signInUrl)
    }
    // Let the admin layout handle the actual admin permission check
    return NextResponse.next()
  }

  // For all other protected routes, require authentication
  if (!userId && !isPublicRoute(req)) {
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set('redirect_url', destinoAposLogin)
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
