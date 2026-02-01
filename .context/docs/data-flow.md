---
status: filled
generated: 2026-01-31
---

# Data Flow & Integrations

This document explains how data enters, moves through, and exits Studio Lagosta, including interactions with external services.

## High-Level Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│   Client    │────▶│   Next.js   │
│   Browser   │◀────│   (React)   │◀────│   API       │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              ┌──────────┐            ┌──────────────┐          ┌──────────────┐
              │ PostgreSQL│            │ Vercel Blob  │          │ External     │
              │ (Prisma)  │            │ (Storage)    │          │ APIs         │
              └──────────┘            └──────────────┘          └──────────────┘
```

## Client to Server Flow

### TanStack Query Pattern
All client-side data fetching uses TanStack Query with custom hooks:

```
Component → useQuery/useMutation → api-client.ts → API Route → Prisma → PostgreSQL
```

1. **Component** calls a custom hook (e.g., `useTemplates()`)
2. **Hook** uses TanStack Query with the centralized `api` client
3. **api-client.ts** makes HTTP request to API route
4. **API Route** validates auth, processes request
5. **Prisma** executes database query
6. **Response** flows back through the same path

### Example Flow: Create Template

```typescript
// 1. Component calls mutation
const { mutate } = useCreateTemplate();
mutate({ name: 'My Template', designData: {...} });

// 2. Hook sends to API
// hooks/use-templates.ts
mutationFn: (data) => api.post('/api/templates', data)

// 3. API route processes
// app/api/templates/route.ts
export async function POST(request: Request) {
  const { userId } = await auth();
  const user = await getUserFromClerkId(userId);
  const template = await prisma.template.create({...});
  return Response.json(template);
}

// 4. Cache invalidation
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['templates'] });
}
```

## Post Scheduling Flow

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ User Creates   │────▶│ PostScheduler  │────▶│ Later API      │
│ Post           │     │ schedules      │     │ receives post  │
└────────────────┘     └────────────────┘     └────────────────┘
                                                     │
                                                     ▼
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ DB Updated     │◀────│ Buffer Webhook │◀────│ Post Published │
│ (POSTED)       │     │ received       │     │ via Buffer     │
└────────────────┘     └────────────────┘     └────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Verification   │
                    │ Scheduled      │
                    └────────────────┘
```

### Steps:
1. User creates post with caption, media, and scheduled time
2. `PostScheduler` validates and prepares the post
3. Media uploaded to Later via `LaterClient.uploadMedia()`
4. Post created in Later via `LaterClient.createPost()`
5. Later schedules with Buffer for publishing
6. Buffer publishes to Instagram at scheduled time
7. Buffer webhook notifies our app
8. Post status updated to `POSTED`
9. Verification cron job scheduled

## Instagram Story Verification Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Story Created                              │
│  1. Generate verification TAG (SL-{id6}-{hash4})             │
│  2. Add TAG to caption                                        │
│  3. Schedule via Later API                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Post Published                             │
│  Buffer webhook → schedules verification (+5 min)            │
│  verificationStatus: PENDING                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Cron Job (every 5 min)                         │
│  /api/cron/verify-stories                                    │
│  1. Fetch pending verifications                              │
│  2. Group by Instagram account                               │
│  3. Call Instagram Graph API                                 │
│  4. Match by TAG (primary) or timestamp (fallback)           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ Match Found     │             │ No Match        │
    │ VERIFIED        │             │ Retry (max 3)   │
    │ verifiedStoryId │             │ or FAILED       │
    └─────────────────┘             └─────────────────┘
```

## External Integrations

### 1. Clerk (Authentication)

**Purpose**: User authentication and organization management

**Flow**:
```
Browser → Clerk SDK → JWT Token → Middleware → API Routes
```

**Webhook Events**:
- `user.created` - Create local user record
- `user.updated` - Sync user data
- `organizationMembership.*` - Sync org membership

### 2. Later.com (Social Media Scheduling)

**Purpose**: Schedule and publish posts to Instagram

**API Calls**:
| Endpoint | Purpose |
|----------|---------|
| `POST /media_library/files` | Upload media |
| `POST /posts` | Create scheduled post |
| `GET /posts/:id` | Get post status |
| `GET /posts/analytics` | Fetch engagement data |

**Rate Limiting**: 120 requests/minute per account

### 3. Instagram Graph API

**Purpose**: Verify story publication, fetch analytics

**API Calls**:
| Endpoint | Purpose |
|----------|---------|
| `GET /{user-id}/stories` | List active stories |
| `GET /{media-id}/insights` | Get story insights |

**Token**: Long-lived access token (refresh every 60 days)

### 4. Vercel Blob (Storage)

**Purpose**: Store user-uploaded images and videos

**Flow**:
```
Client → presigned URL → Direct upload to Blob → URL stored in DB
```

### 5. OpenRouter (AI)

**Purpose**: AI image generation with multiple providers

**Flow**:
```
User request → Credit check → OpenRouter API → Image generated → Blob upload
```

## Webhook Processing

### Buffer Post-Sent Webhook
```
POST /api/webhooks/buffer/post-sent
{
  "profile_id": "...",
  "status": "sent",
  "sent_at": "2024-01-15T10:00:00Z"
}
```

Processing:
1. Validate webhook signature
2. Find post by `bufferPostId`
3. Update post status to `POSTED`
4. Schedule verification (+5 min for stories)

### Clerk Webhook
```
POST /api/webhooks/clerk
{
  "type": "user.created",
  "data": { "id": "user_...", "email_addresses": [...] }
}
```

Processing:
1. Validate Clerk signature
2. Create/update local user record
3. Initialize credit balance

## Database Flow

### Key Relationships
```
User (clerkId)
  └── Organization (many-to-many)
        └── Project
              ├── Template
              │     └── Generation (rendered outputs)
              └── SocialPost
                    └── verificationStatus
```

### Query Patterns

**Fetch user's templates**:
```typescript
prisma.template.findMany({
  where: { userId: user.id },
  orderBy: { updatedAt: 'desc' },
  include: { generations: true }
});
```

**Fetch pending verifications**:
```typescript
prisma.socialPost.findMany({
  where: {
    verificationStatus: 'PENDING',
    nextVerificationAt: { lte: new Date() },
    verificationAttempts: { lt: 3 }
  }
});
```

## Error Handling & Retry

### API Errors
- `ApiError` class with status codes
- Automatic retry with exponential backoff for transient errors

### Verification Retry Strategy
| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | 5 min | 5 min |
| 2 | 10 min | 15 min |
| 3 | 15 min | 30 min |

### Rate Limit Handling
- Later API: Queue requests, respect 120/min limit
- Instagram API: 15-minute backoff on rate limit errors

## Observability

### Logging
- Structured JSON logs with request IDs
- Error logs include sanitized context (no tokens)

### Key Metrics
- Post scheduling success rate
- Verification success rate
- API response times
- Credit consumption by feature
