-- =============================================================================
-- INIT — estado consolidado do schema
-- =============================================================================
-- Substitui o histórico anterior, que não podia ser reproduzido: o baseline
-- não criava Prompt nem Organization, e migrations seguintes tentavam alterá-las.
-- Isso quebrava o shadow database e impedia `prisma migrate dev`.
--
-- Idempotente de propósito: aplicar num banco já populado é no-op, em vez de
-- falhar. Em bancos existentes esta migration é marcada como aplicada com
--   npx prisma migrate resolve --applied 0_init
-- =============================================================================

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClientInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "GenerationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OperationType" AS ENUM ('AI_TEXT_CHAT', 'AI_IMAGE_GENERATION', 'CREATIVE_DOWNLOAD', 'VIDEO_EXPORT', 'SOCIAL_MEDIA_POST', 'BACKGROUND_REMOVAL', 'AI_CREATIVE_IMPROVEMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TemplateType" AS ENUM ('STORY', 'FEED', 'SQUARE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "KnowledgeCategory" AS ENUM ('ESTABELECIMENTO_INFO', 'HORARIOS', 'CARDAPIO', 'DELIVERY', 'POLITICAS', 'TOM_DE_VOZ', 'CAMPANHAS', 'DIFERENCIAIS', 'FAQ');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AIImageMode" AS ENUM ('GENERATE', 'EDIT', 'OUTPAINT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CMSPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CMSSectionType" AS ENUM ('HERO', 'BENTO_GRID', 'FAQ', 'AI_STARTER', 'PRICING', 'CTA', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VideoProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PostType" AS ENUM ('POST', 'STORY', 'REEL', 'CAROUSEL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'VERIFICATION_FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ScheduleType" AS ENUM ('IMMEDIATE', 'SCHEDULED', 'RECURRING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PublishType" AS ENUM ('DIRECT', 'REMINDER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PostingProvider" AS ENUM ('ZAPIER', 'LATER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PostLogEvent" AS ENUM ('CREATED', 'SCHEDULED', 'SENT', 'FAILED', 'RETRIED', 'CANCELLED', 'EDITED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RetryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RenderStatus" AS ENUM ('NOT_NEEDED', 'PENDING', 'RENDERING', 'RENDERED', 'RENDER_FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "featureCosts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "creditsRemaining" INTEGER NOT NULL DEFAULT 100,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomFont" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fontFamily" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFont_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FontCombination" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "elements" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FontCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Element" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "category" TEXT,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Element_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Feature" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Generation" (
    "id" TEXT NOT NULL,
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
    "fileName" TEXT,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Logo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isProjectLogo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Logo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandColor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hexCode" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "clerkName" TEXT,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT,
    "priceMonthlyCents" INTEGER,
    "priceYearlyCents" INTEGER,
    "badge" TEXT,
    "ctaLabel" TEXT,
    "ctaType" TEXT DEFAULT 'checkout',
    "ctaUrl" TEXT,
    "description" TEXT,
    "features" JSONB,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "billingSource" TEXT NOT NULL DEFAULT 'clerk',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowOrgCreation" BOOLEAN NOT NULL DEFAULT false,
    "orgMemberLimit" INTEGER,
    "orgProjectLimit" INTEGER,
    "orgCreditsPerMonth" INTEGER,
    "orgCountLimit" INTEGER,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "logoUrl" TEXT,
    "googleDriveFolderId" TEXT,
    "makeWebhookAnalyzeUrl" TEXT,
    "makeWebhookCreativeUrl" TEXT,
    "userId" TEXT NOT NULL,
    "workspaceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleDriveFolderName" TEXT,
    "googleDriveImagesFolderId" TEXT,
    "googleDriveImagesFolderName" TEXT,
    "googleDriveVideosFolderId" TEXT,
    "googleDriveVideosFolderName" TEXT,
    "instagramAccountId" TEXT,
    "instagramUsername" TEXT,
    "zapierWebhookUrl" TEXT,
    "isClientProject" BOOLEAN NOT NULL DEFAULT false,
    "instagramUserId" TEXT,
    "instagramAccessToken" TEXT,
    "instagramTokenExpiresAt" TIMESTAMP(3),
    "instagramAppScopedId" TEXT,
    "aiChatBehavior" TEXT,
    "laterAccountId" TEXT,
    "laterProfileId" TEXT,
    "postingProvider" "PostingProvider" DEFAULT 'ZAPIER',
    "webhookReminderUrl" TEXT,
    "brandStyleDescription" TEXT,
    "brandVisualElements" JSONB,
    "brandReferenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cuisineType" TEXT,
    "titleFontFamily" TEXT,
    "bodyFontFamily" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "clientName" TEXT,
    "projectName" TEXT NOT NULL,
    "projectDescription" TEXT,
    "googleDriveFolderId" TEXT,
    "googleDriveFolderName" TEXT,
    "googleDriveImagesFolderId" TEXT,
    "googleDriveImagesFolderName" TEXT,
    "googleDriveVideosFolderId" TEXT,
    "googleDriveVideosFolderName" TEXT,
    "instagramAccountId" TEXT,
    "instagramUsername" TEXT,
    "zapierWebhookUrl" TEXT,
    "clerkInvitationId" TEXT,
    "inviteUrl" TEXT,
    "status" "ClientInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "invitedByName" TEXT,
    "userId" TEXT,
    "projectId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ClientInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DriveSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteFolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultView" TEXT NOT NULL DEFAULT 'grid',
    "itemsPerPage" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DriveFileCache" (
    "id" TEXT NOT NULL,
    "googleFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "size" INTEGER,
    "thumbnailUrl" TEXT,
    "lastSynced" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFileCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxMembers" INTEGER NOT NULL DEFAULT 5,
    "maxProjects" INTEGER NOT NULL DEFAULT 10,
    "creditsPerMonth" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerClerkId" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationCreditBalance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "lastRefill" TIMESTAMP(3),
    "refillAmount" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" INTEGER,

    CONSTRAINT "OrganizationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "defaultCanEdit" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StorageObject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'vercel_blob',
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "clerkUserId" TEXT NOT NULL,
    "planKey" TEXT,
    "status" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Template" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "dimensions" TEXT NOT NULL,
    "designData" JSONB NOT NULL,
    "dynamicFields" JSONB NOT NULL DEFAULT '[]',
    "thumbnailUrl" TEXT,
    "projectId" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "localId" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Page" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "layers" JSONB NOT NULL DEFAULT '[]',
    "background" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "templateId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UsageHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditBalanceId" TEXT NOT NULL,
    "operationType" "OperationType" NOT NULL,
    "creditsUsed" INTEGER NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,

    CONSTRAINT "UsageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrganizationMemberAnalytics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberClerkId" TEXT NOT NULL,
    "memberUserId" TEXT,
    "imageGenerationsCount" INTEGER NOT NULL DEFAULT 0,
    "videoGenerationsCount" INTEGER NOT NULL DEFAULT 0,
    "chatInteractionsCount" INTEGER NOT NULL DEFAULT 0,
    "totalCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMemberAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AIGeneratedImage" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" "AIImageMode" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'replicate',
    "model" TEXT NOT NULL,
    "predictionId" TEXT,
    "sourceImageId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIGeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "knowledge_base_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "status" "EntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" INTEGER NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_base_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER,
    "vectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CMSPage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "status" "CMSPageStatus" NOT NULL DEFAULT 'DRAFT',
    "isHome" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT,
    "metaDesc" TEXT,
    "ogImage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CMSSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" "CMSSectionType" NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "cssClasses" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CMSMenu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CMSMenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "target" TEXT DEFAULT '_self',
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CMSComponent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "thumbnail" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CMSMedia" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT,
    "caption" TEXT,
    "folder" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMSMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SiteSettings" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL DEFAULT 'Studio Lagosta',
    "shortName" TEXT NOT NULL DEFAULT 'Studio Lagosta',
    "description" TEXT NOT NULL,
    "logoLight" TEXT NOT NULL DEFAULT '/logo-light.svg',
    "logoDark" TEXT NOT NULL DEFAULT '/logo-dark.svg',
    "favicon" TEXT NOT NULL DEFAULT '/favicon.ico',
    "appleIcon" TEXT,
    "metaTitle" TEXT,
    "metaDesc" TEXT,
    "ogImage" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportEmail" TEXT,
    "twitter" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "linkedin" TEXT,
    "github" TEXT,
    "gtmId" TEXT,
    "gaId" TEXT,
    "facebookPixelId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "logoFullDark" TEXT,
    "logoFullLight" TEXT,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeatureGridItem" (
    "id" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "iconColor" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gridArea" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureGridItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromptLibrary" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "category" TEXT,
    "projectId" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Prompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "referenceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VideoProcessingJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "status" "VideoProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "webmBlobUrl" TEXT NOT NULL,
    "webmFileSize" INTEGER NOT NULL,
    "mp4ResultUrl" TEXT,
    "thumbnailUrl" TEXT,
    "videoName" TEXT NOT NULL,
    "videoDuration" DOUBLE PRECISION NOT NULL,
    "videoWidth" INTEGER NOT NULL,
    "videoHeight" INTEGER NOT NULL,
    "designData" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "creditsDeducted" BOOLEAN NOT NULL DEFAULT false,
    "creditsUsed" INTEGER NOT NULL DEFAULT 10,
    "generationId" TEXT,
    "audioFadeIn" DOUBLE PRECISION,
    "audioFadeOut" DOUBLE PRECISION,
    "audioLoop" BOOLEAN DEFAULT false,
    "audioSource" TEXT,
    "audioVolume" DOUBLE PRECISION DEFAULT 1.0,
    "musicEndTime" DOUBLE PRECISION,
    "musicId" INTEGER,
    "musicStartTime" DOUBLE PRECISION,

    CONSTRAINT "VideoProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "generationId" TEXT,
    "userId" TEXT NOT NULL,
    "postType" "PostType" NOT NULL,
    "caption" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "altText" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstComment" TEXT,
    "scheduleType" "ScheduleType" NOT NULL,
    "scheduledDatetime" TIMESTAMP(3),
    "recurringConfig" JSONB,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "webhookResponse" JSONB,
    "zapierWebhookUrl" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "parentPostId" TEXT,
    "originalScheduleType" "ScheduleType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishType" "PublishType" NOT NULL DEFAULT 'DIRECT',
    "blobPathnames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bufferId" TEXT,
    "bufferSentAt" TIMESTAMP(3),
    "instagramMediaId" TEXT,
    "publishedUrl" TEXT,
    "verificationTag" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'SKIPPED',
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextVerificationAt" TIMESTAMP(3),
    "lastVerificationAt" TIMESTAMP(3),
    "verifiedStoryId" TEXT,
    "verifiedPermalink" TEXT,
    "verifiedTimestamp" TIMESTAMP(3),
    "verifiedByFallback" BOOLEAN NOT NULL DEFAULT false,
    "verificationError" TEXT,
    "laterPostId" TEXT,
    "analyticsComments" INTEGER,
    "analyticsEngagement" INTEGER,
    "analyticsFetchedAt" TIMESTAMP(3),
    "analyticsImpressions" INTEGER,
    "analyticsLikes" INTEGER,
    "analyticsReach" INTEGER,
    "analyticsShares" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "latePlatformUrl" TEXT,
    "latePublishedAt" TIMESTAMP(3),
    "lateStatus" TEXT,
    "reminderExtraInfo" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "pageId" TEXT,
    "templateId" INTEGER,
    "slotValues" JSONB,
    "renderStatus" "RenderStatus" NOT NULL DEFAULT 'NOT_NEEDED',
    "renderedImageUrl" TEXT,
    "renderedAt" TIMESTAMP(3),
    "renderAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextRenderAt" TIMESTAMP(3),
    "renderError" TEXT,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PostRetry" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "RetryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostRetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PostLog" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "event" "PostLogEvent" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Nova Conversa',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" INTEGER,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstagramStory" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "organizationId" TEXT,
    "mediaId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "mediaType" "InstagramMediaType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "tapsForward" INTEGER NOT NULL DEFAULT 0,
    "tapsBack" INTEGER NOT NULL DEFAULT 0,
    "exits" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "countedInGoal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstagramFeed" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "organizationId" TEXT,
    "mediaId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "mediaType" "InstagramMediaType" NOT NULL,
    "caption" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "permalink" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "engagement" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "saved" INTEGER NOT NULL DEFAULT 0,
    "countedInGoal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstagramDailySummary" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "organizationId" TEXT,
    "username" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "storiesGoal" INTEGER NOT NULL DEFAULT 3,
    "storiesPublished" INTEGER NOT NULL DEFAULT 0,
    "feedsPublished" INTEGER NOT NULL DEFAULT 0,
    "storiesCompletionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goalMet" BOOLEAN NOT NULL DEFAULT false,
    "totalStoryReach" INTEGER NOT NULL DEFAULT 0,
    "totalStoryImpressions" INTEGER NOT NULL DEFAULT 0,
    "totalFeedEngagement" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstagramWeeklyReport" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "organizationId" TEXT,
    "username" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "feedsGoal" INTEGER NOT NULL DEFAULT 4,
    "storiesGoal" INTEGER NOT NULL DEFAULT 21,
    "feedsPublished" INTEGER NOT NULL DEFAULT 0,
    "storiesPublished" INTEGER NOT NULL DEFAULT 0,
    "feedsCompletionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storiesCompletionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallCompletionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" CHAR(1) NOT NULL,
    "daysWithoutPost" INTEGER NOT NULL DEFAULT 0,
    "bestPerformingFeedId" TEXT,
    "totalEngagement" INTEGER NOT NULL DEFAULT 0,
    "metricsJson" JSONB NOT NULL,
    "alerts" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramWeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstagramGoalSettings" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "organizationId" TEXT,
    "weeklyFeedGoal" INTEGER NOT NULL DEFAULT 4,
    "dailyStoryGoal" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramGoalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MusicLibrary" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "artist" TEXT,
    "duration" DOUBLE PRECISION NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobSize" INTEGER NOT NULL,
    "genre" TEXT,
    "mood" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "projectId" INTEGER,
    "stemsProcessedAt" TIMESTAMP(3),
    "hasInstrumentalStem" BOOLEAN NOT NULL DEFAULT false,
    "instrumentalSize" INTEGER,
    "instrumentalUrl" TEXT,

    CONSTRAINT "MusicLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MusicStemJob" (
    "id" SERIAL NOT NULL,
    "musicId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "mvsepJobHash" TEXT,
    "mvsepStatus" TEXT,
    "percussionBlobUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MusicStemJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "YoutubeDownloadJob" (
    "id" SERIAL NOT NULL,
    "youtubeUrl" TEXT NOT NULL,
    "youtubeId" TEXT,
    "requestedName" TEXT,
    "requestedArtist" TEXT,
    "requestedGenre" TEXT,
    "requestedMood" TEXT,
    "projectId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "videoApiJobId" TEXT,
    "videoApiStatus" TEXT,
    "musicId" INTEGER,
    "title" TEXT,
    "duration" DOUBLE PRECISION,
    "thumbnail" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "YoutubeDownloadJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AICreativeGeneration" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "pageId" TEXT NOT NULL,
    "layoutType" TEXT NOT NULL,
    "imageSource" JSONB NOT NULL,
    "textsData" JSONB NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICreativeGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditBalance_userId_key" ON "CreditBalance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditBalance_clerkUserId_key" ON "CreditBalance"("clerkUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditBalance_clerkUserId_idx" ON "CreditBalance"("clerkUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditBalance_creditsRemaining_idx" ON "CreditBalance"("creditsRemaining");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditBalance_lastSyncedAt_idx" ON "CreditBalance"("lastSyncedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditBalance_userId_idx" ON "CreditBalance"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomFont_projectId_idx" ON "CustomFont"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FontCombination_projectId_idx" ON "FontCombination"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Element_category_idx" ON "Element"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Element_projectId_idx" ON "Element"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feature_workspaceId_idx" ON "Feature"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Generation_createdAt_idx" ON "Generation"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Generation_createdBy_idx" ON "Generation"("createdBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Generation_projectId_idx" ON "Generation"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Generation_status_idx" ON "Generation"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Generation_templateId_idx" ON "Generation"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Logo_projectId_idx" ON "Logo"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Logo_projectId_isProjectLogo_idx" ON "Logo"("projectId", "isProjectLogo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrandColor_projectId_idx" ON "BrandColor"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_clerkId_key" ON "Plan"("clerkId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Plan_active_idx" ON "Plan"("active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_updatedAt_idx" ON "Project"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_isClientProject_idx" ON "Project"("isClientProject");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectTag_projectId_idx" ON "ProjectTag"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTag_projectId_name_key" ON "ProjectTag"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientInvite_clerkInvitationId_key" ON "ClientInvite"("clerkInvitationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientInvite_userId_key" ON "ClientInvite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientInvite_projectId_key" ON "ClientInvite"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientInvite_email_idx" ON "ClientInvite"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientInvite_status_idx" ON "ClientInvite"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientInvite_createdAt_idx" ON "ClientInvite"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientInvite_invitedBy_idx" ON "ClientInvite"("invitedBy");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DriveSettings_userId_key" ON "DriveSettings"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DriveSettings_userId_idx" ON "DriveSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DriveFileCache_googleFileId_key" ON "DriveFileCache"("googleFileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DriveFileCache_parentId_idx" ON "DriveFileCache"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DriveFileCache_kind_idx" ON "DriveFileCache"("kind");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DriveFileCache_lastSynced_idx" ON "DriveFileCache"("lastSynced");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_clerkOrgId_idx" ON "Organization"("clerkOrgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_ownerClerkId_idx" ON "Organization"("ownerClerkId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationCreditBalance_organizationId_key" ON "OrganizationCreditBalance"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationCreditBalance_organizationId_idx" ON "OrganizationCreditBalance"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationUsage_organizationId_idx" ON "OrganizationUsage"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationUsage_userId_idx" ON "OrganizationUsage"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationUsage_createdAt_idx" ON "OrganizationUsage"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationUsage_projectId_idx" ON "OrganizationUsage"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationProject_projectId_idx" ON "OrganizationProject"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationProject_organizationId_idx" ON "OrganizationProject"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationProject_organizationId_projectId_key" ON "OrganizationProject"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageObject_clerkUserId_idx" ON "StorageObject"("clerkUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageObject_contentType_idx" ON "StorageObject"("contentType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageObject_createdAt_idx" ON "StorageObject"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageObject_deletedAt_idx" ON "StorageObject"("deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageObject_name_idx" ON "StorageObject"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageObject_userId_idx" ON "StorageObject"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_clerkUserId_occurredAt_idx" ON "SubscriptionEvent"("clerkUserId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_userId_occurredAt_idx" ON "SubscriptionEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_createdBy_idx" ON "Template"("createdBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_projectId_idx" ON "Template"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_type_idx" ON "Template"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_isPublic_idx" ON "Template"("isPublic");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_localId_idx" ON "Template"("localId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Page_templateId_idx" ON "Page"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Page_order_idx" ON "Page"("order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Page_isTemplate_idx" ON "Page"("isTemplate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_creditBalanceId_idx" ON "UsageHistory"("creditBalanceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_operationType_idx" ON "UsageHistory"("operationType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_operationType_timestamp_idx" ON "UsageHistory"("operationType", "timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_timestamp_idx" ON "UsageHistory"("timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_userId_idx" ON "UsageHistory"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_userId_timestamp_idx" ON "UsageHistory"("userId", "timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageHistory_organizationId_timestamp_idx" ON "UsageHistory"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationMemberAnalytics_organizationId_periodStart_idx" ON "OrganizationMemberAnalytics"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationMemberAnalytics_memberClerkId_idx" ON "OrganizationMemberAnalytics"("memberClerkId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationMemberAnalytics_memberUserId_idx" ON "OrganizationMemberAnalytics"("memberUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizationMemberAnalytics_periodStart_periodEnd_idx" ON "OrganizationMemberAnalytics"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMemberAnalytics_organizationId_memberClerkId_pe_key" ON "OrganizationMemberAnalytics"("organizationId", "memberClerkId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIGeneratedImage_projectId_idx" ON "AIGeneratedImage"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIGeneratedImage_createdBy_idx" ON "AIGeneratedImage"("createdBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIGeneratedImage_mode_idx" ON "AIGeneratedImage"("mode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIGeneratedImage_createdAt_idx" ON "AIGeneratedImage"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_projectId_idx" ON "knowledge_base_entries"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_projectId_category_idx" ON "knowledge_base_entries"("projectId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_projectId_status_idx" ON "knowledge_base_entries"("projectId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_userId_idx" ON "knowledge_base_entries"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_workspaceId_idx" ON "knowledge_base_entries"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_status_idx" ON "knowledge_base_entries"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_createdBy_idx" ON "knowledge_base_entries"("createdBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_expiresAt_idx" ON "knowledge_base_entries"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_base_entries_projectId_expiresAt_idx" ON "knowledge_base_entries"("projectId", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_chunks_entryId_idx" ON "knowledge_chunks"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_chunks_entryId_ordinal_key" ON "knowledge_chunks"("entryId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CMSPage_slug_key" ON "CMSPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CMSPage_path_key" ON "CMSPage"("path");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSPage_slug_idx" ON "CMSPage"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSPage_path_idx" ON "CMSPage"("path");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSPage_status_idx" ON "CMSPage"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSPage_isHome_idx" ON "CMSPage"("isHome");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSPage_publishedAt_idx" ON "CMSPage"("publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSSection_pageId_idx" ON "CMSSection"("pageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSSection_type_idx" ON "CMSSection"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSSection_order_idx" ON "CMSSection"("order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CMSMenu_slug_key" ON "CMSMenu"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMenu_slug_idx" ON "CMSMenu"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMenu_location_idx" ON "CMSMenu"("location");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMenuItem_menuId_idx" ON "CMSMenuItem"("menuId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMenuItem_parentId_idx" ON "CMSMenuItem"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMenuItem_order_idx" ON "CMSMenuItem"("order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CMSComponent_slug_key" ON "CMSComponent"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSComponent_slug_idx" ON "CMSComponent"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSComponent_type_idx" ON "CMSComponent"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSComponent_isGlobal_idx" ON "CMSComponent"("isGlobal");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMedia_folder_idx" ON "CMSMedia"("folder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMedia_mimeType_idx" ON "CMSMedia"("mimeType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CMSMedia_uploadedBy_idx" ON "CMSMedia"("uploadedBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SiteSettings_isActive_idx" ON "SiteSettings"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeatureGridItem_order_idx" ON "FeatureGridItem"("order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeatureGridItem_isActive_idx" ON "FeatureGridItem"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromptLibrary_projectId_idx" ON "PromptLibrary"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromptLibrary_createdBy_idx" ON "PromptLibrary"("createdBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Prompt_userId_idx" ON "Prompt"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Prompt_category_idx" ON "Prompt"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Prompt_createdAt_idx" ON "Prompt"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Prompt_organizationId_idx" ON "Prompt"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VideoProcessingJob_generationId_key" ON "VideoProcessingJob"("generationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_userId_idx" ON "VideoProcessingJob"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_clerkUserId_idx" ON "VideoProcessingJob"("clerkUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_status_idx" ON "VideoProcessingJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_createdAt_idx" ON "VideoProcessingJob"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_templateId_idx" ON "VideoProcessingJob"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_projectId_idx" ON "VideoProcessingJob"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoProcessingJob_musicId_idx" ON "VideoProcessingJob"("musicId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_idx" ON "SocialPost"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_userId_idx" ON "SocialPost"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_status_idx" ON "SocialPost"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_scheduledDatetime_idx" ON "SocialPost"("scheduledDatetime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_status_idx" ON "SocialPost"("projectId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_status_scheduledDatetime_idx" ON "SocialPost"("status", "scheduledDatetime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_scheduleType_idx" ON "SocialPost"("scheduleType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_generationId_idx" ON "SocialPost"("generationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_parentPostId_idx" ON "SocialPost"("parentPostId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_verificationStatus_nextVerificationAt_idx" ON "SocialPost"("verificationStatus", "nextVerificationAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_verificationTag_idx" ON "SocialPost"("verificationTag");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_scheduledDatetime_idx" ON "SocialPost"("projectId", "scheduledDatetime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_status_scheduleType_idx" ON "SocialPost"("projectId", "status", "scheduleType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_scheduleType_status_idx" ON "SocialPost"("projectId", "scheduleType", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_status_scheduleType_scheduledDatetime_idx" ON "SocialPost"("status", "scheduleType", "scheduledDatetime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_laterPostId_idx" ON "SocialPost"("laterPostId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_laterPostId_status_idx" ON "SocialPost"("laterPostId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_status_lastSyncAt_idx" ON "SocialPost"("status", "lastSyncAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_status_analyticsFetchedAt_idx" ON "SocialPost"("status", "analyticsFetchedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_latePublishedAt_idx" ON "SocialPost"("latePublishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx" ON "SocialPost"("processingStartedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_renderStatus_nextRenderAt_idx" ON "SocialPost"("renderStatus", "nextRenderAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_pageId_idx" ON "SocialPost"("pageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_templateId_idx" ON "SocialPost"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostRetry_postId_idx" ON "PostRetry"("postId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostRetry_scheduledFor_idx" ON "PostRetry"("scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostRetry_status_idx" ON "PostRetry"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostLog_postId_idx" ON "PostLog"("postId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostLog_createdAt_idx" ON "PostLog"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostLog_event_idx" ON "PostLog"("event");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_userId_idx" ON "ChatConversation"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_clerkUserId_idx" ON "ChatConversation"("clerkUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_organizationId_idx" ON "ChatConversation"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_projectId_idx" ON "ChatConversation"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_projectId_userId_idx" ON "ChatConversation"("projectId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_expiresAt_idx" ON "ChatConversation"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramStory_mediaId_key" ON "InstagramStory"("mediaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramStory_projectId_idx" ON "InstagramStory"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramStory_organizationId_idx" ON "InstagramStory"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramStory_username_idx" ON "InstagramStory"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramStory_publishedAt_idx" ON "InstagramStory"("publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramStory_countedInGoal_idx" ON "InstagramStory"("countedInGoal");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramStory_username_publishedAt_idx" ON "InstagramStory"("username", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramFeed_mediaId_key" ON "InstagramFeed"("mediaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_projectId_idx" ON "InstagramFeed"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_organizationId_idx" ON "InstagramFeed"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_username_idx" ON "InstagramFeed"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_publishedAt_idx" ON "InstagramFeed"("publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_countedInGoal_idx" ON "InstagramFeed"("countedInGoal");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_permalink_idx" ON "InstagramFeed"("permalink");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramFeed_username_publishedAt_idx" ON "InstagramFeed"("username", "publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramDailySummary_organizationId_idx" ON "InstagramDailySummary"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramDailySummary_username_idx" ON "InstagramDailySummary"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramDailySummary_date_idx" ON "InstagramDailySummary"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramDailySummary_goalMet_idx" ON "InstagramDailySummary"("goalMet");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramDailySummary_projectId_date_key" ON "InstagramDailySummary"("projectId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramWeeklyReport_organizationId_idx" ON "InstagramWeeklyReport"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramWeeklyReport_username_idx" ON "InstagramWeeklyReport"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramWeeklyReport_weekStart_idx" ON "InstagramWeeklyReport"("weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramWeeklyReport_score_idx" ON "InstagramWeeklyReport"("score");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramWeeklyReport_overallCompletionRate_idx" ON "InstagramWeeklyReport"("overallCompletionRate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramWeeklyReport_projectId_weekStart_key" ON "InstagramWeeklyReport"("projectId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramGoalSettings_projectId_key" ON "InstagramGoalSettings"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramGoalSettings_organizationId_idx" ON "InstagramGoalSettings"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramGoalSettings_isActive_idx" ON "InstagramGoalSettings"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicLibrary_projectId_idx" ON "MusicLibrary"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicLibrary_genre_idx" ON "MusicLibrary"("genre");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicLibrary_mood_idx" ON "MusicLibrary"("mood");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicLibrary_isActive_isPublic_idx" ON "MusicLibrary"("isActive", "isPublic");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicLibrary_hasInstrumentalStem_idx" ON "MusicLibrary"("hasInstrumentalStem");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MusicStemJob_musicId_key" ON "MusicStemJob"("musicId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicStemJob_status_idx" ON "MusicStemJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicStemJob_mvsepJobHash_idx" ON "MusicStemJob"("mvsepJobHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MusicStemJob_createdAt_idx" ON "MusicStemJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "YoutubeDownloadJob_musicId_key" ON "YoutubeDownloadJob"("musicId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YoutubeDownloadJob_status_idx" ON "YoutubeDownloadJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YoutubeDownloadJob_youtubeUrl_idx" ON "YoutubeDownloadJob"("youtubeUrl");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YoutubeDownloadJob_createdAt_idx" ON "YoutubeDownloadJob"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YoutubeDownloadJob_videoApiJobId_idx" ON "YoutubeDownloadJob"("videoApiJobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AICreativeGeneration_projectId_idx" ON "AICreativeGeneration"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AICreativeGeneration_templateId_idx" ON "AICreativeGeneration"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AICreativeGeneration_createdBy_idx" ON "AICreativeGeneration"("createdBy");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AICreativeGeneration_createdAt_idx" ON "AICreativeGeneration"("createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomFont" ADD CONSTRAINT "CustomFont_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "FontCombination" ADD CONSTRAINT "FontCombination_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Element" ADD CONSTRAINT "Element_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Generation" ADD CONSTRAINT "Generation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Generation" ADD CONSTRAINT "Generation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Logo" ADD CONSTRAINT "Logo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BrandColor" ADD CONSTRAINT "BrandColor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProjectTag" ADD CONSTRAINT "ProjectTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DriveSettings" ADD CONSTRAINT "DriveSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationCreditBalance" ADD CONSTRAINT "OrganizationCreditBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationUsage" ADD CONSTRAINT "OrganizationUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationUsage" ADD CONSTRAINT "OrganizationUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationProject" ADD CONSTRAINT "OrganizationProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationProject" ADD CONSTRAINT "OrganizationProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StorageObject" ADD CONSTRAINT "StorageObject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Template" ADD CONSTRAINT "Template_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Page" ADD CONSTRAINT "Page_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UsageHistory" ADD CONSTRAINT "UsageHistory_creditBalanceId_fkey" FOREIGN KEY ("creditBalanceId") REFERENCES "CreditBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UsageHistory" ADD CONSTRAINT "UsageHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UsageHistory" ADD CONSTRAINT "UsageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationMemberAnalytics" ADD CONSTRAINT "OrganizationMemberAnalytics_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrganizationMemberAnalytics" ADD CONSTRAINT "OrganizationMemberAnalytics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AIGeneratedImage" ADD CONSTRAINT "AIGeneratedImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "knowledge_base_entries" ADD CONSTRAINT "knowledge_base_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "knowledge_base_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CMSSection" ADD CONSTRAINT "CMSSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CMSPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CMSMenuItem" ADD CONSTRAINT "CMSMenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "CMSMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CMSMenuItem" ADD CONSTRAINT "CMSMenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CMSMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PromptLibrary" ADD CONSTRAINT "PromptLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VideoProcessingJob" ADD CONSTRAINT "VideoProcessingJob_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VideoProcessingJob" ADD CONSTRAINT "VideoProcessingJob_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "MusicLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PostRetry" ADD CONSTRAINT "PostRetry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PostLog" ADD CONSTRAINT "PostLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramStory" ADD CONSTRAINT "InstagramStory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramStory" ADD CONSTRAINT "InstagramStory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramFeed" ADD CONSTRAINT "InstagramFeed_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramFeed" ADD CONSTRAINT "InstagramFeed_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramDailySummary" ADD CONSTRAINT "InstagramDailySummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramDailySummary" ADD CONSTRAINT "InstagramDailySummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramWeeklyReport" ADD CONSTRAINT "InstagramWeeklyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramWeeklyReport" ADD CONSTRAINT "InstagramWeeklyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramGoalSettings" ADD CONSTRAINT "InstagramGoalSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InstagramGoalSettings" ADD CONSTRAINT "InstagramGoalSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MusicLibrary" ADD CONSTRAINT "MusicLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MusicStemJob" ADD CONSTRAINT "MusicStemJob_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "MusicLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "YoutubeDownloadJob" ADD CONSTRAINT "YoutubeDownloadJob_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "MusicLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "YoutubeDownloadJob" ADD CONSTRAINT "YoutubeDownloadJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

