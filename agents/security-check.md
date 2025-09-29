# Security Check – Prompt

Objective
- Perform a focused security review for new/changed code before merge.

Context
- App: Next.js App Router (`src/app`). Auth via Clerk. DB: Prisma/Postgres. Credit system in `src/lib/credits/*`. Webhooks in `src/app/api/webhooks` using Svix.

Inputs
- PR diff or feature branch, relevant env keys (`.env.local`), affected routes/components.

Checklist
- Secrets & Config: No secrets in code or logs. Reads from env only. Update `.env.example` if new vars.
- AuthZ/AuthN: Protected routes live under `src/app/(protected)`. API handlers must derive user from Clerk (`@/lib/api-auth`/`auth-utils`) and enforce ownership/tenancy.
- Input Validation: Validate all `POST/PUT/PATCH` bodies and query params with Zod. Reject unknown fields. Example: `const data = Schema.parse(await req.json())`.
- API Routes: Confirm allowed methods, consistent status codes, no sensitive error leakage. Return `NextResponse.json({ error }, { status })`.
- Data Access: Prisma queries must scope by `userId`/`workspaceId`. Avoid raw SQL. Check cascade rules in schema for unintended deletes.
- Webhooks: Verify signatures (Svix) before processing. Handle idempotency and replay.
- Credits & Billing: Use centralized helpers `validateCreditsForFeature`/`deductCreditsForFeature` and `feature-config.ts`.
- Verify the feature key (`ai_text_chat` or `ai_image_generation`) and configured cost.
  - Ensure transactional deduction and proper `UsageHistory` logging.
  - For one-time credit packs, only award credits for whitelisted Stripe Price IDs from `src/lib/clerk/credit-packs.ts`.
  - Do not trust client-provided credit amounts. Consider idempotency (invoice IDs) to prevent double-credit on retries.
  - If using Clerk Billing, ensure plan ID mapping (`cplan_*` → internal key) is complete in `src/lib/clerk/plan-mapping.ts` and that webhook handles `subscriptionItem.*` events.
- Client Security: No dangerous `dangerouslySetInnerHTML`. Sanitize any user HTML. Avoid leaking PII to logs or analytics.
- TanStack Query Security: Ensure all client-side data fetching uses custom hooks with the centralized API client. Verify error handling doesn't expose sensitive server details. Check that mutation optimistic updates don't bypass validation.
- Dependencies: Prefer maintained libs. If adding one, justify and check licenses. Run `npm run build && npm run lint && npm run typecheck`.

AI Providers
- Keys: Confirm provider API keys are only used server-side; no client exposure.
- Allowlist: Validate `provider` and `model` inputs against known lists.
- Transport: Use official SDKs (`ai`, `@ai-sdk/*`); avoid direct fetch with raw keys.
- Abuse: Add rate limits/credit checks for chat endpoints to prevent misuse and cost spikes.
 - Credits: Verify `/api/ai/chat` uses `ai_text_chat` (1 credit) and `/api/ai/image` uses `ai_image_generation` (5 credits), with quantity applied for multiple images if supported.

## TanStack Query Security Considerations

When reviewing frontend data fetching changes:

### API Client Security
- **Centralized Error Handling**: Verify the API client properly sanitizes error messages before displaying to users
- **Authentication Headers**: Ensure auth tokens are handled securely and not logged
- **Request Validation**: Check that client-side validation doesn't replace server-side validation

### Cache Security
- **Sensitive Data**: Review what data is cached client-side; avoid caching sensitive information
- **Cache Poisoning**: Ensure optimistic updates can't bypass server validation
- **Memory Leaks**: Check that sensitive data is properly cleared from cache when needed

### Hook Security Patterns
```typescript
// Good: Server validates everything
export function useUpdateUser() {
  return useMutation({
    mutationFn: (data) => api.put('/api/users/me', data), // Server validates
    onError: (error) => {
      // Don't expose server errors directly
      toast({
        title: "Update failed",
        description: "Please try again"  // Generic message
      });
    }
  });
}

// Bad: Client-only validation
export function useDeleteUser() {
  return useMutation({
    mutationFn: (id) => {
      if (!isAdmin()) throw new Error("Unauthorized"); // Client check only
      return api.delete(`/api/users/${id}`);
    }
  });
}
```

### Review Checklist
- [ ] No direct `fetch()` calls in components
- [ ] All API calls go through centralized client
- [ ] Error messages don't leak server details
- [ ] Optimistic updates don't bypass server validation
- [ ] Sensitive data isn't cached unnecessarily
- [ ] Auth headers handled securely

Deliverable
- Short report in the PR with: risks (severity, likelihood), impacted code paths, concrete fixes, and follow-ups (if any).
