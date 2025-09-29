# Backend Development – Prompt

Objective
- Implement API routes and server logic with strict validation, auth, and Prisma access control.

Context
- App Router API files live under `src/app/api/**/route.ts`. DB client in `src/lib/db.ts`. Auth helpers in `src/lib/api-auth.ts` and `src/lib/auth-utils.ts`. Credits logic in `src/lib/credits/*`.
  - Feature costs: `src/lib/credits/feature-config.ts` (examples: `ai_text_chat`=1, `ai_image_generation`=5)
  - Server Components use the query layer `src/lib/queries/*` (no direct Prisma in Server Components). API routes can use Prisma directly or reuse these query functions.

Steps
- Define endpoint contract: method(s), URL, request/response schema, errors.
- Validation: Use Zod schemas for body/query. Reject unknown fields. Parse early.
- Auth: Resolve the current user/session via Clerk helpers. Enforce tenant scoping by `userId`.
- Data: Use Prisma CRUD with narrow `select`/`include`. Wrap multi-step changes in a transaction where needed.
  - Never expose Prisma or raw DB access to client code. Keep `@/lib/db` imports server-only.
- Credits: For billable operations, validate and deduct with:
  - `validateCreditsForFeature(clerkUserId, feature as FeatureKey)` where `feature` is typed as `FeatureKey`
  - `deductCreditsForFeature({ clerkUserId, feature, projectId, details, quantity })`
- Responses: Return `NextResponse.json(data, { status })`. Do not leak internals in messages.
- Webhooks: Verify signatures (Svix) and ensure idempotency keys.

AI Providers (Vercel AI SDK)
- API route example: `src/app/api/ai/chat/route.ts` uses `streamText` from `ai` and provider clients from `@ai-sdk/*`.
- Providers supported: OpenAI, Anthropic, Google, Mistral, OpenRouter (OpenAI-compatible via `baseURL`).
- Env keys (set only what you use): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`.
- Validation: allowlist `provider` and ensure `model` is valid for that provider.
- Security: never leak keys to client; proxy requests server-side only. Consider rate limiting and credit gating for production.

Credits for AI usage
- Text chat: use `ai_text_chat` (1 credit) in `/api/ai/chat`.
- Image generation: use `ai_image_generation` (5 credits) in `/api/ai/image` (optionally scale with `quantity: count`).
- Call order: `validateCreditsForFeature` then `deductCreditsForFeature` before invoking provider.

Image Generation (OpenRouter)
- Endpoint: `POST /api/ai/image` (auth required), validates `{ model, prompt, size?, count? }`.
- Transport: OpenRouter `chat/completions` with image modality; returns `{ images: string[] }` (data URLs).
- Defaults: uses `google/gemini-2.5-flash-image-preview` unless overridden by body `model`.

Example
```ts
// src/app/api/example/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/api-auth'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { type FeatureKey } from '@/lib/credits/feature-config'

const Body = z.object({ name: z.string().min(1) })

export async function POST(req: Request) {
  const user = await requireUser()
  const { name } = Body.parse(await req.json())
  const feature: FeatureKey = 'ai_text_chat'
  await validateCreditsForFeature(user.id, feature)
  // Example using ApiKey model (projects/tasks removed)
  const item = await db.apiKey.create({ data: { name, key: crypto.randomUUID(), userId: user.id } })
  await deductCreditsForFeature({ clerkUserId: user.id, feature, details: { created: true, resource: 'apiKey' } })
  return NextResponse.json({ item }, { status: 201 })
}
```

Quality Gates
- `npm run lint`, `npm run typecheck`, `npm run build` must pass. Add minimal logging; avoid PII.

Deliverables
- Route code + short PR notes (contract, validation, auth, test plan). Update `.env.example` if new env vars.

Credits & Billing
- Use centralized helpers: `validateCreditsForFeature` and `deductCreditsForFeature` from `src/lib/credits/deduct.ts`. Type feature keys via `FeatureKey`.
- Monthly subscriptions: handled by Clerk webhook events `subscription.created/updated/deleted` and `subscriptionItem.active/updated` using `refreshUserCredits`.
- One-time credit packs: map Stripe Price IDs to credit amounts in `src/lib/clerk/credit-packs.ts`. The Clerk webhook adds credits on `invoice.payment_succeeded` via `addUserCredits`.
- Never trust client-provided amounts; only award credits for whitelisted price IDs.
- If extending webhooks, consider idempotency with invoice IDs to avoid double-crediting on retries.
 - If using Clerk Billing plans, map `cplan_*` IDs to internal plan keys in `src/lib/clerk/plan-mapping.ts`.

## Frontend Integration Considerations

When developing API routes, consider how the frontend will consume them through TanStack Query:

### Response Patterns
- **Consistent Error Format**: Use standard error responses that the API client can parse
- **Typed Interfaces**: Define TypeScript interfaces for request/response data that can be shared with frontend hooks
- **Pagination**: Use consistent pagination patterns across all list endpoints
- **Filter Parameters**: Support standard query parameters for filtering, sorting, and searching

### Example API Route with Frontend Integration

```typescript
// src/app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/api-auth';

// Schema for query parameters
const QuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  search: z.string().optional(),
  includeUsageCount: z.coerce.boolean().default(false),
});

// Response type that frontend hooks will use
export interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  const { searchParams } = new URL(request.url);

  const { page, pageSize, search, includeUsageCount } = QuerySchema.parse(
    Object.fromEntries(searchParams)
  );

  // Build query with proper filtering
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        creditBalance: true,
        ...(includeUsageCount && {
          _count: { select: { usageHistory: true } }
        }),
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.user.count({ where }),
  ]);

  const response: UsersResponse = {
    users,
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    },
  };

  return NextResponse.json(response);
}
```

### Error Handling for Frontend
```typescript
// Return consistent error format that API client can parse
if (validation.error) {
  return NextResponse.json(
    {
      error: 'Validation failed',
      message: validation.error.message,
      details: validation.error.issues
    },
    { status: 400 }
  );
}

// Server errors should not leak internal details
catch (error) {
  console.error('API Error:', error);
  return NextResponse.json(
    {
      error: 'Internal server error',
      message: 'An unexpected error occurred'
    },
    { status: 500 }
  );
}
```

### Cache-Friendly Design
- **ETags**: Consider adding ETags for cacheable resources
- **Last-Modified**: Include timestamps for data freshness validation
- **Proper HTTP Status Codes**: Use appropriate status codes for cache behavior
- **Immutable Resources**: Design APIs to support optimistic updates where possible

### API Documentation
When creating new endpoints, document them in `docs/api.md` with:
- Request/response schemas
- Error responses
- Frontend hook usage examples
- Query parameter options
