# Admin Panel

Administrative routes and features of the app.

## Access
- URL: `/admin` (SSR guard in layout + middleware check)
- Configure `.env.local`:
  - `ADMIN_EMAILS=admin@yourdomain.com,ops@yourdomain.com`
  - or `ADMIN_USER_IDS=usr_123,usr_456` (Clerk user IDs)

## Clerk Prerequisites
- `CLERK_SECRET_KEY` set (admin API)
- Invitations and email delivery enabled in Clerk
- Allowed redirect: `${NEXT_PUBLIC_APP_URL}/sign-up`

## Features
- Users
  - List users with balance and usage
  - Adjust credits (balance)
  - Delete user (removes usage and balance)
- Settings (tabbed)
  - Custos por Funcionalidade
    - Edit feature credit costs (e.g., `ai_text_chat`, `ai_image_generation`)
  - Planos de Assinatura (Clerk)
    - Map Clerk plan IDs to: Plan Name (free-form) and Monthly Credits
    - Import helpers: Auto (usePlans), via API (`GET /api/admin/clerk/plans`), or paste JSON
    - Values are persisted and used by webhooks to refresh balances on renewals/changes
- Storage
  - Browse uploads with user attribution
  - Search by name/type/url/user
  - Open file in new tab
  - Delete file (best-effort remote delete + soft-delete record)
- Invitations
  - Invite user by email
  - View pending invitations
  - Resend / Revoke invitation
- Sync
  - Sync Clerk users and plans into the local DB
  - Admin UI provides options and a second confirmation:
    - Sincronizar usuários: create/update users and ensure a 0-credits balance exists
    - Sincronizar planos/assinaturas: query Clerk Billing for each user’s subscription
    - Aplicar créditos do plano: set credits based on the mapped plan in `Plan`
    - Sobrescrever créditos: apply a custom credits amount to all users with an active plan

## Admin APIs
- `POST /api/admin/users/invite`
  - Body: `{ email: string, name?: string }`
  - Invites via Clerk; if the user already exists, ensures user/balance exists in DB.
- `GET /api/admin/users/invitations`
  - Lists pending (not accepted, not revoked) invitations
- `POST /api/admin/users/invitations/:id/resend`
- `POST /api/admin/users/invitations/:id/revoke`
- `POST /api/admin/users/sync`
  - Body (partial):
    - `syncUsers?: boolean` (default true)
    - `syncPlans?: boolean` (default true)
    - `setCredits?: boolean` (default true)
    - `overrideCredits?: number` (optional; overrides mapped plan credits)
    - `pageSize?: number` (default 100), `maxPages?: number` (default 50)
    - `debug?: boolean` (adds processing info to the response)
  - Behavior:
    - Users: creates/updates `User` and ensures a `CreditBalance` row with 0 credits exists
    - Plans: calls Clerk `GET /v1/users/{user_id}/billing/subscription` and resolves plan by `plan_id`
    - Credits: when `setCredits` is true and plan is mapped in `Plan`, updates credits; uses `overrideCredits` if provided
  - Response fields: `processed`, `createdUsers`, `createdBalances`, `activeSubscriptions`, `creditsRefreshed`, and when `debug` is true: `{ debug: { pagesProcessed, unmappedPlanIds } }`
- `PUT /api/admin/credits/:id`
  - Adjust by `CreditBalance` record
- `PUT /api/admin/users/:id/credits`
  - Adjust by `User.id`
- `GET /api/admin/health/credits-enum`
  - Verifies `Feature → OperationType` mapping
- `GET /api/admin/storage` — list uploads
- `DELETE /api/admin/storage/:id` — delete one upload
- `GET /api/admin/settings` (admin only)
  - Returns `{ featureCosts, planCredits, billingPlans }` (billingPlans composed from `Plan` rows)
- `PUT /api/admin/settings` (admin only)
  - Body (partial): `{ featureCosts?: { [featureKey]: number } }` (plans managed via dedicated endpoints)
- `GET /api/admin/plans` — list plans `{ clerkId, name, credits, active }`
- `POST /api/admin/plans` — create plan by Clerk ID
- `PUT /api/admin/plans/[clerkId]` — update plan name/credits/active (or `newClerkId` to rename)
- `DELETE /api/admin/plans/[clerkId]` — remove plan
- `GET /api/admin/clerk/plans` (admin only)
  - Attempts to load plans from Clerk Backend API (requires `CLERK_SECRET_KEY`)

## UI
- Pages: `src/app/admin/*`
- Toasts for invites, adjustments, and sync
- SSR guard in `src/app/admin/layout.tsx` (prevents flash for non-admins)
 - Settings page in `src/app/admin/settings/page.tsx`
 - Users → Sync modal includes a double confirmation summarizing the effects of chosen options

## Notes
- Invitations require email to be configured in Clerk.
- If Prisma enum mapping fails, use the health check above and verify the code imports the generated client from `prisma/generated/client`.
