# Local Clerk Webhooks

Use a public tunnel to deliver Clerk webhooks to your local Next.js dev server.

## Prerequisites
- Vercel CLI: `npm i -g vercel`
- Logged in and linked: `vercel login` → `vercel link`
- Running dev server: `npm run dev`

## Option A: Vercel Dev Tunnel (if available)
- Some Vercel CLI versions expose a tunnel flag. If your CLI supports it:
  - Run: `npm run dev:tunnel`
  - It starts a public HTTPS URL for your local dev server.
- If you get "unknown or unexpected option: --tunnel", use Option B or C below.

## Option B: Cloudflare Tunnel (recommended fallback)
1. Install: `brew install cloudflared`
2. Start your app: `npm run dev`
3. Start tunnel: `npm run tunnel:cf`
   - Copies a URL like `https://<hash>.cfargotunnel.com`

## Option C: ngrok (quickest fallback)
1. Start your app: `npm run dev`
2. Start tunnel: `npm run tunnel:ngrok`
   - Copies a URL like `https://<subdomain>.ngrok.io`

## Configure Clerk Webhook
1. In Clerk Dashboard → Webhooks → Add endpoint
   - URL: `https://<your-public-url>/api/webhooks/clerk`
2. Copy the “Signing secret” from that endpoint and set it locally:
   - Add to `.env.local`: `CLERK_WEBHOOK_SECRET=whsec_...`
3. Restart dev server if needed.

## Verify
- Use Clerk’s “Send test event” or perform actions (create/update user, subscription change).
- The route is implemented at `src/app/api/webhooks/clerk/route.ts` and verifies Svix headers.

## Tips
- Keep one endpoint per developer so each has their own signing secret.
- If you see `no svix headers`, ensure Clerk points to the tunnel URL, not `http://localhost:3000`.
- If signature verification fails, re-copy the exact secret for the endpoint you used.
- Do not commit `.env.local` or secrets. `.vercel` is already gitignored.
