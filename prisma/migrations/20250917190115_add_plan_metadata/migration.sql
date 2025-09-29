-- AlterTable
ALTER TABLE "public"."Plan" ALTER COLUMN "clerkId" DROP NOT NULL;

ALTER TABLE "public"."Plan" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "ctaLabel" TEXT,
ADD COLUMN     "ctaType" TEXT DEFAULT 'checkout',
ADD COLUMN     "ctaUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "highlight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingSource" TEXT NOT NULL DEFAULT 'clerk';
