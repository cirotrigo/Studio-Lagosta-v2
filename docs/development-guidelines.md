# Development Guidelines

## Code Standards

### TypeScript Configuration

#### Type Safety Rules
- Use TypeScript for all new code
- Avoid `any` type - prefer `unknown` or specific types
- Use strict null checks
- Define interfaces for all data structures
- Use generics for reusable components

```tsx
// ✅ Good
interface User {
  id: string;
  email: string;
  name?: string;
}

function getUser(id: string): Promise<User | null> {
  return fetchUser(id);
}

// ❌ Bad
function getUser(id: any): any {
  return fetchUser(id);
}
```

#### Type Definitions

```tsx
// types/api.ts
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// Usage
const response: ApiResponse<User> = await fetchUser(id);
```

### File Naming Conventions

```
// Components (PascalCase)
Button.tsx
UserProfile.tsx
DashboardLayout.tsx

// Pages (lowercase with hyphens)
sign-in/page.tsx
user-profile/page.tsx

// Utilities (camelCase)
authUtils.ts
dateHelpers.ts
apiClient.ts

// Types (camelCase)
apiTypes.ts
userTypes.ts

// Constants (UPPER_SNAKE_CASE)
API_ROUTES.ts
APP_CONFIG.ts
```

### Import Organization

```tsx
// 1. Node modules
import React from 'react';
import { NextResponse } from 'next/server';

// 2. Internal packages/utilities
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';

// 3. Contexts and Hooks
import { usePageConfig } from '@/hooks/use-page-config';
import { usePageMetadata } from '@/contexts/page-metadata';

// 4. Components
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/app/user-menu';

// 5. Types
import type { User } from '@/types/user';

// 6. Relative imports
import './styles.css';
```

## Component Guidelines

### Page Components and Metadata

All protected pages should use the Page Metadata System for consistent headers and breadcrumbs:

```tsx
"use client";

import { usePageConfig } from "@/hooks/use-page-config";

export default function MyPage() {
  // Simple usage
  usePageConfig("Page Title", "Page description");
  
  // With custom breadcrumbs
  usePageConfig("Title", "Description", [
    { label: "Home", href: "/dashboard" },
    { label: "Current Page" }
  ]);
  
  // Full control
  usePageConfig({
    title: "Dynamic Title",
    description: "Dynamic description",
    breadcrumbs: [...],
    showBreadcrumbs: true
  });
  
  return <YourContent />;
}
```

**Important:** Never manually add breadcrumbs or page headers in protected pages. The layout handles this automatically through the PageMetadata context.

### Component Structure

```tsx
// 1. Imports (organized as above)
import React from 'react';
import { cn } from '@/lib/utils';

// 2. Types/Interfaces
interface ComponentProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
}

// 3. Component definition
export function Component({ title, children, className }: ComponentProps) {
  // 4. Hooks (top of component)
  const [state, setState] = useState();
  const { data } = useQuery();
  
  // 5. Computed values
  const computedValue = useMemo(() => {}, []);
  
  // 6. Event handlers
  const handleClick = useCallback(() => {}, []);
  
  // 7. Effects
  useEffect(() => {}, []);
  
  // 8. Render
  return (
    <div className={cn('base-styles', className)}>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
```

### Prop Guidelines

```tsx
// ✅ Good - Specific prop types
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

// ❌ Bad - Too generic
interface ButtonProps {
  [key: string]: any;
}
```

### State Management Patterns

## Data Access (Important)

- Never import the Prisma client (`@/lib/db`) or query the database directly from Client Components or any client-side code.
- Server Components must NOT query Prisma directly. Instead, call functions from the query layer under `src/lib/queries/*`.
  - Keep DB access centralized for reuse and consistency. Add a new file under `src/lib/queries/` per domain (e.g., `plans.ts`).
- API routes under `src/app/api/*` and Server Actions may use Prisma directly or reuse `src/lib/queries/*` functions.
- Client components must receive data via props from a Server Component, or use custom hooks built on TanStack Query that call API routes through `@/lib/api-client`.

```tsx
// Local state
const [isOpen, setIsOpen] = useState(false);

// Complex local state
const [state, setState] = useReducer(reducer, initialState);

// Server state
const { data, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});

// Form state
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: {},
});
```

## API Development Guidelines

### Route Structure

```ts
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

// 1. Schema definitions
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

// 2. Route handlers
export async function POST(request: NextRequest) {
  try {
    // 3. Authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // 4. Input validation
    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    // 5. Business logic
    const result = await createUser(validatedData);

    // 6. Response
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### Error Handling

```ts
// lib/api-errors.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { 
        error: error.message, 
        code: error.code,
        success: false 
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: error.issues,
        success: false
      },
      { status: 400 }
    );
  }

  console.error('Unexpected error:', error);
  return NextResponse.json(
    { error: 'Internal server error', success: false },
    { status: 500 }
  );
}
```

## Database Guidelines

### Query Patterns

```ts
// ✅ Good - Specific selects
const users = await db.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
  },
  where: {
    active: true,
  },
  orderBy: {
    createdAt: 'desc',
  },
});

// ✅ Good - Include related data
const user = await db.user.findUnique({
  where: { id: userId },
  include: {
    // Removed projects in this edition
    creditBalance: true,
  },
});

// ❌ Bad - Select all fields unnecessarily
const users = await db.user.findMany();
```

### Transaction Guidelines

```ts
// Use transactions for related operations
const result = await db.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { name: 'John', email: 'john@example.com' },
  });

  await tx.creditBalance.create({
    data: {
      userId: user.id,
      creditsRemaining: 100,
    },
  });

  return user;
});
```

## Security Guidelines

### Input Validation

```ts
// Always validate input with Zod
const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  preferences: z.object({
    theme: z.enum(['light', 'dark']),
    notifications: z.boolean(),
  }).optional(),
});

// Sanitize string inputs
const sanitizedInput = input.trim().toLowerCase();
```

### Authentication Patterns

```ts
// API route authentication
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUserFromClerkId(userId);
  // ... rest of logic
}

// Resource ownership verification
export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  // Verify resource ownership as needed
  // ... update logic
}
```

### Data Protection

```ts
// Never expose sensitive data
const publicUserData = {
  id: user.id,
  name: user.name,
  email: user.email,
  // Don't include: clerkId, internalId, etc.
};

// Use environment variables for secrets
const apiKey = process.env.EXTERNAL_API_KEY;
if (!apiKey) {
  throw new Error('Missing required API key');
}
```

## Testing Guidelines

### Unit Testing

```tsx
// Component tests
describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### API Testing

```ts
// API route tests
describe('/api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates user successfully', async () => {
    mockAuth({ userId: 'user_123' });
    mockDb.user.create.mockResolvedValue(mockUser);

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe('Test User');
  });

  it('returns 401 when unauthorized', async () => {
    mockAuth({ userId: null });

    const response = await POST(mockRequest);
    
    expect(response.status).toBe(401);
  });
});
```

### Integration Testing

```tsx
// E2E-style integration tests
describe('User Dashboard', () => {
  it('displays user data after loading', async () => {
    mockApiResponse('/api/users/me', mockUserData);
    mockApiResponse('/api/credits/me', mockCreditsData);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Welcome, John')).toBeInTheDocument();
      expect(screen.getByText('100 credits')).toBeInTheDocument();
    });
  });
});
```

## Performance Guidelines

### React Optimization

```tsx
// Use React.memo for expensive components
export const ExpensiveComponent = React.memo(({ data }) => {
  const processedData = useMemo(() => 
    expensiveCalculation(data), 
    [data]
  );

  return <div>{processedData}</div>;
});

// Use useCallback for event handlers
const Button = ({ onClick, children }) => {
  const handleClick = useCallback((e) => {
    e.preventDefault();
    onClick?.(e);
  }, [onClick]);

  return <button onClick={handleClick}>{children}</button>;
};
```

### Database Optimization

```ts
// Use pagination for large datasets
const getUsers = async (page = 1, limit = 20) => {
  return db.user.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
};

// Use cursor-based pagination for better performance
const getUsersWithCursor = async (cursor?: string, limit = 20) => {
  return db.user.findMany({
    take: limit,
    ...(cursor && { cursor: { id: cursor } }),
    orderBy: { id: 'asc' },
  });
};
```

### Bundle Optimization

```tsx
// Use dynamic imports for heavy components
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});

// Use React.lazy for code splitting
const LazyComponent = React.lazy(() => import('./LazyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <LazyComponent />
    </Suspense>
  );
}
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
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
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
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
    </div>
  );
}
```

### Not Found Pages

```tsx
// app/not-found.tsx
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2>Page Not Found</h2>
      <p>Could not find the requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  );
}
```

## Git Workflow

### Commit Messages

```
feat: add user authentication
fix: resolve database connection issue
docs: update API documentation
style: fix linting errors
refactor: extract user service logic
test: add unit tests for Button component
chore: update dependencies
```

### Branch Naming

```
feature/user-authentication
fix/database-connection
hotfix/security-vulnerability
release/v1.2.0
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
```

## Code Review Guidelines

### What to Look For

1. **Functionality**: Does the code work as intended?
2. **Security**: Are there any security vulnerabilities?
3. **Performance**: Are there any performance issues?
4. **Readability**: Is the code easy to understand?
5. **Testing**: Are there adequate tests?
6. **Documentation**: Is the code properly documented?

### Review Comments

```
// ✅ Good feedback
"Consider using useMemo here to avoid recalculating on every render"
"This could be extracted into a custom hook for better reusability"

// ❌ Poor feedback
"This is wrong"
"Fix this"
```

## Environment Management

### Environment Variables

```env
# Required for all environments
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Development only
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production only
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Configuration Management

```ts
// lib/config.ts
const config = {
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'SaaS Template',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  db: {
    url: process.env.DATABASE_URL!,
  },
  clerk: {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
    secretKey: process.env.CLERK_SECRET_KEY!,
  },
};

// Validate required env vars
if (!config.db.url) {
  throw new Error('DATABASE_URL is required');
}

export default config;
```
