# Frontend Development – Prompt

Objective
- Implement or modify UI in the Next.js App Router with accessible, type-safe components.

Context
- Routes under `src/app` with segments `(public)` and `(protected)`. UI components in `src/components/ui/*`, shared pieces in `src/components/*`. Styles via Tailwind (see `src/app/globals.css`). Path alias `@/*` → `src/*`.

Steps
- Plan route placement: public vs protected, file path under `src/app/.../page.tsx`.
- Page Metadata: For protected routes, use `usePageConfig` hook from `@/hooks/use-page-config` to set title, description, and breadcrumbs. The layout handles rendering automatically.
- Scaffold UI using existing primitives: `Button`, `Card`, `Dialog`, `Form` in `src/components/ui`. Compose with `cn` from `@/lib/utils`.
- Forms: Use `react-hook-form` + Zod resolvers. Show inline validation. Keep server errors visible but not verbose.
- Data fetching: Prefer Server Components where possible. For client-side mutations/queries, use TanStack Query with custom hooks. **NEVER use fetch() directly in components** - always use custom hooks that wrap TanStack Query and the API client from `@/lib/api-client`.
  - Never import or use the Prisma client (`@/lib/db`) in Client Components.
  - Server Components should not query Prisma directly. Use the query layer in `src/lib/queries/*` and pass results as props.
- Auth: Use Clerk components/hooks where needed. Respect middleware-protected routes.
- Accessibility: Labels, focus states, keyboard nav. Avoid `dangerouslySetInnerHTML`.
- Styling: Tailwind utility-first, follow existing patterns; keep component APIs minimal and typed.
- Credits UI: avoid hardcoding costs on the client. Drive feedback from backend responses or expose an endpoint that reads `feature-config.ts`.

Quality Gates
- Run: `npm run dev` (iterate), `npm run lint`, `npm run typecheck`, `npm run build` (sanity check).
- Visual: Add screenshots/GIFs to PR. Keep DOM size reasonable and avoid layout shift.

Deliverables
- Code changes + brief PR description, screenshots, and validation steps. Note any new props or UI patterns introduced.

AI Chat (Vercel AI SDK)
- Page example: `src/app/(protected)/ai-chat/page.tsx` using `useChat` from `@ai-sdk/react`.
- Provider/model selectors: update `PROVIDERS` and `MODELS` constants when adding support.
- Streaming: messages stream in-place; keep container scrollable with sensible max height.
- UX: show an initial hint when the chat is empty; disable submit while streaming.
- Image mode: toggle "Modo: Imagem" uses OpenRouter (`POST /api/ai/image`) and displays returned images inline.
 - Credits UI: use `useCredits()` to show remaining credits and disable submit if the user cannot afford the action (1 for chat, 5 for image).

## TanStack Query Integration

### Data Fetching Rules
1. **Custom Hooks Only**: Never call `useQuery` or `useMutation` directly in components. Use existing custom hooks or create new ones.
2. **API Client**: All HTTP requests must use the `api` client from `@/lib/api-client`.
3. **Query Keys**: Structure as arrays for easy cache invalidation: `['domain', 'resource', params]`
4. **Error Handling**: Let the API client handle HTTP errors automatically.

### Hook Patterns

#### Query Hook Example
```typescript
// hooks/use-feature.ts
import { api } from '@/lib/api-client';

export interface FeatureData {
  id: string;
  name: string;
  isEnabled: boolean;
}

export function useFeature(id: string) {
  return useQuery<FeatureData>({
    queryKey: ['features', id],
    queryFn: () => api.get(`/api/features/${id}`),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}
```

#### Mutation Hook Example
```typescript
// hooks/use-update-feature.ts
export function useUpdateFeature() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeatureData> }) =>
      api.put(`/api/features/${id}`, data),
    onSuccess: (data, variables) => {
      toast({ title: "Feature updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['features'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update feature",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}
```

#### Component Usage
```typescript
// components/feature-form.tsx
export function FeatureForm({ featureId }: { featureId: string }) {
  const { data, isLoading, error } = useFeature(featureId);
  const updateFeature = useUpdateFeature();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorAlert message={error.message} />;

  const handleSubmit = (formData: Partial<FeatureData>) => {
    updateFeature.mutate({ id: featureId, data: formData });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form content */}
      <button
        type="submit"
        disabled={updateFeature.isPending}
      >
        {updateFeature.isPending ? 'Updating...' : 'Update Feature'}
      </button>
    </form>
  );
}
```

### Available Hooks

#### User & Admin Management
- `useCredits()` - User credit balance and operations
- `useSubscription()` - Subscription status
- `useDashboard()` - Admin dashboard data
- `useAdminUsers(params)` - Admin user management with pagination and search
- `useAdminCredits(params)` - Admin credit management and transactions
- `useAdminInvitations()` - Admin invitation management
- `useAdminSettings()` - Admin settings configuration

#### Plans & Billing
- `useAdminPlans()` - Fetch billing plans from database
- `useClerkPlans()` - Sync plans from Clerk (manual trigger)
- `useCreatePlan()` - Create new billing plan
- `useUpdatePlan()` - Update existing plan configuration
- `useDeletePlan()` - Delete billing plan

#### Storage & Files
- `useStorage(params)` - Storage object management with search/filters
- `useDeleteStorageItem()` - Delete storage objects with cache invalidation

#### Analytics & Usage
- `useUsage(params)` - Usage analytics with date/feature filtering

#### AI Features
- `useOpenRouterModels(capability)` - Fetch available AI models (text/image)
- `useGenerateImage()` - AI image generation mutation with credit handling

### Cache Management
- Mutations automatically invalidate related queries
- Use structured query keys for precise cache control
- Configure appropriate `staleTime` and `gcTime` based on data freshness needs
