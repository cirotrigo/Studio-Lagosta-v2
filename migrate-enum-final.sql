-- Migração final: Remover valores antigos do enum

BEGIN;

-- 1. Remover default temporariamente
ALTER TABLE "SocialPost" ALTER COLUMN status DROP DEFAULT;

-- 2. Criar novo enum
CREATE TYPE "PostStatus_new" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED');

-- 3. Alterar coluna
ALTER TABLE "SocialPost"
  ALTER COLUMN status TYPE "PostStatus_new"
  USING (status::text::"PostStatus_new");

-- 4. Remover enum antigo
DROP TYPE "PostStatus";

-- 5. Renomear novo enum
ALTER TYPE "PostStatus_new" RENAME TO "PostStatus";

-- 6. Restaurar default
ALTER TABLE "SocialPost" ALTER COLUMN status SET DEFAULT 'DRAFT';

COMMIT;

-- Verificar
SELECT enumlabel FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PostStatus')
ORDER BY enumlabel;
