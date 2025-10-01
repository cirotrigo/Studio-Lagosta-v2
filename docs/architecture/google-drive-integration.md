# Google Drive Backup Integration

## Problem & Goals
- Enable dual storage for creatives: Vercel Blob remains the primary store while Google Drive acts as an optional per-project backup.
- Give project owners control to connect a Drive folder, browse assets, and reuse images inside the editor without leaking credentials.
- Maintain resiliency: creative generation must succeed (and stay fast) even when Google Drive is misconfigured or temporarily unavailable.

### Non-Goals
- Handling Drive authorization per end-user account (single workspace-level OAuth token stored in env is sufficient for this iteration).
- Synchronizing deletions or updates from Google Drive back into Lagosta assets.
- Supporting non-image asset types or large binary uploads beyond PNG creatives right now.

## User Flows
1. **Integration Setup (internal tooling)**
   - Admin visits `/google-drive-callback` page after initiating Google OAuth manually.
   - Callback route exchanges `code` for tokens, persists nothing, and surfaces the refresh token so ops can copy it into `.env`.
2. **Project Configuration** (`/projects/:id` → tab `Configurações`)
   - User opens the Google Drive backup section, sees current folder (if any) and status.
   - Clicking "Selecionar Pasta" launches the Drive modal (folder mode).
   - Modal fetches directory contents using `/api/google-drive/files`, supports navigation, search, and selection.
   - On confirm we call `PATCH /api/projects/:id/settings`, persist `googleDriveFolderId` + name, toast success, invalidate local cache.
3. **Creative Generation** (`POST /api/projects/:id/generations` triggered by Studio/editor)
   - API validates auth, project ownership, inputs, rate limit (100 req/hour per user).
   - Job row created with status `PROCESSING` and response returns immediately (202).
   - Background task renders PNG buffer and uploads to Vercel Blob (primary) → update `resultUrl`.
   - If project has Drive folder configured, service ensures `ARTES LAGOSTA` subfolder exists, uploads backup, makes file public, saves `googleDriveFileId` (and derived URL) without impacting job success if it fails.
   - Job status flips to `COMPLETED` and frontend polls via existing generation list to pick up new creative.

## Data Model Impact
- **Project**: add `googleDriveFolderName` (text, nullable) alongside existing `googleDriveFolderId`.
- **Generation**: add optional `googleDriveFileId` (text) and `googleDriveBackupUrl` (cached public link) for quick access from UI.
- Add Prisma migration plus Drizzle/typed schema mirror (`shared/schema.ts`) to expose new columns to TypeScript callers.

## API Surface
- `GET /api/google-drive/files` (auth required)
  - Query: `folderId?` (default = root), `search?` (string), `mode` (`folders|images`).
  - Response: `{ items: DriveEntry[], nextPageToken? }` (we'll page in 50 item batches, expose `nextPageToken`).
  - Errors: `401` unauth, `429` rate limit, `502` Drive failure.
- `GET /api/google-drive/image/:fileId`
  - Streams file bytes via Drive API (for thumbnails) with content-type from Drive metadata.
- `POST /api/google-drive/test`
  - Lightweight connection check for settings UI (optional, returns 200 if service can refresh access token).
- `POST /api/google-drive/start-oauth` (optional utility that crafts authorization URL with state and returns it for local tooling).
- `GET /api/google-drive/callback`
  - Exchanges `code` → access + refresh tokens, validates `state`, returns JSON `{ refreshToken, expiryDate }` for manual env update.
- `PATCH /api/projects/:id/settings`
  - Body schema: `{ googleDriveFolderId?: string | null, googleDriveFolderName?: string | null }`.
  - Validates ownership, persists fields, returns updated project view.
- `POST /api/projects/:id/generations`
  - Existing endpoint updated to return `{ generationId, status: 'PROCESSING' }` immediately and push heavy work to detached async job.
  - On completion job updates include `resultUrl`, `googleDriveFileId`, `googleDriveBackupUrl`.

## Services & Internal Modules
- `src/server/google-drive-service.ts`
  - Singleton wrapping `googleapis` Drive client with OAuth2 refresh flow and resilience.
  - Key methods: `listFiles`, `searchFiles`, `uploadFile`, `createFolder`, `ensureArtesLagostaFolder`, `uploadCreativeToArtesLagosta`, `makeFilePublic`, `getPublicUrl`, `testConnection`.
  - Implements 30s list timeout, 60s upload timeout, exponential retry for 429/5xx, and caches `ARTES LAGOSTA` folder IDs per `projectFolderId` in-memory for 10 minutes.
- `src/lib/rate-limit.ts`
  - Adds per-user sliding window limiter (100/hour) reused by Drive endpoints and generation creation.
- Shared types in `src/types/google-drive.ts` for consistent shape between frontend hooks and API responses.

## External Integrations
- `googleapis` npm package (`Drive` v3) using OAuth2 client created from env vars `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`.
- Public URLs derived as `https://drive.google.com/uc?export=view&id={fileId}`.
- Vercel Blob continues using `@vercel/blob` with existing token.

## Security & Tenancy
- All new API routes require Clerk auth via `requireUser()` helper (add if missing) and verify project ownership.
- Persisted Drive folder IDs belong to the project's owner; we do not expose other users' Drive data.
- OAuth callback enforces `state` nonce stored in encrypted cookie to prevent CSRF.
- Rate limiting (100 req/hour/user) across Drive browse + generation endpoints; respond with `429` and log attempts.
- Never send refresh/access tokens to frontend beyond the manual callback utility used by internal ops.

## Performance & Resilience
- Fire-and-forget creative processing uses a detached async task; if the platform kills background work early, we will fall back to synchronous mode (toggle via env `GOOGLE_DRIVE_ASYNC_ENABLED` default true) and document the risk.
- Drive uploads handled after Blob upload; failure only logs warning and marks `googleDriveFileId` null.
- Use streaming for proxy downloads to avoid buffering large files in memory.
- Cache Drive folder lookups to reduce API quota usage.

## Frontend Data Flow
- **Queries**
  - `useProject(projectId)` (existing or new) caches project settings under `['projects', projectId]`.
  - `useGoogleDriveItems({ folderId, mode, search })` uses TanStack Query with `keepPreviousData`, stale time 60s, handles pagination tokens.
- **Mutations**
  - `useUpdateProjectSettings(projectId)` hits PATCH route, invalidates `['projects', projectId]` and project generations list (since backup availability changes download options).
- **UI Components**
  - `GoogleDriveFolderSelector` (Project settings tab) shows current folder, CTA, and summary chips.
  - `DesktopGoogleDriveModal` (client component) renders grid/list, search input, breadcrumbs, selection, reuses `useGoogleDriveItems` hook.
  - Future reuse: same modal in image picker with `mode='images'`.

## Rollout & Migration Plan
1. Create Prisma migration adding new columns; run `prisma generate` to refresh client.
2. Ship backend service + API endpoints behind env guard (`GOOGLE_DRIVE_REFRESH_TOKEN` required for backup, optional for browsing).
3. Merge frontend selectors; hide Drive UI if env unavailable or `testConnection` fails.
4. Update documentation: `.env.example`, `docs/backend.md`, `docs/frontend.md`, new architecture note.
5. QA checklist covering OAuth flow, folder selection, creative generation (with/without backup), and failure scenarios.

## Risks & Mitigations
- **Serverless background work**: Document fallback to synchronous mode if asynchronous processing proves unreliable on Vercel.
- **Google API quotas**: Implement caching + client-side search debouncing to avoid excessive list calls.
- **Token revocation**: `testConnection` endpoint surfaces errors so ops can refresh token quickly; log unauthorized responses and disable backups automatically after repeated failures.
- **Public sharing**: `makeFilePublic` uses Drive permissions API; ensure we only expose `reader` role with `anyone` type and avoid re-granting if already public.


## Implementation Tasks (Sequenced)
1. **Dependencies & Env**
   - Add `googleapis` to dependencies; document new env vars in `.env.example` and setup guides.
   - Expose optional `GOOGLE_DRIVE_ASYNC_ENABLED` toggle.
2. **Database Layer**
   - Update Prisma schema and generate migration for `googleDriveFolderName`, `googleDriveFileId`, `googleDriveBackupUrl`.
   - Mirror changes in shared type definitions used by API responses.
3. **Service Layer**
   - Implement `server/google-drive-service.ts` (singleton + methods + caching + logging).
   - Add rate limiter utility in `src/lib/rate-limit.ts`.
4. **API Routes**
   - Create `/api/google-drive` handlers (`files`, `image`, `callback`, optional `start-oauth`, `test`).
   - Add `/api/projects/[projectId]/settings` PATCH route with Zod validation.
   - Refactor `/api/projects/[projectId]/generations` POST to async job + dual upload.
5. **Frontend Hooks & Components**
   - Build React Query hooks for project settings + Drive listing.
   - Implement `GoogleDriveFolderSelector` and new modal.
   - Enhance project settings tab to surface backup UI and handle state transitions.
6. **Testing & QA**
   - Unit/integration: service tests with mocked Drive client, API route tests hitting mocked service, React component tests via React Testing Library.
   - Manual QA per checklist (auth flow, folder selection, generation success/failure scenarios).
7. **Documentation & Logging**
   - Update docs (setup, backend, frontend) with new instructions + troubleshooting.
   - Ensure logs emit `✅`/`⚠️` markers for Blob vs Drive operations and highlight errors.

