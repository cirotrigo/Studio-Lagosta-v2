/*
  Warnings:

  - You are about to drop the column `billingPlans` on the `AdminSettings` table. All the data in the column will be lost.
  - You are about to drop the column `planCredits` on the `AdminSettings` table. All the data in the column will be lost.
  - You are about to drop the column `planLabels` on the `AdminSettings` table. All the data in the column will be lost.
  - You are about to drop the column `planMapping` on the `AdminSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."AdminSettings" DROP COLUMN "billingPlans",
DROP COLUMN "planCredits",
DROP COLUMN "planLabels",
DROP COLUMN "planMapping";

-- CreateTable
CREATE TABLE "public"."Plan" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "clerkName" TEXT,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_clerkId_key" ON "public"."Plan"("clerkId");

-- CreateIndex
CREATE INDEX "Plan_clerkId_idx" ON "public"."Plan"("clerkId");

-- CreateIndex
CREATE INDEX "Plan_active_idx" ON "public"."Plan"("active");

-- CreateIndex
CREATE INDEX "CreditBalance_creditsRemaining_idx" ON "public"."CreditBalance"("creditsRemaining");

-- CreateIndex
CREATE INDEX "CreditBalance_lastSyncedAt_idx" ON "public"."CreditBalance"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "StorageObject_contentType_idx" ON "public"."StorageObject"("contentType");

-- CreateIndex
CREATE INDEX "StorageObject_deletedAt_idx" ON "public"."StorageObject"("deletedAt");

-- CreateIndex
CREATE INDEX "StorageObject_name_idx" ON "public"."StorageObject"("name");

-- CreateIndex
CREATE INDEX "UsageHistory_operationType_idx" ON "public"."UsageHistory"("operationType");

-- CreateIndex
CREATE INDEX "UsageHistory_userId_timestamp_idx" ON "public"."UsageHistory"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "UsageHistory_operationType_timestamp_idx" ON "public"."UsageHistory"("operationType", "timestamp");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "public"."User"("name");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "public"."User"("isActive");
