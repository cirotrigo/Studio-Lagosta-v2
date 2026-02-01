---
status: filled
generated: 2026-01-31
---

# Glossary & Domain Concepts

This document defines project-specific terminology, acronyms, domain entities, and key concepts used throughout Studio Lagosta.

## Domain Terms

### Content & Design

| Term | Definition |
|------|------------|
| **Template** | A reusable design with layers, styles, and dynamic fields |
| **Layer** | A single element in a design (text, image, shape, background) |
| **Design Data** | JSON structure containing all layers, styles, and canvas config |
| **Generation** | A rendered output from a template with specific field values |
| **Creative** | A finalized design ready for publishing |
| **Canvas** | The working area for visual design (Konva.js stage) |
| **Dynamic Field** | A placeholder in templates that gets replaced with content |

### Social Media

| Term | Definition |
|------|------------|
| **Post** | Content scheduled for social media (SocialPost model) |
| **Story** | Instagram Story (24-hour ephemeral content) |
| **Verification TAG** | Unique identifier added to story captions for verification |
| **Verification Status** | State of story publication check (PENDING, VERIFIED, FAILED, SKIPPED) |
| **Later Account** | Connected Later.com account for scheduling |
| **Buffer** | Service that publishes posts scheduled via Later |

### Business

| Term | Definition |
|------|------------|
| **Organization** | A Clerk organization (multi-tenant container) |
| **Project** | A workspace containing templates and posts |
| **Credit** | Usage-based currency for premium features |
| **Feature Cost** | Credit amount charged per feature usage |
| **Subscription Plan** | Billing tier synced from Clerk Commerce |

## Acronyms

| Acronym | Meaning |
|---------|---------|
| **API** | Application Programming Interface |
| **CRUD** | Create, Read, Update, Delete |
| **JWT** | JSON Web Token (used by Clerk) |
| **ORM** | Object-Relational Mapping (Prisma) |
| **SSR** | Server-Side Rendering |
| **TTL** | Time To Live (24h for Instagram Stories) |

## Key Types

### Design Types

```typescript
// Template layer structure
interface Layer {
  id: string;
  type: 'text' | 'image' | 'shape' | 'background';
  x: number;
  y: number;
  width: number;
  height: number;
  style: LayerStyle;
}

// Canvas configuration
interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor: string;
}

// Complete design
interface DesignData {
  canvas: CanvasConfig;
  layers: Layer[];
}
```

### Post Types

```typescript
// Post status
enum PostStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  POSTED = 'POSTED',
  FAILED = 'FAILED'
}

// Verification status
enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  SKIPPED = 'SKIPPED'
}
```

## User Personas

### Content Creator
- Creates templates and designs
- Schedules posts to Instagram
- Monitors engagement analytics

### Agency Admin
- Manages multiple client projects
- Configures organization settings
- Monitors credit usage

### System Admin
- Configures feature costs
- Manages billing plans
- Monitors system health

## External Services

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| **Clerk** | Authentication & orgs | Middleware, webhooks |
| **Later.com** | Post scheduling | `LaterClient` class |
| **Instagram** | Story verification | `InstagramGraphApiClient` |
| **Vercel Blob** | Media storage | Direct upload |
| **OpenRouter** | AI generation | Credit-based API calls |
| **Zapier/Buffer** | Post publishing | Webhooks |

## Database Models

### Core Models
- **User** - Linked to Clerk via `clerkId`
- **Organization** - Multi-tenant container
- **Project** - Workspace for templates/posts
- **Template** - Design with JSON `designData`
- **SocialPost** - Scheduled/published content

### Supporting Models
- **CreditBalance** - User credit tracking
- **CreditTransaction** - Credit usage history
- **Generation** - Rendered template outputs
- **LaterAccount** - Connected scheduling accounts
