-- =====================================================
-- SCRIPT DEFINITIVO PARA CORRIGIR O BANCO DE PRODUÇÃO
-- Execute TUDO no Neon SQL Editor
-- =====================================================

-- 1. Primeiro, vamos verificar se o campo existe
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'SocialPost'
    AND column_name = 'processingStartedAt';

-- 2. Se não retornar nada acima, execute este comando:
ALTER TABLE "SocialPost"
ADD COLUMN "processingStartedAt" TIMESTAMP(3);

-- 3. Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx"
ON "SocialPost"("processingStartedAt");

-- 4. Verificar novamente se foi criado
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'SocialPost'
    AND column_name = 'processingStartedAt';

-- 5. Verificar todos os campos da tabela (para debug)
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'SocialPost'
ORDER BY ordinal_position;

-- 6. Teste final - tenta fazer um SELECT com o campo
SELECT
    id,
    "processingStartedAt",
    status,
    "createdAt"
FROM "SocialPost"
LIMIT 1;

-- Se este último SELECT funcionar, o campo foi criado com sucesso!