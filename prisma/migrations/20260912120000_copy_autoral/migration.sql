-- F1 de "Marca simples, copy melhor" (12/09/2026): o contrato da copy autoral
-- viaja com a peça. Aditiva e idempotente; nenhum backfill — copy original do
-- histórico não se inventa.
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "copyAutoral" JSONB;
ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "copyAutoral" JSONB;
