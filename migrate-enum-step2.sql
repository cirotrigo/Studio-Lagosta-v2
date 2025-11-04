-- PASSO 2: Remover valores antigos do enum (após migração de dados)

-- NOTA: PostgreSQL não permite remover valores de enum diretamente se estão em uso
-- Como já migramos todos os dados, podemos recriar o tipo

BEGIN;

-- 1. Criar novo enum com apenas os valores desejados
CREATE TYPE "PostStatus_new" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED');

-- 2. Alterar coluna para usar o novo tipo
ALTER TABLE "SocialPost"
  ALTER COLUMN status TYPE "PostStatus_new"
  USING (status::text::"PostStatus_new");

-- 3. Remover enum antigo
DROP TYPE "PostStatus";

-- 4. Renomear novo enum
ALTER TYPE "PostStatus_new" RENAME TO "PostStatus";

COMMIT;

-- Verificar resultado
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PostStatus')
ORDER BY enumlabel;
