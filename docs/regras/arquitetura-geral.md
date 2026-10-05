# Arquitetura geral (do AGENTS.md antigo)

> Texto do `AGENTS.md` que existia até 05/10/2026 (gerado pelo Warp em ago/2026), mantido sem
> alteração a partir da arquitetura. Conferido em 05/10/2026 — três pontos envelheceram:
> - **Testes unitários existem**: `vitest.config.ts` roda `src/**/__tests__/**/*.test.ts` e
>   `src/**/*.test.ts` (~257 arquivos). Rodar com `npx vitest run <caminho>`.
> - **A publicação sai pelo Zernio** (ex-Later), não por Zapier — ver `docs/regras/publicacao-e-agenda.md`.
> - **A lista de `FEATURE_CREDIT_COSTS` abaixo está incompleta** (faltam `ai_creative_improvement`,
>   `ai_art_generation` e outras). A fonte é `src/lib/credits/feature-config.ts`; ver também
>   `docs/regras/creditos-e-custo.md`.

## Architecture Overview

### Tech stack
- **Next.js 15** App Router, **React 19**, **TypeScript**
- **Auth:** Clerk (`@clerk/nextjs`)
- **DB:** PostgreSQL + Prisma ORM; client generated at `prisma/generated/client` (never import from `@prisma/client`)
- **Client state:** TanStack Query v5 for server state; Zustand for complex local state
- **UI:** Radix UI primitives + Tailwind CSS v4 + `sonner` for toasts
- **Forms:** React Hook Form + Zod
- **AI:** Vercel AI SDK v5 (`ai` package) with OpenAI, Anthropic, Google, Mistral, OpenRouter
- **Canvas editor:** Konva.js + react-konva
- **File storage:** Vercel Blob

### Route groups
```
src/app/
  (public)/          # Landing, sign-in, sign-up, CMS slug pages
  (protected)/        # Authenticated app (studio, billing, admin, editor, etc.)
  api/                # API routes
```

`src/middleware.ts` uses Clerk to protect all non-public routes. Admin routes (`/admin/*`) redirect unauthenticated users to sign-in; the admin *role* check happens inside the admin layout (not in middleware). Cron routes (`/api/cron/*`) skip Clerk but validate a Bearer token inside the route handler.

### Data access layering (enforced pattern)

1. **Client Components** → custom hooks → `@/lib/api-client` → API routes
2. **Server Components** → `src/lib/queries/*` (never raw Prisma)
3. **API Routes & Server Actions** → may use Prisma (`@/lib/db`) directly or reuse `src/lib/queries/*`
4. **Never** import `@/lib/db` from client-side code or browser bundles

`@/lib/api-client` exposes `api.get / api.post / api.put / api.patch / api.delete`. Always use it (not raw `fetch`) in hooks.

### Prisma client

The Prisma Client is generated into `prisma/generated/client` (not the default location). Always import from there:

```ts
import { db } from '@/lib/db'  // correct — uses prisma/generated/client internally
import { OperationType } from '../../../prisma/generated/client'  // enum import
```

`src/lib/prisma-types.ts` re-exports `OperationType` as a convenience. Path alias `@/*` maps to `src/*`.

If the generated client is missing (e.g. fresh clone), run `npx prisma generate`.

### Credits system

**Single source of truth:** `src/lib/credits/feature-config.ts`

```ts
export const FEATURE_CREDIT_COSTS = {
  ai_text_chat: 1,
  ai_image_generation: 5,
  creative_download: 2,
  video_export: 10,
  social_media_post: 3,
  background_removal: 3,
} as const

export type FeatureKey = keyof typeof FEATURE_CREDIT_COSTS
```

- Each `FeatureKey` maps 1-to-1 to a Prisma `OperationType` enum. Adding a new feature requires updating both.
- Admin can override default costs via `/admin/settings` → stored in `AdminSettings.featureCosts` (singleton row).
- `getFeatureCost(feature)` and `getPlanCredits(planId)` in `src/lib/credits/settings.ts` return the effective (possibly overridden) values.
- Backend usage pattern: `validateCreditsForFeature` → call provider → `refundCreditsForFeature` on provider failure.
- Credits work for both personal users (`CreditBalance`) and organizations (`OrganizationCreditBalance`). Pass `organizationId` to deduct/refund functions to use org balance.
- Frontend: `useCredits()` hook (`src/hooks/use-credits.ts`) exposes `{ credits, canPerformOperation, getCost, refresh }`.

### Organizations (multi-tenant)

Projects can be shared to organizations. An `Organization` has its own `OrganizationCreditBalance`. Membership and plan info come from Clerk organizations (synced via webhook). Usage is tracked in `OrganizationUsage` (separate from personal `UsageHistory`).

### Konva template editor

Located under `src/app/(protected)/templates/[id]/edit/` (components in `src/components/template-editor/`).

- **State:** everything goes through `TemplateEditorContext`. Never bypass it with local state for layer operations.
- **Layer types:** `text`, `rich-text`, `image`, `logo`, `element`, `shape`, `icon`, `gradient`, `gradient2`, `video`.
- **`rich-text`** layers store per-character style ranges in `richTextStyles[]`; `text` layers have a single uniform style.
- **Saving:** use `dirty` flag + `generateThumbnail()` → save `designData` JSON + `thumbnailUrl` to DB.
- **Export:** calls `exportDesign('png' | 'jpeg')` which deducts `creative_download` credits and uploads to Vercel Blob.
- Custom fonts: uploaded per-project, stored in DB (`CustomFont` model), loaded via `document.fonts` before Konva renders.

### Social posting pipeline

`SocialPost` records are dispatched via Zapier webhooks or the Later API (`postingProvider` on `Project`). Recurring posts create child records linked via `parentPostId`. After sending, Instagram posts go through a verification flow (`verificationStatus` + `nextVerificationAt`). `PostLog` and `PostRetry` track history and retry attempts.

### CMS (landing pages)

Admin-editable pages are stored in `CMSPage` / `CMSSection` / `CMSMenu` / `CMSComponent` / `CMSMedia`. Dynamic slug-based pages (`/[slug]`) are served from `src/app/(public)/[slug]`. Site-wide settings live in `SiteSettings` (single DB row). Brand config for the app shell is in `src/lib/brand-config.ts`.

### Admin panel

Access at `/admin`. Guard: `ADMIN_EMAILS` and/or `ADMIN_USER_IDS` env vars. The middleware only requires auth; the actual admin check is inside the admin layout. Relevant API prefix: `/api/admin/*`.

### Page metadata system (protected routes)

All protected pages must call `usePageConfig()` — never manually render headers or breadcrumbs:

```tsx
"use client"
import { usePageConfig } from "@/hooks/use-page-config"

export default function MyPage() {
  usePageConfig("Page Title", "Description")
  // or with breadcrumbs:
  usePageConfig({ title: "...", description: "...", breadcrumbs: [...] })
  return <Content />
}
```

The protected layout reads from `PageMetadataContext` and renders headers/breadcrumbs automatically.

## Key Environment Variables

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  # Clerk
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
DATABASE_URL                        # PostgreSQL (Neon recommended)
NEXT_PUBLIC_APP_URL
ADMIN_EMAILS                        # Comma-separated admin emails
ADMIN_USER_IDS                      # Comma-separated Clerk user IDs
BLOB_READ_WRITE_TOKEN               # Vercel Blob (uploads/exports)
OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / MISTRAL_API_KEY / OPENROUTER_API_KEY
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  # optional
```

Copy `.env.example` to `.env.local` to get started.

## Docs & Playbooks Index

- Architecture: `docs/architecture.md`
- Development guidelines: `docs/development-guidelines.md`
- Frontend patterns: `docs/frontend.md`, `docs/components.md`
- Backend & API: `docs/backend.md`, `docs/api.md`
- Auth: `docs/authentication.md`
- Database/Prisma: `docs/database.md`
- Credits system: `docs/credits.md`
- Konva editor: `docs/konva-editor.md`
- Custom fonts: `docs/custom-fonts.md`
- Projects & templates: `docs/projects-templates.md`
- Admin panel: `docs/PAINEL-ADMIN-COMPLETO.md`
- Agent playbooks: `agents/README.md` (frontend, backend, database, security, QA, planning)

