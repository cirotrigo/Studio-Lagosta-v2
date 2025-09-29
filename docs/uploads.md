# File Uploads (Vercel Blob)

This project supports user file attachments in the AI Chat using Vercel Blob storage.

## Prerequisites
- Set `BLOB_READ_WRITE_TOKEN` in `.env.local`. Generate a token in Vercel → Storage → Blob → Tokens.
- The token is scoped to a specific Blob Store and Region — you do not need to pass the Store ID or Region in code; the token carries that scope.

### Optional: Store Settings
- Unique Store ID: visible in Vercel → Storage → Blob → your store. Useful for identification and token scoping, but not required in this code path.
- Storage Region: chosen when creating the store. The upload API uses the region bound to your token automatically.
- Base URL: default public base is `https://blob.vercel-storage.com`. If you set up a custom domain, downloads will be served from there and the API response `url` will reflect it. No extra config is needed in this repo.
- Deploy environment variables to Vercel as well if needed.

## API
- `POST /api/upload` (authenticated)
  - Accepts `multipart/form-data` with a single `file` field.
  - Stores the file at `uploads/<clerkUserId>/<timestamp>-<sanitized-filename>` in the Blob Store tied to your token.
  - Returns:
    ```json
    {
      "url": "https://...",
      "pathname": "uploads/usr_123/1715712345-file.pdf",
      "contentType": "application/pdf",
      "size": 12345,
      "name": "file.pdf"
    }
    ```
  - Limits: default 25MB per file. Make it configurable with `BLOB_MAX_SIZE_MB`.
  - Admin tracking: each upload is persisted to `StorageObject` with the uploader (DB `userId` + `clerkUserId`).

### Admin Management
- List and manage uploads at `/admin/storage` (admin-only).
- API:
  - `GET /api/admin/storage?q=&limit=&cursor=` — paginated list with user info
  - `DELETE /api/admin/storage/:id` — deletes from Blob (best-effort) and soft-deletes the record
- Model: `StorageObject` (url, pathname, name, contentType, size, createdAt, user relation, optional `deletedAt`).

Example (curl):
```bash
curl -X POST \
  -H "Authorization: Bearer <session-cookie/headers via browser>" \
  -F file=@./example.pdf \
  http://localhost:3000/api/upload
```
(Note: Auth is handled by Clerk in-browser; use the App UI to upload locally.)

## Client (AI Chat)
- The paperclip button opens a file picker.
- Files are uploaded to `/api/upload` and shown as chips.
- On send, the chat appends a Markdown section with links:
  ```
  Attachments:
  - filename.ext: https://blob.vercel-storage.com/.../filename.ext
  ```
- Messages then include attachment links in history and for the model to consider.

## Access & Security
- Current implementation uses `access: 'public'` for convenience.
- For private files, switch to private blobs and generate signed URLs on demand.
- Consider MIME allowlists, virus scanning, and retention policies for production.
 - If switching to private blobs, update the admin UI to generate signed URLs for preview.

## Files
- API: `src/app/api/upload/route.ts`
- Admin list/delete: `src/app/api/admin/storage/*` and `src/app/admin/storage/page.tsx`
- UI: `src/app/(protected)/ai-chat/page.tsx` (composer uploads and chips)
