-- Resposta aprovada na Caixa, aguardando publicação por sessão do Claude
-- (30/08/2026). Aditiva e idempotente, para `prisma migrate deploy`.

ALTER TABLE "AvaliacaoGoogle" ADD COLUMN IF NOT EXISTS "respostaAprovada" TEXT;
ALTER TABLE "AvaliacaoGoogle" ADD COLUMN IF NOT EXISTS "respostaAprovadaEm" TIMESTAMP(3);
ALTER TABLE "AvaliacaoGoogle" ADD COLUMN IF NOT EXISTS "respostaAprovadaPor" TEXT;
