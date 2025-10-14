-- Add optional project reference to organization usage
ALTER TABLE "OrganizationUsage"
  ADD COLUMN "projectId" INTEGER;

CREATE INDEX IF NOT EXISTS "OrganizationUsage_projectId_idx"
  ON "OrganizationUsage"("projectId");

ALTER TABLE "OrganizationUsage"
  ADD CONSTRAINT "OrganizationUsage_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Track organization context in personal usage history
ALTER TABLE "UsageHistory"
  ADD COLUMN "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "UsageHistory_organizationId_timestamp_idx"
  ON "UsageHistory"("organizationId", "timestamp");

ALTER TABLE "UsageHistory"
  ADD CONSTRAINT "UsageHistory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Aggregated analytics per organization member and period
CREATE TABLE "OrganizationMemberAnalytics" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "memberClerkId" TEXT NOT NULL,
  "memberUserId" TEXT,
  "imageGenerationsCount" INTEGER NOT NULL DEFAULT 0,
  "videoGenerationsCount" INTEGER NOT NULL DEFAULT 0,
  "chatInteractionsCount" INTEGER NOT NULL DEFAULT 0,
  "totalCreditsUsed" INTEGER NOT NULL DEFAULT 0,
  "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL,
  "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL,
  "lastActivityAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "OrganizationMemberAnalytics_org_member_period_key"
  ON "OrganizationMemberAnalytics"("organizationId", "memberClerkId", "periodStart");

CREATE INDEX "OrganizationMemberAnalytics_org_period_idx"
  ON "OrganizationMemberAnalytics"("organizationId", "periodStart");

CREATE INDEX "OrganizationMemberAnalytics_memberClerkId_idx"
  ON "OrganizationMemberAnalytics"("memberClerkId");

CREATE INDEX "OrganizationMemberAnalytics_memberUserId_idx"
  ON "OrganizationMemberAnalytics"("memberUserId");

CREATE INDEX "OrganizationMemberAnalytics_period_idx"
  ON "OrganizationMemberAnalytics"("periodStart", "periodEnd");

ALTER TABLE "OrganizationMemberAnalytics"
  ADD CONSTRAINT "OrganizationMemberAnalytics_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationMemberAnalytics"
  ADD CONSTRAINT "OrganizationMemberAnalytics_memberUserId_fkey"
  FOREIGN KEY ("memberUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
