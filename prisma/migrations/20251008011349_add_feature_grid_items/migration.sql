-- CreateTable
CREATE TABLE "FeatureGridItem" (
    "id" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "iconColor" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gridArea" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureGridItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureGridItem_order_idx" ON "FeatureGridItem"("order");

-- CreateIndex
CREATE INDEX "FeatureGridItem_isActive_idx" ON "FeatureGridItem"("isActive");
