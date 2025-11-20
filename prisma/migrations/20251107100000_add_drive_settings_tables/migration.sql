-- CreateTable
CREATE TABLE "DriveSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteFolders" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    "defaultView" TEXT NOT NULL DEFAULT 'grid',
    "itemsPerPage" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriveSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFileCache" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriveFileCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveSettings_userId_key" ON "DriveSettings"("userId");

-- CreateIndex
CREATE INDEX "DriveSettings_userId_idx" ON "DriveSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveFileCache_googleFileId_key" ON "DriveFileCache"("googleFileId");

-- CreateIndex
CREATE INDEX "DriveFileCache_parentId_idx" ON "DriveFileCache"("parentId");

-- CreateIndex
CREATE INDEX "DriveFileCache_kind_idx" ON "DriveFileCache"("kind");

-- CreateIndex
CREATE INDEX "DriveFileCache_lastSynced_idx" ON "DriveFileCache"("lastSynced");

-- AddForeignKey
ALTER TABLE "DriveSettings" ADD CONSTRAINT "DriveSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
