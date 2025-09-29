# Database Development – Prompt

Objective
- Safely evolve the Prisma schema and data access while preserving integrity and tenancy.

Context
- Prisma schema at `prisma/schema.prisma`. Postgres datasource via `DATABASE_URL`. Generated client used from `src/lib/db.ts`. Core models relate to `User`, Features, Credits, and AI endpoints.
 - Usage logging uses `UsageHistory.operationType` (enum `OperationType`). Feature keys in code map to this enum via `src/lib/credits/feature-config.ts`.
 - Server Components consume data through the query layer `src/lib/queries/*` (do not import Prisma directly in Server Components).

Steps
- Model changes: Edit `prisma/schema.prisma`. Prefer explicit relations, `@@index`, and correct `onDelete` behavior.
- Migration: For new fields/models, run `npm run db:migrate` (interactive) during development; for quick sync in dev-only cases, `npm run db:push`.
- Code updates: Regenerate client via `npm run build` or `prisma generate`. Update queries/selects in affected files.
- Tenancy: Ensure new entities reference `userId` and/or `workspaceId` where appropriate. Avoid cross-tenant access.
- Defaults & Constraints: Use `@default`, `@unique`, and enums to encode rules. Avoid nullable fields unless truly optional.
- Performance: Add `@@index` on frequent filters (e.g., `userId`, `workspaceId`, `timestamp`).

Example Snippet
```prisma
model Example {
  id        String   @id @default(cuid())
  name      String
  userId    String
  workspaceId String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // add relations as needed for your feature set
  @@index([userId])
  @@index([workspaceId])
}
```

Quality Gates
- Run: `npm run db:migrate`, `npm run build`. Sanity-check reads/writes in impacted flows.
- PR: Describe data changes, migration risks, and rollback/forward plan.

## Frontend Integration Considerations

When modifying the database schema, consider how changes will affect TanStack Query patterns:

### Query Optimization
- **Selective Loading**: Use `select` and `include` strategically to minimize data transfer
- **Pagination**: Support both offset and cursor-based pagination for different UI patterns
- **Filtering**: Design indexes to support common filter combinations used in admin interfaces

### Hook-Friendly Patterns
```typescript
// Good: Structure data for easy cache management
const users = await db.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    creditBalance: { select: { credits: true } },
    _count: { select: { usageHistory: true } }
  },
  orderBy: { createdAt: 'desc' }
});

// Consider how this data will be used in hooks:
// - Individual user updates (queryKey: ['users', userId])
// - User lists (queryKey: ['users', filters])
// - Credit balance updates (queryKey: ['credits', userId])
```

### Cache Invalidation Planning
- **Cascading Updates**: When one model changes, which queries need invalidation?
- **Optimistic Updates**: Structure responses to support optimistic UI updates
- **Real-time Considerations**: Design with potential WebSocket updates in mind

### Performance for Client Queries
- **Index Strategy**: Index fields commonly used in WHERE clauses from frontend filters
- **Relation Loading**: Minimize N+1 queries through proper `include` strategies
- **Response Size**: Keep response payloads reasonable for client-side caching
