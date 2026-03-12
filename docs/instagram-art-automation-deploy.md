# Instagram Art Automation - Deploy Guide

This guide covers production rollout for the Electron Instagram Art Automation module and how to verify it on Vercel.

## Scope

- API route for structured copy: `POST /api/tools/generate-ai-text`
- API route for art generation: `POST /api/tools/generate-art`
- DS template fallback presets (`S1..S6`, `F1..F3`) on server
- Safe smoke check using `dryRun` (no image generation cost)

## Required Environment Variables (Vercel)

- `OPENAI_API_KEY` - required by:
  - `/api/tools/generate-ai-text` (real copy generation mode)
  - `/api/tools/generate-art` (prompt/text pipeline)
- `GOOGLE_GENERATIVE_AI_API_KEY` - required by `/api/tools/generate-art` for image generation mode
- `GEMINI_IMAGE_PRIMARY_MODEL` (optional override):
  - default: `gemini-3.1-flash-image-preview` (Nano Banana 2)
- `GEMINI_IMAGE_FALLBACK_MODEL` (optional override):
  - default: `gemini-2.5-flash-image`
- `BLOB_READ_WRITE_TOKEN` - required for generated image persistence on Vercel Blob

## Deploy Steps

1. Merge/push latest `main`.
2. Confirm Vercel deployment finished successfully.
3. Validate endpoint presence (should be `!= 404`).
4. Run authenticated dry-run checks (fast, no generation cost).
5. Run one real generation from desktop (template selected) and approve one variation.

## Smoke Test Command

### 1) Endpoint presence only (no auth)

```bash
PROJECT_ID=8 BASE_URL=https://studio-lagosta-v2.vercel.app bash scripts/smoke-art-automation.sh
```

Expected:
- `/api/tools/generate-ai-text` not `404`
- `/api/tools/generate-art` not `404`

### 2) Full authenticated dry-run

```bash
PROJECT_ID=8 \
BASE_URL=https://studio-lagosta-v2.vercel.app \
COOKIE='__session=...; __clerk_db_jwt=...' \
SESSION_TOKEN='...' \
bash scripts/smoke-art-automation.sh
```

Expected:
- `generate-ai-text dryRun` returns `200` with `ok=true`, `dryRun=true`
- `generate-art dryRun` returns `200` with `ok=true`, `dryRun=true`, `templatePath=true`
- `templatesResolved` contains selected templates (`S1`, `S2`)

## Post-Deploy QA Checklist (Desktop)

1. Login + open project.
2. Import DS ZIP/HTML.
3. Select DS templates (`S1..S6` or `F1..F3`).
4. Generate `2` variations in `STORY`.
5. Confirm review cards show:
   - full art visible (buttons not covering artwork)
   - badge: `Template path ativo`
   - different copy/visual variation
6. Edit text in WYSIWYG and confirm live update.
7. Approve one variation and check persistence in:
   - desktop history tab
   - web project media/history list

## Troubleshooting

- If `/api/tools/generate-ai-text` is `404`:
  - deployment did not include latest `src/app/api/tools/generate-ai-text/route.ts`
- If `/api/tools/generate-art` returns `{"error":"Nenhum template encontrado"}`:
  - selected template IDs were not resolved/created in project yet
  - re-run with latest desktop build (auto-template provisioning)
- If dry-run passes but real generation fails:
  - verify `OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`
  - verify provider/model quota and Blob token
