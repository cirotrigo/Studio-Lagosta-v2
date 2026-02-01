---
status: filled
generated: 2026-01-31
---

# Testing Strategy

This document describes how quality is maintained in Studio Lagosta.

## Current Testing Approach

Studio Lagosta currently relies primarily on:
- TypeScript type checking
- ESLint for code quality
- Manual testing during development
- Playwright for E2E tests (configured but minimal)

## Test Types

### Type Checking

TypeScript provides compile-time safety:

```bash
npm run typecheck
```

- Catches type errors before runtime
- Non-strict mode (`strict: false`)
- Run before commits

### Linting

ESLint catches code quality issues:

```bash
npm run lint
npm run lint -- --fix  # Auto-fix
```

### End-to-End Tests

Playwright configured for E2E testing:

```bash
# Run E2E tests
npx playwright test

# With UI
npx playwright test --ui
```

Configuration in `playwright.config.ts`:
- Tests in `tests/e2e/`
- Multiple browser support

## Running Quality Checks

### Before Commits

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Build (catches SSR issues)
npm run build
```

### Development Workflow

```bash
# Start dev server
npm run dev

# Manual testing at localhost:3000
# Use Prisma Studio for data inspection
npm run db:studio
```

## Manual Testing Guide

### Testing New API Routes

1. Create route
2. Test with curl or Thunder Client:
```bash
curl -X GET http://localhost:3000/api/endpoint \
  -H "Authorization: Bearer $TOKEN"
```
3. Check response and database state

### Testing Components

1. Start dev server
2. Navigate to relevant page
3. Test interactions
4. Check DevTools for errors
5. Verify network requests

### Testing Webhooks

Use provided test scripts:

```bash
# Test Buffer webhook locally
./test-webhook-local.sh

# For external testing, use ngrok
ngrok http 3000
```

## Quality Gates

### Before Merging

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Manual testing of changed features
- [ ] No console errors in browser

### Before Deployment

- [ ] All quality gates pass
- [ ] Test in Vercel preview deployment
- [ ] Critical paths manually verified

## Testing Patterns

### API Route Testing

```typescript
// Example test pattern for API routes
describe('POST /api/templates', () => {
  it('creates a template for authenticated user', async () => {
    // Setup: Mock auth, create test data
    // Action: Call API endpoint
    // Assert: Check response and database
  });

  it('returns 401 for unauthenticated requests', async () => {
    // Test unauthorized access
  });
});
```

### Component Testing

```typescript
// Example pattern for component tests
describe('TemplateEditor', () => {
  it('renders canvas with correct dimensions', () => {
    // Render component
    // Assert canvas properties
  });

  it('handles layer selection', () => {
    // Simulate user interaction
    // Verify state changes
  });
});
```

## Troubleshooting

### Common Issues

**TypeScript errors in generated files**
- Run `npm run db:push` to regenerate Prisma client
- Check `prisma/generated/` exists

**Build fails but dev works**
- Check for server-side only code in client components
- Verify all imports are valid

**Webhook tests fail**
- Check environment variables
- Verify webhook secrets match

### Environment Quirks

**Database connection in tests**
- Use separate test database
- Reset between test runs

**Auth in tests**
- Mock Clerk authentication
- Use test tokens where needed

## Future Improvements

### Recommended Additions

1. **Unit Tests**
   - Jest for utility functions
   - Test business logic in `lib/`

2. **Integration Tests**
   - API route testing with supertest
   - Database integration tests

3. **Component Tests**
   - React Testing Library
   - Storybook for visual testing

4. **Coverage Tracking**
   - Add coverage reporting
   - Set minimum thresholds

### Test File Conventions

```
src/
├── lib/
│   ├── utils.ts
│   └── utils.test.ts      # Unit tests
├── app/api/
│   └── templates/
│       ├── route.ts
│       └── route.test.ts  # API tests
tests/
├── e2e/                   # Playwright E2E
└── fixtures/              # Test data
```
