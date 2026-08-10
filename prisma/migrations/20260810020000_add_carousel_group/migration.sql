-- Carrossel: agrupa e ordena os slides de uma mesma peça na Generation.
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o branch com drift — ver CLAUDE.md § Database Management.

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "carouselGroupId" TEXT;
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "slideOrder" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Generation_carouselGroupId_slideOrder_idx" ON "Generation"("carouselGroupId", "slideOrder");
