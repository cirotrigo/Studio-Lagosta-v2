-- AlterTable
ALTER TABLE "public"."Plan" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "priceMonthlyCents" INTEGER,
ADD COLUMN     "priceYearlyCents" INTEGER;
