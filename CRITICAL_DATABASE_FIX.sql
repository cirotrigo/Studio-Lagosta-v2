-- ==========================================
-- ATENÇÃO: Execute no Neon Dashboard
-- Banco CORRETO: ep-fragrant-term-adnufsao-pooler
-- ==========================================

-- Este é o banco que a produção está usando!
-- Não confunda com ep-dawn-shadow-adymip1x-pooler

-- 1. Execute este comando:
ALTER TABLE "SocialPost"
ADD COLUMN "processingStartedAt" TIMESTAMP(3);

-- 2. Crie o índice:
CREATE INDEX "SocialPost_processingStartedAt_idx"
ON "SocialPost"("processingStartedAt");

-- 3. Verifique:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'SocialPost'
AND column_name = 'processingStartedAt';

-- Deve retornar 1 linha!
-- Se retornar vazio, o campo ainda não foi criado!