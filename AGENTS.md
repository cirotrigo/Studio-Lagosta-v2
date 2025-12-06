# Agents Guide

This file is a navigation hub for agents working in this repository. It avoids duplicating content and points you to the authoritative docs and guides.

## Context7 MCP - Up-to-Date Documentation

**ALWAYS use Context7** when implementing code or consulting library documentation:
- Syntax and API changes beyond January 2025
- Latest best practices for Next.js 15, Clerk, Prisma, TanStack Query, Radix UI
- Version-specific setup and configuration
- Framework updates and migration guides

**Usage:** Prefix prompts with `use context7:` when requesting code generation or library documentation.

## Start Here
- [docs/README.md](docs/README.md) — Central documentation index: architecture, backend/frontend, API, auth, database, AI, workflows
- [agents/README.md](agents/README.md) — Agent guides index with checklists and PR deliverables (security, frontend, backend, database, planning, QA)

## Purpose & Scope
- Use this file to quickly find the right guide or reference.
- All detailed standards live under `docs/` and actionable playbooks under `agents/`.
- Scope: applies to the entire repository.

## Key References (authoritative)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Development Guidelines: [docs/development-guidelines.md](docs/development-guidelines.md)
- Frontend: [docs/frontend.md](docs/frontend.md), [docs/components.md](docs/components.md), [docs/page-metadata-system.md](docs/page-metadata-system.md)
- Backend & API: [docs/backend.md](docs/backend.md), [docs/api.md](docs/api.md)
- Authentication: [docs/authentication.md](docs/authentication.md)
- Database & Prisma: [docs/database.md](docs/database.md)
- Credits System: [docs/credits.md](docs/credits.md), [src/lib/credits/feature-config.ts](src/lib/credits/feature-config.ts), [src/lib/credits/deduct.ts](src/lib/credits/deduct.ts)
- **Admin Panel (Complete):** [docs/PAINEL-ADMIN-COMPLETO.md](docs/PAINEL-ADMIN-COMPLETO.md) - 📊 Documentação completa do painel administrativo
- Admin QA Guide: [docs/testing/admin-qa-guide.md](docs/testing/admin-qa-guide.md)

## Studio Lagosta Specific
- Projects & Templates: [docs/projects-templates.md](docs/projects-templates.md)
- Konva Editor: [docs/konva-editor.md](docs/konva-editor.md)
- Custom Fonts System: [docs/custom-fonts.md](docs/custom-fonts.md)
- Text Editing Toolbar: [docs/text-editing-toolbar.md](docs/text-editing-toolbar.md)
- AI Image Generation: [docs/ai-image-generation.md](docs/ai-image-generation.md)

## Common Tasks → Guides
- Plan a feature: [agents/architecture-planning.md](agents/architecture-planning.md)
- Build frontend UI: [agents/frontend-development.md](agents/frontend-development.md)
- Implement API/backend: [agents/backend-development.md](agents/backend-development.md)
- Evolve database schema: [agents/database-development.md](agents/database-development.md)
- Security review checklist: [agents/security-check.md](agents/security-check.md)
- QA workflow: [agents/qa-agent.md](agents/qa-agent.md)

## Essentials (quick reminders)
- Database access is server-only. Use Server Components, API routes under `src/app/api/*`, or Server Actions. Details: docs/backend.md
- Prefer typing feature keys: `FeatureKey = keyof typeof FEATURE_CREDIT_COSTS`. See src/lib/credits/feature-config.ts and src/lib/credits/deduct.ts
- Path alias `@/*` → `src/*`. Code style and scripts: docs/development-guidelines.md

## Project Map (for orientation)
- App Router: src/app (public: `src/app/(public)`, protected: `src/app/(protected)`, APIs: `src/app/api/*`)
- Components: src/components
- Libraries & domain: src/lib
- Prisma schema: prisma
- Static assets: public

For setup, scripts, and workflows, follow [docs/README.md](docs/README.md).
