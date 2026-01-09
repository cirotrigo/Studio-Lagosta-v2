-- ============================================
-- SCRIPT PARA EXECUTAR NO BANCO DE PRODUÇÃO
-- Via Neon Dashboard SQL Editor
-- ============================================

-- 1. Adiciona o campo processingStartedAt na tabela SocialPost
ALTER TABLE "SocialPost"
ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);

-- 2. Cria índice para melhorar performance das queries
CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx"
ON "SocialPost"("processingStartedAt");

-- 3. Verifica se o campo foi criado corretamente
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'SocialPost'
AND column_name = 'processingStartedAt';

-- Se o resultado mostrar o campo, está tudo OK!
-- Resultado esperado:
-- column_name          | data_type                   | is_nullable
-- processingStartedAt  | timestamp without time zone | YES