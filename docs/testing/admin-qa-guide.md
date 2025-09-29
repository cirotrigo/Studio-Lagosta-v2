# Admin QA Guide

This document describes how to validate the admin surface end to end. It combines environment prerequisites, dataset expectations, automated coverage and manual checkpoints so the team can run consistent regression passes before every release.

## 1. Scope Overview
Admin features covered by this guide:
- **Dashboard** (`/admin`): high-level KPIs and charts for ARR/MRR/Churn.
- **Users** (`/admin/users`): listing, search, invitations, activation/deactivation, balance adjustments and Clerk sync dialog.
- **Credits** (`/admin/credits`): aggregated metrics and balance adjustments via modal.
- **Usage** (`/admin/usage`): filters, pagination, CSV export and JSON detail dialog for operations.
- **Storage** (`/admin/storage`): filtering, per-user view, external link open and delete workflow for blobs.
- **Settings** (`/admin/settings/*`): feature credit pricing and subscription plan mapping.

Out of scope for this document: Clerk/Stripe webhook flows (covered by backend integration tests), authentication itself (smoke test separately) and load/performance testing.

## 2. Environment & Dependencies
- Start the app with `npm run dev` or, for Playwright, `npm run dev:e2e` (enables `E2E_AUTH_BYPASS=1` and pins the server to `127.0.0.1:3100`).
- Minimum `.env` variables: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `ADMIN_EMAILS` or `ADMIN_USER_IDS`. For e2e bypass only: set `E2E_AUTH_BYPASS=1` and `ADMIN_USER_IDS=e2e-admin`.
- Database: SQLite is fine locally; prefer Postgres when running shared QA. Ensure `prisma migrate deploy` (or `db:migrate`) succeeded before tests.
- Seed data: provide sample users with mixed credit balances, pending invitations, uploaded files and usage records. Automated specs stub most APIs but manual sweeps benefit from realistic seed data.

## 3. Automated Coverage (Playwright)
| Area | Scenario | Entry Point | Notes |
| --- | --- | --- | --- |
| Dashboard | Metric cards + charts render and respect mocked data | `tests/e2e/admin-dashboard.spec.ts` | API responses stubbed (`/api/admin/dashboard`). |
| Users | Search, credit prompt, invite flow, tabs | `tests/e2e/admin-users.spec.ts` | Handles `window.prompt` for credit update and invitation toasts. |
| Credits | Aggregated cards, search, adjust via modal | `tests/e2e/admin-credits.spec.ts` | Verifies toast feedback and table update. |
| Usage | Filters (type/search), JSON dialog | `tests/e2e/admin-usage.spec.ts` | CSV export kept manual; mocks keep fixtures small. |
| Storage | Filter term + deletion confirmation | `tests/e2e/admin-storage.spec.ts` | Uses `confirm` dialog and ensures toast appears. |
| Settings | Feature cost edit + save feedback | `tests/e2e/admin-settings.spec.ts` | Stubs GET/PUT to `/api/admin/settings`. |

All specs run via `npm run test:e2e`. Configuration sits in `playwright.config.ts` with `trace` on first retry and Chromium as the default project.

## 4. Manual QA Checklist
Run these when validating new admin functionality or before major releases:
1. **Metrics sanity** – confirm dashboard numbers align with seeded DB data and chart fallbacks render when series are empty.
2. **Bulk Clerk sync** – in a real environment, exercise the sync modal with and without override credits to ensure webhooks update balances.
3. **Invite lifecycle** – verify resend/revoke on actual Clerk invitations (requires email delivery setup).
4. **Exports** – download the Usage CSV and inspect content for correct delimiter/quoting.
5. **Storage deletion** – confirm blobs disappear from the storage provider (Verel Blob/S3) and are soft-deleted in DB.
6. **Settings persistence** – tweak feature costs and plan mappings, verify data in the database and via API responses.
7. **Access control** – ensure non-admin accounts hit redirects from `/admin` routes when `E2E_AUTH_BYPASS` is disabled.

## 5. Running the Playwright Suite
```bash
npm run test:e2e                # full chromium pass
npm run test:e2e -- --debug     # headed mode for debugging
npx playwright show-trace trace.zip
```
Outputs (screenshots/traces) appear in `playwright-report/` when failures occur. The suite automatically spins up the dev server with the bypassed auth guard.

## 6. Extending Automation
- Prefer REST mocks (via `page.route`) to keep tests deterministic; only hit live APIs when the response surface is stable.
- Wrap toast assertions with `page.getByRole('status')` filters to avoid duplicate matches.
- Store new admin-specific fixtures under `tests/e2e/fixtures` (create if needed) to keep specs lean.
- When adding new pages, follow the existing pattern: stub API(s), assert headings/cards, exercise primary CTA(s) and confirm toasts/state updates.

## 7. Next Steps
1. Introduce repeatable Prisma seeds focused on admin data to support both manual regression and automated mocks.
2. Wire `npm run test:e2e` into CI, publishing Playwright HTML reports and traces on failure.
3. Expand automated coverage to credit usage reports and plan management API endpoints once stabilized.
