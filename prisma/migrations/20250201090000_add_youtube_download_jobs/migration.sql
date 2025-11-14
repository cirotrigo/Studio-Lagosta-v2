-- CreateTable
CREATE TABLE "YoutubeDownloadJob" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "YoutubeDownloadJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "YoutubeDownloadJob_musicId_key" UNIQUE ("musicId"),
    CONSTRAINT "YoutubeDownloadJob_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "MusicLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "YoutubeDownloadJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "YoutubeDownloadJob_status_idx" ON "YoutubeDownloadJob"("status");
CREATE INDEX "YoutubeDownloadJob_youtubeUrl_idx" ON "YoutubeDownloadJob"("youtubeUrl");
CREATE INDEX "YoutubeDownloadJob_createdAt_idx" ON "YoutubeDownloadJob"("createdAt");
CREATE INDEX "YoutubeDownloadJob_videoApiJobId_idx" ON "YoutubeDownloadJob"("videoApiJobId");
