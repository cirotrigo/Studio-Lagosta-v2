-- CreateEnum
CREATE TYPE "public"."OperationType" AS ENUM ('AI_TEXT_CHAT', 'AI_IMAGE_GENERATION');

-- CreateTable
CREATE TABLE "public"."User" (
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
CREATE TABLE "public"."Feature" (
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
CREATE TABLE "public"."CreditBalance" (
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
CREATE TABLE "public"."UsageHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditBalanceId" TEXT NOT NULL,
    "operationType" "public"."OperationType" NOT NULL,
    "creditsUsed" INTEGER NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "featureCosts" JSONB,
    "planCredits" JSONB,
    "planMapping" JSONB,
    "planLabels" JSONB,
    "billingPlans" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StorageObject" (
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
CREATE TABLE "public"."SubscriptionEvent" (
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

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "public"."User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Feature_workspaceId_idx" ON "public"."Feature"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditBalance_userId_key" ON "public"."CreditBalance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditBalance_clerkUserId_key" ON "public"."CreditBalance"("clerkUserId");

-- CreateIndex
CREATE INDEX "CreditBalance_userId_idx" ON "public"."CreditBalance"("userId");

-- CreateIndex
CREATE INDEX "CreditBalance_clerkUserId_idx" ON "public"."CreditBalance"("clerkUserId");

-- CreateIndex
CREATE INDEX "UsageHistory_userId_idx" ON "public"."UsageHistory"("userId");

-- CreateIndex
CREATE INDEX "UsageHistory_creditBalanceId_idx" ON "public"."UsageHistory"("creditBalanceId");

-- CreateIndex
CREATE INDEX "UsageHistory_timestamp_idx" ON "public"."UsageHistory"("timestamp");

-- CreateIndex
CREATE INDEX "StorageObject_userId_idx" ON "public"."StorageObject"("userId");

-- CreateIndex
CREATE INDEX "StorageObject_createdAt_idx" ON "public"."StorageObject"("createdAt");

-- CreateIndex
CREATE INDEX "StorageObject_clerkUserId_idx" ON "public"."StorageObject"("clerkUserId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_clerkUserId_occurredAt_idx" ON "public"."SubscriptionEvent"("clerkUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_userId_occurredAt_idx" ON "public"."SubscriptionEvent"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "public"."CreditBalance" ADD CONSTRAINT "CreditBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsageHistory" ADD CONSTRAINT "UsageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsageHistory" ADD CONSTRAINT "UsageHistory_creditBalanceId_fkey" FOREIGN KEY ("creditBalanceId") REFERENCES "public"."CreditBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StorageObject" ADD CONSTRAINT "StorageObject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
