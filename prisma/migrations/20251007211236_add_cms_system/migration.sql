-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CMSPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CMSSectionType" AS ENUM ('HERO', 'BENTO_GRID', 'FAQ', 'AI_STARTER', 'PRICING', 'CTA', 'CUSTOM');

-- AlterEnum
ALTER TYPE "OperationType" ADD VALUE 'CREATIVE_DOWNLOAD';

-- AlterTable
ALTER TABLE "Logo" ADD COLUMN     "isProjectLogo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "BrandColor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hexCode" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
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

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "status" "EntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
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
CREATE TABLE "CMSPage" (
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
CREATE TABLE "CMSSection" (
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
CREATE TABLE "CMSMenu" (
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
CREATE TABLE "CMSMenuItem" (
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
CREATE TABLE "CMSComponent" (
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
CREATE TABLE "CMSMedia" (
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

-- CreateIndex
CREATE INDEX "BrandColor_projectId_idx" ON "BrandColor"("projectId");

-- CreateIndex
CREATE INDEX "Page_templateId_idx" ON "Page"("templateId");

-- CreateIndex
CREATE INDEX "Page_order_idx" ON "Page"("order");

-- CreateIndex
CREATE INDEX "knowledge_base_entries_userId_idx" ON "knowledge_base_entries"("userId");

-- CreateIndex
CREATE INDEX "knowledge_base_entries_workspaceId_idx" ON "knowledge_base_entries"("workspaceId");

-- CreateIndex
CREATE INDEX "knowledge_base_entries_status_idx" ON "knowledge_base_entries"("status");

-- CreateIndex
CREATE INDEX "knowledge_chunks_entryId_idx" ON "knowledge_chunks"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_entryId_ordinal_key" ON "knowledge_chunks"("entryId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "CMSPage_slug_key" ON "CMSPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CMSPage_path_key" ON "CMSPage"("path");

-- CreateIndex
CREATE INDEX "CMSPage_slug_idx" ON "CMSPage"("slug");

-- CreateIndex
CREATE INDEX "CMSPage_path_idx" ON "CMSPage"("path");

-- CreateIndex
CREATE INDEX "CMSPage_status_idx" ON "CMSPage"("status");

-- CreateIndex
CREATE INDEX "CMSPage_isHome_idx" ON "CMSPage"("isHome");

-- CreateIndex
CREATE INDEX "CMSPage_publishedAt_idx" ON "CMSPage"("publishedAt");

-- CreateIndex
CREATE INDEX "CMSSection_pageId_idx" ON "CMSSection"("pageId");

-- CreateIndex
CREATE INDEX "CMSSection_type_idx" ON "CMSSection"("type");

-- CreateIndex
CREATE INDEX "CMSSection_order_idx" ON "CMSSection"("order");

-- CreateIndex
CREATE UNIQUE INDEX "CMSMenu_slug_key" ON "CMSMenu"("slug");

-- CreateIndex
CREATE INDEX "CMSMenu_slug_idx" ON "CMSMenu"("slug");

-- CreateIndex
CREATE INDEX "CMSMenu_location_idx" ON "CMSMenu"("location");

-- CreateIndex
CREATE INDEX "CMSMenuItem_menuId_idx" ON "CMSMenuItem"("menuId");

-- CreateIndex
CREATE INDEX "CMSMenuItem_parentId_idx" ON "CMSMenuItem"("parentId");

-- CreateIndex
CREATE INDEX "CMSMenuItem_order_idx" ON "CMSMenuItem"("order");

-- CreateIndex
CREATE UNIQUE INDEX "CMSComponent_slug_key" ON "CMSComponent"("slug");

-- CreateIndex
CREATE INDEX "CMSComponent_slug_idx" ON "CMSComponent"("slug");

-- CreateIndex
CREATE INDEX "CMSComponent_type_idx" ON "CMSComponent"("type");

-- CreateIndex
CREATE INDEX "CMSComponent_isGlobal_idx" ON "CMSComponent"("isGlobal");

-- CreateIndex
CREATE INDEX "CMSMedia_folder_idx" ON "CMSMedia"("folder");

-- CreateIndex
CREATE INDEX "CMSMedia_mimeType_idx" ON "CMSMedia"("mimeType");

-- CreateIndex
CREATE INDEX "CMSMedia_uploadedBy_idx" ON "CMSMedia"("uploadedBy");

-- CreateIndex
CREATE INDEX "Logo_projectId_isProjectLogo_idx" ON "Logo"("projectId", "isProjectLogo");

-- CreateIndex
CREATE INDEX "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX "Template_isPublic_idx" ON "Template"("isPublic");

-- AddForeignKey
ALTER TABLE "BrandColor" ADD CONSTRAINT "BrandColor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "knowledge_base_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMSSection" ADD CONSTRAINT "CMSSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CMSPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMSMenuItem" ADD CONSTRAINT "CMSMenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "CMSMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMSMenuItem" ADD CONSTRAINT "CMSMenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CMSMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
