---
status: filled
generated: 2026-01-31
---

# Development Workflow

This document outlines the day-to-day engineering process for Studio Lagosta.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Configure required environment variables

# Push database schema
npm run db:push

# Start development server
npm run dev
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset database (destructive) |

## Environment Setup

### Required Environment Variables

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://...

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Instagram (for story verification)
INSTAGRAM_ACCESS_TOKEN=...
```

See `.env.example` for the complete list.

## Branching Strategy

### Trunk-Based Development
- Main branch: `main`
- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Hotfixes: `hotfix/description`

### Workflow
1. Create feature branch from `main`
2. Make changes with atomic commits
3. Open pull request
4. Code review
5. Merge to `main`
6. Auto-deploy to Vercel

## Code Quality

### TypeScript
- Non-strict mode (`strict: false`)
- Run `npm run typecheck` before commits
- Use proper types, avoid `any` where possible

### ESLint
- Run `npm run lint` before commits
- Auto-fix with `npm run lint -- --fix`

### Formatting
- Use Prettier (configured in project)
- Format on save recommended

## Development Patterns

### Adding a New API Route

1. Create route file in `src/app/api/[resource]/route.ts`
2. Follow the standard pattern:

```typescript
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getUserFromClerkId } from '@/lib/auth-utils';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await getUserFromClerkId(userId);
  // ... business logic
  return Response.json(data);
}
```

### Adding a New Hook

1. Create hook file in `src/hooks/use-[feature].ts`
2. Follow TanStack Query patterns:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useFeature() {
  return useQuery({
    queryKey: ['feature'],
    queryFn: () => api.get('/api/feature'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/api/feature', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature'] });
    },
  });
}
```

### Adding a New Component

1. Create component in `src/components/[category]/`
2. Use `"use client"` directive if interactive
3. Import UI primitives from `@/components/ui/`
4. Style with Tailwind CSS

## Database Changes

### Schema Changes
1. Edit `prisma/schema.prisma`
2. Run `npm run db:push` for development
3. Run `npm run db:migrate` for production migrations

### Prisma Studio
```bash
npm run db:studio
```
Opens GUI at http://localhost:5555 for database inspection.

## Testing

### Manual Testing
- Test locally with `npm run dev`
- Use Prisma Studio to inspect data
- Check browser DevTools for API errors

### Webhook Testing
```bash
# Test Buffer webhook
./test-webhook-local.sh

# Monitor with ngrok for external testing
ngrok http 3000
```

## Debugging

### Common Issues

**Database connection fails**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run `npm run db:push` to sync schema

**Clerk authentication fails**
- Verify Clerk keys in `.env`
- Check middleware configuration
- Ensure Clerk app is configured correctly

**API returns 401**
- Check if route is in protected path
- Verify Clerk session is valid
- Check `auth()` call in API route

### Logging
- Use `console.log` for development
- Check Vercel logs for production issues
- Structured logging for webhooks

## Deployment

### Automatic Deployment
- Push to `main` triggers Vercel deployment
- Preview deployments for pull requests

### Manual Deployment
```bash
# Build locally
npm run build

# Deploy to Vercel
vercel --prod
```

### Database Migrations in Production
```bash
# Generate migration
npx prisma migrate dev --name description

# Apply in production (via Vercel)
npm run db:migrate
```

## Onboarding Tasks

### For New Developers
1. Clone repository
2. Set up environment variables
3. Run `npm install && npm run db:push && npm run dev`
4. Review [Architecture](./architecture.md)
5. Review [CLAUDE.md](../../CLAUDE.md) for project conventions
6. Start with a small bug fix or documentation update

### Key Files to Understand
- `src/app/api/` - API routes structure
- `src/hooks/` - Data fetching patterns
- `src/components/templates/` - Canvas editor
- `prisma/schema.prisma` - Database schema
- `CLAUDE.md` - Project conventions and patterns
