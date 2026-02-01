---
status: filled
generated: 2026-01-31
---

# Tooling & Productivity Guide

This document covers the tools, scripts, and configurations that keep development efficient.

## Required Tooling

### Runtime & Package Manager

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | JavaScript runtime |
| npm | 9+ | Package management |

### Database

| Tool | Purpose |
|------|---------|
| PostgreSQL | Primary database |
| Prisma CLI | Database management |

### Development

| Tool | Purpose |
|------|---------|
| VS Code | Recommended IDE |
| Git | Version control |

## Development Commands

### Quick Reference

```bash
# Development
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint
npm run typecheck    # TypeScript checking

# Database
npm run db:push      # Push schema changes
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma GUI
npm run db:reset     # Reset database (destructive)
```

### Package Scripts (package.json)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset",
    "db:studio": "prisma studio"
  }
}
```

## IDE Setup (VS Code)

### Recommended Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

### Workspace Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "\"([^\"]*)\""]
  ]
}
```

## Automation

### Pre-commit Workflow

Before committing, run:

```bash
npm run typecheck && npm run lint && npm run build
```

### Git Hooks (optional)

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
npm run typecheck
npm run lint
```

## Local Development

### Starting Fresh

```bash
# Clone and setup
git clone <repo>
cd Studio-Lagosta-v2
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Initialize database
npm run db:push

# Start development
npm run dev
```

### Database Management

```bash
# View/edit data
npm run db:studio

# Reset for clean slate
npm run db:reset

# After schema changes
npm run db:push
```

### Webhook Testing

```bash
# Local webhook testing
./test-webhook-local.sh

# External webhook testing (expose local server)
ngrok http 3000
```

## Productivity Tips

### Terminal Aliases

Add to `.bashrc` or `.zshrc`:

```bash
alias dev="npm run dev"
alias build="npm run build"
alias lint="npm run lint"
alias tc="npm run typecheck"
alias studio="npm run db:studio"
```

### VS Code Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+P` | Command palette |
| `Cmd+P` | Quick file open |
| `Cmd+Shift+F` | Search in files |
| `F12` | Go to definition |
| `Cmd+.` | Quick fix suggestions |

### Path Aliases

The project uses `@/` for imports:

```typescript
// Instead of
import { Button } from '../../../components/ui/button';

// Use
import { Button } from '@/components/ui/button';
```

## Debugging

### Browser DevTools

- **Network tab**: Monitor API calls
- **Console**: Check for errors
- **React DevTools**: Inspect components
- **TanStack Query DevTools**: Monitor cache

### Server Logs

```bash
# Development logs appear in terminal
npm run dev

# Production logs in Vercel dashboard
```

### Database Inspection

```bash
# GUI interface
npm run db:studio

# Direct SQL (if needed)
npx prisma db execute --file query.sql
```

## Environment Variables

### Required Variables

```bash
# .env file
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
DATABASE_URL=postgresql://...
```

### Checking Environment

```bash
# Verify variables are set
echo $DATABASE_URL

# Check in app
console.log(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
```

## Common Tasks

### Adding a New Dependency

```bash
# Production dependency
npm install package-name

# Development dependency
npm install -D package-name
```

### Updating Dependencies

```bash
# Check outdated
npm outdated

# Update all
npm update

# Update specific package
npm install package-name@latest
```

### Running Prisma Migrations

```bash
# Development (auto-generates migration)
npm run db:migrate

# Production (applies pending migrations)
npx prisma migrate deploy
```
