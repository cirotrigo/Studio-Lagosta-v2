# API Documentation

## Overview

The API is built with Next.js App Router API routes, providing RESTful endpoints for the SaaS application. All endpoints are protected with Clerk authentication and follow consistent patterns for error handling, validation, and responses.

## Base URL

```

## Billing & Webhooks

### POST /api/webhooks/clerk

Processes Clerk webhook events (verified via Svix) for user lifecycle and billing.

- Events handled:
  - `user.created`/`user.updated`/`user.deleted`: Syncs user and initializes credit balance.
  - `subscription.created`/`subscription.updated`/`subscription.deleted`: Sets monthly credits based on plan via `refreshUserCredits`.
  - `invoice.payment_succeeded`: Adds credits for one-time credit-pack purchases.

#### One-time Credit Packs
- Configure Stripe Price → credits mapping in `src/lib/clerk/credit-packs.ts`:
  ```ts
  export const CREDIT_PACK_PRICE_TO_CREDITS = {
    'price_small_pack': 100,
    'price_medium_pack': 500,
  }
  ```
- The webhook inspects invoice line items for matching price IDs and calls `addUserCredits(clerkUserId, totalCredits)`.
- Subscription renewals continue to be applied via `subscription.updated`.

Security:
- Only award credits for whitelisted price IDs; do not trust client-provided amounts.
- Ensure `CLERK_WEBHOOK_SECRET` is set; reject requests without valid signatures.
Local Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

All API endpoints (except public ones) require authentication via Clerk JWT tokens. The token is automatically included by Clerk's client-side libraries.

### Authorization Header

```bash
Authorization: Bearer <clerk_jwt_token>
```

### Authentication Flow

1. User signs in through Clerk
2. Client receives JWT token
3. Token is automatically included in API requests
4. Server validates token using `auth()` from Clerk

## Standard Response Format

### Success Response

```json
{
  "data": { /* response data */ },
  "success": true
}
```

### Error Response

```json
{
  "error": "Error message",
  "success": false,
  "code": "OPTIONAL_ERROR_CODE"
}
```

### Validation Error Response

```json
{
  "error": "Validation failed",
  "success": false,
  "issues": [
    {
      "path": ["field_name"],
      "message": "Validation error message",
      "code": "invalid_type"
    }
  ]
}
```

## API Endpoints

### Health Check

#### GET /api/health

Check API and database health status.

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-03-15T10:30:00Z",
  "database": "connected"
}
```

### User Management

#### GET /api/users/me

Get current user information.

**Authentication:** Required

**Response:**
```json
{
  "data": {
    "id": "user_123",
    "clerkId": "user_2abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2024-03-01T00:00:00Z",
    "updatedAt": "2024-03-15T10:30:00Z"
  },
  "success": true
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - User not found
- `500` - Internal server error

#### PUT /api/users/me

Update current user information.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "John Smith",
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "user_123",
    "name": "John Smith",
    "updatedAt": "2024-03-15T10:35:00Z"
  },
  "success": true
}
```

### Credit System

#### GET /api/credits/me

Get the current user's credit balance.

Authentication: Required

Response:
```
{
  "creditsRemaining": 85,
  "lastSyncedAt": "2024-03-15T10:00:00Z"
}
```

#### GET /api/credits/settings

Public read-only endpoint that returns effective feature costs and plan credits for UI display.

Authentication: Not required

Response:
```
{
  "featureCosts": { "ai_text_chat": 1, "ai_image_generation": 5 },
  "planCredits": { "cplan_abc123": 500, "cplan_xyz789": 2000 }
}
```
Notes:
- `planCredits` includes Clerk plan IDs (`cplan_*`) configured via `Plan` rows.

### Admin Sync

#### POST /api/admin/users/sync

Sync Clerk users and/or plans into the local database.

Authentication: Admin required

Request Body (partial; defaults shown):
```
{
  "syncUsers": true,
  "syncPlans": true,
  "setCredits": true,
  "overrideCredits": 500,
  "pageSize": 100,
  "maxPages": 50,
  "debug": false
}
```

Behavior:
- Users: creates/updates `User` and ensures a `CreditBalance` row exists (0 credits default)
- Plans: queries Clerk Billing `GET /v1/users/{user_id}/billing/subscription` and resolves plan ID
- Credits: when `setCredits` is true and plan is mapped in `Plan`, sets credits to plan credits (or `overrideCredits` if provided)

Response (success):
```
{
  "processed": 120,
  "createdUsers": 5,
  "createdBalances": 5,
  "activeSubscriptions": 25,
  "creditsRefreshed": 25,
  "debug": {
    "pagesProcessed": 2,
    "unmappedPlanIds": ["cplan_123", "cplan_456"]
  }
}
```

Notes:
- The Admin UI includes a double confirmation summarizing the effects of selected options.
- Ensure `CLERK_SECRET_KEY` is set to use the billing endpoint.

#### GET /api/credits/usage

Get detailed credit usage history.

**Authentication:** Required

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20, max: 100)
- `days` (number, optional): Number of days to look back (default: 30)

**Example Request:**
```
GET /api/credits/usage?page=1&limit=10&days=7
```

**Response:**
```json
{
  "data": [
    {
      "id": "usage_123",
      "operationType": "AI_TEXT_CHAT",
      "creditsUsed": 1,
      "timestamp": "2024-03-15T09:00:00Z",
      "details": { "provider": "openrouter", "model": "openai/gpt-4o-mini" }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  },
  "success": true
}
```

### AI

#### POST /api/ai/chat

Stream text responses from selected LLM providers via Vercel AI SDK.

Body:
```json
{ "provider": "openrouter", "model": "openai/gpt-4o-mini", "messages": [{"role":"user","content":"Hello"}], "temperature": 0.4 }
```

Auth required. Credits enforced: cost from admin settings (`ai_text_chat`). On provider failure, credits are reimbursed and a 502 is returned.

#### POST /api/ai/image

Generate images via OpenRouter chat/completions with image modality.

Body:
```json
{ "model": "google/gemini-2.5-flash-image-preview", "prompt": "A friendly robot", "size": "1024x1024", "count": 1 }
```

Auth required. Credits enforced: cost from admin settings (`ai_image_generation`) per image (`count`). On provider failure or invalid response, credits are reimbursed.

### Admin Settings

#### GET /api/admin/settings
Returns effective credit settings and plan mappings. Admin-only.

Authentication: Admin required

Response:
```
{
  "featureCosts": { "ai_text_chat": 1, "ai_image_generation": 5 },
  "planCredits": { "cplan_abc123": 500 },
  "billingPlans": { "cplan_abc123": { "name": "Starter", "credits": 500 } }
}
```

#### PUT /api/admin/settings
Update overrides for feature costs and plan monthly credits.

Authentication: Admin required

Request Body (partial allowed):
```
{
  "featureCosts": { "ai_text_chat": 2 },
  "planCredits": { "cplan_abc123": 600 }
}
```
Notes:
- Plan credits are keyed by Clerk plan IDs (`cplan_*`). Values are sanitized to non‑negative integers and persisted.

#### GET /api/admin/clerk/plans
Fetch Clerk plans from the Clerk Backend API and normalize them for the Admin import flow.

Authentication: Admin required

Environment requirements:
- `CLERK_BILLING_API_KEY` (preferred) or `CLERK_SECRET_KEY`

Response (success):
```
{
  "plans": [ { "id": "plan_abc123", "name": "Starter" }, ... ]
}
```

Response (error):
```
{
  "error": "Falha ao obter planos do Clerk",
  "attempts": [ { "url": "https://api.clerk.com/v1/commerce/plans", "status": 404, "message": "..." } ]
}
```

Notes:
- The endpoint tries multiple Clerk API paths (`/v1/commerce/plans`, `/v1/commerce/products`, `/v1/plans`) and normalizes common shapes.
- The Admin UI also supports importing by pasting JSON and via the Clerk `usePlans()` hook when available.

### AI Agent Management

#### GET /api/agents

Get AI agents for the current user.

**Authentication:** Required

**Response:**
```json
{
  "data": [
    {
      "id": "agent_123",
      "name": "Code Assistant",
      "description": "AI assistant for code review and generation",
      "capabilities": ["code_generation", "code_review", "testing"],
      "workspaceId": "workspace_123",
      "createdAt": "2024-03-01T00:00:00Z"
    }
  ],
  "success": true
}
```

#### POST /api/agents

Create a new AI agent.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Design Assistant",
  "description": "AI assistant for UI/UX design tasks",
  "systemPrompt": "You are a helpful UI/UX design assistant...",
  "capabilities": ["design_review", "mockup_creation"],
  "workspaceId": "workspace_123"
}
```

## Error Codes

### Authentication Errors
- `401` - Unauthorized (no valid token)
- `403` - Forbidden (valid token but insufficient permissions)

### Client Errors
- `400` - Bad Request (invalid request format)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (resource already exists)
- `422` - Unprocessable Entity (validation failed)
- `429` - Too Many Requests (rate limit exceeded)

### Server Errors
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable

### Custom Error Codes
- `INSUFFICIENT_CREDITS` - User doesn't have enough credits

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- **General endpoints:** 100 requests per minute per user
- **Credit operations:** 20 requests per minute per user
- **Webhook endpoints:** 1000 requests per minute per IP

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1679472000
```

## Pagination

List endpoints support cursor-based pagination:

**Query Parameters:**
- `page` (number): Page number (1-based)
- `limit` (number): Items per page (max 100)

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  },
  "success": true
}
```

## Webhooks

### Clerk Webhooks

The application listens for Clerk webhooks to sync user data:

#### POST /api/webhooks/clerk

Events handled:
- `user.created`/`user.updated`/`user.deleted`: Sync user and initialize credit balance
- `subscription.created`/`subscription.updated`/`subscription.deleted`: Refresh monthly credits for the associated Clerk plan (`cplan_*`) via `refreshUserCredits`
- `invoice.payment_succeeded`: Add credits for one‑time credit‑pack purchases

One‑time Credit Packs:
- Configure Price→credits mapping in `src/lib/clerk/credit-packs.ts`. Keys should match the price IDs that appear on Clerk invoice line items (for example, Stripe Price IDs if Stripe is your processor):
  ```ts
  export const CREDIT_PACK_PRICE_TO_CREDITS = {
    'price_small_pack': 100,
    'price_medium_pack': 500,
  }
  ```
- The webhook inspects invoice line items for matching price IDs and calls `addUserCredits(clerkUserId, totalCredits)`.

Verification:
- Webhooks are verified using `CLERK_WEBHOOK_SECRET` (Svix signature headers required).

## SDK Examples

### JavaScript/TypeScript

```typescript
// API client example
class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  async getCredits() {
    const response = await fetch(`${this.baseUrl}/api/credits/me`, {
      headers: {
        'Authorization': `Bearer ${await getToken()}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    return response.json();
  }
}
```

### Frontend Integration with TanStack Query

The frontend uses a standardized approach for API integration with TanStack Query and a centralized API client.

#### API Client Setup

```typescript
// lib/api-client.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiClient<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;

    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error || `HTTP ${response.status}`;
    } catch {
      errorMessage = errorText || `HTTP ${response.status}`;
    }

    throw new ApiError(errorMessage, response.status, response);
  }

  return response.json();
}

// Convenience methods
export const api = {
  get: <T = any>(url: string, options?: RequestInit) =>
    apiClient<T>(url, { ...options, method: 'GET' }),
  post: <T = any>(url: string, data?: any, options?: RequestInit) =>
    apiClient<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  put: <T = any>(url: string, data?: any, options?: RequestInit) =>
    apiClient<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),
  delete: <T = any>(url: string, options?: RequestInit) =>
    apiClient<T>(url, { ...options, method: 'DELETE' }),
};
```

#### Custom Hook Patterns

```typescript
// hooks/use-credits.ts - Query Hook
import { api } from '@/lib/api-client';

export interface CreditData {
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  billingPeriodEnd: Date | null;
  percentage: number;
  isLow: boolean;
  isEmpty: boolean;
}

export function useCredits() {
  return useQuery<CreditData>({
    queryKey: ['credits'],
    queryFn: () => api.get('/api/credits/me'),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}
```

#### Mutation Hook Example

```typescript
// hooks/admin/use-admin-users.ts - Mutation Hook
export function useUpdateUserCredits() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ userId, credits }: { userId: string; credits: number }) =>
      api.put(`/api/admin/users/${userId}/credits`, { credits }),
    onSuccess: (data, variables) => {
      toast({
        title: "Credits updated",
        description: `New balance: ${variables.credits}`
      });
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'credits'] });
    },
    onError: (error) => {
      toast({
        title: "Error updating credits",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}
```

#### Component Usage

```typescript
// components/admin/user-credit-form.tsx
export function UserCreditForm({ userId }: { userId: string }) {
  const updateCredits = useUpdateUserCredits();
  const [credits, setCredits] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCredits.mutate({ userId, credits });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        value={credits}
        onChange={(e) => setCredits(Number(e.target.value))}
        min={0}
      />
      <button
        type="submit"
        disabled={updateCredits.isPending}
      >
        {updateCredits.isPending ? 'Updating...' : 'Update Credits'}
      </button>
    </form>
  );
}
```

#### Important Rules

1. **Never use fetch() directly** in client components
2. **Always use custom hooks** that wrap TanStack Query
3. **Use the API client** for all HTTP requests
4. **Structure query keys** consistently: `['domain', 'resource', params]`
5. **Handle errors** through the API client's error system
6. **Invalidate caches** properly after mutations


## Testing

### API Testing Example

```typescript
// __tests__/api/credits.test.ts
import { GET } from '@/app/api/credits/me/route';
import { mockAuth, mockDb } from '@/test-utils';

describe('/api/credits/me', () => {
  beforeEach(() => {
    mockAuth({ userId: 'user_123' });
  });

  it('returns credit balance', async () => {
    mockDb.creditBalance.findUnique.mockResolvedValue({
      creditsRemaining: 85,
      lastSyncedAt: new Date(),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.creditsRemaining).toBe(85);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth({ userId: null });

    const response = await GET();

    expect(response.status).toBe(401);
  });
});
```
