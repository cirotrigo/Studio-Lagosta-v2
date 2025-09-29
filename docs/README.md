# Documentation Index

Welcome to the Next.js SaaS Template documentation. This comprehensive guide will help you understand, develop, and maintain this production-ready SaaS application.

## Quick Start

If you're new to this project, start here:

1. **[Architecture Overview](./architecture.md)** - Understand the system design and architectural decisions
2. **[Development Guidelines](./development-guidelines.md)** - Learn the coding standards and best practices
3. **[Authentication](./authentication.md)** - Set up and understand the Clerk authentication system
4. **[Database](./database.md)** - Configure and work with the PostgreSQL database and Prisma ORM

## Documentation Structure

### Core Architecture
- **[Architecture](./architecture.md)** - System architecture, layers, and design principles
- **[Database](./database.md)** - Schema design, Prisma operations, and data management
- **[Authentication](./authentication.md)** - Clerk integration, security patterns, and user management
- **[Page Metadata System](./page-metadata-system.md)** - Centralized page headers and breadcrumbs management

### Development Guides
- **[Frontend](./frontend.md)** - React components, Next.js patterns, and client-side development
- **[Backend](./backend.md)** - API routes, server-side logic, and data processing
- **[Components](./components.md)** - UI component library, patterns, and usage guidelines
- **[API](./api.md)** - Complete API reference with endpoints and examples
- **[AI Chat](./ai-chat.md)** - Vercel AI SDK integration, providers, and chat UI
  - Credits: 1 credit per text chat, 5 per image request, enforced in API routes

### Best Practices
- **[Development Guidelines](./development-guidelines.md)** - Code standards, testing, and workflow practices

## Technology Stack

This SaaS template is built with modern technologies:

### Core Framework
- **Next.js 15.3.5** - Full-stack React framework with App Router
- **React 19** - UI library with latest features
- **TypeScript** - Type-safe development

### Authentication & Database
- **Clerk** - Complete authentication and user management
- **PostgreSQL** - Relational database
- **Prisma ORM** - Type-safe database client

### UI & Styling
- **Tailwind CSS v4** - Utility-first CSS framework
- **Radix UI** - Headless component primitives
- **Lucide React** - Icon library

### State Management
- **React Query** - Server state management and caching
- **React Hook Form** - Form handling and validation
- **Zod** - Runtime validation

## Key Features

### 🔐 Authentication
- Complete user authentication with Clerk
- Social logins and email/password
- Protected routes and middleware
- User profile management

### 💾 Database Management
- PostgreSQL with Prisma ORM
- Complex relational schema
- Type-safe database operations
- Migration management

### 🤖 AI Features
- Configurable AI chat with provider selection
- Image generation via OpenRouter
- Extensible provider/model support

### 💳 Credit System
- Built-in credit tracking
- Usage analytics
- Billing integration ready
- Operation-based credit deduction

### 🎨 Modern UI/UX
- Glass morphism design
- Responsive mobile-first design
- Dark/light theme support
- Accessible components

## Getting Started

### Prerequisites
- Node.js 18 or higher
- PostgreSQL database
- Clerk account for authentication

### Installation

1. **Clone and install dependencies:**
```bash
git clone <your-repo-url>
cd nextjs-saas-template
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

3. **Set up the database:**
```bash
npm run db:push
```

4. **Start the development server:**
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your application.

## Development Workflow

### Daily Development
```bash
npm run dev          # Start development server
npm run typecheck    # Check TypeScript types
npm run lint         # Run ESLint
```

### Database Operations
```bash
npm run db:push      # Push schema changes
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

### Production Build
```bash
npm run build        # Build for production
npm run start        # Start production server
```

## Project Structure

```
nextjs-saas-template/
├── docs/                    # Documentation (this folder)
├── prisma/                  # Database schema and migrations
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (public)/       # Public routes
│   │   ├── (protected)/    # Protected routes
│   │   ├── api/           # API endpoints
│   │   └── layout.tsx     # Root layout
│   ├── components/        # React components
│   │   ├── ui/           # Base UI components
│   │   ├── app/          # Application components
│   │   └── providers/    # Context providers
│   ├── contexts/         # React contexts
│   │   └── page-metadata.tsx # Page metadata system
│   ├── lib/              # Utilities and configurations
│   ├── hooks/            # Custom React hooks
│   └── types/            # TypeScript type definitions
├── public/               # Static assets
├── CLAUDE.md            # Claude Code assistant guide
├── package.json         # Dependencies and scripts
└── README.md           # Project overview
```

## Common Tasks

### Adding a New Feature

1. **Plan the feature:**
   - Define requirements and scope
   - Design database schema changes
   - Plan API endpoints needed

2. **Implement backend:**
   - Update Prisma schema if needed
   - Create API routes
   - Add authentication and validation

3. **Implement frontend:**
   - Create UI components
   - Add forms and validation
   - Implement state management

4. **Test and deploy:**
   - Write unit and integration tests
   - Run type checking and linting
   - Deploy and monitor

### Database Schema Changes

1. **Update schema:**
```bash
# Edit prisma/schema.prisma
npm run db:push  # For development
# or
npm run db:migrate  # For production
```

2. **Generate types:**
```bash
npx prisma generate
```

### Adding New API Endpoints

1. **Create route file:**
```typescript
// src/app/api/your-endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Your logic here
  return NextResponse.json({ data: result });
}
```

2. **Add validation:**
```typescript
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const validatedData = schema.parse(await request.json());
```

3. **Test the endpoint:**
```typescript
// __tests__/api/your-endpoint.test.ts
import { GET } from '@/app/api/your-endpoint/route';
// Add your tests
```

## Troubleshooting

### Common Issues

#### Database Connection Errors
- Check your `DATABASE_URL` environment variable
- Ensure PostgreSQL is running
- Verify database credentials and permissions

#### Authentication Issues
- Verify Clerk environment variables
- Check middleware configuration
- Ensure public/protected routes are properly configured

#### Build Errors
- Run `npm run typecheck` to identify TypeScript issues
- Check for missing dependencies
- Verify environment variables are set

#### Performance Issues
- Use React DevTools to identify rendering issues
- Check database query performance with Prisma Studio
- Monitor API response times

### Getting Help

1. **Check the documentation** - Most issues are covered in these docs
2. **Review error messages** - They often point to the exact problem
3. **Use debugging tools** - Next.js DevTools, React DevTools, and browser developer tools
4. **Check logs** - Both client and server console logs

## Contributing

### Code Standards
- Follow the patterns outlined in [Development Guidelines](./development-guidelines.md)
- Write tests for new features
- Update documentation when adding features
- Use TypeScript for type safety

### Pull Request Process
1. Create a feature branch
2. Implement your changes
3. Add/update tests
4. Update documentation
5. Submit pull request with clear description

### Testing
```bash
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

## Deployment

### Environment Variables
Ensure all required environment variables are set in your deployment platform:

```env
# Required for all environments
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Production specific
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Deployment Platforms
This template works with:
- **Vercel** (recommended for Next.js)
- **Netlify**
- **Railway**
- **Heroku**
- **DigitalOcean App Platform**

### Database Hosting
Recommended PostgreSQL hosting providers:
- **Supabase** (includes auth, but we use Clerk)
- **PlanetScale** (MySQL alternative)
- **Railway** (PostgreSQL)
- **Heroku Postgres**
- **Amazon RDS**

## Performance and Monitoring

### Performance Best Practices
- Use Server Components by default
- Implement proper loading states
- Optimize database queries
- Use React Query for caching
- Optimize images with Next.js Image

### Monitoring
- Set up error tracking (Sentry, Bugsnag)
- Monitor API performance
- Track user analytics
- Monitor database performance

## Security

### Security Checklist
- ✅ Authentication with Clerk
- ✅ Protected API routes
- ✅ Input validation with Zod
- ✅ SQL injection prevention with Prisma
- ✅ XSS protection with React
- ✅ Environment variable security
- ✅ HTTPS in production

### Security Best Practices
- Never commit secrets to version control
- Use environment variables for all configuration
- Validate all user input
- Implement proper error handling
- Keep dependencies updated
- Regular security audits

## Maintenance

### Regular Tasks
- **Dependencies:** Update npm packages regularly
- **Database:** Monitor and optimize query performance
- **Security:** Keep dependencies updated for security patches
- **Monitoring:** Check error rates and performance metrics
- **Backups:** Ensure database backups are working

### Updating Dependencies
```bash
npm update            # Update all dependencies
npm audit             # Check for security vulnerabilities
npm audit fix         # Fix automatically fixable issues
```

---

## Next Steps

1. **Read the Architecture Overview** to understand the system design
2. **Set up your development environment** following the Getting Started guide
3. **Explore the codebase** using the structure outlined in each documentation section
4. **Start building your features** following the development guidelines

Happy coding! 🚀
