---
status: filled
generated: 2026-01-31
---

# Architecture

Studio Lagosta follows a modern Next.js 15 App Router architecture with clear separation between client and server code, using Prisma for database access and Clerk for authentication.

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ React Pages  │  │ Canvas Editor│  │ TanStack Query Cache │   │
│  │ (App Router) │  │ (Konva.js)   │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js Server                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ API Routes   │  │ Server       │  │ Webhooks             │   │
│  │ /api/*       │  │ Components   │  │ (Buffer, Clerk)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│    PostgreSQL    │ │   Vercel Blob    │ │  External APIs   │
│    (Prisma)      │ │   (Storage)      │ │ (Later, IG, AI)  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/           # Unauthenticated routes
│   │   ├── sign-in/        # Clerk sign-in
│   │   ├── sign-up/        # Clerk sign-up
│   │   └── page.tsx        # Landing page
│   ├── (protected)/        # Authenticated routes
│   │   ├── studio/         # Template editor
│   │   ├── projects/       # Project management
│   │   ├── agenda/         # Calendar/scheduling
│   │   └── layout.tsx      # Protected layout with sidebar
│   ├── admin/              # Admin panel
│   │   ├── users/          # User management
│   │   ├── credits/        # Credit management
│   │   └── settings/       # Feature costs, plans
│   └── api/                # API routes
│       ├── templates/      # Template CRUD
│       ├── posts/          # Post scheduling
│       ├── webhooks/       # External webhooks
│       └── cron/           # Scheduled tasks
├── components/
│   ├── ui/                 # Radix UI + Tailwind
│   ├── templates/          # Canvas editor components
│   └── providers/          # React Query, Theme
├── lib/
│   ├── db.ts               # Prisma client singleton
│   ├── auth-utils.ts       # Auth helpers
│   ├── posts/              # Post scheduling system
│   ├── later/              # Later.com API client
│   └── instagram/          # Instagram Graph API
└── hooks/                  # Custom React hooks
```

## Architectural Layers

### 1. Config Layer
Configuration and constants for hooks and admin settings.

Key exports:
- `useSiteConfig` - Site configuration hook
- `useAdminSettings` - Admin settings management
- `useSiteSettings` - Site settings CRUD

### 2. Components Layer
UI components and views built with React and Radix UI primitives.

Key areas:
- **Templates**: Canvas editor UI (`src/components/templates/`)
- **Admin**: Admin panel components (`src/components/admin/`)
- **Organization**: Multi-tenant features (`src/components/organization/`)
- **Posts**: Social media posting UI (`src/components/posts/`)

### 3. Services Layer
Business logic encapsulated in service classes.

| Service | Location | Purpose |
|---------|----------|---------|
| `PostScheduler` | `lib/posts/scheduler.ts` | Post scheduling logic |
| `PostExecutor` | `lib/posts/executor.ts` | Post publishing |
| `StoryVerifier` | `lib/posts/verification/` | Instagram verification |
| `LaterClient` | `lib/later/client.ts` | Later.com integration |
| `RenderEngine` | `lib/render-engine.ts` | Server-side canvas rendering |
| `GoogleDriveService` | `server/google-drive-service.ts` | Google Drive integration |

### 4. Utils Layer
Shared utilities and helper functions.

Key utilities:
- `api-client.ts` - HTTP client for TanStack Query
- `cn()` - Tailwind class name merging
- `auth-utils.ts` - Authentication helpers

### 5. Data Access Layer
Prisma ORM with a singleton client pattern.

```typescript
// lib/db.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
```

## Authentication Flow

```
User → Clerk → Middleware → API Route → Database
                   │
                   └─ Validates JWT token
                   └─ Protects routes
```

1. User authenticates via Clerk
2. Middleware validates JWT on every request
3. API routes use `auth()` to get userId
4. `getUserFromClerkId()` links Clerk ID to DB user

## Data Flow Patterns

### Client Data Fetching
All client-side data uses TanStack Query:

```typescript
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/templates'),
  });
}
```

### Webhook Processing

```
Buffer → /api/webhooks/buffer/post-sent → Update post status
Clerk → /api/webhooks/clerk → Sync user data
Later → /api/webhooks/later → Post status updates
```

### Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/verify-stories` | Every 5 min | Verify Instagram stories |

## Canvas Editor Architecture

```
┌─────────────────────────────────────────┐
│              React Components            │
│  (Toolbar, Layer Panel, Properties)      │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           DesignContext (State)          │
│  - layers[], selectedLayerId, history    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Konva Stage/Canvas               │
│  (Background, Images, Text, Shapes)      │
└─────────────────────────────────────────┘
```

## External Integrations

### Instagram Story Verification
1. Post created with unique TAG
2. Scheduled via Later API
3. Buffer webhook triggers verification
4. Cron checks Instagram Graph API
5. Matches by TAG or timestamp fallback

### Later.com API
- Post scheduling and publishing
- Media upload
- Analytics retrieval

### AI Services (OpenRouter)
- Multiple model support
- Credit-based usage
- Image generation

## Database Schema (Key Models)

```
User
├── clerkId (unique)
├── organizations[]
└── credits

Project
├── templates[]
├── posts[]
└── socialAccounts[]

Template
├── designData (JSON)
├── generations[]
└── pages[]

SocialPost
├── verificationStatus
├── verificationTag
└── platform
```

## Security

- Clerk authentication on all protected routes
- Resource ownership verification
- Webhook HMAC signatures
- Input validation with Zod
- Environment variables for secrets

## Performance

- TanStack Query caching
- Next.js Image optimization
- Lazy loading for canvas components
- Prisma query optimization
- Vercel Edge caching
