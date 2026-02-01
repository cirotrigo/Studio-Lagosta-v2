---
status: filled
generated: 2026-01-31
---

# Security & Compliance Notes

This document captures the security policies and guardrails for Studio Lagosta.

## Authentication & Authorization

### Identity Provider: Clerk

Studio Lagosta uses Clerk for authentication:
- **JWT Tokens**: Stateless authentication via signed tokens
- **Session Management**: Handled by Clerk SDK
- **Multi-tenant**: Organization-based access control

### Authentication Flow

```
Browser → Clerk SDK → JWT Token → Next.js Middleware → API Routes
```

1. User signs in via Clerk (email/password, OAuth)
2. Clerk issues JWT token stored in cookie
3. Middleware validates token on each request
4. API routes use `auth()` to get authenticated user

### Authorization

#### Route Protection

```typescript
// middleware.ts
export default clerkMiddleware(async (auth, req) => {
  // Public routes don't require auth
  // Protected routes validated by Clerk
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

#### Resource Ownership

All API routes verify resource ownership:

```typescript
// Check user owns the resource
const template = await prisma.template.findFirst({
  where: { id, userId: user.id }
});
if (!template) return new Response('Not found', { status: 404 });
```

### Role-Based Access

| Role | Capabilities |
|------|-------------|
| User | Create/manage own content |
| Org Admin | Manage organization settings |
| System Admin | Access admin panel, configure features |

## Secrets & Sensitive Data

### Environment Variables

All secrets stored as environment variables:

```bash
# Never commit these to version control
CLERK_SECRET_KEY=sk_...
DATABASE_URL=postgresql://...
INSTAGRAM_ACCESS_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

### Secret Storage

| Environment | Storage |
|-------------|---------|
| Development | `.env` file (gitignored) |
| Production | Vercel Environment Variables |

### Data Classification

| Classification | Examples | Handling |
|----------------|----------|----------|
| **Secrets** | API keys, tokens | Environment variables only |
| **PII** | Email, names | Encrypted in DB, limited access |
| **Content** | Designs, posts | User-owned, org-scoped |
| **Logs** | Request data | Sanitized, no secrets |

## Input Validation

### API Validation

All user input validated with Zod schemas:

```typescript
const createPostSchema = z.object({
  caption: z.string().max(2200),
  scheduledDatetime: z.string().datetime(),
  mediaUrls: z.array(z.string().url()),
});

const data = createPostSchema.parse(await request.json());
```

### SQL Injection Prevention

Prisma ORM provides parameterized queries by default:

```typescript
// Safe - parameterized
prisma.user.findUnique({ where: { email } });

// Never use raw SQL with user input
```

## Webhook Security

### Signature Verification

All webhooks verify signatures:

```typescript
// Clerk webhook
const payload = await request.text();
const headers = Object.fromEntries(request.headers);
const evt = wh.verify(payload, headers);

// Buffer webhook
const signature = request.headers.get('x-buffer-signature');
const isValid = verifyBufferSignature(body, signature);
```

### Webhook Secrets

| Service | Secret Variable |
|---------|-----------------|
| Clerk | `CLERK_WEBHOOK_SECRET` |
| Buffer | Signature verification |
| Cron | `CRON_SECRET` header |

## API Security

### Rate Limiting

- Implemented at service level (Later API: 120/min)
- Vercel provides edge-level rate limiting

### Error Handling

Errors sanitized before logging:

```typescript
// Remove sensitive data
const sanitizedError = {
  message: error.message,
  code: error.code,
  // Never log: tokens, passwords, full request bodies
};
```

## Data Protection

### Database Security

- PostgreSQL with TLS connections
- Prisma client uses connection pooling
- Credentials in environment variables only

### Storage Security

- Vercel Blob with access tokens
- Pre-signed URLs for uploads
- Content-type validation

## Compliance Considerations

### GDPR

- User data deletable on request
- Data export capabilities
- Privacy policy required

### Best Practices

- [ ] Regular dependency updates
- [ ] Security audit of new features
- [ ] Monitor for suspicious activity
- [ ] Document security decisions

## Incident Response

### Security Issues

1. **Detect**: Monitor logs for anomalies
2. **Contain**: Revoke compromised tokens
3. **Investigate**: Review audit logs
4. **Remediate**: Patch vulnerabilities
5. **Document**: Post-incident report

### Token Rotation

| Token | Rotation |
|-------|----------|
| Clerk keys | On compromise |
| Instagram token | Every 60 days |
| Database URL | On compromise |

## Security Checklist

When adding new features:

- [ ] Input validated with Zod
- [ ] Resource ownership checked
- [ ] No secrets in code or logs
- [ ] Webhook signatures verified
- [ ] Error messages sanitized
- [ ] Auth required where appropriate
