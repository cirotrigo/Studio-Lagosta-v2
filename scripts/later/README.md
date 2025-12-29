# Later API Scripts

Utility scripts for managing Later API integration.

## ⚡ Quick Setup

**Easiest way to get started:**

```bash
npx tsx scripts/later/setup.ts
```

This interactive script will guide you through the entire setup process.

## Prerequisites

1. **Later account** with connected Instagram account
2. **Later API key** in `.env`:
   ```env
   LATER_API_KEY=your_api_key_here
   LATER_WEBHOOK_SECRET=your_webhook_secret
   ```

## Available Scripts

### 0. Setup (Interactive)

Interactive setup wizard that guides you through the entire process.

```bash
npx tsx scripts/later/setup.ts
```

**Recommended for first-time setup!**

---

### 0.1. Generate Webhook Secret

Generate a secure webhook secret for Later integration.

```bash
npx tsx scripts/later/generate-webhook-secret.ts
```

**Output:**
- Generates a secure 32-byte hex string
- Shows instructions to add to `.env`
- Shows webhook configuration steps

---

### 1. Test Connection

Test Later API connection and list available accounts.

```bash
npx tsx scripts/later/test-connection.ts
```

**Output:**
- Validates API key
- Lists connected Instagram accounts
- Shows account IDs and profile IDs
- Displays rate limit information

**Example output:**
```
✅ Found 2 account(s):

1. @lagostacriativa
   Platform: instagram
   Account ID: acc_12345
   Profile ID: ig_67890
   Status: ✅ Active
```

---

### 2. List Projects

List all projects and their posting providers.

```bash
npx tsx scripts/later/list-projects.ts
```

**Output:**
- Total projects count
- Projects using Later API
- Projects using Zapier/Buffer
- Configuration status for each project

---

### 3. Configure Project

Configure a project to use Later API.

```bash
npx tsx scripts/later/configure-project.ts "Project Name" acc_xxxxx [prf_xxxxx]
```

**Arguments:**
- `Project Name` - Exact name of the project (case-insensitive)
- `acc_xxxxx` - Later account ID (required)
- `prf_xxxxx` - Later profile ID (optional)

**Example:**
```bash
npx tsx scripts/later/configure-project.ts "Lagosta Criativa" acc_12345
```

**What it does:**
1. Finds the project by name
2. Updates `laterAccountId` and `laterProfileId`
3. Sets `postingProvider` to `LATER`
4. Displays configuration summary

---

### 4. Rollback to Zapier

Revert a project to use Zapier/Buffer.

```bash
# Rollback single project
npx tsx scripts/later/rollback-to-zapier.ts "Project Name"

# Rollback ALL projects
npx tsx scripts/later/rollback-to-zapier.ts --all
```

**What it does:**
1. Finds the project(s) using Later
2. Sets `postingProvider` back to `ZAPIER`
3. Preserves Later configuration for future use

---

## Workflow: Testing Later Integration

### Step 1: Test Connection

```bash
# Test Later API and get account IDs
npx tsx scripts/later/test-connection.ts
```

Copy the `Account ID` from the output (e.g., `acc_12345`).

### Step 2: List Projects

```bash
# See available projects
npx tsx scripts/later/list-projects.ts
```

Choose a project to migrate (recommend starting with lowest volume).

### Step 3: Configure Project

```bash
# Configure project to use Later
npx tsx scripts/later/configure-project.ts "Lagosta Criativa" acc_12345
```

### Step 4: Test Posting

Create a test post via:
- **UI:** Dashboard → Create Post
- **API:** `POST /api/projects/{projectId}/posts`

### Step 5: Verify Logs

Check server logs for:
```
📤 [Dual-Mode Router] Using Later API for project "Lagosta Criativa"
[Later Scheduler] Creating post with schedule type: IMMEDIATE
[Later Client] Post created: post_abc (publishing)
```

### Step 6: Check Later Dashboard

1. Go to https://app.getlate.dev
2. Verify post appears in your calendar
3. Check post status

### Step 7: Configure Webhook (Optional)

Configure Later webhook to receive confirmations:

1. Go to Later Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhooks/later`
3. Copy webhook secret
4. Add to `.env`:
   ```env
   LATER_WEBHOOK_SECRET=your_webhook_secret_here
   ```
5. Select events:
   - `post.scheduled`
   - `post.published`
   - `post.failed`

---

## Troubleshooting

### Error: "LATER_API_KEY not found"

**Solution:** Add API key to `.env`:
```env
LATER_API_KEY=your_api_key_here
```

### Error: "No accounts found in Later"

**Solution:** Connect an Instagram account in Later dashboard:
1. Go to https://app.getlate.dev/settings/accounts
2. Click "Connect Account"
3. Select Instagram
4. Authorize connection

### Error: "Project not found"

**Solution:** Check project name (case-insensitive):
```bash
npx tsx scripts/later/list-projects.ts
```

### Error: "Instagram account not configured"

**Solution:** Configure Instagram in project settings:
1. Go to Project Settings
2. Add Instagram Account ID
3. Add Instagram Username

### Post not appearing in Later

**Possible causes:**
1. Project not configured (`postingProvider` still `ZAPIER`)
2. Invalid Later account ID
3. Later API error (check logs)
4. Rate limit exceeded

**Debug:**
```bash
# Check project configuration
npx tsx scripts/later/list-projects.ts

# Test Later connection
npx tsx scripts/later/test-connection.ts

# Check server logs for errors
```

---

## Rollback Strategy

If you encounter issues:

### Emergency Rollback (All Projects)

```bash
npx tsx scripts/later/rollback-to-zapier.ts --all
```

This immediately reverts ALL projects to Zapier/Buffer.

### Selective Rollback

```bash
npx tsx scripts/later/rollback-to-zapier.ts "Project Name"
```

This reverts only a specific project.

---

## Migration Checklist

- [ ] Test Later connection
- [ ] Configure Later webhook (optional but recommended)
- [ ] Start with lowest-volume project (e.g., Lagosta Criativa)
- [ ] Create test post and verify
- [ ] Monitor for 24-48 hours
- [ ] Check success rate and verification
- [ ] If successful, migrate next project
- [ ] Repeat until all projects migrated
- [ ] Deactivate Zapier integration

---

## Support

- **Later API Docs:** https://docs.getlate.dev
- **Later Dashboard:** https://app.getlate.dev
- **Migration Plan:** `/prompts/plano-later.md`
- **Integration Docs:** `/docs/later-integration.md`
