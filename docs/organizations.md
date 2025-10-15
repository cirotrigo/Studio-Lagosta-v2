# Organizations Guide

## Overview

The team/organization feature is built on top of Clerk Organizations. We sync the Clerk payload into our own `Organization` table to track plan limits, credit balance and shared resources.

## Data flow

1. Clerk sends webhooks to `POST /api/organizations/webhooks/clerk`.
2. The handler calls `syncOrganizationFromClerk` (`src/lib/organizations/service.ts`) which:
   - Upserts the `Organization` record (`ownerClerkId`, limits, credit balance).
   - Applies defaults from the owner plan (`getPlanLimitsForUser`) when Clerk metadata is missing.
3. API clients (Dashboard, Admin, etc.) can read shared data through `/api/organizations/*`.

## Plan limits endpoint

- `GET /api/organizations/limits`
  - Requires an authenticated user.
  - Returns:
    ```jsonc
    {
      "limits": {
        "allowOrgCreation": true,
        "orgMemberLimit": 10,
        "orgProjectLimit": 20,
        "orgCreditsPerMonth": 2000,
        "orgCountLimit": 3
      },
      "ownedCount": 2,
      "activeOwnedCount": 2,
      "canCreate": true
    }
    ```
  - `limits` mirrors the fields available on `Plan`.
  - `ownedCount` is the total number of organizations the user owns.
  - `activeOwnedCount` only counts `isActive === true`.
  - `canCreate` already checks `allowOrgCreation` and `orgCountLimit`.

### Usage guidelines

- **Organization switcher / UI buttons**: Disable “Criar organização” when `canCreate === false`. Optionally display a message using `orgCountLimit`.
- **Admin panel**: Surface limits next to plan details to help support decide on upgrades.
- **Server-side validation**: If we ever expose a custom creation flow, call the endpoint first to avoid hitting Clerk when the quota is already exhausted.

## Owner tracking

- `ownerClerkId` is populated from:
  - Clerk webhook metadata (`public_metadata.ownerClerkId`), or
  - The `created_by` field when available.
- New organizations inherit limits from the owner’s plan:
  - Members: `plan.orgMemberLimit`
  - Projects: `plan.orgProjectLimit`
  - Credits per month: `plan.orgCreditsPerMonth`
  - Count limit: `plan.orgCountLimit`
- Admin tools can filter organizations by `ownerClerkId` for reporting.

## Shared credits & analytics

- Credits consumed with `organizationId` are stored in `OrganizationUsage`.
- Aggregations feed:
  - `/api/organizations/[orgId]/credits`
  - `/api/organizations/[orgId]/analytics`
  - `/api/organizations/[orgId]/analytics/members`
- The new dashboard page at `/organization/[orgId]/analytics` uses:
  - `useOrganizationAnalytics`
  - `useOrganizationMemberAnalytics`
  - Supporting components in `src/components/organization/*`

## Checklist for new UI features

When building a feature that should respect team limits:

1. Fetch `/api/organizations/limits` for the current user.
2. Hide or disable actions blocked by `canCreate`.
3. Consider showing the current usage (`ownedCount`) vs the maximum allowed (`orgCountLimit`).
4. For management UIs, surface `ownerClerkId` to quickly identify who can adjust limits.

