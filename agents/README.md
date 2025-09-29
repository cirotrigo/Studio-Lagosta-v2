# Agent Guides Index

Use these concise prompts when kicking off tasks. Each guide includes context for this Next.js + Prisma + Clerk stack and clear deliverables to paste into PRs.

- `security-check.md`: Pre-merge security review (authZ/authN, input validation, Prisma scoping, webhooks, credits, dependencies).
- `frontend-development.md`: App Router pages/components, Page Metadata System, Tailwind, forms with Zod + react-hook-form, React Query, a11y, and quality gates.
- `backend-development.md`: API route contracts, Zod validation, Clerk-based auth, Prisma access patterns, credits integration, safe responses.
- `database-development.md`: Prisma schema evolution, migrations, tenancy modeling, defaults/constraints, indexing, example model snippet.
- `architecture-planning.md`: Planning template covering goals, flows, data, APIs, security, performance, and rollout.

Tip: Link the relevant guide in your PR description and check `npm run lint`, `npm run typecheck`, and `npm run build` before review.
