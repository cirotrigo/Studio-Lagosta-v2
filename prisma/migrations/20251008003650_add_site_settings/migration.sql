-- CreateTable
CREATE TABLE "SiteSettings" (
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

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteSettings_isActive_idx" ON "SiteSettings"("isActive");
