-- Create enums
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "TemplateType" AS ENUM ('STORY', 'FEED', 'SQUARE');
CREATE TYPE "GenerationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- Create tables
CREATE TABLE "Project" (
    "id" SERIAL PRIMARY KEY,
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Template" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "dimensions" TEXT NOT NULL,
    "designData" JSONB NOT NULL,
    "dynamicFields" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "thumbnailUrl" TEXT,
    "projectId" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Template_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Generation" (
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
    CONSTRAINT "Generation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Generation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Logo" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Logo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Element" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "category" TEXT,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Element_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomFont" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fontFamily" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomFont_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "Project_userId_idx" ON "Project" ("userId");
CREATE INDEX "Project_workspaceId_idx" ON "Project" ("workspaceId");
CREATE INDEX "Project_status_idx" ON "Project" ("status");

CREATE INDEX "Template_projectId_idx" ON "Template" ("projectId");
CREATE INDEX "Template_type_idx" ON "Template" ("type");
CREATE INDEX "Template_createdBy_idx" ON "Template" ("createdBy");

CREATE INDEX "Generation_projectId_idx" ON "Generation" ("projectId");
CREATE INDEX "Generation_templateId_idx" ON "Generation" ("templateId");
CREATE INDEX "Generation_status_idx" ON "Generation" ("status");
CREATE INDEX "Generation_createdBy_idx" ON "Generation" ("createdBy");
CREATE INDEX "Generation_createdAt_idx" ON "Generation" ("createdAt");

CREATE INDEX "Logo_projectId_idx" ON "Logo" ("projectId");
CREATE INDEX "Element_projectId_idx" ON "Element" ("projectId");
CREATE INDEX "Element_category_idx" ON "Element" ("category");
CREATE INDEX "CustomFont_projectId_idx" ON "CustomFont" ("projectId");
