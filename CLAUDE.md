# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
```bash
npm run dev          # Start development server (port 3000)
npm run build        # Build for production (runs prisma generate first)
npm run start        # Start production server
```

### Code Quality
```bash
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking (tsc --noEmit)
```

### Database Management
```bash
npm run db:push      # Push schema changes to database
npm run db:migrate   # Run database migrations
npm run db:reset     # Reset database (drop all data and recreate schema)
npm run db:studio    # Open Prisma Studio for database management
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15.3.5 with App Router
- **Authentication**: Clerk (with middleware protection)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS v4 with Radix UI components
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form with Zod validation
- **Language**: TypeScript (non-strict mode)

### Project Structure

```
src/
├── app/
│   ├── (public)/          # Unauthenticated routes
│   │   ├── sign-in/       # Clerk sign-in page
│   │   ├── sign-up/       # Clerk sign-up page
│   │   └── page.tsx       # Landing page
│   ├── (protected)/       # Authenticated routes (client-side protection)
│   │   ├── dashboard/     # Main dashboard
│   │   ├── billing/       # Subscription management
│   │   └── layout.tsx     # Protected layout with sidebar
│   ├── admin/             # Admin panel routes
│   │   ├── settings/      # Admin settings (split into features & plans)
│   │   │   ├── features/  # Feature cost configuration
│   │   │   ├── plans/     # Billing plans management (Clerk sync)
│   │   │   └── page.tsx   # Settings overview with navigation cards
│   │   ├── users/         # User management
│   │   ├── credits/       # Credit management
│   │   └── usage/         # Usage analytics
│   └── api/               # API routes (server-side)
│       ├── credits/       # Credit system endpoints
│       └── admin/         # Admin API endpoints
├── components/
│   ├── ui/                # Radix UI + Tailwind components
│   ├── app/               # Application-specific components (sidebar, topbar)
│   └── providers/         # React Query and theme providers
├── lib/
│   ├── db.ts              # Prisma client singleton
│   ├── auth-utils.ts      # Authentication helpers
│   ├── api-client.ts      # HTTP client for TanStack Query
│   └── utils.ts           # Utility functions (cn for className merging)
└── hooks/                 # Custom React hooks
    ├── admin/             # Admin-specific TanStack Query hooks
    └── use-*.ts           # General application hooks
```

### Authentication Flow
- Clerk handles authentication with middleware protection
- Public routes: `/`, `/sign-in/*`, `/sign-up/*`, `/api/health`
- Protected routes use client-side `useAuth` hook to verify authentication
- API routes use server-side `auth()` from Clerk
- Users are automatically created in database on first authentication via `getUserFromClerkId`

### Database Schema (Key Models)
- **User**: Linked to Clerk via `clerkId`, owns workspaces and AI agents
- **Workspace**: Container for AI agents with context artifacts
- **AIAgent**: Configurable agents with capabilities and system prompts
- **CreditBalance**: Tracks user credits (synced with Clerk)

### API Pattern
All API routes follow this pattern:
1. Authenticate user with `await auth()` from Clerk
2. Get or create database user with `getUserFromClerkId()`
3. Verify resource ownership when applicable
4. Return JSON response with appropriate status codes

### Component Architecture
- All components use `"use client"` directive when needed for interactivity
- UI components are built with Radix UI primitives + Tailwind styling
- Form components use React Hook Form with Zod schemas
- Data fetching uses TanStack Query for caching and state management

### Data Fetching with TanStack Query
This project uses TanStack Query (React Query) for all client-side API requests with a consistent approach:

#### API Client Pattern
- **Centralized HTTP Client**: All API calls use the `api` utility from `@/lib/api-client`
- **Error Handling**: Automatic error parsing and type-safe error responses
- **Type Safety**: Generic API client with TypeScript support

```typescript
// Example API client usage
import { api } from '@/lib/api-client';

// GET request
const data = await api.get<UserData>('/api/users/me');

// POST request with data
const result = await api.post('/api/users', { name: 'John' });
```

#### Custom Hooks Pattern
All data fetching is encapsulated in custom hooks following these conventions:

**Query Hooks (GET requests):**
```typescript
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users'),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}
```

**Mutation Hooks (POST/PUT/DELETE requests):**
```typescript
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userData: CreateUserData) =>
      api.post('/api/users', userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

#### Hook Organization
- **`src/hooks/use-*.ts`**: General application hooks
- **`src/hooks/admin/use-admin-*.ts`**: Admin-specific hooks
- Each hook file exports related query and mutation hooks
- Hooks include proper TypeScript interfaces for request/response data

#### Caching Strategy
- **Query Keys**: Structured as arrays for easy invalidation (e.g., `['users', userId]`)
- **Stale Time**: Varies by data type (30s for real-time, 5min for settings)
- **Garbage Collection**: Automatic cleanup of unused cache entries
- **Background Refetching**: Keeps data fresh when window gains focus

#### Error Handling
- **ApiError Class**: Custom error type with status codes and response details
- **Consistent Error States**: All hooks provide standardized error information
- **User Feedback**: Automatic toast notifications for mutation errors

#### Important Rules
- **NEVER use fetch() directly** in client components - always use custom hooks
- **Server-side API routes** can use fetch() for external service calls
- **All mutations** should invalidate relevant queries for cache consistency
- **Loading states** are automatically handled by TanStack Query

### Environment Variables Required
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `CLERK_WEBHOOK_SECRET` - For Clerk webhooks
- `DATABASE_URL` - PostgreSQL connection string
- Additional Clerk URLs and optional Stripe keys (see .env.example)

### Path Aliases
- `@/*` maps to `./src/*`
- Components import example: `import { Button } from "@/components/ui/button"`

### TypeScript Configuration
- Strict mode is disabled (`"strict": false`)
- Path aliases configured for `@/` imports
- No implicit any warnings (`"noImplicitAny": false`)

### Admin Settings Management
The admin settings have been split into specialized pages for better organization:

#### Settings Structure
- **`/admin/settings`**: Overview page with navigation cards to sub-settings
- **`/admin/settings/features`**: Feature cost configuration (credits per functionality)
- **`/admin/settings/plans`**: Billing plans management (Clerk synchronization)

#### Billing Plans Management (Clerk Sync-Only)
- **Sync-Only Approach**: Plans cannot be created manually in the UI
- **Clerk Integration**: All plans must be created in Clerk Dashboard first
- **Synchronization Process**:
  1. Create billing plans in Clerk Dashboard
  2. Use "Sync with Clerk" button to import plans
  3. Configure credits and display names locally
  4. Save changes to persist settings
- **Local Configuration**: Only plan names and credit allocations are editable
- **Plan IDs**: Read-only, sourced directly from Clerk
- **Status Management**: Plans can be activated/deactivated locally

#### Feature Costs Configuration
- **Direct Management**: Feature costs can be edited directly
- **Validation**: Ensures non-negative integer values for credits
- **Real-time Updates**: Changes reflected immediately with proper validation

### Important Patterns
- Database access only through Prisma client singleton in `lib/db.ts`
- Authentication utilities centralized in `lib/auth-utils.ts`
- Protected routes use client-side redirect in layout component
- Glass morphism UI design with backdrop blur effects
- Responsive design with mobile-first approach
- Admin settings follow sync-first approach for external integrations
