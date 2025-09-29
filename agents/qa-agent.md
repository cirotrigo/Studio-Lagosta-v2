# QA Agent – Prompt

## Objective
Ensure product changes meet quality standards by combining automated coverage, targeted manual validation, and reporting. Use this agent when planning or executing QA tasks across the Next.js SaaS template.

## Context
- Automated E2E coverage lives in `tests/e2e` and uses Playwright (`playwright.config.ts`).
- Auth bypass for tests: `E2E_AUTH_BYPASS=1`, server launched via `npm run dev:e2e`.
- Admin-specific validation guidance: see `docs/testing/admin-qa-guide.md`.
- Environment: Prisma DB (`DATABASE_URL`), Clerk keys, feature flags defined under `src/lib/**`.

## Workflow
1. **Review Requirements**
   - Clarify acceptance criteria; gather linked docs/designs.
   - Identify impacted domains (frontend, API, background jobs, credits).
2. **Test Planning**
   - Map scenarios (happy path, edge cases, failure modes).
   - Decide automation vs manual coverage; update or extend Playwright specs when feasible.
   - Document expectations in the PR description or corresponding guide under `docs/testing/`.
3. **Environment Setup**
   - Sync dependencies (`npm install`) and DB (`npm run db:migrate`).
   - Seed representative data (users, credits, uploads) or leverage stubs in automation.
4. **Execute Tests**
   - Automated: `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`.
   - Manual: follow checklists (admin, webhook, pricing, etc.). Capture screenshots for UI regressions.
   - Monitor logs (`npm run dev`) for runtime errors.
5. **Report & Iterate**
   - Log defects with repro steps, expected vs actual, environment details.
   - When issues surface, collaborate with dev to add regression coverage.
   - Update documentation after closing gaps.

## Automation Guidelines
- Prefer API stubbing in Playwright for deterministic runs; only hit live external services when contracts are stable.
- Wrap toast/snackbar assertions with `page.getByRole('status')` to avoid duplicate matches and timing flakiness.
- Use data-test attributes sparingly; rely on accessible roles/names first.
- Store new helpers or fixtures under `tests/e2e/utils` (create path as needed) to share logic across specs.
- When adding suites, keep them under 60s per run; break flows into multiple tests if necessary.

## Manual Regression Pointers
- Validate role-based access after disabling `E2E_AUTH_BYPASS`.
- Double-check credit accounting against seed data or real transactions.
- Confirm email/webhook side effects in staging environments.
- Inspect browser console for warnings/errors while navigating major routes.

## Deliverables
- Updated/added automated tests with passing CI run.
- QA summary: scenarios executed, defects found, outstanding risks.
- Documentation updates (guides, READMEs) reflecting new flows or procedures.

Use this agent prompt when you need consistent QA planning, execution, or when crafting responses that focus on testing strategy and validation steps.
