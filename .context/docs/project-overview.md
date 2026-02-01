---
status: filled
generated: 2026-01-31
---

# Project Overview

Studio Lagosta is a comprehensive social media content management platform designed for creators and agencies. It provides a complete workflow for designing, scheduling, and publishing visual content to Instagram and other social media platforms.

## Quick Facts

- **Root path**: `/Users/cirotrigo/Documents/Studio-Lagosta-v2`
- **Framework**: Next.js 15.3.5 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Clerk
- **Deployment**: Vercel

### Primary languages detected:
- .ts (527 files) - TypeScript source code
- .tsx (391 files) - React components
- .md (180 files) - Documentation
- .sql (53 files) - Database migrations
- .js (28 files) - Configuration and scripts

## Problem Statement

Content creators and social media agencies face challenges managing:
1. Visual content design at scale
2. Multi-platform scheduling and publishing
3. Instagram Stories verification (confirming posts were actually published)
4. Template management and brand consistency
5. Music and audio integration for video content
6. Team collaboration and credit-based usage tracking

Studio Lagosta solves these by providing an integrated platform with a visual canvas editor, scheduling tools, and automated verification systems.

## Core Capabilities

### Visual Design Engine
- **Canvas Editor**: Konva.js-based editor for creating Instagram posts, stories, and reels
- **Template System**: Reusable templates with dynamic fields
- **Text Effects**: Curved text, shadows, strokes, backgrounds
- **Rich Text**: Full rich text editing with style segments
- **AI Image Generation**: Integration with multiple AI providers (OpenRouter)

### Social Media Management
- **Scheduling**: Calendar-based post scheduling with Later API integration
- **Instagram Publishing**: Automated publishing via Zapier/Buffer workflow
- **Story Verification**: Unique tag system to verify Instagram Stories were published
- **Analytics**: Instagram insights and engagement tracking

### Content Library
- **Media Storage**: Vercel Blob storage for images and videos
- **Music Library**: Audio stem separation using Demucs
- **Font Management**: Custom font support for brand consistency

### Business Features
- **Multi-tenant**: Organization-based access with Clerk
- **Credit System**: Usage-based billing with credit tracking
- **Knowledge Base**: AI-powered knowledge management with embeddings

## Entry Points

Main application entry points:
- [`src/app/page.tsx`](src/app/page.tsx) - Landing page
- [`src/app/(protected)/studio/page.tsx`](src/app/(protected)/studio/page.tsx) - Main studio/dashboard
- [`src/app/(protected)/projects/page.tsx`](src/app/(protected)/projects/page.tsx) - Project management
- [`src/app/admin/page.tsx`](src/app/admin/page.tsx) - Admin panel

API routes:
- [`src/app/api/`](src/app/api/) - REST API endpoints
- [`src/app/api/webhooks/`](src/app/api/webhooks/) - Webhook handlers (Buffer, Clerk, Later)
- [`src/app/api/cron/`](src/app/api/cron/) - Scheduled tasks (verification, cleanup)

## Key Components

### Services
| Class | Purpose |
|-------|---------|
| [`GoogleDriveService`](src/server/google-drive-service.ts#L70) | Google Drive integration for media |
| [`RenderEngine`](src/lib/render-engine.ts#L28) | Server-side canvas rendering |
| [`FontManager`](src/lib/font-manager.ts#L25) | Custom font loading and management |
| [`PostScheduler`](src/lib/posts/scheduler.ts#L37) | Social media post scheduling |
| [`PostExecutor`](src/lib/posts/executor.ts#L13) | Post publishing execution |
| [`StoryVerifier`](src/lib/posts/verification/story-verifier.ts#L49) | Instagram story verification |
| [`LaterClient`](src/lib/later/client.ts#L44) | Later.com API client |
| [`InstagramGraphApiClient`](src/lib/instagram/graph-api-client.ts#L75) | Instagram Graph API |

### React Hooks
Custom hooks for data fetching with TanStack Query:
- `use-templates.ts` - Template CRUD operations
- `use-credits.ts` - Credit balance management
- `use-later-accounts.ts` - Later.com account management
- `use-instagram-analytics.ts` - Instagram insights
- `use-youtube-download.ts` - YouTube to MP3 conversion

## Technology Stack

### Core Framework Stack
- **Runtime**: Node.js 18+
- **Framework**: Next.js 15.3.5 (App Router)
- **Language**: TypeScript (non-strict mode)
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: Clerk
- **Storage**: Vercel Blob

### UI & Interaction Libraries
- **CSS**: Tailwind CSS v4
- **Components**: Radix UI primitives
- **Canvas**: Konva.js + React-Konva
- **Forms**: React Hook Form + Zod
- **Data Fetching**: TanStack Query (React Query)

### Development Tools
- **Build**: Next.js bundler (Turbopack in dev)
- **Linting**: ESLint
- **Type Checking**: TypeScript (`npm run typecheck`)
- **Database GUI**: Prisma Studio (`npm run db:studio`)

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env` and configure environment variables
3. Install dependencies: `npm install`
4. Set up database: `npm run db:push`
5. Start development server: `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000)

## Next Steps

- Review [Architecture](./architecture.md) for system design details
- See [Development Workflow](./development-workflow.md) for daily development tasks
- Check [Data Flow](./data-flow.md) for understanding request/response patterns
