# Documentation Index

Welcome to the Studio Lagosta knowledge base. This documentation provides comprehensive guidance for understanding and contributing to the project.

## Getting Started

New to the project? Start here:
1. [Project Overview](./project-overview.md) - What the project does and why
2. [Architecture](./architecture.md) - System design and structure
3. [Development Workflow](./development-workflow.md) - Daily development tasks

## Core Guides

| Document | Description |
|----------|-------------|
| [Project Overview](./project-overview.md) | Problem statement, capabilities, and tech stack |
| [Architecture](./architecture.md) | System design, layers, and integration points |
| [Development Workflow](./development-workflow.md) | Commands, patterns, and best practices |
| [Data Flow](./data-flow.md) | How data moves through the system |
| [Testing Strategy](./testing-strategy.md) | Testing approaches and tools |
| [Security](./security.md) | Authentication, authorization, and compliance |
| [Tooling](./tooling.md) | Development tools and productivity |
| [Glossary](./glossary.md) | Domain terms and definitions |

## Quick Reference

### Development Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run typecheck    # TypeScript type checking
npm run db:studio    # Open Prisma Studio
```

### Key Directories
```
src/
├── app/           # Next.js App Router (pages & API)
├── components/    # React components
├── hooks/         # TanStack Query hooks
├── lib/           # Business logic & utilities
└── types/         # TypeScript interfaces
```

### External Documentation
- [CLAUDE.md](../../CLAUDE.md) - Project conventions for AI assistants
- [README.md](../../README.md) - Main project README
- [Prisma Schema](../../prisma/schema.prisma) - Database model definitions

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL + Prisma
- **Auth**: Clerk
- **UI**: Radix UI + Tailwind CSS
- **Canvas**: Konva.js
- **State**: TanStack Query

## Related Resources

### Agent Playbooks
See [`.context/agents/`](../agents/) for AI agent configurations:
- `feature-developer.md` - New feature implementation
- `bug-fixer.md` - Bug fixing workflow
- `code-reviewer.md` - Code review guidelines

### Skills
See [`.context/skills/`](../skills/) for expertise modules available to agents.

## Contributing to Documentation

1. Update docs when making significant changes
2. Keep documentation concise and practical
3. Include code examples where helpful
4. Update this index when adding new documents
