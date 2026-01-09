-- Script para verificar status da migration
-- Execute isso no Neon Dashboard SQL Editor

-- 1. Verificar se o campo existe
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'SocialPost'
      AND column_name = 'processingStartedAt'
    )
    THEN '✅ Campo processingStartedAt EXISTE'
    ELSE '❌ Campo processingStartedAt NÃO existe - Execute a migration!'
  END as status_do_campo;

-- 2. Contar posts por status
SELECT
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN "laterPostId" IS NOT NULL THEN 1 END) as com_later_id,
  COUNT(CASE WHEN "laterPostId" IS NULL THEN 1 END) as sem_later_id
FROM "SocialPost"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY total DESC;

-- 3. Verificar posts potencialmente duplicados (últimas 24h)
WITH duplicates AS (
  SELECT
    caption,
    "scheduledDatetime",
    COUNT(*) as count
  FROM "SocialPost"
  WHERE "createdAt" > NOW() - INTERVAL '24 hours'
  GROUP BY caption, "scheduledDatetime"
  HAVING COUNT(*) > 1
)
SELECT
  CASE
    WHEN COUNT(*) > 0
    THEN '⚠️ Encontrados ' || COUNT(*) || ' grupos de posts duplicados nas últimas 24h'
    ELSE '✅ Nenhuma duplicação detectada nas últimas 24h'
  END as status_duplicacao
FROM duplicates;

-- 4. Posts em status POSTING há muito tempo (possível travamento)
SELECT
  id,
  caption,
  status,
  "laterPostId",
  "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - "updatedAt")) / 60 as minutos_em_posting
FROM "SocialPost"
WHERE status = 'POSTING'
  AND "updatedAt" < NOW() - INTERVAL '30 minutes'
ORDER BY "updatedAt" ASC;

-- 5. Resumo geral
SELECT
  '📊 Resumo do Sistema' as titulo,
  (SELECT COUNT(*) FROM "SocialPost" WHERE "createdAt" > NOW() - INTERVAL '24 hours') as posts_24h,
  (SELECT COUNT(*) FROM "SocialPost" WHERE status = 'POSTING') as posts_em_processamento,
  (SELECT COUNT(*) FROM "SocialPost" WHERE status = 'FAILED' AND "createdAt" > NOW() - INTERVAL '24 hours') as posts_falhados_24h,
  (SELECT COUNT(*) FROM "SocialPost" WHERE status = 'POSTED' AND "createdAt" > NOW() - INTERVAL '24 hours') as posts_sucesso_24h;