# Credits: Server Source of Truth

This project treats the user’s credit balance as the source of truth on the server.

## Reading Balance
- Endpoint: `GET /api/credits/me` returns `{ creditsRemaining }` from the database.
- The `useCredits()` hook uses React Query to fetch and keep it fresh:
  - Refetches when the window regains focus
  - Background refresh every 30s
  - Exposes `refresh()` to force refetch after mutations

## Spending Credits
- API handlers call:
  - `validateCreditsForFeature(clerkUserId, feature)`
  - `deductCreditsForFeature({ clerkUserId, feature, details })`
- Cost config: `src/lib/credits/feature-config.ts` (`FEATURE_CREDIT_COSTS`)
- Mapping `Feature → OperationType` for usage history: `toPrismaOperationType()`

## Admin Overrides (Feature Costs and Plan Credits)
- Feature costs live in `AdminSettings.featureCosts`.
- Plans live in the `Plan` table with shape `{ clerkId, name, credits, active }`.
- Admin UI at `/admin/settings` lets you:
  - Set per-feature credit costs (e.g., `ai_text_chat`, `ai_image_generation`).
  - Manage Clerk Plan IDs (`cplan_*`) → Name + Monthly Credits (persisted as rows in `Plan`).
- Effective values:
  - Server utilities: `getFeatureCost`, `getPlanCredits` in `src/lib/credits/settings.ts`.
  - Public read-only endpoint: `GET /api/credits/settings` returns `{ featureCosts, planCredits }` with keys as Clerk `cplan_*` IDs.
  - Admin endpoints: `GET/POST /api/admin/plans`, `PUT/DELETE /api/admin/plans/[clerkId]` for plan CRUD.

Notes
- `getPlanCredits(planId)` accepts a Clerk plan ID (`cplan_*`). Webhooks and subscription handlers pass Clerk plan IDs when available.

UI consumption
- `useCredits()` now fetches `GET /api/credits/settings` and exposes `getCost(operation)` and `canPerformOperation(operation)` using the dynamic values.
- AI Chat displays the current dynamic cost for text/image, and disables actions if balance < cost.

## Refund Policy (AI Chat and Image)
- If a provider error occurs after credits are deducted, the system reimburses the user automatically:
  - Text (`POST /api/ai/chat`): refunds on provider errors before the response is returned.
  - Image (`POST /api/ai/image`): refunds on non-OK status, invalid responses, parse errors, or empty result.
- Refunds are tracked in `UsageHistory` as negative `creditsUsed` with `{ refund: true, reason }` in `details` for auditing.

## UI (AI Chat)
- Text: after sending, the UI calls `refresh()` (backend deducts before the stream starts)
- Image: after a successful `200 OK`, call `refresh()` immediately
- Entry point: `src/app/(protected)/ai-chat/page.tsx`

## Health Check
- `GET /api/admin/health/credits-enum` (admin only)
  - Confirms `toPrismaOperationType('ai_text_chat') === OperationType.AI_TEXT_CHAT` (and image likewise)

## Prisma Client & Enums
- Client is generated at `prisma/generated/client`
- Code imports `PrismaClient` from that path (not `@prisma/client`) to avoid enum mismatches at runtime
- Shortcut: `src/lib/prisma-types.ts` re-exports `OperationType`

## Admin & Webhooks
- Admin manual adjustments create `UsageHistory`
- Clerk webhooks (subscriptions/payments) update balances
- If webhooks fail, use `POST /api/admin/users/sync` to reconcile. The sync now supports scoped modes (users only, plans only) and optional credit overrides.
