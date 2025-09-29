# Authentication Documentation

## Overview

This application uses Clerk for authentication, providing a complete user management solution with social logins, user profiles, and session management. Authentication is handled both client-side and server-side with proper middleware protection.

## Clerk Integration

### Core Dependencies

```json
{
  "@clerk/backend": "^2.6.2",
  "@clerk/nextjs": "6.23.0"
}
```

### Environment Configuration

```env
# Required Clerk environment variables
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Clerk URLs (customize as needed)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Root Layout Setup

```tsx
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

## Middleware Protection

### Route Middleware

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/webhooks/(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  // Allow public routes without authentication
  if (isPublicRoute(request)) {
    // Redirect authenticated users from home to dashboard
    const authResult = await auth();
    if (authResult.userId && request.nextUrl.pathname === "/") {
      const url = new URL("/dashboard", request.url);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  
  // All other routes require authentication
  // This will be handled by the protected layout
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

### Route Groups

#### Public Routes (`/app/(public)/`)
- Landing page (`/`)
- Sign-in page (`/sign-in`)
- Sign-up page (`/sign-up`)
- Marketing pages

#### Protected Routes (`/app/(protected)/`)
- Dashboard (`/dashboard`)
- User profile (`/profile`)
- Billing (`/billing`)
- Settings

## Client-Side Authentication

### Protected Layout

```tsx
// app/(protected)/layout.tsx
"use client";

import { useAuth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      redirect("/sign-in");
    }
  }, [isLoaded, isSignedIn]);

  // Show loading state while checking authentication
  if (!isLoaded) {
    return <div className="loading">Loading...</div>;
  }

  // Render protected content
  return (
    <div className="protected-layout">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

### Client Components

```tsx
// components/auth/user-button.tsx
import { UserButton, useUser } from "@clerk/nextjs";

export function UserProfile() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      <span>Welcome, {user.firstName}!</span>
      <UserButton 
        appearance={{
          elements: {
            avatarBox: "w-8 h-8"
          }
        }}
      />
    </div>
  );
}
```

### Authentication Hooks

```tsx
// hooks/use-auth.ts
import { useAuth as useClerkAuth, useUser } from '@clerk/nextjs';

export function useAuth() {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const { user } = useUser();

  return {
    isLoaded,
    isSignedIn,
    userId,
    user,
    isAuthenticated: isLoaded && isSignedIn,
  };
}

// Usage in components
function Dashboard() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <div>Please sign in</div>;
  }

  return <div>Welcome {user?.firstName}!</div>;
}
```

## Server-Side Authentication

### API Route Protection

```ts
// app/api/protected-route/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  // Get authentication status
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
  }

  // Proceed with authenticated logic
  const data = await fetchUserData(userId);
  return NextResponse.json(data);
}
```

### Server Components

```tsx
// app/(protected)/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/sign-in');
  }

  const userData = await fetchUserData(userId);
  
  return (
    <div>
      <h1>Dashboard</h1>
      <UserData data={userData} />
    </div>
  );
}
```

## User Management

### User Synchronization

The application maintains user data in sync between Clerk and the local database through webhooks and utility functions.

```ts
// lib/auth-utils.ts
import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';

export async function getUserFromClerkId(clerkId: string) {
  let user = await db.user.findUnique({
    where: { clerkId }
  });

  if (!user) {
    // Create user if doesn't exist
    user = await db.user.create({
      data: { 
        clerkId,
        // Additional fields will be populated via webhooks
      }
    });
  }

  return user;
}

export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  
  return getUserFromClerkId(userId);
}

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Authentication required');
  }
  return userId;
}
```

### Authorization Helpers

```ts
// lib/auth-utils.ts (continued)
// verifyProjectOwnership removed in this edition (Project module removed)

// Example access check: ensure the resource belongs to the current user
export async function verifyOwnership<T extends { userId: string }>(resource: T, userId: string) {
  const user = await getUserFromClerkId(userId)
  if (resource.userId !== user.id) {
    throw new Error('Access denied')
  }
  return resource
}
```

## Webhooks

### Clerk Webhook Handler

```ts
// app/api/webhooks/clerk/route.ts
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const event = payload as WebhookEvent;

    switch (event.type) {
      case 'user.created':
        await handleUserCreated(event);
        break;
        
      case 'user.updated':
        await handleUserUpdated(event);
        break;
        
      case 'user.deleted':
        await handleUserDeleted(event);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleUserCreated(event: WebhookEvent) {
  const { id, email_addresses, first_name, last_name } = event.data;
  
  await db.user.create({
    data: {
      clerkId: id,
      email: email_addresses[0]?.email_address,
      name: `${first_name || ''} ${last_name || ''}`.trim() || null,
      creditBalance: {
        create: {
          clerkUserId: id,
          creditsRemaining: 100, // Welcome credits
        }
      }
    }
  });
}

async function handleUserUpdated(event: WebhookEvent) {
  const { id, email_addresses, first_name, last_name } = event.data;
  
  await db.user.update({
    where: { clerkId: id },
    data: {
      email: email_addresses[0]?.email_address,
      name: `${first_name || ''} ${last_name || ''}`.trim() || null,
    }
  });
}

async function handleUserDeleted(event: WebhookEvent) {
  await db.user.delete({
    where: { clerkId: event.data.id }
  });
}
```

### Webhook Verification

```ts
// lib/webhook-verification.ts
import { Webhook } from 'svix';

export function verifyWebhook(
  payload: string,
  headers: Record<string, string>
) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Missing CLERK_WEBHOOK_SECRET');
  }

  const webhook = new Webhook(webhookSecret);
  return webhook.verify(payload, headers);
}
```

## Custom Sign-in/Sign-up Pages

### Sign-in Page

```tsx
// app/(public)/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-white shadow-lg"
          }
        }}
        redirectUrl="/dashboard"
      />
    </div>
  );
}
```

### Sign-up Page

```tsx
// app/(public)/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-white shadow-lg"
          }
        }}
        redirectUrl="/dashboard"
      />
    </div>
  );
}
```

## Customization

### Appearance Customization

```ts
// lib/clerk-theme.ts
export const clerkTheme = {
  layout: {
    socialButtonsVariant: 'iconButton' as const,
    socialButtonsPlacement: 'top' as const,
  },
  elements: {
    formButtonPrimary: 'bg-primary hover:bg-primary/90',
    card: 'bg-card border border-border',
    headerTitle: 'text-foreground',
    headerSubtitle: 'text-muted-foreground',
    dividerLine: 'bg-border',
    formFieldInput: 'bg-background border-border',
    footerActionLink: 'text-primary hover:text-primary/80',
  },
  variables: {
    colorPrimary: 'hsl(var(--primary))',
    colorBackground: 'hsl(var(--background))',
    colorInputBackground: 'hsl(var(--background))',
    colorInputText: 'hsl(var(--foreground))',
  },
};
```

### Usage with Theme

```tsx
// app/(public)/sign-in/page.tsx
import { SignIn } from '@clerk/nextjs';
import { clerkTheme } from '@/lib/clerk-theme';

export default function SignInPage() {
  return (
    <SignIn 
      appearance={clerkTheme}
      redirectUrl="/dashboard"
    />
  );
}
```

## Role-Based Access Control

### User Roles

```ts
// lib/roles.ts
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

export function hasRole(user: any, role: UserRole): boolean {
  return user?.publicMetadata?.role === role;
}

export function requireRole(user: any, role: UserRole) {
  if (!hasRole(user, role)) {
    throw new Error(`Access denied. Required role: ${role}`);
  }
}
```

### Role-based Components

```tsx
// components/auth/role-guard.tsx
import { useUser } from '@clerk/nextjs';
import { UserRole, hasRole } from '@/lib/roles';

interface RoleGuardProps {
  role: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ role, children, fallback }: RoleGuardProps) {
  const { user } = useUser();
  
  if (!user || !hasRole(user, role)) {
    return fallback || null;
  }
  
  return <>{children}</>;
}

// Usage
<RoleGuard role={UserRole.ADMIN}>
  <AdminPanel />
</RoleGuard>
```

### API Route Authorization

```ts
// app/api/admin/users/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { UserRole, requireRole } from '@/lib/roles';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await currentUser();
  try {
    requireRole(user, UserRole.ADMIN);
  } catch (error) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Admin-only logic
  const users = await db.user.findMany();
  return NextResponse.json(users);
}
```

## Session Management

### Session Information

```tsx
// components/auth/session-info.tsx
import { useSession } from '@clerk/nextjs';

export function SessionInfo() {
  const { session, isLoaded } = useSession();

  if (!isLoaded) return <div>Loading...</div>;
  if (!session) return <div>No active session</div>;

  return (
    <div>
      <p>Session ID: {session.id}</p>
      <p>Last active: {session.lastActiveAt.toLocaleDateString()}</p>
      <p>Expires: {session.expireAt.toLocaleDateString()}</p>
    </div>
  );
}
```

### Manual Session Management

```tsx
// hooks/use-session-management.ts
import { useSession } from '@clerk/nextjs';

export function useSessionManagement() {
  const { session } = useSession();

  const extendSession = async () => {
    try {
      await session?.touch();
    } catch (error) {
      console.error('Failed to extend session:', error);
    }
  };

  const endSession = async () => {
    try {
      await session?.end();
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  return {
    extendSession,
    endSession,
    isActive: session?.status === 'active',
  };
}
```

## Testing

### Mock Authentication

```tsx
// __tests__/utils/mock-clerk.ts
import { vi } from 'vitest';

export const mockAuth = (overrides = {}) => {
  vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(() => ({
      userId: 'user_123',
      sessionId: 'session_123',
      ...overrides,
    })),
  }));
};

export const mockUseAuth = (overrides = {}) => {
  vi.mock('@clerk/nextjs', () => ({
    useAuth: vi.fn(() => ({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_123',
      ...overrides,
    })),
  }));
};
```

### Test Examples

```tsx
// __tests__/api/protected.test.ts
import { GET } from '@/app/api/protected/route';
import { mockAuth } from '@/test-utils/mock-clerk';

describe('/api/protected', () => {
  it('returns data when authenticated', async () => {
    mockAuth({ userId: 'user_123' });
    
    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('message');
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth({ userId: null });
    
    const response = await GET();
    
    expect(response.status).toBe(401);
  });
});
```

## Security Best Practices

### 1. Server-Side Verification
Always verify authentication on the server side, never trust client-side state alone.

### 2. Webhook Security
Properly verify webhook signatures to ensure they come from Clerk.

### 3. Session Validation
Regularly validate sessions, especially for sensitive operations.

### 4. HTTPS Only
Always use HTTPS in production to protect authentication tokens.

### 5. Environment Variables
Keep all secrets in environment variables, never commit them to code.

### 6. Rate Limiting
Implement rate limiting on authentication endpoints to prevent abuse.

### 7. Audit Logging
Log all authentication events for security monitoring.

```ts
// lib/audit-logger.ts
export async function logAuthEvent(
  userId: string,
  event: string,
  details?: any
) {
  await db.auditLog.create({
    data: {
      userId,
      action: `AUTH_${event}`,
      resourceType: 'authentication',
      resourceId: userId,
      details: JSON.stringify(details),
      ipAddress: getClientIP(),
      userAgent: getUserAgent(),
    },
  });
}
```
