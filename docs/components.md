# Components Documentation

## Overview

This application uses a component-driven architecture with Radix UI primitives and custom components built with Tailwind CSS. Components are organized by purpose and reusability.

## Component Hierarchy

```
components/
├── ui/              # Base UI components (Radix + Tailwind)
├── app/             # Application-specific components
│   ├── page-header.tsx  # Automatic page headers
│   ├── sidebar.tsx      # Navigation sidebar
│   └── topbar.tsx       # Top navigation
├── features/        # Feature-specific components
└── providers/       # Context providers

contexts/
└── page-metadata.tsx # Page metadata management

hooks/
└── use-page-config.ts # Page configuration helper
```

## UI Components (`/components/ui/`)

These are the foundational components built with Radix UI primitives and styled with Tailwind CSS. They follow the shadcn/ui design system.

### Button Component

```tsx
// components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
```

**Usage:**
```tsx
import { Button } from "@/components/ui/button";

<Button variant="default" size="lg">
  Primary Button
</Button>

<Button variant="outline" size="sm">
  Secondary Button
</Button>

<Button variant="ghost" size="icon">
  <Plus className="h-4 w-4" />
</Button>
```

### Form Components

```tsx
// components/ui/form.tsx - Using React Hook Form context
import { useFormContext } from "react-hook-form";

const FormField = ({
  name,
  render,
}: {
  name: string;
  render: ({ field }: { field: any }) => React.ReactNode;
}) => {
  const { control } = useFormContext();
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormItem>
          {render({ field })}
          {fieldState.error && (
            <FormMessage>{fieldState.error.message}</FormMessage>
          )}
        </FormItem>
      )}
    />
  );
};
```

**Form Usage Example:**
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function LoginForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

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
                <Input placeholder="Enter email" {...field} />
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

### Dialog Component

```tsx
// components/ui/dialog.tsx
import * as DialogPrimitive from "@radix-ui/react-dialog";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out",
      className
    )}
    {...props}
  />
));

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
```

**Dialog Usage:**
```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirmation</DialogTitle>
      <DialogDescription>
        Are you sure you want to delete this item?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Application Components (`/components/app/`)

### Sidebar Component

```tsx
// components/app/sidebar.tsx
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Profile", href: "/profile", icon: User },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn(
      "border-r bg-card/30 backdrop-blur-xl transition-[width]",
      collapsed ? "w-[64px]" : "w-64"
    )}>
      <nav className="p-2">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2",
              pathname === item.href 
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent"
            )}
          >
            <item.icon className="h-4 w-4" />
            {!collapsed && <span>{item.name}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

### Topbar Component

```tsx
// components/app/topbar.tsx
interface TopbarProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

export function Topbar({ onToggleSidebar, sidebarCollapsed }: TopbarProps) {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className="md:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>
      
      <div className="flex-1" />
      
      <UserMenu />
      <ThemeToggle />
    </header>
  );
}
```

## Feature Components

### Credit System Components

```tsx
// components/credits/credit-status.tsx
export function CreditStatus() {
  const { data: credits, isLoading } = useCredits();
  
  if (isLoading) {
    return <Skeleton className="h-6 w-20" />;
  }

  return (
    <div className="flex items-center gap-2">
      <Coins className="h-4 w-4 text-yellow-500" />
      <span className="text-sm font-medium">
        {credits?.creditsRemaining || 0} credits
      </span>
    </div>
  );
}
```

### User Menu Component

```tsx
// components/app/user-menu.tsx
export function UserMenu() {
  const { user } = useUser();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.imageUrl} alt={user?.fullName || ''} />
            <AvatarFallback>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/billing')}>
          <CreditCard className="mr-2 h-4 w-4" />
          Billing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <SignOutButton>
            <button className="flex w-full items-center">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </button>
          </SignOutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Provider Components

### Query Provider

```tsx
// components/providers/query-provider.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute
          retry: 3,
        },
      },
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Theme Provider

```tsx
// components/providers/theme-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
```

## Component Patterns

### Compound Components

```tsx
// components/ui/card.tsx
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-xl border bg-card text-card-foreground shadow", className)}
    {...props}
  />
));

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));

// Usage
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content</p>
  </CardContent>
</Card>
```

### Render Props Pattern

```tsx
// components/data-fetcher.tsx
interface DataFetcherProps<T> {
  url: string;
  children: (data: {
    data: T | null;
    loading: boolean;
    error: Error | null;
  }) => React.ReactNode;
}

export function DataFetcher<T>({ url, children }: DataFetcherProps<T>) {
  const { data, isLoading, error } = useQuery({
    queryKey: [url],
    queryFn: () => fetch(url).then(res => res.json()),
  });

  return children({ data, loading: isLoading, error });
}

// Usage
<DataFetcher<User[]> url="/api/users">
  {({ data, loading, error }) => {
    if (loading) return <Loading />;
    if (error) return <Error error={error} />;
    return <UserList users={data} />;
  }}
</DataFetcher>
```

### Higher-Order Components (HOCs)

```tsx
// components/hocs/with-auth.tsx
export function withAuth<T extends Record<string, any>>(
  WrappedComponent: React.ComponentType<T>
) {
  return function AuthenticatedComponent(props: T) {
    const { isLoaded, isSignedIn } = useAuth();
    
    if (!isLoaded) {
      return <Loading />;
    }
    
    if (!isSignedIn) {
      redirect('/sign-in');
    }
    
    return <WrappedComponent {...props} />;
  };
}

// Usage
const ProtectedPage = withAuth(DashboardPage);
```

## Styling Guidelines

### CSS-in-JS with Tailwind

```tsx
// Use cn utility for conditional classes
const Button = ({ variant, size, className, ...props }) => (
  <button
    className={cn(
      "base-button-classes",
      {
        "variant-primary": variant === "primary",
        "variant-secondary": variant === "secondary",
      },
      className
    )}
    {...props}
  />
);
```

### Custom CSS Variables

```css
/* globals.css */
.glass-panel {
  backdrop-filter: blur(16px);
  background: rgba(var(--card), 0.3);
  border: 1px solid rgba(var(--border), 0.4);
}

.noise-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.03;
  z-index: -1;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E...");
}
```

## Testing Components

### Unit Testing with Jest and React Testing Library

```tsx
// __tests__/components/button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant classes correctly', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });
});
```

### Integration Testing

```tsx
// __tests__/components/user-menu.test.tsx
import { render, screen } from '@testing-library/react';
import { UserMenu } from '@/components/app/user-menu';
import { useUser } from '@clerk/nextjs';

jest.mock('@clerk/nextjs');

describe('UserMenu', () => {
  it('displays user information', () => {
    (useUser as jest.Mock).mockReturnValue({
      user: {
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/avatar.jpg',
      },
    });

    render(<UserMenu />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
```

## Best Practices

### 1. Component Design
- Keep components small and focused
- Use TypeScript for prop types
- Follow single responsibility principle
- Implement proper error boundaries

### 2. Performance
- Use React.memo for expensive components
- Implement proper key props for lists
- Use lazy loading for heavy components
- Optimize re-renders with useCallback/useMemo

### 3. Accessibility
- Use semantic HTML elements
- Implement proper ARIA labels
- Ensure keyboard navigation
- Test with screen readers

### 4. Reusability
- Create generic, composable components
- Use render props or children for flexibility
- Implement consistent prop interfaces
- Document component APIs

### 5. State Management
- Lift state up when needed
- Use local state by default
- Implement proper loading states
- Handle error states gracefully