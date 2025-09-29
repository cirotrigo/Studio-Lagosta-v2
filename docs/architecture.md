# Architecture Overview

## System Architecture

This Next.js SaaS template follows a modern, scalable architecture designed for production-ready applications with a focus on maintainability, performance, and developer experience.

## Core Architecture Principles

### 1. Separation of Concerns
- **Presentation Layer**: React components with Next.js App Router
- **Business Logic**: Server Components and API routes
- **Data Layer**: Prisma ORM with PostgreSQL
- **Authentication**: Clerk as external service

### 2. Type Safety
- End-to-end TypeScript implementation
- Zod schemas for runtime validation
- Prisma for type-safe database queries

### 3. Performance First
- Server Components by default
- Client Components only when necessary
- React Query for intelligent caching
- Optimistic updates for better UX

## Application Layers

### Frontend Architecture

```
┌─────────────────────────────────────────┐
│         Next.js App Router              │
├─────────────────────────────────────────┤
│     Server Components (Default)         │
│     Client Components (Interactive)     │
├─────────────────────────────────────────┤
│         React Query Cache               │
├─────────────────────────────────────────┤
│      Radix UI + Tailwind CSS           │
└─────────────────────────────────────────┘
```

### Backend Architecture

```
┌─────────────────────────────────────────┐
│         API Routes (Next.js)           │
├─────────────────────────────────────────┤
│      Authentication (Clerk)             │
├─────────────────────────────────────────┤
│      Business Logic Layer              │
├─────────────────────────────────────────┤
│         Prisma ORM                     │
├─────────────────────────────────────────┤
│         PostgreSQL                     │
└─────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/          # Public routes group
│   ├── (protected)/       # Protected routes group
│   ├── api/              # API endpoints
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── ui/              # Base UI components
│   ├── app/             # Application components
│   └── providers/       # Context providers
├── lib/                 # Core utilities
│   ├── db.ts           # Database client
│   ├── auth-utils.ts   # Auth helpers
│   └── utils.ts        # Shared utilities
├── hooks/              # Custom React hooks
└── types/              # TypeScript types
```

## Route Groups

### Public Routes (`/app/(public)/`)
- Landing page
- Authentication pages (sign-in, sign-up)
- Marketing pages
- No authentication required

### Protected Routes (`/app/(protected)/`)
- Dashboard
- User profile
- Billing/subscription
- Requires authentication via Clerk

### API Routes (`/app/api/`)
- RESTful endpoints
- Server-side authentication
- Database operations
- External service integrations

## Data Flow

### Read Operations
1. User interacts with UI component
2. React Query fetches from API route
3. API validates authentication
4. Prisma queries database
5. Data returned and cached

### Write Operations
1. User submits form (React Hook Form)
2. Zod validates input
3. API route processes request
4. Database updated via Prisma
5. React Query cache invalidated
6. UI updates optimistically

### Admin Settings Flow
- Admin updates `/admin/settings` → `PUT /api/admin/settings` saves settings in `AdminSettings` (singleton row).
- Plan credits are keyed by Clerk plan IDs (`cplan_*`) you define in the Admin UI (persisted as rows in the `Plan` table).
- Server utilities read: `getFeatureCost`, `getPlanCredits` (accepts Clerk plan IDs).
- UI reads `GET /api/credits/settings` to display current costs and plan credits inline and to gate actions.

### Refunds on Provider Failures
- AI Chat and Image routes deduct before provider calls.
- On provider failures prior to a successful response, APIs call `refundCreditsForFeature` to reimburse and log a negative usage entry with a refund flag.

## State Management

### Local State
- React `useState` for component state
- React Hook Form for form state
- Zustand for complex local state (if needed)

### Server State
- React Query for data fetching
- Automatic caching and synchronization
- Optimistic updates
- Background refetching

### Global State
- Clerk for authentication state
- Theme context for UI preferences
- React Query for shared server state

## Security Architecture

### Authentication
- Clerk handles all authentication
- JWT tokens for session management
- Middleware protection for routes
- Server-side validation on API routes

### Authorization
- Role-based access control (RBAC)
- Resource ownership verification
- API key management for external access

### Data Protection
- Input validation with Zod
- SQL injection prevention via Prisma
- XSS protection via React
- CSRF protection via Next.js

## Performance Optimizations

### Rendering Strategy
- Server Components for static content
- Client Components for interactivity
- Dynamic imports for code splitting
- Streaming SSR for faster TTFB

### Caching Strategy
- React Query for API response caching
- Next.js built-in caching
- Database query optimization
- CDN for static assets

### Bundle Optimization
- Tree shaking with Next.js
- Dynamic imports for large components
- Image optimization with Next.js Image
- Font optimization with Next.js Font

## Scalability Considerations

### Horizontal Scaling
- Stateless application design
- Database connection pooling
- External session storage (Clerk)
- CDN for global distribution

### Vertical Scaling
- Efficient database queries
- Optimized React components
- Lazy loading strategies
- Background job processing

## Development Workflow

### Local Development
1. Clone repository
2. Install dependencies
3. Configure environment variables
4. Run database migrations
5. Start development server

### Testing Strategy
- Unit tests for utilities
- Integration tests for API routes
- E2E tests for critical user flows
- Type checking with TypeScript

### Deployment Pipeline
1. Push to Git repository
2. Automated CI/CD pipeline
3. Run tests and type checking
4. Build production bundle
5. Deploy to hosting platform

## Technology Decisions

### Why Next.js App Router?
- Server Components for better performance
- Built-in routing and API routes
- Excellent developer experience
- Production-ready optimizations

### Why Clerk?
- Complete authentication solution
- Social login support
- User management dashboard
- Webhook support for events

### Why Prisma?
- Type-safe database queries
- Excellent developer experience
- Database migration management
- Support for multiple databases

### Why React Query?
- Intelligent caching
- Optimistic updates
- Background refetching
- Offline support

### Why Radix UI + Tailwind?
- Accessible components
- Unstyled primitives
- Tailwind for rapid styling
- Consistent design system
