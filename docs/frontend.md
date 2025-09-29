# Frontend Documentation

## Overview

The frontend is built with Next.js 15 App Router, React 19, and TypeScript, providing a modern, performant, and type-safe development experience.

## Core Technologies

- **Next.js 15.3.5**: Framework with App Router
- **React 19**: UI library
- **TypeScript**: Type safety
- **Tailwind CSS v4**: Utility-first styling
- **Radix UI**: Headless component primitives
- **TanStack Query (React Query)**: Server state management
- **React Hook Form**: Form handling
- **Zod**: Schema validation

## Component Architecture

### Component Types

#### Server Components (Default)
```tsx
// app/(protected)/dashboard/page.tsx
export default async function DashboardPage() {
  // Can directly fetch data
  const data = await fetchDashboardData();
  
  return (
    <div>
      <DashboardContent data={data} />
    </div>
  );
}
```

#### Client Components with Page Metadata
```tsx
"use client";

import { usePageConfig } from "@/hooks/use-page-config";

// app/(protected)/dashboard/page.tsx
export default function DashboardPage() {
  const { user } = useUser();
  
  // Configure page metadata - handled automatically by layout
  usePageConfig(
    `Welcome, ${user?.firstName}!`,
    "Here's your account overview"
  );
  
  return <DashboardContent />;
}
```

#### Interactive Components
```tsx
"use client";

// components/interactive-feature.tsx
export function InteractiveFeature() {
  const [state, setState] = useState();
  
  return (
    <div onClick={() => setState(...)}>
      {/* Interactive content */}
    </div>
  );
}
```

### Component Organization

```
components/
├── ui/                 # Base UI components
│   ├── button.tsx     # Radix + Tailwind
│   ├── dialog.tsx
│   ├── form.tsx
│   └── input.tsx
├── app/               # Application components
│   ├── sidebar.tsx    # Navigation sidebar
│   ├── topbar.tsx     # Top navigation
│   ├── page-header.tsx # Automatic page headers
│   └── user-menu.tsx  # User dropdown
├── features/          # Feature-specific
│   ├── credits/       # Credit system
│   └── billing/       # Billing components
└── providers/         # Context providers
    └── query-provider.tsx

contexts/
└── page-metadata.tsx  # Page metadata context

hooks/
├── admin/             # Admin-specific hooks
│   ├── use-admin-credits.ts
│   ├── use-admin-users.ts
│   └── use-admin-invitations.ts
├── use-page-config.ts # Page metadata helper
├── use-credits.ts     # Credits hook
├── use-subscription.ts # Subscription status
├── use-dashboard.ts   # Dashboard data
└── use-storage.ts     # Storage management
```

## Styling System

### Design Tokens

The application uses CSS variables for theming:

```css
/* globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --primary: 240 5.9% 10%;
  --secondary: 240 4.8% 95.9%;
  --accent: 240 4.8% 95.9%;
  --destructive: 0 84.2% 60.2%;
  --border: 240 5.9% 90%;
  --ring: 240 10% 3.9%;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... dark theme values */
}
```

### Glass Morphism Effects

```css
.glass-panel {
  backdrop-filter: blur(16px);
  background: rgba(var(--card), 0.3);
  border: 1px solid rgba(var(--border), 0.4);
}
```

### Tailwind Configuration

```ts
// tailwind.config.ts
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // ... mapped CSS variables
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

## State Management

### Local State

```tsx
// Component state
const [isOpen, setIsOpen] = useState(false);

// Complex local state with useReducer
const [state, dispatch] = useReducer(reducer, initialState);
```

### Server State with TanStack Query

```tsx
// lib/api-client.ts - Centralized HTTP client
import { api } from '@/lib/api-client';

export async function apiClient<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;

    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error || `HTTP ${response.status}`;
    } catch {
      errorMessage = errorText || `HTTP ${response.status}`;
    }

    throw new ApiError(errorMessage, response.status, response);
  }

  return response.json();
}

## Data Fetching

- Prefer Server Components for initial data loading.
- Use TanStack Query for client-side fetches and cache management.
- All HTTP requests must go through `@/lib/api-client`.
- Never import or use `@/lib/db` (Prisma) from Client Components or any client-side code. Query on the server (Server Components, API routes, or Server Actions) and pass data to clients via props or custom hooks that call APIs.

// API convenience methods
export const api = {
  get: <T = any>(url: string, options?: RequestInit) =>
    apiClient<T>(url, { ...options, method: 'GET' }),
  post: <T = any>(url: string, data?: any, options?: RequestInit) =>
    apiClient<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  // ... put, patch, delete methods
};
```

```tsx
// hooks/use-credits.ts - Query hook with API client
import { api } from '@/lib/api-client';

export function useCredits() {
  return useQuery({
    queryKey: ['credits'],
    queryFn: () => api.get('/api/credits/me'),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Usage in component
function CreditDisplay() {
  const { data, isLoading, error } = useCredits();

  if (isLoading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return <div>{data.creditsRemaining} credits</div>;
}
```

### Mutation Hooks

```tsx
// hooks/use-admin-users.ts - Mutation with optimistic updates
export function useUpdateUserCredits() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ userId, credits }: { userId: string; credits: number }) =>
      api.put(`/api/admin/users/${userId}/credits`, { credits }),
    onSuccess: (data, variables) => {
      toast({
        title: "Credits updated",
        description: `New balance: ${variables.credits}`
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: "Error updating credits",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}
```

### Form State

```tsx
// Using React Hook Form with Zod
const formSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

function ProfileForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      name: '',
    },
  });
  
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    // Handle submission
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
```

## Routing

### File-based Routing

```
app/
├── (public)/
│   ├── page.tsx           # /
│   ├── sign-in/
│   │   └── [[...sign-in]]/
│   │       └── page.tsx   # /sign-in
│   └── layout.tsx         # Public layout
├── (protected)/
│   ├── dashboard/
│   │   └── page.tsx       # /dashboard
│   ├── billing/
│   │   └── page.tsx       # /billing
│   ├── profile/
│   │   └── [[...rest]]/
│   │       └── page.tsx   # /profile
│   └── layout.tsx         # Protected layout (with PageMetadata)
└── layout.tsx             # Root layout
```

### Page Metadata in Protected Routes

All protected routes automatically get breadcrumbs and headers through the PageMetadata system:

```tsx
// app/(protected)/billing/page.tsx
"use client";

import { usePageConfig } from "@/hooks/use-page-config";

export default function BillingPage() {
  usePageConfig({
    title: "Billing & Subscription",
    description: "Manage your credits and plan",
    breadcrumbs: [
      { label: "Home", href: "/dashboard" },
      { label: "Billing" }
    ]
  });
  
  return <BillingContent />;
}
```

The layout automatically renders:
- Breadcrumb navigation
- Page title (h1)
- Page description
- All managed centrally through context

### Navigation

```tsx
// Programmatic navigation
import { useRouter } from 'next/navigation';

function Component() {
  const router = useRouter();
  
  const handleClick = () => {
    router.push('/dashboard');
  };
  
  return <button onClick={handleClick}>Go to Dashboard</button>;
}

// Link component
import Link from 'next/link';

<Link href="/dashboard">Dashboard</Link>
```

## Data Fetching

### Server Components

```tsx
// Direct database access
async function Page() {
  const data = await db.user.findMany();
  return <UserList users={data} />;
}
```

### Client Components with TanStack Query

```tsx
// Use custom hooks - NEVER direct fetch in components
import { useAdminUsers } from '@/hooks/admin/use-admin-users';

function UsersList() {
  const { data, isLoading, error } = useAdminUsers({
    page: 1,
    pageSize: 50,
    includeUsageCount: true
  });

  if (isLoading) return <UserListSkeleton />;
  if (error) return <ErrorAlert message={error.message} />;

  return (
    <div>
      {data.users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

### Data Mutations

```tsx
// Using custom mutation hooks
import { useUpdateUserCredits } from '@/hooks/admin/use-admin-users';

function UserCreditForm({ userId }: { userId: string }) {
  const updateCredits = useUpdateUserCredits();

  const handleSubmit = (credits: number) => {
    updateCredits.mutate({ userId, credits });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="number" name="credits" />
      <button
        type="submit"
        disabled={updateCredits.isPending}
      >
        {updateCredits.isPending ? 'Updating...' : 'Update Credits'}
      </button>
    </form>
  );
}
```

### Query Key Patterns

```tsx
// Structured query keys for easy cache management
const queryKeys = {
  admin: ['admin'] as const,
  users: () => [...queryKeys.admin, 'users'] as const,
  usersList: (params: UsersParams) => [...queryKeys.users(), params] as const,
  credits: () => [...queryKeys.admin, 'credits'] as const,
  invitations: () => [...queryKeys.admin, 'invitations'] as const,
};

// Usage in hooks
export function useAdminUsers(params: UsersParams) {
  return useQuery({
    queryKey: queryKeys.usersList(params),
    queryFn: () => api.get(`/api/admin/users?${searchParams}`),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
```

## Performance Optimization

### Code Splitting

```tsx
// Dynamic imports
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Skeleton />,
  ssr: false, // Client-side only
});
```

### Image Optimization

```tsx
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority // Load eagerly for LCP
/>
```

### Font Optimization

```tsx
// app/layout.tsx
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});
```

## Accessibility

### Semantic HTML

```tsx
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</nav>
```

### ARIA Attributes

```tsx
<button
  aria-label="Close dialog"
  aria-expanded={isOpen}
  aria-controls="dialog-content"
>
  <X className="h-4 w-4" />
</button>
```

### Keyboard Navigation

```tsx
// Radix UI components handle keyboard navigation
<DropdownMenu>
  <DropdownMenuTrigger>Open</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## Error Handling

### Error Boundaries

```tsx
// app/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### Loading States

```tsx
// app/loading.tsx
export default function Loading() {
  return <Skeleton className="w-full h-96" />;
}
```

## Testing Approach

### Component Testing

```tsx
// __tests__/button.test.tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

test('renders button with text', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});
```

### Integration Testing

```tsx
// __tests__/dashboard.test.tsx
test('displays user data after loading', async () => {
  render(<Dashboard />);
  
  await waitFor(() => {
    expect(screen.getByText('User Name')).toBeInTheDocument();
  });
});
```

## Best Practices

### 1. Component Composition
- Keep components small and focused
- Use composition over inheritance
- Extract reusable logic into hooks

### 2. Performance
- Use Server Components by default
- Implement proper loading states
- Optimize images and fonts
- Use React.memo for expensive components

### 3. Type Safety
- Define proper TypeScript types
- Use Zod for runtime validation
- Avoid `any` types

### 4. Accessibility
- Use semantic HTML
- Implement proper ARIA labels
- Ensure keyboard navigation
- Test with screen readers

### 5. Code Organization
- Group related components
- Co-locate styles with components
- Keep business logic in separate files
- Use barrel exports for cleaner imports

### 6. TanStack Query Best Practices

#### Hook Creation
- **Always use custom hooks** - Never call `useQuery` or `useMutation` directly in components
- **Use the API client** - All HTTP requests must go through `@/lib/api-client`
- **Proper error handling** - Let the API client handle HTTP errors automatically
- **Type safety** - Define proper interfaces for request/response data

#### Query Key Management
```tsx
// ✅ Good - Structured and consistent
queryKey: ['admin', 'users', { page: 1, search: 'john' }]

// ❌ Bad - Unstructured
queryKey: ['admin-users-page-1-search-john']
```

#### Cache Configuration
```tsx
// Short-lived data (real-time updates)
staleTime: 30_000,     // 30 seconds
gcTime: 2 * 60_000,    // 2 minutes

// Settings/configuration data
staleTime: 5 * 60_000, // 5 minutes
gcTime: 10 * 60_000,   // 10 minutes

// Static/rarely changing data
staleTime: 30 * 60_000, // 30 minutes
gcTime: 60 * 60_000,    // 1 hour
```

#### Mutation Patterns
- **Optimistic updates** for better UX on fast operations
- **Proper invalidation** after successful mutations
- **Error rollback** when optimistic updates fail
- **Toast notifications** for user feedback

#### Never Do This
```tsx
// ❌ NEVER use fetch directly in components
const [data, setData] = useState();
useEffect(() => {
  fetch('/api/users').then(res => res.json()).then(setData);
}, []);

// ❌ NEVER call TanStack Query hooks directly
const { data } = useQuery({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then(res => res.json()),
});
```

#### Always Do This
```tsx
// ✅ Use custom hooks with API client
const { data, isLoading, error } = useAdminUsers({
  page: 1,
  pageSize: 50
});

// ✅ Proper mutation handling
const updateUser = useUpdateUser();
const handleUpdate = () => {
  updateUser.mutate({ id: 1, name: 'New Name' });
};
```
