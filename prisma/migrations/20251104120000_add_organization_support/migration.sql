CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT PRIMARY KEY,
  "clerkOrgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "maxMembers" INTEGER NOT NULL DEFAULT 5,
  "maxProjects" INTEGER NOT NULL DEFAULT 10,
  "creditsPerMonth" INTEGER NOT NULL DEFAULT 1000,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_clerkOrgId_idx" ON "Organization"("clerkOrgId");
CREATE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization"("slug");

CREATE TABLE IF NOT EXISTS "OrganizationCreditBalance" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "lastRefill" TIMESTAMP WITH TIME ZONE,
  "refillAmount" INTEGER NOT NULL DEFAULT 1000,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationCreditBalance_organizationId_key"
  ON "OrganizationCreditBalance"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationCreditBalance_organizationId_idx"
  ON "OrganizationCreditBalance"("organizationId");

ALTER TABLE "OrganizationCreditBalance"
  ADD CONSTRAINT "OrganizationCreditBalance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "OrganizationUsage" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OrganizationUsage_organizationId_idx" ON "OrganizationUsage"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationUsage_userId_idx" ON "OrganizationUsage"("userId");
CREATE INDEX IF NOT EXISTS "OrganizationUsage_createdAt_idx" ON "OrganizationUsage"("createdAt");

ALTER TABLE "OrganizationUsage"
  ADD CONSTRAINT "OrganizationUsage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "OrganizationProject" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "sharedBy" TEXT NOT NULL,
  "sharedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "defaultCanEdit" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationProject_organizationId_projectId_key"
  ON "OrganizationProject"("organizationId", "projectId");
CREATE INDEX IF NOT EXISTS "OrganizationProject_projectId_idx" ON "OrganizationProject"("projectId");
CREATE INDEX IF NOT EXISTS "OrganizationProject_organizationId_idx" ON "OrganizationProject"("organizationId");

ALTER TABLE "OrganizationProject"
  ADD CONSTRAINT "OrganizationProject_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationProject"
  ADD CONSTRAINT "OrganizationProject_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
