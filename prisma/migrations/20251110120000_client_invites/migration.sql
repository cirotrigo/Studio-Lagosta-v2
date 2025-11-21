-- CreateEnum
CREATE TYPE "ClientInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isClientProject" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientInvite" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "ClientInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientInvite_clerkInvitationId_key" ON "ClientInvite"("clerkInvitationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientInvite_userId_key" ON "ClientInvite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientInvite_projectId_key" ON "ClientInvite"("projectId");

-- CreateIndex
CREATE INDEX "ClientInvite_email_idx" ON "ClientInvite"("email");

-- CreateIndex
CREATE INDEX "ClientInvite_status_idx" ON "ClientInvite"("status");

-- CreateIndex
CREATE INDEX "ClientInvite_createdAt_idx" ON "ClientInvite"("createdAt");

-- CreateIndex
CREATE INDEX "ClientInvite_invitedBy_idx" ON "ClientInvite"("invitedBy");

-- CreateIndex
CREATE INDEX "Project_isClientProject_idx" ON "Project"("isClientProject");

-- AddForeignKey
ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
