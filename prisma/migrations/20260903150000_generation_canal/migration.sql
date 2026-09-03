-- Por qual canal a arte entrou (claudinho | claude-ai | claude-code | studio).
-- Nulo no histórico que não dá para atribuir. Idempotente, como o 0_init.
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "canal" TEXT;
CREATE INDEX IF NOT EXISTS "Generation_canal_idx" ON "Generation"("canal");
