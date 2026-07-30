-- Linhagem da melhoria com IA: coluna relacional (indexável) no lugar do
-- fieldValues.originalGenerationId, que só o JSON conhecia.
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "sourceGenerationId" TEXT;

CREATE INDEX IF NOT EXISTS "Generation_sourceGenerationId_idx"
  ON "Generation"("sourceGenerationId");
