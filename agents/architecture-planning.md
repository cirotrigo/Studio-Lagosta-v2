# Architecture & Planning – Prompt

Objective
- Define a minimal, pragmatic plan before implementation: scope, flows, data, APIs, and risks.

Context
- Next.js App Router (`src/app`), UI components in `src/components/*`, Page Metadata System in `src/contexts/page-metadata.tsx`, server logic in API routes, Prisma models in `prisma/schema.prisma`. Domain includes Users, Features, Credits, and AI integrations.

Deliverables (paste in PR description or `docs/architecture.md`)
- Problem & Goals: 2–3 bullets with outcomes and non-goals.
- User Flows: Primary flow(s) with URL map (e.g., `/dashboard/...`). Sketch components reused/added. For protected routes, specify page metadata (title, description, breadcrumbs).
- Data Model Impact: New/changed Prisma models/fields, relations, indexes, and cascade rules.
- API Surface: New/changed endpoints with method, path, request/response examples, errors. For credit-gated features, specify the feature key (e.g., `ai_text_chat` or `ai_image_generation`) and expected cost.
  - For AI usage, define keys and costs explicitly and ensure `OperationType` enums exist and are mapped.
- External AI: If integrating LLMs, list supported providers/models, env keys required, and fallback/allowlist behavior for invalid inputs.
- Security & Tenancy: Auth requirements, ownership checks, rate/credit usage, webhook needs.
- Performance: Expected query patterns and indexes; SSR vs Client components. For client-side data fetching, specify TanStack Query strategy (query vs mutation, caching behavior, invalidation patterns).
- Frontend Data Flow: Define custom hooks needed for TanStack Query integration, query keys structure, and cache management strategy.
- Rollout: Migration plan, flags/toggles, metrics to watch.

Process Steps
1) Clarify: Restate the requirement; confirm constraints and acceptance criteria.
2) Inventory: Identify affected routes, components, models, and scripts.
3) Draft: Produce the Deliverables above with concise snippets.
4) Review: Sanity-check with `npm run typecheck`, `npm run build` assumptions and Prisma design.
5) Plan Tasks: Break into small, independently shippable PRs.

Tips
- Reuse existing patterns (credits, auth helpers, UI primitives) before adding new abstractions.
- Prefer explicit data ownership via `userId`/`workspaceId`. Index what you filter by.
- For AI: proxy calls via server routes only; never expose API keys in the client. Consider rate-limits and credit gating.
  - Credit gating: require credits before invoking providers; deduct on request. Decide if images charge per-request or per-image (`quantity`).
- Frontend Integration: All client-side API calls must use TanStack Query through custom hooks. Never use `fetch()` directly in components. Plan hook architecture and error handling patterns early.

## TanStack Query Architecture Planning

When planning features that involve client-side data fetching, consider:

### Custom Hook Strategy
- **Query Hooks**: For data fetching (GET operations)
  - Structure: `use{Resource}(params?)` (e.g., `useUsers(filters)`)
  - Query Keys: `[domain, resource, params]` format for cache management
  - Error handling via API client, success data returned directly
- **Mutation Hooks**: For data modifications (POST/PUT/DELETE operations)
  - Structure: `use{Action}{Resource}()` (e.g., `useCreateUser()`, `useUpdateUser()`)
  - Include optimistic updates and cache invalidation strategies
  - Toast notifications for success/error states

### Cache Management Planning
- **Stale Time**: How long data remains fresh (typically 1-5 minutes for user data)
- **GC Time**: How long data stays in cache when inactive (typically 5-30 minutes)
- **Invalidation**: Which mutations should invalidate which queries
- **Background Refetch**: Whether data should refetch when window regains focus

### Hook Architecture Examples

#### Simple Resource Hook
```typescript
// For basic CRUD operations
export function useUsers(params: UserFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => api.get('/api/admin/users', { params }),
    staleTime: 2 * 60_000, // 2 minutes
  });
}
```

#### Paginated Resource Hook
```typescript
// For data with cursor/offset pagination
export function useInfiniteUsers(filters: UserFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['admin', 'users', 'infinite', filters],
    queryFn: ({ pageParam }) => api.get('/api/admin/users', {
      params: { ...filters, cursor: pageParam }
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

#### Mutation with Cache Updates
```typescript
// For operations that modify data
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdate }) =>
      api.put(`/api/admin/users/${id}`, data),
    onSuccess: (updatedUser, variables) => {
      // Update specific user in cache
      queryClient.setQueryData(['admin', 'users', variables.id], updatedUser);
      // Invalidate user lists
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
```

### Planning Considerations
- **Data Relationships**: How updates to one resource affect others
- **Real-time Needs**: Whether data needs real-time updates (consider WebSocket integration)
- **Offline Support**: Whether mutations should queue when offline
- **Background Sync**: Automatic refetching strategies for stale data

Billing & Credits
- If adding one-time credit purchases, document the flow: checkout → Stripe invoice → Clerk webhook (`invoice.payment_succeeded`) → `addUserCredits`.
- Record which Stripe Price IDs correspond to credit packs and update `src/lib/clerk/credit-packs.ts` in the PR.
- For subscriptions, confirm plan→credits mapping and refresh path via `subscription.updated`.
