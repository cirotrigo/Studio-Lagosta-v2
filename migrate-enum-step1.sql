-- PASSO 1: Adicionar novos valores ao enum PostStatus

-- Adicionar POSTING ao enum
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'POSTING';

-- Adicionar POSTED ao enum
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'POSTED';

-- Verificar valores disponíveis no enum
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PostStatus')
ORDER BY enumlabel;
