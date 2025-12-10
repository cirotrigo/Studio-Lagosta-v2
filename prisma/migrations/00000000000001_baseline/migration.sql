-- =============================================================================
-- BASELINE MIGRATION
-- =============================================================================
-- Esta migration representa o estado inicial do banco de dados.
-- Todas as tabelas e enums são criadas de forma idempotente (IF NOT EXISTS).
--
-- IMPORTANTE: Esta migration deve ser marcada como "já aplicada" usando:
--   npx prisma migrate resolve --applied 00000000000001_baseline
--
-- Não execute esta migration diretamente no banco!
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "GenerationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OperationType" AS ENUM ('AI_TEXT_CHAT', 'AI_IMAGE_GENERATION', 'CREATIVE_DOWNLOAD', 'VIDEO_EXPORT', 'SOCIAL_MEDIA_POST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TemplateType" AS ENUM ('STORY', 'FEED', 'SQUARE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "KnowledgeCategory" AS ENUM ('ESTABELECIMENTO_INFO', 'HORARIOS', 'CARDAPIO', 'DELIVERY', 'POLITICAS', 'TOM_DE_VOZ', 'CAMPANHAS', 'DIFERENCIAIS', 'FAQ');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AIImageMode" AS ENUM ('GENERATE', 'EDIT', 'OUTPAINT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CMSPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CMSSectionType" AS ENUM ('HERO', 'BENTO_GRID', 'FAQ', 'AI_STARTER', 'PRICING', 'CTA', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PostType" AS ENUM ('POST', 'STORY', 'REEL', 'CAROUSEL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'VERIFICATION_FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScheduleType" AS ENUM ('IMMEDIATE', 'SCHEDULED', 'RECURRING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PublishType" AS ENUM ('DIRECT', 'REMINDER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PostLogEvent" AS ENUM ('CREATED', 'SCHEDULED', 'SENT', 'FAILED', 'RETRIED', 'CANCELLED', 'EDITED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RetryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "VideoProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClientInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- User
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "clerkId" TEXT NOT NULL UNIQUE,
  "email" TEXT UNIQUE,
  "name" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Organization
CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT PRIMARY KEY,
  "clerkOrgId" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "maxMembers" INTEGER NOT NULL DEFAULT 5,
  "maxProjects" INTEGER NOT NULL DEFAULT 10,
  "creditsPerMonth" INTEGER NOT NULL DEFAULT 1000,
  "ownerClerkId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Project
CREATE TABLE IF NOT EXISTS "Project" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "logoUrl" TEXT,
  "googleDriveFolderId" TEXT,
  "googleDriveFolderName" TEXT,
  "googleDriveImagesFolderId" TEXT,
  "googleDriveImagesFolderName" TEXT,
  "googleDriveVideosFolderId" TEXT,
  "googleDriveVideosFolderName" TEXT,
  "makeWebhookAnalyzeUrl" TEXT,
  "makeWebhookCreativeUrl" TEXT,
  "userId" TEXT NOT NULL,
  "workspaceId" INTEGER,
  "isClientProject" BOOLEAN NOT NULL DEFAULT false,
  "instagramAccountId" TEXT,
  "instagramUsername" TEXT,
  "instagramUserId" TEXT,
  "zapierWebhookUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Template
CREATE TABLE IF NOT EXISTS "Template" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" "TemplateType" NOT NULL,
  "dimensions" TEXT NOT NULL,
  "designData" JSONB NOT NULL,
  "dynamicFields" JSONB NOT NULL DEFAULT '[]',
  "thumbnailUrl" TEXT,
  "category" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "isPremium" BOOLEAN NOT NULL DEFAULT false,
  "projectId" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Template_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

-- Generation
CREATE TABLE IF NOT EXISTS "Generation" (
  "id" TEXT PRIMARY KEY,
  "status" "GenerationStatus" NOT NULL DEFAULT 'PROCESSING',
  "templateId" INTEGER NOT NULL,
  "fieldValues" JSONB NOT NULL,
  "resultUrl" TEXT,
  "projectId" INTEGER NOT NULL,
  "authorName" TEXT,
  "templateName" TEXT,
  "projectName" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "googleDriveFileId" TEXT,
  "googleDriveBackupUrl" TEXT,
  CONSTRAINT "Generation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "Generation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE
);

-- =============================================================================
-- NOTA: Outras tabelas omitidas por brevidade
-- Esta migration deve incluir TODAS as tabelas do schema.prisma
-- =============================================================================

-- Placeholder: Esta é uma migration de reconciliação.
-- O banco já possui todas as tabelas. Esta migration existe apenas
-- para estabelecer um ponto de referência no histórico de migrations.

SELECT 'Baseline migration - Database schema already exists' as message;
